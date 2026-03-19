"""
Credentials API
===============
Kunden hinterlegen hier ihre Zugangsdaten für externe Services.
Credentials werden verschlüsselt gespeichert — nie im Klartext zurückgegeben.

Endpoints:
  GET    /v1/credentials/{customer_id}               → Liste der konfigurierten Services
  PUT    /v1/credentials/{customer_id}/{service}      → Credential anlegen/überschreiben
  DELETE /v1/credentials/{customer_id}/{service}      → Credential löschen
  POST   /v1/credentials/{customer_id}/{service}/test → Service-Test (Verbindung prüfen)
  POST   /v1/services/{customer_id}/{service}         → Service ausführen (mit Paywall)
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from services import credential_service, subscription_service, service_executor

router = APIRouter(tags=["credentials & services"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CredentialIn(BaseModel):
    data: dict  # Service-spezifisch, wird verschlüsselt gespeichert


class ServiceCall(BaseModel):
    payload: dict = {}


# ---------------------------------------------------------------------------
# Credential-Verwaltung
# ---------------------------------------------------------------------------

@router.get("/credentials/{customer_id}")
async def list_configured_services(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Gibt zurück welche Services bereits konfiguriert sind (ohne Credential-Inhalte)."""
    services = await credential_service.list_services(db, customer_id)
    return {"customer_id": str(customer_id), "configured_services": services}


@router.put("/credentials/{customer_id}/{service}")
async def upsert_credential(
    customer_id: uuid.UUID,
    service: str,
    body: CredentialIn,
    db: AsyncSession = Depends(get_db),
):
    """Speichert Credentials verschlüsselt in der DB."""
    allowed = ["smtp", "slack", "twilio", "google", "twitter_x", "facebook", "whatsapp", "instagram"]
    if service not in allowed:
        raise HTTPException(status_code=400, detail=f"Unbekannter Service. Erlaubt: {allowed}")

    await credential_service.save_credential(db, customer_id, service, body.data)
    return {"status": "saved", "service": service}


@router.delete("/credentials/{customer_id}/{service}")
async def delete_credential(
    customer_id: uuid.UUID,
    service: str,
    db: AsyncSession = Depends(get_db),
):
    deleted = await credential_service.delete_credential(db, customer_id, service)
    if not deleted:
        raise HTTPException(status_code=404, detail="Credential nicht gefunden.")
    return {"status": "deleted", "service": service}


# ---------------------------------------------------------------------------
# Service-Ausführung (mit Paywall)
# ---------------------------------------------------------------------------

@router.post("/services/{customer_id}/{service}")
async def run_service(
    customer_id: uuid.UUID,
    service: str,
    body: ServiceCall,
    db: AsyncSession = Depends(get_db),
):
    """
    Führt einen Service für einen Kunden aus.
    Prüft zuerst ob der Service im Abo enthalten ist (Paywall).
    """
    # 1. Paywall-Check
    await subscription_service.require_service(db, customer_id, service)

    # 2. Service ausführen (direkt oder via n8n)
    result = await service_executor.execute_service(db, customer_id, service, body.payload)
    return {"service": service, "result": result}


@router.get("/services/{customer_id}/available")
async def available_services(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Gibt zurück welche Services im aktuellen Abo des Kunden enthalten sind."""
    allowed = await subscription_service.get_allowed_services(db, customer_id)
    configured = await credential_service.list_services(db, customer_id)
    return {
        "allowed_services": allowed,
        "configured_services": configured,
        "ready": [s for s in allowed if s in configured],
    }
