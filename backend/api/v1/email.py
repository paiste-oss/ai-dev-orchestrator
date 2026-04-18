"""
E-Mail-Endpunkte — Baddi per-User-Adressen (@mail.baddi.ch).

Endpunkte:
  POST /v1/email/inbound          — Brevo Inbound Parsing Webhook (kein Auth)
  GET  /v1/email/address          — eigene Baddi-Adresse abrufen (User)
  GET  /v1/email/inbox            — Posteingang (User)
  PUT  /v1/email/inbox/{id}/read  — als gelesen markieren (User)
  POST /v1/email/provision/{id}   — Adresse für User anlegen (Admin)
  POST /v1/email/provision-all    — Bulk-Migration bestehende User (Admin)

Versand ausschliesslich via Baddi-Tools (send_from_baddi_address in email_service.py).
Kein direkter Send-Endpoint für User — verhindert Spam und unkontrollierte Kosten.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import AsyncSessionLocal, get_db
from core.dependencies import get_current_user, require_admin
from models.customer import Customer
from models.email_message import EmailMessage
from services.email_service import provision_baddi_email

log = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/email", tags=["email"])

_BADDI_MAIL_DOMAIN = "mail.baddi.ch"


# ── Pydantic-Schemas ──────────────────────────────────────────────────────────

class InboundItem(BaseModel):
    # Brevo Inbound Parsing Payload — Feldnamen exakt wie dokumentiert (PascalCase)
    MessageId: str | None = None
    InReplyTo: str | None = None
    From: dict[str, str] | str | None = None
    To: list[dict[str, str]] | None = None
    Cc: list[dict[str, str]] | None = None
    Subject: str = ""
    RawTextBody: str | None = None
    RawHtmlBody: str | None = None
    # Brevo-bereinigte Version: Signatur und Zitat-Blöcke entfernt — ideal für Chat
    ExtractedMarkdownMessage: str | None = None
    ExtractedMarkdownSignature: str | None = None
    SpamScore: float | None = None
    Attachments: list[dict[str, Any]] | None = None
    # Headers: Name → string oder Liste von Strings
    Headers: dict[str, str | list[str]] | None = None


class InboundPayload(BaseModel):
    items: list[InboundItem]


def _auth_passed(headers: dict[str, str | list[str]] | None) -> bool:
    """Prüft SPF + DKIM via ARC-Authentication-Results Header."""
    if not headers:
        return False
    arc = headers.get("ARC-Authentication-Results", "")
    if isinstance(arc, list):
        arc = " ".join(arc)
    arc_lower = arc.lower()
    if "dkim=pass" in arc_lower and "spf=pass" in arc_lower:
        return True
    # Fallback: Received-SPF allein
    spf = headers.get("Received-SPF", "")
    if isinstance(spf, list):
        spf = spf[0] if spf else ""
    return spf.lower().startswith("pass")


_SPAM_SCORE_THRESHOLD = 5.0



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
    baddi_action: str | None = None
    replied: bool = False
    archived: bool = False

    model_config = {"from_attributes": True}


# ── Inbound Webhook ───────────────────────────────────────────────────────────

@router.post("/inbound", include_in_schema=False)
async def inbound_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Brevo Inbound Parsing Webhook.
    Brevo POSTet JSON mit `items`-Array für jeden eingehenden E-Mail.

    Routing-Logik:
      - from == customer.email (eigene Adresse) → Chat-Pipeline (BackgroundTask)
      - from in trusted_senders                 → email_messages (für EmailWindow)
      - unbekannte Absender                     → email_messages (Unbekannt-Tab)
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
        from_lower = from_addr.lower()

        # Spam-Filter (rspamd Score — > 5.0 = wahrscheinlich Spam)
        if (item.SpamScore or 0.0) > _SPAM_SCORE_THRESHOLD:
            log.info("[Email/Inbound] Spam ignoriert (Score %.1f): %s", item.SpamScore, from_lower)
            continue

        # Eigene Registrierungs-Email → Chat-Pipeline (erscheint im Chat, nicht im EmailWindow)
        if from_lower == customer.email.lower():
            # ExtractedMarkdownMessage bevorzugen: Brevo-bereinigt (kein Zitat, keine Signatur)
            body = (
                item.ExtractedMarkdownMessage
                or item.RawTextBody
                or item.RawHtmlBody
                or ""
            ).strip()
            if body:
                message_text = (
                    f"[Via E-Mail — Betreff: {item.Subject}]\n\n{body}"
                    if item.Subject else body
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

        # Gesperrte Absender still ignorieren
        blocked_list = [s.lower() for s in (customer.blocked_senders or [])]
        if from_lower in blocked_list:
            log.info("[Email/Inbound] Gesperrter Absender ignoriert: %s", from_lower)
            continue

        trusted_list = [s.lower() for s in (customer.trusted_senders or [])]
        sender_trusted = (
            _auth_passed(item.Headers)        # SPF + DKIM via ARC-Authentication-Results
        ) or (
            from_lower in trusted_list        # User-definierte Whitelist
        )
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
            EmailMessage.archived == False,  # noqa: E712
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


@router.delete("/inbox/{message_id}")
async def delete_inbox_message(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Löscht eine E-Mail aus dem Posteingang."""
    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    await db.delete(msg)
    await db.commit()
    return {"ok": True}


@router.post("/inbox/{message_id}/trust")
async def trust_inbox_sender(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fügt den Absender einer E-Mail zur Trusted-Senders-Liste hinzu."""
    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")

    email = msg.from_address.lower()
    current: list[str] = list(user.trusted_senders or [])
    if email not in [s.lower() for s in current]:
        current.append(email)
        await db.execute(
            text("UPDATE customers SET trusted_senders = CAST(:v AS jsonb) WHERE id = :id"),
            {"v": json.dumps(current), "id": str(user.id)},
        )

    # Alle bisherigen Mails dieses Absenders als trusted markieren
    await db.execute(
        text(
            "UPDATE email_messages SET sender_trusted = true "
            "WHERE customer_id = :cid AND lower(from_address) = :from_addr"
        ),
        {"cid": str(user.id), "from_addr": email},
    )
    await db.commit()
    log.info("[Email] Absender als vertrauenswürdig markiert: %s → %s", user.id, email)
    return {"ok": True, "trusted_senders": current}


@router.post("/inbox/{message_id}/block")
async def block_inbox_sender(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sperrt den Absender und löscht alle seine E-Mails aus dem Posteingang."""
    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")

    email = msg.from_address.lower()
    current: list[str] = list(user.blocked_senders or [])
    if email not in [s.lower() for s in current]:
        current.append(email)
        await db.execute(
            text("UPDATE customers SET blocked_senders = CAST(:v AS jsonb) WHERE id = :id"),
            {"v": json.dumps(current), "id": str(user.id)},
        )

    # Alle Mails dieses Absenders löschen
    await db.execute(
        text(
            "DELETE FROM email_messages "
            "WHERE customer_id = :cid AND lower(from_address) = :from_addr"
        ),
        {"cid": str(user.id), "from_addr": email},
    )
    await db.commit()
    log.info("[Email] Absender gesperrt und E-Mails gelöscht: %s → %s", user.id, email)
    return {"ok": True, "blocked_senders": current}


class ReplyRequest(BaseModel):
    reply_text: str


@router.post("/inbox/{message_id}/reply")
async def reply_to_inbox_message(
    message_id: uuid.UUID,
    req: ReplyRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sendet eine manuelle Antwort auf eine E-Mail über die Baddi-Adresse des Users."""
    from services.email_service import send_from_baddi_address

    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    if not user.baddi_email:
        raise HTTPException(status_code=400, detail="Keine Baddi-E-Mail-Adresse konfiguriert")
    if not req.reply_text.strip():
        raise HTTPException(status_code=422, detail="Antworttext darf nicht leer sein")

    subject = msg.subject if msg.subject.startswith("Re:") else f"Re: {msg.subject}"
    sent = await send_from_baddi_address(
        from_baddi_email=user.baddi_email,
        to_address=msg.from_address,
        subject=subject,
        body_text=req.reply_text.strip(),
    )
    if not sent:
        raise HTTPException(status_code=502, detail="E-Mail konnte nicht gesendet werden")

    # Outbound-Nachricht speichern + Original als beantwortet markieren
    outbound = EmailMessage(
        id=uuid.uuid4(),
        customer_id=user.id,
        direction="outbound",
        from_address=user.baddi_email,
        to_address=msg.from_address,
        subject=subject,
        body_text=req.reply_text.strip(),
        received_at=datetime.now(timezone.utc),
        read=True,
        sender_trusted=True,
    )
    db.add(outbound)
    msg.replied = True
    await db.commit()
    log.info("[Email] Antwort gesendet: %s → %s", user.baddi_email, msg.from_address)
    return {"ok": True}


class RefineRequest(BaseModel):
    instruction: str


@router.post("/inbox/{message_id}/ask-baddi", response_model=EmailMessageOut)
async def ask_baddi(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lässt Baddi einen Antwort-Entwurf für eine E-Mail generieren (speichert in baddi_action)."""
    from services.llm_gateway import chat_with_claude

    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")

    system = (
        "Du bist Baddi, ein persönlicher KI-Assistent. "
        "Analysiere die eingehende E-Mail und schreibe einen Antwort-Entwurf auf Deutsch. "
        "Antworte ausschliesslich mit dem Antworttext selbst — keine Einleitung, "
        "keine Metakommentare, keine Erklärungen."
    )
    prompt = (
        f"Eingehende E-Mail:\nVon: {msg.from_address}\nBetreff: {msg.subject}\n\n"
        f"{msg.body_text or '(kein Inhalt)'}"
    )
    try:
        result = await chat_with_claude(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=system,
        )
        proposal = result.content.strip()
    except Exception as exc:
        log.error("[Email/AskBaddi] LLM-Fehler: %s", exc)
        raise HTTPException(status_code=502, detail="KI nicht erreichbar")

    msg.baddi_action = proposal
    await db.commit()
    await db.refresh(msg)
    log.info("[Email/AskBaddi] Entwurf generiert für Nachricht %s", message_id)
    return msg


@router.post("/inbox/{message_id}/refine", response_model=EmailMessageOut)
async def refine_baddi_proposal(
    message_id: uuid.UUID,
    req: RefineRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Überarbeitet Baddis Entwurf anhand einer User-Anweisung (Mini-Chat)."""
    from services.llm_gateway import chat_with_claude

    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    if not msg.baddi_action:
        raise HTTPException(status_code=400, detail="Kein Entwurf vorhanden")
    if not req.instruction.strip():
        raise HTTPException(status_code=422, detail="Anweisung darf nicht leer sein")

    system = (
        "Du bist Baddi, ein persönlicher KI-Assistent. "
        "Du hast bereits einen E-Mail-Antwort-Entwurf erstellt. "
        "Überarbeite ihn gemäss der Anweisung des Users. "
        "Antworte ausschliesslich mit dem überarbeiteten Antworttext — keine Metakommentare."
    )
    prompt = (
        f"Ursprüngliche E-Mail:\nVon: {msg.from_address}\nBetreff: {msg.subject}\n\n"
        f"{msg.body_text or ''}\n\n"
        f"Bisheriger Entwurf:\n{msg.baddi_action}\n\n"
        f"Anweisung: {req.instruction.strip()}"
    )
    try:
        result = await chat_with_claude(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=system,
        )
        proposal = result.content.strip()
    except Exception as exc:
        log.error("[Email/Refine] LLM-Fehler: %s", exc)
        raise HTTPException(status_code=502, detail="KI nicht erreichbar")

    msg.baddi_action = proposal
    await db.commit()
    await db.refresh(msg)
    return msg


@router.post("/inbox/{message_id}/execute", response_model=EmailMessageOut)
async def execute_baddi_action(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sendet Baddis Entwurf als E-Mail-Antwort."""
    from services.email_service import send_from_baddi_address

    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    if not msg.baddi_action:
        raise HTTPException(status_code=400, detail="Kein Entwurf zum Ausführen")
    if not user.baddi_email:
        raise HTTPException(status_code=400, detail="Keine Baddi-E-Mail konfiguriert")
    if msg.replied:
        raise HTTPException(status_code=409, detail="Bereits ausgeführt")

    subject = msg.subject if msg.subject.startswith("Re:") else f"Re: {msg.subject}"
    sent = await send_from_baddi_address(
        from_baddi_email=user.baddi_email,
        to_address=msg.from_address,
        subject=subject,
        body_text=msg.baddi_action,
        reply_to="no-reply@mail.baddi.ch",
    )
    if not sent:
        raise HTTPException(status_code=502, detail="E-Mail konnte nicht gesendet werden")

    outbound = EmailMessage(
        id=uuid.uuid4(),
        customer_id=user.id,
        direction="outbound",
        from_address=user.baddi_email,
        to_address=msg.from_address,
        subject=subject,
        body_text=msg.baddi_action,
        received_at=datetime.utcnow(),
        read=True,
        sender_trusted=True,
    )
    db.add(outbound)
    msg.replied = True
    await db.commit()
    await db.refresh(msg)
    log.info("[Email/Execute] Baddi-Antwort gesendet: %s → %s", user.baddi_email, msg.from_address)
    return msg


@router.post("/inbox/{message_id}/archive")
async def archive_inbox_message(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archiviert eine E-Mail (aus Hauptansicht ausblenden, nicht löschen)."""
    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    msg.archived = True
    await db.commit()
    return {"ok": True}


# ── Trusted Senders ──────────────────────────────────────────────────────────

class TrustedSenderRequest(BaseModel):
    email: str


@router.get("/trusted-senders")
async def get_trusted_senders(user: Customer = Depends(get_current_user)):
    """Gibt die Whitelist vertrauenswürdiger Absender zurück."""
    return {"trusted_senders": user.trusted_senders or []}


@router.post("/trusted-senders")
async def add_trusted_sender(
    req: TrustedSenderRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fügt eine E-Mail-Adresse zur Trusted-Senders-Liste hinzu."""
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
    """Entfernt eine E-Mail-Adresse aus der Trusted-Senders-Liste."""
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


async def _process_email_as_chat(
    customer_id: str,
    message_text: str,
    reply_to: str,
    reply_subject: str,
) -> None:
    """
    Verarbeitet eine eingehende E-Mail von der eigenen Registrierungs-Adresse des Users
    als normalen Chat-Input. Baddi antwortet im Chat UND schickt die Antwort per E-Mail
    zurück an den User (reply_to).

    Läuft als BackgroundTask — der Inbound-Webhook gibt sofort 200 zurück.
    """
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
