import uuid
from datetime import datetime,timezone
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class ContentGuardLog(Base):
    __tablename__ = "content_guard_logs"

    id:          Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[str]       = mapped_column(String(36), nullable=False, index=True)
    message:     Mapped[str]       = mapped_column(Text, nullable=False)
    matched_pattern: Mapped[str | None] = mapped_column(String(200))
    ip_address:  Mapped[str | None] = mapped_column(String(60))
    created_at:  Mapped[datetime]  = mapped_column(DateTime, default=lambda: datetime.utcnow(), index=True)
