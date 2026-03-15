from tasks.celery_app import celery_app


@celery_app.task(name="tasks.summaries.daily_summary")
def daily_summary():
    """Daily project summary — replaces APScheduler job from main.py."""
    from agents import execute_agent_with_tools
    print("[Celery] Starte tägliche Zusammenfassung...")
    result = execute_agent_with_tools("Erstelle eine JSON-Zusammenfassung des aktuellen Projektstands.")
    print(f"[Celery] Zusammenfassung: {result[:200]}")
    return result
