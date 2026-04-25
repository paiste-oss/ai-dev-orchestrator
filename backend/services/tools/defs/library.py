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
                    "enum": ["paper", "book", "patent", "norm", "law", "regulatory", "manual", "literature", "document", "all"],
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
        "name": "literature_global_search",
        "description": (
            "Durchsucht den GLOBALEN Wissenspool (Crossref/Unpaywall-Anreicherung aller "
            "Baddi-Nutzer-Bibliotheken) via Volltext-Suche auf Titel + Abstract. "
            "Nutze dieses Tool wenn der Nutzer nach Papern fragt, die NICHT in seiner "
            "eigenen Bibliothek sind, oder wenn 'library_search' nichts gefunden hat. "
            "Resultate enthalten DOI, Titel, Autoren, Jahr, Journal, Abstract und ein "
            "Flag 'in_my_library' das anzeigt ob der Nutzer das Paper schon hat. "
            "Bei Open-Access-Papern (oa_url gesetzt) gibt es einen direkten PDF-Link."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Suchbegriff (Titel-Wörter oder Abstract-Konzepte).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max. Anzahl Treffer (1-50). Default: 10.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "literature_get_by_doi",
        "description": (
            "Holt vollständige Metadaten zu einem Paper anhand der DOI. Nutze "
            "dieses Tool wenn der Nutzer eine konkrete DOI nennt oder wenn aus "
            "'literature_global_search' eine Detailansicht eines Treffers gewünscht "
            "ist. Bei unbekannter DOI wird sie on-demand bei Crossref/Unpaywall "
            "abgefragt (kann ~10s dauern)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doi": {
                    "type": "string",
                    "description": "DOI im Format '10.xxxx/yyy' — mit oder ohne https://doi.org/ Prefix.",
                },
            },
            "required": ["doi"],
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
                    "enum": ["paper", "book", "patent", "norm", "law", "regulatory", "manual", "literature", "document", "all"],
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
