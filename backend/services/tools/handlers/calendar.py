"""
Kalender-Tool-Handler — CalDAV via Radicale.

Kommuniziert intern mit http://ai_radicale:5232 (gleicher Docker-Stack).
Nutzt den caldav_username / caldav_password des Customers.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Any

import httpx
from icalendar import Calendar, Event, vDatetime, vDate, vText

log = logging.getLogger("uvicorn.error")

_RADICALE_URL = "http://ai_radicale:5232"
_CALENDAR_NAME = "kalender"
_TZ = timezone.utc


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _calendar_url(username: str) -> str:
    return f"{_RADICALE_URL}/{username}/{_CALENDAR_NAME}/"


def _event_url(username: str, uid: str) -> str:
    return f"{_RADICALE_URL}/{username}/{_CALENDAR_NAME}/{uid}.ics"


def _parse_dt(dt_str: str) -> datetime:
    """Parst 'YYYY-MM-DD HH:MM' oder 'YYYY-MM-DD' als naive lokale Zeit."""
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(dt_str.strip(), fmt)
        except ValueError:
            continue
    raise ValueError(f"Ungültiges Datum/Zeit-Format: {dt_str!r}")


async def _ensure_collection(username: str, password: str) -> None:
    """Erstellt die CalDAV-Sammlung falls sie noch nicht existiert."""
    url = _calendar_url(username)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<mkcol xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">'
        '<set><prop>'
        '<resourcetype><collection/><C:calendar/></resourcetype>'
        '<displayname>Baddi Kalender</displayname>'
        '</prop></set></mkcol>'
    )
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.request(
            "MKCOL", url,
            content=xml,
            headers={"Content-Type": "application/xml"},
            auth=(username, password),
        )
    # 201 = erstellt, 405 = existiert bereits — beides akzeptabel
    if resp.status_code not in (201, 405):
        log.warning("[Calendar] MKCOL %s → %d", url, resp.status_code)


async def _fetch_events(username: str, password: str, start: datetime, end: datetime) -> list[dict]:
    """Ruft Termine im Zeitraum [start, end] via CalDAV REPORT ab."""
    url = _calendar_url(username)
    start_str = start.strftime("%Y%m%dT%H%M%SZ")
    end_str = end.strftime("%Y%m%dT%H%M%SZ")

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="{start_str}" end="{end_str}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>"""

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.request(
            "REPORT", url,
            content=xml,
            headers={"Content-Type": "application/xml", "Depth": "1"},
            auth=(username, password),
        )

    if resp.status_code == 404:
        # Collection existiert noch nicht
        return []
    if resp.status_code not in (207, 200):
        log.warning("[Calendar] REPORT %s → %d", url, resp.status_code)
        return []

    return _parse_multistatus(resp.text)


def _parse_multistatus(xml_body: str) -> list[dict]:
    """Extrahiert VEVENT-Daten aus einer CalDAV-Multistatus-Antwort."""
    import re
    events: list[dict] = []
    # calendar-data Blöcke aus Multistatus-XML extrahieren
    for cal_data in re.findall(r"BEGIN:VCALENDAR.*?END:VCALENDAR", xml_body, re.DOTALL):
        try:
            cal = Calendar.from_ical(cal_data)
            for component in cal.walk():
                if component.name != "VEVENT":
                    continue
                ev = _component_to_dict(component)
                if ev:
                    events.append(ev)
        except Exception as exc:
            log.debug("[Calendar] ICS-Parse-Fehler: %s", exc)

    events.sort(key=lambda e: e.get("start", ""))
    return events


def _component_to_dict(component) -> dict | None:
    try:
        uid = str(component.get("UID", ""))
        summary = str(component.get("SUMMARY", "(kein Titel)"))
        dtstart = component.get("DTSTART")
        dtend = component.get("DTEND")
        description = str(component.get("DESCRIPTION", "")) or None
        location = str(component.get("LOCATION", "")) or None

        def _fmt(dt_prop) -> str:
            if dt_prop is None:
                return ""
            v = dt_prop.dt
            if isinstance(v, datetime):
                return v.strftime("%Y-%m-%d %H:%M")
            if isinstance(v, date_type):
                return v.strftime("%Y-%m-%d")
            return str(v)

        return {
            "uid": uid,
            "title": summary,
            "start": _fmt(dtstart),
            "end": _fmt(dtend),
            "description": description,
            "location": location,
        }
    except Exception:
        return None


def _build_ics(uid: str, title: str, start: datetime, end: datetime,
               description: str | None, location: str | None, all_day: bool) -> bytes:
    cal = Calendar()
    cal.add("PRODID", "-//Baddi//CalDAV//DE")
    cal.add("VERSION", "2.0")

    event = Event()
    event.add("UID", uid)
    event.add("SUMMARY", vText(title))
    event.add("DTSTAMP", datetime.now(timezone.utc))

    if all_day:
        event.add("DTSTART", vDate(start.date()))
        event.add("DTEND", vDate(end.date()))
    else:
        event.add("DTSTART", vDatetime(start.replace(tzinfo=timezone.utc)))
        event.add("DTEND", vDatetime(end.replace(tzinfo=timezone.utc)))

    if description:
        event.add("DESCRIPTION", vText(description))
    if location:
        event.add("LOCATION", vText(location))

    cal.add_component(event)
    return cal.to_ical()


# ── Haupt-Handler ─────────────────────────────────────────────────────────────

async def _handle_calendar(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if not customer_id:
        return {"error": "Kein Benutzerkontext — Kalender nicht verfügbar"}

    # Customer laden
    from core.database import AsyncSessionLocal
    from models.customer import Customer
    import uuid as _uuid

    async with AsyncSessionLocal() as db:
        customer = await db.get(Customer, _uuid.UUID(customer_id))

    if not customer:
        return {"error": "Benutzer nicht gefunden"}
    if not customer.caldav_username or not customer.caldav_password:
        return {"error": "Kein CalDAV-Kalender eingerichtet. Bitte Administrator kontaktieren."}

    username = customer.caldav_username
    password = customer.caldav_password

    # ── calendar_list_events ──────────────────────────────────────────────────
    if tool_name == "calendar_list_events":
        days_ahead = min(int(tool_input.get("days_ahead", 14)), 90)
        include_past = bool(tool_input.get("include_past", False))

        now = datetime.now(_TZ).replace(tzinfo=None)
        start = now - timedelta(days=7) if include_past else now
        end = now + timedelta(days=days_ahead)

        await _ensure_collection(username, password)
        events = await _fetch_events(username, password, start, end)

        if not events:
            return {"events": [], "message": "Keine Termine im gewählten Zeitraum."}
        return {"events": events, "total": len(events)}

    # ── calendar_create_event ─────────────────────────────────────────────────
    if tool_name == "calendar_create_event":
        title = tool_input.get("title", "").strip()
        if not title:
            return {"error": "Titel ist erforderlich"}

        start_dt = _parse_dt(tool_input["start"])
        if tool_input.get("end"):
            end_dt = _parse_dt(tool_input["end"])
        else:
            end_dt = start_dt + timedelta(hours=1)

        description = tool_input.get("description") or None
        location = tool_input.get("location") or None
        all_day = bool(tool_input.get("all_day", False))
        uid = str(uuid.uuid4())

        await _ensure_collection(username, password)
        ics_data = _build_ics(uid, title, start_dt, end_dt, description, location, all_day)

        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.put(
                _event_url(username, uid),
                content=ics_data,
                headers={"Content-Type": "text/calendar; charset=utf-8"},
                auth=(username, password),
            )

        if resp.status_code in (201, 204):
            return {
                "ok": True,
                "uid": uid,
                "title": title,
                "start": start_dt.strftime("%Y-%m-%d %H:%M"),
                "end": end_dt.strftime("%Y-%m-%d %H:%M"),
                "message": f"Termin '{title}' wurde eingetragen.",
            }
        return {"error": f"Termin konnte nicht gespeichert werden (HTTP {resp.status_code})"}

    # ── calendar_delete_event ─────────────────────────────────────────────────
    if tool_name == "calendar_delete_event":
        uid = tool_input.get("uid", "").strip()
        if not uid:
            return {"error": "UID ist erforderlich"}

        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.delete(
                _event_url(username, uid),
                auth=(username, password),
            )

        if resp.status_code in (200, 204):
            return {"ok": True, "message": "Termin wurde gelöscht."}
        if resp.status_code == 404:
            return {"error": "Termin nicht gefunden."}
        return {"error": f"Löschen fehlgeschlagen (HTTP {resp.status_code})"}

    return {"error": f"Unbekanntes Kalender-Tool: {tool_name}"}
