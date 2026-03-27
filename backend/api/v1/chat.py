"""
Chat API — vereinfachte Pipeline mit nativem Claude Tool Use.

Flow pro Request:
  1.  Conversation history laden
  2.  Globale Baddi-Konfiguration laden
  3.  Content Guard (lokal, <1ms)
  4.  System-Prompt aufbauen
  5.  Bilder? → claude-sonnet-4-6 (Vision, keine Tools)
      Text?   → claude-haiku-4-5 + ALLE Tools (Claude entscheidet selbst)
  6.  Fallback: Gemini → OpenAI
  7.  Beide Turns persistieren
  8.  Token-Quota abrechnen
  9.  Memory-Extraktion im Hintergrund
"""
import json
import logging as _logging
from datetime import datetime

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import httpx as _httpx
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from services.llm_gateway import chat_with_claude, chat_with_gemini, chat_with_openai
from services.memory_service import select_relevant_context, select_style_context
from services.agent_router import route as agent_route
from services.buddy_agent import run_buddy_chat
from services.billing_service import check_and_bill_tokens
from services.chat_system_prompt import build_system_prompt
from services.chat_markers import process_markers
from services.chat_analytics import record_analytics

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_WINDOW = 20
_CONTEXT_WINDOW = 10

_log = _logging.getLogger(__name__)

_redis_client: "redis_lib.Redis | None" = None


def _get_redis() -> "redis_lib.Redis":
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_lib.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _push_short_term_memory(customer_id: str, user_msg: str, assistant_msg: str) -> None:
    import time
    r = _get_redis()
    key = f"chat:recent:{customer_id}"
    r.lpush(key, json.dumps({"role": "user",      "content": user_msg,      "ts": time.time()}))
    r.lpush(key, json.dumps({"role": "assistant", "content": assistant_msg, "ts": time.time()}))
    r.ltrim(key, 0, 11)
    r.expire(key, 86400)


def _load_global_baddi_config() -> dict:
    try:
        raw = _get_redis().get("baddi:config")
        return json.loads(raw) if raw else {}
    except Exception as e:
        _log.warning("Globale Baddi-Config konnte nicht geladen werden: %s", e)
        return {}


# ── Schemas ───────────────────────────────────────────────────────────────────

class ImageAttachment(BaseModel):
    data: str
    media_type: str


class ChatRequest(BaseModel):
    message: str
    images: list[ImageAttachment] | None = None
    document_ids: list[str] | None = None


class ChatResponse(BaseModel):
    message_id: str
    response: str
    provider: str
    model: str
    image_urls: list[str] | None = None
    response_type: str = "text"
    structured_data: dict | None = None
    ui_update: dict | None = None  # z.B. {"fontSize": "large"}


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    provider: str | None
    model: str | None
    created_at: str


class MemoryOut(BaseModel):
    id: str
    content: str
    importance: float
    created_at: str


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/message", response_model=ChatResponse)
async def send_message(
    req: ChatRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_id = str(customer.id)

    # 1. Conversation history
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.customer_id == customer_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(_HISTORY_WINDOW)
    )
    history = list(reversed(result.scalars().all()))
    prior_messages = [{"role": m.role, "content": m.content} for m in history[-_CONTEXT_WINDOW:]]

    # 2. Globale Baddi-Konfiguration
    baddi_config = _load_global_baddi_config()

    # 3. Content Guard
    routing = agent_route(req.message, customer_id=customer_id)
    if routing.blocked:
        # Blockierte Anfrage persistieren (für Behörden-Auskunft)
        try:
            from models.content_guard_log import ContentGuardLog
            from services.agent_router import _CONTENT_GUARD_PATTERNS
            m = _CONTENT_GUARD_PATTERNS.search(req.message)
            log_entry = ContentGuardLog(
                customer_id=customer_id,
                message=req.message,
                matched_pattern=m.group(0)[:200] if m else None,
            )
            db.add(log_entry)
            await db.commit()
        except Exception as e:
            _log.warning("Content Guard Log fehlgeschlagen: %s", e)
        raise HTTPException(status_code=400, detail="Anfrage abgelehnt.")

    # 3b. Quota-Check — vor dem API-Call (Admin immer erlaubt)
    if customer.role != "admin":
        from services.billing_service import check_quota
        await check_quota(customer, db)

    # 4. Relevante Memories + Kunden-Stil
    relevant = await select_relevant_context(customer_id, req.message, db)
    style_prefs = await select_style_context(customer_id, db)

    # 5. System-Prompt aufbauen
    first_name = customer.name.split()[0] if customer.name else "du"
    system_prompt = build_system_prompt(
        first_name=first_name,
        baddi_config=baddi_config,
        style_prefs=style_prefs,
        relevant_memories=relevant,
        ui_prefs=customer.ui_preferences or {},
    )

    # 6. Request ausführen
    provider = "claude"
    model_name = "claude-haiku-4-5-20251001"
    response_text: str | None = None
    tokens_used: int = 0
    generated_image_urls: list[str] = []
    errors: list[str] = []
    response_type = "text"
    structured_data: dict | None = None
    _tools_called: list[str] = []  # für Analytics
    _system_prompt_name: str = baddi_config.get("name") or baddi_config.get("system_prompt_name") or "Standard"

    # 6a. Dokumente aus DB laden und Inhalt in die Nachricht einbauen
    user_message = req.message
    if req.document_ids:
        from models.document import CustomerDocument
        doc_parts: list[str] = []
        for doc_id in req.document_ids:
            try:
                import uuid as _uuid
                doc = await db.get(CustomerDocument, _uuid.UUID(doc_id))
                if doc and doc.customer_id == customer.id and doc.is_active and doc.extracted_text:
                    # Auf max. 12'000 Zeichen kürzen um Token-Limit zu schonen
                    text = doc.extracted_text
                    truncated = ""
                    if len(text) > 12000:
                        text = text[:12000]
                        truncated = "\n[... Inhalt gekürzt]"
                    pages_info = f"{doc.page_count} Seite(n)" if doc.page_count > 1 else ""
                    header = f'[Datei: "{doc.original_filename}"{" — " + pages_info if pages_info else ""}]'
                    doc_parts.append(f"{header}\n{text}{truncated}")
            except Exception as e:
                _log.warning("Dokument %s konnte nicht geladen werden: %s", doc_id, e)
        if doc_parts:
            doc_block = "\n\n---\n".join(doc_parts)
            user_message = f"{doc_block}\n\n---\n\n{req.message}" if req.message.strip() else doc_block

    from services.tool_registry import TOOL_CATALOG

    if req.images:
        # Vision: Sonnet, keine Tools
        model_name = "claude-sonnet-4-6"
        user_content: list[dict] = []
        for img in req.images:
            user_content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": img.media_type, "data": img.data},
            })
        if user_message.strip():
            user_content.append({"type": "text", "text": user_message})
        messages = prior_messages + [{"role": "user", "content": user_content}]

        try:
            result = await chat_with_claude(messages, system_prompt, model=model_name)
            response_text = result.text
            tokens_used = result.total_tokens
        except Exception as e:
            errors.append(f"Claude Vision: {e}")

    else:
        # Text: Haiku + ALLE Tools — Claude entscheidet selbst
        messages = prior_messages + [{"role": "user", "content": user_message}]
        all_tool_keys = list(TOOL_CATALOG.keys())

        try:
            uhrwerk_result = await run_buddy_chat(
                message=user_message,
                buddy_name="Baddi",
                system_prompt=system_prompt,
                tool_keys=all_tool_keys,
                model=model_name,
                history=prior_messages,
                customer_id=customer_id,
            )
            response_text = uhrwerk_result["output"]
            model_name = uhrwerk_result.get("model_used", model_name)
            tokens_used = uhrwerk_result.get("total_tokens", 0)

            # Bild-URLs + Structured Data aus Tool-Calls extrahieren
            for tc in uhrwerk_result.get("tool_calls", []):
                tool_name = tc.get("tool")
                if tool_name:
                    _tools_called.append(tool_name)
                result = tc.get("result")

                # Bild-URLs (DALL-E + Unsplash)
                if isinstance(result, dict):
                    url = result.get("image_url")
                    if url:
                        generated_image_urls.append(url)
                elif isinstance(result, list):
                    for item in result:
                        if isinstance(item, dict):
                            url = item.get("image_url")
                            if url:
                                generated_image_urls.append(url)

                # Structured data für UI-Karten
                if tool_name == "get_stock_price" and isinstance(result, dict) and "price" in result:
                    response_type = "stock_card"
                    structured_data = result

                elif tool_name == "get_stock_history" and isinstance(result, dict) and "data_points" in result:
                    response_type = "stock_history"
                    structured_data = result

                elif tool_name == "generate_image" and isinstance(result, dict) and "image_url" in result:
                    response_type = "image_gallery"
                    structured_data = {"images": [{
                        "image_url": result["image_url"],
                        "description": result.get("prompt", "Generiertes Bild"),
                        "source": "DALL-E 3",
                    }]}

                elif tool_name == "search_image":
                    if isinstance(result, list) and result:
                        response_type = "image_gallery"
                        structured_data = {"images": result}
                    elif isinstance(result, dict) and "image_url" in result:
                        response_type = "image_gallery"
                        structured_data = {"images": [result]}

                elif tool_name == "sbb_stationboard" and isinstance(result, dict) and "departures" in result:
                    response_type = "transport_board"
                    structured_data = result

                elif tool_name == "browser" and isinstance(result, dict) and result.get("screenshot_b64"):
                    response_type = "browser_view"
                    structured_data = {
                        "screenshot_b64": result["screenshot_b64"],
                        "url": result.get("url", ""),
                        "error": result.get("error"),
                    }
        except Exception as e:
            errors.append(f"Uhrwerk: {e}")

    # 7. Fallback: Gemini → OpenAI
    if response_text is None and settings.gemini_api_key:
        try:
            provider = "gemini"
            model_name = "gemini-2.5-flash"
            result = await chat_with_gemini(messages, system_prompt)
            response_text = result.text
            tokens_used = result.total_tokens
        except Exception as e:
            errors.append(f"Gemini: {e}")

    if response_text is None and settings.openai_api_key:
        try:
            provider = "openai"
            model_name = "gpt-4o-mini"
            result = await chat_with_openai(messages, system_prompt)
            response_text = result.text
            tokens_used = result.total_tokens
        except Exception as e:
            errors.append(f"OpenAI: {e}")

    if response_text is None:
        raise HTTPException(status_code=502, detail=" | ".join(errors))

    # 7b–7d. Marker verarbeiten (Aktions-Buttons, UI-Update, Fehlende Fähigkeit)
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

    _ui_update = marker_result.ui_update
    if _ui_update:
        # UI-Präferenz in DB speichern
        try:
            import json as _json
            _cur_prefs = dict(customer.ui_preferences or {})
            _cur_prefs.update(_ui_update)
            await db.execute(
                text("UPDATE customers SET ui_preferences = CAST(:p AS jsonb) WHERE id = :id"),
                {"p": _json.dumps(_cur_prefs), "id": str(customer.id)},
            )
        except Exception as _e:
            _log.warning("UI-Präferenz konnte nicht gespeichert werden: %s", _e)

    _capability_intent = marker_result.capability_intent

    # 8. Beide Turns persistieren
    user_msg = ChatMessage(
        customer_id=customer_id, role="user", content=req.message,
        provider=provider, model=model_name,
    )
    assistant_msg = ChatMessage(
        customer_id=customer_id, role="assistant", content=response_text,
        provider=provider, model=model_name, tokens_used=tokens_used,
    )
    db.add(user_msg)
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    # 8b. Anonymisierte Analytics speichern (DSG-konform)
    await record_analytics(
        db=db,
        customer=customer,
        user_message=req.message,
        assistant_message=response_text,
        response_type=response_type,
        tokens_used=tokens_used,
        system_prompt_name=_system_prompt_name,
        tools_used=_tools_called,
    )

    # 9. Token-Quota abrechnen
    if tokens_used > 0:
        try:
            await check_and_bill_tokens(customer, tokens_used, db)
        except Exception as e:
            _log.warning("Token-Billing fehlgeschlagen: %s", e)

    # 9b. CapabilityRequest im Hintergrund anlegen
    if _capability_intent:
        try:
            from models.capability_request import CapabilityRequest
            cap_req = CapabilityRequest(
                customer_id=customer_id,
                buddy_id=None,
                original_message=req.message,
                detected_intent=_capability_intent,
                status="pending",
                dialog=[{
                    "role": "uhrwerk",
                    "content": (
                        f"Neue Anfrage eingegangen: \"{req.message[:120]}{'...' if len(req.message) > 120 else ''}\"\n"
                        f"Erkannter Intent: {_capability_intent}\n"
                        "Ich analysiere was dafür benötigt wird..."
                    ),
                    "created_at": datetime.utcnow().isoformat(),
                }],
            )
            db.add(cap_req)
            await db.commit()
            _log.info("CapabilityRequest erstellt: %s", _capability_intent)
            # Uhrwerk-Analyse im Hintergrund starten
            from services.entwicklung_engine import analyse_capability_request
            import asyncio
            asyncio.ensure_future(analyse_capability_request(str(cap_req.id)))
        except Exception as e:
            _log.warning("CapabilityRequest konnte nicht erstellt werden: %s", e)

    # 10. Memory-Extraktion im Hintergrund
    _push_short_term_memory(customer_id, req.message, response_text)
    try:
        from tasks.memory_manager import process_memory
        process_memory.delay(customer_id)
    except Exception as e:
        _log.warning("Memory Manager konnte nicht gestartet werden: %s", e)

    return ChatResponse(
        message_id=str(assistant_msg.id),
        response=response_text,
        provider=provider,
        model=model_name,
        image_urls=generated_image_urls if generated_image_urls else None,
        response_type=response_type,
        structured_data=structured_data,
        ui_update=_ui_update,
    )


@router.get("/history", response_model=list[MessageOut])
async def get_history(
    limit: int = 50,
    buddy_id: str | None = None,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(ChatMessage).where(ChatMessage.customer_id == str(customer.id))
    if buddy_id:
        q = q.where(ChatMessage.buddy_id == buddy_id)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)
    result = await db.execute(q)
    msgs = list(reversed(result.scalars().all()))
    return [
        MessageOut(
            id=str(m.id), role=m.role, content=m.content,
            provider=m.provider, model=m.model,
            created_at=m.created_at.isoformat(),
        )
        for m in msgs
    ]


@router.get("/memories", response_model=list[MemoryOut])
async def get_memories(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryItem)
        .where(MemoryItem.customer_id == str(customer.id), MemoryItem.is_active.is_(True))
        .order_by(MemoryItem.importance.desc(), MemoryItem.created_at.desc())
    )
    return [
        MemoryOut(
            id=str(m.id), content=m.content,
            importance=m.importance, created_at=m.created_at.isoformat(),
        )
        for m in result.scalars().all()
    ]


@router.delete("/memories/{memory_id}", status_code=204)
async def delete_memory(
    memory_id: str,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryItem).where(
            MemoryItem.id == memory_id,
            MemoryItem.customer_id == str(customer.id),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Erinnerung nicht gefunden")
    item.is_active = False
    await db.commit()


@router.post("/tts")
async def text_to_speech(
    req: TTSRequest,
    customer: Customer = Depends(get_current_user),
):
    from services.elevenlabs_client import synthesize
    from fastapi.responses import Response
    try:
        audio = await synthesize(req.text, req.voice_id)
        return Response(content=audio, media_type="audio/mpeg")
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS Fehler: {e}")


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    customer: Customer = Depends(get_current_user),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Whisper nicht verfügbar (kein OpenAI API Key).")

    audio_bytes = await file.read()
    filename = file.filename or "audio.mp3"

    async with _httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            files={"file": (filename, audio_bytes, file.content_type or "audio/mpeg")},
            data={"model": "whisper-1", "language": "de"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Whisper Fehler: {resp.text}")
        result = resp.json()

    return {"text": result.get("text", "")}


@router.post("/upload-attachment")
async def upload_attachment(
    file: UploadFile = File(...),
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lädt eine Datei hoch, extrahiert den Text und speichert sie in der Kundendatenbank.
    Gibt document_id zurück — diese kann dann in /chat/message als document_ids mitgeschickt werden.
    """
    from models.document import CustomerDocument
    from services.file_parser import parse_file, is_supported, get_file_extension
    from sqlalchemy import update as _sa_update

    MAX_SIZE = 50 * 1024 * 1024
    content = await file.read()

    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail=f"Datei zu gross. Maximum: {MAX_SIZE // 1024 // 1024} MB")

    filename = file.filename or "dokument"
    mime_type = file.content_type or ""

    if not is_supported(filename, mime_type):
        ext = get_file_extension(filename)
        raise HTTPException(status_code=415, detail=f"Dateityp '{ext}' nicht unterstützt.")

    # Speicherlimit prüfen
    total_limit = (customer.storage_limit_bytes or 0) + (customer.storage_extra_bytes or 0)
    used = customer.storage_used_bytes or 0
    if used + len(content) > total_limit:
        free_mb = max(0, total_limit - used) / 1024 / 1024
        raise HTTPException(status_code=507, detail=f"Speicherlimit erreicht. Noch verfügbar: {free_mb:.1f} MB")

    parse_result = parse_file(content, filename, mime_type)

    import uuid as _uuid
    unique_filename = f"{customer.id}_{_uuid.uuid4().hex[:8]}_{filename}"
    doc = CustomerDocument(
        customer_id=customer.id,
        filename=unique_filename,
        original_filename=filename,
        file_type=get_file_extension(filename) or "unknown",
        file_size_bytes=len(content),
        mime_type=mime_type,
        file_content=content,
        extracted_text=parse_result.text,
        page_count=parse_result.page_count,
        char_count=len(parse_result.text),
        stored_in_postgres=True,
        stored_in_qdrant=False,
        doc_metadata=parse_result.metadata,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    await db.execute(
        _sa_update(Customer)
        .where(Customer.id == customer.id)
        .values(storage_used_bytes=Customer.storage_used_bytes + len(content))
    )
    await db.commit()

    return {
        "document_id": str(doc.id),
        "filename": filename,
        "file_type": doc.file_type,
        "page_count": doc.page_count,
        "char_count": doc.char_count,
    }


class BrowserActionRequest(BaseModel):
    action: dict  # {"type": "navigate"|"click"|"type"|"scroll"|"screenshot", ...}


@router.post("/browser")
async def browser_action_endpoint(
    payload: BrowserActionRequest,
    customer: Customer = Depends(get_current_user),
):
    """Direkte Browser-Aktion (navigate, click, type, scroll, screenshot)."""
    if not settings.browserless_token:
        raise HTTPException(status_code=503, detail="Browser-Tool nicht konfiguriert.")
    from services.browser_service import browser_action
    result = await browser_action(str(customer.id), payload.action)
    return result
