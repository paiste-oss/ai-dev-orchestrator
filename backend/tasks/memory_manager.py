"""
Memory Manager — Celery Task.

Läuft im Hintergrund nach jeder Chat-Antwort (nur bei Nachrichten >= 20 Zeichen):
  1. Liest letzte 6 Turns aus Redis (chat:recent:{customer_id})
  2. Extrahiert dauerhafte Fakten über den Nutzer via Claude Haiku
  3. Extrahiert Kommunikationsstil-Signale via Claude Haiku
  4. Speichert Fakten als Vektoren in Qdrant (customer_memories)
  5. Speichert Fakten auch als MemoryItems in PostgreSQL (Fallback)

Architektur:
  - Ein einziger asyncio.run(_run_async()) pro Task-Aufruf
  - Ein module-level SQLAlchemy Engine pro Worker-Prozess (kein Engine-Teardown pro Call)
  - Alle DB-Operationen laufen in diesem einen Event Loop
"""
import asyncio
import json
import logging
import threading

from core.config import settings
from core.redis_client import redis_sync
from core.utils import safe_json_loads
from tasks.celery_app import celery_app

_log = logging.getLogger(__name__)

_REDIS_KEY = "chat:recent:{customer_id}"
_CONFIG_KEY = "memory_manager:config"
_CLAUDE_MODEL = "claude-haiku-4-5-20251001"

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
    "Schreibe jeden Eintrag als kurze Aussage OHNE 'Nutzer' davor — direkt und prägnant.\n"
    "Antworte NUR mit einer JSON-Liste auf Deutsch. Maximal 2 neue Stilvorgaben.\n"
    'Beispiel: ["Kurze, direkte Antworten bevorzugt", "Möchte per Du angesprochen werden"]\n'
    "Wenn keine NEUEN Stilvorgaben erkennbar: []"
)
_DEFAULT_PROMPT = (
    "Du bist ein Memory-Extraktor für einen persönlichen KI-Assistenten.\n\n"
    "Analysiere NUR die USER-Nachrichten und extrahiere dauerhafte, persönliche Fakten.\n\n"
    "Extrahiere NUR:\n"
    "- Name, Beruf, Wohnort, Familie, Beziehungen\n"
    "- Persönliche Vorlieben, Abneigungen, Gewohnheiten\n"
    "- Wichtige Lebenssituationen, Ziele, Herausforderungen\n"
    "- Kommunikationspräferenzen (z. B. Sprache, Anredeform)\n\n"
    "Extrahiere NIEMALS:\n"
    "- Fakten aus Suchergebnissen, Nachrichten oder Web-Inhalten\n"
    "- Einmalige Fragen oder Anfragen ohne persönlichen Bezug\n"
    "- Fähigkeiten oder Eigenschaften des Assistenten\n"
    "- Fakten die bereits im Abschnitt 'BEREITS BEKANNTE FAKTEN' stehen\n\n"
    "Schreibe jeden Eintrag als kurze Aussage OHNE 'Nutzer' davor — direkt und prägnant.\n"
    "Antworte NUR mit einer JSON-Liste auf Deutsch. Maximal 3 neue Fakten.\n"
    'Beispiel: ["Heisst Christoph", "Lebt mit Partnerin Evelyn zusammen", "Schuhgrösse 48"]\n'
    "Wenn keine NEUEN Fakten vorhanden: []"
)


# ── Module-level DB Engine (einmal pro Worker-Prozess) ────────────────────────
# Verhindert, dass für jeden Task ein neuer Engine aufgebaut und weggeworfen wird.

_engine = None
_session_factory = None
_engine_lock = threading.Lock()


def _get_session_factory():
    global _engine, _session_factory
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
                _engine = create_async_engine(
                    settings.database_url,
                    pool_size=3,
                    max_overflow=2,
                    pool_pre_ping=True,
                )
                _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _session_factory


# ── Celery Task ───────────────────────────────────────────────────────────────

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
        asyncio.run(_run_async(customer_id))
    except Exception as exc:
        _log.warning("Memory manager failed for %s: %s", customer_id[:8], exc)
        raise self.retry(exc=exc)


# ── Hauptlogik (ein Event Loop, eine Engine) ──────────────────────────────────

async def _run_async(customer_id: str) -> None:
    Session = _get_session_factory()

    # 0. Einwilligung prüfen (revDSG)
    async with Session() as db:
        from sqlalchemy import select as sa_select
        from models.customer import Customer
        result = await db.execute(
            sa_select(Customer.memory_consent).where(Customer.id == customer_id)
        )
        row = result.scalar_one_or_none()
        if row is not None and not bool(row):
            _log.info("Memory Manager übersprungen — kein Consent für %s", customer_id[:8])
            return

    # 1. Kurzzeitgedächtnis aus Redis lesen
    r = redis_sync()
    raw_msgs = r.lrange(_REDIS_KEY.format(customer_id=customer_id), 0, 11)
    if not raw_msgs:
        return

    messages = [safe_json_loads(m) for m in reversed(raw_msgs)]
    full_conversation = "\n".join(
        f"{m.get('role', 'user').upper()}: {m['content']}" for m in messages
    )
    user_messages = [m for m in messages if m.get("role") == "user"]
    if not user_messages:
        return
    conversation = "\n".join(f"USER: {m['content']}" for m in user_messages)

    # 2. Konfiguration laden
    model, system_prompt = _load_config()

    # 3. Bereits bekannte Fakten laden (Qdrant)
    try:
        from services.memory_vector_store import get_all_memories
        existing_facts = get_all_memories(customer_id, limit=60)
    except Exception:
        existing_facts = []

    # 4. Fakten extrahieren via Claude Haiku
    facts = await _claude_extract(system_prompt, _build_user_content(conversation, existing_facts, "fakten"))
    if not facts:
        return

    facts = _deduplicate_against_existing(facts, existing_facts)
    if not facts:
        return

    _log.info("Extracted %d facts for customer %s", len(facts), customer_id[:8])

    # 5. In Qdrant speichern
    try:
        from services.memory_vector_store import store_memory_facts
        store_memory_facts(customer_id, facts, category="fact")
    except Exception as exc:
        _log.warning("Qdrant store failed: %s", exc)

    # 6. In PostgreSQL speichern + Analytics — alles in einer Session
    async with Session() as db:
        await _save_facts_to_db(db, customer_id, facts, "fact")
        try:
            import hashlib
            session_hash = hashlib.sha256(customer_id.encode()).hexdigest()[:12]
            facts_text = " | ".join(facts[:5])
            await _update_analytics_db(db, session_hash, facts_text)
        except Exception as exc:
            _log.warning("Analytics memory update failed: %s", exc)

    # 7. Stil-Signale extrahieren
    try:
        from services.memory_vector_store import get_style_memories
        existing_styles = get_style_memories(customer_id)
    except Exception:
        existing_styles = []

    style_signals = await _claude_extract(
        _STYLE_PROMPT, _build_user_content(full_conversation, existing_styles, "stilvorgaben")
    )
    if style_signals:
        style_signals = _deduplicate_against_existing(style_signals, existing_styles)
    if style_signals:
        _log.info("Extracted %d style signals for customer %s", len(style_signals), customer_id[:8])
        try:
            from services.memory_vector_store import store_memory_facts
            store_memory_facts(customer_id, style_signals, category="style")
        except Exception as exc:
            _log.warning("Qdrant style store failed: %s", exc)
        async with Session() as db:
            await _save_facts_to_db(db, customer_id, style_signals, "style")


# ── DB-Hilfsfunktionen ────────────────────────────────────────────────────────

async def _save_facts_to_db(db, customer_id: str, facts: list[str], category: str) -> None:
    from sqlalchemy import select as sa_select
    from models.chat import MemoryItem

    existing_result = await db.execute(
        sa_select(MemoryItem.content).where(MemoryItem.customer_id == customer_id)
    )
    existing_contents = [r[0] for r in existing_result.fetchall()]

    importance = 0.9 if category == "style" else 0.7
    for fact in facts[:5]:
        if not isinstance(fact, str) or not fact.strip():
            continue
        if not any(
            fact.lower() in ex.lower() or ex.lower() in fact.lower()
            or _word_overlap(fact, ex) >= 0.6
            for ex in existing_contents
        ):
            db.add(MemoryItem(
                customer_id=customer_id,
                content=fact.strip(),
                importance=importance,
                category=category,
            ))
    await db.commit()


async def _update_analytics_db(db, session_hash: str, facts_text: str) -> None:
    from sqlalchemy import text as sql_text
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


# ── LLM-Extraktion ────────────────────────────────────────────────────────────

async def _claude_extract(system_prompt: str, user_content: str) -> list[str]:
    """Sendet einen Extraktions-Request an Claude Haiku und gibt eine Liste zurück."""
    try:
        from services.llm_gateway import chat_with_claude
        result = await chat_with_claude(
            messages=[{"role": "user", "content": user_content}],
            system_prompt=system_prompt,
            model=_CLAUDE_MODEL,
        )
        text = result.text
        start, end = text.find("["), text.rfind("]") + 1
        if start >= 0 and end > start:
            items = json.loads(text[start:end])
            return [s for s in items if isinstance(s, str) and s.strip()]
    except Exception as exc:
        _log.warning("Claude extraction failed: %s", exc)
    return []


def _build_user_content(conversation: str, existing: list[str], label: str) -> str:
    """Baut den User-Content-Block mit bekannten Einträgen zur Deduplizierung."""
    if not existing:
        return conversation
    known = "\n".join(f"- {e}" for e in existing[:40])
    return (
        f"BEREITS BEKANNTE {label.upper()} (diese NICHT nochmals extrahieren):\n{known}\n\n"
        f"NEUE GESPRÄCH-AUSSCHNITTE:\n{conversation}"
    )


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _load_config() -> tuple[str, str]:
    """Lädt Prompt aus Redis (Admin-Konfiguration). Modell ist immer Claude Haiku."""
    try:
        raw = redis_sync().get(_CONFIG_KEY)
        if raw:
            cfg = safe_json_loads(raw)
            return _CLAUDE_MODEL, cfg.get("system_prompt", _DEFAULT_PROMPT)
    except Exception:
        pass
    return _CLAUDE_MODEL, _DEFAULT_PROMPT


def _word_overlap(a: str, b: str) -> float:
    """Jaccard-Ähnlichkeit zweier Texte (0.0–1.0)."""
    wa = set(a.lower().split())
    wb = set(b.lower().split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _deduplicate_against_existing(new_facts: list[str], existing_facts: list[str]) -> list[str]:
    """Filtert Fakten die bereits (ähnlich) bekannt sind."""
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
