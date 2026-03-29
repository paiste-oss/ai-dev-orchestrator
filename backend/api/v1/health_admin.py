"""
Health Admin API — System-Status und Sentry Error-Übersicht für die Admin-UI.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends
from core.dependencies import require_admin
from models.customer import Customer

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


def _get_sentry_info() -> dict:
    from core.config import settings
    if not settings.sentry_dsn:
        return {"configured": False}

    # Sentry DSN parst sich zu: https://<key>@<host>/<project_id>
    try:
        dsn = settings.sentry_dsn
        project_id = dsn.rstrip("/").split("/")[-1]
        host = dsn.split("@")[-1].split("/")[0]
        # Sentry Issues URL — direkter Link ins Sentry Dashboard
        issues_url = f"https://{host}/organizations/sentry/issues/?project={project_id}"
        return {
            "configured": True,
            "issues_url": issues_url,
            "project_id": project_id,
        }
    except Exception:
        return {"configured": True, "issues_url": None}
