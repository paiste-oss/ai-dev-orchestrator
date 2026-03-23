"""
customers.py — Aggregator-Router für alle /customers Endpunkte.

Untermodule:
  customers_schemas      — Pydantic-Models, SERVICE_SCHEMAS, MODEL_CHF_PER_1K
  customers_routes       — Core CRUD: list, get, create, update, delete, toggle-active, memory-consent
  customers_stats        — Verbrauchs-/Usage-Endpunkte: stats, usage
  customers_credentials  — Zugangsdaten-Verwaltung pro Service
  customers_notes        — Notizen-CRUD
"""
from fastapi import APIRouter
from . import customers_routes, customers_stats, customers_credentials, customers_notes

router = APIRouter(prefix="/customers", tags=["customers"])

router.include_router(customers_routes.router)
router.include_router(customers_stats.router)
router.include_router(customers_credentials.router)
router.include_router(customers_notes.router)
