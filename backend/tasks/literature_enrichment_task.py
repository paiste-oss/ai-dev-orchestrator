"""
Celery Tasks für Phase A — Wissenspool-Anreicherung.

  enrich_doi_async(doi)     — Eine einzelne DOI anreichern (z. B. nach Eintrag-
                              Erstellung). Gibt sofort zurück, läuft im Worker.
  backfill_global_index()   — Alle Einträge mit DOI durchgehen. Manuell triggerbar
                              (für die bestehenden 3800 Einträge).
"""
import asyncio
import logging

from tasks.celery_app import celery_app

_log = logging.getLogger(__name__)


@celery_app.task(
    name="tasks.literature_enrichment_task.enrich_doi_async",
    bind=True, max_retries=2, default_retry_delay=60,
    ignore_result=True,
    time_limit=120,
)
def enrich_doi_async(self, raw_doi: str) -> dict:
    """Reichert eine einzelne DOI an. Defensiv — Fehler killt Caller nicht."""
    async def _run() -> dict:
        from core.database import AsyncSessionLocal
        from services.literature_enrichment import enrich_doi
        async with AsyncSessionLocal() as db:
            try:
                rec = await enrich_doi(db, raw_doi)
                await db.commit()
                if rec is None:
                    return {"doi": raw_doi, "status": "invalid_doi"}
                return {"doi": rec.doi, "status": rec.enrichment_status}
            except Exception as exc:
                _log.warning("[Enrich-Task] %s fehlgeschlagen: %s", raw_doi, exc)
                try: await db.rollback()
                except Exception: pass
                return {"doi": raw_doi, "status": "error", "error": str(exc)[:200]}

    return asyncio.run(_run())


@celery_app.task(
    name="tasks.literature_enrichment_task.backfill_global_index",
    bind=True,
    ignore_result=False,
    time_limit=6 * 3600,  # bis zu 6 Stunden für mega-Libraries
    soft_time_limit=6 * 3600 - 60,
)
def backfill_global_index(self, limit: int | None = None, force: bool = False) -> dict:
    """Geht alle aktiven Einträge mit nicht-leerer DOI durch und reichert die
    `literature_global_index`-Tabelle an. Ein Lauf für deine 3800 Einträge dauert
    ~30-60 Minuten (rate-limited bei 1-2 Calls/sek).
    """
    async def _run() -> dict:
        from core.database import AsyncSessionLocal
        from sqlalchemy import select
        from models.literature_entry import LiteratureEntry
        from services.literature_enrichment import enrich_doi, normalize_doi

        async with AsyncSessionLocal() as db:
            stmt = select(LiteratureEntry.doi).where(
                LiteratureEntry.is_active.is_(True),
                LiteratureEntry.doi.isnot(None),
            ).distinct()
            if limit:
                stmt = stmt.limit(limit)
            rows = (await db.execute(stmt)).all()

        # Eindeutige normalisierte DOIs
        unique: list[str] = []
        seen: set[str] = set()
        for (raw,) in rows:
            n = normalize_doi(raw)
            if n and n not in seen:
                seen.add(n)
                unique.append(n)

        _log.info("[Backfill] %d eindeutige DOIs zu verarbeiten", len(unique))
        enriched = 0
        failed = 0
        for i, doi in enumerate(unique):
            async with AsyncSessionLocal() as db:
                try:
                    rec = await enrich_doi(db, doi, force=force)
                    await db.commit()
                    if rec and rec.enrichment_status == "enriched":
                        enriched += 1
                    else:
                        failed += 1
                except Exception as exc:
                    _log.warning("[Backfill] %s: %s", doi, exc)
                    try: await db.rollback()
                    except Exception: pass
                    failed += 1
            # Sanfte Rate (Crossref/Unpaywall sind höflich aber nicht infinit)
            await asyncio.sleep(0.5)
            if (i + 1) % 100 == 0:
                _log.info("[Backfill] %d/%d (✓%d ✗%d)", i + 1, len(unique), enriched, failed)

        result = {"total": len(unique), "enriched": enriched, "failed": failed}
        _log.info("[Backfill] fertig: %s", result)
        return result

    return asyncio.run(_run())
