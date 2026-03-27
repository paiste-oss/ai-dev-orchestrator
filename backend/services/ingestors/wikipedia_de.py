"""
Wikipedia DE Ingestor — Allgemeinwissen (Deutsch)
Nutzt die Wikipedia REST API für Artikel-Zusammenfassungen.
"""
import logging
import time
import httpx
from services.knowledge_ingestor import BaseIngestor, RawDocument

_log = logging.getLogger(__name__)
_API_SUMMARY = "https://de.wikipedia.org/api/rest_v1/page/summary/{title}"
_API_SEARCH = "https://de.wikipedia.org/w/api.php"

# Themen-Kategorien für Schweizer KMU
SEED_TOPICS = [
    # Recht & Wirtschaft
    "Obligationenrecht_(Schweiz)", "Zivilgesetzbuch_(Schweiz)", "Mehrwertsteuergesetz_(Schweiz)",
    "Aktiengesellschaft_(Schweiz)", "GmbH_(Schweiz)", "Einzelunternehmen_(Schweiz)",
    "Arbeitsrecht_(Schweiz)", "Sozialversicherung_(Schweiz)", "AHV", "IV_(Schweiz)",
    "Krankenversicherung_(Schweiz)", "Unfallversicherung_(Schweiz)",
    # Finanzen
    "Buchhaltung", "Bilanz", "Erfolgsrechnung", "Doppelte_Buchhaltung",
    "Mehrwertsteuer_(Schweiz)", "Einkommenssteuer_(Schweiz)", "Unternehmenssteuer_(Schweiz)",
    # Gesundheit (häufige Baddi-Anfragen)
    "Diabetes_mellitus", "Bluthochdruck", "Depression", "Burnout_(Medizin)",
    # Allgemein nützlich
    "Schweiz", "Bern", "Zürich", "Kanton", "Gemeinde_(Schweiz)",
    "Bundesrat_(Schweiz)", "Nationalrat_(Schweiz)", "Ständerat",
]


class WikipediaDeIngestor(BaseIngestor):
    source_type = "wikipedia"
    domain = "allgemein"

    def __init__(self, topics: list[str] | None = None):
        self.topics = topics or SEED_TOPICS

    def discover(self, limit: int = 100) -> list[dict]:
        results = []
        for topic in self.topics[:limit]:
            results.append({
                "title": topic.replace("_", " "),
                "url": f"https://de.wikipedia.org/wiki/{topic}",
                "wiki_title": topic,
            })
        return results

    def fetch_document(self, meta: dict) -> RawDocument | None:
        wiki_title = meta.get("wiki_title", "")
        if not wiki_title:
            return None
        try:
            time.sleep(0.2)
            resp = httpx.get(
                _API_SUMMARY.format(title=wiki_title),
                timeout=20.0,
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            title = data.get("title", meta["title"])
            extract = data.get("extract", "")
            if not extract or len(extract) < 100:
                return None
            return RawDocument(
                title=title,
                url=data.get("content_urls", {}).get("desktop", {}).get("page", meta["url"]),
                text=f"{title}\n\n{extract}",
                language="de",
                published_at="",
                metadata={"wiki_title": wiki_title, "source": "de.wikipedia.org"},
            )
        except Exception as exc:
            _log.warning("Wikipedia fetch failed for %s: %s", wiki_title, exc)
            return None
