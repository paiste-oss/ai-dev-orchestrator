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
from datetime import datetime

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import httpx as _httpx
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from services.llm_gateway import chat_with_claude, chat_with_gemini, chat_with_openai
from services.memory_service import select_relevant_context
from services.agent_router import route as agent_route
from services.buddy_agent import run_buddy_chat
from services.billing_service import check_and_bill_tokens

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_WINDOW = 20
_CONTEXT_WINDOW = 10

_AGENT_CAPABILITIES: dict[str, str] = {
    "ki-chat":        "Intelligente Konversation, Texterstellung und Beratung",
    "document":       "Analyse und Zusammenfassung von PDFs, Word- und Textdokumenten",
    "speech":         "Voice-to-Text, Transkription und Sprachsteuerung",
    "automation":     "n8n-Workflows planen, optimieren und auslösen",
    "translation":    "Mehrsprachige Übersetzung mit kulturellem Kontext",
    "knowledge-base": "Suche und Beantwortung aus eigener Wissensdatenbank (RAG)",
    "research":       "Web-Recherche und Faktenprüfung in Echtzeit",
    "code":           "Code schreiben, reviewen und ausführen",
    "planning":       "Komplexe Ziele planen, priorisieren und koordinieren",
    "communication":  "E-Mails verfassen, Termine planen und CRM-Einträge verwalten",
    "data-analysis":  "Statistische Analysen, Visualisierungen und Handlungsempfehlungen",
    "devops":         "Deployments überwachen, Tests ausführen und Incidents beheben",
    "support":        "Kundenanfragen beantworten und bei Bedarf eskalieren",
}

import logging as _logging
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


class ChatResponse(BaseModel):
    message_id: str
    response: str
    provider: str
    model: str
    image_urls: list[str] | None = None


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
        raise HTTPException(status_code=400, detail="Anfrage abgelehnt.")

    # 4. Relevante Memories
    relevant = await select_relevant_context(customer_id, req.message, db)

    # 5. System-Prompt aufbauen
    first_name = customer.name.split()[0] if customer.name else "du"

    base_prompt = (
        baddi_config.get("system_prompt")
        or baddi_config.get("system_prompt_template")
        or f"Du bist Baddi — der persönliche Begleiter von {first_name}."
    ).strip()
    system_parts = [base_prompt]

    system_parts.append(
        f"\nIDENTITÄT (unveränderlich):\n"
        f"- Du bist Baddi. Nenne dich ausschliesslich 'Baddi'.\n"
        f"- Du sprichst {first_name} natürlich an.\n"
        f"- Du bist warm, direkt, ehrlich und empathisch."
    )

    agent_ids: list[str] = baddi_config.get("agents", [])
    caps = [_AGENT_CAPABILITIES[aid] for aid in agent_ids if aid in _AGENT_CAPABILITIES]
    if caps:
        system_parts.append(f"\nDeine Fähigkeiten:\n" + "\n".join(f"- {c}" for c in caps))

    from services.tool_registry import TOOL_CATALOG
    active_tools = [v["prompt_hint"] for v in TOOL_CATALOG.values() if v.get("prompt_hint")]
    if active_tools:
        system_parts.append(
            f"\nDEINE AKTIVEN TOOLS (diese Fähigkeiten hast du wirklich):\n"
            + "\n".join(f"- {t}" for t in active_tools)
            + "\nWenn ein Tool technisch fehlschlägt, erkläre den Fehler ehrlich. "
            "Sage NIEMALS 'Ich habe diese Fähigkeit nicht'."
        )

    if relevant:
        system_parts.append(f"\nWas du über {first_name} weißt:\n" + "\n".join(f"- {m}" for m in relevant))

    system_prompt = "\n".join(system_parts)

    # 6. Request ausführen
    provider = "claude"
    model_name = "claude-haiku-4-5-20251001"
    response_text: str | None = None
    tokens_used: int = 0
    generated_image_urls: list[str] = []
    errors: list[str] = []

    if req.images:
        # Vision: Sonnet, keine Tools
        model_name = "claude-sonnet-4-6"
        user_content: list[dict] = []
        for img in req.images:
            user_content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": img.media_type, "data": img.data},
            })
        if req.message.strip():
            user_content.append({"type": "text", "text": req.message})
        messages = prior_messages + [{"role": "user", "content": user_content}]

        try:
            result = await chat_with_claude(messages, system_prompt, model=model_name)
            response_text = result.text
            tokens_used = result.total_tokens
        except Exception as e:
            errors.append(f"Claude Vision: {e}")

    else:
        # Text: Haiku + ALLE Tools — Claude entscheidet selbst
        messages = prior_messages + [{"role": "user", "content": req.message}]
        all_tool_keys = list(TOOL_CATALOG.keys())

        try:
            uhrwerk_result = await run_buddy_chat(
                message=req.message,
                buddy_name="Baddi",
                system_prompt=system_prompt,
                tool_keys=all_tool_keys,
                model=model_name,
                history=prior_messages,
            )
            response_text = uhrwerk_result["output"]
            model_name = uhrwerk_result.get("model_used", model_name)

            # Bild-URLs extrahieren (DALL-E + Unsplash)
            for tc in uhrwerk_result.get("tool_calls", []):
                result = tc.get("result")
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

    # 9. Token-Quota abrechnen
    if tokens_used > 0:
        try:
            await check_and_bill_tokens(customer, tokens_used, db)
        except Exception as e:
            _log.warning("Token-Billing fehlgeschlagen: %s", e)

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


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None


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
