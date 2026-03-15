from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.config import settings
import httpx

router = APIRouter(prefix="/workflows", tags=["workflows"])

N8N_HEADERS = {"X-N8N-API-KEY": settings.n8n_api_key, "Content-Type": "application/json"}


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
