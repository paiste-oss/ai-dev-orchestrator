"""
DocumentFolder Model — Ordner für Kundendokumente.
Unterstützt eine Ebene Verschachtelung (parent_id).
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class DocumentFolder(Base):
    __tablename__ = "document_folders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    color: Mapped[str] = mapped_column(String(32), nullable=False, default="indigo")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow())

    documents: Mapped[list["CustomerDocument"]] = relationship(back_populates="folder")  # type: ignore
    children: Mapped[list["DocumentFolder"]] = relationship("DocumentFolder", foreign_keys=[parent_id])

    def __repr__(self) -> str:
        return f"<DocumentFolder id={self.id} name={self.name} customer={self.customer_id}>"
