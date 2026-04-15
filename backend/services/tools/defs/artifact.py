"""Tool-Definitionen für Artifact-Management: open_artifact, close_artifact, netzwerk_aktion."""
from __future__ import annotations

_ARTIFACT_TYPES = ["chart", "whiteboard", "netzwerk", "geo_map", "assistenz",
                   "design", "memory", "documents", "diktieren", "image_viewer"]

ARTIFACT_TOOL_DEFS = [
    {
        "name": "open_artifact",
        "description": (
            "Öffnet ein Artifact-Fenster im Canvas-Panel rechts. "
            "Nutze dieses Tool IMMER wenn du ein Fenster öffnen möchtest. "
            "Schreibe NIEMALS [FENSTER:]-Marker in den Text — nutze stattdessen dieses Tool. "
            "Für Assistenz-Anfragen (Anmeldungen, Formulare, Behörden): artifact_type='assistenz'. "
            "Für Aktien/Charts: artifact_type='chart'. "
            "Für Karten/Orte: artifact_type='geo_map'. "
            "Für Whiteboard, Namensnetz, Design etc.: jeweiligen artifact_type wählen."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "artifact_type": {
                    "type": "string",
                    "enum": _ARTIFACT_TYPES,
                    "description": "Typ des zu öffnenden Fensters",
                },
                "title": {
                    "type": "string",
                    "description": "Kurzer Titel für den Tab, z.B. 'Apple Aktie' oder 'IV Anmeldung'",
                },
                "data": {
                    "type": "object",
                    "description": (
                        "Typ-spezifische Daten (alle optional):\n"
                        "  chart:     {symbols: ['AAPL', 'NESN.SW'], period: '1y'}\n"
                        "  geo_map:   {east: 2600000, north: 1200000, zoom: 8, "
                        "bgLayer: 'ch.swisstopo.pixelkarte-farbe'}\n"
                        "  assistenz: {url: 'https://...', goal: 'Was der Nutzer erreichen möchte'}\n"
                        "  alle anderen: {} (leer lassen)"
                    ),
                },
            },
            "required": ["artifact_type", "title"],
        },
    },
    {
        "name": "close_artifact",
        "description": (
            "Schließt ein Artifact-Fenster im Canvas-Panel. "
            "Nutze dieses Tool statt [FENSTER_SCHLIESSEN:]-Marker."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "artifact_type": {
                    "type": "string",
                    "enum": _ARTIFACT_TYPES,
                    "description": "Typ des zu schließenden Fensters",
                },
            },
            "required": ["artifact_type"],
        },
    },
    {
        "name": "netzwerk_aktion",
        "description": (
            "Verwaltet das persönliche Namensnetz (Personen, Gruppen, Verbindungen). "
            "Nutze dieses Tool wenn der Nutzer Personen hinzufügen, Gruppen erstellen, "
            "Personen zu Gruppen hinzufügen oder Verbindungen zwischen Personen erstellen möchte. "
            "Schreibe NIEMALS [NETZWERK_AKTION:]-Marker — nutze immer dieses Tool. "
            "WICHTIG Feldzuordnung: "
            "  add_person → name=Personenname. "
            "  create_network → name=Gruppenname, persons=[Personenliste]. "
            "  add_to_network → network=Gruppenname, persons=[Personenliste]. "
            "  add_connection → person_a=Name1, person_b=Name2."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action_type": {
                    "type": "string",
                    "enum": ["add_person", "create_network", "add_to_network", "add_connection"],
                    "description": (
                        "add_person: Einzelne Person hinzufügen (Feld: name). "
                        "create_network: Neue Gruppe erstellen, optional mit Personen (Felder: name, persons). "
                        "add_to_network: Person(en) zu einer bestehenden oder neuen Gruppe hinzufügen "
                        "(Felder: network=Gruppenname, persons=Personenliste). "
                        "add_connection: Verbindungslinie zwischen zwei Personen erstellen "
                        "(Felder: person_a, person_b)."
                    ),
                },
                "name": {
                    "type": "string",
                    "description": "Name der Person (add_person) oder der Gruppe (create_network). NICHT für add_to_network verwenden.",
                },
                "network": {
                    "type": "string",
                    "description": "Name der Ziel-Gruppe (NUR für add_to_network). Beispiel: 'Haslen'",
                },
                "persons": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Liste von Personennamen (für create_network und add_to_network)",
                },
                "person_a": {
                    "type": "string",
                    "description": "PFLICHTFELD bei add_connection: Name der ersten Person. Beispiel: 'Roman'",
                },
                "person_b": {
                    "type": "string",
                    "description": "PFLICHTFELD bei add_connection: Name der zweiten Person. Beispiel: 'Iren'",
                },
            },
            "required": ["action_type"],
        },
    },
]
