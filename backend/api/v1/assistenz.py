"""
Assistenz-Fenster Backend: Screenshot + Claude Vision → präzise Button-Koordinaten.

POST /v1/assistenz/locate
  - Lädt die URL via Browserless (1280×720)
  - Schickt Screenshot an Claude Vision
  - Gibt {x, y} Pixel-Koordinaten des gesuchten Elements zurück
"""
from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.config import settings
from core.dependencies import get_current_user
from services.browser_service import browser_action

_log = logging.getLogger(__name__)

router = APIRouter(tags=["assistenz"])


class LocateRequest(BaseModel):
    url: str
    label: str           # z.B. "«Anmelden» klicken"
    detail: str = ""     # z.B. "Klicke auf den blauen Button oben rechts"
    lang: str = "de-CH,de;q=0.9"   # Accept-Language für Browserless


class LocateResponse(BaseModel):
    x: int | None = None
    y: int | None = None
    screenshot_b64: str | None = None
    error: str | None = None


@router.post("/assistenz/locate", response_model=LocateResponse)
async def locate_element(
    body: LocateRequest,
    current_user=Depends(get_current_user),
):
    """
    Findet ein UI-Element auf einer Webseite.
    Primär: DOM-Text-Suche via Browserless (scrollt automatisch).
    Fallback: Claude Vision auf dem Screenshot.
    """
    if not settings.browserless_token:
        return LocateResponse(error="Browserless nicht konfiguriert")

    customer_id = f"locate__{current_user.id}"

    # ── Primär: DOM-Text-Suche (find_and_click locate_only) ──────────────────
    # Navigiert, sucht per Textinhalt, scrollt falls nötig — kein Klick.
    result = await browser_action(
        customer_id,
        {"type": "find_and_click", "text": body.label, "locateOnly": True, "maxScrolls": 5},
        lang=body.lang,
    )

    screenshot_b64 = result.get("screenshot_b64")
    el_x = result.get("element_x")
    el_y = result.get("element_y")

    # Element direkt per DOM gefunden → sofort zurückgeben
    if el_x is not None and el_y is not None:
        return LocateResponse(x=el_x, y=el_y, screenshot_b64=screenshot_b64)

    # ── Fallback: Claude Vision auf Screenshot ────────────────────────────────
    if not screenshot_b64:
        # Noch kein Screenshot → plain navigate
        nav = await browser_action(customer_id, {"type": "navigate", "url": body.url}, lang=body.lang)
        screenshot_b64 = nav.get("screenshot_b64")

    if not screenshot_b64 or not settings.anthropic_api_key:
        return LocateResponse(error="Element nicht gefunden und Vision nicht verfügbar",
                              screenshot_b64=screenshot_b64)

    description = body.label
    if body.detail:
        description += f" — {body.detail}"

    prompt = (
        f'Dieses Screenshot zeigt eine Webseite (1280×720 Pixel).\n'
        f'Finde das UI-Element: "{description}"\n'
        f'Antworte NUR mit einem JSON-Objekt: {{"x": <zahl>, "y": <zahl>}}\n'
        f'Koordinaten = Mittelpunkt des Elements in Pixeln.\n'
        f'Nicht sichtbar: {{"x": null, "y": null}}'
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 64,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": screenshot_b64}},
                            {"type": "text", "text": prompt},
                        ],
                    }],
                },
            )
            resp.raise_for_status()
            text = resp.json()["content"][0]["text"].strip()

        # JSON aus Antwort extrahieren (auch wenn Claude extra Text schreibt)
        start = text.find("{")
        end = text.rfind("}") + 1
        coords = json.loads(text[start:end]) if start >= 0 else {}

        x = coords.get("x")
        y = coords.get("y")
        if x is not None:
            x = int(x)
        if y is not None:
            y = int(y)

        return LocateResponse(x=x, y=y, screenshot_b64=screenshot_b64)

    except Exception as e:
        _log.warning("Assistenz locate-Fehler: %s", e)
        return LocateResponse(error=str(e), screenshot_b64=screenshot_b64)
