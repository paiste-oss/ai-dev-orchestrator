"""
LiteratureOrphanPdf — PDFs aus Bulk-Upload, die keinem XML-Eintrag zugeordnet
werden konnten. User kann sie im Frontend manuell zuordnen, in einen neuen
Eintrag umwandeln, oder löschen.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class LiteratureOrphanPdf(Base):
    __tablename__ = "literature_orphan_pdfs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # SHA256 des PDF-Inhalts — Dedup beim nächsten ZIP-Upload
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Aus PDF extrahierte Metadaten (Haiku) — Frontend zeigt sie zum Zuordnen
    extracted_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Erste 4000 Zeichen — für Frontend-Vorschau ohne PDF-Reload
    extracted_text_preview: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default="now()")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    def __repr__(self) -> str:
        return f"<LiteratureOrphanPdf id={self.id} filename={self.filename!r}>"
