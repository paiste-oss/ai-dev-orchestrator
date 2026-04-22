"""Redis Pub/Sub Bridge für Server-Sent Events + FCM Fallback.

Routing-Logik:
  1. publish_event()  → prüft Redis-Presence des Kunden
  2. ONLINE           → Redis Pub/Sub → offener SSE-Stream → Browser/App
  3. OFFLINE          → FCM Push an alle registrierten Geräte des Kunden

Presence-Management:
  set_presence_online()   — bei SSE-Verbindungsaufbau
  set_presence_offline()  — bei SSE-Verbindungsabbau
  TTL = 90s (verlängert alle 60s durch Heartbeat in events.py)
"""
import json
import logging
import uuid

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings

logger = logging.getLogger(__name__)

_PRESENCE_TTL = 90       # Sekunden bis Presence-Key abläuft (>= Heartbeat-Intervall)
_PRESENCE_PREFIX = "presence:"
_CHANNEL_PREFIX = "buddy_events:"


# ── Presence-Management ───────────────────────────────────────────────────────

async def set_presence_online(customer_id: str) -> None:
    """Markiert den Kunden als online (mit TTL)."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.setex(f"{_PRESENCE_PREFIX}{customer_id}", _PRESENCE_TTL, "online")
    finally:
        await r.aclose()


async def set_presence_offline(customer_id: str) -> None:
    """Entfernt den Presence-Key (Kunde offline)."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.delete(f"{_PRESENCE_PREFIX}{customer_id}")
    finally:
        await r.aclose()


async def refresh_presence(customer_id: str) -> None:
    """TTL zurücksetzen — wird vom SSE-Heartbeat alle 60s aufgerufen."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.expire(f"{_PRESENCE_PREFIX}{customer_id}", _PRESENCE_TTL)
    finally:
        await r.aclose()


async def is_online(customer_id: str) -> bool:
    """Gibt True zurück wenn der Kunde einen aktiven SSE-Stream hat."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        return bool(await r.exists(f"{_PRESENCE_PREFIX}{customer_id}"))
    finally:
        await r.aclose()


# ── Event Publishing ──────────────────────────────────────────────────────────

async def publish_event(
    customer_id: str,
    notification: dict,
    *,
    push_title: str = "Neue Nachricht von Baddi",
    push_body: str | None = None,
    db: AsyncSession | None = None,
) -> None:
    """Publiziert ein Event an den Kunden — online via SSE, offline via FCM.

    Args:
        customer_id:  UUID des Kunden als String.
        notification: JSON-serialisierbares Payload.
        push_title:   FCM-Benachrichtigungstitel (nur wenn offline).
        push_body:    FCM-Benachrichtigungstext. Wenn None: erster Text aus payload.
        db:           SQLAlchemy AsyncSession (für FCM-Token-Lookup). Wenn None,
                      wird eine neue Session geöffnet.
    """
    online = await is_online(customer_id)

    if online:
        await _publish_sse(customer_id, notification)
    else:
        await _push_fcm(customer_id, notification, push_title, push_body, db)


async def _publish_sse(customer_id: str, notification: dict) -> None:
    """Publiziert via Redis Pub/Sub an alle offenen SSE-Verbindungen."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.publish(f"{_CHANNEL_PREFIX}{customer_id}", json.dumps(notification))
    except Exception as exc:
        logger.error("SSE Publish fehlgeschlagen (customer=%s): %s", customer_id, exc)
    finally:
        await r.aclose()


async def _push_fcm(
    customer_id: str,
    notification: dict,
    title: str,
    body: str | None,
    db: AsyncSession | None,
) -> None:
    """Holt FCM-Tokens aus DB und sendet Push-Notification."""
    from services.fcm_service import send_push_multicast
    from models.device_token import DeviceToken

    # Body aus Payload ableiten wenn nicht explizit angegeben
    if body is None:
        body = notification.get("message") or notification.get("text") or title

    # DB-Session öffnen falls nicht übergeben
    _close_db = False
    if db is None:
        from core.database import AsyncSessionLocal
        db = AsyncSessionLocal()
        _close_db = True

    try:
        result = await db.execute(
            select(DeviceToken.token).where(
                DeviceToken.customer_id == uuid.UUID(customer_id),
                DeviceToken.platform.in_(["ios", "android"]),
            )
        )
        tokens = [row[0] for row in result.fetchall()]

        if not tokens:
            logger.debug("FCM: Keine Tokens für customer=%s", customer_id)
            return

        ok, fail = await send_push_multicast(
            tokens=tokens,
            title=title,
            body=str(body),
            data={"payload": json.dumps(notification)},
        )
        logger.info(
            "FCM Fallback: customer=%s tokens=%d ok=%d fail=%d",
            customer_id, len(tokens), ok, fail,
        )
    except Exception as exc:
        logger.error("FCM Fallback fehlgeschlagen (customer=%s): %s", customer_id, exc)
    finally:
        if _close_db:
            await db.aclose()


# ── SSE Subscribe (unverändert) ────────────────────────────────────────────────

async def subscribe_customer(customer_id: str):
    """Async-Generator: liefert JSON-Strings aus dem Redis-Kanal des Kunden."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"{_CHANNEL_PREFIX}{customer_id}")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield message["data"]
    finally:
        await pubsub.unsubscribe(f"{_CHANNEL_PREFIX}{customer_id}")
        await r.aclose()
