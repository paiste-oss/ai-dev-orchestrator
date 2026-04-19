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
    """Gibt gecachten Health-Status, Hardware-Metriken und Sentry-Infos zurück."""
    from tasks.health_monitor import get_current_status, get_hw_stats

    return {
        "services": get_current_status(),
        "hardware": get_hw_stats(),
        "sentry":   _get_sentry_info(),
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


@router.get("/backups")
async def list_backups(_: Customer = Depends(require_admin)):
    """Listet alle Backup-Einträge aus dem S3-Bucket baddi-backups."""
    from services.s3_storage import _get_client
    from core.config import settings

    BACKUP_BUCKET = "baddi-backups"
    FILES_BUCKET = "baddi-files"
    try:
        s3 = _get_client()
        paginator = s3.get_paginator("list_objects_v2")

        # ── Backup-Einträge gruppiert nach Datum-Prefix ───────────────────────
        prefixes: dict[str, dict] = {}
        for page in paginator.paginate(Bucket=BACKUP_BUCKET, Delimiter="/"):
            for cp in page.get("CommonPrefixes", []):
                prefix = cp["Prefix"].rstrip("/")
                prefixes[prefix] = {"date": prefix, "files": [], "total_bytes": 0}
        for prefix in prefixes:
            for page in paginator.paginate(Bucket=BACKUP_BUCKET, Prefix=prefix + "/"):
                for obj in page.get("Contents", []):
                    fname = obj["Key"].split("/")[-1]
                    prefixes[prefix]["files"].append({
                        "name": fname,
                        "size_bytes": obj["Size"],
                        "last_modified": obj["LastModified"].isoformat(),
                    })
                    prefixes[prefix]["total_bytes"] += obj["Size"]
        backups = sorted(prefixes.values(), key=lambda x: x["date"], reverse=True)

        # ── Storage-Totals pro Bucket ─────────────────────────────────────────
        def _bucket_total(bucket: str) -> int:
            total = 0
            for page in paginator.paginate(Bucket=bucket):
                for obj in page.get("Contents", []):
                    total += obj["Size"]
            return total

        storage = {
            "files_bytes": _bucket_total(FILES_BUCKET),
            "backups_bytes": _bucket_total(BACKUP_BUCKET),
        }
        storage["total_bytes"] = storage["files_bytes"] + storage["backups_bytes"]

        return {"ok": True, "backups": backups, "storage": storage}
    except Exception as e:
        _log.error("Backup-Liste konnte nicht geladen werden: %s", e)
        return {"ok": False, "backups": [], "error": str(e)[:120]}


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
