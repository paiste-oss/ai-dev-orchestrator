"""
LiteratureGlobalIndex — Phase A: globaler, customer-unabhängiger Pool.

Strikt nur Metadaten (Titel, Autoren, Abstract, OA-Link). Keine PDFs, kein
extracted_text — die liegen pro Kunde in `literature_entries`. Schlüssel ist
der DOI (lowercase, ohne URL-Prefix).
"""
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class LiteratureGlobalIndex(Base):
    __tablename__ = "literature_global_index"

    doi: Mapped[str] = mapped_column(String(512), primary_key=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    authors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    journal: Mapped[str | None] = mapped_column(String(512), nullable=True)
    volume: Mapped[str | None] = mapped_column(String(64), nullable=True)
    issue: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pages: Mapped[str | None] = mapped_column(String(64), nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(512), nullable=True)
    entry_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(256), nullable=True)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Unpaywall — Open Access
    oa_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    oa_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    oa_license: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Roh-Cache der API-Antworten — für spätere Re-Auswertung (Felder die wir
    # heute noch nicht extrahieren) ohne erneuten Crossref/Unpaywall-Call
    crossref_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    unpaywall_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    source: Mapped[str] = mapped_column(String(32), default="user_doi", server_default="user_doi")
    enrichment_status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    enrichment_error: Mapped[str | None] = mapped_column(String(512), nullable=True)

    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default="now()")
    last_enriched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<LiteratureGlobalIndex doi={self.doi} status={self.enrichment_status}>"
