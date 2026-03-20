"""
Chat API — persistent memory chat mit Claude / Gemini / OpenAI.

Flow per request:
  1. Conversation history laden
  2. Baddi-Konfiguration + zugewiesene Agenten aus Redis lesen (falls buddy_id gesetzt)
  3. Relevante Memories auswählen (Ollama, lokal)
  4. System-Prompt aufbauen: Baddi-Prompt + Agent-Capabilities + Memory-Kontext
  5. LLM aufrufen: Claude → Gemini → OpenAI
  6. Beide Turns in DB speichern
  7. Memory-Extraktion im Hintergrund starten
"""
import json
import uuid as uuid_mod
from datetime import datetime

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user
from models.buddy import AiBuddy
from models.chat import ChatMessage, MemoryItem
from models.customer import Customer
from services.llm_gateway import chat_with_claude, chat_with_gemini, chat_with_openai
from services.memory_service import select_relevant_context, schedule_memory_extraction
from services.agent_router import route as agent_route, get_intent_label
from services.buddy_agent import run_buddy_chat

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_WINDOW = 20
_CONTEXT_WINDOW = 10

# Agent-Capabilities (spiegelt frontend/lib/agents.ts)
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


def _load_baddi_config(usecase_id: str) -> dict:
    """Lädt Baddi-Konfiguration (System-Prompt + Agenten) aus Redis."""
    try:
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        raw = r.get(f"baddi:config:{usecase_id}")
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


# ── Schemas ───────────────────────────────────────────────────────────────────

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

    # 2. Kunden-Baddi laden (1:1) + Konfiguration
    buddy: AiBuddy | None = None
    baddi_config: dict = {}
    if req.buddy_id:
        try:
            buddy = await db.get(AiBuddy, uuid_mod.UUID(req.buddy_id))
        except Exception:
            pass
    if buddy is None:
        r2 = await db.execute(
            select(AiBuddy)
            .where(AiBuddy.customer_id == customer.id, AiBuddy.is_active == True)
            .limit(1)
        )
        buddy = r2.scalar_one_or_none()
    if buddy:
        if buddy.usecase_id:
            baddi_config = _load_baddi_config(buddy.usecase_id)
        if not baddi_config and buddy.persona_config:
            baddi_config = buddy.persona_config

    # 3. Agent Router — welche Tools braucht diese Anfrage?
    routing = agent_route(req.message)

    # 4. Relevante Memories
    relevant = await select_relevant_context(customer_id, req.message, db)

    # 5. System-Prompt aufbauen
    base_prompt = (
        baddi_config.get("system_prompt")
        or baddi_config.get("system_prompt_template")
        or "Du bist ein hilfreicher, persönlicher KI-Begleiter."
    ).strip()
    system_parts = [base_prompt]

    agent_ids: list[str] = baddi_config.get("agents", [])
    caps = [_AGENT_CAPABILITIES[aid] for aid in agent_ids if aid in _AGENT_CAPABILITIES]
    if caps:
        caps_text = "\n".join(f"- {c}" for c in caps)
        system_parts.append(f"\nDeine Fähigkeiten (aktive Agenten):\n{caps_text}")

    if relevant:
        facts = "\n".join(f"- {m}" for m in relevant)
        system_parts.append(f"\nWas du über diesen User weißt:\n{facts}")

    system_prompt = "\n".join(system_parts)

    # 6. Uhrwerk (Tool Use) oder LLM-Gateway
    messages = [{"role": m.role, "content": m.content} for m in history[-_CONTEXT_WINDOW:]]
    messages.append({"role": "user", "content": req.message})

    provider = "claude"
    model_name = "claude-haiku-4-5-20251001"
    errors: list[str] = []
    response_text: str | None = None

    # 6a. Uhrwerk — wenn Agent Router Tools identifiziert hat
    if routing.needs_tools and routing.tool_keys:
        try:
            uhrwerk_result = await run_buddy_chat(
                message=req.message,
                buddy_name=buddy.name if buddy else "Baddi",
                system_prompt=system_prompt,
                tool_keys=routing.tool_keys,
            )
            response_text = uhrwerk_result["output"]
            model_name = uhrwerk_result.get("model_used", model_name)
        except Exception as e:
            errors.append(f"Uhrwerk: {e}")

    # 6b. LLM-Gateway (kein Tool Use oder Uhrwerk versagt)
    if response_text is None:
        try:
            response_text = await chat_with_claude(messages, system_prompt)
        except Exception as e:
            errors.append(f"Claude: {e}")

    if response_text is None and settings.gemini_api_key:
        try:
            provider = "gemini"
            model_name = "gemini-2.5-flash"
            response_text = await chat_with_gemini(messages, system_prompt)
        except Exception as e:
            errors.append(f"Gemini: {e}")

    if response_text is None and settings.openai_api_key:
        try:
            provider = "openai"
            model_name = "gpt-4o-mini"
            response_text = await chat_with_openai(messages, system_prompt)
        except Exception as e:
            errors.append(f"ChatGPT: {e}")

    if response_text is None:
        raise HTTPException(status_code=502, detail=" | ".join(errors))

    # 7. Beide Turns persistieren
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

    # 8. Memory-Extraktion im Hintergrund
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
