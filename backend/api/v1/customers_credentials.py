import uuid
from fastapi import APIRouter, HTTPException, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer
from models.credential import CustomerCredential
from .customers_schemas import CredentialSave, SERVICE_SCHEMAS

router = APIRouter()


@router.get("/{customer_id}/credentials")
async def list_customer_credentials(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Gibt zurück welche Services konfiguriert sind (nie Klartextdaten)."""
    result = await db.execute(
        select(CustomerCredential.service, CustomerCredential.updated_at)
        .where(CustomerCredential.customer_id == customer_id)
    )
    rows = result.all()
    configured = {row.service: str(row.updated_at) for row in rows}
    return {
        "customer_id": str(customer_id),
        "services": SERVICE_SCHEMAS,
        "configured": configured,
    }


@router.put("/{customer_id}/credentials/{service}")
async def save_customer_credential(
    customer_id: uuid.UUID,
    service: str,
    body: CredentialSave,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    if service not in SERVICE_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Unbekannter Service: {service}")
    from services import credential_service
    await credential_service.save_credential(db, customer_id, service, body.data)
    return {"status": "saved", "service": service}


@router.delete("/{customer_id}/credentials/{service}", status_code=204)
async def delete_customer_credential(
    customer_id: uuid.UUID,
    service: str,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    result = await db.execute(
        select(CustomerCredential)
        .where(CustomerCredential.customer_id == customer_id, CustomerCredential.service == service)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential nicht gefunden")
    await db.delete(cred)
    await db.commit()
    return Response(status_code=204)
