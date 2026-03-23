"""Handler für Bild-Tools: generate_image (DALL-E 3) und search_image (Unsplash)."""
from __future__ import annotations
import httpx
from typing import Any
from core.config import settings


async def _handle_dalle(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "generate_image":
        if not settings.openai_api_key:
            return {"error": "OpenAI API Key nicht konfiguriert."}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={
                        "Authorization": f"Bearer {settings.openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "dall-e-3",
                        "prompt": tool_input["prompt"],
                        "size": tool_input.get("size", "1024x1024"),
                        "quality": tool_input.get("quality", "standard"),
                        "n": 1,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            image_url = data["data"][0]["url"]
            return {
                "image_url": image_url,
                "prompt": tool_input["prompt"],
            }
        except Exception as e:
            return {"error": f"Bild konnte nicht erstellt werden: {e}"}
    return {"error": f"Unbekanntes DALL-E Tool: {tool_name}"}


async def _handle_unsplash(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "search_image":
        if not settings.unsplash_access_key:
            return {"error": "Unsplash API Key nicht konfiguriert."}
        query = tool_input.get("query", "")
        count = min(tool_input.get("count", 1), 3)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://api.unsplash.com/search/photos",
                    headers={"Authorization": f"Client-ID {settings.unsplash_access_key}"},
                    params={"query": query, "per_page": count, "orientation": "landscape"},
                )
                resp.raise_for_status()
                data = resp.json()
            results = data.get("results", [])
            if not results:
                return {"error": f"Keine Bilder gefunden für '{query}'"}
            images = []
            for r in results:
                images.append({
                    "image_url": r["urls"]["regular"],
                    "description": r.get("alt_description") or r.get("description") or query,
                    "photographer": r["user"]["name"],
                    "source": "Unsplash",
                })
            return images if len(images) > 1 else images[0]
        except Exception as e:
            return {"error": f"Bildsuche fehlgeschlagen: {e}"}
    return {"error": f"Unbekanntes Unsplash-Tool: {tool_name}"}
