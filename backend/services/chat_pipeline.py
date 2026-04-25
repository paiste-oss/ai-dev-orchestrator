"""
Chat-Pipeline — Phase 2+3.

  2. execute_llm()  — Vision / Text + Tool-Calls + Fallbacks
  3. finalize()     — Persistenz, Analytics, Billing, Background-Tasks

Phase 1 (Kontext laden) → services/chat_context.py
Netzwerk-Aktionen      → services/chat_netzwerk.py
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, TypedDict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import AsyncSessionLocal
from models.capability_request import CapabilityRequest
from models.chat import ChatMessage
from models.customer import Customer
from services.billing_service import check_and_bill_tokens
from services.buddy_agent import run_buddy_chat
from services.chat_analytics import record_analytics
from services.chat_context import load_context  # noqa: F401 — re-exported for callers
from services.chat_markers import process_markers
from services.chat_netzwerk import apply_netzwerk_aktion, update_netzwerk_mentions
from services.entwicklung_engine import analyse_capability_request
from services.llm_gateway import chat_with_claude, chat_with_gemini, chat_with_openai
from services.tool_registry import TOOL_CATALOG
from tasks.memory_manager import process_memory

_log = logging.getLogger(__name__)


class ChatContext(TypedDict):
    prior_messages: list[dict[str, Any]]
    baddi_config: dict[str, Any]
    system_prompt: list[dict[str, Any]]
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


# ── Phase 2: LLM ausführen ────────────────────────────────────────────────────

def _build_canvas_note(canvas: list[dict[str, Any]]) -> str:
    """Erzeugt einen kompakten Hint für das LLM über das Artifact-Panel.

    Wichtig: blob:-URLs sind nutzlos für das Backend. Wenn ein FileViewer
    eine literatureEntryId / documentEntryId trägt, schreiben wir stattdessen
    eine Anweisung wie 'nutze library_read({id, type})'.
    """
    import json as _json
    lines = ["[Artifact-Panel — aktuell geöffnet:]"]
    for a in canvas:
        mark = " ◀ aktiv" if a.get("active") else ""
        title = a.get("title") or a.get("type") or "?"
        atype = a.get("type") or "?"
        line = f"  • {title} [Typ: {atype}]{mark}"
        data = a.get("data") or {}

        # Spezialfall: FileViewer mit Bibliotheks-Bezug
        lit_id = data.get("literatureEntryId") if isinstance(data, dict) else None
        doc_id = data.get("documentEntryId") if isinstance(data, dict) else None
        if atype == "file_viewer" and (lit_id or doc_id):
            if lit_id:
                line += (
                    f"\n    → Dies ist ein Literatur-Eintrag (id={lit_id}). "
                    f"Wenn der Nutzer auf 'das PDF', 'dieses Paper' o.ä. verweist, "
                    f"nutze library_read mit id='{lit_id}', type='literature' um den Volltext zu lesen."
                )
            elif doc_id:
                line += (
                    f"\n    → Dies ist ein Dokument (id={doc_id}). "
                    f"Wenn der Nutzer auf 'das Dokument' o.ä. verweist, "
                    f"nutze library_read mit id='{doc_id}', type='document' um den Volltext zu lesen."
                )
            filename = data.get("filename")
            if filename:
                line += f" Dateiname: {filename}."
        elif data:
            # Generische Darstellung — aber blob:-URLs filtern (sind für das Backend wertlos)
            if isinstance(data, dict):
                cleaned = {k: v for k, v in data.items()
                           if not (isinstance(v, str) and v.startswith("blob:"))}
                if cleaned:
                    summary = _json.dumps(cleaned, ensure_ascii=False, default=str)
                    if len(summary) > 400:
                        summary = summary[:400] + "…"
                    line += f"\n    Daten: {summary}"
            else:
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

    user_message = await _embed_documents(message, document_ids, customer, db, doc_cache or {})

    if canvas_context:
        canvas_note = _build_canvas_note(canvas_context)
        user_message = f"{canvas_note}\n\n{user_message}"

    if images:
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

        pending_netzwerk_aktions: list[dict] = []

        for tc in uhrwerk_result.get("tool_calls", []):
            tool_name = tc.get("tool")
            if tool_name:
                tools_called.append(tool_name)
            result = tc.get("result")

            if isinstance(result, dict):
                if url := result.get("image_url"):
                    generated_image_urls.append(url)
            elif isinstance(result, list):
                for item in result:
                    if isinstance(item, dict):
                        if url := item.get("image_url"):
                            generated_image_urls.append(url)

            if isinstance(result, dict) and "_netzwerk_aktion" in result:
                pending_netzwerk_aktions.append(result["_netzwerk_aktion"])
                continue

            response_type, structured_data = _extract_structured_data(
                tool_name, result, response_type, structured_data
            )

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

    artifact_action = result.get("_artifact_action")
    if artifact_action == "open":
        payload = {k: v for k, v in result.items() if k != "_artifact_action"}
        return "open_window", payload
    if artifact_action == "close":
        payload = {k: v for k, v in result.items() if k != "_artifact_action"}
        return "close_window", payload

    if "_netzwerk_aktion" in result:
        return "netzwerk_aktion", result["_netzwerk_aktion"]

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

    _language = (customer.ui_preferences or {}).get("language", "de")
    marker_result = process_markers(response_text, language=_language)
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
            netz_result = await apply_netzwerk_aktion(customer.id, marker_result.netzwerk_aktion, db)
            response_type = "netzwerk_aktion"
            structured_data = netz_result
        except Exception as exc:
            _log.warning("Netzwerk-Aktion (Marker) fehlgeschlagen: %s", exc)

    if response_type == "netzwerk_aktion" and isinstance(structured_data, dict):
        actions: list[dict] = structured_data.get("actions") or ([structured_data] if "type" in structured_data else [])
        last_result: dict | None = None
        for action in actions:
            if not isinstance(action, dict) or "type" not in action:
                continue
            try:
                last_result = await apply_netzwerk_aktion(customer.id, action, db)
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

    asyncio.ensure_future(
        update_netzwerk_mentions(customer.id, original_message, AsyncSessionLocal())
    )

    await record_analytics(
        db=db, customer=customer,
        user_message=original_message, assistant_message=response_text,
        response_type=response_type, tokens_used=llm_result["tokens_used"],
        system_prompt_name=system_prompt_name, tools_used=llm_result["tools_called"],
    )

    if llm_result["tokens_used"] > 0:
        try:
            await check_and_bill_tokens(customer, llm_result["tokens_used"], db)
        except Exception as e:
            _log.warning("Token-Billing fehlgeschlagen: %s", e)

    if marker_result.capability_intent:
        await _schedule_capability_request(customer_id, original_message, marker_result.capability_intent)

    await _push_short_term_memory(customer_id, original_message, response_text)
    if len(original_message.strip()) >= 20:
        try:
            buddy_name = (customer.ui_preferences or {}).get("buddyName", "Baddi")
            process_memory.delay(customer_id, buddy_name)
        except Exception as e:
            _log.warning("Memory Manager konnte nicht gestartet werden: %s", e)

    return str(assistant_msg.id), response_text, response_type, structured_data, ui_update, emotion


# ── Background-Task-Helpers ───────────────────────────────────────────────────

_background_tasks: set[asyncio.Task] = set()


def _track_task(task: asyncio.Task) -> None:
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _schedule_capability_request(customer_id: str, message: str, intent: str) -> None:
    try:
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
                _track_task(asyncio.create_task(analyse_capability_request(str(cap_req.id))))

        _track_task(asyncio.create_task(_create()))
    except Exception as e:
        _log.warning("CapabilityRequest konnte nicht erstellt werden: %s", e)


async def _push_short_term_memory(customer_id: str, user_msg: str, assistant_msg: str) -> None:
    import time
    from core.redis_client import get_async_redis
    try:
        r = await get_async_redis()
        key = f"chat:recent:{customer_id}"
        await r.lpush(key, json.dumps({"role": "user", "content": user_msg, "ts": time.time()}))
        await r.lpush(key, json.dumps({"role": "assistant", "content": assistant_msg, "ts": time.time()}))
        await r.ltrim(key, 0, 11)
        await r.expire(key, 86400)
    except Exception as e:
        _log.warning("Short-term Memory konnte nicht in Redis gespeichert werden: %s", e)
