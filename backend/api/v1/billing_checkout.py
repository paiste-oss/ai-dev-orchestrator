"""
Billing Checkout — Checkout, Topup, Portal, ToS, Webhook.

Endpunkte:
  POST /billing/checkout      — Checkout-Session starten (Abo)
  POST /billing/topup         — Guthaben aufladen (Stripe, Legacy-Endpunkt)
  POST /billing/portal        — Stripe Billing Portal öffnen
  POST /billing/accept-tos    — ToS akzeptieren
  POST /billing/webhook       — Stripe Webhook (kein Auth, Signatur-Check)
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from services.billing_service import (
    create_subscription_checkout,
    create_topup_checkout,
    create_billing_portal_session,
    handle_webhook,
)

from .billing_schemas import CheckoutRequest, TopupRequest

router = APIRouter()


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


# ── Topup (Legacy) ─────────────────────────────────────────────────────────────

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
        url = await create_topup_checkout(customer, req.amount_chf, db, return_path="/user/billing")
        return {"checkout_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Portal ────────────────────────────────────────────────────────────────────

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
