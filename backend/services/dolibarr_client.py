"""
Dolibarr REST API Client — Lieferantenrechnungen verwalten.

Verwendet die Dolibarr REST API unter DOLIBARR_URL.
API-Key kommt aus den Settings (DOLIBARR_API_KEY).
"""
import logging
from datetime import date
from typing import Any

import httpx

from core.config import settings

_log = logging.getLogger(__name__)


def _headers() -> dict[str, str]:
    return {
        "DOLAPIKEY": settings.dolibarr_api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _base() -> str:
    return settings.dolibarr_url.rstrip("/")


async def find_supplier(name: str) -> int | None:
    """Sucht Lieferant nach Name. Gibt socid zurück oder None."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{_base()}/thirdparties",
                headers=_headers(),
                params={"search_name": name, "mode": 2, "limit": 5},
            )
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list) and data:
                    return int(data[0]["id"])
    except Exception as e:
        _log.warning("Dolibarr find_supplier Fehler: %s", e)
    return None


async def create_supplier(name: str, address: str = "", zip_code: str = "", town: str = "") -> int:
    """Legt neuen Lieferanten an. Gibt socid zurück."""
    payload: dict[str, Any] = {
        "name": name,
        "fournisseur": 1,
        "client": 0,
        "address": address,
        "zip": zip_code,
        "town": town,
        "country_id": 206,  # Schweiz
    }
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{_base()}/thirdparties", headers=_headers(), json=payload)
        r.raise_for_status()
        return int(r.json())


async def create_supplier_invoice(
    socid: int,
    ref_supplier: str,
    invoice_date: date,
    due_date: date | None,
    lines: list[dict[str, Any]],
    note: str = "",
) -> int:
    """Erstellt Lieferantenrechnung als Entwurf. Gibt invoice-ID zurück."""
    payload: dict[str, Any] = {
        "socid": socid,
        "ref_supplier": ref_supplier,
        "date": int(invoice_date.strftime("%s")) if hasattr(invoice_date, "strftime") else 0,
        "date_echeance": int(due_date.strftime("%s")) if due_date else None,
        "note_public": note,
        "lines": lines,
        "status": 0,  # 0 = Entwurf
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{_base()}/supplierinvoices", headers=_headers(), json=payload)
        r.raise_for_status()
        return int(r.json())


async def get_invoice_url(invoice_id: int) -> str:
    """Gibt direkte URL zur Rechnung im Dolibarr zurück."""
    base = settings.dolibarr_url.replace("/api/index.php", "")
    return f"{base}/fourn/facture/card.php?id={invoice_id}"
