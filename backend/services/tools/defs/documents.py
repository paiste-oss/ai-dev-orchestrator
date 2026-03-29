"""Tool-Definitionen für die lokale Dokumentensuche."""
from __future__ import annotations

DOCUMENT_SEARCH_TOOL_DEFS = [
    {
        "name": "search_documents",
        "description": (
            "Durchsucht alle hochgeladenen Dokumente des Nutzers nach einem Suchbegriff. "
            "Findet Treffer in Dateiinhalt, Dateiname und Metadaten. "
            "Nutze dieses Tool wenn der Nutzer etwas in seinen Dokumenten sucht, "
            "nach Informationen aus einer Datei fragt oder wissen will, ob ein bestimmtes Dokument vorhanden ist."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "search_query": {
                    "type": "string",
                    "description": "Suchbegriff oder Phrase die in den Dokumenten gesucht wird",
                },
                "document_type": {
                    "type": "string",
                    "description": "Optional: Filter nach Dateityp, z.B. 'pdf', 'docx', 'xlsx', 'txt', 'csv'",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximale Anzahl Ergebnisse (Standard: 5, max: 10)",
                    "default": 5,
                },
            },
            "required": ["search_query"],
        },
    },
    {
        "name": "list_documents",
        "description": (
            "Listet alle hochgeladenen Dokumente des Nutzers auf. "
            "Zeigt Dateiname, Typ, Grösse und Datum. "
            "Nutze dieses Tool wenn der Nutzer fragt welche Dateien vorhanden sind."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "document_type": {
                    "type": "string",
                    "description": "Optional: Filter nach Dateityp, z.B. 'pdf', 'docx'",
                },
            },
        },
    },
]
