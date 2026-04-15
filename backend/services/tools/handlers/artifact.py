"""
Handler für Artifact-Management-Tools: open_artifact, close_artifact, netzwerk_aktion.

Diese Tools ersetzen die fragilen [FENSTER:]- und [NETZWERK_AKTION:]-Marker.
Der Handler gibt strukturierte Daten zurück, die _extract_structured_data()
in chat_pipeline.py direkt auswertet — ohne Regex auf dem LLM-Text.
"""
from __future__ import annotations

from typing import Any


async def _handle_artifact(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if tool_name == "open_artifact":
        artifact_type = (tool_input.get("artifact_type") or "").strip()
        title = (tool_input.get("title") or artifact_type).strip()
        data: dict = tool_input.get("data") or {}

        if not artifact_type:
            return {"error": "artifact_type fehlt."}

        return {
            "_artifact_action": "open",
            "canvasType": artifact_type,
            "title": title,
            # Typ-spezifische Daten flach einbetten (symbols, url, goal, east, …)
            **{k: v for k, v in data.items() if v is not None},
        }

    if tool_name == "close_artifact":
        artifact_type = (tool_input.get("artifact_type") or "").strip()
        if not artifact_type:
            return {"error": "artifact_type fehlt."}
        return {
            "_artifact_action": "close",
            "canvasType": artifact_type,
        }

    if tool_name == "netzwerk_aktion":
        action_type = (tool_input.get("action_type") or "").strip()
        if not action_type:
            return {"error": "action_type fehlt."}
        return {
            "_netzwerk_aktion": {
                "type": action_type,
                "name": (tool_input.get("name") or "").strip(),
                "network": (tool_input.get("network") or "").strip(),
                "persons": [p for p in (tool_input.get("persons") or []) if isinstance(p, str) and p.strip()],
            }
        }

    return {"error": f"Unbekanntes Artifact-Tool: {tool_name}"}
