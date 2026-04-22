"""
E-Mail-Endpunkte — Baddi per-User-Adressen (@mail.baddi.ch).

  POST /v1/email/inbound          — Brevo Inbound Parsing Webhook (kein Auth)
  GET  /v1/email/address          — eigene Baddi-Adresse abrufen (User)
  GET  /v1/email/inbox/*          — Posteingang CRUD → email_inbox.py
  GET  /v1/email/trusted-senders  — Whitelist verwalten
  POST /v1/email/provision/{id}   — Adresse für User anlegen (Admin)
  POST /v1/email/provision-all    — Bulk-Migration bestehende User (Admin)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import AsyncSessionLocal, get_db
from core.dependencies import get_current_user, require_admin
from models.customer import Customer
from models.email_message import EmailMessage
from services.email_service import provision_baddi_email
from api.v1.email_inbox import router as inbox_router, EmailMessageOut  # noqa: F401 — re-export schema

log = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/email", tags=["email"])
router.include_router(inbox_router)

_BADDI_MAIL_DOMAIN = "mail.baddi.ch"
_SPAM_SCORE_THRESHOLD = 5.0


# ── Pydantic-Schemas ──────────────────────────────────────────────────────────

class InboundItem(BaseModel):
    MessageId: str | None = None
    InReplyTo: str | None = None
    From: dict[str, str] | str | None = None
    To: list[dict[str, str]] | None = None
    Cc: list[dict[str, str]] | None = None
    Subject: str = ""
    RawTextBody: str | None = None
    RawHtmlBody: str | None = None
    ExtractedMarkdownMessage: str | None = None
    ExtractedMarkdownSignature: str | None = None
    SpamScore: float | None = None
    Attachments: list[dict[str, Any]] | None = None
    Headers: dict[str, str | list[str]] | None = None


class InboundPayload(BaseModel):
    items: list[InboundItem]


class TrustedSenderRequest(BaseModel):
    email: str


# ── Inbound Webhook ───────────────────────────────────────────────────────────

@router.post("/inbound", include_in_schema=False)
async def inbound_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()

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
        to_address = _extract_first_to(item)
        if not to_address or _BADDI_MAIL_DOMAIN not in to_address:
            continue

        if item.MessageId:
            existing = await db.execute(
                select(EmailMessage).where(EmailMessage.message_id == item.MessageId)
            )
            if existing.scalar_one_or_none():
                continue

        result = await db.execute(
            select(Customer).where(Customer.baddi_email == to_address.lower())
        )
        customer = result.scalar_one_or_none()
        if not customer:
            log.info("[Email/Inbound] Keine Baddi-Adresse gefunden für: %s", to_address)
            continue

        from_addr = _extract_from_address(item)
        from_lower = from_addr.lower()

        if (item.SpamScore or 0.0) > _SPAM_SCORE_THRESHOLD:
            log.info("[Email/Inbound] Spam ignoriert (Score %.1f): %s", item.SpamScore, from_lower)
            continue

        if from_lower == customer.email.lower():
            body_text = (
                item.ExtractedMarkdownMessage
                or item.RawTextBody
                or item.RawHtmlBody
                or ""
            ).strip()
            if body_text:
                message_text = (
                    f"[Via E-Mail — Betreff: {item.Subject}]\n\n{body_text}"
                    if item.Subject else body_text
                )
                background_tasks.add_task(
                    _process_email_as_chat,
                    customer_id=str(customer.id),
                    message_text=message_text,
                    reply_to=from_lower,
                    reply_subject=item.Subject or "",
                )
                log.info("[Email/Inbound] Eigene Email → Chat-Pipeline: %s", customer.id)
            continue

        blocked_list = [s.lower() for s in (customer.blocked_senders or [])]
        if from_lower in blocked_list:
            log.info("[Email/Inbound] Gesperrter Absender ignoriert: %s", from_lower)
            continue

        trusted_list = [s.lower() for s in (customer.trusted_senders or [])]
        sender_trusted = _auth_passed(item.Headers) or (from_lower in trusted_list)

        msg = EmailMessage(
            id=uuid.uuid4(),
            customer_id=customer.id,
            direction="inbound",
            from_address=from_addr,
            to_address=to_address.lower(),
            subject=item.Subject or "",
            body_text=item.ExtractedMarkdownMessage or item.RawTextBody,
            body_html=item.RawHtmlBody,
            message_id=item.MessageId,
            received_at=datetime.utcnow(),
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
    return {"baddi_email": user.baddi_email}


# ── Trusted Senders ───────────────────────────────────────────────────────────

@router.get("/trusted-senders")
async def get_trusted_senders(user: Customer = Depends(get_current_user)):
    return {"trusted_senders": user.trusted_senders or []}


@router.post("/trusted-senders")
async def add_trusted_sender(
    req: TrustedSenderRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Ungültige E-Mail-Adresse")

    current: list[str] = list(user.trusted_senders or [])
    if email in [s.lower() for s in current]:
        return {"trusted_senders": current, "added": False}

    current.append(email)
    await db.execute(
        text("UPDATE customers SET trusted_senders = CAST(:v AS jsonb) WHERE id = :id"),
        {"v": json.dumps(current), "id": str(user.id)},
    )
    await db.commit()
    log.info("[Email] Trusted Sender hinzugefügt: %s → %s", user.id, email)
    return {"trusted_senders": current, "added": True}


@router.delete("/trusted-senders/{sender_email}")
async def remove_trusted_sender(
    sender_email: str,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    email = sender_email.strip().lower()
    current: list[str] = [s for s in (user.trusted_senders or []) if s.lower() != email]
    await db.execute(
        text("UPDATE customers SET trusted_senders = CAST(:v AS jsonb) WHERE id = :id"),
        {"v": json.dumps(current), "id": str(user.id)},
    )
    await db.commit()
    return {"trusted_senders": current}


# ── Admin-Endpunkte ───────────────────────────────────────────────────────────

@router.post("/provision/{customer_id}")
async def provision_address(
    customer_id: uuid.UUID,
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
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


@router.post("/provision-all", include_in_schema=False)
async def provision_all_emails(
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Customer).where(Customer.baddi_email.is_(None), Customer.is_active.is_(True))
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


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _auth_passed(headers: dict[str, str | list[str]] | None) -> bool:
    if not headers:
        return False
    arc = headers.get("ARC-Authentication-Results", "")
    if isinstance(arc, list):
        arc = " ".join(arc)
    arc_lower = arc.lower()
    if "dkim=pass" in arc_lower and "spf=pass" in arc_lower:
        return True
    spf = headers.get("Received-SPF", "")
    if isinstance(spf, list):
        spf = spf[0] if spf else ""
    return spf.lower().startswith("pass")


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


async def _process_email_as_chat(
    customer_id: str,
    message_text: str,
    reply_to: str,
    reply_subject: str,
) -> None:
    from services.chat_pipeline import load_context, execute_llm, finalize

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Customer).where(Customer.id == uuid.UUID(customer_id))
            )
            customer = result.scalar_one_or_none()
            if not customer:
                log.warning("[Email/Chat] Kunde nicht gefunden: %s", customer_id)
                return

            context = await load_context(customer, message_text, db)
            llm_result = await execute_llm(
                customer=customer,
                message=message_text,
                images=[],
                document_ids=[],
                prior_messages=context["prior_messages"],
                system_prompt=context["system_prompt"],
                db=db,
                doc_cache=context.get("doc_cache"),
                canvas_context=None,
            )

            if llm_result["response_text"] is None:
                log.error("[Email/Chat] Pipeline lieferte kein Ergebnis für %s", customer_id)
                return

            await finalize(
                customer=customer,
                original_message=message_text,
                llm_result=llm_result,
                system_prompt_name=context["system_prompt_name"],
                db=db,
                reply_via_email=reply_to,
                reply_subject=reply_subject,
            )
            log.info("[Email/Chat] Verarbeitet und beantwortet: %s → %s", customer_id, reply_to)

    except Exception as exc:
        log.error("[Email/Chat] Fehler bei der Verarbeitung: %s — %s", customer_id, exc)
