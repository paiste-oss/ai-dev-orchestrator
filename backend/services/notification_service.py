"""
Zentraler Benachrichtigungs-Service — einzige Schnittstelle für alle Kunden-Notifications.

Dispatch-Logik basiert auf customer.notification_channel:
  'sms'       → Twilio SMS
  'email'     → System-SMTP
  'whatsapp'  → (zukünftig) Twilio WhatsApp
  'push'      → (zukünftig) Web Push

Verwendung:
    from services.notification_service import notify_customer
    await notify_customer(customer, message="Dein Alert wurde ausgelöst", subject="Kurs-Alert")
"""
import smtplib
from email.message import EmailMessage

from core.config import settings


async def notify_customer(
    customer,        # models.customer.Customer
    message: str,
    subject: str = "Benachrichtigung von Baddi",
) -> bool:
    """
    Sendet eine Benachrichtigung an den Kunden über seinen bevorzugten Kanal.
    Gibt True zurück bei Erfolg, False bei Fehler.
    """
    channel = getattr(customer, "notification_channel", "sms") or "sms"

    if channel == "sms":
        return _send_sms(customer, message)
    elif channel == "email":
        return await _send_email(customer, message, subject)
    else:
        # Unbekannter Kanal → Fallback Email
        return await _send_email(customer, message, subject)


# ── SMS via Twilio ─────────────────────────────────────────────────────────────

def _send_sms(customer, message: str) -> bool:
    phone = getattr(customer, "phone", None)
    if not phone:
        print(f"[Notify] SMS fehlgeschlagen: Kunde {customer.id} hat keine Mobilnummer")
        return False
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        print(f"[Notify] SMS (Twilio nicht konfiguriert) an {phone}: {message}")
        return True
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=message,
            from_=settings.twilio_from_number,
            to=phone,
        )
        return True
    except Exception as e:
        print(f"[Notify] SMS-Versand fehlgeschlagen an {phone}: {e}")
        return False


# ── E-Mail via System-SMTP ─────────────────────────────────────────────────────

async def _send_email(customer, message: str, subject: str) -> bool:
    email = getattr(customer, "email", None)
    if not email:
        return False
    if not settings.system_smtp_host:
        print(f"[Notify] E-Mail (SMTP nicht konfiguriert) an {email}: {subject}")
        return True
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.system_smtp_from
        msg["To"] = email
        msg.set_content(message)

        with smtplib.SMTP(settings.system_smtp_host, settings.system_smtp_port) as smtp:
            smtp.starttls()
            smtp.login(settings.system_smtp_user, settings.system_smtp_password)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print(f"[Notify] E-Mail-Versand fehlgeschlagen an {email}: {e}")
        return False


# ── Hilfsfunktion: Kunden aus DB laden + benachrichtigen ──────────────────────

async def notify_customer_by_id(
    db,
    customer_id,
    message: str,
    subject: str = "Benachrichtigung von Baddi",
) -> bool:
    """Lädt den Kunden aus der DB und sendet die Benachrichtigung."""
    from sqlalchemy import select
    from models.customer import Customer
    import uuid

    try:
        cid = uuid.UUID(str(customer_id))
        result = await db.execute(select(Customer).where(Customer.id == cid))
        customer = result.scalar_one_or_none()
        if not customer:
            print(f"[Notify] Kunde {customer_id} nicht gefunden")
            return False
        return await notify_customer(customer, message, subject)
    except Exception as e:
        print(f"[Notify] Fehler bei notify_customer_by_id({customer_id}): {e}")
        return False
