"""
LiteratureOaOverride + LiteratureOaBlocklist — User-Korrekturen am OA-Status.

LiteratureOaOverride: User sagt "dieser Eintrag ist (für mich) nicht OA".
Wirkt nur lokal — die Anzeige im Grid und im Detail unterdrückt das OA-Schloss.

LiteratureOaBlocklist: Admin-bestätigte Liste von DOIs, die niemand mehr als
OA angezeigt bekommt. Beim Re-Enrichment wird oa_url für diese DOIs nicht
gesetzt.
"""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class LiteratureOaOverride(Base):
    __tablename__ = "literature_oa_overrides"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True
    )
    doi: Mapped[str] = mapped_column(String(512), primary_key=True)
    entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("literature_entries.id", ondelete="SET NULL"), nullable=True
    )
    title_at_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default="now()")

    def __repr__(self) -> str:
        return f"<LiteratureOaOverride doi={self.doi} customer={self.customer_id}>"


class LiteratureOaBlocklist(Base):
    __tablename__ = "literature_oa_blocklist"

    doi: Mapped[str] = mapped_column(String(512), primary_key=True)
    removed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    removed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default="now()")
    reason: Mapped[str | None] = mapped_column(String(512), nullable=True)

    def __repr__(self) -> str:
        return f"<LiteratureOaBlocklist doi={self.doi}>"
