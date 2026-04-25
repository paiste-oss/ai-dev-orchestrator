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

    Fedlex serviert die Web-UI als SPA (HTML-Parsing nutzlos). Daten liegen in
    tausenden Named Graphs auf https://fedlex.data.admin.ch/sparqlendpoint.

    Datenmodell:
      - SR-Nummer ist eine `skos:notation` mit Datentyp `id-systematique`
        an einem `jolux:LegalTaxonomy`-Concept
      - Title in mehreren Sprachen direkt als `skos:prefLabel` am Concept
      - Das `jolux:Work` ist via `jolux:classifiedByTaxonomyEntry` verlinkt
    """
    # Stufe 1: Taxonomy → Title (zuverlässig, ein Graph)
    title_query = f"""PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?tax ?title WHERE {{
  GRAPH ?g {{
    ?tax skos:notation "{sr_number}"^^<https://fedlex.data.admin.ch/vocabulary/notation-type/id-systematique> ;
         skos:prefLabel ?title .
    FILTER(LANG(?title) = "de")
  }}
}}
LIMIT 1"""

    # Stufe 2: Taxonomy → Work (cross-graph, gefiltert auf 'cc/' = consolidated law)
    work_query = f"""PREFIX jolux: <http://data.legilux.public.lu/resource/ontology/jolux#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?work WHERE {{
  GRAPH ?g1 {{
    ?tax skos:notation "{sr_number}"^^<https://fedlex.data.admin.ch/vocabulary/notation-type/id-systematique> .
  }}
  GRAPH ?g2 {{
    ?work jolux:classifiedByTaxonomyEntry ?tax ;
          a <http://data.legilux.public.lu/resource/ontology/jolux#ConsolidationAbstract> .
    FILTER(STRSTARTS(STR(?work), "https://fedlex.data.admin.ch/eli/cc/"))
  }}
}}
LIMIT 1"""

    landing_url = f"https://www.fedlex.admin.ch/de/cc/{sr_number}"

    async def _run_sparql(q: str) -> list[dict[str, Any]]:
        try:
            r = await client.post(
                "https://fedlex.data.admin.ch/sparqlendpoint",
                data={"query": q},
                headers={
                    "User-Agent": _user_agent(),
                    "Accept": "application/sparql-results+json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=_HTTP_TIMEOUT,
            )
            if r.status_code != 200:
                return []
            return ((r.json().get("results") or {}).get("bindings") or [])
        except (httpx.HTTPError, ValueError) as exc:
            _log.info("[LawEnrich/SPARQL] SR %s → %s", sr_number, exc)
            return []

    title_bindings = await _run_sparql(title_query)
    if not title_bindings:
        return {"sr_number": sr_number, "html_url": landing_url, "fedlex_data": {"sparql_empty": True}}

    tax_uri = (title_bindings[0].get("tax") or {}).get("value")
    title = (title_bindings[0].get("title") or {}).get("value")

    work_bindings = await _run_sparql(work_query)
    work_uri = (work_bindings[0].get("work") or {}).get("value") if work_bindings else None

    # Abkürzung aus Title-Klammer ableiten — verbessertes Regex
    # Patterns die wir kennen:
    #   "Bundesgesetz ... (Strafgesetzbuch, StGB)"             → StGB
    #   "Bundesgesetz ... (Bundespersonalgesetz, BPG)"          → BPG
    #   "Bundesgesetz ... (Gleichstellungsgesetz, GlG)"         → GlG
    #   "Bundesverfassung ... vom 18. April 1999"               → keine Klammer, leer
    abbreviation = None
    if title:
        paren_match = re.search(r"\(([^()]{2,120})\)\s*$", title)
        if paren_match:
            inner = paren_match.group(1)
            # Wenn Komma drin: letzter Token könnte Abkürzung sein
            if "," in inner:
                parts = [p.strip() for p in inner.rsplit(",", 1)]
                if len(parts) == 2:
                    candidate = parts[1]
                    # Akzeptiere kompakte Abk. (z. B. StGB, OR, BV, BPG, ZGB)
                    if 2 <= len(candidate) <= 12 and re.match(r"^[A-Za-zÄÖÜäöü\.\-]{2,}$", candidate):
                        abbreviation = candidate

    # Web-URLs aus Work-URI ableiten
    pdf_url = None
    eli_uri = work_uri
    html_url = landing_url
    if work_uri and work_uri.startswith("https://fedlex.data.admin.ch/eli/"):
        web_base = work_uri.replace("fedlex.data.admin.ch", "www.fedlex.admin.ch") + "/de"
        html_url = web_base
        # Hinweis: Fedlex serviert unter .pdf-URL HTML (SPA), kein direktes PDF.
        # Wir setzen pdf_url trotzdem auf den ELI-konformen Pfad — moderne Fedlex-
        # Antworten könnten Content-Negotiation unterstützen; sonst landet User auf
        # der HTML-Seite und kann dort manuell PDF wählen.
        pdf_url = web_base + ".pdf"

    return {
        "sr_number": sr_number,
        "title": title,
        "abbreviation": abbreviation,
        "html_url": html_url,
        "pdf_url": pdf_url,
        "eli_uri": eli_uri,
        "fedlex_data": {"tax_uri": tax_uri, "work_uri": work_uri},
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
