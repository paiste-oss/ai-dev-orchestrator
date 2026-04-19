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
    """Gibt alle Schichten des System-Prompt-Assembly zurück — inkl. Caching-Zuordnung."""
    from services.tool_registry import TOOL_CATALOG

    base_prompt = _get_prompt(_BADDI_AGENT)
    tool_hints = [v["prompt_hint"] for v in TOOL_CATALOG.values() if v.get("prompt_hint")]

    return {
        # Zwei Blöcke: static (gecacht) und dynamic (per Request)
        "cache_info": {
            "static_tokens_approx": 2500,
            "cache_ttl_seconds": 300,
            "provider": "Anthropic Prompt Caching (ephemeral)",
        },
        "layers": [
            # ── STATISCHER BLOCK (gecacht) ──────────────────────────────────
            {
                "step": 1,
                "name": "Assistenz-Gebot & URL-Tabelle",
                "source": "Fest im Code (chat_system_prompt.py)",
                "type": "static",
                "cache_block": "static",
                "tokens_approx": 800,
                "content": [
                    "TRIGGER-WÖRTER → sofort open_artifact aufrufen",
                    "40+ Schweizer Behörden/Dienst-URLs (IV, AHV, SBB, Krankenkassen, Banken…)",
                    "NIEMALS nur Text antworten bei Anmelde-/Formular-Anfragen",
                ],
                "editable": False,
            },
            {
                "step": 2,
                "name": "Benutzeroberfläche & Fenster-Steuerung",
                "source": "Fest im Code (chat_system_prompt.py)",
                "type": "static",
                "cache_block": "static",
                "tokens_approx": 1000,
                "content": [
                    "open_artifact / close_artifact Tool-Anweisungen",
                    "Flugdaten, SBB, Aktien, Namensnetz — Tool-Regeln",
                    "Dokumente automatisch lesen (baddi_readable)",
                ],
                "editable": False,
            },
            {
                "step": 3,
                "name": "Tool-Übersicht",
                "source": "Tool Registry (services/tool_registry.py)",
                "type": "static",
                "cache_block": "static",
                "tokens_approx": 400,
                "content": tool_hints,
                "editable": False,
                "edit_path": "/admin/tools",
            },
            {
                "step": 4,
                "name": "Aktions-Buttons & Fehlende Fähigkeiten",
                "source": "Fest im Code (chat_system_prompt.py)",
                "type": "static",
                "cache_block": "static",
                "tokens_approx": 300,
                "content": [
                    "Markdown-Links und [AKTION:]-Button-Marker",
                    "[FÄHIGKEIT_FEHLT:]-Pflichtmarker für fehlende Integrationen",
                ],
                "editable": False,
            },
            # ── DYNAMISCHER BLOCK (per Request) ────────────────────────────
            {
                "step": 5,
                "name": "Basis-Identität",
                "source": "Redis: baddi:config (Identität-Seite bearbeitbar)",
                "type": "static",
                "cache_block": "dynamic",
                "tokens_approx": 80,
                "content": base_prompt,
                "editable": True,
                "edit_path": "/admin/uhrwerk/system-prompts",
            },
            {
                "step": 6,
                "name": "Chat-Modus & Kommunikationsstil",
                "source": "ui_preferences (DB) + Memory Manager → Qdrant (category=style)",
                "type": "dynamic",
                "cache_block": "dynamic",
                "tokens_approx": 200,
                "note": (
                    "Chat-Modus (Fokus / Plauder) aus den UI-Einstellungen des Kunden. "
                    "Kommunikationsstil wird automatisch aus Gesprächen gelernt "
                    "(gemma3:12b erkennt: 'antworte kürzer', 'erkläre technisch', 'duze mich')."
                ),
                "example": [
                    "CHAT-MODUS: FOKUS-MODUS — schnelle, präzise Hilfe",
                    "Nutzer bevorzugt kurze, direkte Antworten",
                    "Nutzer möchte per Du angesprochen werden",
                ],
                "editable": False,
            },
            {
                "step": 7,
                "name": "Chat-Design & aktuelle Zeit",
                "source": "ui_preferences (DB) + Server-Uhrzeit",
                "type": "dynamic",
                "cache_block": "dynamic",
                "tokens_approx": 150,
                "note": (
                    "Aktuelle UI-Einstellungen des Kunden (Sprache, Name, Schriftgrösse, Farbe) "
                    "und die exakte Server-Uhrzeit (Schweizer Zeit). Ändert sich jede Minute."
                ),
                "example": [
                    "Name=Baddi, Sprache=Deutsch, Schrift=normal, Hintergrund=dark",
                    "Sonntag, 20.04.2025, 14:32 Uhr (Schweizer Zeit)",
                ],
                "editable": False,
            },
            {
                "step": 8,
                "name": "Globale Wissensbasis",
                "source": "Qdrant (search_global_knowledge, top_k=3, min_score=0.72)",
                "type": "dynamic",
                "cache_block": "dynamic",
                "tokens_approx": 800,
                "note": (
                    "Semantische Suche in der globalen Wissensbasis (Gesetze, Behörden, Prozesse). "
                    "Findet die 3 relevantesten Chunks zur aktuellen Anfrage (Score ≥ 0.72). "
                    "Nur wenn knowledge_enabled=true in der Baddi-Config."
                ),
                "example": [
                    "[KNOWLEDGE — IV-Anmeldeprozess Schweiz] Phase 1: Anmeldung…",
                    "[KNOWLEDGE — IVG Art. 28] Anspruch auf ordentliche Renten…",
                ],
                "editable": False,
                "edit_path": "/admin/knowledge",
            },
            {
                "step": 9,
                "name": "Namensnetz & Erinnerungen",
                "source": "PostgreSQL (window_boards) + Qdrant (category=fact, top_k=10)",
                "type": "dynamic",
                "cache_block": "dynamic",
                "tokens_approx": 300,
                "note": (
                    "Namensnetz: Bekannte Personen und Gruppen des Kunden (aus WindowBoard). "
                    "Erinnerungen: Die 10 semantisch relevantesten Fakten über den Kunden "
                    "zur aktuellen Anfrage (Langzeitgedächtnis)."
                ),
                "example": [
                    "NAMENSNETZ: Roman (Nachbar in Haslen), Familie: [Maria, Hans]",
                    "Nutzer heisst Christoph und lebt in Bern",
                    "Hat einen laufenden IV-Prozess seit 2024",
                ],
                "editable": False,
                "edit_path": "/admin/chat-flow/memory-manager",
            },
            {
                "step": 10,
                "name": "Kunden-Dokumente",
                "source": "PostgreSQL (customer_documents, baddi_readable=true)",
                "type": "dynamic",
                "cache_block": "dynamic",
                "tokens_approx": 1500,
                "note": (
                    "Alle Dokumente des Kunden die auf '🤖 Lesbar' stehen — max. 4000 Zeichen "
                    "pro Dokument, max. 12'000 Zeichen gesamt. "
                    "Nur Dokumente mit extrahiertem Text (PDF, Word) werden eingebettet."
                ),
                "example": [
                    '[Datei: "IV_Anmeldung_2024.pdf"] Ich, Christoph Muster, melde mich…',
                    '[Datei: "Arztbericht_Dr_Meier.pdf"] Diagnose: …',
                ],
                "editable": False,
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
