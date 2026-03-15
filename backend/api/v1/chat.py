"""
Chat API — persistent memory chat with Gemini or OpenAI.

Flow per request:
  1. Load last 20 messages from DB (conversation history)
  2. Ask Ollama which stored memories are relevant (local, private)
  3. Build system prompt with selected context
  4. Send to Gemini or OpenAI
  5. Save both turns to DB
  6. Fire-and-forget: Ollama extracts new memory facts in background
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from services.llm_gateway import chat_with_gemini, chat_with_openai
from services.memory_service import select_relevant_context, schedule_memory_extraction

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_WINDOW = 20   # messages loaded from DB
_CONTEXT_WINDOW = 10   # messages sent to external LLM


# ── Schemas ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    buddy_id: str | None = None


class ChatResponse(BaseModel):
    message_id: str
    response: str
    provider: str
    model: str


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

    # 2. Relevant memory context (selected by local Ollama)
    relevant = await select_relevant_context(customer_id, req.message, db)

    # 3. System prompt
    system_parts = ["Du bist ein hilfreicher, persönlicher AI-Assistent."]
    if relevant:
        facts = "\n".join(f"- {m}" for m in relevant)
        system_parts.append(f"\nWas du über diesen User weißt:\n{facts}")
    system_prompt = "\n".join(system_parts)

    # 4. Build message list for external LLM (last N turns + new message)
    messages = [{"role": m.role, "content": m.content} for m in history[-_CONTEXT_WINDOW:]]
    messages.append({"role": "user", "content": req.message})

    # 5. Gemini primary → ChatGPT fallback
    provider = "gemini"
    model_name = "gemini-2.0-flash"
    try:
        response_text = await chat_with_gemini(messages, system_prompt)
    except Exception as gemini_exc:
        provider = "openai"
        model_name = "gpt-4o-mini"
        try:
            response_text = await chat_with_openai(messages, system_prompt)
        except Exception as openai_exc:
            raise HTTPException(
                status_code=502,
                detail=f"Gemini: {gemini_exc} | ChatGPT: {openai_exc}",
            )

    # 6. Persist both turns
    user_msg = ChatMessage(
        customer_id=customer_id,
        buddy_id=req.buddy_id,
        role="user",
        content=req.message,
        provider=provider,
        model=model_name,
    )
    assistant_msg = ChatMessage(
        customer_id=customer_id,
        buddy_id=req.buddy_id,
        role="assistant",
        content=response_text,
        provider=provider,
        model=model_name,
    )
    db.add(user_msg)
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    # 7. Extract memories in background (does not block the response)
    schedule_memory_extraction(customer_id, req.message, response_text)

    return ChatResponse(
        message_id=str(assistant_msg.id),
        response=response_text,
        provider=provider,
        model=model_name,
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
            id=str(m.id),
            role=m.role,
            content=m.content,
            provider=m.provider,
            model=m.model,
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
            id=str(m.id),
            content=m.content,
            importance=m.importance,
            created_at=m.created_at.isoformat(),
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
