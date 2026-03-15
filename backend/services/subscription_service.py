"""
Subscription Service — Paywall
==============================
Prüft ob ein Kunde berechtigt ist, einen bestimmten Service zu verwenden.

Abo-Stufen und ihre Services:
  free       → kein Service
  starter    → smtp, twilio
  pro        → smtp, twilio, slack, google_sheets
  enterprise → smtp, twilio, slack, google_sheets, google_docs, google_calendar, custom

Die erlaubten Services stehen in SubscriptionPlan.features["allowed_services"].
Wenn kein Plan hinterlegt ist, wird "free" angenommen.

Verwendung:
    from services.subscription_service import require_service

    await require_service(db, customer_id, "smtp")
    # → wirft HTTP 402 wenn nicht erlaubt, sonst nichts
"""

import uuid
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.customer import Customer, SubscriptionPlan

# Fallback-Definitionen falls kein Plan in der DB hinterlegt ist
DEFAULT_PLANS: dict[str, list[str]] = {
    "free":       [],
    "starter":    ["smtp", "twilio"],
    "pro":        ["smtp", "twilio", "slack", "google_sheets"],
    "enterprise": ["smtp", "twilio", "slack", "google_sheets", "google_docs", "google_calendar", "custom"],
}


async def get_allowed_services(db: AsyncSession, customer_id: uuid.UUID) -> list[str]:
    """Gibt die erlaubten Services für einen Kunden zurück."""
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if not customer:
        return []

    if customer.subscription_plan_id is None:
        return []  # free

    plan_result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.id == customer.subscription_plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return []

    # Plan.features kann "allowed_services" enthalten, sonst Fallback über Plan-Name
    if isinstance(plan.features, dict) and "allowed_services" in plan.features:
        return plan.features["allowed_services"]

    return DEFAULT_PLANS.get(plan.name.lower(), [])


async def can_use_service(
    db: AsyncSession,
    customer_id: uuid.UUID,
    service: str,
) -> bool:
    allowed = await get_allowed_services(db, customer_id)
    return service in allowed


async def require_service(
    db: AsyncSession,
    customer_id: uuid.UUID,
    service: str,
) -> None:
    """
    Wirft HTTP 402 wenn der Kunde den Service nicht abonniert hat.
    Wirft HTTP 403 wenn der Kunde nicht existiert.
    """
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=403, detail="Kunde nicht gefunden.")

    if not await can_use_service(db, customer_id, service):
        raise HTTPException(
            status_code=402,
            detail=f"Service '{service}' ist in deinem aktuellen Abo nicht enthalten. Bitte upgrade dein Paket.",
        )
