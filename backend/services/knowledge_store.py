"""
Global Knowledge Vector Store — Qdrant Collection 'global_knowledge'

Jeder Chunk enthält:
  source_type, domain, language, title, url, date, text, chunk_index, total_chunks
"""
import logging
import uuid
from typing import Optional
import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, MatchAny,
)
from core.config import settings

_log = logging.getLogger(__name__)

COLLECTION = "global_knowledge"
EMBED_DIM = 768
_EMBED_MODELS = ["nomic-embed-text", "mxbai-embed-large", "all-minilm"]

_client: Optional[QdrantClient] = None


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        _ensure_collection(_client)
    return _client


def _ensure_collection(client: QdrantClient) -> None:
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        _log.info("Qdrant collection '%s' created", COLLECTION)


def _embed(text: str) -> list[float]:
    if not settings.ollama_base_url:
        return []
    for model in _EMBED_MODELS:
        try:
            resp = httpx.post(
                f"{settings.ollama_base_url}/api/embeddings",
                json={"model": model, "prompt": text},
                timeout=5.0,
            )
            if resp.status_code == 200:
                vec = resp.json().get("embedding", [])
                if vec:
                    return vec
        except Exception as exc:
            _log.debug("embed model %s failed: %s", model, exc)
    return []


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Teilt Text in überlappende Chunks an Absatz-/Satzgrenzen."""
    if not text or len(text) <= chunk_size:
        return [text.strip()] if text.strip() else []
    chunks, start = [], 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            for sep in ["\n\n", "\n", ". ", "! ", "? "]:
                pos = text.rfind(sep, start, end)
                if pos > start + chunk_size // 2:
                    end = pos + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap
        if start >= len(text):
            break
    return chunks


def store_knowledge_chunks(
    document_id: str,
    title: str,
    url: str,
    text: str,
    source_type: str,
    domain: str,
    language: str = "de",
    published_at: str = "",
) -> list[str]:
    """Chunked Text, embeddet und speichert in global_knowledge. Gibt point_ids zurück."""
    if not text.strip():
        return []

    # Vektordimension dynamisch ermitteln
    test_vec = _embed("test")
    if not test_vec:
        raise RuntimeError("Kein Embedding-Modell verfügbar (ollama pull nomic-embed-text).")
    vec_size = len(test_vec)

    client = _get_client()
    # Sicherstellen dass Collection mit korrekter Dimension existiert
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=vec_size, distance=Distance.COSINE),
        )

    chunks = chunk_text(text)
    point_ids = []
    for i, chunk in enumerate(chunks):
        # Titel als Kontext voranstellen
        enriched = f"{title}\n\n{chunk}"
        vec = _embed(enriched)
        if not vec:
            continue
        pid = str(uuid.uuid4())
        client.upsert(
            collection_name=COLLECTION,
            points=[PointStruct(
                id=pid,
                vector=vec,
                payload={
                    "document_id": document_id,
                    "source_type": source_type,
                    "domain": domain,
                    "language": language,
                    "title": title,
                    "url": url,
                    "date": published_at,
                    "text": chunk,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            )],
        )
        point_ids.append(pid)
    return point_ids


def delete_document_chunks(document_id: str) -> None:
    """Löscht alle Chunks eines Dokuments aus global_knowledge."""
    try:
        client = _get_client()
        from qdrant_client.models import FilterSelector
        client.delete(
            collection_name=COLLECTION,
            points_selector=FilterSelector(
                filter=Filter(must=[
                    FieldCondition(key="document_id", match=MatchValue(value=document_id))
                ])
            ),
        )
    except Exception as exc:
        _log.warning("delete_document_chunks failed: %s", exc)


def search_global_knowledge(
    query: str,
    top_k: int = 3,
    min_score: float = 0.72,
    domains: list[str] | None = None,
    language: str | None = None,
) -> list[dict]:
    """
    Semantische Suche in der globalen Wissensdatenbank.
    Gibt relevante Chunks mit Score, Text, Titel, URL zurück.
    """
    vec = _embed(query)
    if not vec:
        return []
    client = _get_client()
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION not in existing:
        return []

    must_conditions = []
    if domains:
        must_conditions.append(FieldCondition(key="domain", match=MatchAny(any=domains)))
    if language:
        must_conditions.append(FieldCondition(key="language", match=MatchValue(value=language)))

    try:
        results = client.query_points(
            collection_name=COLLECTION,
            query=vec,
            query_filter=Filter(must=must_conditions) if must_conditions else None,
            limit=top_k,
            score_threshold=min_score,
            with_payload=True,
        )
        return [
            {
                "score": round(hit.score, 3),
                "text": hit.payload.get("text", ""),
                "title": hit.payload.get("title", ""),
                "url": hit.payload.get("url", ""),
                "source_type": hit.payload.get("source_type", ""),
                "domain": hit.payload.get("domain", ""),
                "language": hit.payload.get("language", "de"),
            }
            for hit in results.points
        ]
    except Exception as exc:
        _log.warning("search_global_knowledge failed: %s", exc)
        return []


def get_collection_stats() -> dict:
    """Gibt Statistiken zur global_knowledge Collection zurück."""
    try:
        client = _get_client()
        info = client.get_collection(COLLECTION)
        return {
            "vectors_count": info.vectors_count or 0,
            "points_count": info.points_count or 0,
            "status": str(info.status),
        }
    except Exception as exc:
        return {"vectors_count": 0, "points_count": 0, "status": f"error: {exc}"}
