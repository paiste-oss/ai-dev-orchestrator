"""Handler für Browser-Tool: browser (Browserless.io)."""
from __future__ import annotations
from typing import Any
from core.config import settings


async def _handle_browser(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if not customer_id:
        return {"error": "Kunden-ID fehlt."}
    if not settings.browserless_token:
        return {"error": "Browser-Tool nicht konfiguriert (BROWSERLESS_TOKEN fehlt)."}

    from services.browser_service import browser_action

    action = {"type": tool_input.get("action", "screenshot")}
    if action["type"] == "navigate":
        action["url"] = tool_input.get("url", "")
    elif action["type"] == "click":
        action["x"] = tool_input.get("x", 640)
        action["y"] = tool_input.get("y", 360)
    elif action["type"] == "type":
        action["text"] = tool_input.get("text", "")
        action["submit"] = tool_input.get("submit", False)
    elif action["type"] == "scroll":
        action["direction"] = tool_input.get("direction", "down")

    result = await browser_action(customer_id, action)
    return result
