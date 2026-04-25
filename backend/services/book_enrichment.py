"""
Book Enrichment — Phase A.3.

OpenLibrary: bibliographische Metadaten + Cover-Bild für jede ISBN
DOAB: Open-Access-Direkt-Download-URLs (Subset von Büchern)

Beide gratis, beide ohne Auth. ISBN ist der Schlüssel.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.book_global_index import BookGlobalIndex

_log = logging.getLogger("uvicorn.error")
_REFRESH_AFTER = timedelta(days=30)
_HTTP_TIMEOUT = 15.0


def normalize_isbn(raw: str | None) -> str | None:
    """Lässt nur Ziffern + 'X' (am Ende) zu, akzeptiert 10er und 13er ISBNs."""
    if not raw:
        return None
    s = re.sub(r"[^0-9Xx]", "", raw.upper())
    if len(s) == 10 or len(s) == 13:
        return s
    return None


def _user_agent() -> str:
    return f"Baddi-Books/1.0 (mailto:{settings.literature_api_email})"


# ── OpenLibrary ──────────────────────────────────────────────────────────────

async def _fetch_openlibrary(client: httpx.AsyncClient, isbn: str) -> dict[str, Any] | None:
    """Holt Buch-Daten von OpenLibrary via ISBN-Endpoint.
    https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data
    """
    try:
        r = await client.get(
            "https://openlibrary.org/api/books",
            params={"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"},
            headers={"User-Agent": _user_agent()},
            timeout=_HTTP_TIMEOUT,
        )
        if r.status_code != 200:
            return None
        body = r.json()
        # Response-Format: { "ISBN:9780123456789": { ... } }
        key = f"ISBN:{isbn}"
        return body.get(key) if isinstance(body, dict) else None
    except (httpx.HTTPError, ValueError) as exc:
        _log.info("[BookEnrich/OpenLibrary] %s → %s", isbn, exc)
        return None


def _parse_openlibrary(data: dict[str, Any]) -> dict[str, Any]:
    """OpenLibrary-Response → flache Felder."""
    title = data.get("title")
    subtitle = data.get("subtitle")
    authors_raw = data.get("authors") or []
    authors = [a.get("name") for a in authors_raw if isinstance(a, dict) and a.get("name")]

    publishers_raw = data.get("publishers") or []
    publisher = (publishers_raw[0].get("name") if publishers_raw and isinstance(publishers_raw[0], dict) else None)

    # Datum kann "March 1, 2018" oder "2018" sein
    year = None
    publish_date = data.get("publish_date") or ""
    m = re.search(r"\b(19|20)\d{2}\b", str(publish_date))
    if m:
        try: year = int(m.group())
        except ValueError: pass

    languages_raw = data.get("languages") or []
    language = None
    if languages_raw and isinstance(languages_raw[0], dict):
        # Format: {"key": "/languages/eng"}
        lkey = languages_raw[0].get("key", "")
        language = lkey.split("/")[-1][:16] if lkey else None

    pages = data.get("number_of_pages")
    description = data.get("notes") or data.get("excerpts", [{}])[0].get("text") if data.get("excerpts") else None
    if isinstance(description, dict):
        description = description.get("value")

    cover_url = None
    cover = data.get("cover") or {}
    if isinstance(cover, dict):
        cover_url = cover.get("large") or cover.get("medium") or cover.get("small")

    return {
        "title": title,
        "subtitle": subtitle,
        "authors": authors or None,
        "year": year,
        "publisher": publisher,
        "language": language,
        "page_count": pages if isinstance(pages, int) else None,
        "description": description,
        "cover_url": cover_url,
    }


# ── DOAB ─────────────────────────────────────────────────────────────────────

async def _fetch_doab(client: httpx.AsyncClient, isbn: str) -> dict[str, Any] | None:
    """DOAB REST-API: https://directory.doabooks.org/rest/search?query=isbn:{isbn}
    Liefert nur OA-Bücher. 404 → kein OA-Buch zu dieser ISBN."""
    try:
        r = await client.get(
            "https://directory.doabooks.org/rest/search",
            params={"query": f"isbn:{isbn}", "expand": "metadata,bitstreams"},
            headers={"User-Agent": _user_agent(), "Accept": "application/json"},
            timeout=_HTTP_TIMEOUT,
        )
        if r.status_code != 200:
            return None
        body = r.json()
        if isinstance(body, list) and body:
            return body[0]
        return None
    except (httpx.HTTPError, ValueError) as exc:
        _log.info("[BookEnrich/DOAB] %s → %s", isbn, exc)
        return None


def _parse_doab(data: dict[str, Any]) -> dict[str, Any]:
    """DOAB-Response → OA-Felder.
    Bitstreams enthalten den Direct-Download-Link (PDF)."""
    bitstreams = data.get("bitstreams") or []
    oa_url = None
    for bs in bitstreams:
        if not isinstance(bs, dict):
            continue
        rl = bs.get("retrieveLink") or bs.get("url")
        mime = (bs.get("mimeType") or bs.get("format") or "").lower()
        if rl and "pdf" in mime:
            # DOAB liefert relative Links — absolut machen
            if rl.startswith("/"):
                rl = "https://directory.doabooks.org" + rl
            oa_url = rl
            break

    # Lizenz aus Metadaten
    license_str = None
    metadata = data.get("metadata") or []
    publisher = None
    for m in metadata:
        if not isinstance(m, dict):
            continue
        k = m.get("key", "")
        v = m.get("value")
        if k == "dc.rights" and not license_str:
            license_str = v
        elif k == "dc.publisher" and not publisher:
            publisher = v

    return {
        "oa_url": oa_url,
        "oa_license": license_str[:64] if license_str else None,
        "oa_publisher": publisher,
    }


# ── Public API ───────────────────────────────────────────────────────────────

async def enrich_isbn(db: AsyncSession, raw_isbn: str, force: bool = False) -> BookGlobalIndex | None:
    isbn = normalize_isbn(raw_isbn)
    if not isbn:
        return None

    existing = await db.get(BookGlobalIndex, isbn)
    now = datetime.utcnow()
    if existing and not force:
        if existing.enrichment_status in ("enriched", "failed_404") \
                and existing.last_enriched_at \
                and (now - existing.last_enriched_at) < _REFRESH_AFTER:
            return existing

    if not existing:
        existing = BookGlobalIndex(isbn=isbn, source="user_isbn", enrichment_status="pending")
        db.add(existing)

    async with httpx.AsyncClient() as client:
        import asyncio
        ol_task = asyncio.create_task(_fetch_openlibrary(client, isbn))
        doab_task = asyncio.create_task(_fetch_doab(client, isbn))
        ol_data = await ol_task
        doab_data = await doab_task

    if ol_data:
        try:
            parsed = _parse_openlibrary(ol_data)
            for k, v in parsed.items():
                if v not in (None, ""):
                    setattr(existing, k, v)
            existing.openlibrary_data = ol_data
        except Exception as exc:
            _log.warning("[BookEnrich/OL-parse] %s: %s", isbn, exc)

    if doab_data:
        try:
            parsed = _parse_doab(doab_data)
            for k, v in parsed.items():
                if v not in (None, ""):
                    setattr(existing, k, v)
            existing.doab_data = doab_data
        except Exception as exc:
            _log.warning("[BookEnrich/DOAB-parse] %s: %s", isbn, exc)

    if ol_data or doab_data:
        existing.enrichment_status = "enriched"
        existing.enrichment_error = None
        if ol_data and doab_data:
            existing.source = "merged"
        elif ol_data:
            existing.source = "openlibrary"
        else:
            existing.source = "doab"
    else:
        existing.enrichment_status = "failed_404"
        existing.enrichment_error = "ISBN nicht in OpenLibrary/DOAB gefunden"
    existing.last_enriched_at = now
    return existing
