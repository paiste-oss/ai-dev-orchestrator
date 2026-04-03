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
    Nimmt einen Screenshot der URL und lässt Claude Vision den Button finden.
    Gibt Pixel-Koordinaten (1280×720 Viewport) zurück.
    """
    if not settings.browserless_token:
        return LocateResponse(error="Browserless nicht konfiguriert")
    if not settings.anthropic_api_key:
        return LocateResponse(error="Anthropic API-Key fehlt")

    # 1. Screenshot via Browserless
    customer_id = f"locate__{current_user.id}"
    result = await browser_action(customer_id, {"type": "navigate", "url": body.url})

    if result.get("error") or not result.get("screenshot_b64"):
        return LocateResponse(error=result.get("error", "Kein Screenshot"))

    screenshot_b64 = result["screenshot_b64"]

    # 2. Claude Vision: Button-Position finden
    description = body.label
    if body.detail:
        description += f" — {body.detail}"

    prompt = (
        f'Dieses Screenshot zeigt eine Webseite (1280×720 Pixel).\n'
        f'Finde das UI-Element: "{description}"\n'
        f'Antworte NUR mit einem JSON-Objekt: {{"x": <zahl>, "y": <zahl>}}\n'
        f'Die Koordinaten sollen die Mitte des Elements in Pixeln sein.\n'
        f'Wenn das Element nicht sichtbar ist, antworte mit: {{"x": null, "y": null}}'
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
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": screenshot_b64,
                                },
                            },
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
