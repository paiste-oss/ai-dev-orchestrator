"""
Billing Service — Stripe-Integration für Abo-Management.

Verantwortlich für:
- Stripe Customer anlegen / abrufen
- Checkout-Session erstellen (Abo + Topup)
- Webhook-Events verarbeiten
- Token-Quota prüfen + Overage vom Prepaid-Guthaben abziehen
- Fortlaufende Rechnungsnummern vergeben (gesetzlich CH)
- MwSt-Berechnung (8.1% Schweiz)

Preisstruktur (CHF):
  Basis   CHF 19/Mo | CHF 180/Jahr (−21%)  | 500k Tokens/Mo  | CHF 2.00/100k Overage
  Komfort CHF 49/Mo | CHF 468/Jahr (−20%)  | 2M   Tokens/Mo  | CHF 1.50/100k Overage
  Premium CHF 99/Mo | CHF 948/Jahr (−20%)  | 10M  Tokens/Mo  | CHF 1.00/100k Overage
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
from models.payment import Payment, InvoiceCounter

_log = logging.getLogger(__name__)

# Schweizer MwSt-Satz
_VAT_RATE = Decimal("0.081")

# ── Stripe-Client konfigurieren ───────────────────────────────────────────────

def _stripe():
    if not settings.stripe_secret_key:
        raise ValueError("STRIPE_SECRET_KEY ist nicht konfiguriert.")
    stripe.api_key = settings.stripe_secret_key
    return stripe


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


# ── Rechnungsnummer ───────────────────────────────────────────────────────────

async def next_invoice_number(db: AsyncSession) -> str:
    """
    Vergibt die nächste fortlaufende Rechnungsnummer.
    Format: BAD-YYYY-NNNNNN  (z.B. BAD-2026-000001)
    Gesetzlich vorgeschrieben gem. MWSTG Art. 26 Abs. 2 lit. b.
    """
    year = datetime.now(timezone.utc).year
    row = await db.get(InvoiceCounter, year)
    if row is None:
        row = InvoiceCounter(year=year, last_number=0)
        db.add(row)
    row.last_number += 1
    await db.flush()
    return f"BAD-{year}-{row.last_number:06d}"


# ── MwSt ──────────────────────────────────────────────────────────────────────

def calc_vat(gross_chf: float) -> tuple[float, float]:
    """Gibt (netto, mwst) zurück. Schweiz 8.1% inkl. MwSt."""
    gross = Decimal(str(gross_chf))
    net = (gross / (1 + _VAT_RATE)).quantize(Decimal("0.01"))
    vat = (gross - net).quantize(Decimal("0.01"))
    return float(net), float(vat)


# ── Stripe Customer ───────────────────────────────────────────────────────────

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


# ── Checkout Session ──────────────────────────────────────────────────────────

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


# ── Billing Portal ────────────────────────────────────────────────────────────

async def create_billing_portal_session(customer: Customer, db: AsyncSession) -> str:
    """Stripe Billing Portal — Kunde kann Karte, Abo, Rechnungen selbst verwalten."""
    stripe_customer_id = await get_or_create_stripe_customer(customer, db)
    s = _stripe()
    session = s.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{settings.frontend_url}/user/billing",
    )
    return session.url


# ── Webhook Handler ───────────────────────────────────────────────────────────

async def handle_webhook(payload: bytes, sig_header: str, db: AsyncSession) -> None:
    """
    Verarbeitet Stripe-Webhook-Events.
    Alle Events werden mit Signatur-Verifikation geprüft.
    """
    s = _stripe()
    try:
        event = s.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
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


async def handle_stripe_event(event: dict, db: AsyncSession) -> None:
    """
    Verarbeitet ein Stripe-Event-Objekt ohne Signaturprüfung.
    Wird von n8n aufgerufen (n8n hat das Event bereits von Stripe empfangen).
    """
    etype = event.get("type", "")
    _log.info("n8n Stripe Event: %s", etype)

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
    else:
        _log.info("n8n Stripe Event ignoriert: %s", etype)


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


# ── Token-Quota ───────────────────────────────────────────────────────────────

async def check_quota(customer: Customer, db: AsyncSession) -> None:
    """
    Prüft VOR dem API-Call ob der Kunde noch ein Kontingent hat.
    Wirft HTTPException 402 wenn sowohl Abo-Kontingent als auch Wallet erschöpft.

    Logik:
      - Innerhalb Abo-Kontingent → frei
      - Über Kontingent, aber Wallet > 0 → Overage erlaubt
      - Über Kontingent UND Wallet leer → 402
      - Kein Plan + Wallet > 0 → pay-as-you-go erlaubt
      - Kein Plan + Wallet leer → 402
    """
    from fastapi import HTTPException

    plan: SubscriptionPlan | None = None
    if customer.subscription_plan_id:
        plan = await db.get(SubscriptionPlan, customer.subscription_plan_id)

    used = customer.tokens_used_this_period or 0
    included = plan.included_tokens if plan else 0
    balance = float(customer.token_balance_chf or 0)

    within_quota = included > 0 and used < included
    has_wallet = balance > 0

    if not within_quota and not has_wallet:
        if plan:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Dein monatliches Kontingent von {included:,} Tokens ist aufgebraucht "
                    f"und dein Wallet-Guthaben beträgt CHF 0.00. "
                    "Bitte lade dein Guthaben auf oder warte bis zum nächsten Abrechnungsmonat."
                ),
            )
        else:
            raise HTTPException(
                status_code=402,
                detail=(
                    "Kein aktives Abo und kein Wallet-Guthaben vorhanden. "
                    "Bitte wähle ein Abo oder lade dein Guthaben auf."
                ),
            )


async def check_and_bill_tokens(
    customer: Customer,
    tokens_used: int,
    db: AsyncSession,
) -> None:
    """
    Wird nach jedem Chat-Turn aufgerufen.
    - Addiert tokens_used_this_period
    - Wenn über Kontingent: berechnet Overage-Kosten
    - Zieht CHF vom Prepaid-Guthaben ab
    - Wenn Guthaben leer: subscription_status → 'quota_exceeded' (noch kein Block, nur Warnung)
    """
    if tokens_used <= 0:
        return

    # Token-Zähler erhöhen
    customer.tokens_used_this_period = (customer.tokens_used_this_period or 0) + tokens_used

    plan: SubscriptionPlan | None = None
    if customer.subscription_plan_id:
        plan = await db.get(SubscriptionPlan, customer.subscription_plan_id)

    included = plan.included_tokens if plan else 0
    overage_tokens = max(0, customer.tokens_used_this_period - included)

    if overage_tokens > 0 and plan:
        # CHF pro 1k Token
        rate = float(plan.token_overage_chf_per_1k or 0.002)
        overage_chf = round((overage_tokens / 1000) * rate, 4)

        balance = float(customer.token_balance_chf or 0)
        if balance >= overage_chf:
            customer.token_balance_chf = Decimal(str(balance)) - Decimal(str(overage_chf))
            _log.debug(
                "Overage %d tokens = CHF %.4f abgezogen (Guthaben: CHF %.4f → CHF %.4f)",
                overage_tokens, overage_chf, balance, float(customer.token_balance_chf),
            )
        else:
            _log.warning(
                "Kunde %s hat ungenügendes Guthaben für Overage (%.4f CHF fehlen)",
                customer.id, overage_chf - balance,
            )

    await db.commit()

    # Auto-Topup: Wenn Guthaben unter Schwellwert und Auto-Topup aktiv
    await _maybe_auto_topup(customer, db)


async def _maybe_auto_topup(customer: Customer, db: AsyncSession) -> None:
    """Löst automatischen Topup aus wenn Guthaben unter Schwellwert fällt."""
    if not customer.auto_topup_enabled:
        return
    balance = float(customer.token_balance_chf or 0)
    threshold = float(customer.auto_topup_threshold_chf or 5.0)
    if balance >= threshold:
        return
    amount = float(customer.auto_topup_amount_chf or 20.0)
    _log.info("Auto-Topup: Kunde %s (Guthaben %.2f < Schwellwert %.2f) → CHF %.2f",
              customer.id, balance, threshold, amount)
    try:
        # Stripe: direkte Zahlung via gespeicherte Karte (kein Checkout-Redirect)
        if customer.stripe_payment_method_id and customer.stripe_customer_id:
            s = _stripe()
            intent = s.PaymentIntent.create(
                amount=int(round(amount * 100)),
                currency="chf",
                customer=customer.stripe_customer_id,
                payment_method=customer.stripe_payment_method_id,
                confirm=True,
                off_session=True,
                metadata={
                    "customer_id": str(customer.id),
                    "topup_amount_chf": str(amount),
                    "source": "auto_topup",
                },
            )
            if intent.status == "succeeded":
                customer.token_balance_chf = Decimal(str(balance)) + Decimal(str(amount))
                net, vat = calc_vat(amount)
                inv_no = await next_invoice_number(db)
                db.add(Payment(
                    invoice_number=inv_no,
                    customer_id=str(customer.id),
                    stripe_payment_intent_id=intent.id,
                    amount_chf=amount,
                    vat_chf=vat,
                    amount_net_chf=net,
                    description=f"Baddi Wallet Auto-Topup CHF {amount:.2f}",
                    payment_type="auto_topup",
                    status="succeeded",
                    paid_at=datetime.utcnow(),
                ))
                await db.commit()
                _log.info("Auto-Topup erfolgreich: CHF %.2f → Guthaben jetzt CHF %.2f",
                          amount, float(customer.token_balance_chf))
        else:
            _log.warning("Auto-Topup: Keine gespeicherte Karte für Kunde %s", customer.id)
    except Exception as e:
        _log.error("Auto-Topup fehlgeschlagen für Kunde %s: %s", customer.id, e)


# ── Wallet-Ausgabe buchen ─────────────────────────────────────────────────────

async def wallet_debit(
    customer: Customer,
    amount_chf: float,
    description: str,
    db: AsyncSession,
) -> None:
    """
    Zieht CHF vom Wallet ab (externe Zahlung im Namen des Kunden).
    Prüft Monatslimit + pro-Transaktion-Limit.
    Wirft ValueError wenn Guthaben oder Limits überschritten.
    """
    from decimal import Decimal as D

    # Monatszähler zurücksetzen falls neuer Monat
    now = datetime.utcnow()
    reset_at = customer.wallet_month_reset_at
    if reset_at is None or reset_at.month != now.month or reset_at.year != now.year:
        customer.wallet_monthly_spent_chf = D("0")
        customer.wallet_month_reset_at = now

    balance = float(customer.token_balance_chf or 0)
    monthly_limit = float(customer.wallet_monthly_limit_chf or 100)
    per_tx_limit = float(customer.wallet_per_tx_limit_chf or 50)
    monthly_spent = float(customer.wallet_monthly_spent_chf or 0)

    if amount_chf > per_tx_limit:
        raise ValueError(f"Betrag CHF {amount_chf:.2f} überschreitet Transaktion-Limit CHF {per_tx_limit:.2f}.")
    if monthly_spent + amount_chf > monthly_limit:
        raise ValueError(f"Monats-Ausgabelimit CHF {monthly_limit:.2f} würde überschritten (bereits CHF {monthly_spent:.2f} ausgegeben).")
    if balance < amount_chf:
        raise ValueError(f"Guthaben CHF {balance:.2f} reicht nicht für CHF {amount_chf:.2f}.")

    customer.token_balance_chf = D(str(balance)) - D(str(amount_chf))
    customer.wallet_monthly_spent_chf = D(str(monthly_spent)) + D(str(amount_chf))

    net, vat = calc_vat(amount_chf)
    inv_no = await next_invoice_number(db)
    db.add(Payment(
        invoice_number=inv_no,
        customer_id=str(customer.id),
        amount_chf=amount_chf,
        vat_chf=vat,
        amount_net_chf=net,
        description=description,
        payment_type="wallet_debit",
        status="succeeded",
        paid_at=datetime.utcnow(),
    ))
    await db.commit()
    await _maybe_auto_topup(customer, db)


# ── Banküberweisung: Referenznummer generieren ────────────────────────────────

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
    ts = datetime.utcnow().strftime("%m%d%H%M")
    return f"BAD-{short_id}-{ts}"
