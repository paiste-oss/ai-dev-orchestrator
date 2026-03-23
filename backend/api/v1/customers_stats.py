import uuid
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from core.database import get_db
from models.customer import Customer
from models.buddy import AiBuddy, ConversationThread, Message
from models.document import CustomerDocument
from models.chat import MemoryItem
from .customers_schemas import MODEL_CHF_PER_1K, MODEL_TYPE

router = APIRouter()


@router.get("/{customer_id}/stats")
async def get_customer_stats(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    buddy_result = await db.execute(
        select(AiBuddy.id).where(AiBuddy.customer_id == customer_id)
    )
    buddy_ids = [row[0] for row in buddy_result.all()]

    if not buddy_ids:
        return {"threads": 0, "messages": 0, "total_tokens": 0, "by_model": {}}

    thread_count = await db.scalar(
        select(func.count(ConversationThread.id))
        .where(ConversationThread.buddy_id.in_(buddy_ids))
    )

    rows = await db.execute(
        select(
            Message.model_used,
            func.count().label("n"),
            func.coalesce(func.sum(Message.tokens_used), 0).label("t"),
        )
        .join(ConversationThread, Message.thread_id == ConversationThread.id)
        .where(ConversationThread.buddy_id.in_(buddy_ids))
        .group_by(Message.model_used)
    )

    by_model: dict = {}
    total_tokens = 0
    total_messages = 0
    for model, n, t in rows.all():
        key = model or "unbekannt"
        by_model[key] = {"messages": n, "tokens": int(t)}
        total_tokens += int(t)
        total_messages += n

    return {
        "threads": thread_count or 0,
        "messages": total_messages,
        "total_tokens": total_tokens,
        "by_model": by_model,
    }


@router.get("/{customer_id}/usage")
async def get_customer_usage(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Vollständiger Ressourcenverbrauch eines Kunden."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")

    # ── Tokens & Nachrichten ──────────────────────────────────────────────────
    buddy_ids = [
        row[0] for row in (await db.execute(
            select(AiBuddy.id).where(AiBuddy.customer_id == customer_id)
        )).all()
    ]

    by_model: dict = {}
    total_tokens = 0
    total_messages = 0
    thread_count = 0
    total_cost_chf = 0.0

    if buddy_ids:
        thread_count = (await db.scalar(
            select(func.count(ConversationThread.id))
            .where(ConversationThread.buddy_id.in_(buddy_ids))
        )) or 0

        rows = await db.execute(
            select(
                Message.model_used,
                func.count().label("n"),
                func.coalesce(func.sum(Message.tokens_used), 0).label("t"),
            )
            .join(ConversationThread, Message.thread_id == ConversationThread.id)
            .where(ConversationThread.buddy_id.in_(buddy_ids))
            .group_by(Message.model_used)
        )
        for model, n, t in rows.all():
            key = model or "unbekannt"
            tokens = int(t)
            rate = MODEL_CHF_PER_1K.get(key, 0.009)
            cost = round(tokens / 1000 * rate, 4)
            by_model[key] = {
                "messages": n,
                "tokens": tokens,
                "cost_chf": cost,
                "type": MODEL_TYPE.get(key, "api"),
                "rate_per_1k": rate,
            }
            total_tokens += tokens
            total_messages += n
            total_cost_chf += cost

    # ── Speicher ──────────────────────────────────────────────────────────────
    doc_count = (await db.scalar(
        select(func.count(CustomerDocument.id))
        .where(CustomerDocument.customer_id == customer_id, CustomerDocument.is_active == True)
    )) or 0

    # ── Memory-Einträge ───────────────────────────────────────────────────────
    memory_count = 0
    try:
        memory_count = (await db.scalar(
            select(func.count(MemoryItem.id))
            .where(MemoryItem.customer_id == str(customer_id))
        )) or 0
    except Exception:
        pass

    return {
        "tokens": {
            "total": total_tokens,
            "this_period": customer.tokens_used_this_period or 0,
            "by_model": by_model,
            "cost_chf_total": round(total_cost_chf, 4),
        },
        "messages": {
            "total": total_messages,
            "threads": thread_count,
        },
        "storage": {
            "used_bytes": customer.storage_used_bytes or 0,
            "limit_bytes": (customer.storage_limit_bytes or 0) + (customer.storage_extra_bytes or 0),
            "plan_bytes": customer.storage_limit_bytes or 0,
            "extra_bytes": customer.storage_extra_bytes or 0,
            "documents": doc_count,
        },
        "memory": {
            "entries": memory_count,
        },
        "compute": {
            "note": "Lokale Modelle (Ollama): Schätzung ~0.02 CHF/1M Tokens (Strom+Hardware). API-Modelle: Marktpreis Anthropic/Google/OpenAI.",
            "local_tokens": sum(v["tokens"] for v in by_model.values() if v["type"] == "lokal"),
            "api_tokens": sum(v["tokens"] for v in by_model.values() if v["type"] == "api"),
        },
    }
