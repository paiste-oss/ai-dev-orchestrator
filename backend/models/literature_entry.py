"""
LiteratureEntry Model — persönliche Literaturdatenbank pro Kunde.
Unterstützt Paper (Zeitschriftenartikel) und Bücher.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


# Many-to-many: ein Eintrag kann in mehreren Gruppen/Ordnern liegen
literature_entry_groups = Table(
    "literature_entry_groups",
    Base.metadata,
    Column("entry_id", UUID(as_uuid=True), ForeignKey("literature_entries.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id", UUID(as_uuid=True), ForeignKey("literature_groups.id", ondelete="CASCADE"), primary_key=True),
)


class LiteratureEntry(Base):
    __tablename__ = "literature_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )

    # Typ: paper | book | patent
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
    isbn: Mapped[str | None] = mapped_column(String(256), nullable=True)
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

    # User-Flags
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    read_later: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Backup vor letztem 'Metadaten aus PDF verbessern' (für Undo)
    metadata_backup: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_backup_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Job-ID des Bulk-Refresh, falls Backup von einem Bulk-Lauf stammt (für granulares Bulk-Undo)
    metadata_backup_job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Wie oft wurde 'Metadaten aus PDF verbessern' auf diesen Eintrag angewendet
    # (Bulk-Lauf überspringt Einträge ≥ 1, ausser User erzwingt force=True).
    meta_refreshed_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    meta_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Herkunft: manual | ris | endnote_xml
    import_source: Mapped[str] = mapped_column(String(32), default="manual")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer: Mapped["Customer"] = relationship(back_populates="literature_entries")  # type: ignore

    # Many-to-many: Gruppen/Ordner-Zuordnung
    groups: Mapped[list["LiteratureGroup"]] = relationship(  # type: ignore
        secondary=literature_entry_groups,
        back_populates="entries",
        lazy="selectin",
    )

    @property
    def group_ids(self) -> list[uuid.UUID]:
        """Pydantic from_attributes greift hier zu für LiteratureEntryOut."""
        return [g.id for g in (self.groups or [])]

    @property
    def has_meta_backup(self) -> bool:
        return self.metadata_backup is not None

    def __repr__(self) -> str:
        return f"<LiteratureEntry id={self.id} type={self.entry_type} title={self.title[:40]!r}>"
