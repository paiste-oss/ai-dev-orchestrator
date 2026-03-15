"""
Finance API — CAPEX/cost overview for the entire project.
Admin-only. Pre-seeds known default costs on first load.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer
from models.finance import CostEntry

router = APIRouter(prefix="/finance", tags=["finance"])


# ── Default seed data ─────────────────────────────────────────────────────────

_DEFAULTS = [
    # APIs
    dict(name="Gemini API", provider="Google", category="api",
         billing_cycle="nutzungsbasiert", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://console.cloud.google.com/billing",
         notes="Gemini 2.0 Flash: $0.075 / 1M input tokens. Free tier verfügbar."),
    dict(name="OpenAI API (ChatGPT Fallback)", provider="OpenAI", category="api",
         billing_cycle="nutzungsbasiert", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://platform.openai.com/usage",
         notes="GPT-4o Mini: $0.15 / 1M input tokens. Nur als Fallback aktiv."),
    dict(name="Anthropic Claude API", provider="Anthropic", category="api",
         billing_cycle="nutzungsbasiert", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://console.anthropic.com",
         notes="Claude Sonnet 4.6: $3 / 1M input tokens. Für komplexe Tasks."),
    # Abonnements
    dict(name="Cloudflare Zero Trust Tunnel", provider="Cloudflare", category="abo",
         billing_cycle="monatlich", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://dash.cloudflare.com",
         notes="Free Tier. Tunnelt baddi.ch & baddi.me ins lokale Setup."),
    dict(name="n8n (Self-hosted)", provider="n8n", category="abo",
         billing_cycle="monatlich", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://n8n.io",
         notes="Self-hosted via Docker — keine Lizenzkosten."),
    # Infrastruktur
    dict(name="Domain baddi.ch", provider="Registrar", category="infrastruktur",
         billing_cycle="jährlich", amount_original=15.0, currency="CHF",
         amount_chf_monthly=round(15.0 / 12, 2),
         url="",
         notes=".ch Domain — jährliche Verlängerung."),
    dict(name="Domain baddi.me", provider="Registrar", category="infrastruktur",
         billing_cycle="jährlich", amount_original=15.0, currency="CHF",
         amount_chf_monthly=round(15.0 / 12, 2),
         url="",
         notes=".me Domain — jährliche Verlängerung."),
    dict(name="Server / VPS", provider="", category="infrastruktur",
         billing_cycle="monatlich", amount_original=0.0, currency="CHF",
         amount_chf_monthly=0.0,
         url="",
         notes="Bitte Hosting-Kosten hier eintragen."),
    # Entwicklung
    dict(name="Claude Code (Anthropic)", provider="Anthropic", category="entwicklung",
         billing_cycle="monatlich", amount_original=100.0, currency="USD",
         amount_chf_monthly=90.0,
         url="https://claude.ai",
         notes="Claude Code Pro Plan für Entwicklung."),
]


async def _seed_defaults(db: AsyncSession) -> None:
    count = await db.scalar(select(func.count()).select_from(CostEntry))
    if count and count > 0:
        return
    for d in _DEFAULTS:
        db.add(CostEntry(**d))
    await db.commit()


# ── Schemas ────────────────────────────────────────────────────────────────────

class CostEntryIn(BaseModel):
    name: str
    provider: str
    category: str
    billing_cycle: str
    amount_original: float = 0.0
    currency: str = "CHF"
    amount_chf_monthly: float = 0.0
    url: str | None = None
    notes: str | None = None
    is_active: bool = True


class CostEntryOut(BaseModel):
    id: str
    name: str
    provider: str
    category: str
    billing_cycle: str
    amount_original: float
    currency: str
    amount_chf_monthly: float
    url: str | None
    notes: str | None
    is_active: bool
    created_at: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/costs", response_model=list[CostEntryOut])
async def list_costs(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _seed_defaults(db)
    result = await db.execute(
        select(CostEntry).order_by(CostEntry.category, CostEntry.name)
    )
    return [
        CostEntryOut(
            id=e.id, name=e.name, provider=e.provider, category=e.category,
            billing_cycle=e.billing_cycle, amount_original=e.amount_original,
            currency=e.currency, amount_chf_monthly=e.amount_chf_monthly,
            url=e.url, notes=e.notes, is_active=e.is_active,
            created_at=e.created_at.isoformat(),
        )
        for e in result.scalars().all()
    ]


@router.post("/costs", response_model=CostEntryOut, status_code=201)
async def create_cost(
    data: CostEntryIn,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    entry = CostEntry(**data.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return CostEntryOut(
        id=entry.id, name=entry.name, provider=entry.provider, category=entry.category,
        billing_cycle=entry.billing_cycle, amount_original=entry.amount_original,
        currency=entry.currency, amount_chf_monthly=entry.amount_chf_monthly,
        url=entry.url, notes=entry.notes, is_active=entry.is_active,
        created_at=entry.created_at.isoformat(),
    )


@router.patch("/costs/{entry_id}", response_model=CostEntryOut)
async def update_cost(
    entry_id: str,
    data: CostEntryIn,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CostEntry).where(CostEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    for field, value in data.model_dump().items():
        setattr(entry, field, value)
    await db.commit()
    await db.refresh(entry)
    return CostEntryOut(
        id=entry.id, name=entry.name, provider=entry.provider, category=entry.category,
        billing_cycle=entry.billing_cycle, amount_original=entry.amount_original,
        currency=entry.currency, amount_chf_monthly=entry.amount_chf_monthly,
        url=entry.url, notes=entry.notes, is_active=entry.is_active,
        created_at=entry.created_at.isoformat(),
    )


@router.delete("/costs/{entry_id}", status_code=204)
async def delete_cost(
    entry_id: str,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CostEntry).where(CostEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    await db.delete(entry)
    await db.commit()
    return Response(status_code=204)
