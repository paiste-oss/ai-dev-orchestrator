"""Handler für Flugdaten-Tools via AviationStack API."""
from __future__ import annotations
import logging
from typing import Any
from datetime import datetime, timezone, date as _date

_log = logging.getLogger(__name__)

# Lazy-loaded airportsdata (7883 IATA-Codes mit Stadtname + Land)
_AIRPORTS_DB: dict | None = None

def _get_airports_db() -> dict:
    global _AIRPORTS_DB
    if _AIRPORTS_DB is None:
        try:
            import airportsdata
            _AIRPORTS_DB = airportsdata.load("IATA")
            _log.info("airportsdata geladen: %d Einträge", len(_AIRPORTS_DB))
        except Exception as e:
            _log.warning("airportsdata nicht verfügbar: %s", e)
            _AIRPORTS_DB = {}
    return _AIRPORTS_DB

# Deutschsprachige Überschreibungen für bekannte Flughäfen
_DE_OVERRIDES: dict[str, str] = {
    # Schweiz / DACH
    "ZRH": "Zürich", "GVA": "Genf", "BSL": "Basel",
    "FRA": "Frankfurt", "MUC": "München", "BER": "Berlin", "HAM": "Hamburg",
    "DUS": "Düsseldorf", "CGN": "Köln", "STR": "Stuttgart", "NUE": "Nürnberg",
    "VIE": "Wien", "GRZ": "Graz", "INN": "Innsbruck", "SZG": "Salzburg",
    # UK
    "LHR": "London Heathrow", "LGW": "London Gatwick",
    "LCY": "London City", "STN": "London Stansted", "LTN": "London Luton",
    "MAN": "Manchester", "EDI": "Edinburgh", "BHX": "Birmingham",
    # Frankreich
    "CDG": "Paris CDG", "ORY": "Paris Orly", "NCE": "Nizza", "LYS": "Lyon",
    # Benelux / Skandinavien
    "AMS": "Amsterdam", "BRU": "Brüssel",
    "CPH": "Kopenhagen", "OSL": "Oslo", "ARN": "Stockholm",
    "HEL": "Helsinki", "GOT": "Göteborg", "BGO": "Bergen",
    # Iberische Halbinsel
    "MAD": "Madrid", "BCN": "Barcelona", "LIS": "Lissabon",
    "VLC": "Valencia", "AGP": "Málaga", "PMI": "Mallorca",
    # Italien
    "FCO": "Rom", "MXP": "Mailand", "LIN": "Mailand City",
    "NAP": "Neapel", "VCE": "Venedig", "TRN": "Turin",
    "BRI": "Bari", "BDS": "Brindisi", "PMO": "Palermo", "CTA": "Catania",
    # Osteuropa / Balkan
    "VIE": "Wien",
    "PRG": "Prag", "BUD": "Budapest", "WAW": "Warschau", "KRK": "Krakau",
    "BEG": "Belgrad", "ZAG": "Zagreb", "LJU": "Ljubljana", "SKP": "Skopje",
    "PRN": "Pristina", "TGD": "Podgorica", "OHD": "Ohrid",
    "SOF": "Sofia", "OTP": "Bukarest", "CLJ": "Cluj-Napoca",
    "SKG": "Thessaloniki", "ATH": "Athen", "HER": "Heraklion", "RHO": "Rhodos",
    "CFU": "Korfu", "KGS": "Kos", "JMK": "Mykonos", "JTR": "Santorin",
    "KLX": "Kalamata",
    # Mittelmeer / Inseln
    "MLA": "Malta", "IBZ": "Ibiza", "GRO": "Girona",
    # Naher Osten / Afrika
    "DXB": "Dubai", "DOH": "Doha", "AUH": "Abu Dhabi",
    "IST": "Istanbul", "SAW": "Istanbul Sabiha",
    "CAI": "Kairo", "TUN": "Tunis", "CMN": "Casablanca", "RAK": "Marrakesch",
    "HRG": "Hurghada", "SSH": "Sharm el-Sheikh",
    # Nordamerika
    "JFK": "New York JFK", "EWR": "New York Newark",
    "LAX": "Los Angeles", "SFO": "San Francisco", "MIA": "Miami",
    "ORD": "Chicago", "BOS": "Boston", "YYZ": "Toronto",
    "IAD": "Washington", "DCA": "Washington DC", "ATL": "Atlanta",
    # Asien / Pazifik
    "SIN": "Singapur", "HKG": "Hongkong", "NRT": "Tokio", "HND": "Tokio Haneda",
    "PEK": "Peking", "PVG": "Shanghai", "BKK": "Bangkok",
    "KUL": "Kuala Lumpur", "MNL": "Manila",
    "SYD": "Sydney", "MEL": "Melbourne", "BNE": "Brisbane",
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


def _resolve_airport_name(iata: str | None, api_name: str | None) -> str:
    """
    Flughafenname in dieser Priorität:
    1. Deutsche Überschreibung (für bekannte Flughäfen)
    2. airportsdata Stadtname (7883 Einträge)
    3. AviationStack API-Name (falls vorhanden)
    4. IATA-Code als Fallback
    """
    if not iata:
        return "Unbekannt"
    code = iata.upper()

    # 1. Deutsche Überschreibung
    if code in _DE_OVERRIDES:
        return _DE_OVERRIDES[code]

    # 2. airportsdata → Stadtname (kürzer und lesbarer als Flughafenname)
    db = _get_airports_db()
    entry = db.get(code)
    if entry:
        city = (entry.get("city") or "").strip()
        if city:
            return city

    # 3. AviationStack API-Name bereinigen
    if api_name and api_name.strip() and api_name.strip().lower() not in ("null", "none", "unknown", ""):
        return api_name.strip()

    # 4. IATA-Code
    return code


def _fmt_time(iso: str | None) -> str | None:
    """ISO → 'HH:MM' (Lokalzeit des Flughafens wie von AviationStack geliefert)."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%H:%M")
    except Exception:
        return iso[:5] if len(iso) >= 5 else iso


def _calc_duration(dep_iso: str | None, arr_iso: str | None) -> int | None:
    """Flugdauer in Minuten — timezone-aware, daher keine Zeitumstellungs-Artefakte."""
    if not dep_iso or not arr_iso:
        return None
    try:
        dep_dt = datetime.fromisoformat(dep_iso.replace("Z", "+00:00"))
        arr_dt = datetime.fromisoformat(arr_iso.replace("Z", "+00:00"))
        mins = int((arr_dt - dep_dt).total_seconds() / 60)
        return mins if mins > 0 else None
    except Exception:
        return None


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
        "dep_airport": _resolve_airport_name(dep.get("iata"), dep.get("airport")),
        "dep_iata": dep.get("iata"),
        "dep_scheduled": _fmt_time(dep.get("scheduled")),
        "dep_actual": _fmt_time(dep.get("actual") or dep.get("estimated")),
        "dep_terminal": dep.get("terminal"),
        "dep_gate": dep.get("gate"),
        "dep_delay": delay_dep or 0,
        # Ankunft
        "arr_airport": _resolve_airport_name(arr.get("iata"), arr.get("airport")),
        "arr_iata": arr.get("iata"),
        "arr_scheduled": _fmt_time(arr.get("scheduled")),
        "arr_actual": _fmt_time(arr.get("actual") or arr.get("estimated")),
        "arr_terminal": arr.get("terminal"),
        "arr_gate": arr.get("gate"),
        "arr_delay": delay_arr or 0,
        # Relevante Verspätung je nach Boardtyp
        "delay": delay or 0,
        # Flugdauer in Minuten (timezone-aware, keine Zeitumstellungs-Artefakte)
        "duration_min": _calc_duration(dep.get("scheduled"), arr.get("scheduled")),
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
            # flight_date erzwingt den vollen Tagesplan inkl. bereits gestarteter Flüge
            "flight_date": _date.today().isoformat(),
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

        # Sortierung nach geplanter Abflugzeit aufsteigend (API-Reihenfolge ist nicht garantiert)
        flights.sort(key=lambda f: f["dep_scheduled"] or "99:99")

        return {
            "airport_iata": airport_iata,
            "airport_name": _resolve_airport_name(airport_iata, None),
            "board_type": board_type,
            "flights": flights,
            "total": len(flights),
            "flight_board": True,
        }

    return {"error": f"Unbekanntes Tool: {tool_name}"}
