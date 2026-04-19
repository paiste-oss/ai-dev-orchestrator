"""
Billing Plans — Endpunkte für Plan-Verwaltung.

Endpunkte:
  GET  /billing/plans              — Alle Pläne (öffentlich)
  GET  /billing/status             — Aktueller Status des eingeloggten Kunden
  GET  /billing/admin/overview     — Admin: Revenue-Übersicht
  GET  /billing/admin/plans        — Admin: Alle Pläne inkl. Stripe Price IDs
  PUT  /billing/admin/plans/{id}   — Admin: Plan aktualisieren
  GET  /billing/admin/stripe-status — Admin: Stripe-Konfigurationsstatus
"""
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings as _cfg
from core.database import get_db
from core.dependencies import get_current_user, require_admin
from models.customer import Customer, SubscriptionPlan
from models.payment import Payment
from services.billing_service import seed_plans

from .billing_schemas import PlanOut, BillingStatusOut, PlanAdminOut, PlanAdminUpdate

router = APIRouter()


# ── Pläne ─────────────────────────────────────────────────────────────────────

@router.get("/plans", response_model=list[PlanOut])
async def list_plans(db: AsyncSession = Depends(get_db)):
    """Alle verfügbaren Pläne — öffentlich, kein Login nötig."""
    await seed_plans(db)
    result = await db.execute(
        select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order)
    )
    plans = result.scalars().all()
    out = []
    for p in plans:
        monthly = float(p.monthly_price or 0)
        yearly = float(p.yearly_price or 0)
        yearly_mo = round(yearly / 12, 2) if yearly else 0
        discount = round((1 - yearly_mo / monthly) * 100) if monthly > 0 and yearly_mo > 0 else 0
        out.append(PlanOut(
            id=str(p.id),
            name=p.name,
            slug=p.slug or p.name.lower(),
            monthly_price=monthly,
            yearly_price=yearly,
            yearly_monthly_equivalent=yearly_mo,
            yearly_discount_percent=discount,
            included_tokens=p.included_tokens or 500_000,
            daily_token_limit=p.daily_token_limit,
            requests_per_hour=p.requests_per_hour,
            token_overage_chf_per_1k=float(p.token_overage_chf_per_1k or 0.002),
            max_buddies=p.max_buddies or 1,
            features=p.features or {},
            sort_order=p.sort_order or 0,
        ))
    return out


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=BillingStatusOut)
async def billing_status(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan: SubscriptionPlan | None = None
    if customer.subscription_plan_id:
        plan = await db.get(SubscriptionPlan, customer.subscription_plan_id)

    return BillingStatusOut(
        plan_name=plan.name if plan else None,
        plan_slug=getattr(plan, "slug", None) if plan else None,
        subscription_status=customer.subscription_status or "inactive",
        billing_cycle=customer.billing_cycle or "monthly",
        subscription_period_end=(
            customer.subscription_period_end.isoformat()
            if customer.subscription_period_end else None
        ),
        tokens_used_this_period=customer.tokens_used_this_period or 0,
        tokens_included=plan.included_tokens if plan else 0,
        token_balance_chf=float(customer.token_balance_chf or 0),
        overage_rate_chf_per_1k=float(plan.token_overage_chf_per_1k or 0.002) if plan else 0.002,
        tos_accepted=customer.tos_accepted_at is not None,
    )


# ── Admin: Revenue-Übersicht ──────────────────────────────────────────────────

@router.get("/admin/overview")
async def admin_billing_overview(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: Revenue, aktive Abos, Token-Verbrauch."""
    # Aktive Kunden pro Plan
    plan_counts = await db.execute(
        select(SubscriptionPlan.name, func.count(Customer.id).label("count"))
        .join(Customer, Customer.subscription_plan_id == SubscriptionPlan.id, isouter=True)
        .where(Customer.subscription_status == "active")
        .group_by(SubscriptionPlan.name)
    )

    # Revenue dieser Woche und gesamt
    total_revenue = await db.scalar(
        select(func.sum(Payment.amount_chf))
        .where(Payment.status == "succeeded")
    ) or 0.0

    monthly_revenue = await db.scalar(
        select(func.sum(Payment.amount_chf))
        .where(
            Payment.status == "succeeded",
            func.date_trunc("month", Payment.paid_at) == func.date_trunc("month", func.now()),
        )
    ) or 0.0

    active_subs = await db.scalar(
        select(func.count(Customer.id))
        .where(Customer.subscription_status == "active")
    ) or 0

    past_due = await db.scalar(
        select(func.count(Customer.id))
        .where(Customer.subscription_status == "past_due")
    ) or 0

    return {
        "total_revenue_chf": float(total_revenue),
        "monthly_revenue_chf": float(monthly_revenue),
        "active_subscriptions": active_subs,
        "past_due": past_due,
        "by_plan": [{"plan": row[0], "count": row[1]} for row in plan_counts],
    }


# ── Admin: Pläne ───────────────────────────────────────────────────────────────

@router.get("/admin/plans", response_model=list[PlanAdminOut])
async def admin_list_plans(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Alle Pläne inkl. Stripe Price IDs."""
    await seed_plans(db)
    result = await db.execute(select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order))
    plans = result.scalars().all()
    return [
        PlanAdminOut(
            id=str(p.id),
            name=p.name,
            slug=p.slug or "",
            monthly_price=float(p.monthly_price or 0),
            yearly_price=float(p.yearly_price or 0),
            included_tokens=p.included_tokens or 0,
            daily_token_limit=p.daily_token_limit,
            requests_per_hour=p.requests_per_hour,
            token_overage_chf_per_1k=float(p.token_overage_chf_per_1k or 0),
            storage_limit_bytes=p.storage_limit_bytes or 524_288_000,
            max_buddies=p.max_buddies or 1,
            features=p.features or {},
            sort_order=p.sort_order or 0,
            stripe_price_id_monthly=p.stripe_price_id_monthly,
            stripe_price_id_yearly=p.stripe_price_id_yearly,
        )
        for p in plans
    ]


@router.put("/admin/plans/{plan_id}", response_model=PlanAdminOut)
async def admin_update_plan(
    plan_id: str,
    data: PlanAdminUpdate,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Plan-Details und Stripe Price IDs aktualisieren."""
    from sqlalchemy.orm.attributes import flag_modified
    plan = await db.get(SubscriptionPlan, _uuid.UUID(plan_id))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(plan, field, value)
    flag_modified(plan, "features")  # JSON-Feld explizit als geändert markieren
    await db.commit()
    await db.refresh(plan)
    return PlanAdminOut(
        id=str(plan.id),
        name=plan.name,
        slug=plan.slug or "",
        monthly_price=float(plan.monthly_price or 0),
        yearly_price=float(plan.yearly_price or 0),
        included_tokens=plan.included_tokens or 0,
        daily_token_limit=plan.daily_token_limit,
        requests_per_hour=plan.requests_per_hour,
        token_overage_chf_per_1k=float(plan.token_overage_chf_per_1k or 0),
        storage_limit_bytes=plan.storage_limit_bytes or 524_288_000,
        max_buddies=plan.max_buddies or 1,
        features=plan.features or {},
        sort_order=plan.sort_order or 0,
        stripe_price_id_monthly=plan.stripe_price_id_monthly,
        stripe_price_id_yearly=plan.stripe_price_id_yearly,
    )


# ── Admin: Stripe-Status ───────────────────────────────────────────────────────

@router.get("/admin/stripe-status")
async def admin_stripe_status(_: Customer = Depends(require_admin)):
    """Admin: Stripe-Konfigurationsstatus (Keys vorhanden, Webhook-URL)."""
    return {
        "secret_key_set": bool(_cfg.stripe_secret_key),
        "webhook_secret_set": bool(_cfg.stripe_webhook_secret),
        "price_ids": {
            "basis_monthly":   _cfg.stripe_price_basis_monthly or None,
            "basis_yearly":    _cfg.stripe_price_basis_yearly or None,
            "komfort_monthly": _cfg.stripe_price_komfort_monthly or None,
            "komfort_yearly":  _cfg.stripe_price_komfort_yearly or None,
            "premium_monthly": _cfg.stripe_price_premium_monthly or None,
            "premium_yearly":  _cfg.stripe_price_premium_yearly or None,
        },
    }
