"""
Marker-Prozessor für Chat-Antworten.

Erkennt und entfernt System-Marker aus dem Antwort-Text:
  - [UI: key=value]           → UI-Präferenz-Update
  - [AKTION: label | url]     → Aktions-Buttons
  - [FÄHIGKEIT_FEHLT: ...]    → Fehlende-Fähigkeit-Hinweis
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class MarkerResult:
    """Ergebnis der Marker-Verarbeitung."""
    text: str
    """Bereinigter Antwort-Text ohne Marker."""
    ui_update: dict | None = None
    """Erkanntes UI-Update, z.B. {"fontSize": "large"}."""
    action_buttons: list[dict] = field(default_factory=list)
    """Liste von Aktions-Buttons, z.B. [{"label": "Wallet", "url": "/user/wallet"}]."""
    capability_intent: str | None = None
    """Erkannter Intent einer fehlenden Fähigkeit."""


def process_markers(text: str) -> MarkerResult:
    """
    Verarbeitet alle System-Marker in einem Antwort-Text.

    Reihenfolge:
      1. AKTION-Marker extrahieren
      2. UI-Marker extrahieren
      3. FÄHIGKEIT_FEHLT-Marker extrahieren

    Args:
        text: Roher Antwort-Text vom LLM.

    Returns:
        MarkerResult mit bereinigtem Text und extrahierten Daten.
    """
    result = MarkerResult(text=text)

    result.text, result.action_buttons = _extract_action_buttons(result.text)
    result.text, result.ui_update = _extract_ui_marker(result.text)
    result.text, result.capability_intent = _extract_capability_marker(result.text)

    return result


def _extract_action_buttons(text: str) -> tuple[str, list[dict]]:
    """
    Extrahiert [AKTION: label | url]-Marker aus dem Text.

    Returns:
        (bereinigter Text, Liste von Button-Dicts)
    """
    buttons: list[dict] = []
    for m in re.finditer(r"\[AKTION:\s*(.+?)\s*\|\s*(.+?)\]", text):
        buttons.append({"label": m.group(1).strip(), "url": m.group(2).strip()})
    if buttons:
        text = re.sub(r"\s*\[AKTION:[^\]]+\]", "", text).strip()
    return text, buttons


def _extract_ui_marker(text: str) -> tuple[str, dict | None]:
    """
    Extrahiert den ersten [UI: key=value]-Marker aus dem Text.

    Returns:
        (bereinigter Text, UI-Update-Dict oder None)
    """
    ui_update: dict | None = None
    match = re.search(r"\[UI:\s*(\w+)=([^\]]+)\]", text)
    if match:
        ui_key = match.group(1).strip()
        ui_val = match.group(2).strip()[:30]
        text = re.sub(r"\s*\[UI:[^\]]+\]", "", text).strip()
        ui_update = {ui_key: ui_val}
    return text, ui_update


def _extract_capability_marker(text: str) -> tuple[str, str | None]:
    """
    Extrahiert den [FÄHIGKEIT_FEHLT: ...]-Marker aus dem Text.

    Hängt einen freundlichen Hinweis an, wenn der Marker erkannt wurde.

    Returns:
        (bereinigter Text mit optionalem Hinweis, erkannter Intent oder None)
    """
    capability_intent: str | None = None
    match = re.search(r"\[FÄHIGKEIT_FEHLT:\s*(.+?)\]", text, re.IGNORECASE)
    if match:
        capability_intent = match.group(1).strip()
        text = re.sub(r"\s*\[FÄHIGKEIT_FEHLT:[^\]]+\]", "", text).strip()
        text += (
            "\n\nIch habe deine Anfrage notiert und an unser Entwicklungsteam weitergegeben. "
            "Wir schauen uns das an und melden uns wenn diese Funktion verfügbar ist. 🛠️"
        )
    return text, capability_intent
