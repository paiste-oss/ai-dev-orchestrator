"""
System Prompts Admin API — Alle Agenten-Prompts lesen und bearbeiten.

GET /admin/system-prompts          → Alle Prompts aller Agenten
PUT /admin/system-prompts/{key}    → Prompt speichern (Redis)
"""
import json
import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.config import settings
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/admin/system-prompts", tags=["admin-system-prompts"])

_redis = redis_lib.from_url(settings.redis_url, decode_responses=True)


# ---------------------------------------------------------------------------
# Agenten-Registry
# ---------------------------------------------------------------------------

_AGENTS = [
    {
        "key":         "baddi",
        "name":        "Baddi",
        "icon":        "🤖",
        "description": "Persönlicher KI-Begleiter (Kunden-Chat)",
        "model":       "claude-haiku-4-5-20251001 / claude-sonnet-4-6 (Vision)",
        "redis_key":   "baddi:config",
        "prompt_field":"system_prompt",
        "default": (
            "Du bist Baddi — der persönliche KI-Begleiter deines Kunden. "
            "Du bist warm, direkt, ehrlich und empathisch. "
            "Du hilfst bei allem — vom Alltag bis zu komplexen Aufgaben. "
            "Antworte auf Deutsch, ausser der Kunde schreibt in einer anderen Sprache."
        ),
    },
    {
        "key":         "uhrwerk",
        "name":        "Uhrwerk",
        "icon":        "⚙",
        "description": "Interner Entwicklungs-Assistent",
        "model":       "claude-haiku-4-5-20251001",
        "redis_key":   "uhrwerk:config",
        "prompt_field":"identity",
        "default": (
            "Du bist das Uhrwerk — der interne Entwicklungs-Assistent von Baddi. "
            "Du analysierst Anfragen von Kunden, planst neue Tool-Integrationen und "
            "arbeitest eng mit dem Admin zusammen um neue Fähigkeiten zu entwickeln. "
            "Du antwortest präzise, technisch kompetent und auf Deutsch."
        ),
    },
    {
        "key":         "memory_manager",
        "name":        "Memory Manager",
        "icon":        "🧠",
        "description": "Extrahiert dauerhaft Fakten über Kunden aus Gesprächen",
        "model":       "gemma3:12b (Ollama)",
        "redis_key":   "memory_manager:config",
        "prompt_field":"system_prompt",
        "default": (
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
    },
]


def _get_prompt(agent: dict) -> str:
    raw = _redis.get(agent["redis_key"])
    if raw:
        try:
            data = json.loads(raw)
            return data.get(agent["prompt_field"]) or agent["default"]
        except Exception:
            return raw
    return agent["default"]


@router.get("")
async def get_all_system_prompts(_admin: Customer = Depends(require_admin)):
    """Gibt alle Agenten-Prompts zurück."""
    return {
        "agents": [
            {
                "key":         a["key"],
                "name":        a["name"],
                "icon":        a["icon"],
                "description": a["description"],
                "model":       a["model"],
                "prompt":      _get_prompt(a),
            }
            for a in _AGENTS
        ]
    }


class PromptUpdate(BaseModel):
    prompt: str


@router.put("/{agent_key}")
async def update_system_prompt(
    agent_key: str,
    body: PromptUpdate,
    _admin: Customer = Depends(require_admin),
):
    """Speichert einen Agenten-Prompt in Redis."""
    agent = next((a for a in _AGENTS if a["key"] == agent_key), None)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_key}' nicht gefunden")

    raw = _redis.get(agent["redis_key"])
    try:
        data = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    data[agent["prompt_field"]] = body.prompt
    _redis.set(agent["redis_key"], json.dumps(data))
    return {"key": agent_key, "saved": True}
