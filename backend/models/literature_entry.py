"""
LiteratureEntry Model — persönliche Literaturdatenbank pro Kunde.
Unterstützt Paper (Zeitschriftenartikel) und Bücher.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class LiteratureEntry(Base):
    __tablename__ = "literature_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )

    # Typ: paper | book
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False, default="paper")

    # Pflichtfeld
    title: Mapped[str] = mapped_column(Text, nullable=False)

    # Autoren: ["Müller, H.", "Schmidt, A."]
    authors: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Paper-spezifisch
    journal: Mapped[str | None] = mapped_column(String(512), nullable=True)
    volume: Mapped[str | None] = mapped_column(String(64), nullable=True)
    issue: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pages: Mapped[str | None] = mapped_column(String(64), nullable=True)
    doi: Mapped[str | None] = mapped_column(String(512), nullable=True)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # Buch-spezifisch
    publisher: Mapped[str | None] = mapped_column(String(512), nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    edition: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Gemeinsam
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # PDF Anhang (optional)
    pdf_s3_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    pdf_size_bytes: Mapped[int] = mapped_column(Integer, default=0)

    # Text für Baddi / Qdrant (Abstract + Titel + Notizen)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    baddi_readable: Mapped[bool] = mapped_column(Boolean, default=True)
    qdrant_point_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Herkunft: manual | ris | endnote_xml
    import_source: Mapped[str] = mapped_column(String(32), default="manual")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer: Mapped["Customer"] = relationship(back_populates="literature_entries")  # type: ignore

    def __repr__(self) -> str:
        return f"<LiteratureEntry id={self.id} type={self.entry_type} title={self.title[:40]!r}>"
