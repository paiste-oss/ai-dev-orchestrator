"""
Qdrant Vector Store Service
Speichert Dokument-Chunks als Vektoren für semantische Suche.
Embeddings werden via Ollama (nomic-embed-text oder mxbai-embed-large) generiert.
Fallback: Ollama Chat-Modell für Embeddings wenn kein Embed-Modell vorhanden.
"""
import uuid
import httpx
from typing import List
from core.config import settings

# Qdrant Client (sync reicht hier, da wir in sync-Kontexten aufrufen)
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

# Chunk-Größe für Dokument-Splitting
CHUNK_SIZE = 800       # Zeichen pro Chunk
CHUNK_OVERLAP = 100    # Überlappung zwischen Chunks
EMBED_MODEL = "nomic-embed-text"  # Ollama Embedding-Modell
EMBED_DIM = 768                    # nomic-embed-text Dimension

# Fallback-Dimensionen für andere Modelle
EMBED_DIM_MAP = {
    "nomic-embed-text": 768,
    "mxbai-embed-large": 1024,
    "all-minilm": 384,
}


def get_qdrant() -> QdrantClient:
    """Gibt einen Qdrant-Client zurück."""
    return QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    Teilt langen Text in überlappende Chunks.
    Versucht an Satz-/Zeilengrenzen zu trennen.
    """
    if not text or len(text) < chunk_size:
        return [text] if text.strip() else []

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # Versuche an einem Satzende zu trennen
        if end < len(text):
            # Suche nach letztem '. ', '\n' oder '! ' vor dem Ende
            for separator in ["\n\n", "\n", ". ", "! ", "? "]:
                sep_pos = text.rfind(separator, start, end)
                if sep_pos > start + chunk_size // 2:  # Mindestens halbe Chunk-Größe
                    end = sep_pos + len(separator)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap  # Überlappung
        if start >= len(text):
            break

    return chunks


def get_embedding(text: str) -> List[float] | None:
    """
    Generiert Embedding via Ollama.
    Versucht zuerst nomic-embed-text, dann Fallback auf Chat-Modell.
    """
    # Zuerst Embedding-Modell versuchen
    for model in [EMBED_MODEL, "mxbai-embed-large", "all-minilm"]:
        try:
            resp = httpx.post(
                f"{settings.ollama_base_url}/api/embeddings",
                json={"model": model, "prompt": text},
                timeout=30
            )
            if resp.status_code == 200:
                data = resp.json()
                if "embedding" in data:
                    return data["embedding"]
        except Exception:
            continue

    return None


def ensure_collection(client: QdrantClient, collection_name: str, vector_size: int = EMBED_DIM):
    """Erstellt Qdrant-Collection falls sie nicht existiert."""
    existing = [c.name for c in client.get_collections().collections]
    if collection_name not in existing:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )


def store_document_vectors(
    customer_id: str,
    document_id: str,
    filename: str,
    text: str,
    collection_name: str = "customer_documents",
) -> List[str]:
    """
    Chunked den Text, erstellt Embeddings und speichert sie in Qdrant.
    Gibt eine Liste der erstellten point_ids zurück.

    collection_name: Entweder globale Collection "customer_documents"
                     oder eine kundenspezifische Collection.
    """
    if not text or not text.strip():
        return []

    # Test-Embedding um die Dimension zu ermitteln
    test_vec = get_embedding("test")
    if test_vec is None:
        raise RuntimeError(
            "Kein Ollama-Embedding-Modell verfügbar. "
            "Bitte 'ollama pull nomic-embed-text' ausführen."
        )
    vector_size = len(test_vec)

    client = get_qdrant()
    ensure_collection(client, collection_name, vector_size)

    chunks = chunk_text(text)
    point_ids = []

    for chunk_idx, chunk in enumerate(chunks):
        embedding = get_embedding(chunk)
        if embedding is None:
            continue

        point_id = str(uuid.uuid4())
        payload = {
            "customer_id": customer_id,
            "document_id": document_id,
            "filename": filename,
            "chunk_index": chunk_idx,
            "total_chunks": len(chunks),
            "text": chunk,
        }

        client.upsert(
            collection_name=collection_name,
            points=[PointStruct(id=point_id, vector=embedding, payload=payload)],
        )
        point_ids.append(point_id)

    return point_ids


def search_customer_documents(
    customer_id: str,
    query: str,
    collection_name: str = "customer_documents",
    top_k: int = 5,
) -> List[dict]:
    """
    Semantische Suche in den Kundendokumenten.
    Gibt die relevantesten Text-Chunks zurück.
    """
    query_vec = get_embedding(query)
    if query_vec is None:
        return []

    client = get_qdrant()
    existing = [c.name for c in client.get_collections().collections]
    if collection_name not in existing:
        return []

    results = client.search(
        collection_name=collection_name,
        query_vector=query_vec,
        query_filter=Filter(
            must=[FieldCondition(key="customer_id", match=MatchValue(value=customer_id))]
        ),
        limit=top_k,
        with_payload=True,
    )

    return [
        {
            "score": hit.score,
            "text": hit.payload.get("text", ""),
            "filename": hit.payload.get("filename", ""),
            "chunk_index": hit.payload.get("chunk_index", 0),
            "document_id": hit.payload.get("document_id", ""),
        }
        for hit in results
    ]


def delete_document_vectors(
    document_id: str,
    collection_name: str = "customer_documents",
):
    """Löscht alle Vektoren eines Dokuments aus Qdrant."""
    try:
        client = get_qdrant()
        from qdrant_client.models import FilterSelector
        client.delete(
            collection_name=collection_name,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
                )
            ),
        )
    except Exception:
        pass  # Graceful — Dokument war evtl. nicht in Qdrant
