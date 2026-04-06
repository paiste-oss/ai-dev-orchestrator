"""
Support Ticket Admin API — erstellt und listet Support-Tickets aus info@baddi.ch.
Wird von n8n nach jeder klassifizierten Email aufgerufen.
"""
from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from core.database import AsyncSessionLocal
from core.dependencies import require_admin
from models.customer import Customer
from models.support_ticket import SupportTicket

router = APIRouter(prefix="/support", tags=["support"])


class CreateTicketRequest(BaseModel):
    email_from: str
    email_subject: str
    email_text: str = ""
    kategorie: str = "support"
    dringlichkeit: str = "mittel"
    confidence: float = 0.0
    zusammenfassung: str = ""
    antwort_entwurf: str = ""
    auto_replied: bool = False


async def _next_ticket_number(db) -> str:
    """Generiert fortlaufende Ticket-Nummer: BADDI-YYYYMMDD-XXXX."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"BADDI-{today}-"
    result = await db.execute(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.ticket_number.like(f"{prefix}%")
        )
    )
    count = result.scalar() or 0
    return f"{prefix}{str(count + 1).zfill(4)}"


@router.post("/tickets")
async def create_ticket(body: CreateTicketRequest):
    """Erstellt ein neues Support-Ticket. Kein Auth erforderlich — nur intern von n8n."""
    async with AsyncSessionLocal() as db:
        ticket_number = await _next_ticket_number(db)
        ticket = SupportTicket(
            ticket_number=ticket_number,
            email_from=body.email_from,
            email_subject=body.email_subject,
            email_text=body.email_text,
            kategorie=body.kategorie,
            dringlichkeit=body.dringlichkeit,
            confidence=body.confidence,
            zusammenfassung=body.zusammenfassung,
            antwort_entwurf=body.antwort_entwurf,
            auto_replied=body.auto_replied,
        )
        db.add(ticket)
        await db.commit()
        await db.refresh(ticket)
    return {
        "ticket_number": ticket.ticket_number,
        "id": str(ticket.id),
    }


@router.get("/tickets")
async def list_tickets(
    limit: int = Query(default=50, le=200),
    status: str | None = Query(default=None),
    _: Customer = Depends(require_admin),
):
    """Listet alle Support-Tickets (neueste zuerst)."""
    async with AsyncSessionLocal() as db:
        q = select(SupportTicket).order_by(desc(SupportTicket.created_at)).limit(limit)
        if status:
            q = q.where(SupportTicket.status == status)
        result = await db.execute(q)
        tickets = result.scalars().all()
    return [
        {
            "id":               str(t.id),
            "ticket_number":    t.ticket_number,
            "created_at":       t.created_at.isoformat(),
            "email_from":       t.email_from,
            "email_subject":    t.email_subject,
            "kategorie":        t.kategorie,
            "dringlichkeit":    t.dringlichkeit,
            "confidence":       t.confidence,
            "zusammenfassung":  t.zusammenfassung,
            "antwort_entwurf":  t.antwort_entwurf,
            "status":           t.status,
            "auto_replied":     t.auto_replied,
        }
        for t in tickets
    ]


@router.patch("/tickets/{ticket_number}/status")
async def update_ticket_status(
    ticket_number: str,
    body: dict,
    _: Customer = Depends(require_admin),
):
    """Setzt Status eines Tickets (offen → beantwortet → geschlossen)."""
    new_status = body.get("status")
    if new_status not in ("offen", "beantwortet", "geschlossen"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Ungültiger Status")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SupportTicket).where(SupportTicket.ticket_number == ticket_number)
        )
        ticket = result.scalar_one_or_none()
        if not ticket:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Ticket nicht gefunden")
        ticket.status = new_status
        await db.commit()
    return {"ticket_number": ticket_number, "status": new_status}
