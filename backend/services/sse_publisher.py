"""Redis Pub/Sub Bridge für Server-Sent Events.

Backend-Komponenten publishen Events via `publish_event()`.
Die SSE-Route in events.py subscribed via `subscribe_customer()` und
streamt die Daten als text/event-stream an den Browser.
"""
import json
import redis.asyncio as aioredis
from core.config import settings


async def publish_event(customer_id: str, notification: dict) -> None:
    """Publiziert eine SSE-Notification an alle verbundenen Clients eines Kunden."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    channel = f"buddy_events:{customer_id}"
    await r.publish(channel, json.dumps(notification))
    await r.aclose()


async def subscribe_customer(customer_id: str):
    """Async-Generator: liefert JSON-Strings aus dem Redis-Kanal des Kunden."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"buddy_events:{customer_id}")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield message["data"]
    finally:
        await pubsub.unsubscribe(f"buddy_events:{customer_id}")
        await r.aclose()
