"""
Training Reminder Task — sendet E-Mail-Erinnerungen vor Trainingseinheiten.

Läuft alle 5 Minuten. Pro aktivem Trainingsplan wird geprüft:
  1. Ist heute ein Trainingstag laut Wochenplan?
  2. Fällt der aktuelle Zeitpunkt in das Erinnerungsfenster (±5 Min vor reminder_time)?
  3. Wurde heute noch keine Erinnerung gesendet (Deduplizierung via last_reminded_at)?
→ Wenn ja: E-Mail senden, last_reminded_at aktualisieren.
"""
import asyncio
import logging
import smtplib
from datetime import datetime, timedelta
from email.message import EmailMessage

from tasks.celery_app import celery_app
from core.config import settings

_log = logging.getLogger(__name__)

_WEEKDAY_MAP = {
    0: "monday",
    1: "tuesday",
    2: "wednesday",
    3: "thursday",
    4: "friday",
    5: "saturday",
    6: "sunday",
}

# Fenster in dem eine Erinnerung als "pünktlich" gilt (±5 Minuten)
_WINDOW_MINUTES = 5


@celery_app.task(name="tasks.training_reminders.check_training_reminders", ignore_result=True)
def check_training_reminders() -> None:
    asyncio.run(_run())


async def _run() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select
    from models.training_reminder import TrainingReminder

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

        to_remind: list[TrainingReminder] = []
        for reminder in reminders:
            if _should_remind(reminder):
                to_remind.append(reminder)

        if not to_remind:
            return

        async with Session() as db:
            for reminder in to_remind:
                db_reminder = await db.get(TrainingReminder, reminder.id)
                if db_reminder and db_reminder.is_active:
                    _send_reminder_email(db_reminder)
                    db_reminder.last_reminded_at = datetime.utcnow()
                    _log.info(
                        "Trainingserinnerung gesendet: customer=%s type=%s",
                        db_reminder.customer_id,
                        db_reminder.training_type,
                    )
            await db.commit()
    finally:
        await engine.dispose()


def _should_remind(reminder) -> bool:
    """Prüft ob jetzt eine Erinnerung für diesen Plan fällig ist."""
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

    day_entry = schedule[today_key]
    training_time_str = day_entry.get("time", "")
    if not training_time_str:
        return False

    try:
        t_hour, t_min = map(int, training_time_str.split(":"))
    except (ValueError, AttributeError):
        return False

    # Zeitpunkt der Erinnerung = Trainingszeit minus reminder_minutes_before
    training_dt = now_local.replace(hour=t_hour, minute=t_min, second=0, microsecond=0)
    reminder_dt = training_dt - timedelta(minutes=reminder.reminder_minutes_before)

    # Prüfen ob now_local im Fenster [reminder_dt - WINDOW, reminder_dt + WINDOW]
    diff_seconds = abs((now_local - reminder_dt).total_seconds())
    if diff_seconds > _WINDOW_MINUTES * 60:
        return False

    # Deduplizierung: wurde heute bereits erinnert?
    if reminder.last_reminded_at:
        last_reminded_local = reminder.last_reminded_at.replace(tzinfo=None)
        # last_reminded_at ist UTC, now_local ist lokal — wir prüfen nur auf Tagesbasis (UTC)
        now_utc = datetime.utcnow()
        if (now_utc - reminder.last_reminded_at).total_seconds() < 23 * 3600:
            return False

    return True


def _send_reminder_email(reminder) -> None:
    if not settings.system_smtp_host or not settings.system_smtp_user:
        _log.warning(
            "SYSTEM_SMTP nicht konfiguriert — Trainingserinnerung für %s kann nicht gesendet werden.",
            reminder.training_type,
        )
        return

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

    duration_str = f" ({duration} Minuten)" if duration else ""
    subject = f"Baddi Erinnerung: {reminder.training_type} startet in {reminder.reminder_minutes_before} Minuten"
    body = (
        f"Hallo,\n\n"
        f"dein Training startet gleich!\n\n"
        f"  Training:   {reminder.training_type}{duration_str}\n"
        f"  Uhrzeit:    {training_time} Uhr\n"
        f"  Vorbereitung: {reminder.reminder_minutes_before} Minuten\n\n"
        f"Viel Erfolg beim Training!\n\n"
        f"Dein Baddi\n"
        f"https://baddi.ch"
    )

    try:
        msg = EmailMessage()
        msg["From"] = settings.system_smtp_from
        msg["To"] = reminder.email
        msg["Subject"] = subject
        msg.set_content(body)

        with smtplib.SMTP(settings.system_smtp_host, settings.system_smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.system_smtp_user, settings.system_smtp_password)
            server.send_message(msg)

        _log.info("Trainingserinnerung gesendet an %s", reminder.email)
    except Exception as e:
        _log.error("Trainingserinnerung konnte nicht gesendet werden: %s", e)
