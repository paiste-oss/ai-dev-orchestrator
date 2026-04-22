"""
Handler für Flugdaten-Tools.

Datenquellen (Hybrid-Ansatz):
  • OpenSky Network  — kostenlos, kein Key — liefert bereits gestartete Flüge des Tages
  • AviationStack    — Free-Tier (100 req/Mt) — liefert aktuelle/kommende Flüge mit Gate-Info

Beide Quellen werden zusammengeführt und nach Abflugzeit sortiert.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any
from datetime import datetime, timezone

from .flights_data import (
    _get_airports_db,
    _parse_flight,
    _opensky_to_entry,
    _resolve_airport_name,
)

_log = logging.getLogger(__name__)


# ── OpenSky Network ───────────────────────────────────────────────────────────

async def _fetch_opensky_past_flights(airport_icao: str, board_type: str) -> list[dict]:
    """
    Holt bereits gestartete/angekommene Flüge des heutigen Tages von OpenSky.
    Kein API-Key nötig. Gibt [] zurück bei Fehler (nie raise).
    OpenSky hat ~1h Verarbeitungsverzögerung.
    """
    import httpx

    now_utc = datetime.now(timezone.utc)
    today_midnight = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    end_time = now_utc

    if end_time <= today_midnight:
        _log.info("OpenSky: zu früh am Tag, keine vergangenen Daten")
        return []

    begin_ts = int(today_midnight.timestamp())
    end_ts = int(end_time.timestamp())
    endpoint = "departure" if board_type == "departure" else "arrival"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://opensky-network.org/api/flights/{endpoint}",
                params={"airport": airport_icao, "begin": begin_ts, "end": end_ts},
            )
        if r.is_success:
            data = r.json() or []
            _log.info("OpenSky %s %s: %d Flüge", endpoint, airport_icao, len(data))
            return data
        _log.warning("OpenSky %s: %s", r.status_code, r.text[:120])
    except Exception as e:
        _log.warning("OpenSky nicht erreichbar (%s): %s", airport_icao, e)
    return []


# ── Haupt-Handler ─────────────────────────────────────────────────────────────

async def _handle_flights(tool_name: str, tool_input: dict) -> Any:
    import httpx
    from core.config import settings

    api_key = getattr(settings, "AVIATIONSTACK_API_KEY", "")
    if not api_key:
        return {"error": "AVIATIONSTACK_API_KEY nicht konfiguriert. Bitte in der .env setzen."}

    base = "http://api.aviationstack.com/v1"

    # ── flight_status: einzelner Flug nach IATA-Nummer ───────────────────────
    if tool_name == "flight_status":
        flight_iata = (tool_input.get("flight_iata") or "").strip().upper()
        if not flight_iata:
            return {"error": "Flugnummer fehlt"}

        params: dict[str, Any] = {"access_key": api_key, "flight_iata": flight_iata}
        if tool_input.get("date"):
            params["flight_date"] = tool_input["date"]

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(f"{base}/flights", params=params)
            if not r.is_success:
                return {"error": f"AviationStack Fehler {r.status_code}"}
        except Exception as e:
            return {"error": f"Verbindungsfehler: {e}"}

        flights = (r.json().get("data") or [])[:5]
        if not flights:
            return {"error": f"Flug '{flight_iata}' nicht gefunden"}

        return {
            "query": flight_iata,
            "flights": [_parse_flight(f, "departure") for f in flights],
            "flight_board": True,
        }

    # ── airport_board: Abflug-/Ankunftstafel mit Hybrid-Daten ───────────────
    if tool_name == "airport_board":
        airport_iata = (tool_input.get("airport_iata") or "").strip().upper()
        board_type = tool_input.get("board_type", "departure")
        limit = min(int(tool_input.get("limit", 20)), 50)

        if not airport_iata:
            return {"error": "Flughafen-Code fehlt"}

        airport_entry = _get_airports_db().get(airport_iata, {})
        airport_icao: str | None = airport_entry.get("icao")
        airport_tz: str = airport_entry.get("tz") or "UTC"

        avstack_params: dict[str, Any] = {
            "access_key": api_key,
            "limit": limit,
            "offset": 0,
        }
        if board_type == "departure":
            avstack_params["dep_iata"] = airport_iata
        else:
            avstack_params["arr_iata"] = airport_iata

        async def _avstack() -> Any:
            async with httpx.AsyncClient(timeout=15) as cl:
                return await cl.get(f"{base}/flights", params=avstack_params)

        async def _opensky() -> list[dict]:
            if not airport_icao:
                return []
            return await _fetch_opensky_past_flights(airport_icao, board_type)

        try:
            avstack_resp, opensky_raw = await asyncio.gather(_avstack(), _opensky())
        except Exception as e:
            _log.error("Verbindungsfehler: %s", e)
            return {"error": f"Verbindungsfehler: {e}"}

        if not avstack_resp.is_success:
            _log.error("AviationStack Fehler %s: %s", avstack_resp.status_code, avstack_resp.text[:200])
            return {"error": f"AviationStack Fehler {avstack_resp.status_code}"}

        avstack_flights = [
            _parse_flight(f, board_type)
            for f in (avstack_resp.json().get("data") or [])
        ]
        known = {f["flight_number"] for f in avstack_flights if f["flight_number"] != "—"}

        opensky_flights = []
        for raw in (opensky_raw or []):
            entry = _opensky_to_entry(raw, board_type, airport_tz)
            if entry["flight_number"] not in known and entry["dep_scheduled"]:
                opensky_flights.append(entry)

        _log.info(
            "Flugplan %s %s: %d AviationStack + %d OpenSky = %d total",
            airport_iata, board_type,
            len(avstack_flights), len(opensky_flights),
            len(avstack_flights) + len(opensky_flights),
        )

        all_flights = opensky_flights + avstack_flights
        all_flights.sort(key=lambda f: f["dep_scheduled"] or "99:99")

        return {
            "airport_iata": airport_iata,
            "airport_name": _resolve_airport_name(airport_iata, None),
            "board_type": board_type,
            "flights": all_flights,
            "total": len(all_flights),
            "flight_board": True,
        }

    return {"error": f"Unbekanntes Tool: {tool_name}"}
