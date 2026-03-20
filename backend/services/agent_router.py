"""
Agent Router — Analysiert eine Kunden-Nachricht und entscheidet,
welche Tools/Agenten das Uhrwerk aktivieren soll.

Stufe 1 (regelbasiert, <1ms): Keyword-Matching für bekannte Intents
Stufe 2 (LLM, ~200ms): Nur bei unklaren Anfragen — gibt intent + tools zurück

Das Ergebnis bestimmt ob:
  - Nur llm_gateway (schnell, kein Tool Use) reicht
  - buddy_agent (Uhrwerk mit Tool Use) nötig ist
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field

# ── Intent-Definitionen ───────────────────────────────────────────────────────

@dataclass
class RoutingResult:
    intent: str                      # z.B. "transport", "conversation", "document"
    needs_tools: bool                # True → Uhrwerk aktivieren
    tool_keys: list[str] = field(default_factory=list)   # z.B. ["sbb_transport"]
    confidence: float = 1.0          # 0-1, bei regelbasiert immer 1.0


# ── Regelbasierte Keyword-Maps ────────────────────────────────────────────────

_TRANSPORT_KEYWORDS = re.compile(
    r"\b(zug|bahn|sbb|bus|tram|fahrplan|verbindung|abfahrt|ankunft|gleis|perron|"
    r"verspätung|verspätung|s-bahn|intercity|ic\b|ir\b|öv|öffentlich|transit|"
    r"bahnhof|haltestelle|ticket|billett|reise.*von|von.*nach|wann fährt)\b",
    re.IGNORECASE,
)

_DOCUMENT_KEYWORDS = re.compile(
    r"\b(pdf|dokument|datei|anhang|upload|vertrag|rechnung|zusammenfass|analyse|"
    r"lese|lesen|inhalt.*datei|datei.*inhalt|ocr|text.*aus)\b",
    re.IGNORECASE,
)

_WEB_SEARCH_KEYWORDS = re.compile(
    r"\b(suche|such|google|internet|online|aktuelle|news|nachrichten|wetter|"
    r"preis|aktienkurs|was.*koste|wie.*teuer|heute.*stand|recherchier)\b",
    re.IGNORECASE,
)

_EMAIL_KEYWORDS = re.compile(
    r"\b(email|e-mail|mail.*send|schick.*mail|nachricht.*send|sende.*an|"
    r"kontaktier|schreib.*an)\b",
    re.IGNORECASE,
)

_CALENDAR_KEYWORDS = re.compile(
    r"\b(termin|kalender|meeting|appointment|schedule|eintrag|reminder|"
    r"erinnerung|buche|reservier|trage.*ein)\b",
    re.IGNORECASE,
)

# ── Router ────────────────────────────────────────────────────────────────────

def route(message: str) -> RoutingResult:
    """
    Schneller regelbasierter Router.
    Gibt zurück welche Tools für diese Nachricht aktiviert werden sollen.
    """
    msg = message.lower()

    # Transport / SBB
    if _TRANSPORT_KEYWORDS.search(msg):
        return RoutingResult(
            intent="transport",
            needs_tools=True,
            tool_keys=["sbb_transport"],
        )

    # Dokument-Analyse
    if _DOCUMENT_KEYWORDS.search(msg):
        return RoutingResult(
            intent="document",
            needs_tools=False,   # Tool Use kommt wenn Upload-Feature fertig
            tool_keys=[],
        )

    # Web-Suche
    if _WEB_SEARCH_KEYWORDS.search(msg):
        return RoutingResult(
            intent="web_search",
            needs_tools=False,   # Web-Search-Tool noch nicht in tool_registry
            tool_keys=[],
        )

    # E-Mail
    if _EMAIL_KEYWORDS.search(msg):
        return RoutingResult(
            intent="email",
            needs_tools=False,   # Aktiviert wenn Kunde SMTP-Credentials hinterlegt hat
            tool_keys=[],
        )

    # Kalender
    if _CALENDAR_KEYWORDS.search(msg):
        return RoutingResult(
            intent="calendar",
            needs_tools=False,
            tool_keys=[],
        )

    # Standard: normales Gespräch
    return RoutingResult(
        intent="conversation",
        needs_tools=False,
        tool_keys=[],
    )


def get_intent_label(intent: str) -> str:
    """Lesbare Bezeichnung für Logs / Memory."""
    labels = {
        "transport":    "ÖV / SBB Abfrage",
        "document":     "Dokument-Analyse",
        "web_search":   "Web-Recherche",
        "email":        "E-Mail",
        "calendar":     "Kalender / Termine",
        "conversation": "Gespräch",
    }
    return labels.get(intent, intent)
