"""
Service Executor — Hybridrouter
================================
Entscheidet pro Service-Typ wie ausgeführt wird:

  Direkt (Python):
    smtp    → aiosmtplib
    slack   → HTTP POST an Webhook-URL
    twilio  → HTTP POST an Twilio REST API

  Via n8n (komplexe Workflows, Google-Integrationen):
    google_sheets   → n8n mit frischem Access Token im Payload
    google_docs     → n8n mit frischem Access Token im Payload
    google_calendar → n8n mit frischem Access Token im Payload
    custom          → n8n direkt (workflow_name im Payload)

Verwendung:
    from services.service_executor import execute_service

    result = await execute_service(db, customer_id, "smtp", {
        "to": "user@example.com",
        "subject": "Hallo",
        "body": "Nachricht"
    })
"""

import uuid
import httpx
import aiosmtplib
from email.message import EmailMessage
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from core.config import settings
from services import credential_service, n8n_client
from services.oauth_service import get_valid_access_token


# ---------------------------------------------------------------------------
# Direkte Executor-Funktionen
# ---------------------------------------------------------------------------

async def _exec_smtp(creds: dict, payload: dict) -> dict:
    msg = EmailMessage()
    msg["From"]    = payload.get("from", creds.get("username", "noreply@aibuddy.com"))
    msg["To"]      = payload["to"]
    msg["Subject"] = payload["subject"]
    msg.set_content(payload.get("body", ""))

    await aiosmtplib.send(
        msg,
        hostname=creds["host"],
        port=int(creds.get("port", 587)),
        username=creds["username"],
        password=creds["password"],
        start_tls=True,
    )
    return {"status": "sent", "to": payload["to"]}


async def _exec_slack(creds: dict, payload: dict) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            creds["webhook_url"],
            json={"text": payload["text"], "channel": payload.get("channel")},
            timeout=10,
        )
        r.raise_for_status()
    return {"status": "sent"}


async def _exec_twilio(creds: dict, payload: dict) -> dict:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{creds['account_sid']}/Messages.json"
    async with httpx.AsyncClient() as client:
        r = await client.post(
            url,
            data={
                "To":   payload["to"],
                "From": creds["from_number"],
                "Body": payload["message"],
            },
            auth=(creds["account_sid"], creds["auth_token"]),
            timeout=10,
        )
        r.raise_for_status()
        return {"status": "sent", "sid": r.json().get("sid")}


# ---------------------------------------------------------------------------
# n8n-basierte Executor-Funktionen (Google & Custom)
# ---------------------------------------------------------------------------

async def _exec_via_n8n(service: str, access_token: str, payload: dict) -> dict:
    """Schickt den Service-Aufruf an n8n mit einem frischen Access Token im Body."""
    return await n8n_client.trigger(service, {
        **payload,
        "_auth": {"bearer": access_token},
    })


# ---------------------------------------------------------------------------
# Haupt-Dispatcher
# ---------------------------------------------------------------------------

DIRECT_SERVICES = {"smtp", "slack", "twilio"}
N8N_OAUTH_SERVICES = {"google_sheets", "google_docs", "google_calendar"}


async def execute_service(
    db: AsyncSession,
    customer_id: uuid.UUID,
    service: str,
    payload: dict,
) -> dict:
    """
    Führt einen Service für einen Kunden aus.
    Credentials werden aus der DB geladen und nie nach aussen weitergegeben.
    """
    creds = await credential_service.load_credential(db, customer_id, service)

    if service in DIRECT_SERVICES:
        if not creds:
            raise HTTPException(
                status_code=422,
                detail=f"Keine Credentials für '{service}' hinterlegt. Bitte erst in den Einstellungen konfigurieren.",
            )
        if service == "smtp":
            return await _exec_smtp(creds, payload)
        if service == "slack":
            return await _exec_slack(creds, payload)
        if service == "twilio":
            return await _exec_twilio(creds, payload)

    if service in N8N_OAUTH_SERVICES:
        if not creds:
            raise HTTPException(
                status_code=422,
                detail=f"Google-Konto nicht verbunden. Bitte zuerst unter Einstellungen → Google verbinden.",
            )
        access_token = await get_valid_access_token(db, customer_id, creds)
        return await _exec_via_n8n(service, access_token, payload)

    if service == "custom":
        workflow_name = payload.get("workflow")
        if not workflow_name:
            raise HTTPException(status_code=422, detail="'workflow' fehlt im Payload für custom-Service.")
        return await n8n_client.trigger(workflow_name, payload)

    raise HTTPException(status_code=400, detail=f"Unbekannter Service: '{service}'")
