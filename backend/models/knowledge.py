"""
Globale Wissensdatenbank — SQLAlchemy-Modelle

KnowledgeSource: Verwaltete Datenquellen (Fedlex, Wikipedia, ArXiv, ...)
KnowledgeDocument: Jedes indexierte Dokument mit Chunk-Referenzen
"""
import uuid
from datetime import datetime,timezone
from sqlalchemy import String, DateTime, Text, Integer, Boolean, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # law / paper / wikipedia / book
    domain: Mapped[str] = mapped_column(
        String(64), nullable=False, default="allgemein"
    )  # recht_ch / recht_eu / wissenschaft / allgemein
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="de")
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_crawled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    doc_count: Mapped[int] = mapped_column(Integer, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    crawl_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow()
    )

    def __repr__(self) -> str:
        return f"<KnowledgeSource {self.name} ({self.source_type})>"


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(1024), nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="de")
    domain: Mapped[str] = mapped_column(String(64), default="allgemein")
    source_type: Mapped[str] = mapped_column(String(64), default="unknown")
    published_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    qdrant_point_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    doc_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())

    def __repr__(self) -> str:
        return f"<KnowledgeDocument {self.title[:60]}>"
