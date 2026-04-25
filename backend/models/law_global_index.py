"""
LawGlobalIndex — Phase A.3: SR-Nummer-keyed Pool für Schweizer Bundesgesetze
via Fedlex. Alle Bundesgesetze sind frei verfügbar (PDF + HTML).
"""
from datetime import date, datetime
from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class LawGlobalIndex(Base):
    __tablename__ = "law_global_index"

    sr_number: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    short_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    abbreviation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    language: Mapped[str] = mapped_column(String(16), default="de", server_default="de")

    enacted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    in_force_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)

    html_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    eli_uri: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    fedlex_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    source: Mapped[str] = mapped_column(String(32), default="fedlex", server_default="fedlex")
    enrichment_status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    enrichment_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default="now()")
    last_enriched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<LawGlobalIndex sr={self.sr_number} status={self.enrichment_status}>"
