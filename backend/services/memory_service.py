"""
Memory service — uses local Ollama to:
1. Select relevant stored memories before sending to an external LLM.
2. Extract new memory facts after each conversation turn (background task).
"""
import json
import logging
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.chat import MemoryItem
from core.config import settings
from core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

# Max memories to load from DB (ranked by importance desc)
_MAX_MEMORIES = 60
# Max memories to inject as context
_MAX_CONTEXT = 10


async def select_relevant_context(
    customer_id: str,
    question: str,
    db: AsyncSession,
) -> list[str]:
    """
    Gibt relevante Erinnerungen zurück:
    1. Primär: Vektor-Suche in Qdrant (customer_memories)
    2. Fallback: Top-5 MemoryItems aus PostgreSQL nach Wichtigkeit
    """
    # 1. Qdrant Vektor-Suche (schnell, semantisch)
    try:
        from services.memory_vector_store import search_memories
        qdrant_hits = search_memories(customer_id, question, top_k=_MAX_CONTEXT)
        if qdrant_hits:
            return qdrant_hits
    except Exception as exc:
        logger.warning("Qdrant memory search failed, falling back to DB: %s", exc)

    # 2. Fallback: PostgreSQL MemoryItems
    result = await db.execute(
        select(MemoryItem)
        .where(MemoryItem.customer_id == customer_id, MemoryItem.is_active.is_(True))
        .order_by(MemoryItem.importance.desc())
        .limit(5)
    )
    memories = result.scalars().all()
    return [m.content for m in memories]


async def select_style_context(customer_id: str, db: AsyncSession) -> list[str]:
    """
    Gibt gespeicherte Kommunikationsstil-Präferenzen zurück (category='style').
    1. Primär: Qdrant (alle Style-Einträge)
    2. Fallback: PostgreSQL MemoryItems mit category='style'
    """
    try:
        from services.memory_vector_store import get_style_memories
        styles = get_style_memories(customer_id)
        if styles:
            return styles
    except Exception as exc:
        logger.warning("Qdrant style lookup failed: %s", exc)

    # Fallback: PostgreSQL
    result = await db.execute(
        select(MemoryItem)
        .where(
            MemoryItem.customer_id == customer_id,
            MemoryItem.is_active.is_(True),
            MemoryItem.category == "style",
        )
        .order_by(MemoryItem.importance.desc())
        .limit(5)
    )
    return [m.content for m in result.scalars().all()]


async def _extract_and_save(customer_id: str, user_message: str, ai_response: str) -> None:
    """
    Background: ask Ollama to extract important facts from a conversation turn
    and persist them as MemoryItems with their own DB session.
    """
    prompt = (
        "Analyze the following conversation and extract important facts, preferences, "
        "or information about the user that are worth remembering for future conversations.\n\n"
        f"User: {user_message}\n"
        f"Assistant: {ai_response}\n\n"
        "Reply with ONLY a JSON array of short fact strings (max 5). "
        'Example: ["User prefers short answers", "User works as a developer"]. '
        "If nothing is worth remembering, reply with: []"
    )

    facts: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_chat_model, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            raw = resp.json().get("response", "[]")
            start, end = raw.find("["), raw.rfind("]") + 1
            if start >= 0 and end > start:
                facts = json.loads(raw[start:end])
    except Exception as exc:
        logger.warning("memory extraction failed: %s", exc)
        return

    if not facts:
        return

    async with AsyncSessionLocal() as db:
        for fact in facts[:5]:
            if isinstance(fact, str) and fact.strip():
                db.add(MemoryItem(customer_id=customer_id, content=fact.strip(), importance=0.7))
        await db.commit()


def schedule_memory_extraction(customer_id: str, user_message: str, ai_response: str) -> None:
    """Fire-and-forget: schedule memory extraction without blocking the response."""
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_extract_and_save(customer_id, user_message, ai_response))
    except RuntimeError:
        pass  # no running loop — skip gracefully
