"""
Webhook Handler — Stripe Webhook-Events verarbeiten.

Verantwortlich für:
- Signatur-Verifikation
- checkout.session.completed
- customer.subscription.updated / created / deleted
- invoice.payment_succeeded / failed
"""
from __future__ import annotations
import logging
import uuid as uuid_mod
from datetime import datetime, timezone

import stripe
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.config import settings
from models.customer import Customer, SubscriptionPlan
from models.payment import Payment
from services.invoice_service import next_invoice_number, calc_vat

_log = logging.getLogger(__name__)


async def handle_webhook(payload: bytes, sig_header: str, db: AsyncSession) -> None:
    """
    Verarbeitet Stripe-Webhook-Events.
    Alle Events werden mit Signatur-Verifikation geprüft.
    """
    stripe.api_key = settings.stripe_secret_key
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except stripe.error.SignatureVerificationError:
        _log.warning("Stripe Webhook: ungültige Signatur")
        raise ValueError("Invalid webhook signature")

    etype = event["type"]
    _log.info("Stripe Webhook: %s", etype)

    if etype == "checkout.session.completed":
        await _on_checkout_completed(event["data"]["object"], db)

    elif etype in ("customer.subscription.updated", "customer.subscription.created"):
        await _on_subscription_updated(event["data"]["object"], db)

    elif etype == "customer.subscription.deleted":
        await _on_subscription_deleted(event["data"]["object"], db)

    elif etype == "invoice.payment_succeeded":
        await _on_invoice_paid(event["data"]["object"], db)

    elif etype == "invoice.payment_failed":
        await _on_invoice_failed(event["data"]["object"], db)


async def _on_checkout_completed(session: dict, db: AsyncSession) -> None:
    meta = session.get("metadata", {})
    customer_id = meta.get("customer_id")
    if not customer_id:
        return

    customer = await db.get(Customer, uuid_mod.UUID(customer_id))
    if not customer:
        return

    topup = meta.get("topup_amount_chf")
    if topup:
        # Prepaid-Aufladung
        amount = float(topup)
        customer.token_balance_chf = float(customer.token_balance_chf or 0) + amount
        net, vat = calc_vat(amount)
        inv_no = await next_invoice_number(db)
        payment = Payment(
            invoice_number=inv_no,
            customer_id=str(customer.id),
            stripe_payment_intent_id=session.get("payment_intent"),
            amount_chf=amount,
            vat_chf=vat,
            amount_net_chf=net,
            description=f"Baddi Guthaben-Aufladung CHF {amount:.2f}",
            payment_type="topup",
            status="succeeded",
            paid_at=datetime.utcnow(),
        )
        db.add(payment)
        await db.commit()
        _log.info("Topup %s CHF für customer %s", amount, customer_id)
    else:
        # Abo-Checkout
        plan_slug = meta.get("plan_slug", "")
        billing_cycle = meta.get("billing_cycle", "monthly")
        customer.billing_cycle = billing_cycle

        # Plan zuweisen
        if plan_slug:
            r = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_slug))
            plan = r.scalar_one_or_none()
            if plan:
                customer.subscription_plan_id = plan.id

        # subscription_id wird über subscription.updated gesetzt
        await db.commit()


async def _on_subscription_updated(sub: dict, db: AsyncSession) -> None:
    meta = sub.get("metadata", {})
    customer_id = meta.get("customer_id")
    if not customer_id:
        # via stripe_customer_id suchen
        stripe_cid = sub.get("customer")
        if stripe_cid:
            r = await db.execute(select(Customer).where(Customer.stripe_customer_id == stripe_cid))
            customer = r.scalar_one_or_none()
            if customer:
                customer_id = str(customer.id)

    if not customer_id:
        return
    customer = await db.get(Customer, uuid_mod.UUID(customer_id))
    if not customer:
        return

    customer.stripe_subscription_id = sub["id"]
    customer.subscription_status = sub["status"]  # active | past_due | canceled | ...

    period_end = sub.get("current_period_end")
    if period_end:
        customer.subscription_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc).replace(tzinfo=None)

    # Items auslesen (für Metered Billing / zukünftige Nutzung)
    items = sub.get("items", {}).get("data", [])
    if items:
        customer.stripe_subscription_item_id = items[0]["id"]

    await db.commit()
    _log.info("Subscription updated: customer=%s status=%s", customer_id, sub["status"])


async def _on_subscription_deleted(sub: dict, db: AsyncSession) -> None:
    stripe_cid = sub.get("customer")
    r = await db.execute(select(Customer).where(Customer.stripe_customer_id == stripe_cid))
    customer = r.scalar_one_or_none()
    if customer:
        customer.subscription_status = "canceled"
        customer.subscription_plan_id = None
        # Zusatzspeicher entfernen — war Bestandteil des Abos
        customer.storage_extra_bytes = 0
        customer.storage_addon_items = []
        await db.commit()
        _log.info("Subscription canceled: customer=%s — Zusatzspeicher entfernt", customer.id)


async def _on_invoice_paid(invoice: dict, db: AsyncSession) -> None:
    stripe_cid = invoice.get("customer")
    r = await db.execute(select(Customer).where(Customer.stripe_customer_id == stripe_cid))
    customer = r.scalar_one_or_none()
    if not customer:
        return

    amount_chf = invoice.get("amount_paid", 0) / 100
    net, vat = calc_vat(amount_chf)
    inv_no = await next_invoice_number(db)

    # Token-Kontingent zurücksetzen
    customer.tokens_used_this_period = 0

    payment = Payment(
        invoice_number=inv_no,
        customer_id=str(customer.id),
        stripe_invoice_id=invoice.get("id"),
        stripe_payment_intent_id=invoice.get("payment_intent"),
        amount_chf=amount_chf,
        vat_chf=vat,
        amount_net_chf=net,
        description=invoice.get("description") or f"Baddi Abo — {datetime.utcnow().strftime('%B %Y')}",
        payment_type="subscription",
        status="succeeded",
        paid_at=datetime.utcnow(),
    )
    db.add(payment)
    await db.commit()
    _log.info("Invoice paid: %s CHF für customer %s", amount_chf, customer.id)


async def _on_invoice_failed(invoice: dict, db: AsyncSession) -> None:
    stripe_cid = invoice.get("customer")
    r = await db.execute(select(Customer).where(Customer.stripe_customer_id == stripe_cid))
    customer = r.scalar_one_or_none()
    if not customer:
        return
    customer.subscription_status = "past_due"
    await db.commit()
    _log.warning("Invoice payment FAILED für customer %s", customer.id)
