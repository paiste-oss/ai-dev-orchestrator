"""
GET /v1/user/active-reminders — Aktive Erinnerungen des Users (Aktien-Alerts + Trainings-Erinnerungen)
"""
from __future__ import annotations

from uuid import UUID
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.stock_alert import StockAlert
from models.training_reminder import TrainingReminder

router = APIRouter(prefix="/user", tags=["user"])


class StockAlertOut(BaseModel):
    id: UUID
    symbol: str
    company_name: str | None
    threshold: float
    direction: str
    currency: str


class TrainingReminderOut(BaseModel):
    id: UUID
    training_type: str
    weekly_schedule: dict[str, Any]
    reminder_minutes_before: int


class ActiveRemindersOut(BaseModel):
    stock_alerts: list[StockAlertOut]
    training_reminders: list[TrainingReminderOut]


@router.get("/active-reminders", response_model=ActiveRemindersOut)
async def get_active_reminders(
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveRemindersOut:
    alerts_res = await db.execute(
        select(StockAlert)
        .where(StockAlert.customer_id == user.id, StockAlert.is_active.is_(True))
        .order_by(StockAlert.created_at)
    )
    alerts = alerts_res.scalars().all()

    reminders_res = await db.execute(
        select(TrainingReminder)
        .where(TrainingReminder.customer_id == user.id, TrainingReminder.is_active.is_(True))
        .order_by(TrainingReminder.created_at)
    )
    reminders = reminders_res.scalars().all()

    return ActiveRemindersOut(
        stock_alerts=[
            StockAlertOut(
                id=a.id,
                symbol=a.symbol,
                company_name=a.company_name,
                threshold=a.threshold,
                direction=a.direction,
                currency=a.currency,
            )
            for a in alerts
        ],
        training_reminders=[
            TrainingReminderOut(
                id=r.id,
                training_type=r.training_type,
                weekly_schedule=r.weekly_schedule,
                reminder_minutes_before=r.reminder_minutes_before,
            )
            for r in reminders
        ],
    )
