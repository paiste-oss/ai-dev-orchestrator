"""
Invoice Service — Rechnungsnummern und MwSt-Berechnung.

Verantwortlich für:
- Fortlaufende Rechnungsnummern vergeben (gesetzlich CH)
- MwSt-Berechnung (8.1% Schweiz)
"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from models.payment import InvoiceCounter

# Schweizer MwSt-Satz
_VAT_RATE = Decimal("0.081")


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


def calc_vat(gross_chf: float) -> tuple[float, float]:
    """Gibt (netto, mwst) zurück. Schweiz 8.1% inkl. MwSt."""
    gross = Decimal(str(gross_chf))
    net = (gross / (1 + _VAT_RATE)).quantize(Decimal("0.01"))
    vat = (gross - net).quantize(Decimal("0.01"))
    return float(net), float(vat)
