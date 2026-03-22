"""
Content Guard Admin API — Übersicht und Test des Content Guards.

GET  /admin/router/content-guard  → Aktive Kategorien + Beispielmuster
POST /admin/router/test           → Testet eine Nachricht gegen den Content Guard
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from core.database import get_db
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


@router.get("/logs")
async def get_guard_logs(
    limit: int = Query(default=100, le=500),
    _admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Alle blockierten Anfragen — für Behörden-Auskunft."""
    from models.content_guard_log import ContentGuardLog

    result = await db.execute(
        select(ContentGuardLog)
        .order_by(ContentGuardLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()

    # Kundennamen nachladen
    customer_ids = list({l.customer_id for l in logs})
    customers: dict[str, Customer] = {}
    if customer_ids:
        cust_result = await db.execute(
            select(Customer).where(Customer.id.in_(customer_ids))
        )
        for c in cust_result.scalars().all():
            customers[str(c.id)] = c

    return {
        "total": len(logs),
        "logs": [
            {
                "id":              str(l.id),
                "customer_id":     l.customer_id,
                "customer_name":   customers[l.customer_id].name if l.customer_id in customers else "Unbekannt",
                "customer_email":  customers[l.customer_id].email if l.customer_id in customers else "—",
                "message":         l.message,
                "matched_pattern": l.matched_pattern,
                "created_at":      l.created_at.isoformat() + "Z",
            }
            for l in logs
        ],
    }
