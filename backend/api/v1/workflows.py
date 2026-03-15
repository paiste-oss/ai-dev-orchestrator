from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.config import settings
from core.dependencies import require_admin
from models.customer import Customer
from services import n8n_client
import httpx

router = APIRouter(prefix="/workflows", tags=["workflows"])

N8N_HEADERS = {"X-N8N-API-KEY": settings.n8n_api_key, "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# n8n Workflow-Verwaltung (Admin)
# ---------------------------------------------------------------------------

@router.get("")
async def list_workflows():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{settings.n8n_base_url}/api/v1/workflows", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


@router.get("/{n8n_id}")
async def get_workflow(n8n_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{settings.n8n_base_url}/api/v1/workflows/{n8n_id}", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


@router.post("/{n8n_id}/activate")
async def activate_workflow(n8n_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{settings.n8n_base_url}/api/v1/workflows/{n8n_id}/activate", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return {"status": "activated", "id": n8n_id}


@router.post("/{n8n_id}/deactivate")
async def deactivate_workflow(n8n_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{settings.n8n_base_url}/api/v1/workflows/{n8n_id}/deactivate", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return {"status": "deactivated", "id": n8n_id}


@router.delete("/{n8n_id}")
async def delete_workflow(n8n_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.delete(f"{settings.n8n_base_url}/api/v1/workflows/{n8n_id}", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return {"status": "deleted", "id": n8n_id}


# ---------------------------------------------------------------------------
# n8n Service-Trigger  →  POST /workflows/services/{service_name}
#
# Ruft einen n8n-Workflow auf, dessen Webhook-Pfad /webhook/service-{name} ist.
#
# Verfügbare Services (n8n-Workflows anlegen):
#   service-send-email      → E-Mail versenden
#   service-send-sms        → SMS versenden
#   service-notify-slack    → Slack-Nachricht
#   service-calendar-event  → Kalendereintrag erstellen
#   service-export-pdf      → PDF generieren und versenden
# ---------------------------------------------------------------------------

class ServicePayload(BaseModel):
    payload: dict = {}


@router.post("/services/{service_name}")
async def trigger_service(service_name: str, body: ServicePayload):
    """
    Löst einen n8n-Service-Workflow aus.
    n8n-Workflow muss den Webhook-Pfad  /webhook/service-{service_name}  haben.
    """
    result = await n8n_client.trigger(service_name, body.payload)
    return {"service": service_name, "result": result}


# ---------------------------------------------------------------------------
# Backend-Tasks (Celery Beat)
# ---------------------------------------------------------------------------

CELERY_TASKS = [
    {
        "name": "tasks.summaries.daily_summary",
        "label": "Tägliche Zusammenfassung",
        "description": "Erstellt eine KI-Zusammenfassung des aktuellen Projektstands.",
        "schedule": "Täglich um 20:00 Uhr",
        "type": "scheduled",
    },
    {
        "name": "tasks.dev_task_processor.process_dev_tasks",
        "label": "Dev-Task Prozessor",
        "description": "Verarbeitet ausstehende Entwickler-Aufgaben (Dev Orchestrator).",
        "schedule": "Alle 30 Sekunden",
        "type": "scheduled",
    },
    {
        "name": "tasks.reminders.send_reminder",
        "label": "Erinnerung senden",
        "description": "Sendet eine proaktive Erinnerung über einen Buddy (manuell oder per Trigger).",
        "schedule": "Manuell",
        "type": "manual",
    },
]


@router.get("/celery")
async def list_celery_tasks(_: Customer = Depends(require_admin)):
    """Gibt alle bekannten Celery-Tasks zurück."""
    return CELERY_TASKS


@router.post("/celery/{task_name}/trigger")
async def trigger_celery_task(task_name: str, _: Customer = Depends(require_admin)):
    """Löst einen Celery-Task manuell aus."""
    from tasks.celery_app import celery_app
    known = {t["name"] for t in CELERY_TASKS}
    if task_name not in known:
        raise HTTPException(status_code=404, detail="Task nicht gefunden")
    celery_app.send_task(task_name)
    return {"triggered": task_name}
