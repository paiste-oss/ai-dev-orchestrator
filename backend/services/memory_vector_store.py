"""
Memory Vector Store — Qdrant-basiertes Langzeitgedächtnis für Kunden.

Kollektion: customer_memories
  payload: { customer_id, fact, extracted_at }
  vector:  768-dim (nomic-embed-text via Ollama)
"""
import logging
import uuid
from typing import Optional

import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from core.config import settings

_log = logging.getLogger(__name__)

COLLECTION = "customer_memories"
EMBED_DIM = 768
_EMBED_MODELS = ["nomic-embed-text", "mxbai-embed-large", "all-minilm"]
_EMBED_DIMS   = {"nomic-embed-text": 768, "mxbai-embed-large": 1024, "all-minilm": 384}

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
    for model in _EMBED_MODELS:
        try:
            resp = httpx.post(
                f"{settings.ollama_base_url}/api/embeddings",
                json={"model": model, "prompt": text},
                timeout=20.0,
            )
            if resp.status_code == 200:
                vec = resp.json().get("embedding", [])
                if vec:
                    return vec
        except Exception as exc:
            _log.debug("embed model %s failed: %s", model, exc)
    _log.warning("All embedding models failed for text: %.60s", text)
    return []


def store_memory_facts(customer_id: str, facts: list[str]) -> int:
    """Store extracted facts in Qdrant. Returns number of stored facts."""
    client = _get_client()
    import time
    ts = time.time()
    points: list[PointStruct] = []

    for fact in facts:
        fact = fact.strip()
        if not fact:
            continue
        vec = _embed(fact)
        if not vec:
            continue
        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={"customer_id": customer_id, "fact": fact, "extracted_at": ts},
        ))

    if not points:
        return 0

    client.upsert(collection_name=COLLECTION, points=points)
    _log.info("Stored %d memory facts for customer %s", len(points), customer_id[:8])
    return len(points)


def search_memories(customer_id: str, query: str, top_k: int = 8, score_threshold: float = 0.55) -> list[str]:
    """Search relevant memories for a customer by vector similarity."""
    client = _get_client()
    vec = _embed(query)
    if not vec:
        return []

    try:
        results = client.search(
            collection_name=COLLECTION,
            query_vector=vec,
            query_filter=Filter(
                must=[FieldCondition(key="customer_id", match=MatchValue(value=customer_id))]
            ),
            limit=top_k,
            score_threshold=score_threshold,
        )
        return [r.payload["fact"] for r in results if "fact" in r.payload]
    except Exception as exc:
        _log.warning("Qdrant memory search failed: %s", exc)
        return []
