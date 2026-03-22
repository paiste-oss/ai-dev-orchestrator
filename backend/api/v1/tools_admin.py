"""
Tools Admin API — Vollständige Übersicht aller registrierten Buddy-Tools.

GET /admin/tools          → Alle Tools mit Details + Tool-Definitionen
GET /admin/tools/{key}    → Ein Tool im Detail
"""
from fastapi import APIRouter, Depends, HTTPException
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/admin/tools", tags=["admin-tools"])


@router.get("")
async def get_all_tools(_admin: Customer = Depends(require_admin)):
    """Alle Tools aus dem TOOL_CATALOG mit vollständigen Details."""
    from services.tool_registry import TOOL_CATALOG
    from core.config import settings

    result = []
    for v in TOOL_CATALOG.values():
        # API-Key Status prüfen
        api_status = _check_api_status(v["key"], settings)
        result.append({
            "key":         v["key"],
            "name":        v["name"],
            "description": v["description"],
            "category":    v["category"],
            "tier":        v["tier"],
            "tool_count":  len(v["tool_defs"]),
            "tool_names":  sorted(v["tool_names"]),
            "api_status":  api_status,
        })
    return {"tools": result}


@router.get("/{key}")
async def get_tool_detail(key: str, _admin: Customer = Depends(require_admin)):
    """Ein Tool im Detail — inkl. vollständiger Anthropic Tool-Definitionen und Handler-Info."""
    import inspect
    from services.tool_registry import TOOL_CATALOG
    from core.config import settings

    v = TOOL_CATALOG.get(key)
    if not v:
        raise HTTPException(status_code=404, detail=f"Tool '{key}' nicht gefunden")

    api_status = _check_api_status(key, settings)

    # Handler-Metadaten via inspect
    handler = v.get("handler")
    handler_info = None
    if handler:
        try:
            raw_file = inspect.getfile(handler)
            # Pfad relativ zu /app/ (Container) oder Projekt-Root
            for prefix in ["/app/", "/home/"]:
                idx = raw_file.find(prefix)
                if idx != -1:
                    rel = raw_file[idx + len(prefix):]
                    # Kürze /home/naor/ai-dev-orchestrator/backend/ → backend/
                    rel = rel.split("ai-dev-orchestrator/")[-1]
                    break
            else:
                rel = raw_file
            handler_info = {
                "function":  handler.__name__,
                "module":    handler.__module__,
                "file":      rel,
                "line":      inspect.getsourcelines(handler)[1],
            }
        except Exception:
            handler_info = {"function": handler.__name__, "module": handler.__module__, "file": "—", "line": None}

    return {
        "key":          v["key"],
        "name":         v["name"],
        "description":  v["description"],
        "category":     v["category"],
        "tier":         v["tier"],
        "tool_count":   len(v["tool_defs"]),
        "tool_names":   sorted(v["tool_names"]),
        "tool_defs":    v["tool_defs"],
        "api_status":   api_status,
        "handler":      handler_info,
    }


def _check_api_status(key: str, settings) -> dict:
    """Prüft ob das benötigte API-Key konfiguriert ist."""
    checks = {
        "sbb_transport":   {"provider": "SBB Open Data", "key_required": False,  "configured": True},
        "web_fetch":       {"provider": "Jina Reader",   "key_required": False,  "configured": True},
        "web_search":      {"provider": "Exa",           "key_required": True,   "configured": bool(settings.exa_api_key)},
        "image_generation":{"provider": "OpenAI DALL-E 3","key_required": True,  "configured": bool(settings.openai_api_key)},
    }
    return checks.get(key, {"provider": "Unbekannt", "key_required": False, "configured": True})
