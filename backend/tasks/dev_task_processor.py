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
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.config import settings
from models.dev_task import DevTask
from services import task_runner
from tasks.celery_app import celery_app
from celery.signals import worker_ready

_redis = redis_lib.from_url(settings.redis_url, decode_responses=True)
REDIS_OUTPUT_TTL = 3600  # 1 Stunde


def _make_session():
    """Frische DB-Engine + Session pro Aufruf — verhindert asyncpg-Konflikte bei parallelen Celery-Tasks."""
    engine = create_async_engine(settings.database_url, echo=False, pool_size=1, max_overflow=0)
    return async_sessionmaker(engine, expire_on_commit=False), engine


@worker_ready.connect
def recover_stuck_tasks(**kwargs):
    """Beim Worker-Start: hängende 'running' Tasks auf 'pending' zurücksetzen."""
    asyncio.run(_recover_stuck())


async def _recover_stuck():
    Session, engine = _make_session()
    try:
        async with Session() as db:
            await db.execute(
                update(DevTask)
                .where(DevTask.status == "running")
                .values(status="pending", context_snapshot=None)
            )
            await db.commit()
    finally:
        await engine.dispose()


@celery_app.task(name="tasks.dev_task_processor.process_dev_tasks")
def process_dev_tasks():
    """Celery-Task: prüft Queue und verarbeitet nächste Aufgabe."""
    asyncio.run(_run())


async def _run():
    Session, engine = _make_session()
    try:
        async with Session() as db:
            task = await _get_next_task(db)
            if not task:
                return

            task_id = str(task.id)
            task.status = "running"
            task.started_at = task.started_at or datetime.utcnow()
            await db.commit()

        # Session schliessen bevor task_runner läuft (blockiert lange)
        # Eigene Session für das Schreiben des Ergebnisses
        def progress_callback(output: str):
            _redis.set(f"devtask:output:{task_id}", output, ex=REDIS_OUTPUT_TTL)

        try:
            result = task_runner.run_task(
                description=task.description,
                messages_snapshot=task.context_snapshot.get("messages") if task.context_snapshot else None,
                existing_output=task.output or "",
                progress_callback=progress_callback,
            )
        except Exception as e:
            async with Session() as db2:
                res = await db2.execute(select(DevTask).where(DevTask.id == task.id))
                t = res.scalar_one()
                t.status = "failed"
                t.error = str(e)
                await db2.commit()
            _redis.delete(f"devtask:output:{task_id}")
            return

        final_output = result.get("output") or _redis.get(f"devtask:output:{task_id}") or ""
        _redis.delete(f"devtask:output:{task_id}")

        async with Session() as db3:
            res = await db3.execute(select(DevTask).where(DevTask.id == task.id))
            t = res.scalar_one()
            t.output = final_output
            t.token_usage = (t.token_usage or 0) + result.get("tokens", 0)

            if result["status"] == "paused":
                # Mindestens 60s warten damit das TPM-Fenster (1 Minute) sicher zurückgesetzt ist
                retry_after_s = max(result.get("retry_after_seconds", 60), 60)
                t.status = "paused"
                t.retry_after = datetime.utcnow() + timedelta(seconds=retry_after_s)
                t.context_snapshot = {"messages": result.get("context", [])}
            elif result["status"] == "completed":
                t.status = "completed"
                t.completed_at = datetime.utcnow()
                t.context_snapshot = None
                t.retry_after = None
            else:
                t.status = "failed"
                t.error = result.get("error", "Unbekannter Fehler")
                t.context_snapshot = None

            await db3.commit()
    finally:
        await engine.dispose()


async def _get_next_task(db) -> DevTask | None:
    now = datetime.utcnow()

    # Erst: pausierte Tasks die wieder bereit sind
    r = await db.execute(
        select(DevTask)
        .where(DevTask.status == "paused", DevTask.retry_after <= now)
        .order_by(DevTask.priority, DevTask.created_at)
        .limit(1)
    )
    task = r.scalar_one_or_none()
    if task:
        return task

    # Dann: neue ausstehende Tasks
    r = await db.execute(
        select(DevTask)
        .where(DevTask.status == "pending")
        .order_by(DevTask.priority, DevTask.created_at)
        .limit(1)
    )
    return r.scalar_one_or_none()
