"""
Event-Eingang von n8n, SSE-Stream und WebSocket zum Frontend.

POST /v1/agent/event          ← n8n webhook (mit X-N8N-Secret Header)
GET  /v1/agent/events/stream  ← Frontend EventSource (SSE, Legacy)
WS   /v1/agent/events/ws      ← WebSocket (bevorzugt, JWT via ?token=)
GET  /v1/agent/events         ← Event-History für einen Kunden
"""
import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.security import decode_access_token
from models.buddy_event import BuddyEvent
from services.buddy_event_service import process_event
from services.sse_publisher import subscribe_customer, set_presence_online, set_presence_offline, refresh_presence

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
    _cid = str(customer_id)

    async def generator_with_keepalive():
        await set_presence_online(_cid)
        sub = subscribe_customer(_cid)
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
                    await refresh_presence(_cid)
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
            await set_presence_offline(_cid)

    return StreamingResponse(
        generator_with_keepalive(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.websocket("/agent/events/ws")
async def ws_events(websocket: WebSocket, token: str | None = None, customer_id: UUID | None = None):
    """
    WebSocket-Endpoint für Echtzeit-Notifications.
    Auth: JWT via ?token=<access_token>
    Alternativ: ?customer_id=<uuid> (ohne Auth, nur für interne/lokale Nutzung wenn kein secret konfiguriert)

    Protokoll:
      Server → Client: JSON-Objekte (Notifications oder {"type":"ping"})
      Client → Server: wird ignoriert (unidirektional)
    """
    # JWT-Auth
    if token:
        try:
            payload = decode_access_token(token)
            customer_id_str = payload.get("sub")
            if not customer_id_str:
                await websocket.close(code=4001)
                return
        except JWTError:
            await websocket.close(code=4001)
            return
    elif customer_id:
        customer_id_str = str(customer_id)
    else:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    await set_presence_online(customer_id_str)

    sub = subscribe_customer(customer_id_str)
    ping_task: asyncio.Task | None = None
    msg_task: asyncio.Task | None = None

    async def get_next_msg():
        return await sub.__anext__()

    try:
        ping_task = asyncio.create_task(asyncio.sleep(30))
        msg_task = asyncio.create_task(get_next_msg())

        while True:
            done, _ = await asyncio.wait(
                [msg_task, ping_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            if ping_task in done:
                await websocket.send_text(json.dumps({"type": "ping"}))
                await refresh_presence(customer_id_str)
                ping_task = asyncio.create_task(asyncio.sleep(30))

            if msg_task in done:
                try:
                    data = msg_task.result()
                    await websocket.send_text(data)
                    msg_task = asyncio.create_task(get_next_msg())
                except StopAsyncIteration:
                    break

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if ping_task and not ping_task.done():
            ping_task.cancel()
        if msg_task and not msg_task.done():
            msg_task.cancel()
        await set_presence_offline(customer_id_str)
        try:
            await websocket.close()
        except Exception:
            pass


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
