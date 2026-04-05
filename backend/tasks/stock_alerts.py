"""
Stock Alert Task — prüft Kurs-Alerts alle 15 Minuten.

Ablauf pro Durchlauf:
  1. Alle aktiven Alerts aus DB laden
  2. Pro Symbol einmal den Kurs via yfinance abrufen
  3. Schwellwert prüfen (above / below)
  4. Bei Auslösung: Benachrichtigung über Kunden-Präferenz (SMS/E-Mail), Alert deaktivieren
"""
import asyncio
import logging
from datetime import datetime,timezone

from tasks.celery_app import celery_app
from core.config import settings

_log = logging.getLogger(__name__)


@celery_app.task(name="tasks.stock_alerts.check_stock_alerts", ignore_result=True)
def check_stock_alerts() -> None:
    asyncio.run(_run())


async def _run() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select
    from models.stock_alert import StockAlert
    from models.customer import Customer
    from services.notification_service import notify_customer

    engine = create_async_engine(settings.database_url, pool_size=2, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await db.execute(
                select(StockAlert).where(StockAlert.is_active.is_(True))
            )
            alerts = result.scalars().all()

        if not alerts:
            return

        # Kurse einmal pro Symbol abfragen (nicht für jeden Alert separat)
        symbols = list({a.symbol.upper() for a in alerts})
        prices: dict[str, float | None] = {}
        for symbol in symbols:
            prices[symbol] = _fetch_price(symbol)

        # Alerts prüfen
        triggered = []
        for alert in alerts:
            price = prices.get(alert.symbol.upper())
            if price is None:
                continue
            hit = (
                (alert.direction == "above" and price >= alert.threshold) or
                (alert.direction == "below" and price <= alert.threshold)
            )
            if hit:
                triggered.append((alert, price))

        if not triggered:
            return

        # Ausgelöste Alerts deaktivieren + Benachrichtigung senden
        async with Session() as db:
            for alert, price in triggered:
                db_alert = await db.get(StockAlert, alert.id)
                if not db_alert or not db_alert.is_active:
                    continue

                db_alert.is_active = False
                db_alert.triggered_at = datetime.now(timezone.utc).replace(tzinfo=None)

                # Kunden laden für Kanal-Präferenz
                customer = None
                if alert.customer_id:
                    customer = await db.get(Customer, alert.customer_id)

                await _notify(customer, alert, price)
                _log.info(
                    "Alert ausgelöst: %s %s %.2f (Kurs: %.2f)",
                    alert.symbol, alert.direction, alert.threshold, price,
                )
            await db.commit()
    finally:
        await engine.dispose()


async def _notify(customer, alert, price: float) -> None:
    from services.notification_service import notify_customer

    direction_de = "überschritten" if alert.direction == "above" else "unterschritten"
    symbol = alert.symbol
    name = alert.company_name or symbol
    cur = alert.currency or "CHF"

    subject = f"Baddi Kurs-Alert: {name} hat {alert.threshold:.2f} {cur} {direction_de}"
    message = (
        f"Kurs-Alert: {name} ({symbol})\n"
        f"Schwellwert {alert.threshold:.2f} {cur} {direction_de}\n"
        f"Aktueller Kurs: {price:.2f} {cur}\n"
        f"{datetime.now(timezone.utc).replace(tzinfo=None).strftime('%d.%m.%Y %H:%M')} UTC\n"
        f"baddi.ch"
    )

    if customer:
        await notify_customer(customer, message, subject)
    else:
        # Fallback: direkt per E-Mail an die hinterlegte Alert-E-Mail
        _send_email_fallback(alert.email, subject, message)


def _fetch_price(symbol: str) -> float | None:
    try:
        import yfinance as yf
        info = yf.Ticker(symbol).fast_info
        price = getattr(info, "last_price", None)
        return float(price) if price else None
    except Exception as e:
        _log.warning("Kurs für %s nicht abrufbar: %s", symbol, e)
        return None


def _send_email_fallback(to_email: str, subject: str, body: str) -> None:
    """Fallback wenn kein Customer-Objekt verfügbar (z.B. gelöschter Account)."""
    import smtplib
    from email.message import EmailMessage
    if not settings.system_smtp_host or not to_email:
        return
    try:
        msg = EmailMessage()
        msg["From"] = settings.system_smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(settings.system_smtp_host, settings.system_smtp_port) as server:
            server.starttls()
            server.login(settings.system_smtp_user, settings.system_smtp_password)
            server.send_message(msg)
    except Exception as e:
        _log.error("Fallback-E-Mail fehlgeschlagen: %s", e)
