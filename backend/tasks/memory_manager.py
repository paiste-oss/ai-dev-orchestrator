"""
Memory Manager — Celery Task.

Läuft im Hintergrund nach jeder Chat-Antwort:
  1. Liest letzte 5-6 Nachrichten aus Redis (chat:recent:{customer_id})
  2. Analysiert den Verlauf mit Ollama (schnelles lokales Modell)
  3. Extrahiert dauerhafte Fakten über den Nutzer
  4. Speichert Fakten als Vektoren in Qdrant (customer_memories)
  5. Speichert Fakten auch als MemoryItems in PostgreSQL (Rückwärtskompatibilität)
"""
import json
import logging
import time

import httpx
import redis as redis_lib

from core.config import settings
from tasks.celery_app import celery_app

_log = logging.getLogger(__name__)

_REDIS_KEY = "chat:recent:{customer_id}"
_SYSTEM_PROMPT = """\
Du bist ein Memory-Extraktor für einen persönlichen KI-Assistenten.

Analysiere den folgenden Gesprächsausschnitt und extrahiere bis zu 5 wichtige, \
dauerhafte Fakten über den NUTZER (nicht über den Assistenten).

Extrahiere NUR:
- Namen, Beruf, Wohnort, Familie
- Vorlieben, Abneigungen, Gewohnheiten
- Wichtige Lebenssituationen, Ziele, Herausforderungen
- Wiederkehrende Präferenzen (z. B. Kommunikationsstil, Sprache)

Extrahiere NICHT:
- Einmalige Fragen oder Anfragen
- Allgemeine Themen ohne Bezug zum Nutzer
- Inhalte die der Assistent generiert hat

Antworte NUR mit einer JSON-Liste von kurzen Sätzen auf Deutsch.
Beispiel: ["Nutzer heißt Christoph", "Arbeitet als Architekt", "Bevorzugt kurze Antworten"]
Wenn keine relevanten Fakten vorhanden: []\
"""


@celery_app.task(
    name="tasks.memory_manager.process_memory",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    ignore_result=True,
)
def process_memory(self, customer_id: str) -> None:
    """Hintergrund-Aufgabe: Gedächtnis aus letzten Nachrichten extrahieren."""
    try:
        _run(customer_id)
    except Exception as exc:
        _log.warning("Memory manager failed for %s: %s", customer_id[:8], exc)
        raise self.retry(exc=exc)


def _run(customer_id: str) -> None:
    # 1. Kurzzeitgedächtnis aus Redis lesen
    r = redis_lib.from_url(settings.redis_url, decode_responses=True)
    raw_msgs = r.lrange(_REDIS_KEY.format(customer_id=customer_id), 0, 11)
    if not raw_msgs:
        return

    # Älteste zuerst (Redis LPUSH = neueste zuerst)
    messages = [json.loads(m) for m in reversed(raw_msgs)]
    conversation = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )

    # 2. Fakten extrahieren via Ollama
    facts = _extract_facts(conversation)
    if not facts:
        return

    _log.info("Extracted %d facts for customer %s", len(facts), customer_id[:8])

    # 3. In Qdrant speichern (Vektoren)
    try:
        from services.memory_vector_store import store_memory_facts
        store_memory_facts(customer_id, facts)
    except Exception as exc:
        _log.warning("Qdrant store failed: %s", exc)

    # 4. In PostgreSQL speichern (MemoryItems — Rückwärtskompatibilität)
    try:
        _save_to_postgres(customer_id, facts)
    except Exception as exc:
        _log.warning("PostgreSQL memory store failed: %s", exc)


def _extract_facts(conversation: str) -> list[str]:
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": settings.ollama_chat_model,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": conversation},
                ],
                "stream": False,
            },
            timeout=45.0,
        )
        resp.raise_for_status()
        text = resp.json().get("message", {}).get("content", "[]")
        start, end = text.find("["), text.rfind("]") + 1
        if start >= 0 and end > start:
            facts = json.loads(text[start:end])
            return [f for f in facts if isinstance(f, str) and f.strip()]
    except Exception as exc:
        _log.warning("Ollama fact extraction failed: %s", exc)
    return []


def _save_to_postgres(customer_id: str, facts: list[str]) -> None:
    """Speichert Fakten als MemoryItems in PostgreSQL via asyncio.run()."""
    import asyncio
    asyncio.run(_save_async(customer_id, facts))


async def _save_async(customer_id: str, facts: list[str]) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from models.chat import MemoryItem

    engine = create_async_engine(settings.database_url, pool_size=1, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        for fact in facts[:5]:
            if isinstance(fact, str) and fact.strip():
                db.add(MemoryItem(customer_id=customer_id, content=fact.strip(), importance=0.7))
        await db.commit()
    await engine.dispose()
