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
import subprocess
import redis as redis_lib
from datetime import datetime, timedelta,timezone
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
    """Celery-Task: stellt sicher dass hängende Tasks zurückgesetzt werden.
    Die eigentliche Ausführung übernimmt der WSL Claude Code Runner."""
    asyncio.run(_recover_long_running())


async def _recover_long_running():
    """Setzt Tasks zurück die seit >10 Minuten 'running' sind (Runner-Absturz)."""
    Session, engine = _make_session()
    try:
        async with Session() as db:
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=10)
            result = await db.execute(
                select(DevTask).where(
                    DevTask.status == "running",
                    DevTask.started_at <= cutoff,
                )
            )
            stuck = result.scalars().all()
            for t in stuck:
                t.status = "pending"
                t.context_snapshot = None
            if stuck:
                await db.commit()
    finally:
        await engine.dispose()


async def _get_next_task(db) -> DevTask | None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)

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
