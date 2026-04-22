"""
E-Mail Inbox-Endpoints — alle CRUD-Operationen auf dem Posteingang eines Users.

Gemountet unter dem email-Router (prefix /email) in email.py.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.email_message import EmailMessage

import logging
log = logging.getLogger("uvicorn.error")

router = APIRouter()


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


class ReplyRequest(BaseModel):
    reply_text: str


class RefineRequest(BaseModel):
    instruction: str


@router.get("/inbox", response_model=list[EmailMessageOut])
async def get_inbox(
    limit: int = 50,
    unread_only: bool = False,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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


@router.post("/inbox/{message_id}/reply")
async def reply_to_inbox_message(
    message_id: uuid.UUID,
    req: ReplyRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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


@router.post("/inbox/{message_id}/ask-baddi", response_model=EmailMessageOut)
async def ask_baddi(
    message_id: uuid.UUID,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    return msg


@router.post("/inbox/{message_id}/refine", response_model=EmailMessageOut)
async def refine_baddi_proposal(
    message_id: uuid.UUID,
    req: RefineRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    msg = await db.get(EmailMessage, message_id)
    if not msg or msg.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    msg.archived = True
    await db.commit()
    return {"ok": True}
