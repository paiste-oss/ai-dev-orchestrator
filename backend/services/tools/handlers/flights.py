"""Handler für Flugdaten-Tools via AviationStack API."""
from __future__ import annotations
import logging
from typing import Any
from datetime import datetime, timezone

_log = logging.getLogger(__name__)

# Bekannte Flughafennamen (IATA → Name) für saubere Anzeige
_AIRPORT_NAMES: dict[str, str] = {
    "ZRH": "Zürich", "GVA": "Genf", "BSL": "Basel-Mülhausen",
    "FRA": "Frankfurt", "MUC": "München", "BER": "Berlin", "HAM": "Hamburg",
    "VIE": "Wien", "ZRH": "Zürich", "LHR": "London Heathrow", "LGW": "London Gatwick",
    "CDG": "Paris Charles de Gaulle", "ORY": "Paris Orly",
    "AMS": "Amsterdam", "BRU": "Brüssel", "MAD": "Madrid", "BCN": "Barcelona",
    "FCO": "Rom Fiumicino", "MXP": "Mailand Malpensa", "LIN": "Mailand Linate",
    "DXB": "Dubai", "DOH": "Doha", "IST": "Istanbul", "ATH": "Athen",
    "JFK": "New York JFK", "EWR": "New York Newark", "LAX": "Los Angeles",
    "SFO": "San Francisco", "ORD": "Chicago O'Hare", "MIA": "Miami",
    "SIN": "Singapur", "HKG": "Hongkong", "NRT": "Tokio Narita",
    "SYD": "Sydney", "MEL": "Melbourne",
}

_STATUS_LABELS: dict[str, str] = {
    "scheduled": "Geplant",
    "active": "Im Flug",
    "landed": "Gelandet",
    "cancelled": "Gestrichen",
    "incident": "Vorfall",
    "diverted": "Umgeleitet",
    "unknown": "Unbekannt",
}


def _airport_name(iata: str | None) -> str:
    if not iata:
        return "Unbekannt"
    return _AIRPORT_NAMES.get(iata.upper(), iata.upper())


def _fmt_time(iso: str | None) -> str | None:
    """ISO → 'HH:MM', None wenn nicht vorhanden."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%H:%M")
    except Exception:
        return iso[:5] if len(iso) >= 5 else iso


def _parse_flight(f: dict, board_type: str) -> dict:
    dep = f.get("departure") or {}
    arr = f.get("arrival") or {}
    flight_info = f.get("flight") or {}
    airline_info = f.get("airline") or {}

    delay_dep = dep.get("delay") or 0
    delay_arr = arr.get("delay") or 0
    delay = delay_dep if board_type == "departure" else delay_arr

    return {
        "flight_number": flight_info.get("iata") or flight_info.get("number") or "—",
        "airline": airline_info.get("name") or "Unbekannt",
        "status": _STATUS_LABELS.get(f.get("flight_status", "unknown"), f.get("flight_status", "—")),
        "status_raw": f.get("flight_status", "unknown"),
        # Abflug
        "dep_airport": _airport_name(dep.get("iata")),
        "dep_iata": dep.get("iata"),
        "dep_scheduled": _fmt_time(dep.get("scheduled")),
        "dep_actual": _fmt_time(dep.get("actual") or dep.get("estimated")),
        "dep_terminal": dep.get("terminal"),
        "dep_gate": dep.get("gate"),
        "dep_delay": delay_dep or 0,
        # Ankunft
        "arr_airport": _airport_name(arr.get("iata")),
        "arr_iata": arr.get("iata"),
        "arr_scheduled": _fmt_time(arr.get("scheduled")),
        "arr_actual": _fmt_time(arr.get("actual") or arr.get("estimated")),
        "arr_terminal": arr.get("terminal"),
        "arr_gate": arr.get("gate"),
        "arr_delay": delay_arr or 0,
        # Relevante Verspätung je nach Boardtyp
        "delay": delay or 0,
    }


async def _handle_flights(tool_name: str, tool_input: dict) -> Any:
    import httpx
    from core.config import settings

    api_key = getattr(settings, "AVIATIONSTACK_API_KEY", "")
    if not api_key:
        return {"error": "AVIATIONSTACK_API_KEY nicht konfiguriert. Bitte in der .env setzen."}

    # AviationStack free tier nutzt HTTP
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
                _log.error("AviationStack Fehler %s: %s", r.status_code, r.text[:200])
                return {"error": f"AviationStack Fehler {r.status_code}"}
        except Exception as e:
            _log.error("AviationStack Verbindungsfehler: %s", e)
            return {"error": f"Verbindungsfehler: {e}"}

        data = r.json()
        flights = (data.get("data") or [])[:5]
        if not flights:
            return {"error": f"Flug '{flight_iata}' nicht gefunden oder keine aktuellen Daten"}

        results = [_parse_flight(f, "departure") for f in flights]
        return {
            "query": flight_iata,
            "flights": results,
            "flight_board": True,
        }

    # ── airport_board: Abflug-/Ankunftstafel eines Flughafens ───────────────
    if tool_name == "airport_board":
        airport_iata = (tool_input.get("airport_iata") or "").strip().upper()
        board_type = tool_input.get("board_type", "departure")
        limit = min(int(tool_input.get("limit", 20)), 50)

        if not airport_iata:
            return {"error": "Flughafen-Code fehlt"}

        params = {
            "access_key": api_key,
            "limit": limit,
            "offset": 0,
        }
        if board_type == "departure":
            params["dep_iata"] = airport_iata
        else:
            params["arr_iata"] = airport_iata

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(f"{base}/flights", params=params)
            if not r.is_success:
                _log.error("AviationStack Fehler %s: %s", r.status_code, r.text[:200])
                return {"error": f"AviationStack Fehler {r.status_code}"}
        except Exception as e:
            _log.error("AviationStack Verbindungsfehler: %s", e)
            return {"error": f"Verbindungsfehler: {e}"}

        data = r.json()
        flights_raw = data.get("data") or []
        flights = [_parse_flight(f, board_type) for f in flights_raw]

        return {
            "airport_iata": airport_iata,
            "airport_name": _airport_name(airport_iata),
            "board_type": board_type,
            "flights": flights,
            "total": len(flights),
            "flight_board": True,
        }

    return {"error": f"Unbekanntes Tool: {tool_name}"}
