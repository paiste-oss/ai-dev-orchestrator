"""
Credential Service — Verschlüsselung & DB-Zugriff
==================================================
Verwendet Fernet (symmetrische Verschlüsselung aus der cryptography-Bibliothek).
Der Schlüssel steht in .env als CREDENTIALS_ENCRYPTION_KEY.

Verwendung:
    from services.credential_service import save_credential, load_credential

    # Speichern (verschlüsselt):
    await save_credential(db, customer_id, "smtp", {"host": "...", "password": "..."})

    # Laden (entschlüsselt, nur im RAM):
    data = await load_credential(db, customer_id, "smtp")
    # → {"host": "...", "password": "..."}
"""

import json
import uuid
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.config import settings
from models.credential import CustomerCredential

# Fernet-Instanz einmal erstellen (Key aus .env)
_fernet = Fernet(settings.credentials_encryption_key.encode())


def encrypt(data: dict) -> str:
    return _fernet.encrypt(json.dumps(data).encode()).decode()


def decrypt(token: str) -> dict:
    try:
        return json.loads(_fernet.decrypt(token.encode()).decode())
    except InvalidToken:
        raise ValueError("Credential konnte nicht entschlüsselt werden — falscher Key?")


async def save_credential(
    db: AsyncSession,
    customer_id: uuid.UUID,
    service: str,
    data: dict,
) -> CustomerCredential:
    """Erstellt oder überschreibt einen Credential-Eintrag für einen Kunden."""
    result = await db.execute(
        select(CustomerCredential).where(
            CustomerCredential.customer_id == customer_id,
            CustomerCredential.service == service,
        )
    )
    cred = result.scalar_one_or_none()

    if cred:
        cred.credentials_enc = encrypt(data)
    else:
        cred = CustomerCredential(
            customer_id=customer_id,
            service=service,
            credentials_enc=encrypt(data),
        )
        db.add(cred)

    await db.commit()
    await db.refresh(cred)
    return cred


async def load_credential(
    db: AsyncSession,
    customer_id: uuid.UUID,
    service: str,
) -> dict | None:
    """Lädt und entschlüsselt Credentials. Gibt None zurück wenn nicht vorhanden."""
    result = await db.execute(
        select(CustomerCredential).where(
            CustomerCredential.customer_id == customer_id,
            CustomerCredential.service == service,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        return None
    return decrypt(cred.credentials_enc)


async def delete_credential(
    db: AsyncSession,
    customer_id: uuid.UUID,
    service: str,
) -> bool:
    """Löscht Credentials eines Kunden für einen Service."""
    result = await db.execute(
        select(CustomerCredential).where(
            CustomerCredential.customer_id == customer_id,
            CustomerCredential.service == service,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        return False
    await db.delete(cred)
    await db.commit()
    return True


async def list_services(
    db: AsyncSession,
    customer_id: uuid.UUID,
) -> list[str]:
    """Gibt zurück welche Services ein Kunde bereits konfiguriert hat."""
    result = await db.execute(
        select(CustomerCredential.service).where(
            CustomerCredential.customer_id == customer_id,
        )
    )
    return [row[0] for row in result.all()]
