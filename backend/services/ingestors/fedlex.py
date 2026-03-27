"""
Fedlex.admin.ch Ingestor — Schweizer Bundesrecht

Crawlt das Schweizerische Bundesrecht aus fedlex.admin.ch.
Phase 1: Curated list der wichtigsten Gesetze
Phase 2: SPARQL-basierte Vollindexierung
"""
import logging
import re
import time

import httpx

from services.knowledge_ingestor import BaseIngestor, RawDocument

_log = logging.getLogger(__name__)

# Basis-URL für Gesetzes-HTML-Seiten
_BASE_HTML = "https://www.fedlex.admin.ch/eli/cc/{path}/de/html"
_FEDLEX_API = "https://fedlex.admin.ch/api/de/search"

# Wichtigste Schweizer Bundesgesetze (ELI-Pfad → Titel)
CORE_LAWS = [
    ("27/317_321_377", "Obligationenrecht (OR)"),
    ("24/233_245_233", "Zivilgesetzbuch (ZGB)"),
    ("2010/631", "Strafgesetzbuch (StGB)"),
    ("2009/615", "Mehrwertsteuergesetz (MWSTG)"),
    ("1966/57_57_57", "Arbeitsgesetz (ArG)"),
    ("2003/438", "Bundesgesetz über die Ausländerinnen und Ausländer (AIG)"),
    ("2004/669", "Datenschutzgesetz (DSG)"),
    ("2007/569", "Bundesgesetz über die Krankenversicherung (KVG)"),
    ("1995/3782_3790_3791", "Bundesgesetz über die Alters- und Hinterlassenenversicherung (AHVG)"),
    ("1982/923", "Bundesgesetz über die Invalidenversicherung (IVG)"),
    ("2007/191", "Bundesgesetz über die Unfallversicherung (UVG)"),
    ("94/321_325_327", "Bundesgesetz über Schuldbetreibung und Konkurs (SchKG)"),
    ("57/737_741_755", "Steuerharmonisierungsgesetz (StHG)"),
    ("92/595_601_605", "Bundesgesetz über die direkte Bundessteuer (DBG)"),
    ("2003/210", "Bundesgesetz über die Freizügigkeit der Personenversicherung (FZG)"),
    ("2002/3917", "Bundesgesetz über den Schutz von Kulturmitteln im Falle eines bewaffneten Konflikts"),
    ("2011/379", "Raumplanungsgesetz (RPG)"),
    ("1966/1517_1519_1519", "Bundesgesetz über das öffentliche Beschaffungswesen (BöB)"),
    ("94/965_969_971", "Bundesgesetz über die Börsen und den Effektenhandel (BEHG)"),
    ("2003/707", "Bundesgesetz über Fusionen, Spaltungen, Umwandlungen und Vermögensübertragungen (FusG)"),
    ("52/467_469_471", "Bundesgesetz über das Urheberrecht und verwandte Schutzrechte (URG)"),
    ("62/1010_1040_1046", "Markenrecht (MSchG)"),
    ("92/1093_1095_1097", "Patentgesetz (PatG)"),
    ("2009/337", "Bundesgesetz über das Internationale Privatrecht (IPRG)"),
    ("1997/1052_1056_1064", "Bundesgesetz über die Bundesrechtspflege (BGG)"),
    ("2005/707", "Bundesverfassung der Schweizerischen Eidgenossenschaft (BV)"),
    ("99/3851_3873_3875", "Bundesgesetz über die Banken und Sparkassen (BankG)"),
    ("2015/1507", "Bundesgesetz über die Finanzmarktinfrastrukturen (FinfraG)"),
    ("2015/9569", "Bundesgesetz über die Finanzdienstleistungen (FIDLEG)"),
    ("2003/723", "Bundesgesetz über das Kartellrecht (KG)"),
]


class FedlexIngestor(BaseIngestor):
    source_type = "law"
    domain = "recht_ch"

    def __init__(self, use_api: bool = True):
        self.use_api = use_api

    def discover(self, limit: int = 200) -> list[dict]:
        """
        Phase 1: Curated list.
        Phase 2 (wenn use_api=True): Fedlex REST API für weitere Gesetze.
        """
        results = []
        for path, title in CORE_LAWS[:limit]:
            results.append({
                "title": title,
                "url": f"https://www.fedlex.admin.ch/eli/cc/{path}/de",
                "html_url": _BASE_HTML.format(path=path),
                "eli_path": path,
            })

        if self.use_api and len(results) < limit:
            try:
                api_results = self._discover_via_api(limit - len(results))
                # Deduplizieren
                known_paths = {r["eli_path"] for r in results}
                for r in api_results:
                    if r.get("eli_path") not in known_paths:
                        results.append(r)
                        known_paths.add(r["eli_path"])
            except Exception as exc:
                _log.warning("Fedlex API discovery failed: %s", exc)

        return results[:limit]

    def _discover_via_api(self, limit: int = 100) -> list[dict]:
        """Nutzt die Fedlex REST-API für weitere Gesetze."""
        results = []
        try:
            resp = httpx.get(
                _FEDLEX_API,
                params={"q": "", "rows": min(limit, 200), "start": 0, "lang": "de", "types": "LEGAL_TEXTS"},
                timeout=30.0,
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            for item in data.get("data", []):
                attrs = item.get("attributes", {})
                eli = attrs.get("eli", "")
                title_obj = attrs.get("title", {})
                title = title_obj.get("de", "") if isinstance(title_obj, dict) else str(title_obj)
                if eli and title:
                    path = eli.replace("https://fedlex.data.admin.ch/eli/cc/", "").strip("/")
                    results.append({
                        "title": title,
                        "url": f"https://www.fedlex.admin.ch/eli/cc/{path}/de",
                        "html_url": _BASE_HTML.format(path=path),
                        "eli_path": path,
                    })
        except Exception as exc:
            _log.warning("Fedlex API error: %s", exc)
        return results

    def fetch_document(self, meta: dict) -> RawDocument | None:
        """Holt Gesetzestext als HTML und extrahiert den reinen Text."""
        html_url = meta.get("html_url") or meta.get("url", "")
        if not html_url.endswith("/html"):
            html_url = html_url.rstrip("/") + "/html"

        try:
            time.sleep(0.3)  # Rate limiting
            resp = httpx.get(
                html_url,
                timeout=30.0,
                follow_redirects=True,
                headers={"Accept-Language": "de-CH,de;q=0.9"},
            )
            if resp.status_code != 200:
                _log.debug("Fedlex HTTP %d for %s", resp.status_code, html_url)
                return None

            text = _parse_fedlex_html(resp.text)
            if not text or len(text) < 100:
                return None

            return RawDocument(
                title=meta["title"],
                url=meta.get("url", html_url),
                text=text,
                language="de",
                published_at="",
                metadata={"eli_path": meta.get("eli_path", ""), "source": "fedlex.admin.ch"},
            )
        except Exception as exc:
            _log.warning("Fedlex fetch failed for %s: %s", html_url, exc)
            return None


def _parse_fedlex_html(html: str) -> str:
    """
    Extrahiert reinen Gesetzestext aus Fedlex-HTML.
    Entfernt Navigation, Header, Footer — behält nur Artikeltext.
    """
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        # Fedlex-spezifische Selektoren
        # Gesetze sind in <div class="law-text"> oder <div id="lawtext"> etc.
        # Fallback: <main> oder <article>
        content = (
            soup.find("div", class_=re.compile(r"law-text|law-body|act-text", re.I))
            or soup.find("article")
            or soup.find("main")
            or soup.find("body")
        )

        if not content:
            return ""

        # Navigations-Elemente entfernen
        for tag in content.find_all(["nav", "header", "footer", "script", "style", "button"]):
            tag.decompose()

        # Text extrahieren und bereinigen
        lines = []
        for elem in content.find_all(["h1", "h2", "h3", "h4", "p", "li", "td", "th"]):
            text = elem.get_text(separator=" ").strip()
            if text and len(text) > 2:
                lines.append(text)

        text = "\n".join(lines)

        # Mehrfache Leerzeichen/Zeilen bereinigen
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" {2,}", " ", text)

        return text.strip()
    except ImportError:
        # Fallback ohne BeautifulSoup: simpel per Regex
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.I)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r" {2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
