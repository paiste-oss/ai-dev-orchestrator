"""
Flugdaten-Endpunkte — direkter Zugriff auf AviationStack ohne Chat-Pipeline.
Wird vom Frontend für den Aktualisierungs-Button im FlightBoardWindow verwendet.
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Literal

from services.tools.handlers.flights import _handle_flights

router = APIRouter(prefix="/flights", tags=["flights"])


@router.get("/board")
async def airport_board(
    airport_iata: str = Query(..., description="IATA-Code des Flughafens, z.B. ZRH"),
    board_type: Literal["departure", "arrival"] = Query("departure"),
    limit: int = Query(20, ge=1, le=50),
):
    """Abflug- oder Ankunftstafel eines Flughafens direkt von AviationStack."""
    result = await _handle_flights(
        "airport_board",
        {"airport_iata": airport_iata, "board_type": board_type, "limit": limit},
    )
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@router.get("/status")
async def flight_status(
    flight_iata: str = Query(..., description="IATA-Flugnummer, z.B. LX188"),
    date: str | None = Query(None, description="Datum YYYY-MM-DD"),
):
    """Status eines einzelnen Fluges direkt von AviationStack."""
    tool_input: dict = {"flight_iata": flight_iata}
    if date:
        tool_input["date"] = date
    result = await _handle_flights("flight_status", tool_input)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result
