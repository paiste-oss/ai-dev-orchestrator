"""SQLAlchemy Model für Whiteboard/Window-Daten."""
import uuid
from datetime import datetime,timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class WindowBoard(Base):
    __tablename__ = "window_boards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # nullable — Admin-Boards haben keinen Customer
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="Neues Board")
    board_type: Mapped[str] = mapped_column(String(50), default="whiteboard")
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    customer: Mapped["Customer | None"] = relationship("Customer")  # type: ignore
