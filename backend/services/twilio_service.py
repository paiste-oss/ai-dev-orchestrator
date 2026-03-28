"""
Twilio Service — SMS-basierte 2-Faktor-Authentifizierung

OTP-Ablauf:
1. generate_and_send_otp(phone, customer_id) → 6-stelligen Code via SMS senden + in Redis speichern (10 Min TTL)
2. verify_otp(customer_id, code) → prüfen ob Code stimmt → bei Erfolg aus Redis löschen
"""
import secrets
import string

from core.config import settings
from core.redis_client import redis_sync

OTP_TTL_SECONDS = 600  # 10 Minuten
OTP_PREFIX = "2fa_otp:"


def _otp_key(customer_id: str) -> str:
    return f"{OTP_PREFIX}{customer_id}"


def generate_and_send_otp(phone: str, customer_id: str) -> bool:
    """
    Generiert einen 6-stelligen OTP, speichert ihn in Redis und sendet ihn per SMS.
    Gibt True zurück wenn SMS erfolgreich versendet, sonst False.
    """
    code = "".join(secrets.choice(string.digits) for _ in range(6))

    # In Redis speichern
    r = redis_sync()
    r.setex(_otp_key(customer_id), OTP_TTL_SECONDS, code)

    # Via Twilio versenden
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        # Twilio nicht konfiguriert — im Dev-Modus: Code nur in Redis, keine SMS
        print(f"[2FA] Twilio nicht konfiguriert. OTP für {customer_id}: {code}")
        return True

    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=f"Dein Baddi-Sicherheitscode: {code} (gültig 10 Minuten)",
            from_=settings.twilio_from_number,
            to=phone,
        )
        return True
    except Exception as e:
        print(f"[2FA] SMS-Versand fehlgeschlagen an {phone}: {e}")
        return False


def verify_otp(customer_id: str, code: str) -> bool:
    """
    Prüft OTP. Bei Erfolg wird der Code aus Redis gelöscht (Einmalverwendung).
    """
    r = redis_sync()
    key = _otp_key(customer_id)
    stored = r.get(key)
    if not stored:
        return False  # Abgelaufen oder nicht vorhanden
    if secrets.compare_digest(stored.strip(), code.strip()):
        r.delete(key)
        return True
    return False
