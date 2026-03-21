"""
Jina Reader Client — Ruft Webseiten ab und gibt sauberes Markdown zurück.

Kein API-Key nötig. Einfach https://r.jina.ai/{url} aufrufen.
"""
import httpx

JINA_BASE = "https://r.jina.ai"
MAX_CHARS = 8000  # Auf Token-Budget achten


async def fetch_url(url: str) -> dict:
    """Ruft eine URL via Jina Reader ab und gibt Markdown-Text zurück."""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    jina_url = f"{JINA_BASE}/{url}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            jina_url,
            headers={
                "Accept": "text/plain",
                "X-Return-Format": "markdown",
            },
        )
        resp.raise_for_status()
        content = resp.text

    # Kürzen damit der Kontext nicht überflutet wird
    if len(content) > MAX_CHARS:
        content = content[:MAX_CHARS] + "\n\n[… Inhalt gekürzt]"

    return {
        "url": url,
        "content": content,
        "chars": len(content),
    }
