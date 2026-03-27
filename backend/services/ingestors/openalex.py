"""
OpenAlex Ingestor — Wissenschaftliche Paper (kostenlos, 100k req/Tag)
https://openalex.org — Open scholarly metadata platform

Indexiert nur Abstracts (kein Volltext) für schnelle Suche.
"""
import logging
import time
import httpx
from services.knowledge_ingestor import BaseIngestor, RawDocument

_log = logging.getLogger(__name__)
_API = "https://api.openalex.org/works"

# Für Baddi relevante Themenfelder
DEFAULT_CONCEPTS = [
    "C18762648",   # Artificial Intelligence
    "C41008148",   # Computer Science
    "C144024400",  # Commerce / Business
    "C162324750",  # Economics
    "C17744445",   # Political Science / Law
    "C71924100",   # Medicine (für gesundheitliche Fragen)
    "C185592680",  # Chemistry (allgemein)
    "C54355233",   # Environmental Science
]


class OpenAlexIngestor(BaseIngestor):
    source_type = "paper"
    domain = "wissenschaft"

    def __init__(self, concept_ids: list[str] | None = None, language: str = "en"):
        self.concept_ids = concept_ids or DEFAULT_CONCEPTS[:4]
        self.language = language

    def discover(self, limit: int = 100) -> list[dict]:
        """Holt aktuelle Paper via OpenAlex API."""
        results = []
        per_page = min(limit, 50)
        concept_filter = "|".join(self.concept_ids[:3])

        try:
            resp = httpx.get(
                _API,
                params={
                    "filter": f"concepts.id:{concept_filter},language:{self.language},has_abstract:true",
                    "sort": "cited_by_count:desc",
                    "per-page": per_page,
                    "select": "id,title,doi,publication_year,abstract_inverted_index,primary_location,concepts",
                    "mailto": "knowledge@baddi.ch",
                },
                timeout=30.0,
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            for item in data.get("results", []):
                title = item.get("title", "")
                doi = item.get("doi", "")
                oa_id = item.get("id", "")
                year = item.get("publication_year", "")
                if title and (doi or oa_id):
                    abstract = _reconstruct_abstract(item.get("abstract_inverted_index"))
                    results.append({
                        "title": title,
                        "url": doi or oa_id,
                        "oa_id": oa_id,
                        "year": str(year),
                        "abstract": abstract,
                    })
        except Exception as exc:
            _log.warning("OpenAlex discover failed: %s", exc)

        return results[:limit]

    def fetch_document(self, meta: dict) -> RawDocument | None:
        abstract = meta.get("abstract", "")
        if not abstract or len(abstract) < 50:
            return None
        return RawDocument(
            title=meta["title"],
            url=meta.get("url", ""),
            text=f"{meta['title']}\n\n{abstract}",
            language=self.language,
            published_at=meta.get("year", ""),
            metadata={"oa_id": meta.get("oa_id", ""), "source": "openalex.org"},
        )


def _reconstruct_abstract(inverted_index: dict | None) -> str:
    """Rekonstruiert Abstract aus OpenAlex invertiertem Index."""
    if not inverted_index:
        return ""
    words = {}
    for word, positions in inverted_index.items():
        for pos in positions:
            words[pos] = word
    return " ".join(words[k] for k in sorted(words.keys()))
