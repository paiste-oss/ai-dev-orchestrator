"""
Zentraler Redis-Client — einmal initialisiert, überall importierbar.

Verwendung:
    from core.redis_client import redis_sync      # sync (redis-py, Celery/Tasks)
    from core.redis_client import get_async_redis  # async (FastAPI Endpoints, SSE)
"""
import redis as _redis_sync
import redis.asyncio as _aioredis
from core.config import settings

# ── Sync Redis (Celery Tasks, synchrone Services) ─────────────────────────────
_sync_client: "_redis_sync.Redis | None" = None


def redis_sync() -> "_redis_sync.Redis":
    """Gibt den gecachten synchronen Redis-Client zurück (Connection Pool)."""
    global _sync_client
    if _sync_client is None:
        _sync_client = _redis_sync.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
    return _sync_client


# ── Async Redis (FastAPI Endpoints, SSE) ──────────────────────────────────────
# Singleton — wird einmal pro Prozess erstellt und wiederverwendet.
# aioredis.from_url() erstellt intern einen ConnectionPool.
_async_client: "_aioredis.Redis | None" = None


async def get_async_redis() -> "_aioredis.Redis":
    """Gibt den gecachten asynchronen Redis-Client zurück (Connection Pool)."""
    global _async_client
    if _async_client is None:
        _async_client = _aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
    return _async_client
