"""Flugdaten Tool-Definitionen — AviationStack API."""
from __future__ import annotations

FLIGHT_TOOL_DEFS = [
    {
        "name": "flight_status",
        "description": (
            "PFLICHT wenn nach einem bestimmten Flug gefragt wird. "
            "Ruft den aktuellen Echtzeit-Status eines Fluges ab: Gate, Terminal, "
            "planmässige und tatsächliche Abflug-/Ankunftszeit, Verspätung und Flugstatus. "
            "Verwende die IATA-Flugnummer, z.B. 'LX123' oder 'LH456'. "
            "NIEMALS Flugdaten aus dem Training verwenden — immer dieses Tool aufrufen!"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "flight_iata": {
                    "type": "string",
                    "description": "IATA-Flugnummer, z.B. 'LX123', 'LH456', 'EZY1234'. Grossbuchstaben bevorzugt.",
                },
                "date": {
                    "type": "string",
                    "description": "Datum YYYY-MM-DD (optional, Standard = heute).",
                },
            },
            "required": ["flight_iata"],
        },
    },
    {
        "name": "airport_board",
        "description": (
            "PFLICHT bei allen Fragen zu Flügen, Abflügen, Ankünften, Gates oder Verspätungen. "
            "Zeigt die Abflugs- oder Ankunftstafel eines Flughafens in Echtzeit via AviationStack API. "
            "Gibt Flugnummer, Airline, Ziel/Herkunft, Gate, Terminal, Abflugzeit und Verspätung zurück. "
            "Öffnet automatisch das Flugplan-Fenster. "
            "Beispiel: 'Flüge ab Zürich nach London' → airport_board(airport_iata='ZRH', board_type='departure'). "
            "NIEMALS Flugdaten aus dem Training verwenden — immer dieses Tool aufrufen!"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "airport_iata": {
                    "type": "string",
                    "description": "IATA-Code des Flughafens, z.B. 'ZRH', 'GVA', 'BSL', 'FRA', 'LHR', 'CDG'.",
                },
                "board_type": {
                    "type": "string",
                    "enum": ["departure", "arrival"],
                    "description": "Abflüge ('departure') oder Ankünfte ('arrival'). Standard: departure.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Anzahl Flüge (5-50). Standard: 20.",
                    "default": 20,
                },
            },
            "required": ["airport_iata"],
        },
    },
]
