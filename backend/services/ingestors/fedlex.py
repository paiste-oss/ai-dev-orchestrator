"""
Fedlex.admin.ch Ingestor — Schweizer Bundesrecht

Verwendet die offiziellen SR-Nummern und auflöst den korrekten ELI-Pfad
über das Fedlex SPARQL-Endpunkt (historicalLegalId).
Der Gesetzestext wird als HTML aus dem Fedlex-Filestore geladen.
"""
import logging
import re
import time

import httpx

from services.knowledge_ingestor import BaseIngestor, RawDocument

_log = logging.getLogger(__name__)

_FILESTORE = "https://fedlex.data.admin.ch"
_SPARQL    = "https://fedlex.data.admin.ch/sparqlendpoint"

# SR-Nummer → ELI-Pfad (via SPARQL historicalLegalId, Stand 2025)
# Quelle: fedlex.data.admin.ch / Systematische Rechtssammlung
SR_TO_ELI: dict[str, str] = {
    "101":       "1999/404",
    "210":       "24/233_245_233",
    "220":       "27/317_321_377",
    "272":       "2010/262",
    "281.1":     "11/529_488_529",
    "291":       "1988/1776_1776_1776",
    "173.110":   "2006/218",
    "221.301":   "2004/320",
    "311.0":     "54/757_781_799",
    "312.0":     "2010/267",
    "172.021":   "1969/737_757_755",
    "172.056.1": "2020/126",
    "700":       "1979/1573_1573_1573",
    "822.11":    "1966/57_57_57",
    "837.0":     "1982/2184_2184_2184",
    "412.10":    "2003/674",
    "830.1":     "2002/510",
    "831.10":    "63/837_843_843",
    "831.20":    "1959/827_857_845",
    "831.201":   "1961/29_29_29",
    "831.301":   "2007/804",
    "832.20":    "1982/1676_1676_1676",
    "832.10":    "1995/1328_1328_1328",
    "831.42":    "1994/2386_2386_2386",
    "831.40":    "1983/797_797_797",
    "642.11":    "1991/1184_1184_1184",
    "642.14":    "1991/1256_1256_1256",
    "641.20":    "2009/615",
    "642.21":    "1966/371_385_384",
    "641.10":    "1974/11_11_11",
    "142.20":    "2007/758",
    "142.31":    "1999/358",
    "235.1":     "1993/1945_1945_1945",
    "784.10":    "1997/2187_2187_2187",
    "954.1":     "2018/801",
    "950.1":     "2019/758",
    "952.0":     "51/117_121_129",
    "251":       "1996/546_546_546",
    "221.229.1": "24/719_735_717",
    "961.01":    "2005/734",
    "231.1":     "1993/1798_1798_1798",
    "232.11":    "1993/274_274_274",
    "232.14":    "1955/871_893_899",
    "232.12":    "2002/226",
    "812.21":    "2001/422",
    "817.0":     "2017/62",
    "814.01":    "1984/1122_1122_1122",
    "730.0":     "2017/762",
}

# SR-Nummer → Titel
CORE_LAW_SR: list[tuple[str, str]] = [
    ("101",      "Bundesverfassung der Schweizerischen Eidgenossenschaft (BV)"),
    ("210",      "Zivilgesetzbuch (ZGB)"),
    ("220",      "Obligationenrecht (OR)"),
    ("272",      "Zivilprozessordnung (ZPO)"),
    ("281.1",    "Bundesgesetz über Schuldbetreibung und Konkurs (SchKG)"),
    ("291",      "Bundesgesetz über das Internationale Privatrecht (IPRG)"),
    ("173.110",  "Bundesgesetz über das Bundesgericht (BGG)"),
    ("221.301",  "Fusionsgesetz (FusG)"),
    ("311.0",    "Strafgesetzbuch (StGB)"),
    ("312.0",    "Strafprozessordnung (StPO)"),
    ("172.021",  "Bundesgesetz über das Verwaltungsverfahren (VwVG)"),
    ("172.056.1","Bundesgesetz über das öffentliche Beschaffungswesen (BöB)"),
    ("700",      "Raumplanungsgesetz (RPG)"),
    ("822.11",   "Arbeitsgesetz (ArG)"),
    ("837.0",    "Bundesgesetz über die Arbeitslosenversicherung (AVIG)"),
    ("412.10",   "Berufsbildungsgesetz (BBG)"),
    ("830.1",    "Allgemeiner Teil des Sozialversicherungsrechts (ATSG)"),
    ("831.10",   "Bundesgesetz über die AHV (AHVG)"),
    ("831.20",   "Bundesgesetz über die Invalidenversicherung (IVG)"),
    ("831.201",  "Verordnung über die Invalidenversicherung (IVV)"),
    ("831.301",  "Bundesgesetz über Ergänzungsleistungen zur AHV und IV (ELG)"),
    ("832.20",   "Bundesgesetz über die Unfallversicherung (UVG)"),
    ("832.10",   "Bundesgesetz über die Krankenversicherung (KVG)"),
    ("831.42",   "Freizügigkeitsgesetz (FZG)"),
    ("831.40",   "Bundesgesetz über die berufliche Vorsorge (BVG)"),
    ("642.11",   "Bundesgesetz über die direkte Bundessteuer (DBG)"),
    ("642.14",   "Steuerharmonisierungsgesetz (StHG)"),
    ("641.20",   "Mehrwertsteuergesetz (MWSTG)"),
    ("642.21",   "Bundesgesetz über die Verrechnungssteuer (VStG)"),
    ("641.10",   "Bundesgesetz über die Stempelabgaben (StG)"),
    ("142.20",   "Ausländer- und Integrationsgesetz (AIG)"),
    ("142.31",   "Asylgesetz (AsylG)"),
    ("235.1",    "Bundesgesetz über den Datenschutz (DSG)"),
    ("784.10",   "Fernmeldegesetz (FMG)"),
    ("954.1",    "Finanzmarktinfrastrukturgesetz (FinfraG)"),
    ("950.1",    "Finanzdienstleistungsgesetz (FIDLEG)"),
    ("952.0",    "Bundesgesetz über die Banken und Sparkassen (BankG)"),
    ("251",      "Kartellgesetz (KG)"),
    ("221.229.1","Versicherungsvertragsgesetz (VVG)"),
    ("961.01",   "Versicherungsaufsichtsgesetz (VAG)"),
    ("231.1",    "Urheberrechtsgesetz (URG)"),
    ("232.11",   "Markenschutzgesetz (MSchG)"),
    ("232.14",   "Patentgesetz (PatG)"),
    ("232.12",   "Designgesetz (DesG)"),
    ("812.21",   "Heilmittelgesetz (HMG)"),
    ("817.0",    "Lebensmittelgesetz (LMG)"),
    ("814.01",   "Umweltschutzgesetz (USG)"),
    ("730.0",    "Energiegesetz (EnG)"),
]


class FedlexIngestor(BaseIngestor):
    source_type = "fedlex"
    domain = "recht"

    def discover(self, limit: int = 200) -> list[dict]:
        results = []
        for sr, title in CORE_LAW_SR[:limit]:
            eli = SR_TO_ELI.get(sr)
            if not eli:
                _log.warning("Kein ELI-Pfad für SR %s", sr)
                continue
            results.append({
                "title": title,
                "sr_number": sr,
                "eli_path": eli,
                "url": f"https://www.fedlex.admin.ch/eli/cc/{eli}/de",
            })
        return results

    def fetch_document(self, meta: dict) -> RawDocument | None:
        eli = meta["eli_path"]
        html_url = _resolve_html_url(eli)
        if not html_url:
            _log.warning("Kein HTML-URL für ELI %s", eli)
            return None
        try:
            time.sleep(0.3)
            resp = httpx.get(html_url, timeout=60.0, follow_redirects=True,
                             headers={"Accept-Language": "de-CH,de;q=0.9"})
            if resp.status_code != 200:
                _log.debug("Fedlex HTTP %d für %s", resp.status_code, html_url)
                return None
            text = _parse_fedlex_html(resp.text)
            if not text or len(text) < 200:
                return None
            return RawDocument(
                title=meta["title"],
                url=meta["url"],
                text=text,
                language="de",
                published_at="",
                metadata={"sr_number": meta.get("sr_number", ""), "source": "fedlex.admin.ch"},
            )
        except Exception as exc:
            _log.warning("Fedlex fetch fehlgeschlagen für SR %s: %s", meta.get("sr_number"), exc)
            return None


def _resolve_html_url(eli_path: str) -> str | None:
    """
    Findet die aktuellste HTML-Filestore-URL für einen ELI-Pfad.
    Probiert die letzten Jahre bis eine Expression existiert.
    """
    for year in ["2025", "2024", "2023", "2022"]:
        date = f"{year}0101"
        turtle_url = f"{_FILESTORE}/eli/cc/{eli_path}/{date}/de/html"
        try:
            r = httpx.get(turtle_url, headers={"Accept": "text/turtle"},
                          follow_redirects=True, timeout=15)
            if r.status_code == 200:
                urls = re.findall(r"<(https://fedlex\.data\.admin\.ch/filestore[^>]+\.html)>", r.text)
                # Hauptdatei ohne Nummernsuffix bevorzugen
                main = [u for u in urls if not re.search(r"-html-\d+\.html$", u)]
                if main:
                    return main[0]
                if urls:
                    return urls[0]
        except Exception:
            pass
    return None


def _parse_fedlex_html(html: str) -> str:
    """Extrahiert reinen Gesetzestext aus Fedlex-Filestore-HTML."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")

        content = (
            soup.find("div", id="lawcontent")
            or soup.find("div", class_=re.compile(r"law-text|law-body|act-text", re.I))
            or soup.find("article")
            or soup.find("main")
            or soup.find("body")
        )
        if not content:
            return ""

        for tag in content.find_all(["nav", "header", "footer", "script", "style", "button"]):
            tag.decompose()

        lines = []
        for elem in content.find_all(["h1", "h2", "h3", "h4", "p", "li", "td", "th"]):
            text = elem.get_text(separator=" ").strip()
            if text and len(text) > 2:
                lines.append(text)

        text = "\n".join(lines)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" {2,}", " ", text)
        return text.strip()

    except ImportError:
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.I)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r" {2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
