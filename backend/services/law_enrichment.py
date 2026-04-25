"""
Law Enrichment — Phase A.3 für Schweizer Bundesrecht via Fedlex.

Fedlex liefert ELI-konforme URLs für jede SR-Nummer:
  https://www.fedlex.admin.ch/eli/cc/{year}/{seq}/{lang} → HTML-Page
  PDF-Direkt-Download via Content-Negotiation oder direkt am Pfad

Lookup über die Fedlex-Such-API (api.fedlex.admin.ch) ist möglich, aber für
SR-Nummer-direkten Zugriff reicht der ELI-Resolver:
  https://www.fedlex.admin.ch/eli/cc?eli=eli/cc/{year}/{seq}/de

Vereinfachung: Wir nutzen die SR-Nummer-API direkt, das Fedlex Linked-Data-API
gibt JSON-LD zurück mit allen Metadaten.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.law_global_index import LawGlobalIndex

_log = logging.getLogger("uvicorn.error")
_REFRESH_AFTER = timedelta(days=30)
_HTTP_TIMEOUT = 20.0


def normalize_sr_number(raw: str | None) -> str | None:
    """Akzeptiert Eingaben wie 'SR 220', '220', 'SR.220', 'sr-220' und gibt '220' zurück.
    SR-Nummern sind kurze Strings mit Ziffern + optional Punkt: '220', '101', '281.1'.
    """
    if not raw:
        return None
    s = re.sub(r"^(?:SR|sr)[\s.\-_]*", "", raw.strip())
    s = re.sub(r"[\s\-_]", "", s)
    if not re.match(r"^\d+(\.\d+)*$", s):
        return None
    return s


def _user_agent() -> str:
    return f"Baddi-Laws/1.0 (mailto:{settings.literature_api_email})"


async def _fetch_fedlex(client: httpx.AsyncClient, sr_number: str) -> dict[str, Any] | None:
    """Holt Gesetzes-Metadaten aus Fedlex.

    Strategie: Resolver-URL aufrufen, redirecten lassen, ELI aus Final-URL ablesen.
    Direkter API-Endpunkt:
      GET https://www.fedlex.admin.ch/eli/cc/{year}/{seq}/de
    funktioniert aber nur wenn man Year/Seq kennt. Für eine SR-Nummer direkt:
      GET https://www.fedlex.admin.ch/eli/oc/?_format=json&number={sr}
    """
    # Variante 1: ELI-Resolver-URL (gibt HTML zurück, aber Final-URL hat ELI)
    eli_url = f"https://www.fedlex.admin.ch/eli/cc/{sr_number}/de"
    try:
        r = await client.get(
            eli_url, follow_redirects=True,
            headers={"User-Agent": _user_agent(), "Accept": "text/html"},
            timeout=_HTTP_TIMEOUT,
        )
        if r.status_code != 200:
            # Nicht jedes SR ist direkt unter /eli/cc/{sr}/ erreichbar — kann auch /eli/oc sein
            return await _fallback_fedlex_search(client, sr_number)
        # Aus HTML grundlegende Felder extrahieren — Fedlex setzt OpenGraph + Schema.org
        html = r.text
        return _parse_fedlex_html(sr_number, str(r.url), html)
    except (httpx.HTTPError, ValueError) as exc:
        _log.info("[LawEnrich/Fedlex] SR %s → %s", sr_number, exc)
        return None


async def _fallback_fedlex_search(client: httpx.AsyncClient, sr_number: str) -> dict[str, Any] | None:
    """Such-API als Fallback wenn Direkt-URL nicht klappt."""
    try:
        r = await client.get(
            "https://fedlex.data.admin.ch/sparql",  # SPARQL Endpoint
            timeout=_HTTP_TIMEOUT,
            headers={"User-Agent": _user_agent()},
        )
        # SPARQL ist mächtig aber für hier overkill — wir geben einfach None zurück
        # und der Caller markiert als failed_404
        _ = r
        return None
    except httpx.HTTPError:
        return None


def _parse_fedlex_html(sr_number: str, final_url: str, html: str) -> dict[str, Any]:
    """Extrahiert Felder aus dem HTML der Fedlex-Detail-Seite.
    Fedlex setzt sauberes <meta>-Mark-up + JSON-LD im <head>.
    """
    # Title — sucht nach Erlass-Bezeichnung
    title = None
    short_title = None
    abbreviation = None

    # OpenGraph + Schema.org
    og_title = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html)
    if og_title:
        title = og_title.group(1).strip()

    # Kurztitel und Abkürzung kommen oft in Klammern: "Bundesgesetz ... (XYZ-Gesetz, ABC)"
    if title:
        m = re.search(r"\(([^()]*?)\)\s*$", title)
        if m:
            inner = m.group(1)
            parts = [p.strip() for p in inner.split(",")]
            if parts:
                short_title = parts[0][:512] if parts else None
                if len(parts) > 1:
                    abbreviation = parts[-1][:64]

    # Erlass-Datum / Inkrafttreten via JSON-LD
    enacted = None
    in_force = None
    jsonld_match = re.search(r'<script\s+type="application/ld\+json">\s*(\{.*?\})\s*</script>', html, re.DOTALL)
    if jsonld_match:
        try:
            import json as _json
            obj = _json.loads(jsonld_match.group(1))
            enacted = obj.get("dateCreated") or obj.get("datePublished")
            in_force = obj.get("temporalCoverage")
        except Exception:
            pass

    # PDF-URL — Fedlex bietet PDF unter abgeleiteter URL
    # ELI-Pattern: /eli/cc/2023/100/de → /eli/cc/2023/100/de.pdf
    pdf_url = None
    eli_uri = None
    eli_match = re.search(r"/eli/(cc|oc)/([^/]+)/(\d+)/(\w+)", final_url)
    if eli_match:
        eli_uri = final_url.split("?")[0]
        # Fedlex unterstützt PDF-Variante über Content-Type-Verhandlung —
        # aber direkter Pfad funktioniert auch:
        pdf_url = eli_uri.rstrip("/") + ".pdf"

    return {
        "title": title,
        "short_title": short_title,
        "abbreviation": abbreviation,
        "enacted_date": enacted,
        "in_force_date": in_force,
        "html_url": final_url,
        "pdf_url": pdf_url,
        "eli_uri": eli_uri,
        "fedlex_data": {"raw_url": final_url, "title": title},
    }


async def enrich_sr(db: AsyncSession, raw_sr: str, force: bool = False) -> LawGlobalIndex | None:
    sr = normalize_sr_number(raw_sr)
    if not sr:
        return None

    existing = await db.get(LawGlobalIndex, sr)
    now = datetime.utcnow()
    if existing and not force:
        if existing.enrichment_status in ("enriched", "failed_404") \
                and existing.last_enriched_at \
                and (now - existing.last_enriched_at) < _REFRESH_AFTER:
            return existing

    if not existing:
        existing = LawGlobalIndex(sr_number=sr, source="fedlex", enrichment_status="pending")
        db.add(existing)

    async with httpx.AsyncClient() as client:
        data = await _fetch_fedlex(client, sr)

    if data:
        try:
            for k, v in data.items():
                if v not in (None, ""):
                    if k in ("enacted_date", "in_force_date") and isinstance(v, str):
                        # ISO-Date-Parse
                        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", v)
                        if m:
                            from datetime import date
                            v = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                        else:
                            continue
                    setattr(existing, k, v)
            existing.enrichment_status = "enriched"
            existing.enrichment_error = None
            existing.status = "in_force"
        except Exception as exc:
            _log.warning("[LawEnrich/parse] SR %s: %s", sr, exc)
            existing.enrichment_status = "failed_other"
            existing.enrichment_error = str(exc)[:300]
    else:
        existing.enrichment_status = "failed_404"
        existing.enrichment_error = f"SR {sr} nicht via Fedlex auflösbar"
    existing.last_enriched_at = now
    return existing
