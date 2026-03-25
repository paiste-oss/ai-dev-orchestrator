"""Handler für Training-Reminder Tools: create/list/delete."""
from __future__ import annotations
from typing import Any

_WEEKDAYS_DE = {
    "monday": "Montag",
    "tuesday": "Dienstag",
    "wednesday": "Mittwoch",
    "thursday": "Donnerstag",
    "friday": "Freitag",
    "saturday": "Samstag",
    "sunday": "Sonntag",
}

_VALID_DAYS = set(_WEEKDAYS_DE.keys())


async def _handle_training_reminders(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    from core.database import AsyncSessionLocal
    from models.training_reminder import TrainingReminder
    from models.customer import Customer
    from sqlalchemy import select
    import uuid as uuid_mod

    if not customer_id:
        return {"error": "Kunden-ID fehlt."}

    async with AsyncSessionLocal() as db:
        if tool_name == "create_training_reminder":
            email = tool_input.get("email")
            if not email:
                cust = await db.get(Customer, uuid_mod.UUID(customer_id))
                email = cust.email if cust else None
            if not email:
                return {"error": "Keine E-Mail-Adresse gefunden."}

            training_type = tool_input.get("training_type", "Training")
            weekly_schedule = tool_input.get("weekly_schedule", {})
            reminder_minutes = int(tool_input.get("reminder_minutes_before", 30))
            timezone = tool_input.get("timezone", "Europe/Zurich")

            # Validierung: Tagnamen prüfen
            invalid_days = [d for d in weekly_schedule if d not in _VALID_DAYS]
            if invalid_days:
                return {"error": f"Ungültige Wochentage: {invalid_days}. Erlaubt: {sorted(_VALID_DAYS)}"}

            reminder = TrainingReminder(
                customer_id=uuid_mod.UUID(customer_id),
                email=email,
                training_type=training_type,
                weekly_schedule=weekly_schedule,
                reminder_minutes_before=reminder_minutes,
                timezone=timezone,
            )
            db.add(reminder)
            await db.commit()
            await db.refresh(reminder)

            # Zusammenfassung für Antwort
            schedule_summary = ", ".join(
                f"{_WEEKDAYS_DE[day]} {info['time']}"
                for day, info in weekly_schedule.items()
                if day in _WEEKDAYS_DE
            )
            return {
                "success": True,
                "reminder_id": str(reminder.id),
                "message": (
                    f"Trainingsplan gespeichert!\n"
                    f"Training: {training_type}\n"
                    f"Termine: {schedule_summary}\n"
                    f"Erinnerung: {reminder_minutes} Minuten vorher per E-Mail an {email}\n"
                    f"Du wirst rechtzeitig erinnert, wenn dein Training ansteht."
                ),
            }

        elif tool_name == "list_training_reminders":
            result = await db.execute(
                select(TrainingReminder)
                .where(
                    TrainingReminder.customer_id == uuid_mod.UUID(customer_id),
                    TrainingReminder.is_active.is_(True),
                )
                .order_by(TrainingReminder.created_at.desc())
            )
            reminders = result.scalars().all()
            if not reminders:
                return {"reminders": [], "message": "Keine aktiven Trainingspläne."}

            return {
                "reminders": [
                    {
                        "id": str(r.id),
                        "training_type": r.training_type,
                        "weekly_schedule": r.weekly_schedule,
                        "reminder_minutes_before": r.reminder_minutes_before,
                        "email": r.email,
                        "timezone": r.timezone,
                        "created_at": r.created_at.strftime("%d.%m.%Y"),
                    }
                    for r in reminders
                ]
            }

        elif tool_name == "delete_training_reminder":
            reminder_id = tool_input.get("reminder_id")
            if not reminder_id:
                return {"error": "reminder_id fehlt."}
            reminder = await db.get(TrainingReminder, uuid_mod.UUID(reminder_id))
            if not reminder or str(reminder.customer_id) != customer_id:
                return {"error": "Trainingsplan nicht gefunden."}
            reminder.is_active = False
            await db.commit()
            return {"success": True, "message": f"Trainingsplan '{reminder.training_type}' wurde gelöscht."}

    return {"error": f"Unbekanntes Tool: {tool_name}"}
