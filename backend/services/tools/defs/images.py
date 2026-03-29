"""Bild-Tools: DALL-E 3, Unsplash."""
from __future__ import annotations

DALLE_TOOL_DEFS = [
    {
        "name": "generate_image",
        "description": (
            "Erstellt ein Bild basierend auf einer Textbeschreibung mit DALL-E 3. "
            "Nutze dieses Tool wenn der Nutzer ein Bild erstellt, gezeichnet oder generiert haben möchte. "
            "Gibt die URL des generierten Bildes zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Detaillierte Bildbeschreibung auf Englisch für beste Ergebnisse"},
                "size": {"type": "string", "enum": ["1024x1024", "1792x1024", "1024x1792"], "description": "Bildgrösse. Standard: 1024x1024 (quadratisch)"},
                "quality": {"type": "string", "enum": ["standard", "hd"], "description": "standard = schnell, hd = mehr Detail"},
            },
            "required": ["prompt"],
        },
    },
]

UNSPLASH_TOOL_DEFS = [
    {
        "name": "search_image",
        "description": (
            "Sucht echte Fotos und Bilder aus dem Internet via Unsplash. "
            "Nutze dieses Tool wenn der Nutzer ein Bild, Foto oder eine Aufnahme "
            "aus dem Internet sehen möchte. "
            "Gibt direkte Bild-URLs zurück die im Chat angezeigt werden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Suchanfrage auf Englisch, z.B. 'sheep', 'Zurich city'"},
                "count": {"type": "integer", "description": "Anzahl Bilder (1-3). Standard: 1", "default": 1},
            },
            "required": ["query"],
        },
    },
]
