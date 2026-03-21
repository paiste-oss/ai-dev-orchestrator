"""
Router Admin API — Übersicht über den Agent-Router, Tools und System-Prompt.

GET /admin/router/overview    → Intents + Tools + dynamische Tools (Redis)
GET /admin/router/memory      → Gelernte Routen aus dem Router-Gedächtnis
GET /admin/router/system-prompt → Vorschau des aktuellen System-Prompts
"""
from fastapi import APIRouter, Depends
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/admin/router", tags=["admin-router"])

# Alle bekannten Intents mit Mapping zu Tool + Status
_INTENT_MAP = [
    {"intent": "transport",        "label": "ÖV / SBB Abfrage",   "tool_key": "sbb_transport",    "status": "tool"},
    {"intent": "web_fetch",        "label": "Web-Zugriff (URL)",   "tool_key": "web_fetch",         "status": "tool"},
    {"intent": "web_search",       "label": "Web-Suche",           "tool_key": "web_search",        "status": "tool"},
    {"intent": "image_generation", "label": "Bild-Generierung",    "tool_key": "image_generation",  "status": "tool"},
    {"intent": "image_input",      "label": "Bild-Analyse",        "tool_key": None,                "status": "vision"},
    {"intent": "document",         "label": "Dokument-Analyse",    "tool_key": None,                "status": "llm"},
    {"intent": "email",            "label": "E-Mail",              "tool_key": None,                "status": "gap"},
    {"intent": "calendar",         "label": "Kalender / Termine",  "tool_key": None,                "status": "gap"},
    {"intent": "conversation",     "label": "Gespräch",            "tool_key": None,                "status": "llm"},
    {"intent": "blocked",          "label": "Blockiert (Guard)",   "tool_key": None,                "status": "blocked"},
]


@router.get("/overview")
async def get_router_overview(_admin: Customer = Depends(require_admin)):
    """Gibt Tools, Intents und dynamische Tools zurück."""
    from services.tool_registry import TOOL_CATALOG
    from services.agent_router import _load_dynamic_tool_keys

    tools = [
        {
            "key":         v["key"],
            "name":        v["name"],
            "description": v["description"],
            "prompt_hint": v.get("prompt_hint", ""),
            "category":    v["category"],
            "tier":        v["tier"],
        }
        for v in TOOL_CATALOG.values()
    ]

    dynamic_keys = _load_dynamic_tool_keys()

    # Intents anreichern: hat der Intent sein Tool im Katalog?
    intents = []
    for item in _INTENT_MAP:
        entry = dict(item)
        if item["tool_key"] and item["tool_key"] in TOOL_CATALOG:
            entry["tool_name"] = TOOL_CATALOG[item["tool_key"]]["name"]
        else:
            entry["tool_name"] = None
        intents.append(entry)

    return {
        "tools":         tools,
        "intents":       intents,
        "dynamic_tools": dynamic_keys,
    }


@router.get("/memory")
async def get_router_memory(_admin: Customer = Depends(require_admin)):
    """Gibt gelernte Routen aus dem Redis Router-Gedächtnis zurück."""
    try:
        import redis as redis_lib
        from core.config import settings
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)

        learned = []
        # Alle router:score:* Keys einlesen
        for key in r.scan_iter("router:score:*"):
            # Format: router:score:{intent}:{route}
            parts = key.split(":")
            if len(parts) >= 4:
                intent = parts[2]
                route  = ":".join(parts[3:])
                score  = float(r.get(key) or 0)
                learned.append({"intent": intent, "route": route, "score": round(score, 3)})

        learned.sort(key=lambda x: (-x["score"], x["intent"]))
        return {"learned_routes": learned}
    except Exception as e:
        return {"learned_routes": [], "error": str(e)}


@router.get("/system-prompt")
async def get_system_prompt_preview(_admin: Customer = Depends(require_admin)):
    """
    Gibt eine Vorschau des System-Prompts zurück wie er für einen Kunden aufgebaut wird.
    Nutzt einen Dummy-Namen — Memory und History werden nicht geladen.
    """
    from services.tool_registry import TOOL_CATALOG
    from core.config import settings
    import redis as redis_lib

    try:
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        import json
        raw = r.get("baddi:config")
        baddi_config = json.loads(raw) if raw else {}
    except Exception:
        baddi_config = {}

    first_name = "Kunde"
    base_prompt = (
        baddi_config.get("system_prompt")
        or baddi_config.get("system_prompt_template")
        or f"Du bist Baddi — der persönliche Begleiter von {first_name}."
    ).strip()

    parts = [base_prompt]
    parts.append(
        f"\nIDENTITÄT (unveränderlich):\n"
        f"- Du bist Baddi. Nenne dich ausschliesslich 'Baddi' — niemals 'KI', 'Assistent', 'Bot', 'Modell' oder ähnliches.\n"
        f"- Du sprichst {first_name} immer beim Vornamen an.\n"
        f"- Du kommunizierst stets aus deiner Perspektive als Baddi: 'Ich bin dein Baddi und begleite dich durchs Leben.'\n"
        f"- Du bist warm, direkt, ehrlich und empathisch."
    )

    active_tools = [v["prompt_hint"] for v in TOOL_CATALOG.values() if v.get("prompt_hint")]
    if active_tools:
        tools_text = "\n".join(f"- {t}" for t in active_tools)
        parts.append(
            f"\nDEINE AKTIVEN UHRWERK-TOOLS (diese Fähigkeiten hast du wirklich — behaupte nie das Gegenteil):\n{tools_text}"
        )

    parts.append("\nWas du über Kunde weißt:\n[wird zur Laufzeit aus Qdrant geladen]")

    return {
        "system_prompt": "\n".join(parts),
        "tool_count":    len(active_tools),
        "base_prompt_source": "redis" if baddi_config.get("system_prompt") else "default",
    }
