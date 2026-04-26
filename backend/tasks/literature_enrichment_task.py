"""
Celery Tasks für Phase A — Wissenspool-Anreicherung.

  enrich_doi_async(doi)     — Eine einzelne DOI anreichern (z. B. nach Eintrag-
                              Erstellung). Gibt sofort zurück, läuft im Worker.
  backfill_global_index()   — Alle Einträge mit DOI durchgehen. Manuell triggerbar
                              (für die bestehenden 3800 Einträge).
"""
import asyncio
import logging

# Eager-Import aller Models — nötig damit SQLAlchemy-Mapper im Celery-Worker
# alle Forward-Referenzen auflösen kann (z. B. Customer.device_tokens).
import models  # noqa: F401

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
    name="tasks.literature_enrichment_task.enrich_isbn_async",
    bind=True, max_retries=2, default_retry_delay=60,
    ignore_result=True,
    time_limit=120,
)
def enrich_isbn_async(self, raw_isbn: str) -> dict:
    """Phase A.3 — Buch-Anreicherung via OpenLibrary + DOAB."""
    async def _run() -> dict:
        from core.database import AsyncSessionLocal
        from services.book_enrichment import enrich_isbn
        async with AsyncSessionLocal() as db:
            try:
                rec = await enrich_isbn(db, raw_isbn)
                await db.commit()
                if rec is None:
                    return {"isbn": raw_isbn, "status": "invalid_isbn"}
                return {"isbn": rec.isbn, "status": rec.enrichment_status}
            except Exception as exc:
                _log.warning("[Enrich-ISBN-Task] %s fehlgeschlagen: %s", raw_isbn, exc)
                try: await db.rollback()
                except Exception: pass
                return {"isbn": raw_isbn, "status": "error", "error": str(exc)[:200]}
    return asyncio.run(_run())


@celery_app.task(
    name="tasks.literature_enrichment_task.enrich_sr_async",
    bind=True, max_retries=2, default_retry_delay=60,
    ignore_result=True,
    time_limit=120,
)
def enrich_sr_async(self, raw_sr: str) -> dict:
    """Phase A.3 — Schweizer-Gesetz-Anreicherung via Fedlex."""
    async def _run() -> dict:
        from core.database import AsyncSessionLocal
        from services.law_enrichment import enrich_sr
        async with AsyncSessionLocal() as db:
            try:
                rec = await enrich_sr(db, raw_sr)
                await db.commit()
                if rec is None:
                    return {"sr": raw_sr, "status": "invalid_sr"}
                return {"sr": rec.sr_number, "status": rec.enrichment_status}
            except Exception as exc:
                _log.warning("[Enrich-SR-Task] %s fehlgeschlagen: %s", raw_sr, exc)
                try: await db.rollback()
                except Exception: pass
                return {"sr": raw_sr, "status": "error", "error": str(exc)[:200]}
    return asyncio.run(_run())


@celery_app.task(
    name="tasks.literature_enrichment_task.backfill_books_index",
    bind=True,
    ignore_result=False,
    time_limit=6 * 3600,
    soft_time_limit=6 * 3600 - 60,
)
def backfill_books_index(self, limit: int | None = None, force: bool = False) -> dict:
    """Backfill für alle Einträge mit ISBN."""
    async def _run() -> dict:
        from core.database import AsyncSessionLocal
        from sqlalchemy import select
        from models.literature_entry import LiteratureEntry
        from services.book_enrichment import enrich_isbn, normalize_isbn

        async with AsyncSessionLocal() as db:
            stmt = select(LiteratureEntry.isbn).where(
                LiteratureEntry.is_active.is_(True),
                LiteratureEntry.isbn.isnot(None),
            ).distinct()
            if limit:
                stmt = stmt.limit(limit)
            rows = (await db.execute(stmt)).all()

        unique: list[str] = []
        seen: set[str] = set()
        for (raw,) in rows:
            n = normalize_isbn(raw)
            if n and n not in seen:
                seen.add(n)
                unique.append(n)

        _log.info("[Backfill-Books] %d eindeutige ISBNs zu verarbeiten", len(unique))
        enriched = 0
        failed = 0
        for i, isbn in enumerate(unique):
            async with AsyncSessionLocal() as db:
                try:
                    rec = await enrich_isbn(db, isbn, force=force)
                    await db.commit()
                    if rec and rec.enrichment_status == "enriched":
                        enriched += 1
                    else:
                        failed += 1
                except Exception as exc:
                    _log.warning("[Backfill-Books] %s: %s", isbn, exc)
                    try: await db.rollback()
                    except Exception: pass
                    failed += 1
            await asyncio.sleep(0.5)
            if (i + 1) % 100 == 0:
                _log.info("[Backfill-Books] %d/%d (✓%d ✗%d)", i + 1, len(unique), enriched, failed)

        result = {"total": len(unique), "enriched": enriched, "failed": failed}
        _log.info("[Backfill-Books] fertig: %s", result)
        return result
    return asyncio.run(_run())


@celery_app.task(
    name="tasks.literature_enrichment_task.bulk_zip_process",
    bind=True,
    ignore_result=True,
    time_limit=12 * 3600,
    soft_time_limit=12 * 3600 - 60,
)
def bulk_zip_process(self, zip_path_str: str, customer_id_str: str, upload_id: str) -> dict:
    """ZIP-Verarbeitung als Celery-Task. Überlebt Backend-Restarts wie
    bulk_meta_refresh — wichtig bei grossen Bibliotheken (4000+ PDFs, mehrere
    Stunden Laufzeit mit LLM-Fallback)."""
    async def _run() -> dict:
        import sys as _sys
        for p in ("/app", "/app/backend"):
            if p not in _sys.path:
                _sys.path.insert(0, p)
        from api.v1.literature import _bulk_zip_background_task
        await _bulk_zip_background_task(zip_path_str, customer_id_str, upload_id)
        return {"upload_id": upload_id, "status": "done"}
    return asyncio.run(_run())


@celery_app.task(
    name="tasks.literature_enrichment_task.bulk_meta_refresh",
    bind=True,
    ignore_result=False,
    time_limit=12 * 3600,  # 3000+ Einträge bei ~3-5s/PDF (Haiku) brauchen Stunden
    soft_time_limit=12 * 3600 - 60,
)
def bulk_meta_refresh(self, entry_ids: list[str], customer_id_str: str, job_id: str) -> dict:
    """Phase A.2 (Bulk-Refresh) als Celery-Task. Überlebt Backend-Restarts —
    kann von einem dedizierten Celery-Worker stundenlang laufen ohne FastAPI
    zu blockieren.

    Lazy-Import von _bulk_meta_refresh_task aus dem Router-Modul, damit's
    keine zirkulären Imports gibt (literature.py importiert enrich_doi_async
    aus diesem Modul).
    """
    async def _run() -> dict:
        # Celery-Worker startet ohne /app im sys.path — explizit hinzufügen,
        # damit der Import des Router-Moduls funktioniert.
        import sys as _sys
        for p in ("/app", "/app/backend"):
            if p not in _sys.path:
                _sys.path.insert(0, p)
        from api.v1.literature import _bulk_meta_refresh_task
        await _bulk_meta_refresh_task(entry_ids, customer_id_str, job_id)
        return {"job_id": job_id, "total": len(entry_ids), "status": "done"}
    return asyncio.run(_run())


@celery_app.task(
    name="tasks.literature_enrichment_task.bulk_fetch_oa_pdfs",
    bind=True,
    ignore_result=False,
    time_limit=6 * 3600,
    soft_time_limit=6 * 3600 - 60,
)
def bulk_fetch_oa_pdfs(self, limit: int | None = None) -> dict:
    """Phase A.2/3 — automatischer OA-PDF-Bulk-Download.

    Findet alle Einträge:
      - is_active = True
      - pdf_s3_key IS NULL  (kein PDF angehängt)
      - hat eine DOI mit globalen Pool-Eintrag, der `oa_url` gesetzt hat
    Lädt für jeden das OA-PDF herunter und hängt es an.

    Status wird in Redis getrackt (analog Bulk-Meta-Refresh).
    Defensiv: per-Eintrag-Transaktion, prüft Content-Type + %PDF-Magic-Bytes.
    """
    async def _run() -> dict:
        import json as _json
        import re as _re
        import uuid as _uuid
        import httpx
        import redis.asyncio as aioredis
        from sqlalchemy import select
        from core.config import settings
        from core.database import AsyncSessionLocal
        from models.literature_entry import LiteratureEntry
        from models.literature_global_index import LiteratureGlobalIndex
        from services.literature_enrichment import normalize_doi
        from services.s3_storage import upload_file as s3_upload

        MAX_PDF_SIZE = 50 * 1024 * 1024
        STATUS_KEY = "lit_oa_bulk:status"
        TTL = 24 * 3600

        from datetime import datetime as _dt

        r = aioredis.from_url(settings.redis_url)
        state = {
            "status": "running", "total": 0, "processed": 0,
            "downloaded": 0, "skipped": 0, "errors": 0,
            "started_at": _dt.utcnow().isoformat(),
            "completed_at": None,
        }

        async def _publish() -> None:
            await r.set(STATUS_KEY, _json.dumps(state), ex=TTL)

        async def _sanitize_pg(text: str | None) -> str | None:
            if text is None: return None
            cleaned = text.replace("\x00", "")
            return "".join(c for c in cleaned if c >= " " or c in "\t\n\r")

        try:
            # 1) Kandidaten ermitteln: Einträge ohne PDF + DOI + OA-URL im Pool
            async with AsyncSessionLocal() as db:
                stmt = (
                    select(LiteratureEntry, LiteratureGlobalIndex.oa_url)
                    .join(
                        LiteratureGlobalIndex,
                        LiteratureGlobalIndex.doi == LiteratureEntry.doi,
                    )
                    .where(
                        LiteratureEntry.is_active.is_(True),
                        LiteratureEntry.pdf_s3_key.is_(None),
                        LiteratureEntry.doi.isnot(None),
                        LiteratureGlobalIndex.oa_url.isnot(None),
                        LiteratureGlobalIndex.enrichment_status == "enriched",
                    )
                )
                if limit:
                    stmt = stmt.limit(limit)
                rows = (await db.execute(stmt)).all()
            candidates = [(e.id, e.customer_id, e.title, oa) for (e, oa) in rows]
            state["total"] = len(candidates)
            await _publish()
            _log.info("[OA-Bulk] %d Kandidaten zum OA-PDF-Anhängen", len(candidates))

            # 2) Pro Kandidat: OA-PDF ziehen, validieren, zu S3 hochladen, DB-Eintrag updaten
            for entry_id, customer_id, title, oa_url in candidates:
                try:
                    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                        resp = await client.get(oa_url, headers={"User-Agent": "Baddi-Literature/1.0"})
                    state["processed"] += 1

                    if resp.status_code != 200:
                        state["skipped"] += 1
                        await _publish()
                        continue

                    content_type = (resp.headers.get("content-type") or "").lower()
                    pdf_bytes = resp.content
                    is_pdf = ("pdf" in content_type) or pdf_bytes[:4] == b"%PDF"
                    if not is_pdf or len(pdf_bytes) < 1024 or len(pdf_bytes) > MAX_PDF_SIZE:
                        state["skipped"] += 1
                        await _publish()
                        continue

                    # S3-Upload + DB-Update
                    safe_filename = _re.sub(r"[^\w\-. ]", "_", (title or str(entry_id)))[:120].strip() or "oa-paper"
                    s3_key = await s3_upload(
                        customer_id=customer_id, doc_id=entry_id,
                        filename=f"{safe_filename}.pdf",
                        content=pdf_bytes, content_type="application/pdf",
                    )

                    async with AsyncSessionLocal() as db:
                        entry = await db.get(LiteratureEntry, entry_id)
                        if not entry or entry.pdf_s3_key:  # zwischenzeitlich verändert?
                            state["skipped"] += 1
                            await _publish()
                            continue
                        import hashlib as _hashlib
                        entry.pdf_s3_key = s3_key
                        entry.pdf_size_bytes = len(pdf_bytes)
                        entry.pdf_sha256 = _hashlib.sha256(pdf_bytes).hexdigest()
                        # Volltext für Qdrant
                        try:
                            from services.file_parser import parse_file
                            parsed = parse_file(pdf_bytes, f"{safe_filename}.pdf", "application/pdf")
                            if parsed.text.strip():
                                base = (entry.title or "") + "\n" + (entry.abstract or "")
                                entry.extracted_text = await _sanitize_pg(base + "\n\n" + parsed.text[:8000])
                        except Exception:
                            pass
                        await db.commit()
                    state["downloaded"] += 1
                    _log.info("[OA-Bulk] ✓ %s (%d bytes)", entry_id, len(pdf_bytes))

                except Exception as exc:
                    state["errors"] += 1
                    _log.warning("[OA-Bulk] ✗ %s: %s", entry_id, exc)

                # Höflichkeit: 0.5s zwischen Calls (Verlage sind streng mit Bulk-Downloads)
                import asyncio as _asyncio
                await _asyncio.sleep(0.5)
                if state["processed"] % 25 == 0:
                    await _publish()

            state["status"] = "done"
            state["completed_at"] = _dt.utcnow().isoformat()
            await _publish()
            _log.info("[OA-Bulk] fertig: %s", state)
            return state
        except Exception as exc:
            _log.error("[OA-Bulk] abgebrochen: %s", exc)
            state["status"] = "error"
            state["completed_at"] = _dt.utcnow().isoformat()
            state["error"] = str(exc)[:300]
            await _publish()
            return state
        finally:
            await r.aclose()

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
