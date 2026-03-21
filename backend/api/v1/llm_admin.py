"""
LLM Admin API — Übersicht und Verwaltung aller LLMs (lokal + extern).

GET  /admin/llm/overview       → Alle konfigurierten + installierten LLMs
POST /admin/llm/pull           → Ollama-Modell herunterladen/installieren
POST /admin/llm/check-updates  → Suche nach neueren Modellversionen via Exa
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import httpx
from core.config import settings
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/admin/llm", tags=["admin-llm"])


# ---------------------------------------------------------------------------
# Bekannte Modell-Versionen (Stand: 2026-Q1)
# ---------------------------------------------------------------------------

_OLLAMA_REGISTRY: dict[str, dict] = {
    "phi3":             {"latest": "phi4",              "description": "Microsoft Phi — Router / Klassifizierung (aktiv)"},
    "phi4":             {"latest": "phi4",              "description": "Microsoft Phi — Router / Klassifizierung"},
    "mistral-small3.1": {"latest": "mistral-small3.1",  "description": "Mistral AI 24B — Reserve"},
    "llama3.3":         {"latest": "llama3.3",          "description": "Meta LLaMA 70B — CPU-only (zu gross für VRAM)"},
    "gemma3":           {"latest": "gemma3:12b",        "description": "Google Gemma 3 — Memory-Extraktion / Code (aktiv, 7GB VRAM)"},
    "qwen2.5":          {"latest": "qwen2.5",           "description": "Alibaba Qwen — Multilingual / Reserve"},
    "deepseek-r1":      {"latest": "deepseek-r1",       "description": "DeepSeek R1 — Reasoning / Reserve"},
}

_ANTHROPIC_MODELS = [
    {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5",  "tier": "Schnell",    "use": "Analyse, Routing, Chat"},
    {"id": "claude-sonnet-4-6",         "name": "Claude Sonnet 4.6", "tier": "Ausgewogen", "use": "Chat, Vision, Tools"},
    {"id": "claude-opus-4-6",           "name": "Claude Opus 4.6",   "tier": "Leistungsstark", "use": "Komplexe Aufgaben"},
]

_GOOGLE_MODELS = [
    {"id": "gemini-2.0-flash",  "name": "Gemini 2.0 Flash",  "tier": "Schnell",    "use": "Chat, Schnellanfragen"},
    {"id": "gemini-2.5-flash",  "name": "Gemini 2.5 Flash",  "tier": "Ausgewogen", "use": "Chat, Reasoning"},
    {"id": "gemini-2.5-pro",    "name": "Gemini 2.5 Pro",    "tier": "Leistungsstark", "use": "Komplexe Analysen"},
]

_OPENAI_MODELS = [
    {"id": "gpt-4o-mini", "name": "GPT-4o Mini",  "tier": "Schnell",   "use": "Fallback Chat"},
    {"id": "gpt-4o",      "name": "GPT-4o",        "tier": "Ausgewogen","use": "Komplexe Aufgaben"},
    {"id": "whisper-1",   "name": "Whisper",        "tier": "Spezial",  "use": "Audio-Transkription"},
    {"id": "dall-e-3",    "name": "DALL-E 3",       "tier": "Spezial",  "use": "Bild-Generierung"},
]


async def _query_ollama() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                return resp.json().get("models", [])
    except Exception:
        pass
    return []


@router.get("/overview")
async def get_llm_overview(_admin: Customer = Depends(require_admin)):
    """Gibt alle LLMs zurück — lokal (Ollama) und extern (APIs)."""
    installed_raw = await _query_ollama()
    ollama_online = True
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            ollama_online = r.status_code == 200
    except Exception:
        ollama_online = False

    installed_names: set[str] = set()
    local_models = []
    # Vollname + Basis → Rolle (z.B. "gemma3:12b" und "gemma3" beide abdecken)
    role_map: dict[str, str] = {}
    for model_key, role_label in [
        (settings.ollama_router_model, "Router"),
        (settings.ollama_chat_model,   "Memory / Chat"),
        (settings.ollama_code_model,   "Code"),
    ]:
        role_map[model_key] = role_label
        role_map[model_key.split(":")[0]] = role_label

    for m in installed_raw:
        base = m["name"].split(":")[0]
        installed_names.add(base)
        installed_names.add(m["name"])
        info = _OLLAMA_REGISTRY.get(base, {})
        latest = info.get("latest", base)
        local_models.append({
            "name":        m["name"],
            "base":        base,
            "size_bytes":  m.get("size", 0),
            "modified_at": m.get("modified_at", ""),
            "role":        role_map.get(m["name"]) or role_map.get(base),
            "description": info.get("description", ""),
            "has_update":  latest != base and latest not in installed_names,
            "latest":      latest,
        })

    # Empfohlene aber noch nicht installierte Modelle
    seen_suggestions: set[str] = set()
    suggested = []
    for name, info in _OLLAMA_REGISTRY.items():
        latest = info["latest"]
        if latest not in installed_names and latest not in seen_suggestions:
            seen_suggestions.add(latest)
            suggested.append({
                "name":        latest,
                "description": info["description"],
            })

    return {
        "ollama_url":    settings.ollama_base_url,
        "ollama_online": ollama_online,
        "roles": {
            "router": settings.ollama_router_model,
            "chat":   settings.ollama_chat_model,
            "code":   settings.ollama_code_model,
        },
        "local":     local_models,
        "suggested": suggested,
        "external": {
            "anthropic": {
                "configured": bool(settings.anthropic_api_key),
                "in_use": ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
                "models":  _ANTHROPIC_MODELS,
            },
            "google": {
                "configured": bool(settings.gemini_api_key),
                "in_use": ["gemini-2.5-flash"],
                "models":  _GOOGLE_MODELS,
            },
            "openai": {
                "configured": bool(settings.openai_api_key),
                "in_use": ["gpt-4o-mini", "whisper-1", "dall-e-3"],
                "models":  _OPENAI_MODELS,
            },
        },
    }


class PullRequest(BaseModel):
    model: str


@router.post("/pull")
async def pull_model(body: PullRequest, _admin: Customer = Depends(require_admin)):
    """Lädt ein Ollama-Modell herunter (blockiert bis fertig, max. 30 Min.)."""
    try:
        async with httpx.AsyncClient(timeout=1800.0) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/pull",
                json={"name": body.model, "stream": False},
            )
            if resp.status_code == 200:
                return {"status": "ok", "model": body.model}
            return {"status": "error", "detail": resp.text[:500]}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.post("/check-updates")
async def check_updates(_admin: Customer = Depends(require_admin)):
    """Sucht via Exa nach neuen Modell-Releases (Ollama, Anthropic, Google)."""
    import datetime
    try:
        from services.exa_client import search as exa_search
        ollama_news  = await exa_search("newest Ollama models release 2025 2026", num_results=4)
        claude_news  = await exa_search("new Claude model Anthropic release 2025 2026", num_results=3)
        gemini_news  = await exa_search("new Gemini model Google release 2025 2026", num_results=3)
        return {
            "ollama_news":  ollama_news.get("results", []),
            "claude_news":  claude_news.get("results", []),
            "gemini_news":  gemini_news.get("results", []),
            "checked_at":   datetime.datetime.utcnow().isoformat() + "Z",
        }
    except Exception as e:
        return {"error": str(e), "ollama_news": [], "claude_news": [], "gemini_news": []}
