"""
Zentraler Redis-Client — einmal initialisiert, überall importierbar.
Ersetzt die 12+ lokalen `redis_lib.from_url(settings.redis_url, ...)` Aufrufe.

Verwendung:
    from core.redis_client import redis_sync   # sync (redis-py)
    from core.redis_client import get_async_redis  # async (aioredis)
"""
import redis as _redis_sync
import redis.asyncio as _aioredis
from core.config import settings

# ── Sync Redis (für alle synchronen API-Routes und Services) ──────────────────
_sync_client: "_redis_sync.Redis | None" = None


def redis_sync() -> "_redis_sync.Redis":
    """Gibt den gecachten synchronen Redis-Client zurück."""
    global _sync_client
    if _sync_client is None:
        _sync_client = _redis_sync.from_url(settings.redis_url, decode_responses=True)
    return _sync_client


# ── Async Redis (für SSE, async Endpoints) ────────────────────────────────────
async def get_async_redis() -> "_aioredis.Redis":
    """Erstellt eine async Redis-Verbindung (für SSE und async Contexts)."""
    return _aioredis.from_url(settings.redis_url, decode_responses=True)
