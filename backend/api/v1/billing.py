"""
Billing API — Abo-Verwaltung, Checkout, Topup, Webhook.

Endpunkte:
  GET  /v1/billing/plans          — Alle Pläne (öffentlich)
  GET  /v1/billing/status         — Aktueller Status des eingeloggten Kunden
  POST /v1/billing/checkout       — Checkout-Session starten (Abo)
  POST /v1/billing/topup          — Guthaben aufladen
  POST /v1/billing/portal         — Stripe Billing Portal öffnen
  GET  /v1/billing/invoices       — Zahlungshistorie
  POST /v1/billing/webhook        — Stripe Webhook (kein Auth, Signatur-Check)
  POST /v1/billing/accept-tos     — ToS akzeptieren
  GET  /v1/billing/admin/overview — Admin: alle Kunden + Revenue (Admin-only)
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

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
