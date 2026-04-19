"""
CustomerDocument Model
Speichert hochgeladene Dateien als Text-Extrakt in PostgreSQL.
Qdrant-Vektor-Referenz (point_ids) wird als JSONB gespeichert.
"""
import uuid
from datetime import datetime,timezone
from sqlalchemy import String, DateTime, Text, Integer, ForeignKey, Boolean, LargeBinary  # LargeBinary: legacy, neue Uploads → S3
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class CustomerDocument(Base):
    __tablename__ = "customer_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )

    # Datei-Metadaten
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(64), nullable=False)   # pdf, docx, xlsx, pptx, txt, csv, ...
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/octet-stream")

    # Original-Binärdatei: legacy (PostgreSQL). Neue Uploads → S3 (s3_key)
    file_content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # S3 Object Storage
    s3_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    stored_in_s3: Mapped[bool] = mapped_column(Boolean, default=False)

    # Extrahierter Text-Inhalt
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    char_count: Mapped[int] = mapped_column(Integer, default=0)

    # Speicherziele
    stored_in_postgres: Mapped[bool] = mapped_column(Boolean, default=True)
    stored_in_qdrant: Mapped[bool] = mapped_column(Boolean, default=False)

    # Qdrant Referenz: Liste der point_ids die für dieses Dokument gespeichert wurden
    qdrant_point_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    qdrant_collection: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # Zusätzliche Metadaten (Seitenzahlen, Sheets, etc.)
    doc_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Sichtbarkeit: True = Baddi darf lesen, False = privat
    baddi_readable: Mapped[bool] = mapped_column(Boolean, default=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())

    # Relationships
    customer: Mapped["Customer"] = relationship(back_populates="documents")  # type: ignore

    def __repr__(self) -> str:
        return f"<CustomerDocument id={self.id} file={self.filename} customer={self.customer_id}>"
