"""
Router Admin API — Übersicht über den Agent-Router, Tools und Routing-Engine.

GET /admin/router/overview  → Intents + Tools + dynamische Tools
GET /admin/router/scores    → Feedback-Scores aus Redis (gelernte Routen)
GET /admin/router/engine    → Routing-Engine Info (Regex + Semantik)
"""
from fastapi import APIRouter, Depends
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/admin/router", tags=["admin-router"])

_INTENT_MAP = [
    {"intent": "transport",        "label": "ÖV / SBB Abfrage",   "tool_key": "sbb_transport",   "status": "tool",    "method": "regex+semantic"},
    {"intent": "web_fetch",        "label": "Web-Zugriff (URL)",   "tool_key": "web_fetch",        "status": "tool",    "method": "regex+semantic"},
    {"intent": "web_search",       "label": "Web-Suche",           "tool_key": "web_search",       "status": "tool",    "method": "regex+semantic"},
    {"intent": "image_generation", "label": "Bild-Generierung",    "tool_key": "image_generation", "status": "tool",    "method": "regex+semantic"},
    {"intent": "image_input",      "label": "Bild-Analyse",        "tool_key": None,               "status": "vision",  "method": "regex"},
    {"intent": "document",         "label": "Dokument-Analyse",    "tool_key": None,               "status": "llm",     "method": "regex+semantic"},
    {"intent": "email",            "label": "E-Mail",              "tool_key": None,               "status": "gap",     "method": "regex+semantic"},
    {"intent": "calendar",         "label": "Kalender / Termine",  "tool_key": None,               "status": "gap",     "method": "regex"},
    {"intent": "conversation",     "label": "Gespräch / Fallback", "tool_key": None,               "status": "llm",     "method": "fallback"},
    {"intent": "blocked",          "label": "Blockiert (Guard)",   "tool_key": None,               "status": "blocked", "method": "regex"},
]


@router.get("/overview")
async def get_router_overview(_admin: Customer = Depends(require_admin)):
    from services.tool_registry import TOOL_CATALOG
    from services.agent_router import _load_dynamic_tool_keys

    tools = [
        {
            "key":         v["key"],
            "name":        v["name"],
            "description": v["description"],
            "category":    v["category"],
            "tier":        v["tier"],
        }
        for v in TOOL_CATALOG.values()
    ]

    dynamic_keys = _load_dynamic_tool_keys()

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


@router.get("/scores")
async def get_route_scores(_admin: Customer = Depends(require_admin)):
    """Feedback-Scores: welche Route hat Claude für welchen Intent erfolgreich genutzt."""
    try:
        import redis as redis_lib
        from core.config import settings
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)

        scores = []
        for key in r.scan_iter("router:score:*"):
            parts = key.split(":")
            if len(parts) >= 4:
                intent = parts[2]
                route  = ":".join(parts[3:])
                score  = float(r.get(key) or 0)
                scores.append({"intent": intent, "route": route, "score": round(score, 3)})

        scores.sort(key=lambda x: (-x["score"], x["intent"]))
        return {"scores": scores}
    except Exception as e:
        return {"scores": [], "error": str(e)}


@router.get("/engine")
async def get_engine_info(_admin: Customer = Depends(require_admin)):
    """Routing-Engine: Regex-Muster + Semantik-Fallback (nomic-embed-text)."""
    from services.intent_vector_store import COLLECTION, THRESHOLD

    # Seed-Beispiele zählen
    seed_count = 0
    qdrant_ok = False
    try:
        from services.intent_vector_store import _get_client
        client = _get_client()
        seed_count = client.count(COLLECTION).count
        qdrant_ok = True
    except Exception:
        pass

    return {
        "type": "Hybrid (Regex + Semantic Embedding)",
        "stages": [
            {
                "order": 1,
                "name": "Content Guard",
                "description": "Regex-Blockliste — illegale Inhalte sofort ablehnen",
                "latency_ms": "<1",
            },
            {
                "order": 2,
                "name": "Regex-Klassifizierung",
                "description": "Keyword-Muster für transport, web_search, image_generation etc.",
                "latency_ms": "<1",
            },
            {
                "order": 3,
                "name": "Semantisches Fallback",
                "description": f"nomic-embed-text Embedding → Qdrant Nearest-Neighbour (Score ≥ {THRESHOLD})",
                "latency_ms": "~50",
                "seed_examples": seed_count,
                "threshold": THRESHOLD,
                "qdrant_ok": qdrant_ok,
            },
        ],
        "fallback": "conversation → direkt an Claude",
    }
