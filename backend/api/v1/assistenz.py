"""
Assistenz-Fenster Backend.

POST /v1/assistenz/locate        – findet ein Element per DOM-Text oder Vision
POST /v1/assistenz/generate-guide – analysiert die Seite und generiert einen echten Guide
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


# ── Schemas ───────────────────────────────────────────────────────────────────

class LocateRequest(BaseModel):
    url: str
    label: str
    detail: str = ""
    lang: str = "de-CH,de;q=0.9"


class LocateResponse(BaseModel):
    x: int | None = None
    y: int | None = None
    screenshot_b64: str | None = None
    error: str | None = None


class GenerateGuideRequest(BaseModel):
    url: str
    goal: str = ""        # Was der User auf der Seite erreichen will
    lang: str = "de-CH,de;q=0.9"


class StepItem(BaseModel):
    label: str
    detail: str = ""


class GenerateGuideResponse(BaseModel):
    title: str = ""
    steps: list[StepItem] = []
    error: str | None = None


# ── Hilfsfunktion: Claude Vision API Call ─────────────────────────────────────

async def _claude_vision(screenshot_b64: str, prompt: str, max_tokens: int = 512) -> str:
    """Sendet Screenshot + Prompt an Claude Haiku Vision, gibt Text zurück."""
    async with httpx.AsyncClient(timeout=40.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": max_tokens,
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
        return resp.json()["content"][0]["text"].strip()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/assistenz/locate", response_model=LocateResponse)
async def locate_element(
    body: LocateRequest,
    current_user=Depends(get_current_user),
):
    """
    Findet ein UI-Element auf einer Webseite.
    Primär: DOM-Text-Suche via Browserless (scrollt automatisch).
    Fallback: Claude Vision.
    """
    if not settings.browserless_token:
        return LocateResponse(error="Browserless nicht konfiguriert")

    customer_id = f"locate__{current_user.id}"

    # Primär: DOM-Text-Suche
    result = await browser_action(
        customer_id,
        {"type": "find_and_click", "text": body.label, "locateOnly": True, "maxScrolls": 5},
        lang=body.lang,
    )

    screenshot_b64 = result.get("screenshot_b64")
    el_x = result.get("element_x")
    el_y = result.get("element_y")

    if el_x is not None and el_y is not None:
        return LocateResponse(x=el_x, y=el_y, screenshot_b64=screenshot_b64)

    # Fallback: Vision
    if not screenshot_b64:
        nav = await browser_action(customer_id, {"type": "navigate", "url": body.url}, lang=body.lang)
        screenshot_b64 = nav.get("screenshot_b64")

    if not screenshot_b64 or not settings.anthropic_api_key:
        return LocateResponse(error="Element nicht gefunden", screenshot_b64=screenshot_b64)

    description = body.label + (f" — {body.detail}" if body.detail else "")
    prompt = (
        f'Screenshot einer Webseite (1280×720px).\n'
        f'Finde das Element: "{description}"\n'
        f'Antworte NUR mit JSON: {{"x": <zahl>, "y": <zahl>}} oder {{"x": null, "y": null}}'
    )

    try:
        text = await _claude_vision(screenshot_b64, prompt, max_tokens=64)
        start, end = text.find("{"), text.rfind("}") + 1
        coords = json.loads(text[start:end]) if start >= 0 else {}
        x = coords.get("x")
        y = coords.get("y")
        return LocateResponse(
            x=int(x) if x is not None else None,
            y=int(y) if y is not None else None,
            screenshot_b64=screenshot_b64,
        )
    except Exception as e:
        _log.warning("Locate Vision-Fehler: %s", e)
        return LocateResponse(error=str(e), screenshot_b64=screenshot_b64)


@router.post("/assistenz/generate-guide", response_model=GenerateGuideResponse)
async def generate_guide(
    body: GenerateGuideRequest,
    current_user=Depends(get_current_user),
):
    """
    Analysiert die echte Webseite via Browserless + Claude Vision und generiert
    einen genauen Schritt-für-Schritt Guide basierend auf dem tatsächlichen Seiteninhalt.
    """
    if not settings.browserless_token:
        return GenerateGuideResponse(error="Browserless nicht konfiguriert")
    if not settings.anthropic_api_key:
        return GenerateGuideResponse(error="Anthropic API-Key fehlt")

    customer_id = f"guide__{current_user.id}"

    # Seite laden + Screenshot
    result = await browser_action(
        customer_id,
        {"type": "navigate", "url": body.url},
        lang=body.lang,
    )

    if result.get("error") or not result.get("screenshot_b64"):
        return GenerateGuideResponse(error=result.get("error", "Screenshot fehlgeschlagen"))

    screenshot_b64 = result["screenshot_b64"]

    goal_part = f'Das Ziel des Nutzers: "{body.goal}"' if body.goal else "Erkenne selbst was der Nutzer auf dieser Seite tun möchte."

    prompt = f"""Du analysierst einen Screenshot einer Webseite (1280×720px).
{goal_part}

Erstelle eine präzise Schritt-für-Schritt Anleitung basierend auf dem was TATSÄCHLICH auf der Seite sichtbar ist.
Beschreibe nur Elemente die wirklich existieren — erfinde nichts.

Antworte NUR mit validem JSON (kein Text davor oder danach):
{{
  "title": "Kurzer Titel der Aufgabe",
  "steps": [
    {{"label": "Kurze Aktion (3-5 Wörter)", "detail": "Genaue Beschreibung was der Nutzer sehen und klicken soll"}},
    ...
  ]
}}

Regeln:
- Maximal 8 Schritte
- Nur Schritte für sichtbare oder direkt erreichbare Elemente
- Schreibe auf Deutsch, klar und verständlich für ältere Menschen
- Label: kurz (3-5 Wörter), Detail: vollständige Erklärung
- Wenn die Seite z.B. ein Formular hat, beschreibe die echten Felder"""

    try:
        text = await _claude_vision(screenshot_b64, prompt, max_tokens=1024)

        # JSON extrahieren (Claude schreibt manchmal ```json ... ```)
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        start, end = text.find("{"), text.rfind("}") + 1
        if start < 0:
            raise ValueError("Kein JSON in Antwort")

        data = json.loads(text[start:end])
        steps = [StepItem(label=s["label"], detail=s.get("detail", "")) for s in data.get("steps", [])]
        return GenerateGuideResponse(title=data.get("title", "Anleitung"), steps=steps)

    except Exception as e:
        _log.warning("Guide-Generierung fehlgeschlagen: %s", e)
        return GenerateGuideResponse(error=str(e))
