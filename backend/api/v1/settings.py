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

_DEFAULTS = {
    "show_login": True,
    "show_register_menschen": True,
    "show_register_firmen": True,
    "show_register_funktionen": True,
}


class PortalSettings(BaseModel):
    show_login: bool = True
    show_register_menschen: bool = True
    show_register_firmen: bool = True
    show_register_funktionen: bool = True


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
