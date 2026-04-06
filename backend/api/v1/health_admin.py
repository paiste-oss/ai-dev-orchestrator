"""
Health Admin API — System-Status, Sentry Error-Übersicht und Tagesreports für die Admin-UI.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select, desc
from core.database import AsyncSessionLocal
from core.dependencies import require_admin
from models.customer import Customer
from models.daily_summary import DailySummary

router = APIRouter(prefix="/system", tags=["system"])
_log = logging.getLogger(__name__)


@router.get("/health")
async def get_health(_: Customer = Depends(require_admin)):
    """Gibt gecachten Health-Status + Sentry-Infos zurück."""
    from tasks.health_monitor import get_current_status

    status = get_current_status()

    # Sentry-Informationen (falls konfiguriert)
    sentry_info = _get_sentry_info()

    return {
        "services": status,
        "sentry": sentry_info,
    }


@router.get("/tagesreport")
async def get_tagesreport(
    limit: int = Query(default=30, le=100),
    _: Customer = Depends(require_admin),
):
    """Gibt die letzten Tagesreporte zurück (neueste zuerst)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DailySummary)
            .order_by(desc(DailySummary.created_at))
            .limit(limit)
        )
        summaries = result.scalars().all()
    return [
        {
            "id":         str(s.id),
            "created_at": s.created_at.isoformat(),
            "content":    s.content,
        }
        for s in summaries
    ]


@router.post("/tagesreport/trigger")
async def trigger_tagesreport(
    bg: BackgroundTasks,
    _: Customer = Depends(require_admin),
):
    """Löst sofort einen Tagesreport aus — läuft direkt im Backend, unabhängig von Celery."""
    from tasks.summaries import _run
    bg.add_task(_run)
    return {"status": "gestartet"}


def _get_sentry_info() -> dict:
    from core.config import settings
    if not settings.sentry_dsn:
        return {"configured": False}

    # Sentry DSN parst sich zu: https://<key>@<ingest-host>/<project_id>
    try:
        dsn = settings.sentry_dsn
        project_id = dsn.rstrip("/").split("/")[-1]
        # Sentry Cloud: Issues immer unter sentry.io/organizations/<org>/issues/
        org = settings.sentry_org or "sentry"
        issues_url = f"https://sentry.io/organizations/{org}/issues/?project={project_id}"
        return {
            "configured": True,
            "issues_url": issues_url,
            "project_id": project_id,
        }
    except Exception:
        return {"configured": True, "issues_url": None}
