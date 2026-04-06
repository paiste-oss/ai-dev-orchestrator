import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, String, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class SupportTicket(Base):
    """Eingehende Support-Emails — klassifiziert und geroutet via n8n."""

    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)  # BADDI-20260406-0001
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    email_from: Mapped[str] = mapped_column(String(300), nullable=False)
    email_subject: Mapped[str] = mapped_column(String(500), nullable=False)
    email_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    kategorie: Mapped[str] = mapped_column(String(30), nullable=False, default="support")
    dringlichkeit: Mapped[str] = mapped_column(String(10), nullable=False, default="mittel")
    confidence: Mapped[float] = mapped_column(nullable=False, default=0.0)
    zusammenfassung: Mapped[str] = mapped_column(Text, nullable=False, default="")
    antwort_entwurf: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="offen")  # offen | beantwortet | geschlossen
    auto_replied: Mapped[bool] = mapped_column(nullable=False, default=False)
