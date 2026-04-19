"""
Chat-Pipeline — Kernlogik des send_message Endpoints.

Aufteilung in drei Phasen:
  1. load_context()    — History, Config, Memories, Knowledge, System-Prompt
  2. execute_llm()     — Vision / Text + Tool-Calls + Fallbacks
  3. finalize()        — Persistenz, Analytics, Billing, Background-Tasks
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime,timezone
from typing import Any, TypedDict

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import AsyncSessionLocal
from core.redis_client import get_async_redis
from core.utils import safe_json_loads
from models.capability_request import CapabilityRequest
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from models.document import CustomerDocument
from models.window import WindowBoard
from services.buddy_agent import run_buddy_chat
from services.billing_service import check_and_bill_tokens
from services.chat_analytics import record_analytics
from services.chat_markers import process_markers
from services.chat_system_prompt import build_system_prompt
from services.entwicklung_engine import analyse_capability_request
from services.knowledge_store import search_global_knowledge, fetch_topic_chunks
from services.llm_gateway import chat_with_claude, chat_with_gemini, chat_with_openai
from services.memory_vector_store import search_memories, get_style_memories
from services.tool_registry import TOOL_CATALOG
from tasks.memory_manager import process_memory

_log = logging.getLogger(__name__)


class ChatContext(TypedDict):
    prior_messages: list[dict[str, Any]]
    baddi_config: dict[str, Any]
    system_prompt: list[dict[str, Any]]  # [static_cached, dynamic] blocks für Prompt Caching
    system_prompt_name: str
    doc_cache: dict[str, Any]


class LLMResult(TypedDict):
    provider: str
    model_name: str
    response_text: str | None
    tokens_used: int
    generated_image_urls: list[str]
    response_type: str
    structured_data: dict[str, Any] | None
    tools_called: list[str]
    errors: list[str]


_HISTORY_WINDOW = 20
_CONTEXT_WINDOW = 10

# Knowledge-Retrieval: engere Parameter → weniger Token-Verschwendung
_KNOWLEDGE_TOP_K    = 3     # war 6 — senkt Knowledge-Anteil im Prompt um ~50%
_KNOWLEDGE_MIN_SCORE = 0.72  # war 0.60 — filtert irrelevante Chunks raus

# Fallback-Boost-Regeln — überschreibbar via baddi_config["knowledge_boost"] in Redis.
# Format: Liste von {terms, titles, max_per_title}
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


# ── Phase 1: Kontext laden ────────────────────────────────────────────────────

async def load_context(customer: Customer, message: str, db: AsyncSession) -> ChatContext:
    """Lädt History, Config, Memories, Knowledge und baut den System-Prompt."""
    customer_id = str(customer.id)

    # Conversation history
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.customer_id == customer_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(_HISTORY_WINDOW)
    )
    history = list(reversed(result.scalars().all()))
    prior_messages = [{"role": m.role, "content": m.content} for m in history[-_CONTEXT_WINDOW:]]

    # Globale Baddi-Config
    baddi_config = await _load_global_baddi_config()

    # Memories aus Qdrant (Fallback: PostgreSQL)
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

    # Namensnetz des Users laden
    netzwerk_context: str | None = None
    try:
        netz_result = await db.execute(
            select(WindowBoard)
            .where(WindowBoard.customer_id == customer.id, WindowBoard.board_type == "netzwerk")
            .order_by(WindowBoard.updated_at.desc())
            .limit(5)
        )
        netz_boards = netz_result.scalars().all()
        netzwerk_context = _format_netzwerk(netz_boards, first_name)
    except Exception as e:
        _log.warning("Netzwerk-Kontext konnte nicht geladen werden: %s", e)

    # Kunden-Dokumente automatisch laden
    doc_result = await db.execute(
        select(CustomerDocument)
        .where(
            CustomerDocument.customer_id == customer.id,
            CustomerDocument.is_active.is_(True),
        )
        .order_by(CustomerDocument.created_at.desc())
        .limit(20)
    )
    all_docs = doc_result.scalars().all()
    readable_docs = [d for d in all_docs if d.baddi_readable and d.extracted_text]
    private_docs  = [d for d in all_docs if not d.baddi_readable]
    # Vorgeladene Docs als Cache — verhindert zweiten DB-Query in _embed_documents
    doc_cache: dict[str, Any] = {str(d.id): d for d in all_docs}

    # Globale Wissensbasis
    knowledge_chunks: list[dict] = []
    if baddi_config.get("knowledge_enabled", True):
        try:
            knowledge_chunks = search_global_knowledge(
                query=message,
                top_k=int(baddi_config.get("knowledge_max_results", _KNOWLEDGE_TOP_K)),
                min_score=float(baddi_config.get("knowledge_min_score", _KNOWLEDGE_MIN_SCORE)),
                domains=baddi_config.get("knowledge_domains") or None,
            )
            # Themen-Boost: konfigurierbar via baddi_config["knowledge_boost"]
            # Format: [{"terms": ["..."], "titles": ["..."]}]
            # Fallback: eingebaute IV/AHV-Regel falls nichts konfiguriert.
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

    # System-Prompt als zwei Blöcke für Prompt Caching:
    #   Block 0 (static, cache_control=ephemeral): reine Instruktionen, user-unabhängig
    #   Block 1 (dynamic): user-/request-spezifischer Kontext
    static_block, dynamic_block = build_system_prompt(
        first_name=first_name,
        baddi_config=baddi_config,
        style_prefs=style_prefs,
        relevant_memories=relevant,
        ui_prefs=customer.ui_preferences or {},
        knowledge_chunks=knowledge_chunks or None,
        readable_docs=readable_docs,
        private_doc_names=[d.original_filename for d in private_docs],
        netzwerk_context=netzwerk_context,
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


# ── Phase 2: LLM ausführen ────────────────────────────────────────────────────

def _build_canvas_note(canvas: list[dict[str, Any]]) -> str:
    """Baut einen kompakten Kontext-Block über den aktuellen Artifact-Panel-Zustand."""
    import json as _json
    lines = ["[Artifact-Panel — aktuell geöffnet:]"]
    for a in canvas:
        mark = " ◀ aktiv" if a.get("active") else ""
        line = f"  • {a.get('title', a.get('type', '?'))} [Typ: {a.get('type', '?')}]{mark}"
        data = a.get("data")
        if data:
            summary = _json.dumps(data, ensure_ascii=False, default=str)
            if len(summary) > 400:
                summary = summary[:400] + "…"
            line += f"\n    Daten: {summary}"
        lines.append(line)
    return "\n".join(lines)


async def execute_llm(
    customer: Customer,
    message: str,
    images: list[Any] | None,
    document_ids: list[str] | None,
    prior_messages: list[dict[str, Any]],
    system_prompt: list[dict[str, Any]] | str,
    db: AsyncSession,
    doc_cache: dict[str, Any] | None = None,
    canvas_context: list[dict[str, Any]] | None = None,
) -> LLMResult:
    """Führt den LLM-Call aus (Vision / Text + Tools + Fallbacks)."""
    provider = "claude"
    model_name = "claude-sonnet-4-6"
    response_text: str | None = None
    tokens_used: int = 0
    generated_image_urls: list[str] = []
    errors: list[str] = []
    response_type = "text"
    structured_data: dict | None = None
    tools_called: list[str] = []

    # Dokumente in Nachricht einbetten — doc_cache aus load_context verhindert zweiten DB-Query
    user_message = await _embed_documents(message, document_ids, customer, db, doc_cache or {})

    # Canvas-Kontext prependen damit das LLM weiss, was rechts geöffnet ist
    if canvas_context:
        canvas_note = _build_canvas_note(canvas_context)
        user_message = f"{canvas_note}\n\n{user_message}"

    if images:
        # Vision-Calls brauchen kein Caching — Prompt als String zusammenführen
        vision_system = (
            "\n\n".join(b["text"] for b in system_prompt if isinstance(b, dict))
            if isinstance(system_prompt, list)
            else system_prompt
        )
        response_text, tokens_used, errors = await _run_vision(
            images, user_message, prior_messages, vision_system, model_name, errors
        )
        model_name = "claude-sonnet-4-6"
    else:
        response_text, model_name, tokens_used, errors, tools_called, generated_image_urls, response_type, structured_data = await _run_text(
            user_message, prior_messages, system_prompt, model_name,
            list(TOOL_CATALOG.keys()), str(customer.id), errors
        )

    # Fallbacks
    if response_text is None:
        response_text, provider, model_name, tokens_used, errors = await _run_fallbacks(
            prior_messages + [{"role": "user", "content": user_message}],
            system_prompt, errors
        )

    return {
        "provider": provider,
        "model_name": model_name,
        "response_text": response_text,
        "tokens_used": tokens_used,
        "generated_image_urls": generated_image_urls,
        "response_type": response_type,
        "structured_data": structured_data,
        "tools_called": tools_called,
        "errors": errors,
    }


async def _embed_documents(
    message: str, document_ids: list[str] | None, customer: Customer, db: AsyncSession,
    doc_cache: dict[str, Any] | None = None,
) -> str:
    if not document_ids:
        return message
    from models.document import CustomerDocument
    import uuid as _uuid
    doc_parts: list[str] = []
    for doc_id in document_ids:
        try:
            # Cache-Treffer aus load_context vermeidet einen DB-Roundtrip pro angehängtem Dokument
            import uuid as _uuid
            doc = (doc_cache or {}).get(doc_id) or await db.get(CustomerDocument, _uuid.UUID(doc_id))
            if doc and doc.customer_id == customer.id and doc.is_active and doc.extracted_text and doc.baddi_readable:
                doc_text = doc.extracted_text[:12000]
                truncated = "\n[... Inhalt gekürzt]" if len(doc.extracted_text) > 12000 else ""
                pages_info = f"{doc.page_count} Seite(n)" if doc.page_count > 1 else ""
                header = f'[Datei: "{doc.original_filename}"{" — " + pages_info if pages_info else ""}]'
                doc_parts.append(f"{header}\n{doc_text}{truncated}")
        except Exception as e:
            _log.warning("Dokument %s konnte nicht geladen werden: %s", doc_id, e)
    if doc_parts:
        doc_block = "\n\n---\n".join(doc_parts)
        return f"{doc_block}\n\n---\n\n{message}" if message.strip() else doc_block
    return message


async def _run_vision(
    images: list[Any], user_message: str, prior_messages: list[dict[str, Any]], system_prompt: str,
    model_name: str, errors: list[str]
) -> tuple[str | None, int, list[str]]:
    user_content: list[dict] = []
    for img in images:
        user_content.append({"type": "image", "source": {"type": "base64", "media_type": img.media_type, "data": img.data}})
    if user_message.strip():
        user_content.append({"type": "text", "text": user_message})
    messages = prior_messages + [{"role": "user", "content": user_content}]
    try:
        result = await chat_with_claude(messages, system_prompt, model="claude-sonnet-4-6")
        return result.text, result.total_tokens, errors
    except Exception as e:
        errors.append(f"Claude Vision: {e}")
        return None, 0, errors


async def _run_text(
    user_message: str, prior_messages: list[dict[str, Any]], system_prompt: str, model_name: str,
    tool_keys: list[str], customer_id: str, errors: list[str]
) -> tuple[str | None, str, int, list[str], list[str], list[str], str, dict[str, Any] | None]:
    response_text = None
    tokens_used = 0
    tools_called: list[str] = []
    generated_image_urls: list[str] = []
    response_type = "text"
    structured_data = None

    try:
        uhrwerk_result = await run_buddy_chat(
            message=user_message,
            buddy_name="Baddi",
            system_prompt=system_prompt,
            tool_keys=tool_keys,
            model=model_name,
            history=prior_messages,
            customer_id=customer_id,
        )
        response_text = uhrwerk_result["output"]
        model_name = uhrwerk_result.get("model_used", model_name)
        tokens_used = uhrwerk_result.get("total_tokens", 0)

        # Alle netzwerk_aktion-Aufrufe sammeln — werden sequentiell in finalize() angewendet
        pending_netzwerk_aktions: list[dict] = []

        for tc in uhrwerk_result.get("tool_calls", []):
            tool_name = tc.get("tool")
            if tool_name:
                tools_called.append(tool_name)
            result = tc.get("result")

            # Bild-URLs sammeln
            if isinstance(result, dict):
                if url := result.get("image_url"):
                    generated_image_urls.append(url)
            elif isinstance(result, list):
                for item in result:
                    if isinstance(item, dict):
                        if url := item.get("image_url"):
                            generated_image_urls.append(url)

            # Netzwerk-Aktionen akkumulieren statt überschreiben
            if isinstance(result, dict) and "_netzwerk_aktion" in result:
                pending_netzwerk_aktions.append(result["_netzwerk_aktion"])
                continue

            # Structured data für UI-Karten
            response_type, structured_data = _extract_structured_data(
                tool_name, result, response_type, structured_data
            )

        # Netzwerk-Aktionen: alle gesammelt → als Liste weitergeben
        if pending_netzwerk_aktions:
            response_type = "netzwerk_aktion"
            structured_data = {"actions": pending_netzwerk_aktions}

    except Exception as e:
        errors.append(f"Uhrwerk: {e}")

    return response_text, model_name, tokens_used, errors, tools_called, generated_image_urls, response_type, structured_data


def _extract_structured_data(
    tool_name: str | None, result: Any, response_type: str, structured_data: dict | None
) -> tuple[str, dict | None]:
    if not isinstance(result, dict):
        return response_type, structured_data

    # ── Neue tool-basierte Artifact-Steuerung (ersetzt [FENSTER:]- und [NETZWERK_AKTION:]-Marker) ──
    artifact_action = result.get("_artifact_action")
    if artifact_action == "open":
        # {canvasType, title, ...typ-spezifische Felder} → open_window
        payload = {k: v for k, v in result.items() if k != "_artifact_action"}
        return "open_window", payload
    if artifact_action == "close":
        payload = {k: v for k, v in result.items() if k != "_artifact_action"}
        return "close_window", payload

    if "_netzwerk_aktion" in result:
        return "netzwerk_aktion", result["_netzwerk_aktion"]

    # ── Bestehende tool-basierte Karten (unverändert) ───────────────────────
    if tool_name == "get_stock_price" and "price" in result:
        return "stock_card", result
    if tool_name == "get_stock_history" and "data_points" in result:
        return "stock_history", result
    if tool_name == "generate_image" and "image_url" in result:
        return "image_gallery", {"images": [{"image_url": result["image_url"], "description": result.get("prompt", "Generiertes Bild"), "source": "DALL-E 3"}]}
    if tool_name == "search_image":
        if isinstance(result, list) and result:
            return "image_gallery", {"images": result}
        if "image_url" in result:
            return "image_gallery", {"images": [result]}
    if tool_name == "sbb_stationboard" and "departures" in result:
        return "transport_board", result
    if tool_name in ("flight_status", "airport_board") and result.get("flight_board"):
        return "flight_board", result

    return response_type, structured_data


async def _run_fallbacks(
    messages: list[dict[str, Any]], system_prompt: str, errors: list[str]
) -> tuple[str | None, str, str, int, list[str]]:
    if settings.gemini_api_key:
        try:
            result = await chat_with_gemini(messages, system_prompt)
            return result.text, "gemini", "gemini-2.5-flash", result.total_tokens, errors
        except Exception as e:
            errors.append(f"Gemini: {e}")

    if settings.openai_api_key:
        try:
            result = await chat_with_openai(messages, system_prompt)
            return result.text, "openai", "gpt-4o-mini", result.total_tokens, errors
        except Exception as e:
            errors.append(f"OpenAI: {e}")

    return None, "none", "none", 0, errors


# ── Phase 3: Abschliessen ─────────────────────────────────────────────────────

async def finalize(
    customer: Customer,
    original_message: str,
    llm_result: LLMResult,
    system_prompt_name: str,
    db: AsyncSession,
    reply_via_email: str | None = None,
    reply_subject: str | None = None,
) -> tuple[str, str, str, dict[str, Any] | None, dict[str, Any] | None, str | None]:
    """
    Verarbeitet Marker, persistiert, bucht, startet Background-Tasks.
    Gibt (message_id, response_text, response_type, structured_data, ui_update, emotion) zurück.
    """
    customer_id = str(customer.id)
    response_text = llm_result["response_text"]
    response_type = llm_result["response_type"]
    structured_data = llm_result["structured_data"]

    # Marker verarbeiten
    marker_result = process_markers(response_text)
    response_text = marker_result.text

    if marker_result.action_buttons:
        response_type = "action_buttons"
        structured_data = {"buttons": marker_result.action_buttons}
    if marker_result.open_window:
        response_type = "open_window"
        structured_data = marker_result.open_window
    if marker_result.close_window:
        response_type = "close_window"
        structured_data = marker_result.close_window
    if marker_result.open_document:
        response_type = "open_document"
        structured_data = marker_result.open_document
    if marker_result.open_url:
        response_type = "open_url"
        structured_data = {"url": marker_result.open_url}
    if marker_result.netzwerk_aktion:
        try:
            netz_result = await _apply_netzwerk_aktion(customer.id, marker_result.netzwerk_aktion, db)
            response_type = "netzwerk_aktion"
            structured_data = netz_result
        except Exception as exc:
            _log.warning("Netzwerk-Aktion (Marker) fehlgeschlagen: %s", exc)

    # Tool-basierte Netzwerk-Aktionen (sequentiell anwenden — alle aus dem Tool-Loop)
    if response_type == "netzwerk_aktion" and isinstance(structured_data, dict):
        actions: list[dict] = structured_data.get("actions") or ([structured_data] if "type" in structured_data else [])
        last_result: dict | None = None
        for action in actions:
            if not isinstance(action, dict) or "type" not in action:
                continue
            try:
                last_result = await _apply_netzwerk_aktion(customer.id, action, db)
            except Exception as exc:
                _log.warning("Netzwerk-Aktion (Tool) fehlgeschlagen: %s | action=%s", exc, action)
        if last_result:
            structured_data = last_result

    emotion = marker_result.emotion
    ui_update = marker_result.ui_update
    if ui_update:
        try:
            cur_prefs = dict(customer.ui_preferences or {})
            cur_prefs.update(ui_update)
            await db.execute(
                text("UPDATE customers SET ui_preferences = CAST(:p AS jsonb) WHERE id = :id"),
                {"p": json.dumps(cur_prefs), "id": customer_id},
            )
        except Exception as e:
            _log.warning("UI-Präferenz konnte nicht gespeichert werden: %s", e)

    # Nachrichten persistieren + last_seen
    user_msg = ChatMessage(customer_id=customer_id, role="user", content=original_message,
                           provider=llm_result["provider"], model=llm_result["model_name"])
    assistant_msg = ChatMessage(customer_id=customer_id, role="assistant", content=response_text,
                                provider=llm_result["provider"], model=llm_result["model_name"],
                                tokens_used=llm_result["tokens_used"])
    db.add(user_msg)
    db.add(assistant_msg)
    customer.last_seen = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        await db.commit()
        await db.refresh(assistant_msg)
    except Exception as e:
        _log.error("Chat-Nachricht konnte nicht gespeichert werden: %s", e)
        await db.rollback()
        raise RuntimeError("Nachricht konnte nicht gespeichert werden") from e

    # E-Mail-Antwort — nur wenn Anfrage per Mail einging (reply_via_email gesetzt)
    # Nie beim normalen Chat-Endpoint (dort wird reply_via_email nie übergeben)
    if reply_via_email and customer.baddi_email and response_text:
        from services.email_service import send_from_baddi_address
        subject = reply_subject or "Antwort von Baddi"
        if not subject.startswith("Re:"):
            subject = f"Re: {subject}"
        _loop_footer = (
            "\n\n──────────────────────────────\n"
            "Bitte nicht auf diese E-Mail antworten — schreibe direkt im Chat auf baddi.ch"
        )
        asyncio.ensure_future(send_from_baddi_address(
            from_baddi_email=customer.baddi_email,
            to_address=reply_via_email,
            subject=subject,
            body_text=response_text + _loop_footer,
            reply_to="no-reply@mail.baddi.ch",
        ))

    # Namensnetz: lastMentionedAt aktualisieren (Hintergrund — Fehler ignorieren)
    asyncio.ensure_future(
        _update_netzwerk_mentions(customer.id, original_message, AsyncSessionLocal())
    )

    # Analytics
    await record_analytics(
        db=db, customer=customer,
        user_message=original_message, assistant_message=response_text,
        response_type=response_type, tokens_used=llm_result["tokens_used"],
        system_prompt_name=system_prompt_name, tools_used=llm_result["tools_called"],
    )

    # Token-Billing
    if llm_result["tokens_used"] > 0:
        try:
            await check_and_bill_tokens(customer, llm_result["tokens_used"], db)
        except Exception as e:
            _log.warning("Token-Billing fehlgeschlagen: %s", e)

    # CapabilityRequest im Hintergrund
    if marker_result.capability_intent:
        await _schedule_capability_request(customer_id, original_message, marker_result.capability_intent)

    # Memory-Extraktion im Hintergrund
    await _push_short_term_memory(customer_id, original_message, response_text)
    if len(original_message.strip()) >= 20:
        try:
            buddy_name = (customer.ui_preferences or {}).get("buddyName", "Baddi")
            process_memory.delay(customer_id, buddy_name)
        except Exception as e:
            _log.warning("Memory Manager konnte nicht gestartet werden: %s", e)

    return str(assistant_msg.id), response_text, response_type, structured_data, ui_update, emotion


# Hält Referenzen auf laufende Background-Tasks — verhindert vorzeitiges GC.
_background_tasks: set[asyncio.Task] = set()


def _track_task(task: asyncio.Task) -> None:
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _schedule_capability_request(customer_id: str, message: str, intent: str) -> None:
    try:
        import asyncio as _asyncio

        async def _create() -> None:
            async with AsyncSessionLocal() as db:
                cap_req = CapabilityRequest(
                    customer_id=customer_id,
                    buddy_id=None,
                    original_message=message,
                    detected_intent=intent,
                    status="pending",
                    dialog=[{
                        "role": "uhrwerk",
                        "content": (
                            f"Neue Anfrage eingegangen: \"{message[:120]}{'...' if len(message) > 120 else ''}\"\n"
                            f"Erkannter Intent: {intent}\n"
                            "Ich analysiere was dafür benötigt wird..."
                        ),
                        "created_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                    }],
                )
                db.add(cap_req)
                await db.commit()
                _log.info("CapabilityRequest erstellt: %s", intent)
                _track_task(_asyncio.create_task(analyse_capability_request(str(cap_req.id))))

        _track_task(_asyncio.create_task(_create()))
    except Exception as e:
        _log.warning("CapabilityRequest konnte nicht erstellt werden: %s", e)


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

async def _load_global_baddi_config() -> dict:
    try:
        r = await get_async_redis()
        raw = await r.get("baddi:config")
        return safe_json_loads(raw)
    except Exception as e:
        _log.warning("Globale Baddi-Config konnte nicht geladen werden: %s", e)
        return {}


async def _push_short_term_memory(customer_id: str, user_msg: str, assistant_msg: str) -> None:
    import time
    try:
        r = await get_async_redis()
        key = f"chat:recent:{customer_id}"
        await r.lpush(key, json.dumps({"role": "user", "content": user_msg, "ts": time.time()}))
        await r.lpush(key, json.dumps({"role": "assistant", "content": assistant_msg, "ts": time.time()}))
        await r.ltrim(key, 0, 11)
        await r.expire(key, 86400)
    except Exception as e:
        _log.warning("Short-term Memory konnte nicht in Redis gespeichert werden: %s", e)


def _format_netzwerk(boards: list[Any], first_name: str) -> str | None:
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
            all_networks.append({
                "name": net.get("name", "?"),
                "members": members,
                "note": net.get("note", ""),
            })

    if not all_persons:
        return None

    person_map_all = {p["id"]: p for p in all_persons}

    lines = [f"\nNAMENSNETZ von {first_name} (persönliche Kontakte — nutze dieses Wissen proaktiv):"]
    reminders: list[str] = []

    lines.append(f"Personen ({len(all_persons)}):")
    for p in all_persons:
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
            pa = person_map_all.get(c.get("a", ""), {})
            pb = person_map_all.get(c.get("b", ""), {})
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


async def _update_netzwerk_mentions(customer_id: Any, user_msg: str, db: AsyncSession) -> None:
    """Scannt die User-Nachricht nach bekannten Personennamen und aktualisiert lastMentionedAt."""
    import time as _time_m, json as _json_m
    try:
        res = await db.execute(
            select(WindowBoard)
            .where(WindowBoard.customer_id == customer_id, WindowBoard.board_type == "netzwerk")
            .order_by(WindowBoard.updated_at.desc())
            .limit(1)
        )
        board = res.scalar_one_or_none()
        if not board:
            return
        data: dict = dict(board.data or {})
        persons: list[dict] = data.get("persons") or []
        now_ms = int(_time_m.time() * 1000)
        msg_lower = user_msg.lower()
        updated = False
        for p in persons:
            name = (p.get("name") or "").strip()
            full = (p.get("fullName") or "").strip()
            if (name and len(name) >= 2 and name.lower() in msg_lower) or \
               (full and len(full) >= 2 and full.lower() in msg_lower):
                p["lastMentionedAt"] = now_ms
                updated = True
        if updated:
            await db.execute(
                text("UPDATE window_boards SET data = CAST(:d AS jsonb), updated_at = NOW() WHERE id = :id"),
                {"d": _json_m.dumps(data), "id": str(board.id)},
            )
            await db.commit()
    except Exception as e:
        _log.warning("lastMentionedAt konnte nicht aktualisiert werden: %s", e)


async def _apply_netzwerk_aktion(customer_id: Any, action: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
    """Wendet eine Netzwerk-Aktion auf das Board des Users an und speichert in der DB."""
    import uuid as _uuid, time as _time, json as _json

    # Board laden oder neu erstellen
    res = await db.execute(
        select(WindowBoard)
        .where(WindowBoard.customer_id == customer_id, WindowBoard.board_type == "netzwerk")
        .order_by(WindowBoard.updated_at.desc())
        .limit(1)
    )
    board = res.scalar_one_or_none()
    if not board:
        board = WindowBoard(customer_id=customer_id, name="Namensnetz", board_type="netzwerk", data={})
        db.add(board)
        await db.flush()

    data: dict = dict(board.data or {})
    if "persons" not in data: data["persons"] = []
    if "networks" not in data: data["networks"] = []
    if "connections" not in data: data["connections"] = []

    added: list[str] = []
    atype = action.get("type", "")

    def _find_or_create_person(name: str) -> dict:
        p = next((x for x in data["persons"] if x.get("name") == name), None)
        if not p:
            now_ms = int(_time.time() * 1000)
            p = {"id": str(_uuid.uuid4()), "name": name, "fullName": name,
                 "photo": None, "x": len(data["persons"]) * 130 + 60, "y": 300, "note": "",
                 "createdAt": now_ms, "lastMentionedAt": now_ms}
            data["persons"].append(p)
            added.append(f"Person '{name}' hinzugefügt")
        return p

    def _find_or_create_network(name: str) -> dict:
        n = next((x for x in data["networks"] if x.get("name") == name), None)
        if not n:
            gid = str(_uuid.uuid4())
            n = {"id": str(_uuid.uuid4()), "name": name,
                 "x": len(data["networks"]) * 220 + 80, "y": 80,
                 "groups": [{"id": gid, "color": "#6366f1", "label": "Mitglied"}],
                 "members": [], "createdAt": int(_time.time() * 1000)}
            data["networks"].append(n)
            added.append(f"Netzwerk '{name}' erstellt")
        return n

    def _add_to_network(net: dict, person: dict) -> None:
        if any(m["personId"] == person["id"] for m in net["members"]):
            return
        gid = net["groups"][0]["id"] if net["groups"] else ""
        net["members"].append({"personId": person["id"], "group": gid})
        added.append(f"'{person['name']}' zu '{net['name']}' hinzugefügt")

    if atype == "add_person":
        _find_or_create_person(action.get("name", "").strip())

    elif atype == "create_network":
        net = _find_or_create_network(action.get("name", "").strip())
        for pname in action.get("persons", []):
            person = _find_or_create_person(pname.strip())
            _add_to_network(net, person)

    elif atype == "add_to_network":
        net_name = (action.get("network") or action.get("name") or "").strip()
        net = _find_or_create_network(net_name)
        for pname in action.get("persons", []):
            person = _find_or_create_person(pname.strip())
            _add_to_network(net, person)

    elif atype == "add_connection":
        # Primär: persons-Liste (LLM befüllt diese konsistent)
        persons_list = [p.strip() for p in (action.get("persons") or []) if p.strip()]
        pa_name = persons_list[0] if len(persons_list) >= 1 else (action.get("person_a") or "").strip()
        pb_name = persons_list[1] if len(persons_list) >= 2 else (action.get("person_b") or "").strip()
        # Fallback: Board hat genau 2 Personen → verbinde beide
        if (not pa_name or not pb_name) and len(data["persons"]) == 2:
            pa_name = data["persons"][0].get("name", "")
            pb_name = data["persons"][1].get("name", "")
        _log.info("add_connection: person_a=%r person_b=%r persons_in_board=%r",
                  pa_name, pb_name, [p.get("name") for p in data["persons"]])
        if pa_name and pb_name:
            pa = _find_or_create_person(pa_name)
            pb = _find_or_create_person(pb_name)
            already = any(
                (c["a"] == pa["id"] and c["b"] == pb["id"]) or
                (c["a"] == pb["id"] and c["b"] == pa["id"])
                for c in data["connections"]
            )
            _log.info("add_connection: pa=%r pb=%r already=%s connections_before=%r",
                      pa["id"], pb["id"], already, data["connections"])
            if not already:
                conn: dict[str, str] = {"id": str(_uuid.uuid4()), "a": pa["id"], "b": pb["id"]}
                label = (action.get("label") or "").strip()
                if label:
                    conn["label"] = label
                data["connections"].append(conn)
                label_str = f" ({label})" if label else ""
                added.append(f"Verbindung '{pa_name}' ↔ '{pb_name}'{label_str} erstellt")
        else:
            _log.warning("add_connection: leere Namen — person_a=%r person_b=%r action=%r",
                         pa_name, pb_name, action)

    # Speichern
    _log.info("Netzwerk-Aktion speichern: board=%s atype=%s added=%r connections=%r",
              board.id, atype, added, data.get("connections"))
    await db.execute(
        text("UPDATE window_boards SET data = CAST(:d AS jsonb), updated_at = NOW() WHERE id = :id"),
        {"d": _json.dumps(data), "id": str(board.id)},
    )
    await db.commit()
    return {"board_id": str(board.id), "added": added}
