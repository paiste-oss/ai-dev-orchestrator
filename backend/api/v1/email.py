"""
E-Mail-Endpunkte — Baddi per-User-Adressen (@mail.baddi.ch).

Endpunkte:
  POST /v1/email/inbound          — Brevo Inbound Parsing Webhook (kein Auth)
  GET  /v1/email/address          — eigene Baddi-Adresse abrufen (User)
  GET  /v1/email/inbox            — Posteingang (User)
  PUT  /v1/email/inbox/{id}/read  — als gelesen markieren (User)
  POST /v1/email/send             — E-Mail von eigener Adresse senden (User)
  POST /v1/email/provision/{id}   — Adresse für User anlegen (Admin)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user, require_admin
from models.customer import Customer
from models.email_message import EmailMessage
from services.email_service import provision_baddi_email

log = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/email", tags=["email"])

_BADDI_MAIL_DOMAIN = "mail.baddi.ch"


# ── Pydantic-Schemas ──────────────────────────────────────────────────────────

class InboundItem(BaseModel):
    MessageId: str | None = None
    From: dict[str, str] | str | None = None
    To: list[dict[str, str]] | None = None
    Subject: str = ""
    TextBody: str | None = None
    HtmlBody: str | None = None
    Headers: dict[str, Any] | None = None
    Dkim: str | None = None        # "pass" | "fail" | None
    SpfResult: str | None = None   # "pass" | "fail" | "softfail" | None


class InboundPayload(BaseModel):
    items: list[InboundItem]



class EmailMessageOut(BaseModel):
    id: uuid.UUID
    direction: str
    from_address: str
    to_address: str
    subject: str
    body_text: str | None
    received_at: datetime
    read: bool
    sender_trusted: bool

    model_config = {"from_attributes": True}


# ── Inbound Webhook ───────────────────────────────────────────────────────────

@router.post("/inbound", include_in_schema=False)
async def inbound_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Brevo Inbound Parsing Webhook.
    Brevo POSTet JSON mit `items`-Array für jeden eingehenden E-Mail.
    Unbekannte Empfänger werden still ignoriert (kein Bounce).
    """
    body = await request.body()

    # Optionale Signaturprüfung — Brevo schickt X-Sib-Webhook-Secret wenn
    # in den Inbound-Settings konfiguriert (settings.brevo_webhook_secret).
    if settings.brevo_webhook_secret:
        sig = request.headers.get("X-Sib-Webhook-Secret", "")
        expected = hmac.new(
            settings.brevo_webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            log.warning("[Email/Inbound] Ungültige Webhook-Signatur")
            raise HTTPException(status_code=403, detail="Ungültige Signatur")

    try:
        payload = InboundPayload.model_validate_json(body)
    except Exception as exc:
        log.error("[Email/Inbound] Ungültiger Payload: %s", exc)
        raise HTTPException(status_code=422, detail="Ungültiger Payload")

    saved = 0
    for item in payload.items:
        # Empfänger-Adresse bestimmen
        to_address = _extract_first_to(item)
        if not to_address or _BADDI_MAIL_DOMAIN not in to_address:
            continue

        # Duplikat-Schutz via MessageId
        if item.MessageId:
            existing = await db.execute(
                select(EmailMessage).where(EmailMessage.message_id == item.MessageId)
            )
            if existing.scalar_one_or_none():
                continue

        # Kunden suchen
        result = await db.execute(
            select(Customer).where(Customer.baddi_email == to_address.lower())
        )
        customer = result.scalar_one_or_none()
        if not customer:
            log.info("[Email/Inbound] Keine Baddi-Adresse gefunden für: %s", to_address)
            continue

        from_addr = _extract_from_address(item)
        sender_trusted = (
            # SPF+DKIM bestanden
            (item.Dkim or "").lower() == "pass"
            and (item.SpfResult or "").lower() == "pass"
        ) or (
            # eigene Registrierungs-Email ist immer vertrauenswürdig
            from_addr.lower() == customer.email.lower()
        )
        msg = EmailMessage(
            id=uuid.uuid4(),
            customer_id=customer.id,
            direction="inbound",
            from_address=from_addr,
            to_address=to_address.lower(),
            subject=item.Subject or "",
            body_text=item.TextBody,
            body_html=item.HtmlBody,
            message_id=item.MessageId,
            received_at=datetime.now(timezone.utc),
            read=False,
            sender_trusted=sender_trusted,
            raw_headers=item.Headers,
        )
        db.add(msg)
        saved += 1

    if saved:
        await db.commit()
        log.info("[Email/Inbound] %d E-Mail(s) gespeichert", saved)

    return {"ok": True, "saved": saved}


# ── User-Endpunkte ────────────────────────────────────────────────────────────

@router.get("/address")
async def get_my_address(user: Customer = Depends(get_current_user)):
    """Gibt die eigene Baddi-E-Mail-Adresse zurück (oder null wenn noch keine)."""
    return {"baddi_email": user.baddi_email}


@router.get("/inbox", response_model=list[EmailMessageOut])
async def get_inbox(
    limit: int = 50,
    unread_only: bool = False,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Gibt die letzten E-Mails des Users zurück, neueste zuerst."""
    stmt = (
        select(EmailMessage)
        .where(
            EmailMessage.customer_id == user.id,
            EmailMessage.direction == "inbound",
        )
        .order_by(EmailMessage.received_at.desc())
        .limit(min(limit, 100))
    )
    if unread_only:
        stmt = stmt.where(EmailMessage.read == False)  # noqa: E712
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/inbox/{message_id}/read")
async def mark_read(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Markiert eine E-Mail als gelesen."""
    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    msg.read = True
    await db.commit()
    return {"ok": True}


# ── Admin-Endpunkte ───────────────────────────────────────────────────────────

@router.post("/provision/{customer_id}")
async def provision_address(
    customer_id: uuid.UUID,
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Vergibt eine Baddi-E-Mail-Adresse an einen User (Admin)."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    if customer.baddi_email:
        return {"baddi_email": customer.baddi_email, "created": False}

    first = customer.first_name or customer.name.split()[0]
    customer.baddi_email = provision_baddi_email(first)
    await db.commit()
    log.info("[Email] Adresse provisioniert: %s → %s", customer.id, customer.baddi_email)
    return {"baddi_email": customer.baddi_email, "created": True}


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

@router.post("/provision-all", include_in_schema=False)
async def provision_all_emails(
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Vergibt Baddi-E-Mail-Adressen an alle User die noch keine haben (einmalige Migration)."""
    from sqlalchemy import select as _select
    from services.email_service import provision_baddi_email

    result = await db.execute(
        _select(Customer).where(Customer.baddi_email.is_(None), Customer.is_active.is_(True))
    )
    customers = result.scalars().all()
    provisioned = []

    for customer in customers:
        first = customer.first_name or customer.name.split()[0]
        customer.baddi_email = provision_baddi_email(first)
        provisioned.append({"id": str(customer.id), "name": customer.name, "baddi_email": customer.baddi_email})

    if provisioned:
        await db.commit()
        log.info("[Email] Bulk-Provisioning: %d Adressen vergeben", len(provisioned))

    return {"provisioned": len(provisioned), "details": provisioned}


def _extract_from_address(item: InboundItem) -> str:
    if isinstance(item.From, dict):
        return item.From.get("Address") or item.From.get("address") or ""
    return str(item.From or "")


def _extract_first_to(item: InboundItem) -> str | None:
    if not item.To:
        return None
    first = item.To[0]
    if isinstance(first, dict):
        return first.get("Address") or first.get("address")
    return str(first)
