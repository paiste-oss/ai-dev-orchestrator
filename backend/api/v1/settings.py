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
    "show_tagline": True,
}


class PortalSettings(BaseModel):
    show_login: bool = True
    show_register_menschen: bool = True
    show_register_firmen: bool = True
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


class BaddiConfig(BaseModel):
    system_prompt: str = ""
    tone: str = "freundlich"
    language: str = "de"
    primary_model: str = "gemini-2.0-flash"
    fallback_model: str = "gpt-4o-mini"
    skills: dict = {}
    memory_enabled: bool = True
    context_window: int = 10
    n8n_workflow_id: str = ""
    agents: list[str] = []  # IDs der zugewiesenen Agenten, z.B. ["ki-chat", "document"]


@router.get("/baddi/{baddi_id}")
async def get_baddi_config(baddi_id: str):
    """Lädt die Konfiguration eines Baddi-Archetyps."""
    raw = _redis.get(f"baddi:config:{baddi_id}")
    if raw:
        return json.loads(raw)
    return BaddiConfig().model_dump()


@router.put("/baddi/{baddi_id}")
async def update_baddi_config(
    baddi_id: str,
    body: BaddiConfig,
    _: Customer = Depends(require_admin),
):
    data = body.model_dump()
    _redis.set(f"baddi:config:{baddi_id}", json.dumps(data))
    return data


_GLOBAL_BADDI_KEY = "baddi:config"

_GLOBAL_BADDI_DEFAULTS = {
    "system_prompt": (
        "Du bist Baddi — der persönliche KI-Begleiter deines Kunden. "
        "Du bist warm, direkt, ehrlich und empathisch. "
        "Du hilfst bei allem — vom Alltag bis zu komplexen Aufgaben. "
        "Antworte auf Deutsch, ausser der Kunde schreibt in einer anderen Sprache."
    ),
    "agents": [],
}


@router.get("/baddi-global")
async def get_global_baddi_config(_: Customer = Depends(require_admin)):
    """Lädt die globale Baddi-Konfiguration (gilt für alle Kunden)."""
    raw = _redis.get(_GLOBAL_BADDI_KEY)
    return json.loads(raw) if raw else _GLOBAL_BADDI_DEFAULTS


@router.put("/baddi-global")
async def update_global_baddi_config(body: BaddiConfig, _: Customer = Depends(require_admin)):
    """Speichert die globale Baddi-Konfiguration."""
    data = body.model_dump()
    _redis.set(_GLOBAL_BADDI_KEY, json.dumps(data))
    return data



_MEMORY_MANAGER_KEY = "memory_manager:config"

_MEMORY_MANAGER_DEFAULTS = {
    "model": app_settings.ollama_chat_model,
    "system_prompt": (
        "Du bist ein Memory-Extraktor für einen persönlichen KI-Assistenten.\n\n"
        "Analysiere den folgenden Gesprächsausschnitt und extrahiere bis zu 5 wichtige, "
        "dauerhafte Fakten über den NUTZER (nicht über den Assistenten).\n\n"
        "Extrahiere NUR:\n"
        "- Namen, Beruf, Wohnort, Familie\n"
        "- Vorlieben, Abneigungen, Gewohnheiten\n"
        "- Wichtige Lebenssituationen, Ziele, Herausforderungen\n"
        "- Wiederkehrende Präferenzen (z. B. Kommunikationsstil, Sprache)\n\n"
        "Extrahiere NICHT:\n"
        "- Einmalige Fragen oder Anfragen\n"
        "- Allgemeine Themen ohne Bezug zum Nutzer\n"
        "- Inhalte die der Assistent generiert hat\n\n"
        "Antworte NUR mit einer JSON-Liste von kurzen Sätzen auf Deutsch.\n"
        'Beispiel: ["Nutzer heißt Christoph", "Arbeitet als Architekt"]\n'
        "Wenn keine relevanten Fakten vorhanden: []"
    ),
}


class MemoryManagerConfig(BaseModel):
    model: str = app_settings.ollama_chat_model
    system_prompt: str = _MEMORY_MANAGER_DEFAULTS["system_prompt"]


@router.get("/memory-manager")
async def get_memory_manager_config(_: Customer = Depends(require_admin)):
    raw = _redis.get(_MEMORY_MANAGER_KEY)
    return json.loads(raw) if raw else _MEMORY_MANAGER_DEFAULTS


@router.put("/memory-manager")
async def update_memory_manager_config(
    body: MemoryManagerConfig,
    _: Customer = Depends(require_admin),
):
    data = body.model_dump()
    _redis.set(_MEMORY_MANAGER_KEY, json.dumps(data))
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
