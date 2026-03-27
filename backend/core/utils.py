"""
Geteilte Hilfsfunktionen — werden projektübergreifend im Backend verwendet.
"""
import json
from typing import Any


def safe_json_loads(raw: str | bytes | None, default: Any = None) -> Any:
    """
    JSON parsen ohne Exception.
    Gibt `default` zurück wenn raw None/leer ist oder kein valides JSON enthält.
    """
    if not raw:
        return default if default is not None else {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError, TypeError):
        return default if default is not None else {}
