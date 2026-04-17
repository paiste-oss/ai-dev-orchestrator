"""
Kalender-Endpunkte — CalDAV via Radicale.

  GET  /v1/calendar/info              — CalDAV-URL + Credentials abrufen (User)
  POST /v1/calendar/provision/{id}    — CalDAV-Account anlegen (Admin)
  POST /v1/calendar/reset-password/{id} — Passwort zurücksetzen (Admin)
  DELETE /v1/calendar/provision/{id}  — CalDAV-Account entfernen (Admin)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
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
