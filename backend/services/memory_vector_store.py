"""
Memory Vector Store — Qdrant-basiertes Langzeitgedächtnis für Kunden.

Kollektion: customer_memories
  payload: { customer_id, fact, extracted_at }
  vector:  768-dim (nomic-embed-text via Ollama)
"""
import logging
import threading
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
# Nur nomic-embed-text (768-dim) verwenden — andere Modelle haben andere Dimensionen
# und würden zu Vektordimensions-Fehlern in der Collection führen.
_EMBED_MODELS = ["nomic-embed-text"]
_EMBED_DIMS   = {"nomic-embed-text": 768}

_client: Optional[QdrantClient] = None
_client_lock = threading.Lock()


def _get_client() -> QdrantClient:
    """Double-checked locking — thread-sicher für mehrere Celery-Worker."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                c = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
                _ensure_collection(c)
                _client = c
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
    _log.warning("All embedding models failed for text: %.60s", text)
    return []


def store_memory_facts(customer_id: str, facts: list[str], category: str = "fact") -> int:
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
            payload={"customer_id": customer_id, "fact": fact, "category": category, "extracted_at": ts},
        ))

    if not points:
        return 0

    client.upsert(collection_name=COLLECTION, points=points)
    _log.info("Stored %d memory %ss for customer %s", len(points), category, customer_id[:8])
    return len(points)


def delete_customer_memories(customer_id: str) -> int:
    """Löscht alle Qdrant-Vektoren eines Kunden. Gibt Anzahl gelöschter Punkte zurück."""
    client = _get_client()
    try:
        result = client.delete(
            collection_name=COLLECTION,
            points_selector=Filter(
                must=[FieldCondition(key="customer_id", match=MatchValue(value=customer_id))]
            ),
        )
        _log.info("Deleted all memories for customer %s (status: %s)", customer_id[:8], result.status)
        return 1
    except Exception as exc:
        _log.warning("Failed to delete memories for %s: %s", customer_id[:8], exc)
        return 0


def get_style_memories(customer_id: str, limit: int = 10) -> list[str]:
    """Gibt alle gespeicherten Stil-Präferenzen eines Kunden zurück."""
    client = _get_client()
    try:
        results, _ = client.scroll(
            collection_name=COLLECTION,
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="customer_id", match=MatchValue(value=customer_id)),
                    FieldCondition(key="category", match=MatchValue(value="style")),
                ]
            ),
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )
        return [r.payload["fact"] for r in results if "fact" in r.payload]
    except Exception as exc:
        _log.warning("Qdrant get_style_memories failed: %s", exc)
        return []


def get_all_memories(customer_id: str, limit: int = 60) -> list[str]:
    """Gibt alle gespeicherten Fakten eines Kunden zurück (für Deduplizierung)."""
    client = _get_client()
    try:
        results, _ = client.scroll(
            collection_name=COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="customer_id", match=MatchValue(value=customer_id))]
            ),
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )
        return [r.payload["fact"] for r in results if "fact" in r.payload]
    except Exception as exc:
        _log.warning("Qdrant get_all_memories failed: %s", exc)
        return []


def search_memories(customer_id: str, query: str, top_k: int = 8, score_threshold: float = 0.55) -> list[str]:
    """Search relevant memories for a customer by vector similarity."""
    client = _get_client()
    vec = _embed(query)
    if not vec:
        return []

    try:
        response = client.query_points(
            collection_name=COLLECTION,
            query=vec,
            query_filter=Filter(
                must=[FieldCondition(key="customer_id", match=MatchValue(value=customer_id))]
            ),
            limit=top_k,
            score_threshold=score_threshold,
            with_payload=True,
        )
        return [r.payload["fact"] for r in response.points if "fact" in r.payload]
    except Exception as exc:
        _log.warning("Qdrant memory search failed: %s", exc)
        return []
