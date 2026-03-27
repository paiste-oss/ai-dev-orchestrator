from celery import Celery
from celery.schedules import crontab
from core.config import settings

celery_app = Celery(
    "aibuddy",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "tasks.summaries",
        "tasks.reminders",
        "tasks.dev_task_processor",
        "tasks.memory_manager",
        "tasks.stock_alerts",
        "tasks.training_reminders",
        "tasks.knowledge_ingestion",
    ],
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
    "check-stock-alerts": {
        "task": "tasks.stock_alerts.check_stock_alerts",
        "schedule": crontab(minute="*/15", hour="7-22", day_of_week="mon-fri"),
    },
    "check-training-reminders": {
        "task": "tasks.training_reminders.check_training_reminders",
        "schedule": crontab(minute="*/5"),
    },
    "refresh-knowledge": {
        "task": "tasks.knowledge_ingestion.refresh_all_sources",
        "schedule": crontab(hour=3, minute=0, day_of_week="sun"),  # Sonntags 03:00
    },
}

celery_app.conf.timezone = "Europe/Zurich"
