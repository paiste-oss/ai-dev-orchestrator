"""
E-Mail-Service — Baddi per-User-Adressen.

Zuständig für:
  - Provisioning von @mail.baddi.ch-Adressen (vorname.id@mail.baddi.ch)
  - Outbound-Versand über Brevo Transactional API (beliebige From-Adresse)
  - Inbound kommt als Webhook POST /v1/email/inbound (→ api/v1/email.py)
"""
from __future__ import annotations

import re
import uuid

import httpx

from core.config import settings

_BADDI_EMAIL_DOMAIN = "mail.baddi.ch"


def provision_baddi_email(first_name: str) -> str:
    """
    Generiert eine eindeutige Baddi-E-Mail-Adresse für einen neuen User.

    Format: vorname.6hex@mail.baddi.ch
    Beispiel: naor.a3f9b2@mail.baddi.ch
    """
    slug = re.sub(r"[^a-z0-9]", "", first_name.lower())[:12] or "user"
    short_id = uuid.uuid4().hex[:6]
    return f"{slug}.{short_id}@{_BADDI_EMAIL_DOMAIN}"


async def send_from_baddi_address(
    *,
    from_baddi_email: str,
    to_address: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    reply_to: str | None = None,
) -> bool:
    """
    Sendet eine E-Mail über die Brevo Transactional API mit der Baddi-User-Adresse
    als Absender. Setzt voraus dass mail.baddi.ch in Brevo als Sender-Domain
    verifiziert ist.

    Gibt True zurück bei Erfolg (HTTP 201), sonst False.
    """
    if not settings.brevo_api_key:
        print(f"[Email] Brevo API-Key nicht konfiguriert — E-Mail an {to_address} nicht gesendet")
        return False

    payload: dict = {
        "sender": {"email": from_baddi_email},
        "to": [{"email": to_address}],
        "subject": subject,
        "textContent": body_text,
    }
    if body_html:
        payload["htmlContent"] = body_html
    if reply_to:
        payload["replyTo"] = {"email": reply_to}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": settings.brevo_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.status_code == 201:
            return True
        print(f"[Email] Brevo API Fehler {resp.status_code}: {resp.text[:200]}")
        return False
    except Exception as e:
        print(f"[Email] Versand fehlgeschlagen an {to_address}: {e}")
        return False
