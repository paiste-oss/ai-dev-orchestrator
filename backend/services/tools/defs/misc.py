"""Sonstige Tools: Training-Erinnerungen, Wetter."""
from __future__ import annotations

TRAINING_REMINDER_TOOL_DEFS = [
    {
        "name": "create_training_reminder",
        "description": (
            "Erstellt einen personalisierten Wochentrainingsplan und richtet automatische "
            "E-Mail-Erinnerungen ein. Der Nutzer wird per E-Mail erinnert bevor das Training beginnt."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "training_type": {"type": "string", "description": "Art des Trainings, z.B. 'Kraft', 'Cardio', 'Yoga', 'Laufen'"},
                "weekly_schedule": {
                    "type": "object",
                    "description": (
                        "Wochenplan als Objekt. Schlüssel = Wochentag auf Englisch (monday...sunday). "
                        "Wert = Objekt mit 'time' (HH:MM) und optionalem 'duration_minutes'. "
                        "Beispiel: {\"monday\": {\"time\": \"07:00\", \"duration_minutes\": 60}}"
                    ),
                },
                "reminder_minutes_before": {"type": "integer", "description": "Minuten vor Training für Erinnerung. Standard: 30", "default": 30},
                "email": {"type": "string", "description": "E-Mail für Erinnerungen. Leer = Kunden-E-Mail."},
                "timezone": {"type": "string", "description": "Zeitzone, z.B. 'Europe/Zurich'. Standard: Europe/Zurich", "default": "Europe/Zurich"},
            },
            "required": ["training_type", "weekly_schedule"],
        },
    },
    {
        "name": "list_training_reminders",
        "description": "Zeigt alle aktiven Trainingspläne und Erinnerungen des Nutzers.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "delete_training_reminder",
        "description": "Löscht einen bestehenden Trainingsplan anhand seiner ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reminder_id": {"type": "string", "description": "Die ID des Trainingsplans (aus list_training_reminders)"},
            },
            "required": ["reminder_id"],
        },
    },
]

WEATHER_TOOL_DEFS = [
    {
        "name": "get_current_weather",
        "description": (
            "Gibt das aktuelle Wetter für eine Stadt zurück. "
            "Gibt Temperatur, gefühlte Temperatur, Luftfeuchtigkeit, Wind, Bewölkung zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "Stadtname, z.B. 'Bern', 'Zürich', 'Berlin'"},
                "units": {"type": "string", "enum": ["metric", "imperial"], "description": "metric = °C (Standard), imperial = °F"},
                "lang": {"type": "string", "description": "Sprache, z.B. 'de' (Standard), 'en', 'fr'"},
            },
            "required": ["city"],
        },
    },
    {
        "name": "get_weather_forecast",
        "description": (
            "Gibt eine Wettervorhersage für die nächsten 1–5 Tage zurück. "
            "Gibt pro Tag: Wetterlage, Temperatur, Niederschlagswahrscheinlichkeit und Wind."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "Stadtname, z.B. 'Bern', 'Zürich'"},
                "days": {"type": "integer", "description": "Anzahl Tage (1–5). Standard: 3", "default": 3},
                "units": {"type": "string", "enum": ["metric", "imperial"], "description": "metric = °C (Standard)"},
                "lang": {"type": "string", "description": "Sprache, z.B. 'de' (Standard), 'en'"},
            },
            "required": ["city"],
        },
    },
]
