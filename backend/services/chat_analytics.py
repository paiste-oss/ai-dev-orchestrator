"""
Analytics-Tracking für den Chat (DSG-konform, anonymisiert).

Speichert aggregierte Nutzungsdaten ohne persönliche Identifikation.
Die session_hash ist ein einseitiger Hash der customer_id — nicht rückführbar.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime,timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from models.customer import Customer

_log = logging.getLogger(__name__)


async def record_analytics(
    db: AsyncSession,
    customer: Customer,
    user_message: str,
    assistant_message: str,
    response_type: str,
    tokens_used: int,
    system_prompt_name: str,
    tools_used: list[str],
) -> None:
    """
    Speichert anonymisierte Chat-Analytics in der Datenbank.

    Args:
        db:                 Datenbankverbindung.
        customer:           Kunden-Objekt (nur für language + anonymen Hash).
        user_message:       Nachricht des Nutzers.
        assistant_message:  Antwort des Assistenten.
        response_type:      Typ der Antwort (z.B. "text", "action_buttons").
        tokens_used:        Verbrauchte Tokens.
        system_prompt_name: Name des aktiven System-Prompts.
        tools_used:         Liste der aufgerufenen Tools.
    """
    try:
        customer_id = str(customer.id)
        session_hash = hashlib.sha256(customer_id.encode()).hexdigest()[:12]
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        tools_str = ", ".join(tools_used)[:500] if tools_used else ""

        await db.execute(
            text(
                "INSERT INTO chat_analytics "
                "(session_hash, user_message, assistant_message, response_type, tokens_used, "
                "language, day, hour_of_day, system_prompt_name, tools_used) "
                "VALUES (:sh, :um, :am, :rt, :tu, :lang, :day, :hour, :sp, :tools)"
            ),
            {
                "sh": session_hash,
                "um": user_message,
                "am": assistant_message,
                "rt": response_type,
                "tu": tokens_used,
                "lang": customer.language or "de",
                "day": now.date(),
                "hour": now.hour,
                "sp": system_prompt_name[:100],
                "tools": tools_str,
            },
        )
        await db.commit()
    except Exception as e:
        _log.warning("Analytics konnte nicht gespeichert werden: %s", e)
