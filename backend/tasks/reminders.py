from tasks.celery_app import celery_app


@celery_app.task(name="tasks.reminders.send_reminder")
def send_reminder(buddy_id: str, message: str):
    """Send a proactive reminder via a buddy."""
    print(f"[Celery] Reminder für Buddy {buddy_id}: {message}")
    # Phase 2: trigger n8n workflow or send via configured channel
    return {"buddy_id": buddy_id, "sent": True}
