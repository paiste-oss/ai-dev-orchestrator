import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Integer, Sequence
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

# Global sequence — garantiert atomare, lückenlose Nummern über alle Baddis
baddi_number_seq = Sequence("baddi_number_seq", start=0)


class AiBuddy(Base):
    __tablename__ = "ai_buddies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baddi_number: Mapped[int | None] = mapped_column(
        Integer,
        baddi_number_seq,
        server_default=baddi_number_seq.next_value(),
        unique=True,
        nullable=True,   # nullable für bestehende Rows die noch keine Nummer haben
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    segment: Mapped[str] = mapped_column(String, default="personal")  # elderly, corporate, personal
    persona_config: Mapped[dict] = mapped_column(JSONB, default=lambda: {
        "tone": "warm",
        "language": "de",
        "preferred_model": "mistral",
        "fallback_model": "claude-sonnet-4-6",
        "system_prompt_template": "Du bist {name}, ein freundlicher KI-Begleiter.",
        "capabilities": ["conversation"],
    })
    usecase_id: Mapped[str | None] = mapped_column(String, nullable=True)   # z.B. "silberperlen", "firma", "funktion-dokumente"
    n8n_workflow_id: Mapped[str | None] = mapped_column(String, nullable=True)
    qdrant_collection: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    @property
    def baddi_id(self) -> str | None:
        if self.baddi_number is None:
            return None
        return f"baddiD_{self.baddi_number}"

    customer: Mapped["Customer"] = relationship(back_populates="buddies")
    threads: Mapped[list["ConversationThread"]] = relationship(back_populates="buddy")
    tools: Mapped[list["BuddyTool"]] = relationship(back_populates="buddy", cascade="all, delete-orphan")


class ConversationThread(Base):
    __tablename__ = "conversation_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buddy_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_buddies.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_message_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    buddy: Mapped["AiBuddy"] = relationship(back_populates="threads")
    messages: Mapped[list["Message"]] = relationship(back_populates="thread")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation_threads.id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # user, assistant, system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    tokens_used: Mapped[int] = mapped_column(default=0)

    thread: Mapped["ConversationThread"] = relationship(back_populates="messages")
