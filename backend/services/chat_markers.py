"""
Marker-Prozessor für Chat-Antworten.

Erkennt und entfernt System-Marker aus dem Antwort-Text:
  - [UI: key=value]                   → UI-Präferenz-Update
  - [AKTION: label | url]             → Aktions-Buttons
  - [FÄHIGKEIT_FEHLT: ...]            → Fehlende-Fähigkeit-Hinweis
  - [FENSTER: canvasType]             → Neues Canvas-Fenster öffnen
  - [FENSTER_SCHLIESSEN: canvasType]  → Canvas-Fenster schließen
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
    open_window: dict | None = None
    """Fenster öffnen, z.B. {"canvasType": "browser_window", "url": "..."}."""
    close_window: dict | None = None
    """Fenster schließen, z.B. {"canvasType": "browser_window"}."""


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
    result.text, result.open_window = _extract_window_marker(result.text)
    result.text, result.close_window = _extract_close_window_marker(result.text)

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
        ui_val = match.group(2).strip()  # kein Truncate — backgroundImage URLs sind lang
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


def _extract_close_window_marker(text: str) -> tuple[str, dict | None]:
    """
    Extrahiert den [FENSTER_SCHLIESSEN: canvasType]-Marker.

    Returns:
        (bereinigter Text, close_window-Dict oder None)
    """
    VALID_TYPES = {"browser_window", "whiteboard", "image_viewer", "netzwerk", "design", "memory", "documents"}
    close_window: dict | None = None
    match = re.search(r"\[FENSTER_SCHLIESSEN:\s*(\w+)\]", text, re.IGNORECASE)
    if match:
        canvas_type = match.group(1).strip().lower()
        if canvas_type in VALID_TYPES:
            close_window = {"canvasType": canvas_type}
        text = re.sub(r"\s*\[FENSTER_SCHLIESSEN:[^\]]+\]", "", text).strip()
    return text, close_window


def _extract_window_marker(text: str) -> tuple[str, dict | None]:
    """
    Extrahiert den [FENSTER: canvasType] oder [FENSTER: canvasType | url]-Marker.

    Gültige canvasTypes: browser_window, whiteboard, image_viewer, netzwerk

    Returns:
        (bereinigter Text, open_window-Dict oder None)
    """
    VALID_TYPES = {"browser_window", "whiteboard", "image_viewer", "netzwerk", "chart", "design", "memory", "documents"}
    open_window: dict | None = None
    # Format: [FENSTER: canvasType] oder [FENSTER: canvasType | extra]
    match = re.search(r"\[FENSTER:\s*(\w+)(?:\s*\|\s*([^\]]+))?\]", text, re.IGNORECASE)
    if match:
        canvas_type = match.group(1).strip().lower()
        extra = match.group(2).strip() if match.group(2) else None
        if canvas_type in VALID_TYPES:
            open_window = {"canvasType": canvas_type}
            if canvas_type == "chart" and extra:
                syms = [s.strip().upper() for s in extra.split(",") if s.strip()]
                if len(syms) == 1:
                    open_window["symbol"] = syms[0]
                else:
                    open_window["symbols"] = syms
            elif extra:
                open_window["url"] = extra
        text = re.sub(r"\s*\[FENSTER:[^\]]+\]", "", text).strip()
    return text, open_window
