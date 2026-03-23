"""
Billing Service — Rückwärtskompatible Re-Exporte.

Die eigentliche Logik ist aufgeteilt auf:
  services/stripe_client.py    — Stripe API-Aufrufe, Plan-Seeding
  services/webhook_handler.py  — Stripe Webhook-Events
  services/token_quota.py      — Token-Quota + Overage-Abrechnung
  services/invoice_service.py  — Rechnungsnummern + MwSt
"""
# Backwards compatibility — alle bisherigen Imports funktionieren weiterhin

from services.stripe_client import (
    _stripe,
    PLAN_DEFAULTS,
    seed_plans,
    get_or_create_stripe_customer,
    create_subscription_checkout,
    create_topup_checkout,
    create_billing_portal_session,
    add_storage_subscription_item,
    generate_bank_transfer_reference,
)

from services.webhook_handler import handle_webhook

from services.token_quota import (
    check_quota,
    check_and_bill_tokens,
    wallet_debit,
)

from services.invoice_service import (
    next_invoice_number,
    calc_vat,
)

__all__ = [
    "_stripe",
    "PLAN_DEFAULTS",
    "seed_plans",
    "get_or_create_stripe_customer",
    "create_subscription_checkout",
    "create_topup_checkout",
    "create_billing_portal_session",
    "add_storage_subscription_item",
    "generate_bank_transfer_reference",
    "handle_webhook",
    "check_quota",
    "check_and_bill_tokens",
    "wallet_debit",
    "next_invoice_number",
    "calc_vat",
]
