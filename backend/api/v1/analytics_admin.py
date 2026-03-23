"""
Admin-Analytics — anonymisierte Chat-Auswertung (DSG-konform).
Kein Personenbezug: session_hash ist nicht rückführbar auf Kunden-ID.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/admin/analytics", tags=["analytics"])


@router.get("/overview")
async def get_overview(
    days: int = 30,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Kennzahlen: Nachrichten, Sitzungen, Tokens, Response-Typen."""
    result = await db.execute(text("""
        SELECT
            COUNT(*)                                        AS total_messages,
            COUNT(DISTINCT session_hash)                    AS unique_sessions,
            COALESCE(SUM(tokens_used), 0)                  AS total_tokens,
            ROUND(AVG(tokens_used)::numeric, 0)            AS avg_tokens,
            COUNT(*) FILTER (WHERE day >= NOW() - INTERVAL '1 day')   AS messages_today,
            COUNT(*) FILTER (WHERE day >= NOW() - INTERVAL '7 days')  AS messages_7d
        FROM chat_analytics
        WHERE day >= NOW() - (:days || ' days')::INTERVAL
    """), {"days": days})
    overview = dict(result.mappings().one())

    # Response-Typen Verteilung
    rt = await db.execute(text("""
        SELECT response_type, COUNT(*) AS cnt
        FROM chat_analytics
        WHERE day >= NOW() - (:days || ' days')::INTERVAL
        GROUP BY response_type
        ORDER BY cnt DESC
    """), {"days": days})
    response_types = [dict(r) for r in rt.mappings().all()]

    # Nachrichten pro Tag (letzten 30 Tage)
    daily = await db.execute(text("""
        SELECT day::text, COUNT(*) AS cnt
        FROM chat_analytics
        WHERE day >= NOW() - (:days || ' days')::INTERVAL
        GROUP BY day
        ORDER BY day
    """), {"days": days})
    daily_counts = [dict(r) for r in daily.mappings().all()]

    # Aktivste Stunden
    hours = await db.execute(text("""
        SELECT hour_of_day, COUNT(*) AS cnt
        FROM chat_analytics
        WHERE day >= NOW() - (:days || ' days')::INTERVAL
        GROUP BY hour_of_day
        ORDER BY hour_of_day
    """), {"days": days})
    hourly = [dict(r) for r in hours.mappings().all()]

    return {
        "overview": overview,
        "response_types": response_types,
        "daily_counts": daily_counts,
        "hourly": hourly,
        "period_days": days,
    }


@router.get("/messages")
async def get_messages(
    limit: int = 50,
    offset: int = 0,
    response_type: str | None = None,
    days: int = 30,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Paginierte Liste der anonymisierten Q&A-Paare."""
    filters = ["day >= NOW() - (:days || ' days')::INTERVAL"]
    params: dict = {"days": days, "limit": limit, "offset": offset}

    if response_type:
        filters.append("response_type = :rt")
        params["rt"] = response_type

    where = " AND ".join(filters)

    rows = await db.execute(text(f"""
        SELECT
            id::text,
            session_hash,
            user_message,
            assistant_message,
            response_type,
            tokens_used,
            language,
            day::text,
            hour_of_day,
            COALESCE(system_prompt_name, 'Standard') AS system_prompt_name,
            COALESCE(tools_used, '')                  AS tools_used,
            COALESCE(memory_facts, '')                AS memory_facts
        FROM chat_analytics
        WHERE {where}
        ORDER BY day DESC, hour_of_day DESC
        LIMIT :limit OFFSET :offset
    """), params)

    total = await db.execute(text(f"""
        SELECT COUNT(*) FROM chat_analytics WHERE {where}
    """), params)

    return {
        "items": [dict(r) for r in rows.mappings().all()],
        "total": total.scalar(),
        "limit": limit,
        "offset": offset,
    }
