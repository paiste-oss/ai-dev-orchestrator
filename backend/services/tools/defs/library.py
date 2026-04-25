"""Tool-Definitionen für die persönliche Bibliothek (Literatur + Dokumente)."""
from __future__ import annotations

LIBRARY_TOOL_DEFS = [
    {
        "name": "library_search",
        "description": (
            "Durchsucht die persönliche Bibliothek des Nutzers (Literatur + Dokumente) "
            "via semantischer Suche. Nutze dieses Tool wenn der Nutzer nach spezifischer "
            "Literatur, Papern, Büchern, Patenten oder Dokumenten fragt, die NICHT bereits "
            "im aktuellen Kontext sichtbar sind. Liefert Treffer mit Snippet und ID — "
            "für Volltext anschliessend 'library_read' verwenden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Suchanfrage in natürlicher Sprache (z.B. 'Paper über Bayes-Statistik').",
                },
                "type": {
                    "type": "string",
                    "enum": ["paper", "book", "patent", "literature", "document", "all"],
                    "description": (
                        "Was durchsucht werden soll: paper/book/patent (nur dieser Literatur-Typ), "
                        "literature (alle Literatur-Typen), document (Datei-Dokumente), "
                        "all (alles zusammen). Default: all."
                    ),
                },
                "top_k": {
                    "type": "integer",
                    "description": "Anzahl Treffer (1-20). Default: 8.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "library_read",
        "description": (
            "Liest den vollen Inhalt eines Bibliotheks-Eintrags. Nutze dieses Tool nach "
            "'library_search' um in einem konkreten Treffer in die Tiefe zu gehen, oder "
            "wenn der Nutzer explizit nach dem Volltext eines bekannten Eintrags fragt."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "UUID des Eintrags — kommt aus library_search-Ergebnissen oder dem Auto-Kontext.",
                },
                "type": {
                    "type": "string",
                    "enum": ["literature", "document"],
                    "description": "Eintragstyp: literature (Paper/Buch/Patent) oder document (Datei).",
                },
            },
            "required": ["id", "type"],
        },
    },
    {
        "name": "library_recent",
        "description": (
            "Zeigt die zuletzt hinzugefügten Bibliotheks-Einträge. Nutze für Fragen wie "
            "'Was habe ich diese Woche gelesen?' oder 'Was ist neu in meiner Bibliothek?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Zeitraum in Tagen (1-90). Default: 7.",
                },
                "type": {
                    "type": "string",
                    "enum": ["paper", "book", "patent", "literature", "document", "all"],
                    "description": "Filter nach Typ. Default: all.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max. Anzahl Einträge (1-30). Default: 15.",
                },
            },
        },
    },
]
