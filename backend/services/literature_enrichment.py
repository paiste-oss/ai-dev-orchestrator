"""
Literature Enrichment — Phase A.

Holt für gegebene DOIs öffentliche Metadaten von Crossref + Open-Access-Info
von Unpaywall und schreibt sie in `literature_global_index`. Defensiv: bei
Fehlern wird der Status gesetzt, aber keine Exception nach aussen propagiert
— der Caller (z.B. Celery-Task) soll trotzdem weitermachen.

Beide APIs sind frei nutzbar; nur Email für Polite-Pool nötig.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.literature_global_index import LiteratureGlobalIndex

_log = logging.getLogger("uvicorn.error")

# Re-Enrichment-Intervall: erst nach diesem Zeitraum erneut Crossref/Unpaywall fragen
_REFRESH_AFTER = timedelta(days=30)

# Timeouts für externe APIs — Crossref kann träge sein
_HTTP_TIMEOUT = 15.0


def normalize_doi(raw: str | None) -> str | None:
    """Kanonische DOI-Form: lowercase, ohne URL-Prefix, ohne Trailing-Punctuation."""
    if not raw:
        return None
    s = raw.strip().lower()
    # https://doi.org/ oder doi.org/ Prefix entfernen
    s = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", s)
    s = re.sub(r"^doi:\s*", "", s)
    s = s.rstrip(".,;)/>")
    # Plausibilität: muss mit "10." anfangen und einen Slash enthalten
    if not s.startswith("10.") or "/" not in s:
        return None
    return s


def _user_agent() -> str:
    return f"Baddi-Literature/1.0 (mailto:{settings.literature_api_email})"


# ── Crossref ─────────────────────────────────────────────────────────────────

async def _fetch_crossref(client: httpx.AsyncClient, doi: str) -> dict[str, Any] | None:
    """https://api.crossref.org/works/{doi} — gibt 'message' Dict zurück oder None."""
    try:
        r = await client.get(
            f"https://api.crossref.org/works/{doi}",
            headers={"User-Agent": _user_agent(), "Accept": "application/json"},
            timeout=_HTTP_TIMEOUT,
        )
        if r.status_code == 404:
            return {"_status": 404}
        if r.status_code != 200:
            _log.info("[Enrichment/Crossref] %s → HTTP %d", doi, r.status_code)
            return None
        body = r.json()
        return body.get("message") if isinstance(body, dict) else None
    except (httpx.HTTPError, ValueError) as exc:
        _log.info("[Enrichment/Crossref] %s → %s", doi, exc)
        return None


def _parse_crossref(msg: dict[str, Any]) -> dict[str, Any]:
    """Crossref-Response → flache Felder für unsere Spalten."""
    title = (msg.get("title") or [None])[0]
    container = (msg.get("container-title") or [None])[0]
    authors_raw = msg.get("author") or []
    authors: list[str] = []
    for a in authors_raw:
        family = (a.get("family") or "").strip()
        given = (a.get("given") or "").strip()
        if family and given:
            authors.append(f"{family}, {given}")
        elif family:
            authors.append(family)
    # Jahr aus published-print oder published-online oder issued
    year: int | None = None
    for key in ("published-print", "published-online", "issued"):
        date_parts = ((msg.get(key) or {}).get("date-parts") or [[None]])[0]
        if date_parts and date_parts[0]:
            try:
                year = int(date_parts[0])
                break
            except (ValueError, TypeError):
                pass
    type_map = {
        "journal-article": "paper",
        "book": "book",
        "book-chapter": "book",
        "monograph": "book",
        "patent": "patent",
        "proceedings-article": "paper",
        "report": "paper",
        "standard": "norm",
    }
    entry_type = type_map.get(msg.get("type") or "", None)
    abstract = msg.get("abstract")
    if abstract:
        # Crossref liefert Abstracts oft mit JATS-XML-Tags — strippen
        abstract = re.sub(r"<[^>]+>", "", abstract).strip()

    isbns = msg.get("ISBN") or []
    isbn = isbns[0] if isbns else None

    return {
        "title": title,
        "authors": authors or None,
        "year": year,
        "journal": container,
        "volume": msg.get("volume"),
        "issue": msg.get("issue"),
        "pages": msg.get("page"),
        "publisher": msg.get("publisher"),
        "entry_type": entry_type,
        "isbn": isbn,
        "abstract": abstract,
    }


# ── Unpaywall ────────────────────────────────────────────────────────────────

async def _fetch_unpaywall(client: httpx.AsyncClient, doi: str) -> dict[str, Any] | None:
    """https://api.unpaywall.org/v2/{doi}?email=… — Email ist Pflicht."""
    if not settings.literature_api_email:
        return None
    try:
        r = await client.get(
            f"https://api.unpaywall.org/v2/{doi}",
            params={"email": settings.literature_api_email},
            headers={"User-Agent": _user_agent(), "Accept": "application/json"},
            timeout=_HTTP_TIMEOUT,
        )
        if r.status_code == 404:
            return {"_status": 404}
        if r.status_code != 200:
            _log.info("[Enrichment/Unpaywall] %s → HTTP %d", doi, r.status_code)
            return None
        return r.json()
    except (httpx.HTTPError, ValueError) as exc:
        _log.info("[Enrichment/Unpaywall] %s → %s", doi, exc)
        return None


def _parse_unpaywall(data: dict[str, Any]) -> dict[str, Any]:
    """Unpaywall-Response → OA-Felder."""
    best = data.get("best_oa_location") or {}
    return {
        "oa_status": data.get("oa_status"),
        "oa_url": best.get("url_for_pdf") or best.get("url"),
        "oa_license": best.get("license"),
    }


# ── Public API ───────────────────────────────────────────────────────────────

async def enrich_doi(db: AsyncSession, raw_doi: str, force: bool = False) -> LiteratureGlobalIndex | None:
    """Holt/aktualisiert Metadaten für eine DOI. Idempotent: bei vorhandenem
    enriched-Eintrag jünger als _REFRESH_AFTER wird nichts neu gefetcht
    (ausser force=True). Gibt den Datensatz zurück oder None bei ungültigem DOI.
    """
    doi = normalize_doi(raw_doi)
    if not doi:
        return None

    existing = await db.get(LiteratureGlobalIndex, doi)
    now = datetime.utcnow()

    if existing and not force:
        if (existing.enrichment_status == "enriched"
                and existing.last_enriched_at
                and (now - existing.last_enriched_at) < _REFRESH_AFTER):
            return existing
        # 404er nicht andauernd retryen — alle 30 Tage reicht
        if existing.enrichment_status == "failed_404" \
                and existing.last_enriched_at \
                and (now - existing.last_enriched_at) < _REFRESH_AFTER:
            return existing

    if not existing:
        existing = LiteratureGlobalIndex(doi=doi, source="user_doi", enrichment_status="pending")
        db.add(existing)

    # Beide APIs parallel abfragen — sind unabhängig
    async with httpx.AsyncClient() as client:
        import asyncio
        crossref_task = asyncio.create_task(_fetch_crossref(client, doi))
        unpaywall_task = asyncio.create_task(_fetch_unpaywall(client, doi))
        crossref_msg = await crossref_task
        unpaywall_data = await unpaywall_task

    # Crossref auswerten
    crossref_404 = isinstance(crossref_msg, dict) and crossref_msg.get("_status") == 404
    if crossref_msg and not crossref_404:
        try:
            parsed = _parse_crossref(crossref_msg)
            for k, v in parsed.items():
                if v is not None and v != "":
                    setattr(existing, k, v)
            existing.crossref_data = crossref_msg
        except Exception as exc:
            _log.warning("[Enrichment/Crossref-parse] %s: %s", doi, exc)

    # Unpaywall auswerten
    unpaywall_404 = isinstance(unpaywall_data, dict) and unpaywall_data.get("_status") == 404
    if unpaywall_data and not unpaywall_404:
        try:
            oa = _parse_unpaywall(unpaywall_data)
            for k, v in oa.items():
                if v is not None and v != "":
                    setattr(existing, k, v)
            existing.unpaywall_data = unpaywall_data
        except Exception as exc:
            _log.warning("[Enrichment/Unpaywall-parse] %s: %s", doi, exc)

    # Status setzen
    if crossref_404 and unpaywall_404:
        existing.enrichment_status = "failed_404"
        existing.enrichment_error = "DOI in Crossref und Unpaywall nicht gefunden"
    elif crossref_msg or unpaywall_data:
        existing.enrichment_status = "enriched"
        existing.enrichment_error = None
        existing.source = "merged" if (crossref_msg and not crossref_404 and unpaywall_data and not unpaywall_404) \
            else ("crossref" if crossref_msg and not crossref_404 else "unpaywall")
    else:
        existing.enrichment_status = "failed_other"
        existing.enrichment_error = "Beide APIs nicht erreichbar"

    existing.last_enriched_at = now

    # Phase A.4 — Qdrant: Title+Abstract in globaler Semantik-Collection
    if existing.enrichment_status == "enriched" and existing.title and existing.abstract:
        try:
            from services.vector_store import store_global_abstract
            store_global_abstract(existing.doi, existing.title, existing.abstract)
        except Exception as exc:
            _log.info("[Enrichment/Qdrant] %s nicht indexiert: %s", existing.doi, exc)

    return existing


async def enrich_dois_batch(db: AsyncSession, raw_dois: list[str], force: bool = False) -> tuple[int, int]:
    """Sequentiell DOIs anreichern (sanft mit den APIs umgehen).
    Gibt (enriched_count, failed_count) zurück."""
    enriched = 0
    failed = 0
    for raw in raw_dois:
        try:
            res = await enrich_doi(db, raw, force=force)
            if res and res.enrichment_status == "enriched":
                enriched += 1
            else:
                failed += 1
            await db.commit()
        except Exception as exc:
            _log.warning("[Enrichment/Batch] %s: %s", raw, exc)
            try: await db.rollback()
            except Exception: pass
            failed += 1
    return enriched, failed
