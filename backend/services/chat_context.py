"""
Chat-Kontext-Loader — Phase 1 der Chat-Pipeline.

Lädt History, Config, Memories, Knowledge und baut den System-Prompt.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from core.redis_client import get_async_redis
from core.utils import safe_json_loads
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from models.document import CustomerDocument
from models.literature_entry import LiteratureEntry
from models.window import WindowBoard
from services.chat_system_prompt import build_system_prompt
from services.knowledge_store import search_global_knowledge, fetch_topic_chunks
from services.memory_vector_store import search_memories, get_style_memories
from services.vector_store import search_customer_documents

_log = logging.getLogger(__name__)

_HISTORY_WINDOW = 20
_CONTEXT_WINDOW = 10

_KNOWLEDGE_TOP_K = 3
_KNOWLEDGE_MIN_SCORE = 0.72

_DEFAULT_KNOWLEDGE_BOOST: list[dict] = [
    {
        "terms": ["iv ", " iv,", " iv.", "invalidenversicherung", "ivg", "ivv",
                  "medas", "invaliditätsgrad", "iv-stelle", "eingliederung",
                  "iv-rente", "iv-anmeldung", "ahv/iv", "ergänzungsleistungen"],
        "titles": [
            "IV-Anmeldeprozess Schweiz — Vollständiger Leitfaden (alle Phasen, Fristen, Tipps)",
            "Bundesgesetz über die Invalidenversicherung (IVG)",
            "Verordnung über die Invalidenversicherung (IVV)",
        ],
        "max_per_title": 2,
    },
]


async def load_context(customer: Customer, message: str, db: AsyncSession) -> dict[str, Any]:
    """Lädt History, Config, Memories, Knowledge und baut den System-Prompt."""
    customer_id = str(customer.id)

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.customer_id == customer_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(_HISTORY_WINDOW)
    )
    history = list(reversed(result.scalars().all()))
    prior_messages = [{"role": m.role, "content": m.content} for m in history[-_CONTEXT_WINDOW:]]

    baddi_config = await _load_global_baddi_config()

    try:
        relevant = search_memories(customer_id, message, top_k=10)
    except Exception as e:
        _log.warning("Qdrant Memory-Suche fehlgeschlagen, Fallback auf PostgreSQL: %s", e)
        result_mem = await db.execute(
            select(MemoryItem)
            .where(MemoryItem.customer_id == customer_id, MemoryItem.is_active.is_(True))
            .order_by(MemoryItem.importance.desc()).limit(5)
        )
        relevant = [m.content for m in result_mem.scalars().all()]

    try:
        style_prefs = get_style_memories(customer_id)
    except Exception as e:
        _log.warning("Qdrant Style-Memory-Suche fehlgeschlagen, Fallback auf PostgreSQL: %s", e)
        result_style = await db.execute(
            select(MemoryItem)
            .where(MemoryItem.customer_id == customer_id, MemoryItem.is_active.is_(True),
                   MemoryItem.category == "style")
            .order_by(MemoryItem.importance.desc()).limit(5)
        )
        style_prefs = [m.content for m in result_style.scalars().all()]

    first_name = customer.name.split()[0] if customer.name else "du"

    netzwerk_context: str | None = None
    try:
        netz_result = await db.execute(
            select(WindowBoard)
            .where(WindowBoard.customer_id == customer.id, WindowBoard.board_type == "netzwerk")
            .order_by(WindowBoard.updated_at.desc())
            .limit(5)
        )
        netz_boards = netz_result.scalars().all()
        netzwerk_context = _format_netzwerk(netz_boards, first_name, message=message)
    except Exception as e:
        _log.warning("Netzwerk-Kontext konnte nicht geladen werden: %s", e)

    documents_context, doc_cache, private_doc_names = await _load_documents_context(
        customer_id_uuid=customer.id, message=message, db=db,
    )
    literature_context = await _load_literature_context(
        customer_id_uuid=customer.id, message=message, db=db,
    )

    knowledge_chunks: list[dict] = []
    if baddi_config.get("knowledge_enabled", True):
        try:
            knowledge_chunks = search_global_knowledge(
                query=message,
                top_k=int(baddi_config.get("knowledge_max_results", _KNOWLEDGE_TOP_K)),
                min_score=float(baddi_config.get("knowledge_min_score", _KNOWLEDGE_MIN_SCORE)),
                domains=baddi_config.get("knowledge_domains") or None,
            )
            boost_rules = baddi_config.get("knowledge_boost") or _DEFAULT_KNOWLEDGE_BOOST
            _msg_lower = message.lower()
            for rule in boost_rules:
                if any(t in _msg_lower for t in rule.get("terms", [])):
                    boosted = fetch_topic_chunks(
                        titles=rule.get("titles", []),
                        max_per_title=rule.get("max_per_title", 2),
                    )
                    existing_texts = {c["text"][:100] for c in knowledge_chunks}
                    extra = [c for c in boosted if c["text"][:100] not in existing_texts]
                    knowledge_chunks = extra + knowledge_chunks
        except Exception as e:
            _log.warning("Knowledge-Suche fehlgeschlagen, Chat läuft ohne Wissensbasis: %s", e)

    static_block, dynamic_block = build_system_prompt(
        first_name=first_name,
        baddi_config=baddi_config,
        style_prefs=style_prefs,
        relevant_memories=relevant,
        ui_prefs=customer.ui_preferences or {},
        knowledge_chunks=knowledge_chunks or None,
        documents_context=documents_context,
        private_doc_names=private_doc_names,
        netzwerk_context=netzwerk_context,
        literature_context=literature_context,
    )
    system_prompt_blocks: list[dict[str, Any]] = [
        {"type": "text", "text": static_block, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": dynamic_block},
    ]

    return {
        "prior_messages": prior_messages,
        "baddi_config": baddi_config,
        "system_prompt": system_prompt_blocks,
        "system_prompt_name": baddi_config.get("name") or baddi_config.get("system_prompt_name") or "Standard",
        "doc_cache": doc_cache,
    }


async def _load_global_baddi_config() -> dict:
    try:
        r = await get_async_redis()
        raw = await r.get("baddi:config")
        return safe_json_loads(raw)
    except Exception as e:
        _log.warning("Globale Baddi-Config konnte nicht geladen werden: %s", e)
        return {}


async def _load_literature_context(customer_id_uuid: Any, message: str, db: AsyncSession) -> dict | None:
    """Lädt Literatur-Kontext: Statistik + relevante (Vector-Search) + neueste Einträge.

    Bei kleinen Bibliotheken (< 30 Einträge) gibt komplette Liste zurück (volle Details).
    Bei grossen Bibliotheken: Stats + Top-K nach Vector-Relevanz + Neueste 5.
    """
    try:
        # Statistik pro entry_type
        stats_result = await db.execute(
            select(LiteratureEntry.entry_type, sa_func.count(LiteratureEntry.id))
            .where(
                LiteratureEntry.customer_id == customer_id_uuid,
                LiteratureEntry.is_active.is_(True),
                LiteratureEntry.baddi_readable.is_(True),
            )
            .group_by(LiteratureEntry.entry_type)
        )
        stats: dict[str, int] = {row[0]: int(row[1]) for row in stats_result.all()}
        total = sum(stats.values())
        if total == 0:
            return None

        # Bei kleiner Bibliothek: alle laden, volle Details
        if total < 30:
            full_result = await db.execute(
                select(LiteratureEntry)
                .where(
                    LiteratureEntry.customer_id == customer_id_uuid,
                    LiteratureEntry.is_active.is_(True),
                    LiteratureEntry.baddi_readable.is_(True),
                )
                .order_by(LiteratureEntry.created_at.desc())
            )
            return {"mode": "full", "stats": stats, "total": total, "entries": list(full_result.scalars().all())}

        # Grosse Bibliothek: Vector-Search für relevante + Recent für neueste
        relevant_entries: list[tuple[LiteratureEntry, str]] = []
        try:
            hits = search_customer_documents(
                customer_id=str(customer_id_uuid), query=message,
                collection_name="literature", top_k=12,
            )
            # Eindeutige entry_ids in Reihenfolge der Score
            seen_ids: set[str] = set()
            best_chunks: dict[str, str] = {}
            for h in hits:
                eid = h.get("document_id")
                if not eid or eid in seen_ids:
                    continue
                seen_ids.add(eid)
                best_chunks[eid] = (h.get("text") or "")[:280]
                if len(seen_ids) >= 5:
                    break
            if seen_ids:
                import uuid as _u
                rel_result = await db.execute(
                    select(LiteratureEntry)
                    .where(LiteratureEntry.id.in_([_u.UUID(i) for i in seen_ids]))
                )
                rel_entries = {str(e.id): e for e in rel_result.scalars().all()}
                # Reihenfolge erhalten (nach Score)
                for eid in seen_ids:
                    e = rel_entries.get(eid)
                    if e:
                        relevant_entries.append((e, best_chunks.get(eid, "")))
        except Exception as e:
            _log.warning("Literatur-Vector-Search fehlgeschlagen: %s", e)

        recent_result = await db.execute(
            select(LiteratureEntry)
            .where(
                LiteratureEntry.customer_id == customer_id_uuid,
                LiteratureEntry.is_active.is_(True),
                LiteratureEntry.baddi_readable.is_(True),
            )
            .order_by(LiteratureEntry.created_at.desc())
            .limit(5)
        )
        recent_entries = list(recent_result.scalars().all())

        return {
            "mode": "compact",
            "stats": stats,
            "total": total,
            "relevant": relevant_entries,
            "recent": recent_entries,
        }
    except Exception as e:
        _log.warning("Literatur-Kontext konnte nicht geladen werden: %s", e)
        return None


async def _load_documents_context(customer_id_uuid: Any, message: str, db: AsyncSession) -> tuple[dict | None, dict[str, Any], list[str]]:
    """Lädt Dokumenten-Kontext: Statistik + relevante (Vector-Search) + neueste.

    Bei < 10 Dokumenten: alle Details. Bei mehr: Stats + Top-K + Recent.
    Returnt (context_dict, doc_cache, private_doc_names).
    """
    try:
        all_result = await db.execute(
            select(CustomerDocument)
            .where(CustomerDocument.customer_id == customer_id_uuid, CustomerDocument.is_active.is_(True))
            .order_by(CustomerDocument.created_at.desc())
        )
        all_docs = list(all_result.scalars().all())
        doc_cache: dict[str, Any] = {str(d.id): d for d in all_docs}
        private_doc_names = [d.original_filename for d in all_docs if not d.baddi_readable]
        readable = [d for d in all_docs if d.baddi_readable and d.extracted_text]

        if not readable:
            return (None, doc_cache, private_doc_names)

        total = len(readable)

        # Bei wenigen: alle volle Details (wie bisher)
        if total <= 10:
            return ({"mode": "full", "total": total, "docs": readable}, doc_cache, private_doc_names)

        # Bei vielen: Vector-Search relevant + neueste
        relevant: list[tuple[Any, str]] = []
        try:
            hits = search_customer_documents(
                customer_id=str(customer_id_uuid), query=message,
                collection_name="customer_documents", top_k=10,
            )
            seen: set[str] = set()
            best_chunks: dict[str, str] = {}
            for h in hits:
                did = h.get("document_id")
                if not did or did in seen:
                    continue
                seen.add(did)
                best_chunks[did] = (h.get("text") or "")[:280]
                if len(seen) >= 3:
                    break
            for did in seen:
                d = doc_cache.get(did)
                if d and d.baddi_readable:
                    relevant.append((d, best_chunks.get(did, "")))
        except Exception as e:
            _log.warning("Dokumenten-Vector-Search fehlgeschlagen: %s", e)

        return (
            {"mode": "compact", "total": total, "relevant": relevant, "recent": readable[:5]},
            doc_cache,
            private_doc_names,
        )
    except Exception as e:
        _log.warning("Dokumenten-Kontext konnte nicht geladen werden: %s", e)
        return (None, {}, [])


def _format_netzwerk(boards: list[Any], first_name: str, message: str = "") -> str | None:
    """Formatiert Namensnetz-Boards als lesbaren Kontext für den System-Prompt."""
    import time as _t
    now_ms = int(_t.time() * 1000)

    all_persons: list[dict] = []
    all_networks: list[dict] = []
    all_connections: list[dict] = []

    for board in boards:
        data = board.data or {}
        persons: list[dict] = data.get("persons", [])
        networks: list[dict] = data.get("networks", [])
        connections: list[dict] = data.get("connections", [])
        if not persons and not networks:
            continue
        person_map = {p["id"]: p for p in persons}
        all_persons.extend(persons)
        all_connections.extend(connections)
        for net in networks:
            members = [
                person_map.get(m.get("personId", ""), {}).get("name") or "?"
                for m in net.get("members", [])
            ]
            all_networks.append({"name": net.get("name", "?"), "members": members, "note": net.get("note", "")})

    if not all_persons:
        return None

    person_map_all = {p["id"]: p for p in all_persons}

    # Phase 3: Bei vielen Personen nach in der Message erwähnten Namen filtern
    msg_lower = (message or "").lower()
    mentioned_ids: set[str] = set()
    if msg_lower and len(all_persons) > 15:
        for p in all_persons:
            name = (p.get("name") or p.get("fullName") or "").strip()
            if not name:
                continue
            # First-Name oder voller Name muss als ganzes Wort matchen
            for token in name.split():
                if len(token) >= 3 and f" {token.lower()} " in f" {msg_lower} ":
                    mentioned_ids.add(p.get("id", ""))
                    break

        # Erweitern: direkt verbundene Personen mit aufnehmen
        if mentioned_ids:
            for c in all_connections:
                a, b = c.get("a", ""), c.get("b", "")
                if a in mentioned_ids:
                    mentioned_ids.add(b)
                elif b in mentioned_ids:
                    mentioned_ids.add(a)

    use_filter = bool(mentioned_ids)
    persons_to_show = [p for p in all_persons if p.get("id") in mentioned_ids] if use_filter else all_persons

    lines = [f"\nNAMENSNETZ von {first_name} (persönliche Kontakte — nutze dieses Wissen proaktiv):"]
    if use_filter:
        lines.append(f"Insgesamt {len(all_persons)} Personen in der Liste — gezeigt werden {len(persons_to_show)} aus dem Kontext der Anfrage:")
    reminders: list[str] = []

    lines.append(f"Personen ({len(persons_to_show)}):")
    for p in persons_to_show:
        name = p.get("name") or p.get("fullName") or "?"
        note = (p.get("note") or "").strip()
        entry = f"  - {name}"
        if note:
            entry += f": {note}"
        last_ms = p.get("lastMentionedAt") or p.get("createdAt")
        if last_ms:
            days = (now_ms - last_ms) // (1000 * 60 * 60 * 24)
            if days >= 60:
                entry += f" [nicht erwähnt seit {days} Tagen]"
                reminders.append(f"  → {name} wurde seit {days} Tagen nicht mehr erwähnt — bei passender Gelegenheit nachfragen.")
            elif days >= 14:
                entry += f" [zuletzt vor {days} Tagen erwähnt]"
        lines.append(entry)

    if all_networks:
        lines.append(f"Netzwerke/Gruppen ({len(all_networks)}):")
        for net in all_networks:
            members_str = ", ".join(net["members"]) if net["members"] else "(keine Mitglieder)"
            entry = f"  - {net['name']}: {members_str}"
            if net["note"]:
                entry += f" — {net['note']}"
            lines.append(entry)

    if all_connections:
        conn_lines: list[str] = []
        for c in all_connections:
            a, b = c.get("a", ""), c.get("b", "")
            if use_filter and a not in mentioned_ids and b not in mentioned_ids:
                continue
            pa = person_map_all.get(a, {})
            pb = person_map_all.get(b, {})
            na = pa.get("name") or "?"
            nb = pb.get("name") or "?"
            label = (c.get("label") or "").strip()
            conn_lines.append(f"  - {na} ↔ {nb}" + (f" ({label})" if label else ""))
        if conn_lines:
            lines.append(f"Verbindungen ({len(conn_lines)}):")
            lines.extend(conn_lines)

    if reminders:
        lines.append("Erinnerungshinweise (proaktiv aufgreifen wenn das Gespräch passt):")
        lines.extend(reminders)

    return "\n".join(lines)
