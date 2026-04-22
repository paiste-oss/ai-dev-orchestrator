import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class DeviceToken(Base):
    """FCM Push-Token eines Geräts.

    Ein User kann mehrere Geräte haben (iPhone + Android-Tablet etc.).
    Pro Gerät gibt es genau einen Token — bei erneutem Register wird
    updated_at aktualisiert (UPSERT via unique constraint).
    """

    __tablename__ = "device_tokens"
    __table_args__ = (
        # Pro User+Token nur ein Eintrag — verhindert Duplikate bei wiederholtem App-Start
        UniqueConstraint("customer_id", "token", name="uq_device_token_customer_token"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[str] = mapped_column(String(512), nullable=False)
    platform: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown"
    )  # "ios" | "android" | "web"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    customer: Mapped["Customer"] = relationship(back_populates="device_tokens")  # type: ignore[name-defined]
