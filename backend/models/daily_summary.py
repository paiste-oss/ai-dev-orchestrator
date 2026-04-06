import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class DailySummary(Base):
    """Tägliche Projekt-Zusammenfassung, generiert via Celery Beat um 20:00."""

    __tablename__ = "daily_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
