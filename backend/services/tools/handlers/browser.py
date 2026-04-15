"""Handler für Browser-Tools: open_url (neuer Tab) und open_assistenz (Assistenz-Fenster)."""
from __future__ import annotations
from typing import Any


async def _handle_browser(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if tool_name == "open_url":
        url = tool_input.get("url", "")
        if not url.startswith("http"):
            url = f"https://{url}"
        return {
            "marker": f"[OPEN_URL: {url}]",
            "text": f"Ich öffne {url} in einem neuen Tab.",
        }

    if tool_name == "open_assistenz":
        url = tool_input.get("url", "")
        if not url.startswith("http"):
            url = f"https://{url}"
        goal = tool_input.get("goal", "")
        return {
            "_artifact_action": "open",
            "canvasType": "assistenz",
            "title": f"🌐 Assistenz",
            "url": url,
            **({"goal": goal} if goal else {}),
        }

    return {"error": f"Unbekanntes Browser-Tool: {tool_name}"}
