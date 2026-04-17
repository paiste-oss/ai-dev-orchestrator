"""
CalDAV-Service — Radicale per-User-Kalender.

Zuständig für:
  - Provisionieren eines CalDAV-Accounts (htpasswd-Eintrag + Collection anlegen)
  - Löschen eines CalDAV-Accounts
  - CalDAV-URL für einen User zurückgeben

Radicale läuft als Docker-Container (ai_radicale, Port 5232).
Das htpasswd-File liegt im geteilten Volume /radicale_data/users.
Kalender-Daten: /radicale_data/collections/{username}/kalender/
"""
from __future__ import annotations

import logging
import os
import secrets
import string
from pathlib import Path

from passlib.apache import HtpasswdFile

log = logging.getLogger("uvicorn.error")

_HTPASSWD_PATH = Path(os.getenv("RADICALE_DATA_PATH", "/radicale_data")) / "users"
_COLLECTIONS_PATH = Path(os.getenv("RADICALE_DATA_PATH", "/radicale_data")) / "collections"
_CALDAV_BASE_URL = "https://cal.baddi.ch"


def _ensure_htpasswd() -> HtpasswdFile:
    """Öffnet oder erstellt die htpasswd-Datei."""
    _HTPASSWD_PATH.parent.mkdir(parents=True, exist_ok=True)
    return HtpasswdFile(str(_HTPASSWD_PATH), new=not _HTPASSWD_PATH.exists())


def generate_caldav_password(length: int = 20) -> str:
    """Generiert ein sicheres zufälliges Passwort für den CalDAV-Account."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def provision_caldav_account(username: str, password: str) -> bool:
    """
    Legt einen CalDAV-Account in der Radicale htpasswd-Datei an.
    Gibt True zurück wenn neu angelegt, False wenn bereits vorhanden.
    Wirft Exception bei Fehler.
    """
    try:
        ht = _ensure_htpasswd()
        if ht.get_hash(username) is not None:
            log.info("[CalDAV] Account '%s' existiert bereits", username)
            return False
        ht.set_password(username, password)
        ht.save()
        log.info("[CalDAV] Account '%s' provisioniert", username)
        return True
    except Exception as exc:
        log.error("[CalDAV] Fehler beim Provisionieren von '%s': %s", username, exc)
        raise


def update_caldav_password(username: str, new_password: str) -> bool:
    """Aktualisiert das Passwort eines bestehenden CalDAV-Accounts."""
    try:
        ht = _ensure_htpasswd()
        ht.set_password(username, new_password)
        ht.save()
        return True
    except Exception as exc:
        log.error("[CalDAV] Fehler beim Passwort-Update für '%s': %s", username, exc)
        raise


def remove_caldav_account(username: str) -> bool:
    """Entfernt einen CalDAV-Account aus der htpasswd-Datei."""
    try:
        ht = _ensure_htpasswd()
        if ht.get_hash(username) is None:
            return False
        ht.delete(username)
        ht.save()
        log.info("[CalDAV] Account '%s' entfernt", username)
        return True
    except Exception as exc:
        log.error("[CalDAV] Fehler beim Entfernen von '%s': %s", username, exc)
        raise


def caldav_url_for(username: str) -> str:
    """Gibt die CalDAV-URL für einen User zurück (für Kalender-Client-Konfiguration)."""
    return f"{_CALDAV_BASE_URL}/{username}/"
