from datetime import datetime, timedelta
import uuid
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional
from core.database import get_db
from core.dependencies import require_admin
from core.redis_client import redis_sync
from core.config import settings
from models.customer import Customer
from models.dev_task import DevTask

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
async def list_tasks(db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    result = await db.execute(
        select(DevTask).order_by(DevTask.priority, DevTask.created_at)
    )
    tasks = result.scalars().all()
    return [_serialize(t) for t in tasks]


@router.post("", status_code=201)
async def create_task(body: TaskCreate, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
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
async def get_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    task = await _get_or_404(db, task_id)
    return _serialize(task)


@router.patch("/{task_id}")
async def update_task(task_id: uuid.UUID, body: TaskUpdate, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    task = await _get_or_404(db, task_id)
    if body.priority is not None:
        task.priority = body.priority
    if body.status == "cancelled" and task.status in ("pending", "paused"):
        task.status = "cancelled"
    await db.commit()
    await db.refresh(task)
    return _serialize(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    task = await _get_or_404(db, task_id)
    if task.status == "running":
        raise HTTPException(status_code=409, detail="Laufende Tasks können nicht gelöscht werden.")
    await db.delete(task)
    await db.commit()


@router.post("/{task_id}/retry")
async def retry_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
    """Setzt einen failed/paused Task manuell auf pending zurück."""
    task = await _get_or_404(db, task_id)
    if task.status not in ("failed", "paused", "cancelled", "running"):
        raise HTTPException(status_code=409, detail=f"Task ist '{task.status}', nicht retrybar.")
    task.status = "pending"
    task.retry_after = None
    task.error = None
    await db.commit()
    await db.refresh(task)
    return _serialize(task)


@router.post("/{task_id}/run-now")
async def run_now(task_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: Customer = Depends(require_admin)):
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
        live = redis_sync().get(f"devtask:output:{t.id}")
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


# ---------------------------------------------------------------------------
# Runner-Endpoints (WSL Claude Code Runner — geschützt via X-Runner-Secret)
# ---------------------------------------------------------------------------

def _require_runner(x_runner_secret: Optional[str] = Header(default=None)):
    if not settings.runner_secret or x_runner_secret != settings.runner_secret:
        raise HTTPException(status_code=401, detail="Ungültiger Runner-Secret.")


@router.get("/runner/next")
async def runner_next_task(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_runner),
):
    """Gibt den nächsten ausstehenden Task zurück und markiert ihn als 'running'."""
    now = datetime.utcnow()

    # Erst: pausierte Tasks die retry_after überschritten haben
    result = await db.execute(
        select(DevTask)
        .where(DevTask.status == "paused", DevTask.retry_after <= now)
        .order_by(DevTask.priority, DevTask.created_at)
        .limit(1)
    )
    task = result.scalar_one_or_none()

    if not task:
        result = await db.execute(
            select(DevTask)
            .where(DevTask.status == "pending")
            .order_by(DevTask.priority, DevTask.created_at)
            .limit(1)
        )
        task = result.scalar_one_or_none()

    if not task:
        return None

    task.status = "running"
    task.started_at = task.started_at or now
    await db.commit()
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "context_snapshot": task.context_snapshot,
    }


class RunnerOutput(BaseModel):
    output: str


class RunnerComplete(BaseModel):
    output: str
    tokens: int = 0


class RunnerFail(BaseModel):
    output: str
    error: str


class RunnerPause(BaseModel):
    output: str
    retry_after_seconds: int = 60
    context: list = []
    tokens: int = 0


@router.post("/runner/{task_id}/output")
async def runner_push_output(
    task_id: uuid.UUID,
    body: RunnerOutput,
    _: None = Depends(_require_runner),
):
    """Streamt Live-Output in Redis (sichtbar in der UI während Claude läuft)."""
    redis_sync().set(f"devtask:output:{task_id}", body.output, ex=3600)
    return {"ok": True}


@router.post("/runner/{task_id}/complete")
async def runner_complete(
    task_id: uuid.UUID,
    body: RunnerComplete,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_runner),
):
    """Markiert einen Task als abgeschlossen."""
    task = await _get_or_404(db, task_id)
    task.status = "completed"
    task.output = body.output
    task.token_usage = (task.token_usage or 0) + body.tokens
    task.completed_at = datetime.utcnow()
    task.context_snapshot = None
    task.retry_after = None
    await db.commit()
    redis_sync().delete(f"devtask:output:{task_id}")
    return {"ok": True}


@router.post("/runner/{task_id}/fail")
async def runner_fail(
    task_id: uuid.UUID,
    body: RunnerFail,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_runner),
):
    """Markiert einen Task als fehlgeschlagen."""
    task = await _get_or_404(db, task_id)
    task.status = "failed"
    task.output = body.output
    task.error = body.error
    await db.commit()
    redis_sync().delete(f"devtask:output:{task_id}")
    return {"ok": True}


@router.post("/runner/{task_id}/pause")
async def runner_pause(
    task_id: uuid.UUID,
    body: RunnerPause,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_runner),
):
    """Pausiert einen Task (Rate Limit) — Runner nimmt ihn nach retry_after wieder auf."""
    task = await _get_or_404(db, task_id)
    task.status = "paused"
    task.output = body.output
    task.token_usage = (task.token_usage or 0) + body.tokens
    task.retry_after = datetime.utcnow() + timedelta(seconds=max(body.retry_after_seconds, 60))
    task.context_snapshot = {"messages": body.context} if body.context else task.context_snapshot
    await db.commit()
    redis_sync().delete(f"devtask:output:{task_id}")
    return {"ok": True}


async def _get_or_404(db: AsyncSession, task_id: uuid.UUID) -> DevTask:
    result = await db.execute(select(DevTask).where(DevTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")
    return task
