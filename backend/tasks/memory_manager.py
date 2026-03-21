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
_CONFIG_KEY = "memory_manager:config"
_DEFAULT_MODEL = settings.ollama_chat_model
_DEFAULT_PROMPT = (
    "Du bist ein Memory-Extraktor für einen persönlichen KI-Assistenten.\n\n"
    "Analysiere NUR die USER-Nachrichten und extrahiere dauerhafte, persönliche Fakten über den NUTZER.\n\n"
    "Extrahiere NUR:\n"
    "- Name, Beruf, Wohnort, Familie, Beziehungen\n"
    "- Persönliche Vorlieben, Abneigungen, Gewohnheiten\n"
    "- Wichtige Lebenssituationen, Ziele, Herausforderungen\n"
    "- Kommunikationspräferenzen (z. B. Sprache, Anredeform)\n\n"
    "Extrahiere NIEMALS:\n"
    "- Fakten aus Suchergebnissen, Nachrichten oder Web-Inhalten (das sind nicht Nutzer-Fakten!)\n"
    "- Einmalige Fragen oder Anfragen ohne persönlichen Bezug\n"
    "- Fähigkeiten oder Eigenschaften des Assistenten\n"
    "- Fakten die bereits im Abschnitt 'BEREITS BEKANNTE FAKTEN' stehen\n\n"
    "Antworte NUR mit einer JSON-Liste auf Deutsch. Maximal 3 neue Fakten.\n"
    'Beispiel: ["Nutzer heißt Christoph", "Lebt mit Partnerin Evelyn zusammen"]\n'
    "Wenn keine NEUEN Fakten vorhanden: []"
)


def _load_config(r: redis_lib.Redis) -> tuple[str, str]:
    """Lädt Modell + Prompt aus Redis (Admin-Konfiguration)."""
    try:
        raw = r.get(_CONFIG_KEY)
        if raw:
            cfg = json.loads(raw)
            return cfg.get("model", _DEFAULT_MODEL), cfg.get("system_prompt", _DEFAULT_PROMPT)
    except Exception:
        pass
    return _DEFAULT_MODEL, _DEFAULT_PROMPT


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


def _check_memory_consent(customer_id: str) -> bool:
    """Prüft ob der Kunde dem Langzeitgedächtnis zugestimmt hat."""
    import asyncio
    return asyncio.run(_check_consent_async(customer_id))


async def _check_consent_async(customer_id: str) -> bool:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select as sa_select
    from models.customer import Customer

    engine = create_async_engine(settings.database_url, pool_size=1, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            result = await db.execute(
                sa_select(Customer.memory_consent).where(Customer.id == customer_id)
            )
            row = result.scalar_one_or_none()
            return bool(row) if row is not None else True
    finally:
        await engine.dispose()


def _run(customer_id: str) -> None:
    # 0. Einwilligung prüfen (revDSG)
    if not _check_memory_consent(customer_id):
        _log.info("Memory Manager übersprungen — kein Consent für %s", customer_id[:8])
        return

    # 1. Kurzzeitgedächtnis aus Redis lesen
    r = redis_lib.from_url(settings.redis_url, decode_responses=True)
    raw_msgs = r.lrange(_REDIS_KEY.format(customer_id=customer_id), 0, 11)
    if not raw_msgs:
        return

    # Älteste zuerst (Redis LPUSH = neueste zuerst)
    messages = [json.loads(m) for m in reversed(raw_msgs)]

    # NUR User-Nachrichten analysieren — Assistent-Antworten enthalten keine User-Fakten
    # und können Nachrichten-Inhalte, Web-Suchergebnisse etc. enthalten.
    user_messages = [m for m in messages if m.get("role") == "user"]
    if not user_messages:
        return
    conversation = "\n".join(f"USER: {m['content']}" for m in user_messages)

    # 2. Konfiguration laden (Modell + Prompt aus Redis/Admin)
    model, system_prompt = _load_config(r)

    # 3. Bereits bekannte Fakten laden — LLM soll nur NEUE extrahieren
    try:
        from services.memory_vector_store import get_all_memories
        existing_facts = get_all_memories(customer_id, limit=60)
    except Exception:
        existing_facts = []

    # 4. Fakten extrahieren via Ollama (mit bekannten Fakten zum Deduplizieren)
    facts = _extract_facts(conversation, model, system_prompt, existing_facts)
    if not facts:
        return

    _log.info("Extracted %d facts for customer %s", len(facts), customer_id[:8])

    # 5. In Qdrant speichern (Vektoren)
    try:
        from services.memory_vector_store import store_memory_facts
        store_memory_facts(customer_id, facts)
    except Exception as exc:
        _log.warning("Qdrant store failed: %s", exc)

    # 6. In PostgreSQL speichern (MemoryItems — Rückwärtskompatibilität)
    try:
        _save_to_postgres(customer_id, facts)
    except Exception as exc:
        _log.warning("PostgreSQL memory store failed: %s", exc)


def _extract_facts(conversation: str, model: str, system_prompt: str, existing_facts: list[str] | None = None) -> list[str]:
    # Bestehende Fakten an LLM übergeben, damit es nichts doppelt extrahiert
    user_content = conversation
    if existing_facts:
        known = "\n".join(f"- {f}" for f in existing_facts[:40])
        user_content = (
            f"BEREITS BEKANNTE FAKTEN (diese NICHT nochmals extrahieren):\n{known}\n\n"
            f"NEUE GESPRÄCH-AUSSCHNITTE:\n{conversation}"
        )
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
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
