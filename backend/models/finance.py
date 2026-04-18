import uuid
from datetime import datetime,timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Float, Boolean, DateTime
from core.database import Base


class CostEntry(Base):
    __tablename__ = "cost_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    provider: Mapped[str] = mapped_column(String, nullable=False)          # "Google", "OpenAI", …
    category: Mapped[str] = mapped_column(String, nullable=False)          # api | abo | infrastruktur | entwicklung | sonstiges
    billing_cycle: Mapped[str] = mapped_column(String, nullable=False)     # monatlich | jährlich | einmalig | nutzungsbasiert
    amount_original: Mapped[float] = mapped_column(Float, default=0.0)    # in original currency
    currency: Mapped[str] = mapped_column(String, default="CHF")           # CHF | USD | EUR
    amount_chf_monthly: Mapped[float] = mapped_column(Float, default=0.0) # normalized to CHF/month (estimate)
    url: Mapped[str | None] = mapped_column(String, nullable=True)         # billing dashboard
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    balance_chf: Mapped[float | None] = mapped_column(Float, nullable=True)          # manual: current account balance
    balance_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String, nullable=True)        # kreditkarte | twint | rechnung | bar
    card_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)         # letzte 4 Ziffern der Kreditkarte
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())
