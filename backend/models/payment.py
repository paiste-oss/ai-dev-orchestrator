"""
Payment Model — Zahlungshistorie pro Kunde.

Jede erfolgreiche oder fehlgeschlagene Zahlung wird hier gespeichert.
Dient als Audit-Log + Basis für Rechnungs-PDFs.

Rechnungsnummer-Format: BAD-YYYY-NNNNNN (z.B. BAD-2026-000001)
"""
import uuid
from datetime import datetime,timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Numeric, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from core.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_number: Mapped[str | None] = mapped_column(String(30), nullable=True, unique=True)  # BAD-2026-000001

    customer_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("customers.id"), nullable=False, index=True)

    # Stripe-Referenzen
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    stripe_invoice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Betrag
    amount_chf: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    vat_chf: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)    # MwSt 8.1%
    amount_net_chf: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)  # Netto

    # Beschreibung
    description: Mapped[str] = mapped_column(Text, nullable=False)         # z.B. "Baddi Komfort — Januar 2026"
    payment_type: Mapped[str] = mapped_column(String(30), default="subscription")  # subscription | topup | overage

    # Status
    status: Mapped[str] = mapped_column(String(20), default="pending")     # pending | succeeded | failed | refunded

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class InvoiceCounter(Base):
    """Fortlaufende Rechnungsnummer pro Jahr — gesetzlich erforderlich."""
    __tablename__ = "invoice_counters"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)
