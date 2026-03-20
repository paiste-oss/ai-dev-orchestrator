"""
Chat API — vollständige Routing-Pipeline.

Flow pro Request:
  1.  Conversation history laden
  2.  Baddi laden + Konfiguration aus Redis
  3.  Relevante Memories auswählen
  4.  System-Prompt aufbauen
  5.  ROUTER (zwingend lokal, <1ms) — klassifiziert Intent
  6.  Router-Gedächtnis prüfen — gelernte Routen bevorzugen
  7.  Uhrwerk aufrufen (Tool / Agent / Workflow) wenn Tools verfügbar
  8.  ROUTER bewertet Antwort:
        → Positiv: Antwort an Baddi/Kunden weiterleiten
        → Negativ: Capability Gap erkannt → an Entwicklung weiterreichen
  9.  Router lernt: Erfolg/Misserfolg in Redis speichern
  10. Beide Turns persistieren
  11. Memory-Extraktion im Hintergrund
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
from services.agent_router import route as agent_route, assess_response, get_intent_label
from services.buddy_agent import run_buddy_chat
from services.router_memory import record_success, record_failure, should_create_gap

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


import logging as _logging
_log = _logging.getLogger(__name__)

_redis_client: "redis_lib.Redis | None" = None

def _get_redis() -> "redis_lib.Redis":
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_lib.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _load_baddi_config(usecase_id: str) -> dict:
    """Lädt Baddi-Konfiguration (System-Prompt + Agenten) aus Redis."""
    try:
        raw = _get_redis().get(f"baddi:config:{usecase_id}")
        return json.loads(raw) if raw else {}
    except Exception as e:
        _log.warning("Baddi-Config konnte nicht geladen werden (%s): %s", usecase_id, e)
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

    # ── 3. ROUTER (zwingend lokal) ────────────────────────────────────────────
    # Jede Nachricht geht zuerst durch den Router.
    # Der Router prüft: Content Guard → Keyword-Intent → gelernter Endpunkt → dynamische Tools
    routing = agent_route(req.message, customer_id=customer_id)

    # Stage 0: Content Guard — sofort ablehnen ohne LLM-Aufruf
    if routing.blocked:
        raise HTTPException(status_code=400, detail="Anfrage abgelehnt.")

    # ── 4. Relevante Memories ─────────────────────────────────────────────────
    relevant = await select_relevant_context(customer_id, req.message, db)

    # ── 5. System-Prompt aufbauen ─────────────────────────────────────────────
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

    # ── 6. Bekannter Gap (kein Tool vorhanden, Router weiss es) ──────────────
    # Nur wenn: gap=True UND keine gelernten/dynamischen Tools den Gap schliessen
    if routing.capability_gap and not routing.needs_tools:
        return await _handle_gap(
            message=req.message,
            intent=routing.intent,
            customer_id=customer_id,
            buddy_id=req.buddy_id or (str(buddy.id) if buddy else None),
            db=db,
        )

    # ── 7. Uhrwerk aufrufen ───────────────────────────────────────────────────
    messages = [{"role": m.role, "content": m.content} for m in history[-_CONTEXT_WINDOW:]]
    messages.append({"role": "user", "content": req.message})

    provider = "claude"
    model_name = "claude-haiku-4-5-20251001"
    errors: list[str] = []
    response_text: str | None = None
    used_tool_key: str | None = None
    tokens_used: int = 0

    if routing.needs_tools and routing.tool_keys:
        for tool_key in routing.tool_keys:
            try:
                uhrwerk_result = await run_buddy_chat(
                    message=req.message,
                    buddy_name=buddy.name if buddy else "Baddi",
                    system_prompt=system_prompt,
                    tool_keys=[tool_key],
                )
                candidate = uhrwerk_result["output"]
                model_name = uhrwerk_result.get("model_used", model_name)

                # Router bewertet die Uhrwerk-Antwort
                if assess_response(candidate):
                    response_text = candidate
                    used_tool_key = tool_key
                    record_success(routing.intent, tool_key)
                    break
                else:
                    record_failure(routing.intent, tool_key)
                    errors.append(f"Uhrwerk/{tool_key}: Capability-Gap in Antwort erkannt")
            except Exception as e:
                record_failure(routing.intent, tool_key)
                errors.append(f"Uhrwerk/{tool_key}: {e}")

    # ── 8. LLM-Fallback (kein Tool oder alle Tools gescheitert) ──────────────
    if response_text is None:
        try:
            result = await chat_with_claude(messages, system_prompt)
            if assess_response(result.text):
                response_text = result.text
                tokens_used = result.total_tokens
                record_success(routing.intent, "llm_claude")
            else:
                record_failure(routing.intent, "llm_claude")
                errors.append("Claude: Gap erkannt in LLM-Antwort")
                # Rohantwort trotzdem behalten für Gap-Analyse
                response_text = result.text
                tokens_used = result.total_tokens
        except Exception as e:
            errors.append(f"Claude: {e}")

    if response_text is None and settings.gemini_api_key:
        try:
            provider = "gemini"
            model_name = "gemini-2.5-flash"
            result = await chat_with_gemini(messages, system_prompt)
            if assess_response(result.text):
                response_text = result.text
                tokens_used = result.total_tokens
                record_success(routing.intent, "llm_gemini")
            else:
                record_failure(routing.intent, "llm_gemini")
                response_text = result.text
                tokens_used = result.total_tokens
        except Exception as e:
            errors.append(f"Gemini: {e}")

    if response_text is None and settings.openai_api_key:
        try:
            provider = "openai"
            model_name = "gpt-4o-mini"
            result = await chat_with_openai(messages, system_prompt)
            if assess_response(result.text):
                response_text = result.text
                tokens_used = result.total_tokens
                record_success(routing.intent, "llm_openai")
            else:
                record_failure(routing.intent, "llm_openai")
                response_text = result.text
                tokens_used = result.total_tokens
        except Exception as e:
            errors.append(f"ChatGPT: {e}")

    if response_text is None:
        raise HTTPException(status_code=502, detail=" | ".join(errors))

    # ── 9. Router-Nachbewertung: War die finale Antwort ein Gap? ─────────────
    # Selbst wenn LLM geantwortet hat — erkennt der Router ob es wirklich
    # eine Fähigkeit fehlt (z.B. "Leider habe ich keinen Internetzugang").
    if not assess_response(response_text):
        gap_response = await _handle_gap(
            message=req.message,
            intent=routing.intent,
            customer_id=customer_id,
            buddy_id=req.buddy_id or (str(buddy.id) if buddy else None),
            db=db,
        )
        # Memory trotzdem extrahieren
        schedule_memory_extraction(customer_id, req.message, gap_response.response)
        return gap_response

    # ── 10. Beide Turns persistieren ─────────────────────────────────────────
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
        tokens_used=tokens_used,
    )
    db.add(user_msg)
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    # ── 11. Memory-Extraktion im Hintergrund ──────────────────────────────────
    schedule_memory_extraction(customer_id, req.message, response_text)

    return ChatResponse(
        message_id=str(assistant_msg.id),
        response=response_text,
        provider=provider,
        model=model_name,
    )


async def _handle_gap(
    message: str,
    intent: str,
    customer_id: str,
    buddy_id: str | None,
    db: AsyncSession,
) -> "ChatResponse":
    """
    Erstellt einen Capability Request und gibt eine freundliche Antwort zurück.
    Nutzt Gap-Deduplication um Spam zu verhindern.
    """
    from models.capability_request import CapabilityRequest
    from services.entwicklung_engine import schedule_capability_analysis

    gap_response = (
        f"Das ist eine interessante Anfrage! 🚀\n\n"
        f"Diese Fähigkeit ist noch nicht in meinem Uhrwerk verfügbar, aber ich habe "
        f"das Entwicklungsteam bereits informiert. Sie arbeiten daran — "
        f"ich melde mich sobald ich dir dabei helfen kann."
    )

    # Gap-Deduplication: nicht für jeden Kunden einen neuen Request erstellen
    if should_create_gap(intent, message):
        cap_req = CapabilityRequest(
            customer_id=customer_id,
            buddy_id=buddy_id,
            original_message=message,
            detected_intent=intent,
            status="pending",
            dialog=[{
                "role": "uhrwerk",
                "content": (
                    f"Neue Anfrage erkannt: \"{message[:120]}{'...' if len(message) > 120 else ''}\"\n"
                    f"Intent: {intent}\n"
                    f"Gap erkannt durch Router-Nachbewertung — Analyse gestartet..."
                ),
                "created_at": datetime.utcnow().isoformat(),
            }],
        )
        db.add(cap_req)
        await db.commit()
        await db.refresh(cap_req)
        schedule_capability_analysis(str(cap_req.id))

    user_msg = ChatMessage(
        customer_id=customer_id, buddy_id=buddy_id,
        role="user", content=message, provider="system", model="gap-detection",
    )
    assistant_msg = ChatMessage(
        customer_id=customer_id, buddy_id=buddy_id,
        role="assistant", content=gap_response, provider="system", model="gap-detection",
    )
    db.add(user_msg)
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    return ChatResponse(
        message_id=str(assistant_msg.id),
        response=gap_response,
        provider="system",
        model="entwicklung",
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
