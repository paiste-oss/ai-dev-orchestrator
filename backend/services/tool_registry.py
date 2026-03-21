"""
Tool Registry — Alle verfügbaren Buddy-Tools zentral registriert.

Jedes Tool hat:
  - key:         Eindeutiger Bezeichner (z.B. "sbb_transport")
  - name:        Anzeigename
  - description: Was das Tool macht (für Admin-UI)
  - category:    transport | communication | productivity | data | system
  - tier:        free | starter | pro | enterprise
  - tool_def:    Anthropic Tool-Definition(en) für Tool Use
  - handler:     Async-Funktion, die den Tool-Call ausführt
"""
from __future__ import annotations
import asyncio
import httpx
from typing import Any
from services import sbb_client
from services import jina_client
from services import exa_client
from core.config import settings


# ---------------------------------------------------------------------------
# Tool-Definitionen (Anthropic Tool Use Format)
# ---------------------------------------------------------------------------

SBB_TOOL_DEFS = [
    {
        "name": "sbb_locations",
        "description": (
            "Sucht Schweizer ÖV-Haltestellen, Orte oder Adressen nach Name. "
            "Gibt ID, Name und Koordinaten zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Haltestellenname oder Ort, z.B. 'Zürich HB', 'Bern Bahnhof'",
                },
                "type": {
                    "type": "string",
                    "enum": ["station", "poi", "address", "all"],
                    "description": "Typ des Orts. Standard: station",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "sbb_stationboard",
        "description": (
            "Zeigt die Echtzeit-Abfahrtstafel einer Haltestelle. "
            "Enthält Linie, Ziel, Abfahrtszeit, Gleis und Verspätung."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "station": {
                    "type": "string",
                    "description": "Haltestellenname oder ID, z.B. '8503000' oder 'Zürich HB'",
                },
                "limit": {
                    "type": "integer",
                    "description": "Anzahl Abfahrten, Standard 10",
                    "default": 10,
                },
                "type": {
                    "type": "string",
                    "enum": ["departure", "arrival"],
                    "description": "Abfahrten oder Ankünfte. Standard: departure",
                },
                "transportation": {
                    "type": "string",
                    "enum": ["train", "tram", "bus", "ship", "cableway"],
                    "description": "Optional: nur dieses Verkehrsmittel",
                },
            },
            "required": ["station"],
        },
    },
    {
        "name": "sbb_connections",
        "description": (
            "Sucht Verbindungen zwischen zwei Haltestellen im Schweizer ÖV. "
            "Gibt Abfahrt, Ankunft, Dauer, Umstiege und Gleis zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from_station": {
                    "type": "string",
                    "description": "Abgangsort, z.B. 'Bern'",
                },
                "to_station": {
                    "type": "string",
                    "description": "Zielort, z.B. 'Zürich HB'",
                },
                "date": {
                    "type": "string",
                    "description": "Datum YYYY-MM-DD. Leer = heute",
                },
                "time": {
                    "type": "string",
                    "description": "Uhrzeit HH:MM. Leer = jetzt",
                },
                "is_arrival_time": {
                    "type": "boolean",
                    "description": "True wenn 'time' die gewünschte Ankunftszeit ist",
                    "default": False,
                },
                "limit": {
                    "type": "integer",
                    "description": "Anzahl Verbindungen (1-16). Standard: 4",
                    "default": 4,
                },
            },
            "required": ["from_station", "to_station"],
        },
    },
]


# ---------------------------------------------------------------------------
# Web Fetch (Jina Reader)
# ---------------------------------------------------------------------------

WEB_FETCH_TOOL_DEFS = [
    {
        "name": "web_fetch",
        "description": (
            "Ruft eine Webseite ab und gibt den Inhalt als lesbaren Text zurück. "
            "Nutze dieses Tool wenn du aktuelle Informationen von einer Website brauchst, "
            "eine URL nachschlagen sollst, oder der Nutzer dich bittet eine Seite zu lesen. "
            "Gibt sauberes Markdown zurück — keine Werbung, kein HTML."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Die vollständige URL der Webseite, z.B. 'https://example.com/artikel'",
                },
            },
            "required": ["url"],
        },
    },
]


async def _handle_web_fetch(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "web_fetch":
        try:
            return await jina_client.fetch_url(tool_input["url"])
        except Exception as e:
            return {"error": f"Seite konnte nicht abgerufen werden: {e}"}
    return {"error": f"Unbekanntes Web-Tool: {tool_name}"}


# ---------------------------------------------------------------------------
# Tool-Handler (Async)
# ---------------------------------------------------------------------------

async def _handle_sbb(tool_name: str, tool_input: dict) -> Any:
    """Führt SBB-Tool-Calls aus und formatiert das Ergebnis kompakt."""
    if tool_name == "sbb_locations":
        result = await sbb_client.search_locations(
            tool_input["query"],
            location_type=tool_input.get("type", "station"),
        )
        stations = result.get("stations", [])[:5]
        return [
            {"id": s.get("id"), "name": s.get("name"), "type": s.get("type")}
            for s in stations if s
        ]

    if tool_name == "sbb_stationboard":
        result = await sbb_client.get_stationboard(
            station=tool_input["station"],
            limit=tool_input.get("limit", 10),
            board_type=tool_input.get("type", "departure"),
            transport_type=tool_input.get("transportation"),
        )
        board = result.get("stationboard", [])
        return [
            {
                "line": j.get("name"),
                "destination": j.get("to"),
                "departure": j.get("stop", {}).get("departure"),
                "platform": j.get("stop", {}).get("platform"),
                "delay": j.get("stop", {}).get("delay", 0),
                "category": j.get("category"),
            }
            for j in board
        ]

    if tool_name == "sbb_connections":
        result = await sbb_client.get_connections(
            from_station=tool_input["from_station"],
            to_station=tool_input["to_station"],
            date=tool_input.get("date"),
            time=tool_input.get("time"),
            is_arrival_time=tool_input.get("is_arrival_time", False),
            limit=tool_input.get("limit", 4),
        )
        connections = result.get("connections", [])
        out = []
        for c in connections:
            from_stop = c.get("from", {})
            to_stop = c.get("to", {})
            out.append({
                "from": from_stop.get("station", {}).get("name"),
                "to": to_stop.get("station", {}).get("name"),
                "departure": from_stop.get("departure"),
                "arrival": to_stop.get("arrival"),
                "duration": c.get("duration"),
                "transfers": c.get("transfers", 0),
                "platform": from_stop.get("platform"),
            })
        return out

    return {"error": f"Unbekanntes SBB-Tool: {tool_name}"}


# ---------------------------------------------------------------------------
# Web Search (Exa)
# ---------------------------------------------------------------------------

WEB_SEARCH_TOOL_DEFS = [
    {
        "name": "web_search",
        "description": (
            "Sucht im Internet nach aktuellen Informationen, Nachrichten, Preisen, "
            "Personen oder Ereignissen. Nutze dieses Tool wenn du aktuelle oder "
            "externe Informationen brauchst die nicht in deinem Wissen vorhanden sind. "
            "Gibt Titel, URL und Textauszug der relevantesten Ergebnisse zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Suchanfrage, z.B. 'iPhone 16 Preis Schweiz' oder 'Nachrichten Schweiz heute'",
                },
                "num_results": {
                    "type": "integer",
                    "description": "Anzahl Ergebnisse (1-5). Standard: 3",
                    "default": 3,
                },
            },
            "required": ["query"],
        },
    },
]


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


# ---------------------------------------------------------------------------
# Bild-Generierung (DALL-E 3)
# ---------------------------------------------------------------------------

DALLE_TOOL_DEFS = [
    {
        "name": "generate_image",
        "description": (
            "Erstellt ein Bild basierend auf einer Textbeschreibung mit DALL-E 3. "
            "Nutze dieses Tool wenn der Nutzer ein Bild erstellt, gezeichnet oder generiert haben möchte. "
            "Gibt die URL des generierten Bildes zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Detaillierte Bildbeschreibung auf Englisch für beste Ergebnisse",
                },
                "size": {
                    "type": "string",
                    "enum": ["1024x1024", "1792x1024", "1024x1792"],
                    "description": "Bildgrösse. Standard: 1024x1024 (quadratisch)",
                },
                "quality": {
                    "type": "string",
                    "enum": ["standard", "hd"],
                    "description": "standard = schnell, hd = mehr Detail",
                },
            },
            "required": ["prompt"],
        },
    },
]


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


# ---------------------------------------------------------------------------
# Tool-Katalog
# ---------------------------------------------------------------------------

TOOL_CATALOG: dict[str, dict] = {
    "sbb_transport": {
        "key": "sbb_transport",
        "name": "SBB / Schweizer ÖV",
        "description": "Echtzeit-Fahrpläne, Abfahrtstafeln und Verbindungssuche im Schweizer öffentlichen Verkehr.",
        "category": "transport",
        "tier": "free",
        "tool_defs": SBB_TOOL_DEFS,
        "tool_names": {"sbb_locations", "sbb_stationboard", "sbb_connections"},
        "handler": _handle_sbb,
    },
    "web_fetch": {
        "key": "web_fetch",
        "name": "Web-Zugriff (Jina Reader)",
        "description": "Ruft beliebige Webseiten ab und gibt den Inhalt als lesbaren Text zurück. Kein API-Key nötig.",
        "category": "data",
        "tier": "free",
        "tool_defs": WEB_FETCH_TOOL_DEFS,
        "tool_names": {"web_fetch"},
        "handler": _handle_web_fetch,
    },
    "web_search": {
        "key": "web_search",
        "name": "Web-Suche (Exa)",
        "description": "Neuronale Websuche für aktuelle Informationen, Nachrichten, Preise und Fakten.",
        "category": "data",
        "tier": "free",
        "tool_defs": WEB_SEARCH_TOOL_DEFS,
        "tool_names": {"web_search"},
        "handler": _handle_web_search,
    },
    "image_generation": {
        "key": "image_generation",
        "name": "Bild-Generierung (DALL-E 3)",
        "description": "Erstellt Bilder per KI anhand einer Textbeschreibung. Nutzt OpenAI DALL-E 3.",
        "category": "productivity",
        "tier": "pro",
        "tool_defs": DALLE_TOOL_DEFS,
        "tool_names": {"generate_image"},
        "handler": _handle_dalle,
    },
    # Weitere Tools können hier ergänzt werden:
    # "google_calendar": { ... }
    # "send_email": { ... }
    # "web_search": { ... }
}


def get_tool_defs(tool_keys: list[str]) -> list[dict]:
    """Gibt die Anthropic Tool-Definitionen für die angegebenen Tool-Keys zurück."""
    defs = []
    for key in tool_keys:
        entry = TOOL_CATALOG.get(key)
        if entry:
            defs.extend(entry["tool_defs"])
    return defs


async def call_tool(tool_name: str, tool_input: dict) -> Any:
    """Führt einen Tool-Call aus — findet automatisch den richtigen Handler."""
    for entry in TOOL_CATALOG.values():
        if tool_name in entry["tool_names"]:
            return await entry["handler"](tool_name, tool_input)
    return {"error": f"Tool '{tool_name}' nicht gefunden"}


def list_tools() -> list[dict]:
    """Gibt alle verfügbaren Tools für die Admin-UI zurück."""
    return [
        {
            "key": v["key"],
            "name": v["name"],
            "description": v["description"],
            "category": v["category"],
            "tier": v["tier"],
        }
        for v in TOOL_CATALOG.values()
    ]
