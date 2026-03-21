"""
Billing API — Abo-Verwaltung, Checkout, Topup, Webhook, Wallet.

Endpunkte:
  GET  /v1/billing/plans                  — Alle Pläne (öffentlich)
  GET  /v1/billing/status                 — Aktueller Status des eingeloggten Kunden
  POST /v1/billing/checkout               — Checkout-Session starten (Abo)
  POST /v1/billing/topup                  — Guthaben aufladen (Stripe)
  POST /v1/billing/portal                 — Stripe Billing Portal öffnen
  GET  /v1/billing/invoices               — Zahlungshistorie
  POST /v1/billing/webhook                — Stripe Webhook (kein Auth, Signatur-Check)
  POST /v1/billing/accept-tos             — ToS akzeptieren
  GET  /v1/billing/wallet                 — Wallet-Status + Einstellungen
  PUT  /v1/billing/wallet/settings        — Limits + Auto-Topup konfigurieren
  POST /v1/billing/wallet/topup/stripe    — Stripe Checkout Topup
  POST /v1/billing/wallet/topup/bank      — Banküberweisung-Referenz generieren
  GET  /v1/billing/admin/overview         — Admin: Revenue-Übersicht
  GET  /v1/billing/admin/wallet/{id}      — Admin: Wallet-Status eines Kunden
  POST /v1/billing/admin/wallet/credit    — Admin: Manuell Guthaben gutschreiben
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings as _cfg
from core.database import get_db
from core.dependencies import get_current_user, require_admin
from models.customer import Customer, SubscriptionPlan
from models.payment import Payment
from services.billing_service import (
    seed_plans,
    create_subscription_checkout,
    create_topup_checkout,
    create_billing_portal_session,
    handle_webhook,
    generate_bank_transfer_reference,
    next_invoice_number,
    calc_vat,
)

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlanOut(BaseModel):
    id: str
    name: str
    slug: str
    monthly_price: float
    yearly_price: float
    yearly_monthly_equivalent: float   # yearly_price / 12
    yearly_discount_percent: int
    included_tokens: int
    daily_token_limit: Optional[int]
    requests_per_hour: Optional[int]
    token_overage_chf_per_1k: float
    max_buddies: int
    features: dict
    sort_order: int


class BillingStatusOut(BaseModel):
    plan_name: Optional[str]
    plan_slug: Optional[str]
    subscription_status: str
    billing_cycle: str
    subscription_period_end: Optional[str]
    tokens_used_this_period: int
    tokens_included: int
    token_balance_chf: float
    overage_rate_chf_per_1k: float
    tos_accepted: bool


class CheckoutRequest(BaseModel):
    plan_slug: str
    billing_cycle: str = Field(default="monthly", pattern="^(monthly|yearly)$")


class TopupRequest(BaseModel):
    amount_chf: float = Field(..., ge=5.0, le=500.0)


class InvoiceOut(BaseModel):
    id: str
    invoice_number: Optional[str]
    amount_chf: float
    vat_chf: float
    amount_net_chf: float
    description: str
    payment_type: str
    status: str
    created_at: str
    paid_at: Optional[str]


# ── Pläne ─────────────────────────────────────────────────────────────────────

@router.get("/plans", response_model=list[PlanOut])
async def list_plans(db: AsyncSession = Depends(get_db)):
    """Alle verfügbaren Pläne — öffentlich, kein Login nötig."""
    await seed_plans(db)
    result = await db.execute(
        select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order)
    )
    plans = result.scalars().all()
    out = []
    for p in plans:
        monthly = float(p.monthly_price or 0)
        yearly = float(p.yearly_price or 0)
        yearly_mo = round(yearly / 12, 2) if yearly else 0
        discount = round((1 - yearly_mo / monthly) * 100) if monthly > 0 and yearly_mo > 0 else 0
        out.append(PlanOut(
            id=str(p.id),
            name=p.name,
            slug=p.slug or p.name.lower(),
            monthly_price=monthly,
            yearly_price=yearly,
            yearly_monthly_equivalent=yearly_mo,
            yearly_discount_percent=discount,
            included_tokens=p.included_tokens or 500_000,
            daily_token_limit=p.daily_token_limit,
            requests_per_hour=p.requests_per_hour,
            token_overage_chf_per_1k=float(p.token_overage_chf_per_1k or 0.002),
            max_buddies=p.max_buddies or 1,
            features=p.features or {},
            sort_order=p.sort_order or 0,
        ))
    return out


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=BillingStatusOut)
async def billing_status(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan: SubscriptionPlan | None = None
    if customer.subscription_plan_id:
        plan = await db.get(SubscriptionPlan, customer.subscription_plan_id)

    return BillingStatusOut(
        plan_name=plan.name if plan else None,
        plan_slug=getattr(plan, "slug", None) if plan else None,
        subscription_status=customer.subscription_status or "inactive",
        billing_cycle=customer.billing_cycle or "monthly",
        subscription_period_end=(
            customer.subscription_period_end.isoformat()
            if customer.subscription_period_end else None
        ),
        tokens_used_this_period=customer.tokens_used_this_period or 0,
        tokens_included=plan.included_tokens if plan else 0,
        token_balance_chf=float(customer.token_balance_chf or 0),
        overage_rate_chf_per_1k=float(plan.token_overage_chf_per_1k or 0.002) if plan else 0.002,
        tos_accepted=customer.tos_accepted_at is not None,
    )


# ── Checkout ──────────────────────────────────────────────────────────────────

@router.post("/checkout")
async def start_checkout(
    req: CheckoutRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not customer.tos_accepted_at:
        raise HTTPException(
            status_code=400,
            detail="Bitte akzeptiere zuerst die Nutzungsbedingungen."
        )
    try:
        url = await create_subscription_checkout(customer, req.plan_slug, req.billing_cycle, db)
        return {"checkout_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/topup")
async def topup_balance(
    req: TopupRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if customer.subscription_status not in ("active", "trialing"):
        raise HTTPException(
            status_code=400,
            detail="Guthaben aufladen ist nur mit einem aktiven Abo möglich."
        )
    try:
        url = await create_topup_checkout(customer, req.amount_chf, db)
        return {"checkout_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/portal")
async def open_billing_portal(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stripe Billing Portal — Karte ändern, Abo kündigen, Rechnungen herunterladen."""
    try:
        url = await create_billing_portal_session(customer, db)
        return {"portal_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Zahlungshistorie ──────────────────────────────────────────────────────────

@router.get("/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment)
        .where(Payment.customer_id == str(customer.id))
        .order_by(Payment.created_at.desc())
        .limit(50)
    )
    payments = result.scalars().all()
    return [
        InvoiceOut(
            id=str(p.id),
            invoice_number=p.invoice_number,
            amount_chf=float(p.amount_chf),
            vat_chf=float(p.vat_chf or 0),
            amount_net_chf=float(p.amount_net_chf or 0),
            description=p.description,
            payment_type=p.payment_type,
            status=p.status,
            created_at=p.created_at.isoformat(),
            paid_at=p.paid_at.isoformat() if p.paid_at else None,
        )
        for p in payments
    ]


# ── ToS-Akzeptanz ─────────────────────────────────────────────────────────────

@router.post("/accept-tos", status_code=204)
async def accept_tos(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Speichert Zeitstempel der ToS-Akzeptanz — gesetzlich erforderlich."""
    if not customer.tos_accepted_at:
        customer.tos_accepted_at = datetime.utcnow()
        await db.commit()


# ── Stripe Webhook ────────────────────────────────────────────────────────────

@router.post("/webhook", status_code=200)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: AsyncSession = Depends(get_db),
):
    """
    Stripe sendet Events hierher.
    WICHTIG: Kein Auth-Check — Verifikation läuft über Stripe-Signatur.
    """
    payload = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Stripe-Signatur fehlt.")
    try:
        await handle_webhook(payload, stripe_signature, db)
        return {"received": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Admin: Revenue-Übersicht ──────────────────────────────────────────────────

@router.get("/admin/overview")
async def admin_billing_overview(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: Revenue, aktive Abos, Token-Verbrauch."""
    # Aktive Kunden pro Plan
    plan_counts = await db.execute(
        select(SubscriptionPlan.name, func.count(Customer.id).label("count"))
        .join(Customer, Customer.subscription_plan_id == SubscriptionPlan.id, isouter=True)
        .where(Customer.subscription_status == "active")
        .group_by(SubscriptionPlan.name)
    )

    # Revenue dieser Woche und gesamt
    total_revenue = await db.scalar(
        select(func.sum(Payment.amount_chf))
        .where(Payment.status == "succeeded")
    ) or 0.0

    monthly_revenue = await db.scalar(
        select(func.sum(Payment.amount_chf))
        .where(
            Payment.status == "succeeded",
            func.date_trunc("month", Payment.paid_at) == func.date_trunc("month", func.now()),
        )
    ) or 0.0

    active_subs = await db.scalar(
        select(func.count(Customer.id))
        .where(Customer.subscription_status == "active")
    ) or 0

    past_due = await db.scalar(
        select(func.count(Customer.id))
        .where(Customer.subscription_status == "past_due")
    ) or 0

    return {
        "total_revenue_chf": float(total_revenue),
        "monthly_revenue_chf": float(monthly_revenue),
        "active_subscriptions": active_subs,
        "past_due": past_due,
        "by_plan": [{"plan": row[0], "count": row[1]} for row in plan_counts],
    }


# ── Admin: Abo-Modell Setup ────────────────────────────────────────────────────

class PlanAdminOut(BaseModel):
    id: str
    name: str
    slug: str
    monthly_price: float
    yearly_price: float
    included_tokens: int
    daily_token_limit: Optional[int]
    requests_per_hour: Optional[int]
    token_overage_chf_per_1k: float
    storage_limit_bytes: int
    max_buddies: int
    features: dict
    sort_order: int
    stripe_price_id_monthly: Optional[str]
    stripe_price_id_yearly: Optional[str]


class PlanAdminUpdate(BaseModel):
    name: Optional[str] = None
    monthly_price: Optional[float] = None
    yearly_price: Optional[float] = None
    included_tokens: Optional[int] = None
    daily_token_limit: Optional[int] = None
    requests_per_hour: Optional[int] = None
    token_overage_chf_per_1k: Optional[float] = None
    storage_limit_bytes: Optional[int] = None
    max_buddies: Optional[int] = None
    features: Optional[dict] = None
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None


@router.get("/admin/plans", response_model=list[PlanAdminOut])
async def admin_list_plans(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Alle Pläne inkl. Stripe Price IDs."""
    await seed_plans(db)
    result = await db.execute(select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order))
    plans = result.scalars().all()
    return [
        PlanAdminOut(
            id=str(p.id),
            name=p.name,
            slug=p.slug or "",
            monthly_price=float(p.monthly_price or 0),
            yearly_price=float(p.yearly_price or 0),
            included_tokens=p.included_tokens or 0,
            daily_token_limit=p.daily_token_limit,
            requests_per_hour=p.requests_per_hour,
            token_overage_chf_per_1k=float(p.token_overage_chf_per_1k or 0),
            storage_limit_bytes=p.storage_limit_bytes or 524_288_000,
            max_buddies=p.max_buddies or 1,
            features=p.features or {},
            sort_order=p.sort_order or 0,
            stripe_price_id_monthly=p.stripe_price_id_monthly,
            stripe_price_id_yearly=p.stripe_price_id_yearly,
        )
        for p in plans
    ]


@router.put("/admin/plans/{plan_id}", response_model=PlanAdminOut)
async def admin_update_plan(
    plan_id: str,
    data: PlanAdminUpdate,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Plan-Details und Stripe Price IDs aktualisieren."""
    import uuid as _uuid
    plan = await db.get(SubscriptionPlan, _uuid.UUID(plan_id))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return PlanAdminOut(
        id=str(plan.id),
        name=plan.name,
        slug=plan.slug or "",
        monthly_price=float(plan.monthly_price or 0),
        yearly_price=float(plan.yearly_price or 0),
        included_tokens=plan.included_tokens or 0,
        daily_token_limit=plan.daily_token_limit,
        requests_per_hour=plan.requests_per_hour,
        token_overage_chf_per_1k=float(plan.token_overage_chf_per_1k or 0),
        storage_limit_bytes=plan.storage_limit_bytes or 524_288_000,
        max_buddies=plan.max_buddies or 1,
        features=plan.features or {},
        sort_order=plan.sort_order or 0,
        stripe_price_id_monthly=plan.stripe_price_id_monthly,
        stripe_price_id_yearly=plan.stripe_price_id_yearly,
    )


# ── Wallet ────────────────────────────────────────────────────────────────────

class WalletStatusOut(BaseModel):
    balance_chf: float
    monthly_limit_chf: float
    per_tx_limit_chf: float
    monthly_spent_chf: float
    monthly_remaining_chf: float
    auto_topup_enabled: bool
    auto_topup_threshold_chf: float
    auto_topup_amount_chf: float
    has_saved_card: bool
    # Storage
    storage_used_bytes: int
    storage_limit_bytes: int
    storage_extra_bytes: int


class WalletSettingsIn(BaseModel):
    monthly_limit_chf: Optional[float] = None
    per_tx_limit_chf: Optional[float] = None
    auto_topup_enabled: Optional[bool] = None
    auto_topup_threshold_chf: Optional[float] = None
    auto_topup_amount_chf: Optional[float] = None


class BankTransferOut(BaseModel):
    reference: str
    amount_chf: float
    iban: str
    recipient: str
    note: str


class AdminCreditIn(BaseModel):
    customer_id: str
    amount_chf: float = Field(..., ge=0.01, le=10_000)
    description: str = "Manuelle Gutschrift durch Admin"


@router.get("/wallet", response_model=WalletStatusOut)
async def get_wallet(
    customer: Customer = Depends(get_current_user),
):
    """Wallet-Status: Guthaben, Limits, Auto-Topup, Speicher."""
    monthly_limit = float(customer.wallet_monthly_limit_chf or 100)
    monthly_spent = float(customer.wallet_monthly_spent_chf or 0)
    return WalletStatusOut(
        balance_chf=float(customer.token_balance_chf or 0),
        monthly_limit_chf=monthly_limit,
        per_tx_limit_chf=float(customer.wallet_per_tx_limit_chf or 50),
        monthly_spent_chf=monthly_spent,
        monthly_remaining_chf=max(0.0, monthly_limit - monthly_spent),
        auto_topup_enabled=bool(customer.auto_topup_enabled),
        auto_topup_threshold_chf=float(customer.auto_topup_threshold_chf or 5),
        auto_topup_amount_chf=float(customer.auto_topup_amount_chf or 20),
        has_saved_card=bool(customer.stripe_payment_method_id),
        storage_used_bytes=customer.storage_used_bytes or 0,
        storage_limit_bytes=customer.storage_limit_bytes or 524_288_000,
        storage_extra_bytes=customer.storage_extra_bytes or 0,
    )


@router.put("/wallet/settings", response_model=WalletStatusOut)
async def update_wallet_settings(
    data: WalletSettingsIn,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Limits und Auto-Topup konfigurieren."""
    for field, value in data.model_dump(exclude_none=True).items():
        db_field = field  # Namen stimmen überein dank Präfix-Mapping unten
        # Mapping: WalletSettingsIn field → Customer field
        mapping = {
            "monthly_limit_chf": "wallet_monthly_limit_chf",
            "per_tx_limit_chf": "wallet_per_tx_limit_chf",
            "auto_topup_enabled": "auto_topup_enabled",
            "auto_topup_threshold_chf": "auto_topup_threshold_chf",
            "auto_topup_amount_chf": "auto_topup_amount_chf",
        }
        setattr(customer, mapping.get(field, field), value)
    await db.commit()
    await db.refresh(customer)
    monthly_limit = float(customer.wallet_monthly_limit_chf or 100)
    monthly_spent = float(customer.wallet_monthly_spent_chf or 0)
    return WalletStatusOut(
        balance_chf=float(customer.token_balance_chf or 0),
        monthly_limit_chf=monthly_limit,
        per_tx_limit_chf=float(customer.wallet_per_tx_limit_chf or 50),
        monthly_spent_chf=monthly_spent,
        monthly_remaining_chf=max(0.0, monthly_limit - monthly_spent),
        auto_topup_enabled=bool(customer.auto_topup_enabled),
        auto_topup_threshold_chf=float(customer.auto_topup_threshold_chf or 5),
        auto_topup_amount_chf=float(customer.auto_topup_amount_chf or 20),
        has_saved_card=bool(customer.stripe_payment_method_id),
        storage_used_bytes=customer.storage_used_bytes or 0,
        storage_limit_bytes=customer.storage_limit_bytes or 524_288_000,
        storage_extra_bytes=customer.storage_extra_bytes or 0,
    )


@router.post("/wallet/topup/stripe")
async def wallet_topup_stripe(
    req: TopupRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stripe Checkout Topup — öffnet Zahlungsseite."""
    try:
        url = await create_topup_checkout(customer, req.amount_chf, db)
        return {"checkout_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wallet/topup/bank", response_model=BankTransferOut)
async def wallet_topup_bank(
    req: TopupRequest,
    customer: Customer = Depends(get_current_user),
):
    """Banküberweisung: generiert Zahlungsreferenz und IBAN-Details."""
    if req.amount_chf < 10:
        raise HTTPException(status_code=400, detail="Mindestbetrag für Banküberweisung: CHF 10.00")
    reference = generate_bank_transfer_reference(str(customer.id))
    return BankTransferOut(
        reference=reference,
        amount_chf=req.amount_chf,
        iban=_cfg.company_iban or "CH00 0000 0000 0000 0000 0",
        recipient="Baddi AG",
        note=f"Bitte Referenz im Zahlungszweck angeben: {reference}",
    )


# ── Speicher Add-ons ──────────────────────────────────────────────────────────

_GB = 1024 * 1024 * 1024

STORAGE_ADDONS = [
    {"key": "10gb",  "label": "10 GB",  "bytes": 10 * _GB,  "price_chf": 1.90,  "description": "+10 GB Zusatzspeicher"},
    {"key": "50gb",  "label": "50 GB",  "bytes": 50 * _GB,  "price_chf": 6.90,  "description": "+50 GB Zusatzspeicher"},
    {"key": "500gb", "label": "500 GB", "bytes": 500 * _GB, "price_chf": 39.00, "description": "+500 GB Zusatzspeicher"},
]


class StorageAddonIn(BaseModel):
    addon_key: str   # "10gb" | "50gb" | "500gb"


@router.get("/storage/addons")
async def list_storage_addons():
    """Verfügbare Speicher Add-ons."""
    return STORAGE_ADDONS


@router.post("/storage/addon")
async def purchase_storage_addon(
    data: StorageAddonIn,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Speicher Add-on kaufen — wird vom Wallet-Guthaben abgezogen.
    Nach dem Kauf wird storage_extra_bytes dauerhaft erhöht.
    """
    from decimal import Decimal
    addon = next((a for a in STORAGE_ADDONS if a["key"] == data.addon_key), None)
    if not addon:
        raise HTTPException(status_code=400, detail="Unbekanntes Add-on.")

    price = Decimal(str(addon["price_chf"]))
    balance = Decimal(str(float(customer.token_balance_chf or 0)))
    if balance < price:
        raise HTTPException(
            status_code=402,
            detail=f"Zu wenig Guthaben. Benötigt: CHF {addon['price_chf']:.2f}, Verfügbar: CHF {float(balance):.2f}. Bitte zuerst Wallet aufladen.",
        )

    customer.token_balance_chf = balance - price
    customer.storage_extra_bytes = (customer.storage_extra_bytes or 0) + addon["bytes"]

    net, vat = calc_vat(addon["price_chf"])
    inv_no = await next_invoice_number(db)
    db.add(Payment(
        invoice_number=inv_no,
        customer_id=str(customer.id),
        amount_chf=addon["price_chf"],
        vat_chf=vat,
        amount_net_chf=net,
        description=addon["description"],
        payment_type="storage_addon",
        status="succeeded",
        paid_at=datetime.utcnow(),
    ))
    await db.commit()
    await db.refresh(customer)
    _log.info("Storage Add-on: %s → Kunde %s (+%d bytes)", addon["key"], customer.id, addon["bytes"])
    return {
        "addon": addon["key"],
        "bytes_added": addon["bytes"],
        "storage_extra_bytes": customer.storage_extra_bytes,
        "new_balance_chf": float(customer.token_balance_chf),
        "invoice_number": inv_no,
    }


# ── Admin: Wallet-Gutschrift ───────────────────────────────────────────────────

@router.get("/admin/wallet/{customer_id}", response_model=WalletStatusOut)
async def admin_get_wallet(
    customer_id: str,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Wallet-Status eines Kunden abrufen."""
    import uuid as _uuid
    customer = await db.get(Customer, _uuid.UUID(customer_id))
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    monthly_limit = float(customer.wallet_monthly_limit_chf or 100)
    monthly_spent = float(customer.wallet_monthly_spent_chf or 0)
    return WalletStatusOut(
        balance_chf=float(customer.token_balance_chf or 0),
        monthly_limit_chf=monthly_limit,
        per_tx_limit_chf=float(customer.wallet_per_tx_limit_chf or 50),
        monthly_spent_chf=monthly_spent,
        monthly_remaining_chf=max(0.0, monthly_limit - monthly_spent),
        auto_topup_enabled=bool(customer.auto_topup_enabled),
        auto_topup_threshold_chf=float(customer.auto_topup_threshold_chf or 5),
        auto_topup_amount_chf=float(customer.auto_topup_amount_chf or 20),
        has_saved_card=bool(customer.stripe_payment_method_id),
        storage_used_bytes=customer.storage_used_bytes or 0,
        storage_limit_bytes=customer.storage_limit_bytes or 524_288_000,
        storage_extra_bytes=customer.storage_extra_bytes or 0,
    )


@router.post("/admin/wallet/credit")
async def admin_wallet_credit(
    data: AdminCreditIn,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Gutschrift manuell auf Kundenkonto buchen (z.B. nach Banküberweisung)."""
    import uuid as _uuid
    from decimal import Decimal
    customer = await db.get(Customer, _uuid.UUID(data.customer_id))
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")

    customer.token_balance_chf = Decimal(str(float(customer.token_balance_chf or 0))) + Decimal(str(data.amount_chf))
    net, vat = calc_vat(data.amount_chf)
    inv_no = await next_invoice_number(db)
    db.add(Payment(
        invoice_number=inv_no,
        customer_id=str(customer.id),
        amount_chf=data.amount_chf,
        vat_chf=vat,
        amount_net_chf=net,
        description=data.description,
        payment_type="bank_transfer",
        status="succeeded",
        paid_at=datetime.utcnow(),
    ))
    await db.commit()
    _log.info("Admin Wallet Credit: CHF %.2f → Kunde %s (neues Guthaben: %.2f)",
              data.amount_chf, customer.id, float(customer.token_balance_chf))
    return {
        "customer_id": str(customer.id),
        "amount_credited_chf": data.amount_chf,
        "new_balance_chf": float(customer.token_balance_chf),
        "invoice_number": inv_no,
    }


@router.get("/admin/stripe-status")
async def admin_stripe_status(_: Customer = Depends(require_admin)):
    """Admin: Stripe-Konfigurationsstatus (Keys vorhanden, Webhook-URL)."""
    return {
        "secret_key_set": bool(_cfg.stripe_secret_key),
        "webhook_secret_set": bool(_cfg.stripe_webhook_secret),
        "price_ids": {
            "basis_monthly":   _cfg.stripe_price_basis_monthly or None,
            "basis_yearly":    _cfg.stripe_price_basis_yearly or None,
            "komfort_monthly": _cfg.stripe_price_komfort_monthly or None,
            "komfort_yearly":  _cfg.stripe_price_komfort_yearly or None,
            "premium_monthly": _cfg.stripe_price_premium_monthly or None,
            "premium_yearly":  _cfg.stripe_price_premium_yearly or None,
        },
    }
