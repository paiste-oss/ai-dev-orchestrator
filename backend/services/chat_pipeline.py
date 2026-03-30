"""
Chat-Pipeline — Kernlogik des send_message Endpoints.

Aufteilung in drei Phasen:
  1. load_context()    — History, Config, Memories, Knowledge, System-Prompt
  2. execute_llm()     — Vision / Text + Tool-Calls + Fallbacks
  3. finalize()        — Persistenz, Analytics, Billing, Background-Tasks
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.redis_client import redis_sync
from core.utils import safe_json_loads
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from services.chat_system_prompt import build_system_prompt
from services.chat_markers import process_markers
from services.chat_analytics import record_analytics
from services.memory_vector_store import search_memories, get_style_memories
from services.billing_service import check_and_bill_tokens
from services.buddy_agent import run_buddy_chat
from services.llm_gateway import chat_with_claude, chat_with_gemini, chat_with_openai

_log = logging.getLogger(__name__)

_HISTORY_WINDOW = 20
_CONTEXT_WINDOW = 10


# ── Phase 1: Kontext laden ────────────────────────────────────────────────────

async def load_context(customer: Customer, message: str, db: AsyncSession) -> dict:
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
    baddi_config = _load_global_baddi_config()

    # Memories aus Qdrant (Fallback: PostgreSQL)
    try:
        relevant = search_memories(customer_id, message, top_k=10)
    except Exception:
        result_mem = await db.execute(
            select(MemoryItem)
            .where(MemoryItem.customer_id == customer_id, MemoryItem.is_active.is_(True))
            .order_by(MemoryItem.importance.desc()).limit(5)
        )
        relevant = [m.content for m in result_mem.scalars().all()]

    try:
        style_prefs = get_style_memories(customer_id)
    except Exception:
        result_style = await db.execute(
            select(MemoryItem)
            .where(MemoryItem.customer_id == customer_id, MemoryItem.is_active.is_(True),
                   MemoryItem.category == "style")
            .order_by(MemoryItem.importance.desc()).limit(5)
        )
        style_prefs = [m.content for m in result_style.scalars().all()]

    # Kunden-Dokumente automatisch laden
    from models.document import CustomerDocument
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

    # Globale Wissensbasis
    knowledge_chunks: list[dict] = []
    if baddi_config.get("knowledge_enabled", True):
        try:
            from services.knowledge_store import search_global_knowledge
            knowledge_chunks = search_global_knowledge(
                query=message,
                top_k=int(baddi_config.get("knowledge_max_results", 3)),
                min_score=float(baddi_config.get("knowledge_min_score", 0.72)),
                domains=baddi_config.get("knowledge_domains") or None,
            )
        except Exception:
            pass

    # System-Prompt
    first_name = customer.name.split()[0] if customer.name else "du"
    system_prompt = build_system_prompt(
        first_name=first_name,
        baddi_config=baddi_config,
        style_prefs=style_prefs,
        relevant_memories=relevant,
        ui_prefs=customer.ui_preferences or {},
        knowledge_chunks=knowledge_chunks or None,
        readable_docs=readable_docs,
        private_doc_names=[d.original_filename for d in private_docs],
    )

    return {
        "prior_messages": prior_messages,
        "baddi_config": baddi_config,
        "system_prompt": system_prompt,
        "system_prompt_name": baddi_config.get("name") or baddi_config.get("system_prompt_name") or "Standard",
    }


# ── Phase 2: LLM ausführen ────────────────────────────────────────────────────

async def execute_llm(
    customer: Customer,
    message: str,
    images: list | None,
    document_ids: list[str] | None,
    prior_messages: list[dict],
    system_prompt: str,
    db: AsyncSession,
) -> dict:
    """Führt den LLM-Call aus (Vision / Text + Tools + Fallbacks)."""
    from services.tool_registry import TOOL_CATALOG

    provider = "claude"
    model_name = "claude-haiku-4-5-20251001"
    response_text: str | None = None
    tokens_used: int = 0
    generated_image_urls: list[str] = []
    errors: list[str] = []
    response_type = "text"
    structured_data: dict | None = None
    tools_called: list[str] = []

    # Dokumente in Nachricht einbetten
    user_message = await _embed_documents(message, document_ids, customer, db)

    if images:
        response_text, tokens_used, errors = await _run_vision(
            images, user_message, prior_messages, system_prompt, model_name, errors
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
    message: str, document_ids: list[str] | None, customer: Customer, db: AsyncSession
) -> str:
    if not document_ids:
        return message
    from models.document import CustomerDocument
    import uuid as _uuid
    doc_parts: list[str] = []
    for doc_id in document_ids:
        try:
            doc = await db.get(CustomerDocument, _uuid.UUID(doc_id))
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
    images: list, user_message: str, prior_messages: list, system_prompt: str,
    model_name: str, errors: list
) -> tuple[str | None, int, list]:
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
    user_message: str, prior_messages: list, system_prompt: str, model_name: str,
    tool_keys: list, customer_id: str, errors: list
) -> tuple:
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

            # Structured data für UI-Karten
            response_type, structured_data = _extract_structured_data(
                tool_name, result, response_type, structured_data
            )

    except Exception as e:
        errors.append(f"Uhrwerk: {e}")

    return response_text, model_name, tokens_used, errors, tools_called, generated_image_urls, response_type, structured_data


def _extract_structured_data(
    tool_name: str | None, result: Any, response_type: str, structured_data: dict | None
) -> tuple[str, dict | None]:
    if tool_name == "get_stock_price" and isinstance(result, dict) and "price" in result:
        return "stock_card", result
    if tool_name == "get_stock_history" and isinstance(result, dict) and "data_points" in result:
        return "stock_history", result
    if tool_name == "generate_image" and isinstance(result, dict) and "image_url" in result:
        return "image_gallery", {"images": [{"image_url": result["image_url"], "description": result.get("prompt", "Generiertes Bild"), "source": "DALL-E 3"}]}
    if tool_name == "search_image":
        if isinstance(result, list) and result:
            return "image_gallery", {"images": result}
        if isinstance(result, dict) and "image_url" in result:
            return "image_gallery", {"images": [result]}
    if tool_name == "sbb_stationboard" and isinstance(result, dict) and "departures" in result:
        return "transport_board", result
    if tool_name == "browser" and isinstance(result, dict) and result.get("screenshot_b64"):
        return "browser_view", {"screenshot_b64": result["screenshot_b64"], "url": result.get("url", ""), "error": result.get("error")}
    return response_type, structured_data


async def _run_fallbacks(
    messages: list, system_prompt: str, errors: list
) -> tuple[str | None, str, str, int, list]:
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
    llm_result: dict,
    system_prompt_name: str,
    db: AsyncSession,
) -> tuple[str, dict | None, dict | None]:
    """
    Verarbeitet Marker, persistiert, bucht, startet Background-Tasks.
    Gibt (response_text, structured_data, ui_update) zurück.
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
    customer.last_seen = datetime.utcnow()
    await db.commit()
    await db.refresh(assistant_msg)

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
        _schedule_capability_request(customer_id, original_message, marker_result.capability_intent)

    # Memory-Extraktion im Hintergrund
    _push_short_term_memory(customer_id, original_message, response_text)
    if len(original_message.strip()) >= 20:
        try:
            from tasks.memory_manager import process_memory
            process_memory.delay(customer_id)
        except Exception as e:
            _log.warning("Memory Manager konnte nicht gestartet werden: %s", e)

    return str(assistant_msg.id), response_text, response_type, structured_data, ui_update


def _schedule_capability_request(customer_id: str, message: str, intent: str) -> None:
    try:
        import asyncio
        from models.capability_request import CapabilityRequest
        from services.entwicklung_engine import analyse_capability_request
        from core.database import AsyncSessionLocal

        async def _create():
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
                        "created_at": datetime.utcnow().isoformat(),
                    }],
                )
                db.add(cap_req)
                await db.commit()
                _log.info("CapabilityRequest erstellt: %s", intent)
                asyncio.ensure_future(analyse_capability_request(str(cap_req.id)))

        asyncio.ensure_future(_create())
    except Exception as e:
        _log.warning("CapabilityRequest konnte nicht erstellt werden: %s", e)


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _load_global_baddi_config() -> dict:
    try:
        raw = redis_sync().get("baddi:config")
        return safe_json_loads(raw)
    except Exception as e:
        _log.warning("Globale Baddi-Config konnte nicht geladen werden: %s", e)
        return {}


def _push_short_term_memory(customer_id: str, user_msg: str, assistant_msg: str) -> None:
    import time
    r = redis_sync()
    key = f"chat:recent:{customer_id}"
    r.lpush(key, json.dumps({"role": "user", "content": user_msg, "ts": time.time()}))
    r.lpush(key, json.dumps({"role": "assistant", "content": assistant_msg, "ts": time.time()}))
    r.ltrim(key, 0, 11)
    r.expire(key, 86400)
