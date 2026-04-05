"""
Chat API — Router (thin).

Die Pipeline-Logik liegt in services/chat_pipeline.py.
"""
import logging

import httpx as _httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from services.agent_router import route as agent_route
from services.chat_pipeline import load_context, execute_llm, finalize
from .chat_schemas import (
    BrowserActionRequest, ChatRequest, ChatResponse,
    MessageOut, MemoryOut, TTSRequest,
)

def _get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("CF-Connecting-IP") or request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(key_func=_get_real_ip)

router = APIRouter(prefix="/chat", tags=["chat"])
_log = logging.getLogger(__name__)


@router.post("/message", response_model=ChatResponse)
@limiter.limit(settings.chat_rate_limit)
async def send_message(
    request: Request,
    req: ChatRequest,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Content Guard
    routing = agent_route(req.message, customer_id=str(customer.id))
    if routing.blocked:
        try:
            from models.content_guard_log import ContentGuardLog
            from services.agent_router import _CONTENT_GUARD_PATTERNS
            m = _CONTENT_GUARD_PATTERNS.search(req.message)
            db.add(ContentGuardLog(
                customer_id=str(customer.id),
                message=req.message,
                matched_pattern=m.group(0)[:200] if m else None,
            ))
            await db.commit()
        except Exception as e:
            _log.warning("Content Guard Log fehlgeschlagen: %s", e)
        raise HTTPException(status_code=400, detail="Anfrage abgelehnt.")

    # Quota-Check (Admin immer erlaubt)
    if customer.role != "admin":
        from services.billing_service import check_quota
        await check_quota(customer, db)

    # Pipeline
    context = await load_context(customer, req.message, db)
    llm_result = await execute_llm(
        customer=customer,
        message=req.message,
        images=req.images,
        document_ids=req.document_ids,
        prior_messages=context["prior_messages"],
        system_prompt=context["system_prompt"],
        db=db,
        doc_cache=context.get("doc_cache"),
    )

    if llm_result["response_text"] is None:
        raise HTTPException(status_code=502, detail=" | ".join(llm_result["errors"]))

    message_id, response_text, response_type, structured_data, ui_update, emotion = await finalize(
        customer=customer,
        original_message=req.message,
        llm_result=llm_result,
        system_prompt_name=context["system_prompt_name"],
        db=db,
    )

    return ChatResponse(
        message_id=message_id,
        response=response_text,
        provider=llm_result["provider"],
        model=llm_result["model_name"],
        image_urls=llm_result["generated_image_urls"] or None,
        response_type=response_type,
        structured_data=structured_data,
        ui_update=ui_update,
        emotion=emotion,
    )


@router.get("/history", response_model=list[MessageOut])
async def get_history(
    limit: int = 50,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.customer_id == str(customer.id))
        .order_by(ChatMessage.created_at.desc()).limit(limit)
    )
    msgs = list(reversed(result.scalars().all()))
    return [
        MessageOut(id=str(m.id), role=m.role, content=m.content,
                   provider=m.provider, model=m.model, created_at=m.created_at.isoformat())
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
        .order_by(MemoryItem.created_at.desc()).limit(100)
    )
    return [
        MemoryOut(id=str(m.id), content=m.content, importance=m.importance,
                  category=m.category, created_at=m.created_at.isoformat())
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
    except ValueError:
        raise HTTPException(status_code=503, detail="TTS-Dienst nicht verfügbar")
    except Exception:
        raise HTTPException(status_code=502, detail="TTS-Dienst nicht verfügbar")


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    customer: Customer = Depends(get_current_user),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Whisper nicht verfügbar.")
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
    return {"text": resp.json().get("text", "")}


@router.post("/upload-attachment")
async def upload_attachment(
    file: UploadFile = File(...),
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import anyio as _anyio
    import uuid as _uuid
    from models.document import CustomerDocument
    from services.file_parser import parse_file, is_supported, get_file_extension

    MAX_SIZE = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail=f"Datei zu gross. Maximum: {MAX_SIZE // 1024 // 1024} MB")

    filename = file.filename or "dokument"
    mime_type = file.content_type or ""
    if not is_supported(filename, mime_type):
        raise HTTPException(status_code=415, detail=f"Dateityp '{get_file_extension(filename)}' nicht unterstützt.")

    total_limit = (customer.storage_limit_bytes or 0) + (customer.storage_extra_bytes or 0)

    # Schneller Pre-Check anhand des gecachten ORM-Werts (nicht autoritativ, aber spart I/O)
    if customer.storage_used_bytes + len(content) > total_limit:
        free_mb = max(0, total_limit - customer.storage_used_bytes) / 1024 / 1024
        raise HTTPException(status_code=507, detail=f"Speicherlimit erreicht. Noch verfügbar: {free_mb:.1f} MB")

    from sqlalchemy import text as _sa_text
    parse_result = await _anyio.to_thread.run_sync(lambda: parse_file(content, filename, mime_type))
    unique_filename = f"{customer.id}_{_uuid.uuid4().hex[:8]}_{filename}"

    # Atomarer Check-and-Increment: verhindert Race Condition bei parallelen Uploads.
    # Schlägt lautlos fehl (keine RETURNING-Zeile) wenn ein konkurrenter Upload
    # das Limit zwischenzeitlich erschöpft hat.
    update_result = await db.execute(
        _sa_text("""
            UPDATE customers
            SET storage_used_bytes = storage_used_bytes + :size
            WHERE id = :id AND storage_used_bytes + :size <= :limit
            RETURNING storage_used_bytes
        """),
        {"size": len(content), "id": str(customer.id), "limit": int(total_limit)},
    )
    if update_result.fetchone() is None:
        raise HTTPException(status_code=507, detail="Speicherlimit erreicht.")

    doc = CustomerDocument(
        customer_id=customer.id, filename=unique_filename, original_filename=filename,
        file_type=get_file_extension(filename) or "unknown", file_size_bytes=len(content),
        mime_type=mime_type, file_content=content, extracted_text=parse_result.text,
        page_count=parse_result.page_count, char_count=len(parse_result.text),
        stored_in_postgres=True, stored_in_qdrant=False, doc_metadata=parse_result.metadata,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {"document_id": str(doc.id), "filename": filename, "file_type": doc.file_type,
            "page_count": doc.page_count, "char_count": doc.char_count}


@router.post("/browser")
async def browser_action_endpoint(
    payload: BrowserActionRequest,
    customer: Customer = Depends(get_current_user),
):
    if not settings.browserless_token:
        raise HTTPException(status_code=503, detail="Browser-Tool nicht konfiguriert.")
    from services.browser_service import browser_action
    return await browser_action(str(customer.id), payload.action, lang=payload.lang)
