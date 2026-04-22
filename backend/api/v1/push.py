"""Push-Token Verwaltung — FCM-Registrierungstoken von Geräten speichern/entfernen.

Endpoints:
    POST /v1/push/register    — Token registrieren oder aktualisieren
    DELETE /v1/push/register  — Token beim Logout deregistrieren
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.device_token import DeviceToken

router = APIRouter(prefix="/push", tags=["push"])
logger = logging.getLogger(__name__)

_VALID_PLATFORMS = {"ios", "android", "web"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterTokenRequest(BaseModel):
    token: str
    platform: str = "unknown"

    @field_validator("token")
    @classmethod
    def token_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Token darf nicht leer sein.")
        if len(v) > 512:
            raise ValueError("Token zu lang (max. 512 Zeichen).")
        return v

    @field_validator("platform")
    @classmethod
    def platform_valid(cls, v: str) -> str:
        v = v.strip().lower()
        return v if v in _VALID_PLATFORMS else "unknown"


class RegisterTokenResponse(BaseModel):
    status: str
    token_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterTokenResponse)
async def register_token(
    body: RegisterTokenRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RegisterTokenResponse:
    """FCM-Token registrieren oder aktualisieren (UPSERT).

    Wird bei jedem App-Start aufgerufen — wenn ein Token sich nicht geändert
    hat, wird nur `updated_at` aktualisiert (idempotent).
    """
    result = await db.execute(
        select(DeviceToken).where(
            DeviceToken.customer_id == user.id,
            DeviceToken.token == body.token,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.platform = body.platform
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("FCM Token aktualisiert: user=%s platform=%s", user.id, body.platform)
        return RegisterTokenResponse(status="updated", token_id=str(existing.id))

    new_token = DeviceToken(
        customer_id=user.id,
        token=body.token,
        platform=body.platform,
    )
    db.add(new_token)
    await db.commit()
    await db.refresh(new_token)
    logger.info("FCM Token registriert: user=%s platform=%s", user.id, body.platform)
    return RegisterTokenResponse(status="registered", token_id=str(new_token.id))


@router.delete("/register")
async def deregister_token(
    body: RegisterTokenRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """FCM-Token beim Logout oder App-Deinstallation entfernen."""
    result = await db.execute(
        delete(DeviceToken).where(
            DeviceToken.customer_id == user.id,
            DeviceToken.token == body.token,
        )
    )
    await db.commit()
    removed = result.rowcount
    logger.info("FCM Token entfernt: user=%s count=%d", user.id, removed)
    return {"status": "ok", "removed": str(removed)}


@router.delete("/register/all")
async def deregister_all_tokens(
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Alle FCM-Tokens des Users entfernen (z.B. Account-Löschung)."""
    result = await db.execute(
        delete(DeviceToken).where(DeviceToken.customer_id == user.id)
    )
    await db.commit()
    logger.info("Alle FCM Tokens entfernt: user=%s count=%d", user.id, result.rowcount)
    return {"status": "ok", "removed": str(result.rowcount)}
