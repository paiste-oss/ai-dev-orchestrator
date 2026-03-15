from celery import Celery
from celery.schedules import crontab
from core.config import settings

celery_app = Celery(
    "aibuddy",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["tasks.summaries", "tasks.reminders"],
)

celery_app.conf.beat_schedule = {
    "daily-summary": {
        "task": "tasks.summaries.daily_summary",
        "schedule": crontab(hour=20, minute=0),
    },
}

celery_app.conf.timezone = "Europe/Zurich"
