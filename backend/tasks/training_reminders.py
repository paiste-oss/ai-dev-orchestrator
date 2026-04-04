"""
Training Reminder Task — sendet Erinnerungen vor Trainingseinheiten.

Läuft alle 5 Minuten. Pro aktivem Trainingsplan wird geprüft:
  1. Ist heute ein Trainingstag laut Wochenplan?
  2. Fällt der aktuelle Zeitpunkt in das Erinnerungsfenster (±5 Min vor reminder_time)?
  3. Wurde heute noch keine Erinnerung gesendet (Deduplizierung via last_reminded_at)?
→ Wenn ja: Benachrichtigung über Kunden-Präferenz (SMS/E-Mail), last_reminded_at aktualisieren.
"""
import asyncio
import logging
from datetime import datetime, timedelta,timezone

from tasks.celery_app import celery_app
from core.config import settings

_log = logging.getLogger(__name__)

_WEEKDAY_MAP = {
    0: "monday", 1: "tuesday", 2: "wednesday", 3: "thursday",
    4: "friday", 5: "saturday", 6: "sunday",
}

_WINDOW_MINUTES = 5


@celery_app.task(name="tasks.training_reminders.check_training_reminders", ignore_result=True)
def check_training_reminders() -> None:
    asyncio.run(_run())


async def _run() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select
    from models.training_reminder import TrainingReminder
    from models.customer import Customer

    engine = create_async_engine(settings.database_url, pool_size=2, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await db.execute(
                select(TrainingReminder).where(TrainingReminder.is_active.is_(True))
            )
            reminders = result.scalars().all()

        if not reminders:
            return

        to_remind = [r for r in reminders if _should_remind(r)]
        if not to_remind:
            return

        async with Session() as db:
            for reminder in to_remind:
                db_reminder = await db.get(TrainingReminder, reminder.id)
                if not db_reminder or not db_reminder.is_active:
                    continue

                # Kunden laden für Kanal-Präferenz
                customer = await db.get(Customer, db_reminder.customer_id) if db_reminder.customer_id else None
                await _notify(customer, db_reminder)
                db_reminder.last_reminded_at = datetime.now(timezone.utc)
                _log.info(
                    "Trainingserinnerung gesendet: customer=%s type=%s",
                    db_reminder.customer_id, db_reminder.training_type,
                )
            await db.commit()
    finally:
        await engine.dispose()


async def _notify(customer, reminder) -> None:
    from services.notification_service import notify_customer

    schedule = reminder.weekly_schedule or {}
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(reminder.timezone or "Europe/Zurich")
    except Exception:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("Europe/Zurich")

    now_local = datetime.now(tz)
    today_key = _WEEKDAY_MAP[now_local.weekday()]
    day_entry = schedule.get(today_key, {})
    training_time = day_entry.get("time", "?")
    duration = day_entry.get("duration_minutes")
    duration_str = f" ({duration} Min.)" if duration else ""

    subject = f"Baddi Erinnerung: {reminder.training_type} in {reminder.reminder_minutes_before} Min."
    message = (
        f"Training startet gleich!\n"
        f"{reminder.training_type}{duration_str} um {training_time} Uhr\n"
        f"Viel Erfolg! — baddi.ch"
    )

    if customer:
        await notify_customer(customer, message, subject)
    else:
        # Fallback: direkt per E-Mail an hinterlegte Reminder-E-Mail
        _send_email_fallback(reminder.email, subject, message)


def _should_remind(reminder) -> bool:
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(reminder.timezone or "Europe/Zurich")
    except Exception:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("Europe/Zurich")

    now_local = datetime.now(tz)
    today_key = _WEEKDAY_MAP[now_local.weekday()]
    schedule = reminder.weekly_schedule or {}
    if today_key not in schedule:
        return False

    training_time_str = schedule[today_key].get("time", "")
    if not training_time_str:
        return False

    try:
        t_hour, t_min = map(int, training_time_str.split(":"))
    except (ValueError, AttributeError):
        return False

    training_dt = now_local.replace(hour=t_hour, minute=t_min, second=0, microsecond=0)
    reminder_dt = training_dt - timedelta(minutes=reminder.reminder_minutes_before)

    if abs((now_local - reminder_dt).total_seconds()) > _WINDOW_MINUTES * 60:
        return False

    # Deduplizierung: heute bereits erinnert?
    if reminder.last_reminded_at:
        if (datetime.now(timezone.utc) - reminder.last_reminded_at).total_seconds() < 23 * 3600:
            return False

    return True


def _send_email_fallback(to_email: str, subject: str, body: str) -> None:
    import smtplib
    from email.message import EmailMessage
    if not settings.system_smtp_host or not to_email:
        return
    try:
        msg = EmailMessage()
        msg["From"] = settings.system_smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(settings.system_smtp_host, settings.system_smtp_port) as server:
            server.starttls()
            server.login(settings.system_smtp_user, settings.system_smtp_password)
            server.send_message(msg)
    except Exception as e:
        _log.error("Fallback-E-Mail fehlgeschlagen: %s", e)
