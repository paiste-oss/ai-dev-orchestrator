"""E-Mail-Tool: Baddi kann auf expliziten Wunsch eine Antwort an die eigene Adresse des Users senden."""
from __future__ import annotations

SEND_TO_MY_EMAIL_TOOL_DEFS = [
    {
        "name": "send_to_my_email",
        "description": (
            "Sendet eine Nachricht, Zusammenfassung oder Information per E-Mail an die eigene "
            "registrierte E-Mail-Adresse des Users. Nur an die eigene Adresse — nie an Dritte. "
            "Verwende dieses Tool wenn der User explizit bittet, etwas per E-Mail zu erhalten, "
            "z.B. 'schick mir das per Mail', 'sende mir eine Zusammenfassung' etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": "Betreff der E-Mail, z.B. 'Deine Zusammenfassung von heute'",
                },
                "body": {
                    "type": "string",
                    "description": "Vollständiger Inhalt der E-Mail als Plain-Text.",
                },
            },
            "required": ["subject", "body"],
        },
    },
]
