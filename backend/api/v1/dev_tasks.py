from datetime import datetime
import uuid
import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.config import settings
from core.database import get_db
from models.dev_task import DevTask

_redis = redis_lib.from_url(settings.redis_url, decode_responses=True)

router = APIRouter(prefix="/dev-tasks", tags=["dev-orchestrator"])


class TaskCreate(BaseModel):
    title: str
    description: str
    priority: int = 10  # 1 = höchste Priorität


class TaskUpdate(BaseModel):
    priority: int | None = None
    status: str | None = None  # für manuelles cancel


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DevTask).order_by(DevTask.priority, DevTask.created_at)
    )
    tasks = result.scalars().all()
    return [_serialize(t) for t in tasks]


@router.post("", status_code=201)
async def create_task(body: TaskCreate, db: AsyncSession = Depends(get_db)):
    task = DevTask(
        title=body.title,
        description=body.description,
        priority=body.priority,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _serialize(task)


@router.get("/{task_id}")
async def get_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    task = await _get_or_404(db, task_id)
    return _serialize(task)


@router.patch("/{task_id}")
async def update_task(task_id: uuid.UUID, body: TaskUpdate, db: AsyncSession = Depends(get_db)):
    task = await _get_or_404(db, task_id)
    if body.priority is not None:
        task.priority = body.priority
    if body.status == "cancelled" and task.status in ("pending", "paused"):
        task.status = "cancelled"
    await db.commit()
    await db.refresh(task)
    return _serialize(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    task = await _get_or_404(db, task_id)
    if task.status == "running":
        raise HTTPException(status_code=409, detail="Laufende Tasks können nicht gelöscht werden.")
    await db.delete(task)
    await db.commit()


@router.post("/{task_id}/retry")
async def retry_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Setzt einen failed/paused Task manuell auf pending zurück."""
    task = await _get_or_404(db, task_id)
    if task.status not in ("failed", "paused", "cancelled"):
        raise HTTPException(status_code=409, detail=f"Task ist '{task.status}', nicht retrybar.")
    task.status = "pending"
    task.retry_after = None
    task.error = None
    await db.commit()
    await db.refresh(task)
    return _serialize(task)


@router.post("/{task_id}/run-now")
async def run_now(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Löst sofortige Verarbeitung aus (überspringt Queue-Reihenfolge)."""
    task = await _get_or_404(db, task_id)
    if task.status not in ("pending", "paused"):
        raise HTTPException(status_code=409, detail=f"Task ist '{task.status}', nicht startbar.")

    from tasks.dev_task_processor import process_dev_tasks
    # Priorität temporär auf 0 setzen damit Celery diesen zuerst nimmt
    task.priority = 0
    if task.status == "paused":
        task.status = "pending"
        task.retry_after = None
    await db.commit()

    process_dev_tasks.delay()
    return {"status": "queued"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(t: DevTask) -> dict:
    # Bei laufenden Tasks: Live-Output aus Redis holen
    output = t.output
    if t.status == "running":
        live = _redis.get(f"devtask:output:{t.id}")
        if live:
            output = live

    return {
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "priority": t.priority,
        "status": t.status,
        "output": output,
        "error": t.error,
        "token_usage": t.token_usage,
        "retry_after": t.retry_after.isoformat() if t.retry_after else None,
        "created_at": t.created_at.isoformat(),
        "started_at": t.started_at.isoformat() if t.started_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


async def _get_or_404(db: AsyncSession, task_id: uuid.UUID) -> DevTask:
    result = await db.execute(select(DevTask).where(DevTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")
    return task
