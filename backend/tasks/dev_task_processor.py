"""
Dev Task Processor — Celery Task
=================================
Läuft alle 30 Sekunden (via Celery Beat) und:
  1. Nimmt pausierte Tasks wieder auf wenn retry_after abgelaufen ist
  2. Verarbeitet den nächsten ausstehenden Task (nach priority, created_at)

Live-Output: wird während der Arbeit in Redis geschrieben (Key: devtask:output:{id})
damit das Frontend echtzeitnah den Fortschritt zeigen kann.
"""

import asyncio
import redis as redis_lib
from datetime import datetime, timedelta
from sqlalchemy import select, update
from core.config import settings
from core.database import AsyncSessionLocal
from models.dev_task import DevTask
from services import task_runner
from tasks.celery_app import celery_app
from celery.signals import worker_ready


@worker_ready.connect
def recover_stuck_tasks(**kwargs):
    """Beim Worker-Start: alle hängenden 'running' Tasks auf 'pending' zurücksetzen."""
    asyncio.run(_recover_stuck())

_redis = redis_lib.from_url(settings.redis_url, decode_responses=True)

REDIS_OUTPUT_TTL = 3600  # 1 Stunde


async def _recover_stuck():
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(DevTask)
            .where(DevTask.status == "running")
            .values(status="pending", context_snapshot=None)
        )
        await db.commit()


@celery_app.task(name="tasks.dev_task_processor.process_dev_tasks")
def process_dev_tasks():
    """Celery-Task: prüft Queue und verarbeitet nächste Aufgabe."""
    asyncio.run(_run())


async def _run():
    async with AsyncSessionLocal() as db:
        task = await _get_next_task(db)
        if not task:
            return

        task_id = str(task.id)

        # Als "running" markieren
        task.status = "running"
        task.started_at = task.started_at or datetime.utcnow()
        await db.commit()

        # Redis-Callback: schreibt Live-Output nach jedem Schritt
        def progress_callback(output: str):
            _redis.set(f"devtask:output:{task_id}", output, ex=REDIS_OUTPUT_TTL)

        # Task runner aufrufen (synchron — blockiert bis fertig oder rate-limited)
        try:
            result = task_runner.run_task(
                description=task.description,
                messages_snapshot=task.context_snapshot.get("messages") if task.context_snapshot else None,
                existing_output=task.output or "",
                progress_callback=progress_callback,
            )
        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            _redis.delete(f"devtask:output:{task_id}")
            await db.commit()
            return

        # Finalen Output aus Redis holen (falls letzter callback nicht mehr ausgeführt wurde)
        final_output = result.get("output") or _redis.get(f"devtask:output:{task_id}") or ""
        _redis.delete(f"devtask:output:{task_id}")

        task.output = final_output
        task.token_usage = (task.token_usage or 0) + result.get("tokens", 0)

        if result["status"] == "paused":
            retry_after_s = result.get("retry_after_seconds", 60)
            task.status = "paused"
            task.retry_after = datetime.utcnow() + timedelta(seconds=retry_after_s)
            task.context_snapshot = {"messages": result.get("context", [])}

        elif result["status"] == "completed":
            task.status = "completed"
            task.completed_at = datetime.utcnow()
            task.context_snapshot = None
            task.retry_after = None

        else:  # failed
            task.status = "failed"
            task.error = result.get("error", "Unbekannter Fehler")
            task.context_snapshot = None

        await db.commit()


async def _get_next_task(db) -> DevTask | None:
    """Gibt den nächsten verarbeitbaren Task zurück (paused zuerst, dann pending)."""
    now = datetime.utcnow()

    # Erst: pausierte Tasks die wieder bereit sind
    result = await db.execute(
        select(DevTask)
        .where(DevTask.status == "paused", DevTask.retry_after <= now)
        .order_by(DevTask.priority, DevTask.created_at)
        .limit(1)
    )
    task = result.scalar_one_or_none()
    if task:
        return task

    # Dann: neue ausstehende Tasks
    result = await db.execute(
        select(DevTask)
        .where(DevTask.status == "pending")
        .order_by(DevTask.priority, DevTask.created_at)
        .limit(1)
    )
    return result.scalar_one_or_none()
