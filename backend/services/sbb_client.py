"""
SBB / Schweizer ÖV Service
Basiert auf transport.opendata.ch — kostenlos, kein API-Key nötig.

Endpoints:
  - /locations   → Haltestellen-Suche
  - /stationboard → Echtzeit-Abfahrtstafel
  - /connections  → Verbindungsabfragen
"""
import httpx
from typing import Optional

BASE_URL = "https://transport.opendata.ch/v1"
_TIMEOUT = 10.0


async def search_locations(query: str, location_type: str = "station") -> dict:
    """Haltestellen, POIs oder Adressen nach Name suchen."""
    params: dict = {"query": query}
    if location_type != "all":
        params["type"] = location_type
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{BASE_URL}/locations", params=params)
        resp.raise_for_status()
        return resp.json()


async def get_stationboard(
    station: str,
    limit: int = 20,
    transport_type: Optional[str] = None,
    board_type: str = "departure",
    datetime_str: Optional[str] = None,
) -> dict:
    """Echtzeit-Abfahrtstafel für eine Haltestelle.

    Args:
        station: Haltestellenname oder ID (z.B. '8507000' für Bern)
        limit: Anzahl Abfahrten
        transport_type: 'train', 'tram', 'bus', 'ship', 'cableway'
        board_type: 'departure' oder 'arrival'
        datetime_str: 'YYYY-MM-DD HH:MM' — leer = jetzt
    """
    params: dict = {"station": station, "limit": limit, "type": board_type}
    if transport_type:
        params["transportations[]"] = transport_type
    if datetime_str:
        params["datetime"] = datetime_str
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{BASE_URL}/stationboard", params=params)
        resp.raise_for_status()
        return resp.json()


async def get_connections(
    from_station: str,
    to_station: str,
    via: Optional[list[str]] = None,
    date: Optional[str] = None,
    time: Optional[str] = None,
    is_arrival_time: bool = False,
    limit: int = 4,
    transportations: Optional[list[str]] = None,
) -> dict:
    """Verbindungen zwischen zwei Haltestellen abfragen.

    Args:
        from_station: Abgangsort
        to_station: Zielort
        via: Zwischenstopps (max. 5)
        date: 'YYYY-MM-DD'
        time: 'HH:MM'
        is_arrival_time: True wenn 'time' die Ankunftszeit ist
        limit: 1–16 Verbindungen
        transportations: Liste von Verkehrsmitteln
    """
    params: dict = {
        "from": from_station,
        "to": to_station,
        "limit": limit,
    }
    if via:
        for i, v in enumerate(via[:5]):
            params[f"via[{i}]"] = v
    if date:
        params["date"] = date
    if time:
        params["time"] = time
    if is_arrival_time:
        params["isArrivalTime"] = 1
    if transportations:
        for t in transportations:
            params.setdefault("transportations[]", [])
            if isinstance(params["transportations[]"], list):
                params["transportations[]"].append(t)
            else:
                params["transportations[]"] = [params["transportations[]"], t]

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{BASE_URL}/connections", params=params)
        resp.raise_for_status()
        return resp.json()
