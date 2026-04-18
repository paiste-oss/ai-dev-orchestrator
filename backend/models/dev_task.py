import uuid
from datetime import datetime,timezone
from sqlalchemy import String, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class DevTask(Base):
    """
    Aufgaben-Warteschlange für den AI Dev Orchestrator.

    Claude arbeitet Aufgaben der Reihe nach ab (priority, created_at).
    Bei API-Rate-Limit wird der Status auf "paused" gesetzt und retry_after
    gespeichert. Celery-Beat prüft alle 30 Sekunden und nimmt die Aufgabe
    automatisch wieder auf sobald das Limit abgelaufen ist.

    context_snapshot speichert den Gesprächsverlauf (messages-Array) damit
    Claude genau dort weitermacht wo es aufgehört hat.
    """
    __tablename__ = "dev_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)  # volle Aufgabenbeschreibung für Claude
    priority: Mapped[int] = mapped_column(Integer, default=10)       # niedrig = höhere Priorität

    # Status-Lifecycle: pending → running → completed | failed | paused → pending → ...
    status: Mapped[str] = mapped_column(String, default="pending")   # pending | running | completed | failed | paused | cancelled

    output: Mapped[str | None] = mapped_column(Text, nullable=True)  # akkumulierter Log was Claude getan hat
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    context_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)   # messages-Array für Resume
    retry_after: Mapped[datetime | None] = mapped_column(DateTime, nullable=True) # wann nach Pause weitermachen
    token_usage: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
