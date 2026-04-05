"""
Token Quota — Token-Kontingent prüfen und Overage-Abrechnung.

Verantwortlich für:
- check_quota: Vor API-Call prüfen ob Kontingent vorhanden
- check_and_bill_tokens: Nach Chat-Turn Tokens abrechnen
- wallet_debit: Direkte CHF-Abbuchung vom Wallet
- _maybe_auto_topup: Automatischer Topup wenn Guthaben unter Schwellwert
"""
from __future__ import annotations
import logging
from datetime import datetime,timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from models.customer import Customer, SubscriptionPlan
from models.payment import Payment
from services.invoice_service import next_invoice_number, calc_vat

_log = logging.getLogger(__name__)


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

    # Admins haben unbegrenzten Zugang (zum Testen)
    if customer.role == "admin":
        return

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
            from services.stripe_client import _stripe
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
                    paid_at=datetime.now(timezone.utc).replace(tzinfo=None),
                ))
                await db.commit()
                _log.info("Auto-Topup erfolgreich: CHF %.2f → Guthaben jetzt CHF %.2f",
                          amount, float(customer.token_balance_chf))
        else:
            _log.warning("Auto-Topup: Keine gespeicherte Karte für Kunde %s", customer.id)
    except Exception as e:
        _log.error("Auto-Topup fehlgeschlagen für Kunde %s: %s", customer.id, e)


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
    now = datetime.now(timezone.utc).replace(tzinfo=None)
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
        paid_at=datetime.now(timezone.utc).replace(tzinfo=None),
    ))
    await db.commit()
    await _maybe_auto_topup(customer, db)
