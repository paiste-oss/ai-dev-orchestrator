"""
Intent Vector Store — Semantisches Fallback für den Router.

Qdrant-Kollektion: router_intent_examples
  payload: { intent, text }
  vector:  768-dim (nomic-embed-text via Ollama)

Ablauf:
  1. Beim ersten Aufruf: Seed-Beispiele einmalig speichern
  2. Bei jedem Fallback: Embedding der Nachricht → Nearest-Neighbour-Suche
  3. Score ≥ THRESHOLD → Intent übernehmen, sonst "conversation"
"""
import logging
import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue,
)
from core.config import settings

_log = logging.getLogger(__name__)
COLLECTION = "router_intent_examples"
THRESHOLD = 0.78   # Konservativ — lieber conversation als falsch routen
DIM = 768

# ── Seed-Beispiele pro Intent ──────────────────────────────────────────────────
_EXAMPLES: dict[str, list[str]] = {
    "transport": [
        "Wann fährt der nächste Zug von Zürich nach Bern?",
        "Wie komme ich von Basel nach Genf?",
        "Verbindung heute Abend nach Lausanne",
        "Abfahrtszeiten am Hauptbahnhof",
        "Welcher Bus fährt nach Winterthur?",
        "Nächste S-Bahn Richtung Flughafen",
        "Zugverbindung morgen früh nach Luzern",
        "Tram nach Bellevue Zürich",
        "Öffentlicher Verkehr Verbindung heute",
        "Wann kommt der nächste Zug?",
    ],
    "web_search": [
        "Was ist aktuell in der Schweiz los?",
        "Neueste Nachrichten über Künstliche Intelligenz",
        "Aktuelle Entwicklungen bei Tesla",
        "Was passiert gerade in der Politik?",
        "Neuigkeiten über den Klimawandel",
        "Suche Informationen über Quantencomputer",
        "Was gibt es Neues zu diesem Thema?",
        "Aktuelle Infos über den Aktienmarkt",
    ],
    "web_fetch": [
        "Was steht auf dieser Website?",
        "Öffne diesen Link und fasse zusammen",
        "Lies diese Seite für mich",
        "Besuche die URL und erkläre den Inhalt",
        "Schau auf der Seite nach dem Preis",
        "Hole Informationen von dieser Adresse",
    ],
    "image_generation": [
        "Zeig mir wie Paris bei Nacht aussieht",
        "Ich möchte ein Bild von einem Drachen sehen",
        "Visualisiere einen bunten Sonnenuntergang",
        "Kannst du ein Porträt malen?",
        "Illustriere eine mittelalterliche Burg",
        "Entwirf ein Logo für mein Unternehmen",
        "Wie würde das als Kunstwerk aussehen?",
    ],
    "document": [
        "Fasse dieses Dokument für mich zusammen",
        "Was steht in der angehängten PDF?",
        "Analysiere den Bericht im Anhang",
        "Erkläre mir den Inhalt dieser Datei",
        "Durchsuche das Dokument nach wichtigen Punkten",
        "Lies das hochgeladene File durch",
    ],
    "email": [
        "Schreib eine E-Mail an meinen Chef",
        "Sende eine Nachricht an die Firma",
        "Verfasse eine E-Mail wegen der Rechnung",
        "Schicke dem Kunden eine Bestätigung per Mail",
        "Kannst du diese E-Mail für mich schreiben?",
    ],
}


def _get_client() -> QdrantClient:
    return QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)


def _embed(text: str) -> list[float] | None:
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/embeddings",
            json={"model": "nomic-embed-text", "prompt": text},
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]
    except Exception as exc:
        _log.warning("Embedding failed: %s", exc)
        return None


def _ensure_seeded() -> bool:
    """Erstellt Collection + Seed-Daten beim ersten Aufruf. Gibt True zurück wenn OK."""
    client = _get_client()
    try:
        existing = [c.name for c in client.get_collections().collections]
        if COLLECTION in existing:
            count = client.count(COLLECTION).count
            if count > 0:
                return True

        # Collection anlegen
        if COLLECTION not in existing:
            client.create_collection(
                collection_name=COLLECTION,
                vectors_config=VectorParams(size=DIM, distance=Distance.COSINE),
            )

        # Seed-Beispiele einbetten + speichern
        points = []
        idx = 0
        for intent, examples in _EXAMPLES.items():
            for text in examples:
                vec = _embed(text)
                if vec:
                    points.append(PointStruct(
                        id=idx,
                        vector=vec,
                        payload={"intent": intent, "text": text},
                    ))
                    idx += 1

        if points:
            client.upsert(collection_name=COLLECTION, points=points)
            _log.info("Intent store seeded: %d examples", len(points))
        return True
    except Exception as exc:
        _log.warning("Intent store seed failed: %s", exc)
        return False


_seeded = False


def semantic_route(message: str) -> str | None:
    """
    Gibt den Intent zurück wenn Ähnlichkeit ≥ THRESHOLD, sonst None.
    Wird nur aufgerufen wenn Regex keinen spezifischen Intent gefunden hat.
    """
    global _seeded
    if not _seeded:
        _seeded = _ensure_seeded()
    if not _seeded:
        return None

    vec = _embed(message)
    if not vec:
        return None

    try:
        client = _get_client()
        response = client.query_points(
            collection_name=COLLECTION,
            query=vec,
            limit=1,
            score_threshold=THRESHOLD,
            with_payload=True,
        )
        if response.points:
            intent = response.points[0].payload["intent"]
            score = response.points[0].score
            _log.info("Semantic route: '%s' → %s (score=%.3f)", message[:50], intent, score)
            return intent
    except Exception as exc:
        _log.warning("Semantic route failed: %s", exc)
    return None
