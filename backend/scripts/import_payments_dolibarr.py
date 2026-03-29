"""
Import historischer Zahlungen nach Dolibarr.
Usage: docker exec ai_backend python scripts/import_payments_dolibarr.py
"""
import asyncio
import sys
import os
sys.path.insert(0, "/app")
os.chdir("/app")

import logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

from sqlalchemy import select
from core.database import AsyncSessionLocal
from models.payment import Payment
from models.customer import Customer
from services.dolibarr_service import record_stripe_payment


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Payment).where(Payment.status == "succeeded").order_by(Payment.paid_at)
        )
        payments = result.scalars().all()

        rows = []
        for p in payments:
            c = await db.get(Customer, p.customer_id) if p.customer_id else None
            rows.append((p, c))

    print(f"Importiere {len(rows)} Zahlungen nach Dolibarr...\n")

    ok = 0
    fail = 0
    for payment, customer in rows:
        name = (customer.name if customer else None) or "Unbekannt"
        email = (customer.email if customer else None) or f"unknown_{payment.customer_id}@baddi.ch"
        desc = payment.description or f"Baddi Zahlung {payment.invoice_number}"

        print(f"  [{payment.invoice_number}] {name} — CHF {payment.amount_chf:.2f} ({payment.payment_type})")
        try:
            await record_stripe_payment(
                customer_name=name,
                customer_email=email,
                amount_chf=float(payment.amount_chf),
                amount_net_chf=float(payment.amount_net_chf),
                vat_chf=float(payment.vat_chf),
                description=desc,
                invoice_number=payment.invoice_number,
                stripe_invoice_id=payment.stripe_invoice_id,
            )
            print(f"    ✓ OK")
            ok += 1
        except Exception as e:
            print(f"    ✗ FEHLER: {e}")
            fail += 1

    print(f"\nFertig: {ok} erfolgreich, {fail} fehlgeschlagen")
    print("Prüfe Dolibarr unter http://localhost:8080 → Faktura → Rechnungen")


asyncio.run(main())
