"""
Router-Gedächtnis — Redis-basiertes Lern-System für den Agent Router.

Der Router speichert nach jeder Verarbeitung ob ein Uhrwerk-Endpunkt
(Tool / Agent / Workflow) für einen bestimmten Intent funktioniert hat.

Bei der nächsten ähnlichen Anfrage schaut der Router hier zuerst nach
und wählt direkt den bewährtesten Endpunkt — ohne erneutes Raten.

Schema in Redis:
  router:learned:{intent}  →  JSON: { "tool_key": { count, failures, last_used } }

  router:gap:{intent}      →  JSON: { message, count, first_seen }
    → Bereits gemeldete Gaps nicht doppelt melden
"""
from __future__ import annotations
import json
import logging
import time
from typing import Optional

_log = logging.getLogger(__name__)

_LEARNED_TTL = 30 * 24 * 3600   # 30 Tage
_GAP_TTL     =  7 * 24 * 3600   # 7 Tage Cooldown für gleichen Gap

_redis_client = None

def _r():
    global _redis_client
    if _redis_client is None:
        import redis as redis_lib
        from core.config import settings
        _redis_client = redis_lib.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


# ── Erfolg / Misserfolg melden ────────────────────────────────────────────────

def record_success(intent: str, route_key: str) -> None:
    """Notiert: route_key hat für diesen Intent funktioniert."""
    try:
        r = _r()
        key = f"router:learned:{intent}"
        data: dict = json.loads(r.get(key) or "{}")
        entry = data.get(route_key, {"count": 0, "failures": 0, "last_used": 0})
        entry["count"] += 1
        entry["last_used"] = int(time.time())
        data[route_key] = entry
        r.setex(key, _LEARNED_TTL, json.dumps(data))
    except Exception as e:
        _log.warning("record_success fehlgeschlagen (%s/%s): %s", intent, route_key, e)


def record_failure(intent: str, route_key: str) -> None:
    """Notiert: route_key hat für diesen Intent versagt."""
    try:
        r = _r()
        key = f"router:learned:{intent}"
        data: dict = json.loads(r.get(key) or "{}")
        entry = data.get(route_key, {"count": 0, "failures": 0, "last_used": 0})
        entry["failures"] = entry.get("failures", 0) + 1
        entry["last_used"] = int(time.time())
        data[route_key] = entry
        r.setex(key, _LEARNED_TTL, json.dumps(data))
    except Exception as e:
        _log.warning("record_failure fehlgeschlagen (%s/%s): %s", intent, route_key, e)


# ── Beste Route abfragen ──────────────────────────────────────────────────────

def get_best_route(intent: str) -> Optional[str]:
    """
    Gibt den bewährtesten Tool-Key für diesen Intent zurück.
    Score = count - failures. Nur wenn Score > 0.
    """
    try:
        r = _r()
        raw = r.get(f"router:learned:{intent}")
        if not raw:
            return None
        data: dict = json.loads(raw)
        if not data:
            return None
        best_key, best_score = None, -1
        for key, stats in data.items():
            score = stats.get("count", 0) - stats.get("failures", 0)
            if score > best_score:
                best_score = score
                best_key = key
        return best_key if best_score > 0 else None
    except Exception:
        return None


def get_learned_stats(intent: str) -> dict:
    """Alle gelernten Routen für einen Intent (für Debugging / Admin)."""
    try:
        r = _r()
        raw = r.get(f"router:learned:{intent}")
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


# ── Gap-Deduplication ─────────────────────────────────────────────────────────

def should_create_gap(intent: str, message: str) -> bool:
    """
    Prüft ob für diesen Intent in den letzten 7 Tagen bereits
    ein Capability Request erstellt wurde.
    Verhindert Spam beim gleichen fehlenden Feature.
    """
    try:
        r = _r()
        key = f"router:gap:{intent}"
        exists = r.get(key)
        if not exists:
            # Ersten Gap immer melden, Cooldown setzen
            r.setex(key, _GAP_TTL, json.dumps({
                "message": message[:200],
                "count": 1,
                "first_seen": int(time.time()),
            }))
            return True
        # Bereits gemeldet: Counter erhöhen aber keinen neuen Request
        data = json.loads(exists)
        data["count"] = data.get("count", 1) + 1
        r.setex(key, _GAP_TTL, json.dumps(data))
        return False
    except Exception:
        return True  # Im Zweifel immer melden


def clear_gap_cooldown(intent: str) -> None:
    """Gap-Cooldown zurücksetzen (z.B. nach Deployment eines neuen Tools)."""
    try:
        _r().delete(f"router:gap:{intent}")
    except Exception:
        pass
