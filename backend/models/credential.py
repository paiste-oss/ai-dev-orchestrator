import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class CustomerCredential(Base):
    """
    Speichert Kundenzugangsdaten verschlüsselt in der Datenbank.

    Jeder Kunde kann pro Service-Typ genau einen Credential-Eintrag haben.
    Der Inhalt (credentials_enc) ist mit Fernet symmetrisch verschlüsselt —
    im Klartext niemals in der DB gespeichert.

    Service-Typen und ihr decrypted JSON-Format:
      smtp    → {"host": "smtp.gmail.com", "port": 587, "username": "...", "password": "..."}
      slack   → {"webhook_url": "https://hooks.slack.com/services/..."}
      twilio  → {"account_sid": "...", "auth_token": "...", "from_number": "+41..."}
      google  → {"access_token": "...", "refresh_token": "...", "client_id": "...",
                  "client_secret": "...", "token_expiry": "2026-03-15T10:00:00"}
    """
    __tablename__ = "customer_credentials"
    __table_args__ = (
        UniqueConstraint("customer_id", "service", name="uq_customer_service"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    service: Mapped[str] = mapped_column(String, nullable=False)   # smtp | slack | twilio | google
    credentials_enc: Mapped[str] = mapped_column(String, nullable=False)  # Fernet-encrypted JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer: Mapped["Customer"] = relationship(back_populates="credentials")
