from tasks.celery_app import celery_app


@celery_app.task(name="tasks.summaries.daily_summary")
def daily_summary():
    """Daily project summary via Claude."""
    import httpx
    from core.config import settings
    print("[Celery] Starte tägliche Zusammenfassung...")
    try:
        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 1024, "messages": [
                {"role": "user", "content": "Erstelle eine kurze JSON-Zusammenfassung des aktuellen Projektstands von AI Buddy."}
            ]},
            timeout=60.0,
        )
        result = resp.json().get("content", [{}])[0].get("text", "")
        print(f"[Celery] Zusammenfassung: {result[:200]}")
        return result
    except Exception as e:
        print(f"[Celery] Zusammenfassung fehlgeschlagen: {e}")
        return ""
