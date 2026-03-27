"""
Basis-Klasse für alle Knowledge-Ingestors.
Jeder Ingestor implementiert discover() und fetch_document().
"""
import hashlib
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

_log = logging.getLogger(__name__)


@dataclass
class RawDocument:
    title: str
    url: str
    text: str
    language: str = "de"
    published_at: str = ""
    metadata: dict | None = None


class BaseIngestor(ABC):
    """Basis-Klasse für alle Knowledge-Ingestors."""

    source_type: str = "unknown"
    domain: str = "allgemein"

    @abstractmethod
    def discover(self, limit: int = 100) -> list[dict]:
        """
        Gibt eine Liste von Dokumenten-Metadaten zurück (title, url, ...).
        Noch kein Text — nur URLs und Titel zum Queuing.
        """
        ...

    @abstractmethod
    def fetch_document(self, meta: dict) -> RawDocument | None:
        """
        Lädt und parsed ein einzelnes Dokument.
        Gibt None zurück wenn das Dokument nicht geladen werden kann.
        """
        ...

    @staticmethod
    def content_hash(text: str) -> str:
        """SHA-256 Hash des Textes für Deduplizierung."""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
