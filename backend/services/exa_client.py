"""
Exa Web Search Client — Neuronale Websuche für aktuelle Informationen.

Exa findet relevante Seiten anhand von Bedeutung, nicht nur Keywords.
Ideal für: aktuelle Nachrichten, Preise, Personen, Ereignisse, Fakten.
"""
import httpx
from core.config import settings

EXA_BASE = "https://api.exa.ai"
MAX_RESULTS = 5
MAX_CHARS_PER_RESULT = 1000


async def search(query: str, num_results: int = MAX_RESULTS) -> dict:
    """
    Sucht mit Exa nach relevanten Webseiten und gibt Titel, URL und Snippet zurück.
    """
    if not settings.exa_api_key:
        return {"error": "Exa API Key nicht konfiguriert."}

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{EXA_BASE}/search",
            headers={
                "x-api-key": settings.exa_api_key,
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "numResults": min(num_results, MAX_RESULTS),
                "contents": {
                    "text": {"maxCharacters": MAX_CHARS_PER_RESULT},
                },
                "type": "auto",  # neural + keyword hybrid
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for r in data.get("results", []):
        results.append({
            "title":   r.get("title", ""),
            "url":     r.get("url", ""),
            "snippet": (r.get("text") or r.get("highlights", [""])[0] or "")[:MAX_CHARS_PER_RESULT],
            "published": r.get("publishedDate", ""),
        })

    return {"query": query, "results": results}
