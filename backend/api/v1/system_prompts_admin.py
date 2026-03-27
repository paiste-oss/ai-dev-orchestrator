"""
System Prompts Admin API — Alle Agenten-Prompts lesen und bearbeiten.

GET /admin/system-prompts          → Alle Prompts aller Agenten
PUT /admin/system-prompts/{key}    → Prompt speichern (Redis)
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.dependencies import require_admin
from core.redis_client import redis_sync
from core.utils import safe_json_loads
from models.customer import Customer

router = APIRouter(prefix="/admin/system-prompts", tags=["admin-system-prompts"])


# ---------------------------------------------------------------------------
# Agenten-Registry
# ---------------------------------------------------------------------------

_AGENTS = [
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
]

# Baddi-Basis-Prompt — wird auf der System-Prompt-Seite bearbeitet
_BADDI_AGENT = {
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
}

# Memory Manager Prompt — wird auf der Memory Manager-Seite bearbeitet
_MEMORY_MANAGER_AGENT = {
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
}

# Alle bekannten Agenten (für PUT-Endpoint)
_ALL_AGENTS = _AGENTS + [_BADDI_AGENT, _MEMORY_MANAGER_AGENT]


def _get_prompt(agent: dict) -> str:
    raw = redis_sync().get(agent["redis_key"])
    if raw:
        try:
            data = safe_json_loads(raw)
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


_IDENTITY_ANCHOR = (
    "IDENTITÄT (unveränderlich):\n"
    "- Du bist Baddi. Nenne dich ausschliesslich 'Baddi'.\n"
    "- Du sprichst {first_name} natürlich an.\n"
    "- Du bist warm, direkt, ehrlich und empathisch."
)


@router.get("/assembly")
async def get_assembly(_admin: Customer = Depends(require_admin)):
    """Gibt alle Schichten des System-Prompt-Assembly zurück."""
    from services.tool_registry import TOOL_CATALOG

    base_prompt = _get_prompt(_BADDI_AGENT)
    tool_hints = [v["prompt_hint"] for v in TOOL_CATALOG.values() if v.get("prompt_hint")]

    return {
        "layers": [
            {
                "step": 1,
                "name": "Basis-Identität",
                "source": "Identität-Seite (Redis: baddi:config)",
                "type": "static",
                "content": base_prompt,
                "editable": True,
                "edit_path": "/admin/uhrwerk/system-prompts",
            },
            {
                "step": 2,
                "name": "Identitäts-Anker",
                "source": "Fest im Code (chat.py)",
                "type": "static",
                "content": _IDENTITY_ANCHOR,
                "editable": False,
            },
            {
                "step": 3,
                "name": "Kommunikationsstil",
                "source": "Memory Manager → Qdrant/PostgreSQL (category=style)",
                "type": "dynamic",
                "note": (
                    "Wird pro Kunde automatisch aus Gesprächen gelernt. "
                    "Der Memory Manager (gemma3:12b) erkennt Stil-Signale wie "
                    "'antworte kürzer', 'erkläre technisch' oder 'duze mich'."
                ),
                "example": [
                    "Nutzer bevorzugt kurze, direkte Antworten",
                    "Nutzer möchte per Du angesprochen werden",
                    "Nutzer wünscht technische Erklärungen",
                ],
                "editable": False,
                "edit_path": "/admin/chat-flow/memory-manager",
            },
            {
                "step": 4,
                "name": "Tool-Hinweise",
                "source": "Tool Registry (services/tool_registry.py)",
                "type": "static",
                "content": tool_hints,
                "editable": False,
                "edit_path": "/admin/tools",
            },
            {
                "step": 5,
                "name": "Fakten über den Kunden",
                "source": "Memory System → Qdrant/PostgreSQL (semantische Suche, category=fact)",
                "type": "dynamic",
                "note": (
                    "Wird pro Kunde und pro Anfrage aus dem Langzeitgedächtnis geladen. "
                    "Semantische Vektorsuche findet die relevantesten Fakten zur aktuellen Frage."
                ),
                "example": [
                    "Nutzer heisst Christoph und lebt in Bern",
                    "Hat einen Hund namens Bello",
                    "Arbeitet als Softwareentwickler",
                ],
                "editable": False,
                "edit_path": "/admin/chat-flow/memory-manager",
            },
        ]
    }


class PromptUpdate(BaseModel):
    prompt: str


@router.get("/baddi")
async def get_baddi_prompt(_admin: Customer = Depends(require_admin)):
    """Gibt den Baddi-Basis-Prompt zurück (für System-Prompt-Seite)."""
    return {"prompt": _get_prompt(_BADDI_AGENT)}


@router.get("/memory-manager")
async def get_memory_manager_prompt(_admin: Customer = Depends(require_admin)):
    """Gibt den Memory Manager Extraktion-Prompt zurück."""
    return {"prompt": _get_prompt(_MEMORY_MANAGER_AGENT)}


@router.put("/{agent_key}")
async def update_system_prompt(
    agent_key: str,
    body: PromptUpdate,
    _admin: Customer = Depends(require_admin),
):
    """Speichert einen Agenten-Prompt in Redis."""
    agent = next((a for a in _ALL_AGENTS if a["key"] == agent_key), None)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_key}' nicht gefunden")

    raw = redis_sync().get(agent["redis_key"])
    try:
        data = safe_json_loads(raw)
    except Exception:
        data = {}

    data[agent["prompt_field"]] = body.prompt
    redis_sync().set(agent["redis_key"], json.dumps(data))
    return {"key": agent_key, "saved": True}
