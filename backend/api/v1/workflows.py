from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.config import settings
from core.dependencies import require_admin
from models.customer import Customer
from services import n8n_client
from services.n8n_credentials import read_n8n_credentials
import httpx

router = APIRouter(prefix="/workflows", tags=["workflows"])

# ---------------------------------------------------------------------------
# Backend-Tasks (Celery Beat) — MUSS vor /{n8n_id} stehen (Route-Konflikt)
# ---------------------------------------------------------------------------

# CELERY_TASKS ist eine statische Deklaration der bekannten Hintergrundprozesse.
# Sie dient ausschliesslich der Admin-UI zur Anzeige und zum manuellen Triggern.
# Die eigentliche Task-Registrierung und den Zeitplan verwaltet Celery Beat (celery_app.py).
# Neue Tasks hier eintragen sobald sie in tasks/ implementiert sind.
CELERY_TASKS = [
    {
        "name": "tasks.memory_manager.process_memory",
        "label": "Memory Manager",
        "description": "Extrahiert dauerhaft Fakten über Kunden aus Gesprächen und speichert sie in Qdrant + PostgreSQL.",
        "schedule": "Nach jeder Chat-Antwort (event-gesteuert)",
        "type": "event",
        "cost": "api",
        "cost_detail": "~0.01–0.05 Rappen/Aufruf (Claude Haiku 4.5, Extraktion)",
    },
    {
        "name": "tasks.dev_task_processor.process_dev_tasks",
        "label": "Dev-Task Prozessor",
        "description": "Verarbeitet ausstehende Entwickler-Aufgaben (Dev Orchestrator). Pollt alle 30s.",
        "schedule": "Alle 30 Sekunden",
        "type": "scheduled",
        "cost": "api",
        "cost_detail": "Polling: ~0 / Echter Task: 3–25 Rappen (Claude Sonnet 4.6)",
    },
    {
        "name": "tasks.summaries.daily_summary",
        "label": "Tägliche Zusammenfassung",
        "description": "Erstellt eine KI-Zusammenfassung des aktuellen Projektstands.",
        "schedule": "Täglich um 20:00 Uhr",
        "type": "scheduled",
        "cost": "api",
        "cost_detail": "~0.01 Rappen/Tag (Claude Haiku)",
    },
    {
        "name": "tasks.reminders.send_reminder",
        "label": "Erinnerung senden",
        "description": "Sendet eine proaktive Erinnerung über einen Buddy. (Platzhalter — noch nicht aktiv implementiert)",
        "schedule": "Manuell",
        "type": "manual",
        "cost": "lokal",
        "cost_detail": "~0 (noch kein aktiver Code)",
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

N8N_HEADERS = {"X-N8N-API-KEY": settings.n8n_api_key, "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# n8n Workflow-Verwaltung (Admin)
# ---------------------------------------------------------------------------

@router.get("/credentials")
async def list_credentials(_: Customer = Depends(require_admin)):
    """Gibt entschlüsselte Credential-Metadaten (ohne Passwörter) aus der n8n-DB zurück."""
    import anyio
    return await anyio.to_thread.run_sync(read_n8n_credentials)


@router.get("")
async def list_workflows(_: Customer = Depends(require_admin)):
    import anyio
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{settings.n8n_base_url}/api/v1/workflows", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        data = r.json()
        creds_by_id = {c["id"]: c for c in await anyio.to_thread.run_sync(read_n8n_credentials)}
        for wf in data.get("data", []):
            cred_refs = []
            for node in wf.get("nodes", []):
                for cred_type, cred_ref in (node.get("credentials") or {}).items():
                    cred_id = cred_ref.get("id")
                    if cred_id and cred_id in creds_by_id:
                        cred_refs.append(creds_by_id[cred_id])
            wf["credentialDetails"] = cred_refs
        return data


@router.get("/{n8n_id}")
async def get_workflow(n8n_id: str, _: Customer = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{settings.n8n_base_url}/api/v1/workflows/{n8n_id}", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return r.json()


@router.post("/{n8n_id}/activate")
async def activate_workflow(n8n_id: str, _: Customer = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{settings.n8n_base_url}/api/v1/workflows/{n8n_id}/activate", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return {"status": "activated", "id": n8n_id}


@router.post("/{n8n_id}/deactivate")
async def deactivate_workflow(n8n_id: str, _: Customer = Depends(require_admin)):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{settings.n8n_base_url}/api/v1/workflows/{n8n_id}/deactivate", headers=N8N_HEADERS, timeout=10)
        r.raise_for_status()
        return {"status": "deactivated", "id": n8n_id}


@router.delete("/{n8n_id}")
async def delete_workflow(n8n_id: str, _: Customer = Depends(require_admin)):
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


