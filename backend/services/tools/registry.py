"""Tool-Katalog und Dispatcher — assembliert aus Definitionen und Handlern."""
from __future__ import annotations
from typing import Any

from services.tools.defs import (
    SBB_TOOL_DEFS,
    WEB_FETCH_TOOL_DEFS,
    WEB_SEARCH_TOOL_DEFS,
    DALLE_TOOL_DEFS,
    STOCK_TOOL_DEFS,
    STOCK_ALERT_TOOL_DEFS,
    UNSPLASH_TOOL_DEFS,
    BROWSER_TOOL_DEFS,
    TRAINING_REMINDER_TOOL_DEFS,
    WEATHER_TOOL_DEFS,
    DASHBOARD_TOOL_DEFS,
    PORTFOLIO_TOOL_DEFS,
    GEO_MAP_TOOL_DEFS,
    DOCUMENT_SEARCH_TOOL_DEFS,
)
from services.tools.handlers.transport import _handle_sbb
from services.tools.handlers.web import _handle_web_fetch, _handle_web_search
from services.tools.handlers.images import _handle_dalle, _handle_unsplash
from services.tools.handlers.stocks import _handle_stock, _handle_stock_alerts
from services.tools.handlers.browser import _handle_browser
from services.tools.handlers.training import _handle_training_reminders
from services.tools.handlers.weather import _handle_weather
from services.tools.handlers.dashboard import _handle_dashboard
from services.tools.handlers.portfolio import _handle_portfolio
from services.tools.handlers.geo import _handle_geo_map
from services.tools.handlers.documents import _handle_documents


# ---------------------------------------------------------------------------
# Tool-Katalog
# ---------------------------------------------------------------------------

TOOL_CATALOG: dict[str, dict] = {
    "sbb_transport": {
        "key": "sbb_transport",
        "name": "SBB / Schweizer ÖV",
        "description": "Echtzeit-Fahrpläne, Abfahrtstafeln und Verbindungssuche im Schweizer öffentlichen Verkehr.",
        "prompt_hint": "Echtzeit-Fahrpläne, Abfahrtstafeln und Verbindungssuche im Schweizer ÖV (SBB/Bus/Tram)",
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
        "prompt_hint": "Webseiten abrufen und vollständig lesen — einfach eine URL nennen",
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
        "prompt_hint": "Im Internet nach aktuellen Informationen, Nachrichten und Preisen suchen (Exa)",
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
        "prompt_hint": "Echte Bilder generieren und zeichnen mit DALL-E 3 — du kannst wirklich Bilder erstellen!",
        "category": "productivity",
        "tier": "pro",
        "tool_defs": DALLE_TOOL_DEFS,
        "tool_names": {"generate_image"},
        "handler": _handle_dalle,
        "needs_customer_id": True,
    },
    "stock_prices": {
        "key": "stock_prices",
        "name": "Aktienkurse (Yahoo Finance)",
        "description": "Live-Aktienkurse, Tagesperformance und Kennzahlen via Yahoo Finance. Kein API-Key nötig.",
        "prompt_hint": "Aktuelle Aktienkurse, Börsendaten und Unternehmenskennzahlen abfragen (Yahoo Finance)",
        "category": "data",
        "tier": "free",
        "tool_defs": STOCK_TOOL_DEFS,
        "tool_names": {"get_stock_price", "search_stock_symbol", "get_stock_history"},
        "handler": _handle_stock,
    },
    "image_search": {
        "key": "image_search",
        "name": "Bildsuche (Unsplash)",
        "description": "Sucht echte Fotos aus dem Internet via Unsplash. Zeigt Bilder direkt im Chat an.",
        "prompt_hint": "Echte Fotos und Bilder aus dem Internet suchen und anzeigen (Unsplash)",
        "category": "data",
        "tier": "free",
        "tool_defs": UNSPLASH_TOOL_DEFS,
        "tool_names": {"search_image"},
        "handler": _handle_unsplash,
        "needs_customer_id": True,
    },
    "stock_alerts": {
        "key": "stock_alerts",
        "name": "Kurs-Alerts (E-Mail)",
        "description": "Automatische E-Mail-Benachrichtigung wenn ein Aktienkurs einen Schwellwert über- oder unterschreitet.",
        "prompt_hint": "Kurs-Alerts einrichten: E-Mail erhalten wenn ein Aktienkurs über/unter einen Wert fällt",
        "category": "data",
        "tier": "free",
        "tool_defs": STOCK_ALERT_TOOL_DEFS,
        "tool_names": {"create_stock_alert", "list_stock_alerts", "delete_stock_alert"},
        "handler": _handle_stock_alerts,
        "needs_customer_id": True,
    },
    "browser": {
        "key": "browser",
        "name": "Web-Browser (Browserless.io)",
        "description": "Öffnet Webseiten und steuert den Browser interaktiv. Kunden können Seiten besuchen, suchen, klicken und Formulare ausfüllen.",
        "prompt_hint": "Webseiten im Browser öffnen und bedienen — navigieren, klicken, tippen, scrollen",
        "category": "productivity",
        "tier": "pro",
        "tool_defs": BROWSER_TOOL_DEFS,
        "tool_names": {"browser"},
        "handler": _handle_browser,
        "needs_customer_id": True,
    },
    "training_reminders": {
        "key": "training_reminders",
        "name": "Trainingsplan & Erinnerungen",
        "description": "Erstellt personalisierte Wochentrainingspläne und sendet automatische E-Mail-Erinnerungen vor jedem Training.",
        "prompt_hint": "Trainingsplan erstellen, Workout-Kalender aufstellen und per E-Mail an Training erinnern lassen",
        "category": "productivity",
        "tier": "free",
        "tool_defs": TRAINING_REMINDER_TOOL_DEFS,
        "tool_names": {"create_training_reminder", "list_training_reminders", "delete_training_reminder"},
        "handler": _handle_training_reminders,
        "needs_customer_id": True,
    },
    "weather": {
        "key": "weather",
        "name": "Wetter (OpenWeatherMap)",
        "description": "Aktuelles Wetter und 5-Tages-Vorhersage für beliebige Städte weltweit via OpenWeatherMap.",
        "prompt_hint": "Aktuelles Wetter und Wettervorhersage für jede Stadt weltweit abfragen",
        "category": "data",
        "tier": "free",
        "tool_defs": WEATHER_TOOL_DEFS,
        "tool_names": {"get_current_weather", "get_weather_forecast"},
        "handler": _handle_weather,
    },
    "portfolio_manager": {
        "key": "portfolio_manager",
        "name": "Portfolio verwalten",
        "description": "Aktien-Positionen zum persönlichen Portfolio hinzufügen, aktualisieren oder entfernen.",
        "prompt_hint": "Aktien-Positionen zum Portfolio hinzufügen oder entfernen (Stück, Kaufkurs, Währung)",
        "category": "data",
        "tier": "free",
        "tool_defs": PORTFOLIO_TOOL_DEFS,
        "tool_names": {"portfolio_add_position", "portfolio_remove_position"},
        "handler": _handle_portfolio,
        "needs_customer_id": True,
    },
    "dashboard": {
        "key": "dashboard",
        "name": "Aktien-Dashboard befüllen",
        "description": "Füllt das Aktien-Dashboard mit Symbolen und Zeitraum — öffnet das Chart-Fenster automatisch.",
        "prompt_hint": "Aktien-Dashboard befüllen: mehrere Symbole auf einmal hinzufügen und Zeitraum setzen",
        "category": "data",
        "tier": "free",
        "tool_defs": DASHBOARD_TOOL_DEFS,
        "tool_names": {"populate_dashboard"},
        "handler": _handle_dashboard,
        "needs_customer_id": True,
    },
    "geo_map": {
        "key": "geo_map",
        "name": "Schweizer Karte (swisstopo)",
        "description": "Öffnet eine interaktive Schweizer Karte (map.geo.admin.ch) für Orte, Adressen und Gemeinden.",
        "prompt_hint": "Schweizer Karte öffnen — Orte, Adressen, Parzellen und Gemeinden auf swisstopo anzeigen",
        "category": "data",
        "tier": "free",
        "tool_defs": GEO_MAP_TOOL_DEFS,
        "tool_names": {"open_swiss_map"},
        "handler": _handle_geo_map,
    },
    "document_search": {
        "key": "document_search",
        "name": "Dokumentensuche",
        "description": "Durchsucht hochgeladene Dokumente des Nutzers nach Inhalten, Stichwörtern oder Phrasen.",
        "prompt_hint": "Hochgeladene Dokumente durchsuchen und Inhalte aus Dateien abrufen (PDF, Word, Excel, etc.)",
        "category": "data",
        "tier": "free",
        "tool_defs": DOCUMENT_SEARCH_TOOL_DEFS,
        "tool_names": {"search_documents", "list_documents"},
        "handler": _handle_documents,
        "needs_customer_id": True,
    },
}


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def get_tool_defs(tool_keys: list[str]) -> list[dict]:
    """Gibt die Anthropic Tool-Definitionen für die angegebenen Tool-Keys zurück."""
    defs = []
    for key in tool_keys:
        entry = TOOL_CATALOG.get(key)
        if entry:
            defs.extend(entry["tool_defs"])
    return defs


async def call_tool(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    """Führt einen Tool-Call aus — findet automatisch den richtigen Handler."""
    for entry in TOOL_CATALOG.values():
        if tool_name in entry["tool_names"]:
            if entry.get("needs_customer_id"):
                return await entry["handler"](tool_name, tool_input, customer_id=customer_id)
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


# Alias für Konsistenz mit dem execute_tool-Namen im __init__
execute_tool = call_tool
