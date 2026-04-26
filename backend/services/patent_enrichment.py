"""
Patent Enrichment — Phase A.4.

Strategie:
1. Publikationsnummer normalisieren (z. B. "US 10,123,456 B2" → "US10123456B2")
2. Country-Code + Number-Body + Kind-Code zerlegen
3. Direct-Links zu öffentlichen Patent-DBs konstruieren (Google Patents,
   Espacenet, USPTO) — diese funktionieren immer, kein API-Key nötig
4. Optional: EPO OPS API für volle Metadaten wenn EPO_OPS_KEY in env
   (nicht implementiert in dieser Version — placeholder)
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.patent_global_index import PatentGlobalIndex

_log = logging.getLogger("uvicorn.error")
_REFRESH_AFTER = timedelta(days=30)
_HTTP_TIMEOUT = 15.0


def normalize_patent_number(raw: str | None) -> dict[str, str] | None:
    """Zerlegt eine Patent-Publikationsnummer.

    Beispiele:
      "US 10,123,456 B2"   → {pn: "US10123456B2", country: "US", number: "10123456", kind: "B2"}
      "EP1234567A1"        → {pn: "EP1234567A1", country: "EP", number: "1234567", kind: "A1"}
      "WO2020/123456"      → {pn: "WO2020123456", country: "WO", number: "2020123456", kind: ""}
    """
    if not raw:
        return None
    s = re.sub(r"[\s,/.\-_]", "", raw).upper()
    # Country (1-3 Buchstaben am Anfang) + Body (Ziffern) + optional Kind-Code
    m = re.match(r"^([A-Z]{2,3})(\d+)([A-Z]\d?)?$", s)
    if not m:
        return None
    country, number, kind = m.group(1), m.group(2), (m.group(3) or "")
    pn = f"{country}{number}{kind}"
    return {"pn": pn, "country": country, "number": number, "kind": kind}


def _user_agent() -> str:
    return f"Baddi-Patents/1.0 (mailto:{settings.literature_api_email})"


def _build_links(parts: dict[str, str]) -> dict[str, str | None]:
    """Konstruiert öffentliche Patent-DB-URLs aus den Komponenten."""
    pn = parts["pn"]
    country = parts["country"]
    google = f"https://patents.google.com/patent/{pn}/en"
    # Espacenet: nutzt CC + Number ohne Kind-Code
    espacenet = f"https://worldwide.espacenet.com/patent/search/family/000000000/publication/{pn}?q={pn}"
    # USPTO: nur für US-Patente sinnvoll
    uspto = None
    if country == "US":
        uspto = f"https://patft.uspto.gov/netacgi/nph-Parser?patentnumber={parts['number']}"
    # Google Patents bietet PDF-Direkt-Download via /pdf-Pfad (auch bei Bot-Calls möglich)
    pdf = f"https://patentimages.storage.googleapis.com/pdfs/{pn}.pdf"
    return {
        "google_patents_url": google,
        "espacenet_url": espacenet,
        "uspto_url": uspto,
        "pdf_url": pdf,
    }


async def _fetch_google_patents_meta(client: httpx.AsyncClient, pn: str) -> dict[str, Any] | None:
    """Best-effort-Meta von Google Patents.
    Holt die HTML-Seite und parst <meta>-Tags (Schema.org / OpenGraph).
    Funktioniert ohne API-Key, ist aber abhängig von Google's HTML-Struktur.
    """
    url = f"https://patents.google.com/patent/{pn}/en"
    try:
        r = await client.get(
            url, headers={"User-Agent": _user_agent(), "Accept": "text/html"},
            timeout=_HTTP_TIMEOUT, follow_redirects=True,
        )
        if r.status_code != 200:
            return None
        html = r.text
        meta: dict[str, Any] = {}

        # Title aus <meta name="DC.title">
        m = re.search(r'<meta\s+name="DC\.title"\s+content="([^"]+)"', html)
        if m:
            meta["title"] = m.group(1).strip()
        else:
            m = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html)
            if m:
                meta["title"] = m.group(1).split(" - ")[-1].strip()

        # Inventoren — DC.contributor (mehrfach)
        inventors = re.findall(r'<meta\s+name="DC\.contributor"\s+content="([^"]+)"\s+scheme="inventor"', html)
        if inventors:
            meta["inventors"] = [i.strip() for i in inventors]

        # Anmelder — DC.contributor scheme="assignee"
        assignees = re.findall(r'<meta\s+name="DC\.contributor"\s+content="([^"]+)"\s+scheme="assignee"', html)
        if assignees:
            meta["assignees"] = [a.strip() for a in assignees]

        # Publikations-Datum
        m = re.search(r'<meta\s+name="DC\.date"\s+content="(\d{4}-\d{2}-\d{2})"\s+scheme="dateOfPublication"', html)
        if m:
            from datetime import date as _date
            try:
                y, mo, d = m.group(1).split("-")
                meta["publication_date"] = _date(int(y), int(mo), int(d))
            except Exception:
                pass

        # Abstract — meist im <abstract>-Element oder <meta name="description">
        m = re.search(r'<meta\s+name="description"\s+content="([^"]+)"', html)
        if m:
            meta["abstract"] = m.group(1).strip()[:4000]

        return meta if meta else None
    except (httpx.HTTPError, ValueError) as exc:
        _log.info("[PatentEnrich/GooglePatents] %s → %s", pn, exc)
        return None


async def enrich_patent(db: AsyncSession, raw_number: str, force: bool = False) -> PatentGlobalIndex | None:
    parts = normalize_patent_number(raw_number)
    if not parts:
        return None

    pn = parts["pn"]
    existing = await db.get(PatentGlobalIndex, pn)
    now = datetime.utcnow()
    if existing and not force:
        if existing.enrichment_status in ("enriched", "partial_url_only", "failed_404") \
                and existing.last_enriched_at \
                and (now - existing.last_enriched_at) < _REFRESH_AFTER:
            return existing

    if not existing:
        existing = PatentGlobalIndex(publication_number=pn, source="user_input", enrichment_status="pending")
        db.add(existing)

    # Stage 1: URLs immer konstruierbar
    links = _build_links(parts)
    existing.country_code = parts["country"]
    existing.kind_code = parts["kind"] or None
    for k, v in links.items():
        if v:
            setattr(existing, k, v)

    # Stage 2: Best-effort Meta-Lookup
    async with httpx.AsyncClient() as client:
        meta = await _fetch_google_patents_meta(client, pn)

    if meta:
        for k, v in meta.items():
            if v not in (None, "", []):
                setattr(existing, k, v)
        existing.enrichment_status = "enriched"
        existing.enrichment_error = None
        existing.source = "google_patents"
    else:
        # Mindestens Links sind verfügbar
        existing.enrichment_status = "partial_url_only"
        existing.enrichment_error = "Meta-Scrape nicht erfolgreich — Landing-URLs verfügbar"

    existing.last_enriched_at = now
    return existing
