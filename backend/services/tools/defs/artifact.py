"""Tool-Definitionen für Artifact-Management: open_artifact, close_artifact, netzwerk_aktion."""
from __future__ import annotations

_ARTIFACT_TYPES = ["chart", "whiteboard", "netzwerk", "geo_map", "assistenz",
                   "design", "memory", "documents", "diktieren", "image_viewer", "timer"]

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
            "Für Timer/Countdown ODER Stoppuhr: artifact_type='timer' — WICHTIG: data.mode "
            "bestimmt ob Timer oder Stoppuhr! "
            "  • 'Stoppuhr', 'Stopwatch', 'Zeit stoppen' → data={mode: 'stopwatch', autostart: true} "
            "(zählt von 0 hoch, keine Dauer). "
            "  • 'Timer', 'Countdown', 'Erinnere mich in X Minuten', 'Wecker in X Min' → "
            "data={mode: 'timer', durationSeconds: <zahl>, autostart: true} (zählt von X runter). "
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
                        "  timer (STOPPUHR — zählt von 0 hoch): {mode: 'stopwatch', autostart: true}\n"
                        "  timer (COUNTDOWN — zählt von X Sek. runter): "
                        "{mode: 'timer', durationSeconds: <sekunden>, autostart: true} — "
                        "z.B. 12 Min = 720, 1 Stunde = 3600, 30 Sek = 30.\n"
                        "  WICHTIG: mode MUSS gesetzt werden, sonst ist unklar ob Stoppuhr oder Timer!\n"
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
            "  add_connection → persons=[Name1, Name2] (GENAU 2 Namen in der Liste!)."
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
                        "(Feld: persons=['Name1','Name2'] — GENAU 2 Namen angeben!)."
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
                    "description": "Liste von Personennamen (für create_network, add_to_network und add_connection)",
                },
                "label": {
                    "type": "string",
                    "description": (
                        "Art der Verbindung (NUR für add_connection). "
                        "Beispiele: 'Freund', 'Freundin', 'Kollege', 'Kollegin', 'Familie', 'Bekannter', 'Partner'."
                    ),
                },
            },
            "required": ["action_type"],
        },
    },
]
