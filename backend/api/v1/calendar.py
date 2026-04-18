"""
Kalender-Endpunkte — CalDAV via Radicale.

  GET    /v1/calendar/info                — CalDAV-URL + Credentials (User)
  GET    /v1/calendar/events              — Termine im Zeitraum (User)
  POST   /v1/calendar/events              — Termin erstellen (User)
  DELETE /v1/calendar/events/{uid}        — Termin löschen (User)
  POST   /v1/calendar/provision/{id}      — CalDAV-Account anlegen (Admin)
  POST   /v1/calendar/reset-password/{id} — Passwort zurücksetzen (Admin)
  DELETE /v1/calendar/provision/{id}      — CalDAV-Account entfernen (Admin)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import httpx
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user, require_admin
from models.customer import Customer
from services.calendar_service import (
    caldav_url_for,
    generate_caldav_password,
    provision_caldav_account,
    remove_caldav_account,
    update_caldav_password,
)

router = APIRouter(prefix="/calendar", tags=["calendar"])


# ── Pydantic-Schemas ──────────────────────────────────────────────────────────

class CalEventOut(BaseModel):
    uid: str
    title: str
    start: str
    end: str
    description: str | None = None
    location: str | None = None


class CreateEventReq(BaseModel):
    title: str
    start: str          # "YYYY-MM-DD HH:MM" or "YYYY-MM-DD"
    end: str            # "YYYY-MM-DD HH:MM" or "YYYY-MM-DD"
    all_day: bool = False
    description: str | None = None
    location: str | None = None


# ── User-Endpunkte: Termine ───────────────────────────────────────────────────

@router.get("/events", response_model=list[CalEventOut])
async def list_events(
    start: str = Query(..., description="Startdatum YYYY-MM-DD"),
    end: str = Query(..., description="Enddatum YYYY-MM-DD"),
    user: Customer = Depends(get_current_user),
):
    """Gibt Termine im Zeitraum [start, end] zurück."""
    if not user.caldav_username or not user.caldav_password:
        return []
    from services.tools.handlers.calendar import _fetch_events, _ensure_collection
    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
        await _ensure_collection(user.caldav_username, user.caldav_password)
        return await _fetch_events(user.caldav_username, user.caldav_password, start_dt, end_dt)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Ungültiges Datum: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Kalender nicht erreichbar: {e}")


@router.post("/events", response_model=CalEventOut, status_code=201)
async def create_event(
    req: CreateEventReq,
    user: Customer = Depends(get_current_user),
):
    """Erstellt einen neuen Termin im persönlichen Kalender."""
    if not user.caldav_username or not user.caldav_password:
        raise HTTPException(status_code=400, detail="Kein Kalender-Account konfiguriert")
    from services.tools.handlers.calendar import (
        _ensure_collection, _build_ics, _event_url, _parse_dt,
    )
    try:
        start_dt = _parse_dt(req.start)
        end_dt = _parse_dt(req.end) if req.end else start_dt + timedelta(hours=1)
        if end_dt <= start_dt:
            raise HTTPException(status_code=422, detail="Endzeit muss nach der Startzeit liegen")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Ungültiges Datum: {e}")

    uid = str(uuid.uuid4())
    ics = _build_ics(
        uid, req.title.strip(), start_dt, end_dt,
        req.description, req.location, req.all_day,
    )
    await _ensure_collection(user.caldav_username, user.caldav_password)

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.put(
            _event_url(user.caldav_username, uid),
            content=ics,
            headers={"Content-Type": "text/calendar; charset=utf-8"},
            auth=(user.caldav_username, user.caldav_password),
        )
    if resp.status_code not in (201, 204):
        raise HTTPException(status_code=502, detail=f"CalDAV-Fehler {resp.status_code}")

    return CalEventOut(
        uid=uid,
        title=req.title.strip(),
        start=req.start,
        end=req.end,
        description=req.description,
        location=req.location,
    )


@router.delete("/events/{uid}", status_code=204)
async def delete_event(
    uid: str,
    user: Customer = Depends(get_current_user),
):
    """Löscht einen Termin anhand seiner UID."""
    if not user.caldav_username or not user.caldav_password:
        raise HTTPException(status_code=400, detail="Kein Kalender-Account konfiguriert")
    from services.tools.handlers.calendar import _event_url

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.delete(
            _event_url(user.caldav_username, uid),
            auth=(user.caldav_username, user.caldav_password),
        )
    if resp.status_code not in (200, 204, 404):
        raise HTTPException(status_code=502, detail=f"CalDAV-Fehler {resp.status_code}")


# ── Connection Info ───────────────────────────────────────────────────────────

@router.get("/info")
async def get_calendar_info(user: Customer = Depends(get_current_user)):
    """
    Gibt CalDAV-Verbindungsdaten für den eigenen Kalender zurück.
    Das Passwort wird nur angezeigt wenn es noch im Klartext vorhanden ist
    (einmalig nach Provisioning). Danach muss ein Admin es zurücksetzen.
    """
    if not user.caldav_username:
        return {"provisioned": False}

    return {
        "provisioned": True,
        "username": user.caldav_username,
        "password": user.caldav_password,  # None nach erstem Abruf oder manuell gelöscht
        "url": caldav_url_for(user.caldav_username),
        "hint": "Trage diese URL + Credentials in deinen Kalender-Client ein (iPhone: Einstellungen → Kalender → Accounts → CalDAV)",
    }


@router.post("/provision/{customer_id}")
async def provision_calendar(
    customer_id: uuid.UUID,
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Legt einen CalDAV-Account für einen User an.
    Username = erster Teil der baddi_email oder customer_id (Kurzform).
    Passwort wird generiert und einmalig zurückgegeben.
    """
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    if customer.caldav_username:
        return {
            "created": False,
            "username": customer.caldav_username,
            "url": caldav_url_for(customer.caldav_username),
            "message": "Account existiert bereits",
        }

    # Username ableiten
    if customer.baddi_email:
        username = customer.baddi_email.split("@")[0]  # z.B. "naor.a3f9b2"
    else:
        username = f"user.{str(customer_id)[:8]}"

    password = generate_caldav_password()
    provision_caldav_account(username, password)

    customer.caldav_username = username
    customer.caldav_password = password
    await db.commit()

    return {
        "created": True,
        "username": username,
        "password": password,
        "url": caldav_url_for(username),
    }


@router.post("/reset-password/{customer_id}")
async def reset_caldav_password(
    customer_id: uuid.UUID,
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Setzt das CalDAV-Passwort zurück und gibt das neue einmalig zurück."""
    customer = await db.get(Customer, customer_id)
    if not customer or not customer.caldav_username:
        raise HTTPException(status_code=404, detail="Kein CalDAV-Account vorhanden")

    new_password = generate_caldav_password()
    update_caldav_password(customer.caldav_username, new_password)
    customer.caldav_password = new_password
    await db.commit()

    return {"username": customer.caldav_username, "password": new_password}


@router.delete("/provision/{customer_id}")
async def remove_calendar(
    customer_id: uuid.UUID,
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Entfernt den CalDAV-Account eines Users."""
    customer = await db.get(Customer, customer_id)
    if not customer or not customer.caldav_username:
        raise HTTPException(status_code=404, detail="Kein CalDAV-Account vorhanden")

    remove_caldav_account(customer.caldav_username)
    customer.caldav_username = None
    customer.caldav_password = None
    await db.commit()
    return {"ok": True}
