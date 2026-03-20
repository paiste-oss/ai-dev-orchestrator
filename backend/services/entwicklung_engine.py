"""
Entwicklungs-Engine — Das Uhrwerk analysiert Capability Gaps automatisch.

Wird im Hintergrund aufgerufen wenn ein neuer CapabilityRequest angelegt wird.
Claude analysiert die Anfrage und erstellt einen Tool-Vorschlag.

WICHTIG: Die Analyse läuft in einer eigenen DB-Session.
Die Request-Session des Aufrufers ist zu diesem Zeitpunkt bereits geschlossen.
"""
import asyncio
import json
import logging
from datetime import datetime

_log = logging.getLogger(__name__)

from models.capability_request import CapabilityRequest

_UHRWERK_CONFIG_KEY = "uhrwerk:config"
_UHRWERK_DEFAULTS = {
    "name": "Uhrwerk",
    "identity": (
        "Du bist das Uhrwerk — der interne Entwicklungs-Assistent von Baddi. "
        "Du analysierst Anfragen von Kunden, planst neue Tool-Integrationen und "
        "arbeitest eng mit dem Admin zusammen um neue Fähigkeiten zu entwickeln. "
        "Du antwortest präzise, technisch kompetent und auf Deutsch."
    ),
    "analyse_model": "claude-haiku-4-5-20251001",
    "reply_model": "claude-haiku-4-5-20251001",
    "language": "de",
}


def _load_uhrwerk_config() -> dict:
    """Lädt die Uhrwerk-Konfiguration aus Redis (mit Fallback auf Defaults)."""
    try:
        import redis as redis_lib
        from core.config import settings
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        raw = r.get(_UHRWERK_CONFIG_KEY)
        if raw:
            return {**_UHRWERK_DEFAULTS, **json.loads(raw)}
    except Exception as e:
        _log.warning("Uhrwerk-Config konnte nicht geladen werden: %s", e)
    return _UHRWERK_DEFAULTS


_ANALYSE_PROMPT = """Du bist ein Software-Architekt und API-Experte.
Ein Kunde hat folgende Anfrage gestellt, die das System noch nicht erfüllen kann:

ANFRAGE: {message}
ERKANNTER INTENT: {intent}

Analysiere die Anfrage und erstelle einen konkreten Tool-Vorschlag im folgenden JSON-Format:
{{
  "tool_name": "eindeutiger_tool_name",
  "display_name": "Anzeigename",
  "description": "Was das Tool macht",
  "category": "web|communication|productivity|data|transport",
  "api_type": "rest|webhook|scraping|rss",
  "api_url_pattern": "https://api.example.com/...",
  "auth_required": true/false,
  "auth_type": "api_key|oauth|basic|none",
  "needs_admin_input": [
    {{"key": "api_key", "label": "API-Schlüssel", "description": "Wo bekommt man den Key?"}}
  ],
  "input_parameters": [
    {{"name": "query", "type": "string", "description": "Suchanfrage", "required": true}}
  ],
  "implementation_notes": "Kurze technische Hinweise zur Implementierung",
  "estimated_complexity": "low|medium|high",
  "free_tier_available": true/false
}}

Antworte NUR mit dem JSON, keine Erklärungen davor oder danach."""


async def analyse_capability_request(request_id: str) -> None:
    """
    Analysiert einen CapabilityRequest im Hintergrund.
    Erstellt eine eigene DB-Session — komplett unabhängig vom aufrufenden Request.
    """
    import uuid as uuid_mod
    from services.llm_gateway import chat_with_claude
    from core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        req = await db.get(CapabilityRequest, uuid_mod.UUID(request_id))
        if not req or req.status != "pending":
            return

        # Status auf "analyzing" setzen
        req.status = "analyzing"
        req.updated_at = datetime.utcnow()
        await db.commit()

        cfg = _load_uhrwerk_config()

        try:
            prompt = _ANALYSE_PROMPT.format(
                message=req.original_message,
                intent=req.detected_intent or "unbekannt",
            )

            response = await chat_with_claude(
                messages=[{"role": "user", "content": prompt}],
                system_prompt=(
                    f"{cfg['identity']}\n\n"
                    "Antworte ausschliesslich mit validem JSON, keine Erklärungen."
                ),
                model=cfg["analyse_model"],
            )

            # JSON extrahieren (Claude gibt manchmal Markdown zurück)
            proposal = None
            try:
                text = response.strip()
                if text.startswith("```"):
                    lines = text.split("\n")
                    text = "\n".join(lines[1:-1])
                proposal = json.loads(text)
            except Exception:
                proposal = {"raw_response": response, "parse_error": True}

            dialog = list(req.dialog or [])

            if proposal and not proposal.get("parse_error"):
                needs_input = proposal.get("needs_admin_input", [])
                req.tool_proposal = proposal
                req.status = "needs_input" if needs_input else "building"

                summary = (
                    f"**Analyse abgeschlossen** ✅\n\n"
                    f"Tool: **{proposal.get('display_name', proposal.get('tool_name', '?'))}**\n"
                    f"Typ: {proposal.get('api_type', '?').upper()} API\n"
                    f"Komplexität: {proposal.get('estimated_complexity', '?')}\n"
                    f"Auth: {'Ja — ' + proposal.get('auth_type', '') if proposal.get('auth_required') else 'Keine'}\n\n"
                )

                if needs_input:
                    fields = "\n".join(
                        f"• **{f['label']}**: {f['description']}" for f in needs_input
                    )
                    summary += (
                        f"**Benötigte Eingaben vom Admin:**\n{fields}\n\n"
                        f"Bitte stell diese Informationen zur Verfügung damit ich weitermachen kann."
                    )
                else:
                    summary += "Ich kann dieses Tool ohne weiteren Input entwickeln. Ich arbeite daran..."

                dialog.append({
                    "role": "uhrwerk",
                    "content": summary,
                    "created_at": datetime.utcnow().isoformat(),
                })
            else:
                req.status = "needs_input"
                dialog.append({
                    "role": "uhrwerk",
                    "content": (
                        f"Ich habe die Anfrage analysiert, benötige aber Hilfe vom Admin "
                        f"um den richtigen Ansatz zu bestimmen.\n\n"
                        f"Rohantwort: {response[:500]}"
                    ),
                    "created_at": datetime.utcnow().isoformat(),
                })

            req.dialog = dialog
            req.updated_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            req.status = "needs_input"
            dialog = list(req.dialog or [])
            dialog.append({
                "role": "uhrwerk",
                "content": f"Analyse fehlgeschlagen: {str(e)[:200]}. Admin-Input benötigt.",
                "created_at": datetime.utcnow().isoformat(),
            })
            req.dialog = dialog
            req.updated_at = datetime.utcnow()
            await db.commit()


def schedule_capability_analysis(request_id: str) -> None:
    """Startet die Erstanalyse als Background-Task (non-blocking)."""
    async def _run():
        try:
            await analyse_capability_request(request_id)
        except Exception as e:
            _log.error("Capability-Analyse fehlgeschlagen (%s): %s", request_id, e)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_run())
    except Exception as e:
        _log.error("Konnte Analyse-Task nicht starten (%s): %s", request_id, e)


async def uhrwerk_reply(request_id: str) -> None:
    """
    Uhrwerk liest den gesamten Dialog-Kontext und antwortet auf die Admin-Nachricht.
    Wird aufgerufen nachdem der Admin eine Nachricht geschickt hat.
    """
    import uuid as uuid_mod
    from services.llm_gateway import chat_with_claude
    from core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        req = await db.get(CapabilityRequest, uuid_mod.UUID(request_id))
        if not req:
            return

        dialog = list(req.dialog or [])

        # Dialog-Kontext als Nachrichten aufbauen
        messages = []
        for entry in dialog:
            role = "assistant" if entry["role"] == "uhrwerk" else "user"
            messages.append({"role": role, "content": entry["content"]})

        cfg = _load_uhrwerk_config()
        system_prompt = (
            f"{cfg['identity']}\n\n"
            f"Aktuelle Anfrage: \"{req.original_message}\"\n"
            f"Intent: {req.detected_intent or 'unbekannt'}\n"
            f"Status: {req.status}\n\n"
            "Antworte präzise. Wenn du alle nötigen Informationen hast, "
            "beschreibe den nächsten konkreten Entwicklungsschritt. "
            "Wenn du noch etwas brauchst, frag gezielt danach."
        )

        try:
            response = await chat_with_claude(
                messages=messages,
                system_prompt=system_prompt,
                model=cfg["reply_model"],
            )

            dialog.append({
                "role": "uhrwerk",
                "content": response,
                "created_at": datetime.utcnow().isoformat(),
            })
            req.dialog = dialog
            req.updated_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            dialog.append({
                "role": "uhrwerk",
                "content": f"Fehler beim Verarbeiten: {str(e)[:200]}",
                "created_at": datetime.utcnow().isoformat(),
            })
            req.dialog = dialog
            req.updated_at = datetime.utcnow()
            await db.commit()


def schedule_uhrwerk_reply(request_id: str) -> None:
    """Startet die Uhrwerk-Antwort als Background-Task (non-blocking)."""
    async def _run():
        try:
            await uhrwerk_reply(request_id)
        except Exception as e:
            _log.error("Uhrwerk-Reply fehlgeschlagen (%s): %s", request_id, e)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_run())
    except Exception as e:
        _log.error("Konnte Uhrwerk-Reply-Task nicht starten (%s): %s", request_id, e)
