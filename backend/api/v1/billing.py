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
from fastapi import APIRouter

from .billing_plans import router as _plans_router
from .billing_checkout import router as _checkout_router
from .billing_wallet import router as _wallet_router
from .billing_invoices import router as _invoices_router

router = APIRouter(prefix="/billing", tags=["billing"])

router.include_router(_plans_router)
router.include_router(_checkout_router)
router.include_router(_wallet_router)
router.include_router(_invoices_router)
