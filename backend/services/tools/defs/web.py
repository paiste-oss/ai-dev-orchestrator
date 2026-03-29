"""Web-Tools: Fetch, Search, Browser."""
from __future__ import annotations

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
                "url": {"type": "string", "description": "Die vollständige URL der Webseite, z.B. 'https://example.com/artikel'"},
            },
            "required": ["url"],
        },
    },
]

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
                "query": {"type": "string", "description": "Suchanfrage, z.B. 'iPhone 16 Preis Schweiz'"},
                "num_results": {"type": "integer", "description": "Anzahl Ergebnisse (1-5). Standard: 3", "default": 3},
            },
            "required": ["query"],
        },
    },
]

BROWSER_TOOL_DEFS = [
    {
        "name": "browser",
        "description": (
            "Öffnet Webseiten im Browser und steuert diese interaktiv. "
            "Nutze dieses Tool wenn der Nutzer eine Website besuchen, etwas suchen, "
            "auf Buttons klicken, Formulare ausfüllen oder eine Seite bedienen möchte. "
            "Gibt einen Screenshot der aktuellen Seite zurück. "
            "Die Session bleibt zwischen Nachrichten erhalten — du kannst mehrere Schritte machen. "
            "Für Klicks: schätze die x/y-Koordinaten anhand des letzten Screenshots (Viewport: 1280×720)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["navigate", "click", "type", "scroll", "screenshot"], "description": "Aktion: navigate=URL öffnen, click=klicken, type=Text eingeben, scroll=scrollen, screenshot=aktuellen Stand zeigen"},
                "url": {"type": "string", "description": "URL für 'navigate'"},
                "x": {"type": "integer", "description": "X-Koordinate für 'click' (0–1280)"},
                "y": {"type": "integer", "description": "Y-Koordinate für 'click' (0–720)"},
                "text": {"type": "string", "description": "Text für 'type'"},
                "submit": {"type": "boolean", "description": "Bei 'type': Enter drücken nach der Eingabe. Standard: false"},
                "direction": {"type": "string", "enum": ["down", "up"], "description": "Richtung für 'scroll'. Standard: down"},
            },
            "required": ["action"],
        },
    },
]
