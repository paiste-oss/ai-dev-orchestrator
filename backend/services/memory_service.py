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
    Ask Ollama which stored memories are relevant to the current question.
    Returns a list of memory content strings to inject as context.
    """
    result = await db.execute(
        select(MemoryItem)
        .where(MemoryItem.customer_id == customer_id, MemoryItem.is_active.is_(True))
        .order_by(MemoryItem.importance.desc())
        .limit(_MAX_MEMORIES)
    )
    memories = result.scalars().all()

    if not memories:
        return []

    # Build a numbered list so Ollama can refer to them by index
    mem_lines = "\n".join(f"{i}: {m.content}" for i, m in enumerate(memories))

    prompt = (
        "You are a context selector. "
        "Given the user's question and a list of stored memory facts, "
        f"pick up to {_MAX_CONTEXT} facts that are most relevant.\n\n"
        f"User question: {question}\n\n"
        f"Stored facts:\n{mem_lines}\n\n"
        "Reply with ONLY a JSON array of the relevant fact indices (integers). "
        f"Example: [0, 3, 7]. If nothing is relevant reply with: []"
    )

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_chat_model, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            raw = resp.json().get("response", "[]")
            start, end = raw.find("["), raw.rfind("]") + 1
            if start >= 0 and end > start:
                indices: list[int] = json.loads(raw[start:end])
                return [memories[i].content for i in indices if isinstance(i, int) and 0 <= i < len(memories)]
    except Exception as exc:
        logger.warning("memory select_relevant_context failed: %s", exc)

    # Fallback: return top memories by importance
    return [m.content for m in memories[:5]]


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
