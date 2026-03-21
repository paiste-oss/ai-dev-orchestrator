"""
Agent Router — Zentrale Schaltzentrale für alle Kunden-Eingaben.

PFLICHT: Jede Nachricht geht ZUERST durch diesen Router.

Stufe 1 — Regelbasiert (<1ms):
  Keyword-Matching für bekannte Intents → direkte Zuweisung

Stufe 2 — Dynamische Tools:
  Prüft ob via Entwicklung neue Tools deployed wurden (Redis)

Stufe 3 — Router-Gedächtnis:
  Schaut nach ob für diesen Intent bereits ein bewährter Endpunkt bekannt ist

Stufe 4 — Antwort-Bewertung (nach Uhrwerk-Verarbeitung):
  assess_response() erkennt ob das Uhrwerk die Anfrage wirklich erfüllen konnte
  → Positiv: Antwort geht an Baddi/Kunden
  → Negativ: Wird an Entwicklung weitergereicht
"""
from __future__ import annotations
import logging
import re
from dataclasses import dataclass, field

_log = logging.getLogger(__name__)

# ── Stage 0: Content Guard ─────────────────────────────────────────────────
# Lehnt Anfragen ab die eindeutig illegale oder schwer schädliche Inhalte
# betreffen. Bewusst eng gefasst — nur kristallklare Fälle.

_CONTENT_GUARD_PATTERNS = re.compile(
    r"("
    # CSAM — jede Form
    r"kinderpornograph|child.*porn|csam|sexuelle.*bilder.*kind|kinder.*sexuell|"
    r"nackt.*kinder?foto|minderj[äa]hrige.*sexuell|"
    # Terrorismus / Anschlagsplanung
    r"bombenanleitung|sprengstoff.*bauen|anschlag.*planen|terroranschlag|"
    r"how.*to.*make.*bomb|build.*explosive|"
    # Extremgewalt-Anleitungen
    r"anleitung.*folter|menschen.*foltern.*wie|torture.*instructions|"
    r"massenerschie[sß]ung.*planen|"
    # Tierquälerei-Anleitungen
    r"tiere.*qual.*anleitung|anleitung.*tiere.*t[öo]ten|animal.*torture.*how"
    r")",
    re.IGNORECASE,
)


def _content_guard(message: str, customer_id: str | None = None) -> "RoutingResult | None":
    """
    Stage 0 — Content Guard.
    Gibt ein geblockte RoutingResult zurück wenn verbotener Inhalt erkannt wird,
    sonst None.
    """
    if _CONTENT_GUARD_PATTERNS.search(message):
        _log.warning(
            "Content Guard ausgelöst | customer=%s | msg_preview=%.80r",
            customer_id or "unknown",
            message,
        )
        return RoutingResult(
            intent="blocked",
            needs_tools=False,
            blocked=True,
            block_reason="content_guard",
        )
    return None

# ── Intent-Definitionen ───────────────────────────────────────────────────────

@dataclass
class RoutingResult:
    intent: str                                    # z.B. "transport", "conversation"
    needs_tools: bool                              # True → Uhrwerk mit Tool Use
    tool_keys: list[str] = field(default_factory=list)  # z.B. ["sbb_transport"]
    confidence: float = 1.0                        # 0-1
    capability_gap: bool = False                   # True → bekannt nicht möglich
    learned_route: str | None = None               # aus Router-Gedächtnis
    dynamic_tools: list[str] = field(default_factory=list)  # aus Entwicklung deployed
    blocked: bool = False                          # True → Anfrage abgelehnt
    block_reason: str | None = None                # interne Kategorie (für Audit-Log)


# ── Keyword-Pattern ───────────────────────────────────────────────────────────

_TRANSPORT_KEYWORDS = re.compile(
    r"\b(zug|bahn|sbb|bus|tram|fahrplan|verbindung|abfahrt|ankunft|gleis|perron|"
    r"verspätung|s-bahn|intercity|ic\b|ir\b|öv|öffentlich|transit|"
    r"bahnhof|haltestelle|ticket|billett|reise.*von|von.*nach|wann fährt)\b",
    re.IGNORECASE,
)

_DOCUMENT_KEYWORDS = re.compile(
    r"\b(pdf|dokument|datei|anhang|upload|vertrag|rechnung|zusammenfass|analyse|"
    r"lese|lesen|inhalt.*datei|datei.*inhalt|ocr|text.*aus)\b",
    re.IGNORECASE,
)

_WEB_FETCH_KEYWORDS = re.compile(
    r"("
    r"https?://\S+|"                                        # https://... oder http://...
    r"\bwww\.\S+|"                                          # www.irgendwas
    r"\b\w{2,20}\.(ch|com|de|at|org|net|io|ai|app)\b|"    # domain.tld  z.B. nzz.ch, srf.ch
    r"\b(öffne|ruf.*auf|lies|lese|schau.*auf|"
    r"zeig|zeige|zeigen|zeig mir|zeig.*seite|"
    r"besuche|geh auf|fetch|abruf|seite.*lesen|lese.*seite|"
    r"inhalt.*webseite|webseite.*inhalt|was steht auf|"
    r"artikel.*lesen|lese.*artikel|ruf.*auf|öffne.*seite)\b"
    r")",
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

# ── Fehlschlag-Erkennung in Antworten ─────────────────────────────────────────
# Erkennt wenn das Uhrwerk / LLM signalisiert dass es eine Anfrage NICHT erfüllen kann.
# Bewusst konservativ — nur eindeutige "Ich-habe-kein-Werkzeug" Phrasen.

_FAILURE_PATTERNS = re.compile(
    r"("
    # Werkzeug fehlt
    r"kein zugriff auf|keinen zugriff auf|nicht zugreifen|"
    r"kein internet|keine internetverbindung|kein web-?zugriff|"
    r"keine e-?mail|kein smtp|keine mail-?funktion|"
    r"kein kalender|keinen kalender|keine termin-?funktion|"
    r"kein tool|kein werkzeug|keine fähigkeit dazu|"
    # Allgemeine Unfähigkeit
    r"außerhalb meiner fähigkeiten|diese fähigkeit.*nicht|fähigkeit.*fehlt|"
    r"nicht in der lage.*das|dazu nicht in der lage|"
    r"kann ich leider nicht (direkt |wirklich )?(ausführen|erledigen|tun|machen)|"
    r"das ist mir (leider )?nicht möglich|mir nicht möglich|"
    r"nicht implementiert|noch nicht implementiert|"
    # Englisch (falls Modell auf EN wechselt)
    r"i (don't|do not|cannot|can't) have access|"
    r"outside my (current )?capabilities|i'm unable to|"
    r"don't have the ability to|no (tool|access) for"
    r")",
    re.IGNORECASE,
)


def assess_response(response: str) -> bool:
    """
    Bewertet ob eine Uhrwerk/LLM-Antwort die Anfrage erfolgreich erfüllt hat.

    Returns:
        True  → Antwort ist positiv, an Baddi/Kunden weiterleiten
        False → Antwort zeigt Capability Gap, an Entwicklung weiterreichen
    """
    return not bool(_FAILURE_PATTERNS.search(response))


# ── Dynamische Tools aus der Entwicklung laden ───────────────────────────────

def _load_dynamic_tool_keys() -> list[str]:
    """
    Lädt alle via Entwicklung deployed Tools aus Redis.
    Diese wurden von Admin über /admin/entwicklung aktiviert.
    """
    try:
        import redis as redis_lib
        from core.config import settings
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        keys = r.hkeys("uhrwerk:dynamic_tools")
        return list(keys) if keys else []
    except Exception:
        return []


# ── Haupt-Router ─────────────────────────────────────────────────────────────

def route(message: str, customer_id: str | None = None) -> RoutingResult:
    """
    Pflicht-Einstiegspunkt für jede Kunden-Nachricht.

    Stufe 0: Content Guard (verbotene Inhalte sofort ablehnen)
    Stufe 1: Keyword-Matching (regelbasiert, lokal, <1ms)
    Stufe 2: Router-Gedächtnis (gelernte Routen aus Redis)
    Stufe 3: Dynamische Tools (via Entwicklung deployed)
    """
    from services.router_memory import get_best_route

    # ── Stufe 0: Content Guard ─────────────────────────────────────────────
    guard = _content_guard(message, customer_id)
    if guard:
        return guard

    msg = message.lower()

    # ── Stufe 1: Regelbasiertes Matching ──────────────────────────────────────

    base_result: RoutingResult | None = None

    if _TRANSPORT_KEYWORDS.search(msg):
        base_result = RoutingResult(
            intent="transport",
            needs_tools=True,
            tool_keys=["sbb_transport"],
        )

    elif _DOCUMENT_KEYWORDS.search(msg):
        base_result = RoutingResult(
            intent="document",
            needs_tools=False,
            tool_keys=[],
        )

    elif _WEB_FETCH_KEYWORDS.search(message):  # Original-Case für URL-Erkennung
        base_result = RoutingResult(
            intent="web_fetch",
            needs_tools=True,
            tool_keys=["web_fetch"],
        )

    elif _WEB_SEARCH_KEYWORDS.search(msg):
        base_result = RoutingResult(
            intent="web_search",
            needs_tools=False,
            tool_keys=[],
            capability_gap=True,
        )

    elif _EMAIL_KEYWORDS.search(msg):
        base_result = RoutingResult(
            intent="email",
            needs_tools=False,
            tool_keys=[],
            capability_gap=True,
        )

    elif _CALENDAR_KEYWORDS.search(msg):
        base_result = RoutingResult(
            intent="calendar",
            needs_tools=False,
            tool_keys=[],
            capability_gap=True,
        )

    else:
        base_result = RoutingResult(
            intent="conversation",
            needs_tools=False,
            tool_keys=[],
        )

    # ── Stufe 2: Router-Gedächtnis ────────────────────────────────────────────
    # Hat der Router für diesen Intent bereits eine bewährte Route gelernt?

    learned = get_best_route(base_result.intent)
    if learned:
        base_result.learned_route = learned
        if learned not in base_result.tool_keys:
            base_result.tool_keys.insert(0, learned)
        base_result.needs_tools = True
        # Wenn wir eine gelernte Route haben, ist kein Gap mehr vorhanden
        base_result.capability_gap = False

    # ── Stufe 3: Dynamische Tools ─────────────────────────────────────────────
    # Tools die via Entwicklung deployed wurden — immer zur Verfügung stellen

    dyn_keys = _load_dynamic_tool_keys()
    if dyn_keys:
        base_result.dynamic_tools = dyn_keys
        # Dynamische Tools ergänzen (nicht überschreiben)
        for dk in dyn_keys:
            if dk not in base_result.tool_keys:
                base_result.tool_keys.append(dk)
        if dyn_keys:
            base_result.needs_tools = True
            base_result.capability_gap = False  # Tool existiert jetzt

    return base_result


# ── Labels ────────────────────────────────────────────────────────────────────

def get_intent_label(intent: str) -> str:
    labels = {
        "transport":    "ÖV / SBB Abfrage",
        "document":     "Dokument-Analyse",
        "web_search":   "Web-Recherche",
        "email":        "E-Mail",
        "calendar":     "Kalender / Termine",
        "conversation": "Gespräch",
    }
    return labels.get(intent, intent)
