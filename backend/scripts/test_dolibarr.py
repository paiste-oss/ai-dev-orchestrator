"""
Test-Script: Dolibarr-Buchungsflow prüfen.
Führt den kompletten Flow durch: Kunde → Rechnung → Zahlung
Usage: docker exec ai_backend python scripts/test_dolibarr.py
"""
import asyncio
import sys
import os
sys.path.insert(0, "/app")
os.chdir("/app")

import logging
logging.basicConfig(level=logging.DEBUG)

from services.dolibarr_service import record_stripe_payment, _find_or_create_thirdparty
import httpx
from core.config import settings
from services.dolibarr_service import _HEADERS

async def main():
    print(f"Dolibarr URL: {settings.dolibarr_url}")
    print(f"API Key gesetzt: {'ja' if settings.dolibarr_api_key else 'NEIN'}")

    # Direkter Test der API
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{settings.dolibarr_url}/status", headers=_HEADERS())
        print(f"Status API: {resp.status_code} → {resp.text[:200]}")

        try:
            third_id = await _find_or_create_thirdparty(client, "Test Kunde AG", "test@baddi.ch")
            print(f"Kunde angelegt/gefunden: ID={third_id}")
        except Exception as e:
            print(f"FEHLER bei Kunde: {e}")

    print("Starte vollständige Test-Buchung...")
    await record_stripe_payment(
        customer_name="Test Kunde AG",
        customer_email="test@baddi.ch",
        amount_chf=19.00,
        amount_net_chf=17.57,
        vat_chf=1.43,
        description="Baddi Basis Abo — März 2026 (TEST)",
        invoice_number="BAD-2026-TEST001",
        stripe_invoice_id="in_test_123456",
    )
    print("Fertig — prüfe Dolibarr unter http://localhost:8080")

asyncio.run(main())
