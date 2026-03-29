"""Handler für Schweizer Geodaten — geocodiert via api3.geo.admin.ch."""
from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger(__name__)

_LAYER_MAP = {
    "karte":    "ch.swisstopo.pixelkarte-farbe",
    "luftbild": "ch.swisstopo.swissimage",
    "grau":     "ch.swisstopo.pixelkarte-grau",
}


async def _handle_geo_map(tool_name: str, tool_input: dict) -> Any:
    if tool_name != "open_swiss_map":
        return {"error": f"Unbekanntes Geo-Tool: {tool_name}"}

    location: str = tool_input.get("location", "").strip()
    zoom: int = int(tool_input.get("zoom") or 8)
    layer_key: str = tool_input.get("layer", "karte")

    if not location:
        return {"error": "Kein Ort angegeben."}

    zoom = max(1, min(12, zoom))
    bg_layer = _LAYER_MAP.get(layer_key, _LAYER_MAP["karte"])

    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://api3.geo.admin.ch/rest/services/api/SearchServer",
                params={
                    "searchText": location,
                    "type": "locations",
                    "limit": 1,
                    "lang": "de",
                    "sr": "2056",  # LV95 — für map.geo.admin.ch benötigt
                },
                headers={"User-Agent": "Baddi/1.0 (admin@baddi.ch)"},
            )
        if not r.is_success:
            return {"error": f"Geo-API nicht erreichbar (HTTP {r.status_code})"}

        results = r.json().get("results", [])
        if not results:
            return {"error": f"Ort '{location}' in der Schweiz nicht gefunden. Versuche eine genauere Adresse."}

        attrs = results[0].get("attrs", {})
        # LV95 Koordinaten (E = x, N = y)
        east = attrs.get("x")   # LV95 Easting
        north = attrs.get("y")  # LV95 Northing
        label = attrs.get("label", location)

        if not east or not north:
            return {"error": f"Koordinaten für '{location}' nicht verfügbar."}

        east = int(east)
        north = int(north)

        # Marker für Frontend — Format: E,N,zoom,bgLayer
        marker = f"[FENSTER: geo_map | {east},{north},{zoom},{bg_layer}]"

        _log.info("Geo-Map: %s → E=%d N=%d zoom=%d", location, east, north, zoom)

        return {
            "success": True,
            "location": label,
            "east_lv95": east,
            "north_lv95": north,
            "zoom": zoom,
            "marker": marker,
            "message": f"Karte für «{label}» geöffnet.",
        }

    except Exception as e:
        _log.error("Geo-Map Fehler: %s", e)
        return {"error": f"Geodienst nicht verfügbar: {e}"}
