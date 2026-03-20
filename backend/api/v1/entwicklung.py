"""
Entwicklung API — Verwaltung von Capability Requests.

Wenn das Uhrwerk eine Kundenanfrage nicht erfüllen kann, landet sie hier.
Der Admin und das Uhrwerk arbeiten gemeinsam daran, das Tool zu entwickeln.
"""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from core.database import get_db
from core.dependencies import require_admin
from models.capability_request import CapabilityRequest
from models.customer import Customer

router = APIRouter(prefix="/entwicklung", tags=["entwicklung"])

STATUS_LABELS = {
    "pending":      "Ausstehend",
    "analyzing":    "Wird analysiert",
    "needs_input":  "Admin-Input benötigt",
    "building":     "In Entwicklung",
    "testing":      "Wird getestet",
    "ready":        "Bereit zum Deployen",
    "deployed":     "Im Uhrwerk aktiv",
    "rejected":     "Abgelehnt",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class CapabilityRequestOut(BaseModel):
    id: str
    customer_id: str
    buddy_id: Optional[str]
    original_message: str
    detected_intent: Optional[str]
    status: str
    status_label: str
    tool_proposal: Optional[dict]
    dialog: list
    admin_notes: Optional[str]
    deployed_tool_key: Optional[str]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class DialogMessage(BaseModel):
    content: str  # Admin-Nachricht


class StatusUpdate(BaseModel):
    status: str
    admin_notes: Optional[str] = None


class DeployTool(BaseModel):
    tool_key: str
    tool_proposal: dict  # Finales Tool-Schema


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_out(r: CapabilityRequest) -> CapabilityRequestOut:
    return CapabilityRequestOut(
        id=str(r.id),
        customer_id=r.customer_id,
        buddy_id=r.buddy_id,
        original_message=r.original_message,
        detected_intent=r.detected_intent,
        status=r.status,
        status_label=STATUS_LABELS.get(r.status, r.status),
        tool_proposal=r.tool_proposal,
        dialog=r.dialog or [],
        admin_notes=r.admin_notes,
        deployed_tool_key=r.deployed_tool_key,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_requests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Alle Capability Requests — für die Admin Entwicklungs-Seite."""
    offset = (page - 1) * page_size
    q = select(CapabilityRequest)
    if status:
        q = q.where(CapabilityRequest.status == status)
    q = q.order_by(CapabilityRequest.created_at.desc())

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0

    q = q.offset(offset).limit(page_size)
    result = await db.execute(q)
    items = result.scalars().all()

    # Status-Zusammenfassung
    stats_result = await db.execute(
        text("SELECT status, COUNT(*) FROM capability_requests GROUP BY status")
    )
    stats = {row[0]: row[1] for row in stats_result.all()}

    return {
        "items": [_to_out(r) for r in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "stats": stats,
    }


@router.get("/{request_id}", response_model=CapabilityRequestOut)
async def get_request(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    r = await db.get(CapabilityRequest, uuid.UUID(request_id))
    if not r:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    return _to_out(r)


@router.post("/{request_id}/dialog", response_model=CapabilityRequestOut)
async def admin_dialog_message(
    request_id: str,
    msg: DialogMessage,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Admin sendet eine Nachricht — Uhrwerk antwortet mit echtem Claude-Response."""
    r = await db.get(CapabilityRequest, uuid.UUID(request_id))
    if not r:
        raise HTTPException(status_code=404, detail="Nicht gefunden")

    dialog = list(r.dialog or [])
    dialog.append({
        "role": "admin",
        "content": msg.content,
        "created_at": datetime.utcnow().isoformat(),
    })

    if r.status == "needs_input":
        r.status = "building"

    r.dialog = dialog
    r.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(r)

    # Uhrwerk antwortet im Hintergrund mit echtem Claude-Response
    from services.entwicklung_engine import schedule_uhrwerk_reply
    schedule_uhrwerk_reply(str(r.id))

    return _to_out(r)


@router.patch("/{request_id}/status", response_model=CapabilityRequestOut)
async def update_status(
    request_id: str,
    data: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """Status manuell setzen (z.B. rejected)."""
    valid = set(STATUS_LABELS.keys())
    if data.status not in valid:
        raise HTTPException(status_code=400, detail=f"Ungültiger Status. Erlaubt: {valid}")
    r = await db.get(CapabilityRequest, uuid.UUID(request_id))
    if not r:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    r.status = data.status
    if data.admin_notes:
        r.admin_notes = data.admin_notes
    r.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(r)
    return _to_out(r)


@router.post("/{request_id}/deploy", response_model=CapabilityRequestOut)
async def deploy_tool(
    request_id: str,
    data: DeployTool,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    """
    Developed tool ins Uhrwerk deployen.
    Speichert das Tool in der Dynamic Tool Registry (Redis).
    """
    import redis as redis_lib, json
    from core.config import settings

    r = await db.get(CapabilityRequest, uuid.UUID(request_id))
    if not r:
        raise HTTPException(status_code=404, detail="Nicht gefunden")

    # Tool in Redis Dynamic Registry speichern
    try:
        red = redis_lib.from_url(settings.redis_url, decode_responses=True)
        red.hset("uhrwerk:dynamic_tools", data.tool_key, json.dumps(data.tool_proposal))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Redis-Fehler: {e}")

    r.status = "deployed"
    r.deployed_tool_key = data.tool_key
    r.tool_proposal = data.tool_proposal
    r.updated_at = datetime.utcnow()

    dialog = list(r.dialog or [])
    dialog.append({
        "role": "uhrwerk",
        "content": f"✅ Tool '{data.tool_key}' wurde erfolgreich ins Uhrwerk deployed. "
                   f"Kunden können diese Fähigkeit ab sofort nutzen.",
        "created_at": datetime.utcnow().isoformat(),
    })
    r.dialog = dialog

    await db.commit()
    await db.refresh(r)
    return _to_out(r)


@router.post("/internal/create", include_in_schema=False)
async def create_capability_request(
    customer_id: str,
    buddy_id: Optional[str],
    message: str,
    intent: Optional[str],
    db: AsyncSession = Depends(get_db),
):
    """Intern: Wird vom Chat-Endpoint aufgerufen wenn Agent Router eine Lücke findet."""
    req = CapabilityRequest(
        customer_id=customer_id,
        buddy_id=buddy_id,
        original_message=message,
        detected_intent=intent,
        status="pending",
        dialog=[{
            "role": "uhrwerk",
            "content": (
                f"Neue Anfrage eingegangen: \"{message[:120]}{'...' if len(message) > 120 else ''}\"\n"
                f"Erkannter Intent: {intent or 'unbekannt'}\n"
                f"Ich analysiere was dafür benötigt wird..."
            ),
            "created_at": datetime.utcnow().isoformat(),
        }],
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req
