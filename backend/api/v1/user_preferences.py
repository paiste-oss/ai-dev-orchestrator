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
    "fontSize":       "normal",   # small | normal | large | xlarge
    "fontFamily":     "system",   # system | mono | rounded | serif
    "accentColor":    "indigo",   # indigo | purple | sky | green | teal | orange | pink | red | yellow | white
    "background":     "dark",     # dark | darker | lighter | slate | navy | forest | wine | warm | white
    "lineSpacing":    "normal",   # compact | normal | wide
    "language":       "de",       # de | en | fr | it | gsw
    "buddyName":      "Baddi",    # frei wählbar
    "chatWidth":      "normal",   # compact | normal | wide | full
    "bubbleStyle":    "rounded",  # rounded | flat | minimal
    "showTimestamps": "hover",    # always | hover | never
    "chartSymbols":   [],         # Liste der Symbole im Dashboard
    "chartPeriod":    "1y",       # Zeitraum im Dashboard
    "avatarType":     "robot",    # robot | teekanne | lichtgestalt
    "ttsDefault":     False,      # Sprachausgabe standardmässig aktiv
    "ttsVoice":       "female",   # female | male
}


class PreferencesUpdate(BaseModel):
    fontSize:        str | None = None
    fontFamily:      str | None = None
    accentColor:     str | None = None
    background:      str | None = None
    lineSpacing:     str | None = None
    language:        str | None = None
    buddyName:       str | None = None
    chatWidth:       str | None = None
    bubbleStyle:     str | None = None
    showTimestamps:  str | None = None
    backgroundImage: str | None = None
    chartSymbols:    list[str] | None = None
    chartPeriod:     str | None = None
    avatarType:      str | None = None
    ttsDefault:      bool | None = None
    ttsVoice:        str | None = None


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

    update = body.model_dump(exclude_unset=True)

    # Buddy-Name kürzen (max 30 Zeichen)
    if "buddyName" in update and update["buddyName"] is not None:
        update["buddyName"] = update["buddyName"].strip()[:30] or "Baddi"

    # backgroundImage: leerer String oder None = Bild entfernen
    if "backgroundImage" in update:
        if not update["backgroundImage"]:
            current.pop("backgroundImage", None)
        else:
            current["backgroundImage"] = update["backgroundImage"]
        del update["backgroundImage"]

    current.update({k: v for k, v in update.items() if v is not None or isinstance(v, list)})

    await db.execute(
        text("UPDATE customers SET ui_preferences = CAST(:prefs AS jsonb) WHERE id = :id"),
        {"prefs": __import__("json").dumps(current), "id": str(customer.id)},
    )
    await db.commit()
    return current
