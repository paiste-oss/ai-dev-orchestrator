"""Handler für ÖV-Tools: sbb_locations, sbb_stationboard, sbb_connections."""
from __future__ import annotations
from typing import Any
from services import sbb_client


async def _handle_sbb(tool_name: str, tool_input: dict) -> Any:
    """Führt SBB-Tool-Calls aus und formatiert das Ergebnis kompakt."""
    if tool_name == "sbb_locations":
        result = await sbb_client.search_locations(
            tool_input["query"],
            location_type=tool_input.get("type", "station"),
        )
        stations = result.get("stations", [])[:5]
        return [
            {"id": s.get("id"), "name": s.get("name"), "type": s.get("type")}
            for s in stations if s
        ]

    if tool_name == "sbb_stationboard":
        result = await sbb_client.get_stationboard(
            station=tool_input["station"],
            limit=tool_input.get("limit", 10),
            board_type=tool_input.get("type", "departure"),
            transport_type=tool_input.get("transportation"),
        )
        board = result.get("stationboard", [])
        return [
            {
                "line": j.get("name"),
                "destination": j.get("to"),
                "departure": j.get("stop", {}).get("departure"),
                "platform": j.get("stop", {}).get("platform"),
                "delay": j.get("stop", {}).get("delay", 0),
                "category": j.get("category"),
            }
            for j in board
        ]

    if tool_name == "sbb_connections":
        result = await sbb_client.get_connections(
            from_station=tool_input["from_station"],
            to_station=tool_input["to_station"],
            date=tool_input.get("date"),
            time=tool_input.get("time"),
            is_arrival_time=tool_input.get("is_arrival_time", False),
            limit=tool_input.get("limit", 4),
        )
        connections = result.get("connections", [])
        out = []
        for c in connections:
            from_stop = c.get("from", {})
            to_stop = c.get("to", {})
            out.append({
                "from": from_stop.get("station", {}).get("name"),
                "to": to_stop.get("station", {}).get("name"),
                "departure": from_stop.get("departure"),
                "arrival": to_stop.get("arrival"),
                "duration": c.get("duration"),
                "transfers": c.get("transfers", 0),
                "platform": from_stop.get("platform"),
            })
        return out

    return {"error": f"Unbekanntes SBB-Tool: {tool_name}"}
