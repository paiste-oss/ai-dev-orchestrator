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
import re
from typing import Any
from datetime import datetime, timezone, timedelta

_log = logging.getLogger(__name__)


# ── airportsdata (IATA-keyed, lazy) ──────────────────────────────────────────

_AIRPORTS_DB: dict | None = None

def _get_airports_db() -> dict:
    global _AIRPORTS_DB
    if _AIRPORTS_DB is None:
        try:
            import airportsdata
            _AIRPORTS_DB = airportsdata.load("IATA")
        except Exception as e:
            _log.warning("airportsdata IATA nicht verfügbar: %s", e)
            _AIRPORTS_DB = {}
    return _AIRPORTS_DB


# ── airportsdata (ICAO-keyed, lazy) — für OpenSky ICAO → IATA Mapping ───────

_ICAO_AIRPORT_DB: dict | None = None

def _get_icao_airport_db() -> dict:
    global _ICAO_AIRPORT_DB
    if _ICAO_AIRPORT_DB is None:
        try:
            import airportsdata
            _ICAO_AIRPORT_DB = airportsdata.load("ICAO")
        except Exception as e:
            _log.warning("airportsdata ICAO nicht verfügbar: %s", e)
            _ICAO_AIRPORT_DB = {}
    return _ICAO_AIRPORT_DB


def _icao_airport_to_iata(icao: str | None) -> str | None:
    """ICAO Flughafen-Code → IATA Code (z.B. LSZH → ZRH)."""
    if not icao:
        return None
    entry = _get_icao_airport_db().get(icao.upper())
    return (entry.get("iata") or None) if entry else None


# ── Airline-Lookup-Tabellen (ICAO 3-Letter) ───────────────────────────────────

# ICAO-Airline-Code → IATA-Airline-Code (für Flugnummer-Rekonstruktion)
_ICAO_TO_IATA_AIRLINE: dict[str, str] = {
    "SWR": "LX",  "DLH": "LH",  "EZY": "U2",  "EJU": "U2",
    "BAW": "BA",  "AFR": "AF",  "KLM": "KL",  "IBE": "IB",
    "VLG": "VY",  "RYR": "FR",  "AEE": "A3",  "AUA": "OS",
    "BEL": "SN",  "SAS": "SK",  "FIN": "AY",  "TAP": "TP",
    "EWG": "EW",  "UAE": "EK",  "THY": "TK",  "QTR": "QR",
    "ETD": "EY",  "HLF": "2L",  "EDW": "WK",  "AZA": "AZ",
    "CSN": "CZ",  "CCA": "CA",  "UAL": "UA",  "AAL": "AA",
    "DAL": "DL",  "ACA": "AC",  "SIA": "SQ",  "CPA": "CX",
    "JAL": "JL",  "ANZ": "NZ",  "ANA": "NH",  "CSA": "OK",
    "LOT": "LO",  "ROT": "RO",  "BTI": "BT",  "WZZ": "W6",
    "TVS": "U6",  "SDM": "FV",  "AFL": "SU",  "AZS": "ZF",
    "BMS": "KF",  "TOM": "BY",  "TFW": "X3",  "TGW": "X3",
    "SXD": "SR",  "GWI": "4U",  "CFG": "DE",  "FLB": "F7",
    "GAO": "GP",  "THA": "TG",  "MAS": "MH",  "GIA": "GA",
    "PAL": "PR",  "SVA": "SV",  "MSR": "MS",  "ETH": "ET",
    "KQA": "KQ",  "RAM": "AT",  "TUN": "TU",
}

# ICAO-Airline-Code → Airline-Name (Deutsch/International)
_ICAO_AIRLINE_NAMES: dict[str, str] = {
    "SWR": "SWISS",              "DLH": "Lufthansa",
    "EZY": "easyJet",            "EJU": "easyJet",
    "BAW": "British Airways",    "AFR": "Air France",
    "KLM": "KLM",                "IBE": "Iberia",
    "VLG": "Vueling",            "RYR": "Ryanair",
    "AEE": "Aegean Airlines",    "AUA": "Austrian Airlines",
    "BEL": "Brussels Airlines",  "SAS": "SAS",
    "FIN": "Finnair",            "TAP": "TAP Air Portugal",
    "EWG": "Eurowings",          "UAE": "Emirates",
    "THY": "Turkish Airlines",   "QTR": "Qatar Airways",
    "ETD": "Etihad Airways",     "HLF": "Helvetic Airways",
    "EDW": "Edelweiss Air",      "AZA": "ITA Airways",
    "CSN": "China Southern",     "CCA": "Air China",
    "UAL": "United Airlines",    "AAL": "American Airlines",
    "DAL": "Delta",              "ACA": "Air Canada",
    "SIA": "Singapore Airlines", "CPA": "Cathay Pacific",
    "JAL": "Japan Airlines",     "ANZ": "Air New Zealand",
    "ANA": "All Nippon Airways", "CSA": "Czech Airlines",
    "LOT": "LOT Polish",         "ROT": "TAROM",
    "BTI": "airBaltic",          "WZZ": "Wizz Air",
    "GWI": "Germanwings",        "CFG": "Condor",
    "TOM": "TUI Airways",        "TFW": "TUI fly",
    "AFL": "Aeroflot",           "SVA": "Saudia",
    "MSR": "EgyptAir",           "ETH": "Ethiopian Airlines",
    "KQA": "Kenya Airways",      "RAM": "Royal Air Maroc",
    "THA": "Thai Airways",       "MAS": "Malaysia Airlines",
    "GIA": "Garuda Indonesia",   "PAL": "Philippine Airlines",
}


# ── Deutschsprachige Stadtname-Überschreibungen ───────────────────────────────

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
    "active":    "Im Flug",
    "landed":    "Gelandet",
    "cancelled": "Gestrichen",
    "incident":  "Vorfall",
    "diverted":  "Umgeleitet",
    "unknown":   "Unbekannt",
}


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _resolve_airport_name(iata: str | None, api_name: str | None) -> str:
    """Flughafenname: DE-Override → airportsdata City → API-Name → IATA-Code."""
    if not iata:
        return "Unbekannt"
    code = iata.upper()
    if code in _DE_OVERRIDES:
        return _DE_OVERRIDES[code]
    entry = _get_airports_db().get(code)
    if entry:
        city = (entry.get("city") or "").strip()
        if city:
            return city
    if api_name and api_name.strip() and api_name.strip().lower() not in ("null", "none", "unknown", ""):
        return api_name.strip()
    return code


def _fmt_time(iso: str | None) -> str | None:
    """ISO → 'HH:MM' (Lokalzeit wie von AviationStack geliefert)."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%H:%M")
    except Exception:
        return iso[:5] if len(iso) >= 5 else iso


def _calc_duration(
    dep_iso: str | None,
    arr_iso: str | None,
    dep_iata: str | None = None,
    arr_iata: str | None = None,
) -> int | None:
    """
    Flugdauer in Minuten — korrekt auch bei Zeitzonen-Sprüngen.

    AviationStack Free-Tier liefert Lokalzeiten mit Offset +00:00.
    Wenn beide Offsets = 0, werden echte Flughafen-Zeitzonen aus airportsdata
    angewendet (verhindert falsche 2h statt 8h bei Interkontinentalflügen).
    """
    if not dep_iso or not arr_iso:
        return None
    try:
        from zoneinfo import ZoneInfo
        dep_dt = datetime.fromisoformat(dep_iso.replace("Z", "+00:00"))
        arr_dt = datetime.fromisoformat(arr_iso.replace("Z", "+00:00"))

        dep_offset = dep_dt.utcoffset()
        arr_offset = arr_dt.utcoffset()
        both_zero = (
            dep_iata and arr_iata
            and (dep_offset is None or dep_offset.total_seconds() == 0)
            and (arr_offset is None or arr_offset.total_seconds() == 0)
        )
        if both_zero:
            db = _get_airports_db()
            dep_tz = db.get(dep_iata.upper(), {}).get("tz")  # type: ignore[union-attr]
            arr_tz = db.get(arr_iata.upper(), {}).get("tz")  # type: ignore[union-attr]
            if dep_tz and arr_tz:
                dep_dt = dep_dt.replace(tzinfo=None).replace(tzinfo=ZoneInfo(dep_tz))
                arr_dt = arr_dt.replace(tzinfo=None).replace(tzinfo=ZoneInfo(arr_tz))

        mins = int((arr_dt - dep_dt).total_seconds() / 60)
        return mins if mins > 0 else None
    except Exception:
        return None


def _normalize_callsign(callsign: str) -> str:
    """
    OpenSky ICAO-Callsign → IATA Flugnummer.
    'SWR0054' → 'LX54',  'DLH0456' → 'LH456',  'LX0054' → 'LX54'
    """
    cs = callsign.strip().upper()
    m = re.match(r'^([A-Z]{2,3})(\d+)$', cs)
    if not m:
        return cs
    prefix = m.group(1)
    number = str(int(m.group(2)))  # führende Nullen entfernen
    iata_prefix = _ICAO_TO_IATA_AIRLINE.get(prefix, prefix)
    return f"{iata_prefix}{number}"


def _unix_to_local_hhmm(unix_ts: int, tz_name: str) -> str | None:
    """Unix-Timestamp → 'HH:MM' in der Zeitzone des Flughafens."""
    try:
        from zoneinfo import ZoneInfo
        dt = datetime.fromtimestamp(unix_ts, tz=ZoneInfo(tz_name))
        return dt.strftime("%H:%M")
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
        "dep_airport": _resolve_airport_name(dep.get("iata"), dep.get("airport")),
        "dep_iata": dep.get("iata"),
        "dep_scheduled": _fmt_time(dep.get("scheduled")),
        "dep_actual": _fmt_time(dep.get("actual") or dep.get("estimated")),
        "dep_terminal": dep.get("terminal"),
        "dep_gate": dep.get("gate"),
        "dep_delay": delay_dep or 0,
        "arr_airport": _resolve_airport_name(arr.get("iata"), arr.get("airport")),
        "arr_iata": arr.get("iata"),
        "arr_scheduled": _fmt_time(arr.get("scheduled")),
        "arr_actual": _fmt_time(arr.get("actual") or arr.get("estimated")),
        "arr_terminal": arr.get("terminal"),
        "arr_gate": arr.get("gate"),
        "arr_delay": delay_arr or 0,
        "delay": delay or 0,
        "duration_min": _calc_duration(
            dep.get("scheduled"), arr.get("scheduled"),
            dep.get("iata"), arr.get("iata"),
        ),
    }


def _opensky_to_entry(raw: dict, board_type: str, airport_tz: str) -> dict:
    """
    OpenSky-Rohdaten → FlightEntry (vereinfacht, ohne Gate/Terminal).
    firstSeen/lastSeen sind UTC-Unix-Timestamps.
    """
    callsign = (raw.get("callsign") or "").strip()
    flight_number = _normalize_callsign(callsign) if callsign else "—"

    # Airline aus ICAO-Prefix
    m = re.match(r'^([A-Z]{2,3})\d', callsign.upper())
    icao_prefix = m.group(1) if m else ""
    airline = _ICAO_AIRLINE_NAMES.get(icao_prefix, icao_prefix or "Unbekannt")

    first_seen: int | None = raw.get("firstSeen")
    last_seen: int | None = raw.get("lastSeen")

    dep_time = _unix_to_local_hhmm(first_seen, airport_tz) if first_seen else None

    # Ziel- / Herkunfts-Flughafen
    if board_type == "departure":
        counterpart_icao = raw.get("estArrivalAirport")
        dep_icao = raw.get("estDepartureAirport")
    else:
        counterpart_icao = raw.get("estDepartureAirport")
        dep_icao = raw.get("estDepartureAirport")

    counterpart_iata = _icao_airport_to_iata(counterpart_icao)
    dep_iata_val = _icao_airport_to_iata(dep_icao)

    counterpart_name = _resolve_airport_name(counterpart_iata, counterpart_icao)
    dep_name = _resolve_airport_name(dep_iata_val, dep_icao)

    # Ankunftszeit: lastSeen in Zeitzone des Zielflughafens
    arr_iata_val = counterpart_iata if board_type == "departure" else dep_iata_val
    arr_tz_name = (_get_airports_db().get(arr_iata_val or "", {}).get("tz") or airport_tz) if arr_iata_val else airport_tz
    arr_time = _unix_to_local_hhmm(last_seen, arr_tz_name) if last_seen else None

    # Flugdauer aus tatsächlichen Timestamps
    duration: int | None = None
    if first_seen and last_seen and last_seen > first_seen:
        mins = (last_seen - first_seen) // 60
        duration = mins if 10 < mins < 1440 else None

    arr_airport = counterpart_name if board_type == "departure" else dep_name
    arr_iata = counterpart_iata if board_type == "departure" else dep_iata_val

    return {
        "flight_number": flight_number,
        "airline": airline,
        "status": "Gestartet",
        "status_raw": "active",
        "dep_airport": dep_name,
        "dep_iata": dep_iata_val,
        "dep_scheduled": dep_time,
        "dep_actual": dep_time,
        "dep_terminal": None,
        "dep_gate": None,
        "dep_delay": 0,
        "arr_airport": arr_airport,
        "arr_iata": arr_iata,
        "arr_scheduled": arr_time,
        "arr_actual": None,
        "arr_terminal": None,
        "arr_gate": None,
        "arr_delay": 0,
        "delay": 0,
        "duration_min": duration,
    }


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
    # 1h Puffer für OpenSky Verarbeitungsverzögerung
    end_time = now_utc - timedelta(hours=1)

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

        # ICAO-Code + Zeitzone des Flughafens für OpenSky
        airport_entry = _get_airports_db().get(airport_iata, {})
        airport_icao: str | None = airport_entry.get("icao")
        airport_tz: str = airport_entry.get("tz") or "UTC"

        # AviationStack-Params
        avstack_params: dict[str, Any] = {
            "access_key": api_key,
            "limit": limit,
            "offset": 0,
        }
        if board_type == "departure":
            avstack_params["dep_iata"] = airport_iata
        else:
            avstack_params["arr_iata"] = airport_iata

        # ── Parallele Abfragen: AviationStack + OpenSky ─────────────────────
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

        # ── AviationStack-Flüge verarbeiten ─────────────────────────────────
        avstack_flights = [
            _parse_flight(f, board_type)
            for f in (avstack_resp.json().get("data") or [])
        ]
        # Bekannte Flugnummern → OpenSky-Duplikate ausschliessen
        known = {f["flight_number"] for f in avstack_flights if f["flight_number"] != "—"}

        # ── OpenSky-Flüge verarbeiten und zusammenführen ─────────────────────
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
