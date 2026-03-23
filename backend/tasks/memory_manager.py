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
_STYLE_PROMPT = (
    "Du bist ein Kommunikationsstil-Analysator für einen persönlichen KI-Assistenten.\n\n"
    "Analysiere das Gespräch und erkenne, WIE der Nutzer kommuniziert und was er bevorzugt.\n\n"
    "Erkenne NUR klare Stil-Signale wie:\n"
    "- Antworte kürzer / ausführlicher\n"
    "- Erkläre technisch / einfach / mit Beispielen\n"
    "- Verwende Aufzählungen / Fließtext\n"
    "- Sieze / duze mich\n"
    "- Sprich mich mit Nachnamen / Vornamen an\n"
    "- Sprich Schweizerdeutsch / Hochdeutsch / Englisch\n"
    "- Antworte direkter / sanfter\n\n"
    "Erkenne NICHT:\n"
    "- Faktenwissen (Name, Beruf, Wohnort — das sind Fakten, keine Stilvorgaben)\n"
    "- Einmalige thematische Anfragen\n"
    "- Implizite Präferenzen ohne klares Signal\n"
    "- Stile die bereits in 'BEREITS BEKANNTE STILVORGABEN' stehen\n\n"
    "Antworte NUR mit einer JSON-Liste auf Deutsch. Maximal 2 neue Stilvorgaben.\n"
    'Beispiel: ["Nutzer bevorzugt kurze, direkte Antworten", "Nutzer möchte per Du angesprochen werden"]\n'
    "Wenn keine NEUEN Stilvorgaben erkennbar: []"
)
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

    # Vollständiges Gespräch (User + Assistent) für Stil-Analyse
    full_conversation = "\n".join(
        f"{m.get('role', 'user').upper()}: {m['content']}" for m in messages
    )
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

    # Harte Code-Deduplizierung — LLM ignoriert Anweisungen manchmal
    facts = _deduplicate_against_existing(facts, existing_facts)

    _log.info("Extracted %d facts for customer %s", len(facts), customer_id[:8])

    # 5. In Qdrant speichern (Vektoren)
    try:
        from services.memory_vector_store import store_memory_facts
        store_memory_facts(customer_id, facts, category="fact")
    except Exception as exc:
        _log.warning("Qdrant store failed: %s", exc)

    # 6. In PostgreSQL speichern (MemoryItems — Rückwärtskompatibilität)
    try:
        _save_to_postgres(customer_id, facts, category="fact")
    except Exception as exc:
        _log.warning("PostgreSQL memory store failed: %s", exc)

    # 6b. Extrahierte Fakten in chat_analytics eintragen (für Admin-Analyse)
    try:
        import hashlib
        _session_hash = hashlib.sha256(customer_id.encode()).hexdigest()[:12]
        _facts_text = " | ".join(facts[:5])
        _update_analytics_memory(customer_id, _session_hash, _facts_text)
    except Exception as exc:
        _log.warning("Analytics memory update failed: %s", exc)

    # 7. Stil-Signale extrahieren (vollständiges Gespräch inkl. Assistent-Reaktionen)
    try:
        from services.memory_vector_store import get_style_memories
        existing_styles = get_style_memories(customer_id)
    except Exception:
        existing_styles = []

    style_signals = _extract_style(full_conversation, model, existing_styles)
    if style_signals:
        style_signals = _deduplicate_against_existing(style_signals, existing_styles)
    if style_signals:
        _log.info("Extracted %d style signals for customer %s", len(style_signals), customer_id[:8])
        try:
            from services.memory_vector_store import store_memory_facts
            store_memory_facts(customer_id, style_signals, category="style")
        except Exception as exc:
            _log.warning("Qdrant style store failed: %s", exc)
        try:
            _save_to_postgres(customer_id, style_signals, category="style")
        except Exception as exc:
            _log.warning("PostgreSQL style store failed: %s", exc)


def _word_overlap(a: str, b: str) -> float:
    """Gibt den Jaccard-Ähnlichkeitswert zweier Texte zurück (0.0–1.0)."""
    wa = set(a.lower().split())
    wb = set(b.lower().split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _deduplicate_against_existing(new_facts: list[str], existing_facts: list[str]) -> list[str]:
    """Filtert Fakten heraus die bereits (ähnlich) in existing_facts vorhanden sind."""
    result = []
    for fact in new_facts:
        fl = fact.lower()
        is_dup = any(
            fl in ex.lower() or ex.lower() in fl or _word_overlap(fl, ex) >= 0.6
            for ex in existing_facts
        )
        if not is_dup:
            result.append(fact)
    return result


def _extract_style(conversation: str, model: str, existing_styles: list[str] | None = None) -> list[str]:
    """Extrahiert Kommunikationsstil-Signale aus dem Gespräch."""
    user_content = conversation
    if existing_styles:
        known = "\n".join(f"- {s}" for s in existing_styles[:20])
        user_content = (
            f"BEREITS BEKANNTE STILVORGABEN (diese NICHT nochmals extrahieren):\n{known}\n\n"
            f"GESPRÄCH:\n{conversation}"
        )
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": _STYLE_PROMPT},
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
            signals = json.loads(text[start:end])
            return [s for s in signals if isinstance(s, str) and s.strip()]
    except Exception as exc:
        _log.warning("Style extraction failed: %s", exc)
    return []


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


def _update_analytics_memory(customer_id: str, session_hash: str, facts_text: str) -> None:
    """Trägt extrahierte Memory-Fakten in die neueste chat_analytics-Zeile ein."""
    import asyncio
    asyncio.run(_update_analytics_async(session_hash, facts_text))


async def _update_analytics_async(session_hash: str, facts_text: str) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import text as sql_text

    engine = create_async_engine(settings.database_url, pool_size=1, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await db.execute(sql_text("""
            UPDATE chat_analytics
            SET memory_facts = :facts
            WHERE id = (
                SELECT id FROM chat_analytics
                WHERE session_hash = :sh
                ORDER BY created_at DESC
                LIMIT 1
            )
        """), {"facts": facts_text, "sh": session_hash})
        await db.commit()
    await engine.dispose()


def _save_to_postgres(customer_id: str, facts: list[str], category: str = "fact") -> None:
    """Speichert Fakten als MemoryItems in PostgreSQL via asyncio.run()."""
    import asyncio
    asyncio.run(_save_async(customer_id, facts, category))


async def _save_async(customer_id: str, facts: list[str], category: str = "fact") -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select as sa_select
    from models.chat import MemoryItem

    engine = create_async_engine(settings.database_url, pool_size=1, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        # Bestehende Inhalte laden für Duplikat-Check
        existing_result = await db.execute(
            sa_select(MemoryItem.content).where(MemoryItem.customer_id == customer_id)
        )
        existing_contents = [r[0] for r in existing_result.fetchall()]

        importance = 0.9 if category == "style" else 0.7
        for fact in facts[:5]:
            if not isinstance(fact, str) or not fact.strip():
                continue
            # Nur speichern wenn noch nicht (ähnlich) vorhanden
            if not any(
                fact.lower() in ex.lower() or ex.lower() in fact.lower()
                or _word_overlap(fact, ex) >= 0.6
                for ex in existing_contents
            ):
                db.add(MemoryItem(customer_id=customer_id, content=fact.strip(), importance=importance, category=category))
        await db.commit()
    await engine.dispose()
