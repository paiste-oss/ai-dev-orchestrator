"""
Zentrale HTTP-Exception Helpers — einheitliche Fehlermeldungen im ganzen Backend.

Verwendung:
    from core.exceptions import not_found, forbidden, bad_request

    raise not_found("Dokument")       # → 404: "Dokument nicht gefunden"
    raise forbidden()                  # → 403: "Zugriff verweigert"
    raise bad_request("Ungültige ID") # → 400: "Ungültige ID"
"""
from fastapi import HTTPException


def not_found(resource: str = "Ressource") -> HTTPException:
    return HTTPException(status_code=404, detail=f"{resource} nicht gefunden")


def forbidden(detail: str = "Zugriff verweigert") -> HTTPException:
    return HTTPException(status_code=403, detail=detail)


def bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def unauthorized(detail: str = "Ungültiger oder abgelaufener Token") -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


def storage_limit_exceeded(free_mb: float) -> HTTPException:
    return HTTPException(
        status_code=507,
        detail=f"Speicherlimit erreicht. Noch verfügbar: {free_mb:.1f} MB. Speicher unter Konto → Speicher erweitern.",
    )


def file_too_large(max_mb: int = 50) -> HTTPException:
    return HTTPException(status_code=413, detail=f"Datei zu gross. Maximum: {max_mb} MB")
