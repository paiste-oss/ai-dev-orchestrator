"""Firebase Cloud Messaging — Push-Benachrichtigungen für iOS, Android und Web.

Initialisierung einmalig beim App-Start via `init_firebase()`.
Wenn `firebase_credentials_path` nicht gesetzt ist, bleibt FCM deaktiviert
und alle Sends werden still übersprungen (kein Crash).
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)

_firebase_ready = False


def init_firebase() -> None:
    """Einmalig beim App-Start aufrufen (in main.py lifespan)."""
    global _firebase_ready
    from core.config import settings

    if not settings.firebase_credentials_path:
        logger.warning("FCM deaktiviert — FIREBASE_CREDENTIALS_PATH nicht gesetzt.")
        return
    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            cred = credentials.Certificate(settings.firebase_credentials_path)
            firebase_admin.initialize_app(cred)
        _firebase_ready = True
        logger.info("Firebase Admin SDK initialisiert.")
    except Exception as exc:
        logger.error("Firebase-Initialisierung fehlgeschlagen: %s", exc)


async def send_push(
    token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """Sendet eine FCM Push-Notification an ein einzelnes Gerät.

    Args:
        token:  FCM-Registrierungstoken des Geräts.
        title:  Benachrichtigungstitel.
        body:   Benachrichtigungstext.
        data:   Optionale Key-Value-Payload (nur Strings — FCM-Einschränkung).

    Returns:
        True bei Erfolg, False bei Fehler (Token abgelaufen, Gerät abgemeldet etc.).
    """
    if not _firebase_ready:
        logger.debug("FCM nicht bereit — Push übersprungen (token=%s…)", token[:20])
        return False

    try:
        from firebase_admin import messaging

        # FCM data-Payload erfordert ausschliesslich String-Werte
        str_data: dict[str, str] | None = None
        if data:
            str_data = {k: str(v) for k, v in data.items()}

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=str_data,
            token=token,
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10"},
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default", badge=1)
                ),
            ),
        )
        response = messaging.send(message)
        logger.info("FCM Push gesendet: %s (token=%s…)", response, token[:20])
        return True

    except Exception as exc:
        # Ungültiger/abgelaufener Token → aus DB entfernen (Aufrufer-Verantwortung)
        logger.warning("FCM Push fehlgeschlagen (token=%s…): %s", token[:20], exc)
        return False


async def send_push_multicast(
    tokens: list[str],
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> tuple[int, int]:
    """Sendet an mehrere Geräte gleichzeitig (max. 500 Tokens pro Aufruf).

    Returns:
        (success_count, failure_count)
    """
    if not _firebase_ready or not tokens:
        return 0, len(tokens)

    try:
        from firebase_admin import messaging

        str_data: dict[str, str] | None = None
        if data:
            str_data = {k: str(v) for k, v in data.items()}

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data=str_data,
            tokens=tokens[:500],  # FCM-Limit
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10"},
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default", badge=1)
                ),
            ),
        )
        result = messaging.send_each_for_multicast(message)
        logger.info(
            "FCM Multicast: %d OK, %d Fehler (%d Tokens)",
            result.success_count,
            result.failure_count,
            len(tokens),
        )
        return result.success_count, result.failure_count

    except Exception as exc:
        logger.error("FCM Multicast fehlgeschlagen: %s", exc)
        return 0, len(tokens)
