"""
Billing Invoices — Zahlungshistorie.

Endpunkte:
  GET /billing/invoices — Zahlungshistorie des eingeloggten Kunden
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.payment import Payment

from .billing_schemas import InvoiceOut

router = APIRouter()


# ── Zahlungshistorie ───────────────────────────────────────────────────────────

@router.get("/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment)
        .where(Payment.customer_id == str(customer.id))
        .order_by(Payment.created_at.desc())
        .limit(50)
    )
    payments = result.scalars().all()
    return [
        InvoiceOut(
            id=str(p.id),
            invoice_number=p.invoice_number,
            amount_chf=float(p.amount_chf),
            vat_chf=float(p.vat_chf or 0),
            amount_net_chf=float(p.amount_net_chf or 0),
            description=p.description,
            payment_type=p.payment_type,
            status=p.status,
            created_at=p.created_at.isoformat(),
            paid_at=p.paid_at.isoformat() if p.paid_at else None,
        )
        for p in payments
    ]
