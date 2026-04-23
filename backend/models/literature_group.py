import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class LiteratureGroup(Base):
    __tablename__ = "literature_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False)  # paper | book | patent
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("literature_groups.id", ondelete="CASCADE"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    children: Mapped[list["LiteratureGroup"]] = relationship(
        "LiteratureGroup",
        back_populates="parent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    parent: Mapped["LiteratureGroup | None"] = relationship(
        "LiteratureGroup", back_populates="children", remote_side="LiteratureGroup.id"
    )

    def __repr__(self) -> str:
        return f"<LiteratureGroup id={self.id} name={self.name!r} type={self.entry_type}>"
