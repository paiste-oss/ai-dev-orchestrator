"""
E-Mail-Tool-Handler.

send_to_my_email: Sendet an die eigene registrierte Adresse des Users.
  - Nie an Dritte — Empfänger ist immer customer.email
  - Loop-Schutz: Reply-To auf no-reply gesetzt + Footer "Bitte nicht antworten"
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

log = logging.getLogger("uvicorn.error")

_LOOP_GUARD_FOOTER = (
    "\n\n──────────────────────────────\n"
    "Diese E-Mail wurde von Baddi gesendet.\n"
    "Bitte nicht auf diese E-Mail antworten — schreibe direkt im Chat auf baddi.ch"
)
_NO_REPLY = "no-reply@mail.baddi.ch"


async def _handle_send_email(
    tool_name: str,
    tool_input: dict[str, Any],
    customer_id: str | None = None,
) -> dict[str, Any]:
    if not customer_id:
        return {"error": "Kein Benutzerkontext verfügbar"}

    from core.database import AsyncSessionLocal
    from models.customer import Customer
    from services.email_service import send_from_baddi_address

    async with AsyncSessionLocal() as db:
        customer = await db.get(Customer, uuid.UUID(customer_id))

    if not customer:
        return {"error": "Benutzer nicht gefunden"}
    if not customer.baddi_email:
        return {"error": "Keine Baddi-E-Mail-Adresse konfiguriert"}
    if not customer.email:
        return {"error": "Keine Ziel-E-Mail-Adresse verfügbar"}

    subject: str = (tool_input.get("subject") or "Nachricht von Baddi").strip()
    body: str = (tool_input.get("body") or "").strip()
    if not body:
        return {"error": "E-Mail-Inhalt darf nicht leer sein"}

    # Loop-Schutz: Footer + Reply-To no-reply
    body_with_footer = body + _LOOP_GUARD_FOOTER

    sent = await send_from_baddi_address(
        from_baddi_email=customer.baddi_email,
        to_address=customer.email,
        subject=subject,
        body_text=body_with_footer,
        # Reply-To auf no-reply setzen — verhindert Auto-Reply-Loops
        reply_to=_NO_REPLY,
    )

    if sent:
        log.info("[EmailTool] E-Mail gesendet: %s → %s", customer.baddi_email, customer.email)
        return {
            "sent": True,
            "to": customer.email,
            "subject": subject,
            "message": f"E-Mail erfolgreich an {customer.email} gesendet.",
        }
    return {
        "sent": False,
        "error": "E-Mail konnte nicht gesendet werden. Brevo API nicht erreichbar oder API-Key fehlt.",
    }
