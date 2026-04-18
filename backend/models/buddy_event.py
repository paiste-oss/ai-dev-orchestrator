import uuid
from datetime import datetime,timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class BuddyEvent(Base):
    __tablename__ = "buddy_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Quelle
    source: Mapped[str] = mapped_column(String, nullable=False)        # email|calendar|news|weather|government
    source_id: Mapped[str] = mapped_column(String, nullable=False)     # Dedup-Key von n8n
    summary: Mapped[str] = mapped_column(Text, nullable=False)         # Kurze Zusammenfassung von n8n
    priority: Mapped[str] = mapped_column(String, default="medium")    # low|medium|high|urgent
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)     # Vollständiger n8n-Payload

    # Ziel
    buddy_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_buddies.id"), nullable=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)

    # Buddy-Entscheidung
    relevance_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    decision: Mapped[str] = mapped_column(String, default="pending")   # pending|relevant|ignored
    action_taken: Mapped[str | None] = mapped_column(String, nullable=True)    # notify|remind|alert|None
    llm_message: Mapped[str | None] = mapped_column(Text, nullable=True)       # Was der Buddy sagen würde
    llm_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)     # Begründung

    # Status
    pushed_to_sse: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
