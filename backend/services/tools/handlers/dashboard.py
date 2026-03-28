"""Handler für Dashboard-Tools: populate_dashboard."""
from __future__ import annotations
import json
from typing import Any


async def _handle_dashboard(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if tool_name == "populate_dashboard":
        raw_symbols: list = tool_input.get("symbols", [])
        period: str = tool_input.get("period", "1y")

        # Symbole normalisieren und deduplizieren
        symbols = list(dict.fromkeys(s.strip().upper() for s in raw_symbols if isinstance(s, str) and s.strip()))
        if not symbols:
            return {"error": "Keine gültigen Symbole angegeben."}

        # In User-Preferences speichern
        if customer_id:
            try:
                from core.database import AsyncSessionLocal
                from sqlalchemy import text as sql_text
                import uuid as uuid_mod

                async with AsyncSessionLocal() as db:
                    # Aktuelle Preferences laden
                    row = await db.execute(
                        sql_text("SELECT ui_preferences FROM customers WHERE id = :id"),
                        {"id": customer_id},
                    )
                    current: dict = dict(row.scalar_one_or_none() or {})
                    current["chartSymbols"] = symbols
                    current["chartPeriod"] = period
                    await db.execute(
                        sql_text("UPDATE customers SET ui_preferences = CAST(:prefs AS jsonb) WHERE id = :id"),
                        {"prefs": json.dumps(current), "id": customer_id},
                    )
                    await db.commit()
            except Exception as e:
                return {"error": f"Preferences konnten nicht gespeichert werden: {e}"}

        return {
            "success": True,
            "symbols": symbols,
            "period": period,
            "marker": f"[FENSTER: chart | {','.join(symbols)}]",
            "message": (
                f"Dashboard befüllt mit {', '.join(symbols)} "
                f"(Zeitraum: {period}). Fenster wird automatisch geöffnet."
            ),
        }

    return {"error": f"Unbekanntes Dashboard-Tool: {tool_name}"}
