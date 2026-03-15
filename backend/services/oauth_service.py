"""
Google OAuth2 Service
=====================
Verwaltet den kompletten OAuth2-Flow für Google-Integrationen.

Flow:
  1. get_auth_url(customer_id)     → URL für Google-Login zurückgeben
  2. handle_callback(code, state)  → Tokens holen und verschlüsselt in DB speichern
  3. get_valid_access_token(...)   → Access Token prüfen, bei Bedarf refreshen

Scopes (erweiterbar):
  - google_sheets   → spreadsheets
  - google_docs     → documents
  - google_calendar → calendar

Variablen in .env:
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REDIRECT_URI  (z.B. http://localhost:8000/v1/oauth/google/callback)
"""

import uuid
import httpx
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from sqlalchemy.ext.asyncio import AsyncSession
from core.config import settings
from services import credential_service

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]


def get_auth_url(customer_id: uuid.UUID) -> str:
    """Gibt die Google-Login-URL zurück. customer_id wird als state mitgegeben."""
    params = {
        "client_id":     settings.google_client_id,
        "redirect_uri":  settings.google_redirect_uri,
        "response_type": "code",
        "scope":         " ".join(SCOPES),
        "access_type":   "offline",   # für refresh_token
        "prompt":        "consent",   # erzwingt refresh_token auch bei Re-Auth
        "state":         str(customer_id),
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def handle_callback(
    db: AsyncSession,
    code: str,
    customer_id: uuid.UUID,
) -> dict:
    """Tauscht den Auth-Code gegen Tokens und speichert diese verschlüsselt in der DB."""
    async with httpx.AsyncClient() as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri":  settings.google_redirect_uri,
            "grant_type":    "authorization_code",
        })
        r.raise_for_status()
        tokens = r.json()

    expiry = (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat()

    creds = {
        "access_token":  tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "client_id":     settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "token_expiry":  expiry,
    }
    await credential_service.save_credential(db, customer_id, "google", creds)
    return {"status": "connected", "expiry": expiry}


async def get_valid_access_token(
    db: AsyncSession,
    customer_id: uuid.UUID,
    creds: dict,
) -> str:
    """
    Gibt einen gültigen Access Token zurück.
    Refresht automatisch wenn der Token abgelaufen ist.
    """
    expiry = datetime.fromisoformat(creds["token_expiry"])
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    # Token noch 5 Minuten gültig → direkt zurückgeben
    if datetime.now(timezone.utc) < expiry - timedelta(minutes=5):
        return creds["access_token"]

    # Token abgelaufen → refreshen
    async with httpx.AsyncClient() as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id":     creds["client_id"],
            "client_secret": creds["client_secret"],
            "refresh_token": creds["refresh_token"],
            "grant_type":    "refresh_token",
        })
        r.raise_for_status()
        new_tokens = r.json()

    new_expiry = (datetime.now(timezone.utc) + timedelta(seconds=new_tokens.get("expires_in", 3600))).isoformat()

    updated_creds = {
        **creds,
        "access_token": new_tokens["access_token"],
        "token_expiry": new_expiry,
    }
    await credential_service.save_credential(db, customer_id, "google", updated_creds)
    return new_tokens["access_token"]
