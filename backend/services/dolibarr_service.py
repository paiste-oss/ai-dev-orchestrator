"""
Dolibarr ERP Service — Zahlungen automatisch in die Buchhaltung übertragen.

Ablauf bei jeder Stripe-Zahlung:
  1. Dolibarr-Kunde suchen oder anlegen (Thirdparty)
  2. Rechnung erstellen und validieren
  3. Zahlung zur Rechnung buchen

Dolibarr REST API: {DOLIBARR_URL}/api/index.php/...
Auth: Header DOLAPIKEY
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from core.config import settings

_log = logging.getLogger(__name__)

_HEADERS = lambda: {
    "DOLAPIKEY": settings.dolibarr_api_key,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# Nicht MWST-pflichtig (unter CHF 100k Umsatz)
_VAT_RATE = 0

# Dolibarr-Zahlungsmodus — "CB" = Kreditkarte/online, ID wird beim ersten Aufruf gecacht
_PAYMENT_MODE_CODE = "CB"


async def record_stripe_payment(
    customer_name: str,
    customer_email: str,
    amount_chf: float,
    amount_net_chf: float,
    vat_chf: float,
    description: str,
    invoice_number: str,
    stripe_invoice_id: str | None = None,
) -> None:
    """
    Legt in Dolibarr an:
      - Kunde (falls noch nicht vorhanden)
      - Rechnung (validiert)
      - Zahlung

    Alle Fehler werden geloggt aber nicht weitergegeben —
    ein Dolibarr-Fehler darf den Stripe-Webhook nicht blockieren.
    """
    if not settings.dolibarr_api_key:
        _log.debug("Dolibarr API-Key nicht konfiguriert — überspringe Buchung")
        return

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            third_id = await _find_or_create_thirdparty(client, customer_name, customer_email)
            inv_id = await _create_invoice(
                client, third_id, amount_chf, amount_net_chf, vat_chf,
                description, invoice_number, stripe_invoice_id
            )
            await _validate_invoice(client, inv_id)
            await _add_payment(client, inv_id, amount_chf)
            _log.info("Dolibarr: Buchung erfolgreich — Rechnung %s, CHF %.2f", invoice_number, amount_chf)
    except Exception as e:
        _log.warning("Dolibarr: Buchung fehlgeschlagen — %s", e)


async def _find_or_create_thirdparty(client: httpx.AsyncClient, name: str, email: str) -> int:
    """Sucht nach einem bestehenden Kunden, legt ihn bei Bedarf neu an."""
    # Suche nach E-Mail
    resp = await client.get(
        f"{settings.dolibarr_url}/thirdparties",
        headers=_HEADERS(),
        params={"email": email, "limit": 1},
    )
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list) and data:
            return int(data[0]["id"])

    # Neu anlegen
    payload = {
        "name": name or email,
        "email": email,
        "client": 1,          # 1 = Kunde
        "status": 1,          # aktiv
        "country_code": "CH",
        "tva_assuj": 0,        # kein MWST-pflichtig (Privatkunde)
        "typent_code": "TE_PRIVATE",
    }
    resp = await client.post(f"{settings.dolibarr_url}/thirdparties", headers=_HEADERS(), json=payload)
    resp.raise_for_status()
    return int(resp.json())


async def _create_invoice(
    client: httpx.AsyncClient,
    third_id: int,
    amount_chf: float,
    amount_net_chf: float,
    vat_chf: float,
    description: str,
    invoice_number: str,
    stripe_invoice_id: str | None,
) -> int:
    """Erstellt eine Rechnung in Dolibarr (Status draft)."""
    note = f"Stripe Rechnung: {stripe_invoice_id}" if stripe_invoice_id else ""
    payload = {
        "socid": third_id,
        "ref_client": invoice_number,
        "date": int(datetime.now(timezone.utc).timestamp()),
        "note_public": note,
        "lines": [
            {
                "desc": description,
                "qty": 1,
                "subprice": round(amount_net_chf, 2),   # Nettobetrag
                "tva_tx": _VAT_RATE,                    # 8.1%
                "product_type": 1,                      # 1 = Service
                "accountancy_code_sell": "3000",        # Erlöskonto
            }
        ],
    }
    resp = await client.post(f"{settings.dolibarr_url}/invoices", headers=_HEADERS(), json=payload)
    resp.raise_for_status()
    return int(resp.json())


async def _validate_invoice(client: httpx.AsyncClient, inv_id: int) -> None:
    """Stellt die Rechnung von 'Entwurf' auf 'Offen' (validiert)."""
    resp = await client.post(
        f"{settings.dolibarr_url}/invoices/{inv_id}/validate",
        headers=_HEADERS(),
        json={},
    )
    # 200 oder 201 = OK
    if resp.status_code not in (200, 201):
        _log.warning("Dolibarr: Rechnung %s konnte nicht validiert werden: %s", inv_id, resp.text[:200])


async def _add_payment(client: httpx.AsyncClient, inv_id: int, amount_chf: float) -> None:
    """Bucht die Zahlung zur Rechnung."""
    payload = {
        "datepaye": int(datetime.now(timezone.utc).timestamp()),
        "paymentid": 6,         # 6 = CB (Kreditkarte/Online)
        "accountid": 1,         # Bankkonto "Stripe Einnahmen"
        "closepaidinvoices": "yes",
        "amounts": {str(inv_id): round(amount_chf, 2)},
    }
    resp = await client.post(
        f"{settings.dolibarr_url}/invoices/{inv_id}/payments",
        headers=_HEADERS(),
        json=payload,
    )
    if resp.status_code not in (200, 201):
        _log.warning("Dolibarr: Zahlung für Rechnung %s fehlgeschlagen: %s", inv_id, resp.text[:200])
