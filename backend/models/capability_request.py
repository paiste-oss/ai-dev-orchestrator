"""
CapabilityRequest — Wenn ein Kunde etwas möchte, das das Uhrwerk noch nicht kann.

Lebenszyklus:
  pending       → Anfrage eingegangen, noch nicht analysiert
  analyzing     → Uhrwerk analysiert was gebraucht wird
  needs_input   → Admin muss etwas eingeben (API-Key, URL, etc.)
  building      → Uhrwerk baut das Tool
  testing       → Tool wird getestet
  ready         → Tool bereit zum Deployen
  deployed      → Tool ist im Uhrwerk, Kunden können es nutzen
  rejected      → Anfrage abgelehnt (nicht realisierbar / Datenschutz)
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class CapabilityRequest(Base):
    __tablename__ = "capability_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    buddy_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # Was der Kunde ursprünglich geschrieben hat
    original_message: Mapped[str] = mapped_column(Text, nullable=False)

    # Vom Agent Router erkannter Intent
    detected_intent: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Status des Entwicklungsprozesses
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)

    # Vom Uhrwerk generierter Tool-Vorschlag (JSON: name, description, api_url, params, ...)
    tool_proposal: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Dialog zwischen Admin und Uhrwerk
    # [{"role": "uhrwerk"|"admin", "content": "...", "created_at": "..."}]
    dialog: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)

    # Admin-Notizen / Entscheid
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Key des deployed Tools (nach Deployment)
    deployed_tool_key: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
