"""
Finance API — CAPEX/cost overview + Revenue overview for the entire project.
Admin-only. Pre-seeds known default costs on first load.
"""
from datetime import datetime, date, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from pydantic import BaseModel
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer, SubscriptionPlan
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
         url="https://platform.openai.com/settings/organization/billing/overview",
         notes="GPT-4o Mini: $0.15 / 1M input tokens. Nur als Fallback aktiv."),
    dict(name="Anthropic Claude API", provider="Anthropic", category="api",
         billing_cycle="nutzungsbasiert", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://console.anthropic.com/settings/billing",
         notes="Claude Sonnet 4.6: $3 / 1M input tokens. Für komplexe Tasks."),
    # Abonnements
    dict(name="Cloudflare Zero Trust Tunnel", provider="Cloudflare", category="abo",
         billing_cycle="monatlich", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://dash.cloudflare.com/?to=/:account/billing",
         notes="Free Tier. Tunnelt baddi.ch & baddi.me ins lokale Setup."),
    dict(name="n8n (Self-hosted)", provider="n8n", category="abo",
         billing_cycle="monatlich", amount_original=0.0, currency="USD",
         amount_chf_monthly=0.0,
         url="https://app.n8n.cloud/billing",
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
         url="https://console.anthropic.com/settings/billing",
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
    balance_chf: float | None = None
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
    balance_chf: float | None
    balance_updated_at: str | None
    is_active: bool
    created_at: str


def _to_out(e: CostEntry) -> CostEntryOut:
    return CostEntryOut(
        id=e.id, name=e.name, provider=e.provider, category=e.category,
        billing_cycle=e.billing_cycle, amount_original=e.amount_original,
        currency=e.currency, amount_chf_monthly=e.amount_chf_monthly,
        url=e.url, notes=e.notes,
        balance_chf=e.balance_chf,
        balance_updated_at=e.balance_updated_at.isoformat() if e.balance_updated_at else None,
        is_active=e.is_active,
        created_at=e.created_at.isoformat(),
    )


# ── Schemas: Revenue ──────────────────────────────────────────────────────────

class CustomerRevenueRow(BaseModel):
    """Einnahmen-Zeile pro Kunde."""
    customer_id: str
    customer_name: str
    customer_email: str
    is_active: bool
    registered_at: str
    plan_name: str | None
    monthly_price_chf: float
    # Hochgerechnete Werte
    revenue_monthly_chf: float
    revenue_yearly_chf: float


class RevenueOverview(BaseModel):
    """Aggregierte Einnahmen-Übersicht."""
    # KPIs
    total_monthly_chf: float
    total_yearly_chf: float
    paying_customers: int
    free_customers: int
    total_customers: int
    avg_revenue_per_paying_customer: float
    # Aufschlüsselung nach Plan
    by_plan: dict[str, dict]              # plan_name → {count, monthly_chf}
    # Einzelne Kunden
    customers: list[CustomerRevenueRow]


# ── Endpoints: Costs ──────────────────────────────────────────────────────────

@router.get("/costs", response_model=list[CostEntryOut])
async def list_costs(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _seed_defaults(db)
    result = await db.execute(
        select(CostEntry).order_by(CostEntry.category, CostEntry.name)
    )
    return [_to_out(e) for e in result.scalars().all()]


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
    return _to_out(entry)


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

    payload = data.model_dump()
    # Wenn Balance geändert wurde → Zeitstempel setzen
    if payload.get("balance_chf") != entry.balance_chf:
        payload["balance_updated_at"] = datetime.utcnow()

    for field, value in payload.items():
        setattr(entry, field, value)
    await db.commit()
    await db.refresh(entry)
    return _to_out(entry)


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


# ── Endpoints: Revenue ────────────────────────────────────────────────────────

@router.get("/revenue", response_model=RevenueOverview)
async def get_revenue(
    plan: str | None = Query(None, description="Filter nach Plan-Name"),
    is_active: bool | None = Query(None, description="Nur aktive / inaktive Kunden"),
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Gibt eine vollständige Einnahmen-Übersicht zurück.
    Berechnet Einnahmen anhand der SubscriptionPlan.monthly_price jedes Kunden.
    Kunden ohne Plan werden als CHF 0.00 (Free) gezählt.
    """
    # Kunden mit optionalem Join auf SubscriptionPlan laden
    query = (
        select(Customer, SubscriptionPlan)
        .outerjoin(SubscriptionPlan, Customer.subscription_plan_id == SubscriptionPlan.id)
        .where(Customer.role != "admin")  # Admins aus Einnahmen ausschliessen
    )

    # Optionale Filter
    if is_active is not None:
        query = query.where(Customer.is_active == is_active)
    if plan:
        query = query.where(
            SubscriptionPlan.name.ilike(f"%{plan}%")
        )

    query = query.order_by(Customer.created_at.desc())
    result = await db.execute(query)
    rows = result.all()

    # Aggregation
    customer_rows: list[CustomerRevenueRow] = []
    total_monthly = 0.0
    paying_count = 0
    free_count = 0
    by_plan: dict[str, dict] = {}

    for customer, sub_plan in rows:
        price = float(sub_plan.monthly_price) if sub_plan else 0.0
        plan_name = sub_plan.name if sub_plan else None

        total_monthly += price
        if price > 0:
            paying_count += 1
        else:
            free_count += 1

        # Plan-Aggregation
        plan_key = plan_name or "Kein Plan (Free)"
        if plan_key not in by_plan:
            by_plan[plan_key] = {"count": 0, "monthly_chf": 0.0}
        by_plan[plan_key]["count"] += 1
        by_plan[plan_key]["monthly_chf"] = round(by_plan[plan_key]["monthly_chf"] + price, 2)

        customer_rows.append(CustomerRevenueRow(
            customer_id=str(customer.id),
            customer_name=customer.name,
            customer_email=customer.email,
            is_active=customer.is_active,
            registered_at=customer.created_at.isoformat(),
            plan_name=plan_name,
            monthly_price_chf=price,
            revenue_monthly_chf=price,
            revenue_yearly_chf=round(price * 12, 2),
        ))

    total_yearly = round(total_monthly * 12, 2)
    avg_revenue = round(total_monthly / paying_count, 2) if paying_count > 0 else 0.0

    return RevenueOverview(
        total_monthly_chf=round(total_monthly, 2),
        total_yearly_chf=total_yearly,
        paying_customers=paying_count,
        free_customers=free_count,
        total_customers=len(customer_rows),
        avg_revenue_per_paying_customer=avg_revenue,
        by_plan=by_plan,
        customers=customer_rows,
    )


# ── Live usage (best-effort) ───────────────────────────────────────────────────

@router.get("/usage")
async def get_live_usage(_: Customer = Depends(require_admin)):
    """
    Fetch usage data directly from provider APIs.
    Returns partial results — missing providers are omitted, not errors.
    """
    result: dict = {}
    today = date.today()
    month_start = today.replace(day=1)

    # ── OpenAI ──────────────────────────────────────────────────────────────
    if settings.openai_api_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.openai.com/v1/dashboard/billing/usage",
                    headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                    params={
                        "start_date": month_start.isoformat(),
                        "end_date": (today + timedelta(days=1)).isoformat(),
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # total_usage ist in Cent
                    total_usd = data.get("total_usage", 0) / 100
                    result["openai"] = {
                        "total_usd": round(total_usd, 4),
                        "total_chf": round(total_usd * 0.90, 4),
                        "period": f"{month_start} – {today}",
                        "url": "https://platform.openai.com/settings/organization/billing/overview",
                    }
        except Exception:
            pass

    # ── Anthropic ────────────────────────────────────────────────────────────
    # Anthropic hat keinen öffentlichen Usage-API
    if settings.anthropic_api_key:
        result["anthropic"] = {
            "note": "Kein öffentlicher Usage-API verfügbar.",
            "url": "https://console.anthropic.com/settings/billing",
        }

    # ── Google Gemini ────────────────────────────────────────────────────────
    # Erfordert OAuth2
    if settings.gemini_api_key:
        result["gemini"] = {
            "note": "Erfordert Google Cloud OAuth2 — manuell prüfen.",
            "url": "https://console.cloud.google.com/billing",
        }

    return result
