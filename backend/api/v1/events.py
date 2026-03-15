"""
Event-Eingang von n8n und SSE-Stream zum Frontend.

POST /v1/agent/event        ← n8n webhook (mit X-N8N-Secret Header)
GET  /v1/agent/events/stream ← Frontend EventSource (SSE)
GET  /v1/agent/events        ← Event-History für einen Kunden
"""
import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from models.buddy_event import BuddyEvent
from services.buddy_event_service import process_event
from services.sse_publisher import subscribe_customer

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class EventPayload(BaseModel):
    source: str                # email|calendar|news|weather|government
    source_id: str             # Dedup-Key von n8n
    summary: str               # Kurze Zusammenfassung (max 500 Zeichen)
    priority: str = "medium"   # low|medium|high|urgent
    buddy_id: str | None = None
    customer_id: str | None = None
    timestamp: str | None = None
    details: dict = {}


# ── Endpunkte ─────────────────────────────────────────────────────────────────

@router.post("/agent/event", status_code=202)
async def receive_event(
    payload: EventPayload,
    x_n8n_secret: str | None = Header(None, alias="X-N8N-Secret"),
    db: AsyncSession = Depends(get_db),
):
    """n8n sendet hier Events — Email, Kalender, News, Wetter, Behörden."""
    # Authentifizierung via Shared Secret
    if settings.n8n_webhook_secret:
        if x_n8n_secret != settings.n8n_webhook_secret:
            raise HTTPException(status_code=401, detail="Ungültiges Webhook-Secret")

    result = await process_event(payload.model_dump(), db)
    return {"status": "accepted", **result}


@router.get("/agent/events/stream")
async def stream_events(customer_id: UUID, request: Request):
    """
    Server-Sent Events für den Browser.
    Frontend: new EventSource('/v1/agent/events/stream?customer_id=...')
    """
    async def event_generator():
        # Keepalive-Ping alle 25s (verhindert Browser/Proxy-Timeout)
        keepalive_task = None

        async def keepalive():
            while True:
                await asyncio.sleep(25)
                yield  # Signal

        try:
            async for data in subscribe_customer(str(customer_id)):
                if await request.is_disconnected():
                    break
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            pass

    async def generator_with_keepalive():
        sub = subscribe_customer(str(customer_id))
        pending_ping = asyncio.create_task(asyncio.sleep(25))

        async def get_next():
            return await sub.__anext__()

        pending_msg = asyncio.create_task(get_next())

        try:
            while True:
                if await request.is_disconnected():
                    break

                done, _ = await asyncio.wait(
                    [pending_msg, pending_ping],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if pending_ping in done:
                    yield 'data: {"type":"ping"}\n\n'
                    pending_ping = asyncio.create_task(asyncio.sleep(25))

                if pending_msg in done:
                    try:
                        data = pending_msg.result()
                        yield f"data: {data}\n\n"
                        pending_msg = asyncio.create_task(get_next())
                    except StopAsyncIteration:
                        break
        except Exception:
            pass
        finally:
            pending_ping.cancel()
            pending_msg.cancel()

    return StreamingResponse(
        generator_with_keepalive(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/agent/events")
async def get_events(
    customer_id: UUID,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Letzte Events für einen Kunden (für History-Ansicht im Frontend)."""
    result = await db.execute(
        select(BuddyEvent)
        .where(BuddyEvent.customer_id == customer_id)
        .order_by(desc(BuddyEvent.created_at))
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "source": e.source,
            "summary": e.summary,
            "priority": e.priority,
            "decision": e.decision,
            "message": e.llm_message,
            "action": e.action_taken,
            "pushed": e.pushed_to_sse,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]
