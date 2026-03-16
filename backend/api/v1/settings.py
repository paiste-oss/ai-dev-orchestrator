import json
import redis as redis_lib
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.config import settings as app_settings
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/settings", tags=["settings"])

_redis = redis_lib.from_url(app_settings.redis_url, decode_responses=True)
_KEY = "portal:settings"
_IMPRESSUM_KEY = "portal:impressum"

_DEFAULTS = {
    "show_login": True,
    "show_register_menschen": True,
    "show_register_firmen": True,
    "show_register_funktionen": True,
    "show_tagline": True,
}


class PortalSettings(BaseModel):
    show_login: bool = True
    show_register_menschen: bool = True
    show_register_firmen: bool = True
    show_register_funktionen: bool = True
    show_tagline: bool = True


class ImpressumSettings(BaseModel):
    firma: str = "AI Buddy GmbH"
    strasse: str = "Musterstraße 1"
    plz_ort: str = "3000 Bern, Schweiz"
    vertreten_durch: str = "Max Mustermann"
    funktion: str = "Geschäftsführer"
    telefon: str = "+41 00 000 00 00"
    email: str = "info@ai-buddy.ch"
    handelsregister: str = "Handelsregister des Kantons Bern"
    registernummer: str = "CHE-000.000.000"
    mwst: str = "CHE-000.000.000 MWST"

_IMPRESSUM_DEFAULTS = ImpressumSettings().model_dump()


@router.get("/impressum")
async def get_impressum():
    """Öffentlich — wird im Impressum-Modal gelesen."""
    raw = _redis.get(_IMPRESSUM_KEY)
    return json.loads(raw) if raw else _IMPRESSUM_DEFAULTS


@router.put("/impressum")
async def update_impressum(
    body: ImpressumSettings,
    _: Customer = Depends(require_admin),
):
    data = body.model_dump()
    _redis.set(_IMPRESSUM_KEY, json.dumps(data))
    return data


@router.get("/portal")
async def get_portal_settings():
    """Öffentlich — wird von der Startseite gelesen."""
    raw = _redis.get(_KEY)
    return json.loads(raw) if raw else _DEFAULTS


@router.put("/portal")
async def update_portal_settings(
    body: PortalSettings,
    _: Customer = Depends(require_admin),
):
    data = body.model_dump()
    _redis.set(_KEY, json.dumps(data))
    return data
