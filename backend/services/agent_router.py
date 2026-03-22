"""
Agent Router — Content Guard für alle Kunden-Eingaben.

Prüft eingehende Nachrichten auf verbotene Inhalte und lehnt diese sofort ab.
Die Tool-Auswahl übernimmt Claude selbst (native Tool Use).
"""
from __future__ import annotations
import logging
import re
from dataclasses import dataclass, field

_log = logging.getLogger(__name__)


@dataclass
class RoutingResult:
    intent: str
    needs_tools: bool
    tool_keys: list[str] = field(default_factory=list)
    blocked: bool = False
    block_reason: str | None = None


# ── Content Guard ──────────────────────────────────────────────────────────────

_CONTENT_GUARD_PATTERNS = re.compile(
    r"("
    r"kinderpornograph|child.*porn|csam|sexuelle.*bilder.*kind|kinder.*sexuell|"
    r"nackt.*kinder?foto|minderj[äa]hrige.*sexuell|"
    r"bombenanleitung|sprengstoff.*bauen|anschlag.*planen|terroranschlag|"
    r"how.*to.*make.*bomb|build.*explosive|"
    r"anleitung.*folter|menschen.*foltern.*wie|torture.*instructions|"
    r"massenerschie[sß]ung.*planen|"
    r"tiere.*qual.*anleitung|anleitung.*tiere.*t[öo]ten|animal.*torture.*how"
    r")",
    re.IGNORECASE,
)


def route(message: str, customer_id: str | None = None) -> RoutingResult:
    """
    Prüft die Nachricht auf verbotene Inhalte.
    Die Tool-Auswahl übernimmt Claude selbst.
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

    return RoutingResult(intent="conversation", needs_tools=False)
