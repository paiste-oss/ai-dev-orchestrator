"""Tool-Definitionen für Schweizer Geodaten (geo.admin.ch)."""

GEO_MAP_TOOL_DEFS = [
    {
        "name": "open_swiss_map",
        "description": (
            "Öffnet eine interaktive Schweizer Karte (swisstopo / map.geo.admin.ch) "
            "für einen Ort, eine Adresse oder eine Gemeinde in der Schweiz. "
            "Nutze dieses Tool wenn der User einen Ort auf der Karte sehen möchte, "
            "nach Parzellen fragt, eine Adresse sucht oder geografische Informationen braucht."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "Ort, Adresse oder Gemeinde in der Schweiz, z.B. 'Bern', 'Bahnhofstrasse 1 Zürich', 'Gemeinde Davos'",
                },
                "zoom": {
                    "type": "integer",
                    "description": "Zoom-Stufe 1–12 (Standard: 8 für Gemeinde, 10 für Strasse, 12 für Parzelle)",
                    "default": 8,
                },
                "layer": {
                    "type": "string",
                    "enum": ["karte", "luftbild", "grau"],
                    "description": "Kartenstil: 'karte' (farbige Landeskarte), 'luftbild' (Swissimage), 'grau' (Graukarte). Standard: karte",
                    "default": "karte",
                },
            },
            "required": ["location"],
        },
    },
]
