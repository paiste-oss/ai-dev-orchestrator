import asyncio
from tasks.celery_app import celery_app


@celery_app.task(name="tasks.summaries.daily_summary")
def daily_summary():
    """Tägliche Projekt-Zusammenfassung via Claude Haiku — wird in PostgreSQL gespeichert."""
    asyncio.run(_run())


async def _run() -> None:
    import httpx
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from core.config import settings
    from models.daily_summary import DailySummary

    print("[Celery] Starte tägliche Zusammenfassung…")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 2048,
                    "messages": [{
                        "role": "user",
                        "content": (
                            "Du bist der tägliche Berichtgenerator für das Baddi-Projekt (baddi.ch). "
                            "Erstelle einen strukturierten Tagesreport als Markdown mit folgenden Abschnitten:\n"
                            "## Stand\nKurze Einschätzung des aktuellen Projektstands.\n"
                            "## Offene Punkte\nWas noch aussteht oder Aufmerksamkeit braucht.\n"
                            "## Nächste Schritte\nEmpfehlungen für die nächsten 1-3 Tage.\n"
                            "Halte jeden Abschnitt auf 2-4 Sätze. Schreibe auf Deutsch."
                        ),
                    }],
                },
            )
        resp.raise_for_status()
        content = resp.json().get("content", [{}])[0].get("text", "").strip()
        if not content:
            print("[Celery] Zusammenfassung: leere Antwort von Claude")
            return

        engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as db:
            db.add(DailySummary(content=content))
            await db.commit()
        await engine.dispose()

        print(f"[Celery] Zusammenfassung gespeichert ({len(content)} Zeichen)")

    except Exception as e:
        print(f"[Celery] Zusammenfassung fehlgeschlagen: {e}")
