"""SBB / Schweizer ÖV Tool-Definitionen."""
from __future__ import annotations

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
                "query": {"type": "string", "description": "Haltestellenname oder Ort, z.B. 'Zürich HB', 'Bern Bahnhof'"},
                "type": {"type": "string", "enum": ["station", "poi", "address", "all"], "description": "Typ des Orts. Standard: station"},
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
                "station": {"type": "string", "description": "Haltestellenname oder ID, z.B. '8503000' oder 'Zürich HB'"},
                "limit": {"type": "integer", "description": "Anzahl Abfahrten, Standard 10", "default": 10},
                "type": {"type": "string", "enum": ["departure", "arrival"], "description": "Abfahrten oder Ankünfte. Standard: departure"},
                "transportation": {"type": "string", "enum": ["train", "tram", "bus", "ship", "cableway"], "description": "Optional: nur dieses Verkehrsmittel"},
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
                "from_station": {"type": "string", "description": "Abgangsort, z.B. 'Bern'"},
                "to_station": {"type": "string", "description": "Zielort, z.B. 'Zürich HB'"},
                "date": {"type": "string", "description": "Datum YYYY-MM-DD. Leer = heute"},
                "time": {"type": "string", "description": "Uhrzeit HH:MM. Leer = jetzt"},
                "is_arrival_time": {"type": "boolean", "description": "True wenn 'time' die gewünschte Ankunftszeit ist", "default": False},
                "limit": {"type": "integer", "description": "Anzahl Verbindungen (1-16). Standard: 4", "default": 4},
            },
            "required": ["from_station", "to_station"],
        },
    },
]
