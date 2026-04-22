"""Verarbeitet eingehende n8n-Events mit dem Buddy-Agenten.

Flow:
  1. Event von n8n empfangen
  2. Deduplizieren via source_id
  3. Buddy laden (Persona, Name, Kundendaten)
  4. Ollama entscheidet: relevant oder nicht?
  5. BuddyEvent in DB persistieren
  6. Bei Relevanz: SSE-Notification via Redis publishen
"""
import asyncio
import json
import uuid
from datetime import datetime,timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import httpx as _httpx
from models.buddy import AiBuddy
from models.buddy_event import BuddyEvent
from models.customer import Customer
from services.sse_publisher import publish_event


RELEVANCE_PROMPT = """\
Du bist {buddy_name}, der KI-Begleiter von {customer_name}.
Deine Persönlichkeit: {persona}

Ein externes Ereignis ist gerade eingetroffen. Entscheide, ob es für {customer_name} relevant ist.

Quelle: {source}
Zusammenfassung: {summary}
Priorität: {priority}

Antworte NUR mit gültigem JSON (kein Text davor oder danach):
{{
  "relevant": true oder false,
  "score": 0.0 bis 1.0,
  "action": "notify" oder "remind" oder "alert" oder null,
  "message": "Was du {customer_name} über dieses Ereignis sagen würdest (max 2 Sätze)",
  "reasoning": "Ein Satz warum relevant oder nicht"
}}"""


async def process_event(payload: dict, db: AsyncSession) -> dict:
    """
    Verarbeitet ein eingehendes Event von n8n.
    Gibt zurück: {"event_id": str, "decision": str, "pushed": bool}
    """
    source = payload["source"]
    source_id = payload["source_id"]
    summary = payload["summary"]
    priority = payload.get("priority", "medium")
    buddy_id = payload.get("buddy_id")
    customer_id = payload.get("customer_id")
    timestamp = payload.get("timestamp", datetime.now(timezone.utc).replace(tzinfo=None).isoformat())

    # 1. Deduplizierung
    existing = await db.execute(
        select(BuddyEvent).where(
            BuddyEvent.source == source,
            BuddyEvent.source_id == source_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"event_id": None, "decision": "duplicate", "pushed": False}

    # 2. Buddy laden (falls angegeben)
    buddy = None
    customer = None

    if buddy_id:
        result = await db.execute(select(AiBuddy).where(AiBuddy.id == uuid.UUID(str(buddy_id))))
        buddy = result.scalar_one_or_none()

    if buddy and not customer_id:
        customer_id = str(buddy.customer_id)

    if customer_id:
        result = await db.execute(select(Customer).where(Customer.id == uuid.UUID(str(customer_id))))
        customer = result.scalar_one_or_none()

    # 3. Relevanzentscheidung via Ollama (blocking → thread pool)
    buddy_name = buddy.name if buddy else "AI Buddy"
    customer_name = customer.name if customer else "Nutzer"
    persona = ""
    if buddy and buddy.persona_config:
        persona = buddy.persona_config.get("system_prompt_template", "").replace("{name}", buddy_name)

    prompt = RELEVANCE_PROMPT.format(
        buddy_name=buddy_name,
        customer_name=customer_name,
        persona=persona or f"Du bist {buddy_name}, ein hilfreicher KI-Assistent.",
        source=source,
        summary=summary,
        priority=priority,
    )

    decision = "ignored"
    action = None
    llm_message = None
    reasoning = None
    score = 0.0

    try:
        from core.config import settings as _cfg
        model = (buddy.persona_config.get("preferred_model") if buddy and buddy.persona_config else None) or _cfg.ollama_chat_model

        def _call_ollama() -> str:
            r = _httpx.post(
                f"{_cfg.ollama_base_url}/api/chat",
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False},
                timeout=60.0,
            )
            r.raise_for_status()
            return r.json().get("message", {}).get("content", "")

        raw = await asyncio.get_event_loop().run_in_executor(None, _call_ollama)
        # JSON aus Antwort extrahieren
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(raw[start:end])
            score = float(parsed.get("score", 0.0))
            action = parsed.get("action")
            llm_message = parsed.get("message")
            reasoning = parsed.get("reasoning")
            decision = "relevant" if parsed.get("relevant") else "ignored"
    except Exception as e:
        reasoning = f"Fehler bei LLM-Auswertung: {e}"

    # 4. BuddyEvent persistieren
    event = BuddyEvent(
        source=source,
        source_id=source_id,
        summary=summary,
        priority=priority,
        raw_payload=payload,
        buddy_id=uuid.UUID(str(buddy_id)) if buddy_id else None,
        customer_id=uuid.UUID(str(customer_id)) if customer_id else None,
        relevance_score=score,
        decision=decision,
        action_taken=action,
        llm_message=llm_message,
        llm_reasoning=reasoning,
        pushed_to_sse=False,
        processed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # 5. Bei Relevanz: SSE publishen
    pushed = False
    if decision == "relevant" and customer_id:
        notification = {
            "event_id": str(event.id),
            "source": source,
            "priority": priority,
            "title": _source_title(source),
            "message": llm_message or summary,
            "action": action,
            "buddy_name": buddy_name,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }
        await publish_event(str(customer_id), notification, db=db)
        event.pushed_to_sse = True
        await db.commit()
        pushed = True

    return {"event_id": str(event.id), "decision": decision, "pushed": pushed}


def _source_title(source: str) -> str:
    titles = {
        "email": "Neue E-Mail",
        "calendar": "Kalender-Erinnerung",
        "news": "Aktuelle Nachrichten",
        "weather": "Wettermeldung",
        "government": "Behördenmitteilung",
    }
    return titles.get(source, "Neue Meldung")
