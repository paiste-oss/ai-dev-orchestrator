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
        "name": "open_url",
        "description": (
            "Öffnet eine Webseite in einem neuen Browser-Tab des Nutzers. "
            "Nutze dieses Tool wenn der Nutzer eine Webseite besuchen möchte ohne Assistenz — "
            "z.B. 'zeig mir sbb.ch', 'öffne google.com'. "
            "Für Anmeldungen oder Formulare auf Webseiten nutze stattdessen 'open_assistenz'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Vollständige URL, z.B. 'https://sbb.ch'"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "open_assistenz",
        "description": (
            "Öffnet das Assistenz-Fenster und führt den Nutzer Schritt für Schritt durch eine Webseite. "
            "Nutze dieses Tool wenn der Nutzer sich irgendwo anmelden, registrieren oder ein Formular ausfüllen möchte — "
            "z.B. 'ich muss mich bei der AHV anmelden', 'hilf mir ein SBB-Konto zu erstellen', "
            "'ich verstehe das Formular nicht', 'kann du mir helfen mich anzumelden'. "
            "Erkenne den Kontext und wähle die passende URL."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL der Webseite, auf der der Nutzer Hilfe braucht, z.B. 'https://www.ahv-iv.ch'"},
                "site": {"type": "string", "description": "Kurzname der Seite, z.B. 'ahv-iv.ch', 'sbb.ch', 'post.ch', 'ch.ch'"},
            },
            "required": ["url"],
        },
    },
]
