"""Kalender Tool-Definitionen — CalDAV via Radicale."""
from __future__ import annotations

CALENDAR_TOOL_DEFS = [
    {
        "name": "calendar_list_events",
        "description": (
            "Liest bevorstehende Termine aus dem persönlichen Baddi-Kalender des Users. "
            "Verwenden wenn der User nach Terminen, seinem Kalender, Arztbesuchen, "
            "Erinnerungen oder seinem Tagesplan fragt. "
            "Gibt Titel, Datum/Zeit, Ort und Beschreibung zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days_ahead": {
                    "type": "integer",
                    "description": "Wie viele Tage in die Zukunft schauen (Standard: 14, Max: 90).",
                    "default": 14,
                },
                "include_past": {
                    "type": "boolean",
                    "description": "Auch vergangene Termine der letzten 7 Tage einschliessen (Standard: false).",
                    "default": False,
                },
            },
            "required": [],
        },
    },
    {
        "name": "calendar_create_event",
        "description": (
            "Erstellt einen neuen Termin im persönlichen Baddi-Kalender des Users. "
            "Verwenden wenn der User einen Termin eintragen, eine Erinnerung setzen "
            "oder einen Kalendereintrag erstellen möchte. "
            "Datum/Zeit im Format 'YYYY-MM-DD HH:MM' angeben."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Titel des Termins, z.B. 'Zahnarzt Dr. Müller'.",
                },
                "start": {
                    "type": "string",
                    "description": "Startzeit im Format 'YYYY-MM-DD HH:MM', z.B. '2026-04-20 14:00'.",
                },
                "end": {
                    "type": "string",
                    "description": "Endzeit im Format 'YYYY-MM-DD HH:MM'. Falls nicht angegeben: 1 Stunde nach Start.",
                },
                "description": {
                    "type": "string",
                    "description": "Optionale Beschreibung oder Notizen zum Termin.",
                },
                "location": {
                    "type": "string",
                    "description": "Optionaler Ort des Termins, z.B. 'Praxis Musterstrasse 1, Zürich'.",
                },
                "all_day": {
                    "type": "boolean",
                    "description": "Ganztägiger Termin (Standard: false).",
                    "default": False,
                },
            },
            "required": ["title", "start"],
        },
    },
    {
        "name": "calendar_delete_event",
        "description": (
            "Löscht einen bestehenden Termin aus dem Baddi-Kalender des Users. "
            "Die uid erhält man aus calendar_list_events."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "uid": {
                    "type": "string",
                    "description": "UID des zu löschenden Termins (aus calendar_list_events).",
                },
            },
            "required": ["uid"],
        },
    },
]
