"""
n8n Microservice Client
=======================
n8n ist kein zentraler Router mehr, sondern ein Executor für Seiteneffekte.

Jeder Service ist ein eigener n8n-Workflow mit dem Webhook-Pfad:
  /webhook/service-{name}

Beispiele:
  await n8n.trigger("send-email",    {"to": "...", "subject": "...", "body": "..."})
  await n8n.trigger("send-sms",      {"to": "+41...", "message": "..."})
  await n8n.trigger("notify-slack",  {"channel": "#alerts", "text": "..."})
  await n8n.trigger("calendar-event",{"title": "...", "start": "...", "end": "..."})
  await n8n.trigger("export-pdf",    {"template": "report", "data": {...}})

n8n-Workflow erstellen:
  1. Trigger: Webhook  →  Path: service-{name}  →  Method: POST
  2. Beliebige Nodes (Email, HTTP Request, etc.)
  3. Respond to Webhook: Last Node / First Incoming Item
"""

import httpx
from core.config import settings


async def trigger(service: str, payload: dict) -> dict:
    """
    Löst einen n8n-Service-Workflow aus.
    Wirft einen Fehler wenn der Service nicht erreichbar ist oder einen Fehler zurückgibt.
    """
    url = f"{settings.n8n_base_url}/webhook/service-{service}"
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload, timeout=30)
        r.raise_for_status()
        try:
            return r.json()
        except Exception:
            return {"status": "ok", "raw": r.text}


async def trigger_safe(service: str, payload: dict) -> dict | None:
    """
    Wie trigger(), gibt aber None zurück statt Exception zu werfen.
    Für Fire-and-Forget Seiteneffekte (z.B. Benachrichtigungen).
    """
    try:
        return await trigger(service, payload)
    except Exception as e:
        return {"error": str(e), "service": service}
