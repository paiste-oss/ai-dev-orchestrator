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
    """Holt Gesetzes-Metadaten aus Fedlex via SPARQL.

    Fedlex serviert die Web-UI als SPA (HTML-Parsing nutzlos). Daten kommen
    aus dem Linked-Data-Endpoint via SPARQL. Wir suchen die ConsolidationAbstract
    zur SR-Nummer und holen Titel + Abkürzung in DE.
    """
    sparql_query = f"""PREFIX jolux: <http://data.legilux.public.lu/resource/ontology/jolux#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?cc ?title ?titleShort ?abbreviation ?dateApplicability WHERE {{
  ?cc a jolux:ConsolidationAbstract ;
       jolux:classifiedByTaxonomyEntry ?tax .
  ?tax skos:notation "{sr_number}" .
  OPTIONAL {{
    ?expression jolux:isRealizedBy ?cc ;
                jolux:language <http://publications.europa.eu/resource/authority/language/DEU> ;
                jolux:title ?title .
    OPTIONAL {{ ?expression jolux:titleShort ?titleShort . }}
    OPTIONAL {{ ?expression jolux:titleAlternative ?abbreviation . }}
  }}
  OPTIONAL {{ ?cc jolux:dateApplicability ?dateApplicability . }}
}}
LIMIT 1"""

    landing_url = f"https://www.fedlex.admin.ch/de/cc/{sr_number}"

    try:
        r = await client.post(
            "https://fedlex.data.admin.ch/sparqlendpoint",
            data={"query": sparql_query},
            headers={
                "User-Agent": _user_agent(),
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=_HTTP_TIMEOUT,
        )
        if r.status_code != 200:
            _log.info("[LawEnrich/Fedlex-SPARQL] SR %s → HTTP %d", sr_number, r.status_code)
            return {"sr_number": sr_number, "html_url": landing_url, "fedlex_data": {"sparql_status": r.status_code}}

        body = r.json()
        bindings = (body.get("results") or {}).get("bindings") or []
        if not bindings:
            # Kein SPARQL-Treffer — Landing-URL bleibt verfügbar (User landet auf Fedlex-Detailseite)
            return {"sr_number": sr_number, "html_url": landing_url, "fedlex_data": {"sparql_empty": True}}

        b = bindings[0]
        cc_uri = (b.get("cc") or {}).get("value")
        title = (b.get("title") or {}).get("value")
        title_short = (b.get("titleShort") or {}).get("value")
        abbreviation = (b.get("abbreviation") or {}).get("value")
        date_app = (b.get("dateApplicability") or {}).get("value")

        # PDF/HTML-URLs aus dem CC-URI ableiten
        # cc_uri sieht so aus: https://fedlex.data.admin.ch/eli/cc/27/317_321_377
        pdf_url = None
        eli_uri = cc_uri
        if cc_uri:
            # ELI-konformer Pfad → fedlex.admin.ch hat PDF unter .../de.pdf
            html_url = cc_uri.replace("fedlex.data.admin.ch", "www.fedlex.admin.ch") + "/de"
            pdf_url = html_url + ".pdf"
        else:
            html_url = landing_url

        return {
            "sr_number": sr_number,
            "title": title,
            "short_title": title_short[:512] if title_short else None,
            "abbreviation": abbreviation[:64] if abbreviation else None,
            "html_url": html_url,
            "pdf_url": pdf_url,
            "eli_uri": eli_uri,
            "in_force_date": date_app,
            "fedlex_data": {"cc_uri": cc_uri, "binding": {k: v.get("value") for k, v in b.items()}},
        }
    except (httpx.HTTPError, ValueError) as exc:
        _log.info("[LawEnrich/Fedlex-SPARQL] SR %s → %s", sr_number, exc)
        return {"sr_number": sr_number, "html_url": landing_url, "fedlex_data": {"sparql_error": str(exc)[:200]}}


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
                if k == "sr_number":
                    continue  # primary key
                if v not in (None, ""):
                    if k in ("enacted_date", "in_force_date") and isinstance(v, str):
                        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", v)
                        if m:
                            from datetime import date
                            v = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                        else:
                            continue
                    setattr(existing, k, v)
            # Erfolgsstatus: wenn ein Title da ist → enriched. Sonst → partial (URL only).
            if existing.title:
                existing.enrichment_status = "enriched"
                existing.status = "in_force"
            else:
                existing.enrichment_status = "partial_url_only"
            existing.enrichment_error = None
        except Exception as exc:
            _log.warning("[LawEnrich/parse] SR %s: %s", sr, exc)
            existing.enrichment_status = "failed_other"
            existing.enrichment_error = str(exc)[:300]
    else:
        existing.enrichment_status = "failed_404"
        existing.enrichment_error = f"SR {sr} nicht via Fedlex auflösbar"
    existing.last_enriched_at = now
    return existing
