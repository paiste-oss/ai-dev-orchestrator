"""
Content Guard Admin API — Übersicht und Test des Content Guards.

GET  /admin/router/content-guard  → Aktive Kategorien + Beispielmuster
POST /admin/router/test           → Testet eine Nachricht gegen den Content Guard
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.dependencies import require_admin
from models.customer import Customer

router = APIRouter(prefix="/admin/router", tags=["admin-router"])


_CATEGORIES = [
    {
        "id": "csam",
        "label": "Kindesmissbrauch / CSAM",
        "description": "Sexuelle Inhalte mit Minderjährigen",
        "examples": [
            "kinderpornograph*",
            "child.*porn / csam",
            "kinder.*sexuell",
            "minderj. sexuell",
        ],
        "severity": "critical",
    },
    {
        "id": "terrorism",
        "label": "Bomben & Terror",
        "description": "Anleitungen zu Sprengstoff, Anschlägen und Terrorismus",
        "examples": [
            "bombenanleitung",
            "sprengstoff.*bauen",
            "anschlag.*planen",
            "how to make bomb",
        ],
        "severity": "critical",
    },
    {
        "id": "torture",
        "label": "Folter-Anleitungen",
        "description": "Detaillierte Anleitungen zur Folter von Menschen",
        "examples": [
            "anleitung.*folter",
            "torture.*instructions",
        ],
        "severity": "high",
    },
    {
        "id": "mass_violence",
        "label": "Massengewalt",
        "description": "Planung von Massenerschießungen und vergleichbaren Gewalttaten",
        "examples": [
            "massenerschießung.*planen",
        ],
        "severity": "critical",
    },
    {
        "id": "animal_torture",
        "label": "Tierquälerei",
        "description": "Anleitungen zur Qual oder Tötung von Tieren",
        "examples": [
            "tiere.*qual.*anleitung",
            "animal.*torture.*how",
        ],
        "severity": "high",
    },
]


@router.get("/content-guard")
async def get_content_guard(_admin: Customer = Depends(require_admin)):
    """Gibt alle aktiven Content-Guard-Kategorien zurück."""
    return {
        "active": True,
        "mode": "regex",
        "categories": _CATEGORIES,
        "total_patterns": sum(len(c["examples"]) for c in _CATEGORIES),
    }


class TestRequest(BaseModel):
    message: str


@router.post("/test")
async def test_message(data: TestRequest, _admin: Customer = Depends(require_admin)):
    """Testet eine Nachricht gegen den Content Guard."""
    from services.agent_router import route, _CONTENT_GUARD_PATTERNS
    import re

    result = route(data.message)

    # Welche Kategorie hat getroffen?
    matched_category = None
    matched_pattern = None
    if result.blocked:
        m = _CONTENT_GUARD_PATTERNS.search(data.message)
        if m:
            matched_pattern = m.group(0)
            for cat in _CATEGORIES:
                for ex in cat["examples"]:
                    # Grobe Zuordnung über Schlüsselwörter
                    kw = ex.split(".*")[0].replace("*", "").lower()
                    if kw in matched_pattern.lower():
                        matched_category = cat["label"]
                        break
                if matched_category:
                    break

    return {
        "blocked": result.blocked,
        "matched_pattern": matched_pattern,
        "matched_category": matched_category,
        "message_preview": data.message[:120],
    }
