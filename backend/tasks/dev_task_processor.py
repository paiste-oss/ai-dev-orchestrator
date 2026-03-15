"""
Dev Task Processor — Celery Task
=================================
Läuft alle 30 Sekunden (via Celery Beat) und:
  1. Nimmt pausierte Tasks wieder auf wenn retry_after abgelaufen ist
  2. Verarbeitet den nächsten ausstehenden Task (nach priority, created_at)

Nur jeweils EIN Task läuft gleichzeitig um API-Limits nicht zu überlasten.
"""

import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select
from core.database import AsyncSessionLocal
from models.dev_task import DevTask
from services import task_runner
from tasks.celery_app import celery_app


@celery_app.task(name="tasks.dev_task_processor.process_dev_tasks")
def process_dev_tasks():
    """Celery-Task: prüft Queue und verarbeitet nächste Aufgabe."""
    asyncio.run(_run())


async def _run():
    async with AsyncSessionLocal() as db:
        task = await _get_next_task(db)
        if not task:
            return

        # Als "running" markieren
        task.status = "running"
        task.started_at = task.started_at or datetime.utcnow()
        await db.commit()

        # Task runner aufrufen (synchron — blockiert bis fertig oder rate-limited)
        try:
            result = task_runner.run_task(
                description=task.description,
                messages_snapshot=task.context_snapshot.get("messages") if task.context_snapshot else None,
                existing_output=task.output or "",
            )
        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            await db.commit()
            return

        # Ergebnis in DB schreiben
        task.output = result.get("output", "")
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
