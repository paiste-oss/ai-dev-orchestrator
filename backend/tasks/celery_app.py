from celery import Celery
from celery.schedules import crontab
from core.config import settings

celery_app = Celery(
    "aibuddy",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["tasks.summaries", "tasks.reminders", "tasks.dev_task_processor", "tasks.memory_manager"],
)

celery_app.conf.beat_schedule = {
    "daily-summary": {
        "task": "tasks.summaries.daily_summary",
        "schedule": crontab(hour=20, minute=0),
    },
    "process-dev-tasks": {
        "task": "tasks.dev_task_processor.process_dev_tasks",
        "schedule": 30.0,  # alle 30 Sekunden
    },
}

celery_app.conf.timezone = "Europe/Zurich"
