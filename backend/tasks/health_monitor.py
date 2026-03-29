"""
Health Monitor — prüft alle 5 Minuten den System-Status.
Sendet E-Mail-Alert wenn ein Dienst ausfällt oder sich wieder erholt.

Status wird in Redis gecacht um Flapping (ständige Alerts) zu verhindern:
  key: health:status:{service}  →  "ok" | "fail"
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from tasks.celery_app import celery_app
from core.config import settings

_log = logging.getLogger(__name__)

_SERVICES = ["db", "redis", "ai", "qdrant"]
_STATE_PREFIX = "health:status:"
_FAIL_COUNT_PREFIX = "health:fail_count:"


@celery_app.task(name="tasks.health_monitor.check_health")
def check_health():
    """Prüft alle Dienste und sendet Alerts bei Zustandsänderungen."""
    try:
        results = _check_all_services_sync()
        _process_alerts(results)
    except Exception as e:
        _log.error("Health Monitor Fehler: %s", e)


def _check_all_services_sync() -> dict[str, bool]:
    """Synchrone Prüfung aller Dienste — kompatibel mit Celery (kein asyncio.run)."""
    import psycopg2
    import redis as redis_sync_lib
    from urllib.parse import urlparse

    results: dict[str, bool] = {}

    # Datenbank — synchrone psycopg2 Verbindung
    try:
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        parsed = urlparse(db_url)
        conn = psycopg2.connect(
            host=parsed.hostname, port=parsed.port or 5432,
            user=parsed.username, password=parsed.password,
            dbname=parsed.path.lstrip("/"), connect_timeout=3,
        )
        conn.cursor().execute("SELECT 1")
        conn.close()
        results["db"] = True
    except Exception as e:
        _log.warning("Health: DB offline — %s", e)
        results["db"] = False

    # Redis — synchron
    try:
        r = redis_sync_lib.from_url(settings.redis_url, socket_connect_timeout=3)
        r.ping()
        r.close()
        results["redis"] = True
    except Exception as e:
        _log.warning("Health: Redis offline — %s", e)
        results["redis"] = False

    # KI
    results["ai"] = bool(settings.anthropic_api_key or settings.aws_bedrock_api_key)

    # Qdrant
    try:
        import httpx
        resp = httpx.get(
            f"http://{settings.qdrant_host}:{settings.qdrant_port}/healthz",
            timeout=3.0,
        )
        results["qdrant"] = resp.status_code == 200
    except Exception as e:
        _log.warning("Health: Qdrant offline — %s", e)
        results["qdrant"] = False

    return results


def _process_alerts(results: dict[str, bool]) -> None:
    """Vergleicht mit letztem bekannten Zustand — sendet Alert erst nach N aufeinanderfolgenden Fehlern."""
    from core.redis_client import redis_sync
    r = redis_sync()

    threshold = settings.health_alert_threshold
    failed = []
    recovered = []

    for service, ok in results.items():
        status_key = f"{_STATE_PREFIX}{service}"
        count_key = f"{_FAIL_COUNT_PREFIX}{service}"
        prev_status = r.get(status_key)

        if ok:
            # Erholt — nur Alert wenn vorher wirklich alarmiert wurde (count >= threshold)
            if prev_status == "fail":
                fail_count = int(r.get(count_key) or 0)
                if fail_count >= threshold:
                    recovered.append(service)
            r.set(status_key, "ok", ex=86400)
            r.delete(count_key)
        else:
            # Fehler — Zähler erhöhen, erst bei Threshold alertieren
            r.set(status_key, "fail", ex=86400)
            fail_count = int(r.incr(count_key))
            r.expire(count_key, 86400)
            if fail_count == threshold:
                failed.append(service)
            # > threshold: bereits alarmiert, kein weiterer Alert

    if failed:
        _send_alert(
            subject=f"🚨 Baddi — {len(failed)} Dienst(e) ausgefallen",
            body=(
                f"Folgende Dienste sind nicht erreichbar:\n\n"
                + "\n".join(f"  ✗ {s.upper()}" for s in failed)
                + f"\n\nZeit: {_now()}\n\nBitte sofort prüfen: https://baddi.ch/admin"
            ),
        )

    if recovered:
        _send_alert(
            subject=f"✅ Baddi — {len(recovered)} Dienst(e) wieder online",
            body=(
                f"Folgende Dienste sind wieder erreichbar:\n\n"
                + "\n".join(f"  ✓ {s.upper()}" for s in recovered)
                + f"\n\nZeit: {_now()}"
            ),
        )


def _send_alert(subject: str, body: str) -> None:
    email = settings.health_alert_email or settings.system_smtp_user
    if not email or not settings.system_smtp_host:
        _log.warning("Health Alert nicht gesendet — SMTP nicht konfiguriert")
        return
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.system_smtp_from
        msg["To"] = email
        msg.set_content(body)
        with smtplib.SMTP(settings.system_smtp_host, settings.system_smtp_port) as smtp:
            smtp.starttls()
            smtp.login(settings.system_smtp_user, settings.system_smtp_password)
            smtp.send_message(msg)
        _log.info("Health Alert gesendet: %s", subject)
    except Exception as e:
        _log.error("Health Alert E-Mail fehlgeschlagen: %s", e)


def _now() -> str:
    from datetime import datetime
    return datetime.now().strftime("%d.%m.%Y %H:%M:%S")


def get_current_status() -> dict[str, str]:
    """Gibt den letzten bekannten Status aller Dienste zurück (aus Redis-Cache)."""
    from core.redis_client import redis_sync
    r = redis_sync()
    return {
        service: r.get(f"{_STATE_PREFIX}{service}") or "unknown"
        for service in _SERVICES
    }
