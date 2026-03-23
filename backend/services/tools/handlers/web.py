"""Handler für Web-Tools: web_fetch (Jina Reader) und web_search (Exa)."""
from __future__ import annotations
from typing import Any
from services import jina_client
from services import exa_client


async def _handle_web_fetch(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "web_fetch":
        try:
            return await jina_client.fetch_url(tool_input["url"])
        except Exception as e:
            return {"error": f"Seite konnte nicht abgerufen werden: {e}"}
    return {"error": f"Unbekanntes Web-Tool: {tool_name}"}


async def _handle_web_search(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "web_search":
        try:
            return await exa_client.search(
                query=tool_input["query"],
                num_results=tool_input.get("num_results", 3),
            )
        except Exception as e:
            return {"error": f"Websuche fehlgeschlagen: {e}"}
    return {"error": f"Unbekanntes Search-Tool: {tool_name}"}
