"""
Google OAuth2 Endpoints
=======================
  GET  /v1/oauth/google/start?customer_id={uuid}   → Redirect-URL für Google-Login
  GET  /v1/oauth/google/callback?code=...&state=... → Callback nach Google-Login

Flow im Frontend:
  1. Frontend ruft GET /v1/oauth/google/start?customer_id=... auf
  2. Backend gibt {"url": "https://accounts.google.com/..."} zurück
  3. Frontend öffnet die URL (window.open oder redirect)
  4. Nutzer loggt sich bei Google ein und erteilt Berechtigung
  5. Google redirectet zu /v1/oauth/google/callback
  6. Backend speichert Tokens → redirectet zu Frontend-Erfolgsseite
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from core.config import settings
from core.database import get_db
from services.oauth_service import get_auth_url, handle_callback

router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.get("/google/start")
async def google_auth_start(customer_id: uuid.UUID):
    """Gibt die Google-OAuth-Login-URL zurück."""
    url = get_auth_url(customer_id)
    return {"url": url}


@router.get("/google/callback")
async def google_auth_callback(
    code: str,
    state: str,  # enthält customer_id
    db: AsyncSession = Depends(get_db),
):
    """
    Callback von Google nach erfolgreichem Login.
    Speichert Tokens und leitet zum Frontend weiter.
    """
    try:
        customer_id = uuid.UUID(state)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ungültiger state-Parameter.")

    await handle_callback(db, code, customer_id)

    # Redirect zur Einstellungsseite im Frontend
    frontend_url = settings.frontend_url
    return RedirectResponse(url=f"{frontend_url}/settings?google=connected")
