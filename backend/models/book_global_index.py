"""
BookGlobalIndex — Phase A.3: ISBN-keyed Buch-Pool aus OpenLibrary + DOAB.

OA-Bücher (DOAB) bekommen einen direct-download-Link in `oa_url`. Sonst
liefert OpenLibrary nur Metadaten + Cover.
"""
from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class BookGlobalIndex(Base):
    __tablename__ = "book_global_index"

    isbn: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtitle: Mapped[str | None] = mapped_column(Text, nullable=True)
    authors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(512), nullable=True)
    edition: Mapped[str | None] = mapped_column(String(64), nullable=True)
    language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    oa_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    oa_license: Mapped[str | None] = mapped_column(String(64), nullable=True)
    oa_publisher: Mapped[str | None] = mapped_column(String(512), nullable=True)

    openlibrary_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    doab_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    source: Mapped[str] = mapped_column(String(32), default="user_isbn", server_default="user_isbn")
    enrichment_status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    enrichment_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default="now()")
    last_enriched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<BookGlobalIndex isbn={self.isbn} status={self.enrichment_status}>"
