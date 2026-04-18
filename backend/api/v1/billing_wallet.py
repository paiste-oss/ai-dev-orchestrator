"""
Billing Wallet — Wallet-Status, Limits, Topup, Speicher Add-ons, Admin-Wallet-Ops.

Endpunkte:
  GET  /billing/wallet                 — Wallet-Status + Einstellungen
  PUT  /billing/wallet/settings        — Limits + Auto-Topup konfigurieren
  POST /billing/wallet/topup/stripe    — Stripe Checkout Topup
  POST /billing/wallet/topup/bank      — Banküberweisung-Referenz generieren
  GET  /billing/storage/addons         — Verfügbare Speicher Add-ons
  POST /billing/storage/addon          — Speicher Add-on buchen
  GET  /billing/admin/wallet/{id}      — Admin: Wallet-Status eines Kunden
  POST /billing/admin/wallet/credit    — Admin: Manuell Guthaben gutschreiben
"""
import logging
import uuid as _uuid
from datetime import datetime,timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings as _cfg
from core.database import get_db
from core.dependencies import get_current_user, require_admin
from models.customer import Customer
from models.payment import Payment
from services.billing_service import (
    create_topup_checkout,
    generate_bank_transfer_reference,
    next_invoice_number,
    calc_vat,
    add_storage_subscription_item,
)

from .billing_schemas import (
    WalletStatusOut,
    WalletSettingsIn,
    BankTransferOut,
    AdminCreditIn,
    TopupRequest,
    StorageAddonIn,
)

_log = logging.getLogger(__name__)
router = APIRouter()

_GB = 1024 * 1024 * 1024

STORAGE_ADDONS = [
    {
        "key": "10gb",  "label": "10 GB",  "bytes": 10 * _GB,
        "price_chf": 1.90,  "description": "+10 GB Zusatzspeicher (monatlich)",
        "stripe_price_key": "stripe_price_storage_10gb",
    },
    {
        "key": "50gb",  "label": "50 GB",  "bytes": 50 * _GB,
        "price_chf": 6.90,  "description": "+50 GB Zusatzspeicher (monatlich)",
        "stripe_price_key": "stripe_price_storage_50gb",
    },
    {
        "key": "500gb", "label": "500 GB", "bytes": 500 * _GB,
        "price_chf": 39.00, "description": "+500 GB Zusatzspeicher (monatlich)",
        "stripe_price_key": "stripe_price_storage_500gb",
    },
]


def _wallet_out(customer: Customer) -> WalletStatusOut:
    """Hilfsfunktion: Customer → WalletStatusOut."""
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
        has_active_subscription=customer.subscription_status in ("active", "trialing"),
        can_purchase_addons=customer.subscription_status == "active",
        storage_used_bytes=customer.storage_used_bytes or 0,
        storage_limit_bytes=customer.storage_limit_bytes or 524_288_000,
        storage_extra_bytes=customer.storage_extra_bytes or 0,
        storage_addon_items=customer.storage_addon_items or [],
    )


# ── Wallet ─────────────────────────────────────────────────────────────────────

@router.get("/wallet", response_model=WalletStatusOut)
async def get_wallet(
    customer: Customer = Depends(get_current_user),
):
    """Wallet-Status: Guthaben, Limits, Auto-Topup, Speicher."""
    return _wallet_out(customer)


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
    return _wallet_out(customer)


@router.post("/wallet/topup/stripe")
async def wallet_topup_stripe(
    req: TopupRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stripe Checkout Topup — nur mit aktivem Abo möglich."""
    if customer.subscription_status not in ("active", "trialing"):
        raise HTTPException(
            status_code=400,
            detail="Token-Guthaben aufladen ist nur mit einem aktiven Abo möglich. Bitte zuerst ein Abo abschliessen.",
        )
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
    """Banküberweisung: generiert Zahlungsreferenz und IBAN-Details. Nur mit aktivem Abo."""
    if customer.subscription_status not in ("active", "trialing"):
        raise HTTPException(
            status_code=400,
            detail="Token-Guthaben aufladen ist nur mit einem aktiven Abo möglich. Bitte zuerst ein Abo abschliessen.",
        )
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


# ── Speicher Add-ons ───────────────────────────────────────────────────────────

@router.get("/storage/addons")
async def list_storage_addons():
    """Verfügbare Speicher Add-ons (monatlich zum Abo hinzugefügt)."""
    # stripe_price_key nicht an Frontend geben
    return [
        {k: v for k, v in a.items() if k != "stripe_price_key"}
        for a in STORAGE_ADDONS
    ]


@router.post("/storage/addon")
async def purchase_storage_addon(
    data: StorageAddonIn,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Speicher Add-on buchen — wird als monatlich wiederkehrendes Stripe Subscription Item
    zum bestehenden Abo hinzugefügt. Voraussetzung: aktives Abo.
    Das Wallet-Guthaben wird NICHT verwendet — nur für Token-Overage.
    """
    # Abo-Pflicht — kein Add-on während Trial
    if customer.subscription_status == "trialing":
        raise HTTPException(
            status_code=400,
            detail="Speicher Add-ons sind während der Testphase nicht verfügbar.",
        )
    if customer.subscription_status not in ("active",):
        raise HTTPException(
            status_code=400,
            detail="Speicher Add-ons sind nur mit einem aktiven Abo buchbar.",
        )

    addon = next((a for a in STORAGE_ADDONS if a["key"] == data.addon_key), None)
    if not addon:
        raise HTTPException(status_code=400, detail="Unbekanntes Add-on.")

    # Stripe Price ID prüfen
    price_id = getattr(_cfg, addon["stripe_price_key"], "")
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail=f"Stripe Price ID für {addon['key']} ist nicht konfiguriert. Bitte Admin kontaktieren.",
        )

    try:
        stripe_item_id = await add_storage_subscription_item(
            customer=customer,
            addon_key=addon["key"],
            addon_label=addon["label"],
            bytes_to_add=addon["bytes"],
            price_id=price_id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _log.error("Storage Add-on Stripe Fehler: %s", e)
        raise HTTPException(status_code=502, detail=f"Stripe-Fehler: {e}")

    await db.refresh(customer)
    _log.info("Storage Add-on: %s → Kunde %s (+%d bytes, item=%s)",
              addon["key"], customer.id, addon["bytes"], stripe_item_id)
    return {
        "addon": addon["key"],
        "label": addon["label"],
        "bytes_added": addon["bytes"],
        "storage_extra_bytes": customer.storage_extra_bytes,
        "stripe_item_id": stripe_item_id,
        "billing": "monthly_subscription",
        "price_chf_monthly": addon["price_chf"],
    }


# ── Admin: Wallet-Gutschrift ───────────────────────────────────────────────────

@router.get("/admin/wallet/{customer_id}", response_model=WalletStatusOut)
async def admin_get_wallet(
    customer_id: str,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Wallet-Status eines Kunden abrufen."""
    customer = await db.get(Customer, _uuid.UUID(customer_id))
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    return _wallet_out(customer)


@router.post("/admin/wallet/credit")
async def admin_wallet_credit(
    data: AdminCreditIn,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Gutschrift manuell auf Kundenkonto buchen (z.B. nach Banküberweisung)."""
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
        paid_at=datetime.now(timezone.utc).replace(tzinfo=None),
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
