"""
PatentGlobalIndex — Phase A.4: Publication-Number-keyed Pool für Patente.

Patente sind per Definition öffentlich. Wir liefern primär clickable Links
zu Google Patents/Espacenet/USPTO; volle Metadaten via EPO OPS / Lens.org
bei API-Key-Konfiguration.
"""
from datetime import date, datetime
from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class PatentGlobalIndex(Base):
    __tablename__ = "patent_global_index"

    publication_number: Mapped[str] = mapped_column(String(64), primary_key=True)
    country_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    kind_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    inventors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    assignees: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    application_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    classifications: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    google_patents_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    espacenet_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    uspto_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    epo_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    source: Mapped[str] = mapped_column(String(32), default="user_input", server_default="user_input")
    enrichment_status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    enrichment_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default="now()")
    last_enriched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<PatentGlobalIndex pn={self.publication_number} status={self.enrichment_status}>"
