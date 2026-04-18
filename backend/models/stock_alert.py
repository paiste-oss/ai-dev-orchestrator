import uuid
from datetime import datetime,timezone
from sqlalchemy import String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class StockAlert(Base):
    __tablename__ = "stock_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)       # Benachrichtigungs-E-Mail
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)       # z.B. "HOLN.SW"
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)       # Kurs-Schwellwert
    direction: Mapped[str] = mapped_column(String(10), nullable=False)    # "above" | "below"
    currency: Mapped[str] = mapped_column(String(10), default="CHF")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # letzter Trigger
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())
