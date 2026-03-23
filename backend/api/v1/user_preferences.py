"""
UI-Präferenzen des Kunden — Schriftgrösse, Farbe, Sprache, Buddy-Name.
Gespeichert als JSONB in customers.ui_preferences.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer

router = APIRouter(prefix="/user/preferences", tags=["preferences"])

DEFAULTS: dict = {
    "fontSize":    "normal",   # small | normal | large | xlarge
    "accentColor": "indigo",   # indigo | purple | green | orange | pink
    "background":  "dark",     # dark | darker | lighter
    "lineSpacing": "normal",   # compact | normal | wide
    "language":    "de",       # de | en | fr | it
    "buddyName":   "Baddi",    # frei wählbar
}


class PreferencesUpdate(BaseModel):
    fontSize:    str | None = None
    accentColor: str | None = None
    background:  str | None = None
    lineSpacing: str | None = None
    language:    str | None = None
    buddyName:   str | None = None


@router.get("")
async def get_preferences(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = dict(DEFAULTS)
    if customer.ui_preferences:
        prefs.update(customer.ui_preferences)
    return prefs


@router.post("")
async def update_preferences(
    body: PreferencesUpdate,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current = dict(DEFAULTS)
    if customer.ui_preferences:
        current.update(customer.ui_preferences)

    update = body.model_dump(exclude_none=True)

    # Buddy-Name kürzen (max 30 Zeichen)
    if "buddyName" in update:
        update["buddyName"] = update["buddyName"].strip()[:30] or "Baddi"

    current.update(update)

    await db.execute(
        text("UPDATE customers SET ui_preferences = :prefs::jsonb WHERE id = :id"),
        {"prefs": __import__("json").dumps(current), "id": str(customer.id)},
    )
    await db.commit()
    return current
