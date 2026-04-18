import uuid
from datetime import datetime,timezone
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class TrainingReminder(Base):
    __tablename__ = "training_reminders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    training_type: Mapped[str] = mapped_column(String(100), nullable=False)  # z.B. "Kraft", "Cardio"
    # {"monday": {"time": "07:00", "duration_minutes": 60}, "wednesday": {...}}
    weekly_schedule: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reminder_minutes_before: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Europe/Zurich")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_reminded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())
