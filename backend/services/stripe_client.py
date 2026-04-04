"""
Stripe Client — Wrapper für Stripe API-Aufrufe.

Verantwortlich für:
- Stripe-Client initialisieren (lazy)
- Customer anlegen / abrufen
- Checkout-Sessions erstellen (Abo + Topup)
- Billing Portal Session erstellen
- Storage Add-on als Subscription Item hinzufügen
- Banküberweisung-Referenz generieren
"""
from __future__ import annotations
import logging
import uuid as uuid_mod
from datetime import datetime, timezone
from decimal import Decimal

import stripe
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.config import settings
from models.customer import Customer, SubscriptionPlan
from models.payment import Payment
from services.invoice_service import next_invoice_number, calc_vat

_log = logging.getLogger(__name__)

# ── Plan-Konfiguration ────────────────────────────────────────────────────────
# Seed-Daten — werden beim Start in die DB geschrieben falls leer

_GB = 1024 * 1024 * 1024
_MB = 1024 * 1024

PLAN_DEFAULTS = [
    {
        "name": "Personal",
        "slug": "basis",
        "max_buddies": 1,
        "monthly_price": 19.00,
        "yearly_price": 180.00,
        "included_tokens": 500_000,
        "daily_token_limit": 20_000,
        "requests_per_hour": 20,
        "token_overage_chf_per_1k": 0.002,
        "storage_limit_bytes": 500 * _MB,   # 500 MB
        "sort_order": 1,
        "features": {
            "allowed_services": ["smtp"],
            "highlights": [
                "500'000 Tokens/Monat",
                "500 MB Speicher",
                "20 Anfragen/Stunde",
                "E-Mail-Support",
            ],
        },
    },
    {
        "name": "Intensiv",
        "slug": "komfort",
        "max_buddies": 1,
        "monthly_price": 49.00,
        "yearly_price": 468.00,
        "included_tokens": 2_000_000,
        "daily_token_limit": 80_000,
        "requests_per_hour": 60,
        "token_overage_chf_per_1k": 0.0015,
        "storage_limit_bytes": 5 * _GB,     # 5 GB
        "sort_order": 2,
        "features": {
            "allowed_services": ["smtp", "twilio", "slack"],
            "highlights": [
                "2'000'000 Tokens/Monat",
                "5 GB Speicher",
                "60 Anfragen/Stunde",
                "Prioritäts-Support",
            ],
        },
    },
    {
        "name": "Premium",
        "slug": "premium",
        "max_buddies": 1,
        "monthly_price": 99.00,
        "yearly_price": 948.00,
        "included_tokens": 10_000_000,
        "daily_token_limit": 400_000,
        "requests_per_hour": 200,
        "token_overage_chf_per_1k": 0.001,
        "storage_limit_bytes": 25 * _GB,    # 25 GB
        "sort_order": 3,
        "features": {
            "allowed_services": ["smtp", "twilio", "slack", "google_sheets", "google_docs", "google_calendar"],
            "highlights": [
                "10'000'000 Tokens/Monat",
                "25 GB Speicher",
                "200 Anfragen/Stunde",
                "Alle Integrationen",
                "Dedizierter Support",
            ],
        },
    },
]


def _stripe():
    if not settings.stripe_secret_key:
        raise ValueError("STRIPE_SECRET_KEY ist nicht konfiguriert.")
    stripe.api_key = settings.stripe_secret_key
    return stripe


async def seed_plans(db: AsyncSession) -> None:
    """Legt die Standardpläne an oder aktualisiert bestehende (idempotent via slug)."""
    for p in PLAN_DEFAULTS:
        r = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == p["slug"]))
        plan = r.scalar_one_or_none()
        if plan is None:
            plan = SubscriptionPlan(id=uuid_mod.uuid4(), slug=p["slug"])
            db.add(plan)
        # Immer aktualisieren (Name, Preise, Rate Limits, Features)
        plan.name = p["name"]
        plan.max_buddies = p["max_buddies"]
        plan.monthly_price = p["monthly_price"]
        plan.yearly_price = p["yearly_price"]
        plan.included_tokens = p["included_tokens"]
        plan.daily_token_limit = p["daily_token_limit"]
        plan.requests_per_hour = p["requests_per_hour"]
        plan.token_overage_chf_per_1k = p["token_overage_chf_per_1k"]
        plan.storage_limit_bytes = p["storage_limit_bytes"]
        plan.sort_order = p["sort_order"]
        plan.features = p["features"]
    await db.commit()
    _log.info("Billing: Pläne synchronisiert (Personal / Intensiv / Premium)")


async def get_or_create_stripe_customer(customer: Customer, db: AsyncSession) -> str:
    """Gibt die Stripe-Customer-ID zurück — erstellt sie falls nötig."""
    if customer.stripe_customer_id:
        return customer.stripe_customer_id
    s = _stripe()
    sc = s.Customer.create(
        email=customer.email,
        name=customer.name,
        metadata={"customer_id": str(customer.id)},
    )
    customer.stripe_customer_id = sc.id
    await db.commit()
    return sc.id


async def create_subscription_checkout(
    customer: Customer,
    plan_slug: str,
    billing_cycle: str,
    db: AsyncSession,
) -> str:
    """
    Erstellt eine Stripe Checkout Session für ein Abo.
    Gibt die checkout_url zurück.
    """
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_slug)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Plan '{plan_slug}' nicht gefunden.")

    price_id = plan.stripe_price_id_yearly if billing_cycle == "yearly" else plan.stripe_price_id_monthly
    if not price_id:
        raise ValueError(
            f"Stripe Price ID für {plan_slug}/{billing_cycle} nicht konfiguriert. "
            "Bitte in Stripe erstellen und in den Einstellungen hinterlegen."
        )

    s = _stripe()
    stripe_customer_id = await get_or_create_stripe_customer(customer, db)

    session = s.checkout.Session.create(
        customer=stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.frontend_url}/user/billing?status=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.frontend_url}/user/billing?status=canceled",
        metadata={
            "customer_id": str(customer.id),
            "plan_slug": plan_slug,
            "billing_cycle": billing_cycle,
        },
        subscription_data={
            "metadata": {
                "customer_id": str(customer.id),
                "plan_slug": plan_slug,
            }
        },
        allow_promotion_codes=True,
    )
    return session.url


async def create_topup_checkout(
    customer: Customer,
    amount_chf: float,
    db: AsyncSession,
    return_path: str = "/user/wallet",
) -> str:
    """
    Erstellt eine einmalige Checkout Session um Prepaid-Guthaben aufzuladen.
    Minimalbetrag CHF 5, Maximum CHF 500.
    return_path: Wohin nach erfolgreichem Checkout weitergeleitet wird.
    """
    if amount_chf < 5 or amount_chf > 500:
        raise ValueError("Aufladebetrag muss zwischen CHF 5 und CHF 500 liegen.")

    s = _stripe()
    stripe_customer_id = await get_or_create_stripe_customer(customer, db)
    amount_rappen = int(round(amount_chf * 100))

    session = s.checkout.Session.create(
        customer=stripe_customer_id,
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "chf",
                "product_data": {"name": f"Baddi Token-Guthaben CHF {amount_chf:.2f}"},
                "unit_amount": amount_rappen,
            },
            "quantity": 1,
        }],
        success_url=f"{settings.frontend_url}{return_path}?status=topup_success",
        cancel_url=f"{settings.frontend_url}{return_path}?status=canceled",
        metadata={
            "customer_id": str(customer.id),
            "topup_amount_chf": str(amount_chf),
        },
    )
    return session.url


async def create_billing_portal_session(customer: Customer, db: AsyncSession) -> str:
    """Stripe Billing Portal — Kunde kann Karte, Abo, Rechnungen selbst verwalten."""
    stripe_customer_id = await get_or_create_stripe_customer(customer, db)
    s = _stripe()
    session = s.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{settings.frontend_url}/user/billing",
    )
    return session.url


async def add_storage_subscription_item(
    customer: Customer,
    addon_key: str,
    addon_label: str,
    bytes_to_add: int,
    price_id: str,
    db: AsyncSession,
) -> str:
    """
    Fügt einen Speicher Add-on als Stripe Subscription Item hinzu.
    Der Kunde wird monatlich zusammen mit seinem Abo belastet.
    Gibt die Stripe Subscription Item ID zurück.

    Voraussetzung: Kunde hat ein aktives Abo (stripe_subscription_id gesetzt).
    """
    if not customer.stripe_subscription_id:
        raise ValueError("Kein aktives Stripe-Abo gefunden.")

    s = _stripe()
    item = s.SubscriptionItem.create(
        subscription=customer.stripe_subscription_id,
        price=price_id,
        quantity=1,
        # Proration: anteilig für den aktuellen Monat abrechnen
        proration_behavior="create_prorations",
    )

    # Speicher sofort freischalten
    addon_items = list(customer.storage_addon_items or [])
    addon_items.append({
        "key": addon_key,
        "stripe_item_id": item.id,
        "bytes": bytes_to_add,
        "added_at": datetime.now(timezone.utc).isoformat(),
    })
    customer.storage_addon_items = addon_items
    customer.storage_extra_bytes = (customer.storage_extra_bytes or 0) + bytes_to_add

    await db.commit()
    _log.info(
        "Storage Add-on %s hinzugefügt: customer=%s, stripe_item=%s (+%d bytes)",
        addon_key, customer.id, item.id, bytes_to_add,
    )
    return item.id


def generate_bank_transfer_reference(customer_id: str) -> str:
    """
    Generiert eine eindeutige Zahlungsreferenz für Banküberweisungen.
    Format: BAD-<6-stellige Kunden-Kurzkennung>-<Timestamp>
    """
    short_id = str(customer_id).replace("-", "")[:6].upper()
    ts = datetime.now(timezone.utc).strftime("%m%d%H%M")
    return f"BAD-{short_id}-{ts}"
