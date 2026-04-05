"""
Celery Tasks für die Wissensdatenbank-Ingestion.

Aufrufe:
  ingest_source(source_id)        — Indexiert eine einzelne Quelle komplett
  ingest_document(source_id, meta) — Indexiert ein einzelnes Dokument (für Retry)
  refresh_all_sources()           — Triggered alle aktiven Quellen neu (Celery Beat)
"""
import json
import logging
from datetime import datetime,timezone

from tasks.celery_app import celery_app
from core.utils import safe_json_loads

_log = logging.getLogger(__name__)

INGESTOR_MAP = {
    "fedlex": ("services.ingestors.fedlex", "FedlexIngestor"),
    "openalex": ("services.ingestors.openalex", "OpenAlexIngestor"),
    "wikipedia_de": ("services.ingestors.wikipedia_de", "WikipediaDeIngestor"),
}


def _get_ingestor(source_type: str, crawl_config: dict | None = None):
    """Lädt den richtigen Ingestor für einen source_type."""
    if source_type not in INGESTOR_MAP:
        raise ValueError(f"Unbekannter source_type: {source_type}")
    module_path, class_name = INGESTOR_MAP[source_type]
    import importlib
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    kwargs = crawl_config or {}
    try:
        return cls(**kwargs)
    except TypeError:
        return cls()


@celery_app.task(
    name="tasks.knowledge_ingestion.ingest_source",
    bind=True, max_retries=2, default_retry_delay=30,
    ignore_result=False,
    time_limit=3600,
    soft_time_limit=3500,
)
def ingest_source(self, source_id: str) -> dict:
    """
    Indexiert eine komplette KnowledgeSource.
    Gibt Statistik zurück: {docs_added, docs_skipped, chunks_added, errors}
    """
    import asyncio
    try:
        return asyncio.run(_run_ingestion(source_id))
    except Exception as exc:
        _log.error("ingest_source failed for %s: %s", source_id, exc)
        raise self.retry(exc=exc)


async def _run_ingestion(source_id: str) -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select as sa_select
    from models.knowledge import KnowledgeSource, KnowledgeDocument
    from services.knowledge_store import store_knowledge_chunks, delete_document_chunks
    from core.config import settings

    engine = create_async_engine(settings.database_url, pool_size=1, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    stats = {"docs_added": 0, "docs_skipped": 0, "chunks_added": 0, "errors": 0}

    try:
        async with Session() as db:
            source = await db.get(KnowledgeSource, source_id)
            if not source or not source.is_active:
                return stats

            _log.info("Starting ingestion for source: %s (%s)", source.name, source.source_type)
            ingestor = _get_ingestor(source.source_type, source.crawl_config)

            # Vorhandene Dokument-Hashes laden (Deduplizierung)
            existing_result = await db.execute(
                sa_select(KnowledgeDocument.content_hash, KnowledgeDocument.id)
                .where(KnowledgeDocument.source_id == source.id)
                .where(KnowledgeDocument.is_active == True)
            )
            existing_hashes = {row[0]: str(row[1]) for row in existing_result.fetchall() if row[0]}

            docs = ingestor.discover(limit=source.crawl_config.get("limit", 100) if source.crawl_config else 100)
            _log.info("Discovered %d documents for %s", len(docs), source.name)

            for meta in docs:
                try:
                    raw_doc = ingestor.fetch_document(meta)
                    if not raw_doc or not raw_doc.text.strip():
                        stats["docs_skipped"] += 1
                        continue

                    content_hash = ingestor.content_hash(raw_doc.text)

                    # Skip wenn identischer Content bereits indexiert
                    if content_hash in existing_hashes:
                        stats["docs_skipped"] += 1
                        continue

                    # Alte Version löschen falls URL sich änderte
                    url_result = await db.execute(
                        sa_select(KnowledgeDocument)
                        .where(KnowledgeDocument.source_id == source.id)
                        .where(KnowledgeDocument.url == raw_doc.url)
                        .limit(1)
                    )
                    old_doc = url_result.scalar_one_or_none()
                    if old_doc:
                        delete_document_chunks(str(old_doc.id))
                        old_doc.is_active = False
                        await db.commit()

                    # In Qdrant speichern
                    point_ids = store_knowledge_chunks(
                        document_id=str(meta.get("_doc_id", "")),  # Platzhalter, wird nach DB-Insert gesetzt
                        title=raw_doc.title,
                        url=raw_doc.url,
                        text=raw_doc.text,
                        source_type=source.source_type,
                        domain=source.domain,
                        language=raw_doc.language,
                        published_at=raw_doc.published_at,
                    )

                    # In PostgreSQL speichern
                    doc = KnowledgeDocument(
                        source_id=source.id,
                        title=raw_doc.title,
                        url=raw_doc.url,
                        language=raw_doc.language,
                        domain=source.domain,
                        source_type=source.source_type,
                        published_at=raw_doc.published_at,
                        content_hash=content_hash,
                        chunk_count=len(point_ids),
                        qdrant_point_ids=point_ids,
                        doc_metadata=raw_doc.metadata,
                    )
                    db.add(doc)
                    await db.commit()
                    await db.refresh(doc)

                    stats["docs_added"] += 1
                    stats["chunks_added"] += len(point_ids)
                    _log.info("Indexed: %s (%d chunks)", raw_doc.title[:60], len(point_ids))

                except Exception as exc:
                    _log.warning("Failed to index doc %s: %s", meta.get("title", "?"), exc)
                    stats["errors"] += 1
                    continue

            # Source-Stats aktualisieren
            source.last_crawled_at = datetime.now(timezone.utc).replace(tzinfo=None)
            source.doc_count += stats["docs_added"]
            source.chunk_count += stats["chunks_added"]
            await db.commit()

        _log.info("Ingestion done for %s: %s", source_id, stats)
        return stats

    finally:
        await engine.dispose()


@celery_app.task(
    name="tasks.knowledge_ingestion.refresh_all_sources",
    ignore_result=True,
)
def refresh_all_sources() -> None:
    """Triggered alle aktiven Quellen (via Celery Beat — täglich)."""
    import asyncio
    asyncio.run(_trigger_all())


async def _trigger_all() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select as sa_select
    from models.knowledge import KnowledgeSource
    from core.config import settings

    engine = create_async_engine(settings.database_url, pool_size=1, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            result = await db.execute(
                sa_select(KnowledgeSource.id).where(KnowledgeSource.is_active == True)
            )
            source_ids = [str(row[0]) for row in result.fetchall()]
        for sid in source_ids:
            ingest_source.delay(sid)
            _log.info("Queued ingestion for source %s", sid)
    finally:
        await engine.dispose()
