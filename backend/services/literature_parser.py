"""
Literatur-Parser für RIS und EndNote XML.

RIS (.ris):    De-facto-Standard, Export aus EndNote/Zotero/Mendeley/PubMed
EndNote XML (.xml): Nativer Export aus EndNote
"""
from __future__ import annotations
import logging
import re
from xml.etree import ElementTree as ET

_log = logging.getLogger(__name__)

# RIS type → Baddi entry_type
_RIS_TYPE_MAP: dict[str, str] = {
    "JOUR": "paper", "JFULL": "paper", "ABST": "paper",
    "CONF": "paper", "CHAP": "paper", "RPRT": "paper",
    "THES": "paper", "UNPB": "paper", "ELEC": "paper",
    "BOOK": "book",  "EDITED": "book", "CASE": "book",
    "MGZN": "paper", "NEWS": "paper", "PAMP": "paper",
}


def parse_ris(content: bytes) -> list[dict]:
    """
    Parst eine .ris-Datei und gibt eine Liste von Entry-Dicts zurück.
    Tolerant gegenüber verschiedenen Zeilenenden und Encodings.
    """
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        return []

    entries: list[dict] = []
    current: dict[str, list[str]] = {}

    for line in text.splitlines():
        line = line.rstrip()
        if not line:
            continue

        # Format: "TY  - value" oder "TY- value"
        m = re.match(r'^([A-Z][A-Z0-9]{1,2})\s*-\s*(.*)', line)
        if not m:
            continue

        tag, value = m.group(1).strip(), m.group(2).strip()

        if tag == "ER":
            if current:
                entry = _ris_to_entry(current)
                if entry:
                    entries.append(entry)
            current = {}
            continue

        current.setdefault(tag, []).append(value)

    # Letzter Eintrag ohne ER
    if current:
        entry = _ris_to_entry(current)
        if entry:
            entries.append(entry)

    _log.info("RIS-Parser: %d Einträge", len(entries))
    return entries


def _ris_to_entry(fields: dict[str, list[str]]) -> dict | None:
    def first(tag: str) -> str | None:
        vals = fields.get(tag)
        return vals[0].strip() if vals else None

    title = first("TI") or first("T1") or first("CT")
    if not title:
        return None

    ris_type = first("TY") or "JOUR"
    entry_type = _RIS_TYPE_MAP.get(ris_type, "paper")

    authors_raw = fields.get("AU") or fields.get("A1") or []
    authors = [a.strip() for a in authors_raw if a.strip()]

    year_str = first("PY") or first("Y1") or ""
    year: int | None = None
    if year_str:
        m = re.search(r'\d{4}', year_str)
        if m:
            year = int(m.group())

    doi = first("DO") or first("M3")
    if doi and not doi.startswith("http") and re.match(r'^10\.\d{4}/', doi):
        doi = doi  # keep as-is
    elif doi and doi.startswith("http"):
        doi = doi

    return {
        "entry_type": entry_type,
        "title": title,
        "authors": authors or None,
        "year": year,
        "abstract": first("AB") or first("N2"),
        "journal": first("JO") or first("JF") or first("T2"),
        "volume": first("VL"),
        "issue": first("IS"),
        "pages": first("SP") and first("EP") and f"{first('SP')}–{first('EP')}" or first("SP") or first("EP"),
        "doi": doi,
        "url": first("UR") or first("L2"),
        "publisher": first("PB"),
        "isbn": first("SN") if entry_type == "book" else None,
        "edition": first("ET"),
        "tags": [k.strip() for k in (fields.get("KW") or []) if k.strip()] or None,
        "import_source": "ris",
    }


def parse_endnote_xml(content: bytes) -> list[dict]:
    """
    Parst eine EndNote XML-Datei (.xml).
    Unterstützt das Standard-EndNote XML-Format mit <records><record> Struktur.
    """
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        _log.error("EndNote XML Parse-Fehler: %s", e)
        return []

    # Namespace-agnostisch: suche alle <record>-Elemente
    records = root.findall(".//record")
    if not records:
        # Versuche alternativ ohne Wrapper
        records = [root] if root.tag == "record" else []

    entries: list[dict] = []
    for rec in records:
        entry = _endnote_rec_to_entry(rec)
        if entry:
            entries.append(entry)

    _log.info("EndNote XML-Parser: %d Einträge", len(entries))
    return entries


def _endnote_rec_to_entry(rec: ET.Element) -> dict | None:
    def text(path: str) -> str | None:
        el = rec.find(path)
        if el is None:
            return None
        # EndNote XML: Wert steht in <style> child oder direkt als Text
        style = el.find(".//style")
        val = (style.text if style is not None else el.text) or ""
        return val.strip() or None

    def texts(path: str) -> list[str]:
        results = []
        for el in rec.findall(path):
            style = el.find(".//style")
            val = (style.text if style is not None else el.text) or ""
            if val.strip():
                results.append(val.strip())
        return results

    title = text(".//titles/title") or text(".//title")
    if not title:
        return None

    # Typ
    ref_type_el = rec.find(".//ref-type")
    ref_type_name = (ref_type_el.get("name") or "").lower() if ref_type_el is not None else ""
    entry_type = "book" if "book" in ref_type_name else "paper"

    # Autoren
    authors = texts(".//contributors/authors/author")

    # Jahr
    year_str = text(".//dates/year") or ""
    year: int | None = None
    if year_str:
        m = re.search(r'\d{4}', year_str)
        if m:
            year = int(m.group())

    doi_raw = text(".//electronic-resource-num") or ""
    doi = doi_raw if doi_raw else None

    keywords = texts(".//keywords/keyword")

    return {
        "entry_type": entry_type,
        "title": title,
        "authors": authors or None,
        "year": year,
        "abstract": text(".//abstract"),
        "journal": text(".//periodical/full-title") or text(".//secondary-title"),
        "volume": text(".//volume"),
        "issue": text(".//number"),
        "pages": text(".//pages"),
        "doi": doi,
        "url": text(".//urls/related-urls/url") or text(".//url"),
        "publisher": text(".//publisher"),
        "isbn": text(".//isbn"),
        "edition": text(".//edition"),
        "tags": keywords or None,
        "import_source": "endnote_xml",
    }
