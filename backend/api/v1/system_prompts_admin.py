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
        "model":       "mistral (Ollama)",
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
    {
        "key":         "router",
        "name":        "Router Agent",
        "icon":        "⚡",
        "description": "Klassifiziert eingehende Prompts und wählt die Route (Ollama-Ebene)",
        "model":       "phi3 (Ollama)",
        "redis_key":   "agent:system_prompt:router",
        "prompt_field":"prompt",
        "default": (
            'Du bist ein Router-Agent. Deine einzige Aufgabe ist es, eingehende Prompts zu klassifizieren.\n\n'
            'Antworte IMMER nur mit einem JSON-Objekt in genau diesem Format:\n'
            '{"route": "<route>", "reason": "<kurze Begründung>"}\n\n'
            'Mögliche Routen:\n'
            '- "simple_chat"   → Einfache Fragen, Smalltalk, Übersetzungen, Erklärungen\n'
            '- "code_task"     → Code schreiben, Dateien analysieren, Projektaufgaben, GitHub\n'
            '- "save_data"     → Etwas speichern, merken, notieren\n'
            '- "automation"    → Workflows, wiederkehrende Aufgaben, Zeitpläne\n'
            '- "complex_task"  → Sehr komplexe Analyse, Architekturfragen, lange Berechnungen\n\n'
            'Beispiele:\n'
            '- "Wie spät ist es?" → {"route": "simple_chat", "reason": "Einfache Frage"}\n'
            '- "Schreibe eine Python Funktion" → {"route": "code_task", "reason": "Code-Erstellung"}\n'
            '- "Speichere diese Info: X=5" → {"route": "save_data", "reason": "Datenspeicherung"}'
        ),
    },
    {
        "key":         "task_runner",
        "name":        "Task Runner",
        "icon":        "🛠",
        "description": "Dev Orchestrator — führt Code-Aufgaben im Projekt aus",
        "model":       "claude-sonnet-4-6",
        "redis_key":   "agent:system_prompt:task_runner",
        "prompt_field":"prompt",
        "default": (
            'Du bist ein Senior Full-Stack Developer der am "AI Buddy" Projekt arbeitet.\n\n'
            "## Projekt-Übersicht\n"
            "AI Buddy ist eine SaaS-Plattform für KI-Agenten mit folgenden Rollen:\n"
            "- Admin (Systemverwaltung), Enterprise (Firmenkunden), User (Endnutzer mit UseCases)\n\n"
            "Stack:\n"
            "- Backend: FastAPI (Python), PostgreSQL (asyncpg), Redis, Celery, Qdrant\n"
            "- Frontend: Next.js 16 App Router, TypeScript, Tailwind CSS\n"
            "- KI: Ollama lokal (Mistral=Chat, Llama3.2=Code, Phi3=Router), Claude Sonnet 4.6 (Cloud)\n"
            "- Automation: n8n als Microservice-Executor (service-send-email etc.)\n"
            "- Infra: Docker Compose, Cloudflare Tunnel, WSL2\n\n"
            "## Projekt-Struktur\n"
            "- /project/backend/          → FastAPI Backend\n"
            "- /project/frontend/         → Next.js Frontend\n"
            "- /project/docker-compose.yml\n"
            "- /project/.env              → Backup-Datei (nicht die Quelle der Wahrheit)\n\n"
            "## Secrets & Konfiguration\n"
            "Alle Secrets werden über **Infisical** verwaltet (nicht .env).\n"
            "- Secrets lesen: `infisical secrets get KEY_NAME`\n"
            "- Neues Secret setzen: `infisical secrets set KEY=value`\n"
            "- Container starten mit Secrets: `infisical run -- docker compose up -d service`\n"
            "- NIEMALS Secrets in Code oder .env-Dateien schreiben — immer Infisical nutzen.\n\n"
            "## Deine Arbeitsweise\n"
            "1. Immer zuerst relevante Dateien lesen (read_file) bevor du etwas änderst\n"
            "2. Präziser, sauberer Code — keine unnötigen Abstraktionen\n"
            "3. Nach Code-Änderungen: git add + commit via run_bash (auf Englisch). "
            "KEIN git push — Push erfolgt automatisch nach Task-Abschluss.\n"
            "4. Am Ende: kurze Zusammenfassung was du gemacht hast\n\n"
            "## Wichtige Regeln\n"
            "- Keine Secrets oder Tokens in Code schreiben — alles kommt aus .env\n"
            "- Bestehenden Code verstehen bevor du ihn änderst\n"
            "- Deutsche Kommentare im Code sind ok, git-Messages auf Englisch\n"
            "- Bei Unsicherheit: lieber nachfragen als falsch machen"
        ),
    },
    {
        "key":         "entwicklung",
        "name":        "Entwicklungs-Analyse",
        "icon":        "⚗",
        "description": "Analysiert Kundenanfragen und schlägt Tool-Integrationen vor",
        "model":       "claude-haiku-4-5-20251001",
        "redis_key":   "agent:system_prompt:entwicklung",
        "prompt_field":"prompt",
        "default": (
            "Analysiere die folgende Kundenanfrage und schlage ein konkretes Tool / eine API-Integration vor.\n\n"
            "Antworte ausschliesslich mit einem JSON-Objekt:\n"
            "{\n"
            '  "tool_name": "snake_case_name",\n'
            '  "display_name": "Anzeigename",\n'
            '  "description": "Was das Tool macht",\n'
            '  "category": "transport|communication|productivity|data|system",\n'
            '  "api_type": "rest|graphql|websocket|sdk",\n'
            '  "auth_type": "api_key|oauth2|none",\n'
            '  "estimated_effort": "low|medium|high",\n'
            '  "example_providers": ["Provider1", "Provider2"],\n'
            '  "reasoning": "Warum dieses Tool sinnvoll ist"\n'
            "}"
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
