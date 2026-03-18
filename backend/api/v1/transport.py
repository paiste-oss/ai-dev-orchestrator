"""
Öffentlicher Verkehr — SBB / transport.opendata.ch
Kein API-Key nötig. Alle Endpunkte sind öffentlich zugänglich.
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import httpx

from services import sbb_client

router = APIRouter(prefix="/transport", tags=["transport"])


@router.get("/locations")
async def locations(
    query: str = Query(..., description="Haltestellenname, Adresse oder POI"),
    type: str = Query("station", description="station | poi | address | all"),
):
    """Haltestellen und Orte nach Name suchen."""
    try:
        return await sbb_client.search_locations(query, location_type=type)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"SBB API nicht erreichbar: {e}")


@router.get("/stationboard")
async def stationboard(
    station: str = Query(..., description="Haltestellenname oder ID (z.B. 8507000)"),
    limit: int = Query(20, ge=1, le=100, description="Anzahl Abfahrten"),
    type: str = Query("departure", description="departure | arrival"),
    transportation: Optional[str] = Query(None, description="train | tram | bus | ship | cableway"),
    datetime: Optional[str] = Query(None, description="YYYY-MM-DD HH:MM — leer = jetzt"),
):
    """Echtzeit-Abfahrtstafel für eine Haltestelle."""
    try:
        return await sbb_client.get_stationboard(
            station=station,
            limit=limit,
            transport_type=transportation,
            board_type=type,
            datetime_str=datetime,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"SBB API nicht erreichbar: {e}")


@router.get("/connections")
async def connections(
    from_station: str = Query(..., alias="from", description="Abgangsort"),
    to_station: str = Query(..., alias="to", description="Zielort"),
    via: Optional[list[str]] = Query(None, description="Zwischenstopps (max. 5)"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    time: Optional[str] = Query(None, description="HH:MM"),
    is_arrival_time: bool = Query(False, description="True = 'time' ist Ankunftszeit"),
    limit: int = Query(4, ge=1, le=16, description="Anzahl Verbindungen"),
    transportations: Optional[list[str]] = Query(None, description="train | tram | bus | ship"),
):
    """Verbindungen zwischen zwei Haltestellen abfragen."""
    try:
        return await sbb_client.get_connections(
            from_station=from_station,
            to_station=to_station,
            via=via,
            date=date,
            time=time,
            is_arrival_time=is_arrival_time,
            limit=limit,
            transportations=transportations,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"SBB API nicht erreichbar: {e}")
