"""
Namensnetz-Operationen für den Chat.

_apply_netzwerk_aktion  — DB-Mutation: Persons, Networks, Connections
_update_netzwerk_mentions — lastMentionedAt aktualisieren nach jedem Chat-Turn
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.window import WindowBoard

_log = logging.getLogger(__name__)


async def apply_netzwerk_aktion(customer_id: Any, action: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
    """Wendet eine Netzwerk-Aktion auf das Board des Users an und speichert in der DB."""
    res = await db.execute(
        select(WindowBoard)
        .where(WindowBoard.customer_id == customer_id, WindowBoard.board_type == "netzwerk")
        .order_by(WindowBoard.updated_at.desc())
        .limit(1)
    )
    board = res.scalar_one_or_none()
    if not board:
        board = WindowBoard(customer_id=customer_id, name="Namensnetz", board_type="netzwerk", data={})
        db.add(board)
        await db.flush()

    data: dict = dict(board.data or {})
    if "persons" not in data:
        data["persons"] = []
    if "networks" not in data:
        data["networks"] = []
    if "connections" not in data:
        data["connections"] = []

    added: list[str] = []
    atype = action.get("type", "")

    def _find_or_create_person(name: str) -> dict:
        p = next((x for x in data["persons"] if x.get("name") == name), None)
        if not p:
            now_ms = int(time.time() * 1000)
            p = {"id": str(uuid.uuid4()), "name": name, "fullName": name,
                 "photo": None, "x": len(data["persons"]) * 130 + 60, "y": 300, "note": "",
                 "createdAt": now_ms, "lastMentionedAt": now_ms}
            data["persons"].append(p)
            added.append(f"Person '{name}' hinzugefügt")
        return p

    def _find_or_create_network(name: str) -> dict:
        n = next((x for x in data["networks"] if x.get("name") == name), None)
        if not n:
            gid = str(uuid.uuid4())
            n = {"id": str(uuid.uuid4()), "name": name,
                 "x": len(data["networks"]) * 220 + 80, "y": 80,
                 "groups": [{"id": gid, "color": "#6366f1", "label": "Mitglied"}],
                 "members": [], "createdAt": int(time.time() * 1000)}
            data["networks"].append(n)
            added.append(f"Netzwerk '{name}' erstellt")
        return n

    def _add_to_network(net: dict, person: dict) -> None:
        if any(m["personId"] == person["id"] for m in net["members"]):
            return
        gid = net["groups"][0]["id"] if net["groups"] else ""
        net["members"].append({"personId": person["id"], "group": gid})
        added.append(f"'{person['name']}' zu '{net['name']}' hinzugefügt")

    if atype == "add_person":
        _find_or_create_person(action.get("name", "").strip())

    elif atype == "create_network":
        net = _find_or_create_network(action.get("name", "").strip())
        for pname in action.get("persons", []):
            person = _find_or_create_person(pname.strip())
            _add_to_network(net, person)

    elif atype == "add_to_network":
        net_name = (action.get("network") or action.get("name") or "").strip()
        net = _find_or_create_network(net_name)
        for pname in action.get("persons", []):
            person = _find_or_create_person(pname.strip())
            _add_to_network(net, person)

    elif atype == "add_connection":
        persons_list = [p.strip() for p in (action.get("persons") or []) if p.strip()]
        pa_name = persons_list[0] if len(persons_list) >= 1 else (action.get("person_a") or "").strip()
        pb_name = persons_list[1] if len(persons_list) >= 2 else (action.get("person_b") or "").strip()
        if (not pa_name or not pb_name) and len(data["persons"]) == 2:
            pa_name = data["persons"][0].get("name", "")
            pb_name = data["persons"][1].get("name", "")
        _log.info("add_connection: person_a=%r person_b=%r persons_in_board=%r",
                  pa_name, pb_name, [p.get("name") for p in data["persons"]])
        if pa_name and pb_name:
            pa = _find_or_create_person(pa_name)
            pb = _find_or_create_person(pb_name)
            already = any(
                (c["a"] == pa["id"] and c["b"] == pb["id"]) or
                (c["a"] == pb["id"] and c["b"] == pa["id"])
                for c in data["connections"]
            )
            if not already:
                conn: dict[str, str] = {"id": str(uuid.uuid4()), "a": pa["id"], "b": pb["id"]}
                label = (action.get("label") or "").strip()
                if label:
                    conn["label"] = label
                data["connections"].append(conn)
                label_str = f" ({label})" if label else ""
                added.append(f"Verbindung '{pa_name}' ↔ '{pb_name}'{label_str} erstellt")
        else:
            _log.warning("add_connection: leere Namen — person_a=%r person_b=%r action=%r",
                         pa_name, pb_name, action)

    _log.info("Netzwerk-Aktion speichern: board=%s atype=%s added=%r", board.id, atype, added)
    await db.execute(
        text("UPDATE window_boards SET data = CAST(:d AS jsonb), updated_at = NOW() WHERE id = :id"),
        {"d": json.dumps(data), "id": str(board.id)},
    )
    await db.commit()
    return {"board_id": str(board.id), "added": added}


async def update_netzwerk_mentions(customer_id: Any, user_msg: str, db: AsyncSession) -> None:
    """Scannt die User-Nachricht nach bekannten Personennamen und aktualisiert lastMentionedAt."""
    import json as _json
    try:
        res = await db.execute(
            select(WindowBoard)
            .where(WindowBoard.customer_id == customer_id, WindowBoard.board_type == "netzwerk")
            .order_by(WindowBoard.updated_at.desc())
            .limit(1)
        )
        board = res.scalar_one_or_none()
        if not board:
            return
        data: dict = dict(board.data or {})
        persons: list[dict] = data.get("persons") or []
        now_ms = int(time.time() * 1000)
        msg_lower = user_msg.lower()
        updated = False
        for p in persons:
            name = (p.get("name") or "").strip()
            full = (p.get("fullName") or "").strip()
            if (name and len(name) >= 2 and name.lower() in msg_lower) or \
               (full and len(full) >= 2 and full.lower() in msg_lower):
                p["lastMentionedAt"] = now_ms
                updated = True
        if updated:
            await db.execute(
                text("UPDATE window_boards SET data = CAST(:d AS jsonb), updated_at = NOW() WHERE id = :id"),
                {"d": _json.dumps(data), "id": str(board.id)},
            )
            await db.commit()
    except Exception as e:
        _log.warning("lastMentionedAt konnte nicht aktualisiert werden: %s", e)
