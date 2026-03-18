"""
BuddyTool — Zuordnung von Tools zu einem Buddy.

Ein Buddy kann beliebig viele Tools haben.
Die `tool_key` Werte verweisen auf den TOOL_CATALOG in services/tool_registry.py.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base


class BuddyTool(Base):
    __tablename__ = "buddy_tools"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buddy_id = Column(UUID(as_uuid=True), ForeignKey("ai_buddies.id", ondelete="CASCADE"), nullable=False)
    tool_key = Column(String, nullable=False)       # z.B. "sbb_transport"
    config = Column(JSON, default=dict)             # Tool-spezifische Konfiguration
    is_active = Column(Boolean, default=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    buddy = relationship("AiBuddy", back_populates="tools")
