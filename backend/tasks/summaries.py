import asyncio
from tasks.celery_app import celery_app


@celery_app.task(name="tasks.summaries.daily_summary")
def daily_summary():
    """Tägliche Projekt-Zusammenfassung via Ollama — wird in PostgreSQL gespeichert."""
    asyncio.run(_run())


async def _run() -> None:
    import httpx
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from core.config import settings
    from models.daily_summary import DailySummary
    from tasks.health_monitor import get_hw_stats

    print("[Celery] Starte tägliche Zusammenfassung…")
    try:
        # Hardware-Metriken der letzten 24h
        hw = get_hw_stats()
        has_hw = any(hw[m]["peak"] > 0 for m in ("cpu", "ram", "disk"))
        if has_hw:
            hw_block = (
                "Hardware-Metriken VPS (letzte 24h):\n"
                f"  CPU  — Aktuell: {hw['cpu']['current']}%  Ø: {hw['cpu']['avg']}%  Peak: {hw['cpu']['peak']}%\n"
                f"  RAM  — Aktuell: {hw['ram']['current']}%  Ø: {hw['ram']['avg']}%  Peak: {hw['ram']['peak']}%\n"
                f"  Disk — Aktuell: {hw['disk']['current']}%  Ø: {hw['disk']['avg']}%  Peak: {hw['disk']['peak']}%"
            )
        else:
            hw_block = "Hardware-Metriken: noch keine Daten verfügbar (Monitoring läuft seit weniger als 5 Minuten)."

        prompt = (
            "Du bist der tägliche Berichtgenerator für das Baddi-Projekt (baddi.ch), "
            "ein KI-Assistent für Schweizer KMUs.\n\n"
            f"{hw_block}\n\n"
            "Erstelle einen strukturierten Tagesreport auf Deutsch als Markdown mit diesen Abschnitten:\n"
            "## Stand\nAllgemeine Einschätzung des Projekts.\n"
            "## Hardware\nBewertung der obigen Metriken — auffällige Werte kommentieren.\n"
            "## Offene Punkte\nWas Aufmerksamkeit braucht.\n"
            "## Nächste Schritte\nEmpfehlungen für die nächsten 1-3 Tage.\n"
            "Halte jeden Abschnitt auf 2-4 Sätze."
        )

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={
                    "model":  "gemma3:latest",
                    "prompt": prompt,
                    "stream": False,
                },
            )
        resp.raise_for_status()
        content = resp.json().get("response", "").strip()
        if not content:
            print("[Celery] Zusammenfassung: leere Antwort von Ollama")
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
