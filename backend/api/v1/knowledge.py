"""
Knowledge Base Admin API
GET/POST/PUT/DELETE /v1/knowledge/sources
POST /v1/knowledge/sources/{id}/ingest
POST /v1/knowledge/search   (Test-Suche)
GET  /v1/knowledge/stats
"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer
from models.knowledge import KnowledgeSource, KnowledgeDocument

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class SourceCreate(BaseModel):
    name: str
    source_type: str   # fedlex / openalex / wikipedia_de
    domain: str = "allgemein"
    language: str = "de"
    url: str | None = None
    description: str | None = None
    crawl_config: dict | None = None   # z.B. {"limit": 50}


class SourceUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    crawl_config: dict | None = None
    description: str | None = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    min_score: float = 0.65
    domains: list[str] | None = None
    language: str | None = None


# ─── Sources CRUD ─────────────────────────────────────────────────────────────

@router.get("/sources")
async def list_sources(
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    result = await db.execute(
        select(KnowledgeSource).order_by(KnowledgeSource.created_at)
    )
    sources = result.scalars().all()
    return [_serialize_source(s) for s in sources]


@router.post("/sources", status_code=201)
async def create_source(
    body: SourceCreate,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    source = KnowledgeSource(
        name=body.name,
        source_type=body.source_type,
        domain=body.domain,
        language=body.language,
        url=body.url,
        description=body.description,
        crawl_config=body.crawl_config,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _serialize_source(source)


@router.put("/sources/{source_id}")
async def update_source(
    source_id: uuid.UUID,
    body: SourceUpdate,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    source = await db.get(KnowledgeSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Quelle nicht gefunden.")
    if body.name is not None:
        source.name = body.name
    if body.is_active is not None:
        source.is_active = body.is_active
    if body.crawl_config is not None:
        source.crawl_config = body.crawl_config
    if body.description is not None:
        source.description = body.description
    await db.commit()
    await db.refresh(source)
    return _serialize_source(source)


@router.delete("/sources/{source_id}", status_code=204)
async def delete_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    source = await db.get(KnowledgeSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Quelle nicht gefunden.")
    # Alle Dokumente soft-deaktivieren
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.source_id == source_id)
    )
    for doc in result.scalars().all():
        try:
            from services.knowledge_store import delete_document_chunks
            delete_document_chunks(str(doc.id))
        except Exception:
            pass
        doc.is_active = False
    await db.delete(source)
    await db.commit()


# ─── Ingestion ────────────────────────────────────────────────────────────────

@router.post("/sources/{source_id}/ingest")
async def trigger_ingestion(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    source = await db.get(KnowledgeSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Quelle nicht gefunden.")
    from tasks.knowledge_ingestion import ingest_source
    task = ingest_source.delay(str(source_id))
    return {"task_id": task.id, "status": "queued", "source": source.name}


@router.get("/sources/{source_id}/documents")
async def list_source_documents(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    result = await db.execute(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.source_id == source_id)
        .where(KnowledgeDocument.is_active == True)
        .order_by(KnowledgeDocument.created_at.desc())
        .limit(100)
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "title": d.title,
            "url": d.url,
            "language": d.language,
            "chunk_count": d.chunk_count,
            "published_at": d.published_at,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


# ─── Suche ────────────────────────────────────────────────────────────────────

@router.post("/search")
async def test_search(
    body: SearchRequest,
    _: Customer = Depends(require_admin),
):
    from services.knowledge_store import search_global_knowledge
    results = search_global_knowledge(
        query=body.query,
        top_k=body.top_k,
        min_score=body.min_score,
        domains=body.domains,
        language=body.language,
    )
    return {"query": body.query, "results": results, "count": len(results)}


# ─── Statistiken ─────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: Customer = Depends(require_admin),
):
    source_count = await db.scalar(select(func.count(KnowledgeSource.id)))
    doc_count = await db.scalar(
        select(func.count(KnowledgeDocument.id))
        .where(KnowledgeDocument.is_active == True)
    )
    chunk_sum = await db.scalar(
        select(func.sum(KnowledgeDocument.chunk_count))
        .where(KnowledgeDocument.is_active == True)
    ) or 0

    from services.knowledge_store import get_collection_stats
    qdrant_stats = get_collection_stats()

    return {
        "sources": source_count,
        "documents": doc_count,
        "chunks_db": chunk_sum,
        "qdrant": qdrant_stats,
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _serialize_source(s: KnowledgeSource) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "source_type": s.source_type,
        "domain": s.domain,
        "language": s.language,
        "url": s.url,
        "description": s.description,
        "is_active": s.is_active,
        "last_crawled_at": s.last_crawled_at.isoformat() if s.last_crawled_at else None,
        "doc_count": s.doc_count,
        "chunk_count": s.chunk_count,
        "crawl_config": s.crawl_config,
        "created_at": s.created_at.isoformat(),
    }
