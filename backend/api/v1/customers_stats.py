import uuid
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from core.database import get_db
from models.customer import Customer
from models.document import CustomerDocument
from models.chat import ChatMessage, MemoryItem
from .customers_schemas import MODEL_CHF_PER_1K, MODEL_TYPE

router = APIRouter()


@router.get("/{customer_id}/stats")
async def get_customer_stats(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(
            ChatMessage.model,
            func.count().label("n"),
            func.coalesce(func.sum(ChatMessage.tokens_used), 0).label("t"),
        )
        .where(ChatMessage.customer_id == str(customer_id))
        .group_by(ChatMessage.model)
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
    rows = await db.execute(
        select(
            ChatMessage.model,
            func.count().label("n"),
            func.coalesce(func.sum(ChatMessage.tokens_used), 0).label("t"),
        )
        .where(ChatMessage.customer_id == str(customer_id))
        .group_by(ChatMessage.model)
    )

    by_model: dict = {}
    total_tokens = 0
    total_messages = 0
    total_cost_chf = 0.0

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
