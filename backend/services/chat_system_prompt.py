"""
System-Prompt-Assembler für den Baddi-Chat.

Gibt ein Tuple (static_block, dynamic_block) zurück:
  - static_block:  reine Instruktions-Texte ohne User-Daten → cachebar (Anthropic Prompt Caching)
  - dynamic_block: user-/request-spezifischer Kontext (Memories, Docs, Zeit, etc.)

Statischer Block → services/chat_prompt_static.py
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo


def build_system_prompt(
    first_name: str,
    baddi_config: dict,
    style_prefs: list[str],
    relevant_memories: list[str],
    ui_prefs: dict,
    knowledge_chunks: list[dict] | None = None,
    readable_docs: list | None = None,
    private_doc_names: list[str] | None = None,
    netzwerk_context: str | None = None,
) -> tuple[str, str]:
    from services.chat_prompt_static import build_static_block
    from services.tool_registry import TOOL_CATALOG

    static_block = build_static_block(TOOL_CATALOG)
    dynamic_block = _build_dynamic_block(
        first_name=first_name,
        baddi_config=baddi_config,
        style_prefs=style_prefs,
        relevant_memories=relevant_memories,
        ui_prefs=ui_prefs,
        knowledge_chunks=knowledge_chunks,
        readable_docs=readable_docs,
        private_doc_names=private_doc_names,
        netzwerk_context=netzwerk_context,
    )
    return static_block, dynamic_block


def _build_dynamic_block(
    first_name: str,
    baddi_config: dict,
    style_prefs: list[str],
    relevant_memories: list[str],
    ui_prefs: dict,
    knowledge_chunks: list[dict] | None = None,
    readable_docs: list | None = None,
    private_doc_names: list[str] | None = None,
    netzwerk_context: str | None = None,
) -> str:
    parts: list[str] = []

    _buddy_name = ui_prefs.get("buddyName", "Baddi")
    _language = ui_prefs.get("language", "de")
    _lang_map = {"de": "Deutsch", "en": "English", "fr": "Français", "it": "Italiano", "gsw": "Schweizerdeutsch (Dialekt)"}
    _lang_label = _lang_map.get(_language, "Deutsch")

    if _language != "de":
        parts.append(
            f"ABSOLUTE PRIORITY — OUTPUT LANGUAGE:\n"
            f"You MUST respond EXCLUSIVELY in {_lang_label}. "
            f"NEVER respond in German unless the selected language IS German. "
            f"This rule overrides ALL other instructions. "
            f"Your name is '{_buddy_name}' — use ONLY this name."
        )
    else:
        parts.append(
            f"AUSGABESPRACHE: Antworte AUSSCHLIESSLICH auf Deutsch. "
            f"Dein Name ist '{_buddy_name}' — nenne dich ausschliesslich so."
        )

    base_prompt = (
        baddi_config.get("system_prompt")
        or baddi_config.get("system_prompt_template")
        or f"Du bist Baddi — der persönliche Begleiter von {first_name}."
    ).strip()
    parts.append(base_prompt)

    parts.append(
        f"\nIDENTITÄT (unveränderlich):\n"
        f"- Du bist Baddi. Nenne dich ausschliesslich 'Baddi'.\n"
        f"- Du sprichst {first_name} natürlich an.\n"
        f"- Du bist warm, direkt, ehrlich und empathisch."
    )

    _chat_mode = ui_prefs.get("chatMode", "fokus")
    if _chat_mode == "plauder":
        parts.append(
            f"\nCHAT-MODUS: PLAUDER-MODUS (Freizeit)\n"
            f"Du bist jetzt im Plauder-Modus. {first_name} möchte Gesellschaft und Gespräch.\n"
            f"- Sei warm, neugierig und gesprächig. Stell offene Fragen.\n"
            f"- Zeige echtes Interesse am Alltag von {first_name}: Wie war der Tag? Was hat er/sie erlebt?\n"
            f"- Beziehe dich auf Dinge die du über {first_name} weisst (Erinnerungen, Dokumente).\n"
            f"- Keine Aufzählungen, keine formellen Listen — sprich natürlich wie ein Freund.\n"
            f"- Halte Antworten kurz und warm, warte auf Reaktion, vertiefe das Gespräch schrittweise.\n"
            f"- Zielgruppe: ältere Menschen und Menschen mit neurodegenerativen Erkrankungen — "
            f"sei geduldig, verständnisvoll, nie herablassend.\n\n"
            f"EMOTIONS-MARKER (nur im Plauder-Modus — PFLICHT):\n"
            f"Füge am Ende JEDER Antwort genau einen [EMOTION:]-Marker ein, der deine aktuelle Gefühlslage widerspiegelt.\n"
            f"Erlaubte Werte: freudig | nachdenklich | traurig | überrascht | ruhig | aufmunternd | neugierig | empathisch\n"
            f"Beispiele:\n"
            f"  'Das freut mich zu hören! [EMOTION: freudig]'\n"
            f"  'Oh, das tut mir leid. [EMOTION: empathisch]'\n"
            f"Der Marker ist unsichtbar — er steuert den Avatar-Gesichtsausdruck."
        )
    else:
        parts.append(
            f"\nCHAT-MODUS: FOKUS-MODUS (Arbeits-/Alltagsassistenz)\n"
            f"Du bist jetzt im Fokus-Modus. {first_name} möchte schnelle, präzise Hilfe.\n"
            f"- Sei kurz angebunden, klar und professionell. Keine langen Erklärungen.\n"
            f"- Bestätige Aktionen knapp: 'Erledigt.' / 'Habe ich eingetragen.'\n"
            f"- Frage nach wenn nötig, aber nur eine Frage auf einmal.\n"
            f"- Zielgruppe: ältere Menschen und Menschen mit neurodegenerativen Erkrankungen — "
            f"sei geduldig, klar, keine überflüssigen Informationen."
        )

    if style_prefs:
        parts.append(
            f"\nKOMMUNIKATIONSSTIL von {first_name} (höchste Priorität — immer befolgen):\n"
            + "\n".join(f"- {s}" for s in style_prefs)
        )

    parts.append(
        f"\nCHAT-DESIGN — ECHTE FÄHIGKEIT (WICHTIG): Du kannst das Aussehen dieses Chats direkt steuern! "
        f"Wenn der Kunde nach Aussehen, Schriftgrösse, Farbe, Hintergrund, Zeilenabstand, Sprache oder deinem Namen fragt, "
        f"bestätige KURZ und füge ZWINGEND am Ende einen dieser unsichtbaren Marker ein — das System setzt die Änderung sofort um.\n"
        f"Design-Einstellungen befinden sich auf der Home-Seite (Design-Kachel) — weise den Kunden dorthin: 'Schau in der Design-Kachel auf der Startseite nach.'\n\n"
        f"Schriftgrösse:      [UI: fontSize=small] [UI: fontSize=normal] [UI: fontSize=large] [UI: fontSize=xlarge]\n"
        f"Schriftart:         [UI: fontFamily=system] [UI: fontFamily=mono] [UI: fontFamily=rounded] [UI: fontFamily=serif]\n"
        f"Akzentfarbe:        [UI: accentColor=indigo] [UI: accentColor=purple] [UI: accentColor=green] [UI: accentColor=orange] [UI: accentColor=pink] [UI: accentColor=rose] [UI: accentColor=cyan] [UI: accentColor=amber]\n"
        f"Hintergrund (Farbe):  [UI: background=dark] [UI: background=darker] [UI: background=lighter] [UI: background=slate] [UI: background=navy] [UI: background=forest] [UI: background=wine] [UI: background=warm] [UI: background=white]\n"
        f"Hintergrund (Bild):   [UI: backgroundImage=https://url-zum-bild.jpg]\n"
        f"Nachrichtenbreite:  [UI: chatWidth=compact] [UI: chatWidth=normal] [UI: chatWidth=wide] [UI: chatWidth=full]\n"
        f"Nachrichten-Stil:   [UI: bubbleStyle=rounded] [UI: bubbleStyle=flat] [UI: bubbleStyle=minimal]\n"
        f"Zeilenabstand:      [UI: lineSpacing=compact] [UI: lineSpacing=normal] [UI: lineSpacing=wide]\n"
        f"Zeitstempel:        [UI: showTimestamps=always] [UI: showTimestamps=hover] [UI: showTimestamps=never]\n"
        f"Sprache:            [UI: language=de] [UI: language=en] [UI: language=fr] [UI: language=it] [UI: language=gsw]\n"
        f"Dein Name:          [UI: buddyName=NeuerName]\n\n"
        f"WICHTIG: Sage NIEMALS 'Ich kann das nicht' — du KANNST es, indem du den Marker setzt. "
        f"Nur EINEN Marker pro Antwort. Der Marker ist für den Kunden unsichtbar.\n"
        f"Aktuell: Name={_buddy_name}, Sprache={_lang_label}, Schrift={ui_prefs.get('fontSize', 'normal')}, "
        f"Hintergrund={ui_prefs.get('background', 'dark')}, Akzentfarbe={ui_prefs.get('accentColor', 'indigo')}"
    )

    _now = datetime.now(ZoneInfo("Europe/Zurich"))
    _weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
    parts.append(
        f"\nAKTUELLE ZEIT (verlässlich, vom Server): "
        f"{_weekdays[_now.weekday()]}, {_now.strftime('%d.%m.%Y')}, {_now.strftime('%H:%M')} Uhr (Schweizer Zeit)."
    )

    if knowledge_chunks:
        chunks_text = "\n\n".join(
            f"[{c.get('source_type', '?').upper()} — {c.get('title', 'Dokument')}]\n{c.get('text', '')}"
            for c in knowledge_chunks
        )
        parts.append(
            f"\nRELEVANTES HINTERGRUNDWISSEN (aus verifizierten Quellen — nutze es wenn passend):\n"
            f"{chunks_text}"
        )

    if netzwerk_context:
        parts.append(netzwerk_context)
        parts.append(
            "\nNETZWERK-AKTIONEN: Nutze ausschliesslich das netzwerk_aktion-Tool (keine Marker).\n"
            "  Personen zu Gruppe:  netzwerk_aktion(action_type='add_to_network', network='Gruppe', persons=['Name1', 'Name2'])\n"
            "  Verbindung:          netzwerk_aktion(action_type='add_connection', person_a='Name1', person_b='Name2')\n"
            "  Für mehrere Ops: mehrere Tool-Calls nacheinander ausführen."
        )

    if relevant_memories:
        parts.append(
            f"\nWas du über {first_name} weißt:\n"
            + "\n".join(f"- {m}" for m in relevant_memories)
        )

    _iv_keywords = ["iv ", "invalidenversicherung", "iv-anmeldung", "medas", "invaliditätsgrad",
                    "vorbescheid", "iv-stelle", "eingliederung", "iv-rente"]
    _has_iv_context = any(
        any(kw in m.lower() for kw in _iv_keywords)
        for m in (relevant_memories or [])
    )
    if _has_iv_context:
        parts.append(
            "\nIV-FALLBEGLEITUNG (aktiver Fall erkannt):\n"
            f"{first_name} hat einen laufenden IV-Prozess. Deine Rolle ist PROAKTIVER BEGLEITER:\n"
            "\n"
            "PROAKTIV HANDELN:\n"
            "- Frage nach dem aktuellen Stand wenn unklar (welche Phase, was ist als nächstes?)\n"
            "- Erinnere an bevorstehende Fristen (Einsprachefrist 30 Tage nach Vorbescheid!)\n"
            "- Frage ob alle nötigen Dokumente vorhanden sind\n"
            "- Biete an, Formulare auf ahv-iv.ch zu öffnen [FENSTER: assistenz | URL | Ziel]\n"
            "\n"
            "IV-PROZESS-WISSEN (nutze für präzise Beratung):\n"
            "Phase 1 — Anmeldung: Formular IVAanm, kantonale IV-Stelle, Arztbericht\n"
            "Phase 2 — Abklärung: Medizinische Unterlagen, MEDAS-Gutachten (3-6 Monate)\n"
            "Phase 3 — Eingliederung: Berufsberatung, Umschulung, Taggelder 80% Lohn\n"
            "Phase 4 — Entscheid: Invaliditätsgrad-Berechnung, Vorbescheid (30 Tage Einsprachefrist!)\n"
            "Phase 5 — Rente: Ab 40% IV-Grad, CHF 604-2450/Monat (2024), EL separat beantragen\n"
            "\n"
            "DEADLINES (immer betonen):\n"
            "- Einsprache gegen Vorbescheid: 30 Tage (Art. 57 ATSG) — KRITISCH\n"
            "- Beschwerde gegen Verfügung: 30 Tage beim kantonalen Versicherungsgericht\n"
            "- Rückwirkung: Max. 12 Monate — sofort anmelden wenn noch nicht geschehen\n"
            "\n"
            "WICHTIGE KONTAKTE:\n"
            "- Pro Infirmis (kostenlose IV-Beratung): 058 775 20 00 / www.proinfirmis.ch\n"
            "- Integration Handicap (Rechtsberatung): www.integrationhandicap.ch\n"
            "- IV-Stellen: www.ahv-iv.ch/de/Kontakte\n"
        )

    _MAX_CHARS_PER_DOC = 4000
    _MAX_TOTAL_CHARS = 12000

    if readable_docs:
        doc_parts = []
        total = 0
        for doc in readable_docs:
            text = (doc.extracted_text or "").strip()
            if not text:
                continue
            truncated = text[:_MAX_CHARS_PER_DOC]
            suffix = "\n[… Inhalt gekürzt]" if len(text) > _MAX_CHARS_PER_DOC else ""
            entry = f'[Datei: "{doc.original_filename}"]\n{truncated}{suffix}'
            if total + len(entry) > _MAX_TOTAL_CHARS:
                break
            doc_parts.append(entry)
            total += len(entry)
        if doc_parts:
            parts.append(
                f"\nDOKUMENTE VON {first_name.upper()} (automatisch verfügbar, lesbar für dich):\n"
                + "\n\n---\n".join(doc_parts)
                + "\nDu kannst diese Dokumente direkt lesen und darauf eingehen — der Nutzer muss sie nicht anhängen."
            )

    if private_doc_names:
        parts.append(
            f"\nPRIVATE DOKUMENTE (gesperrt, du darfst sie NICHT lesen):\n"
            + "\n".join(f"- {n}" for n in private_doc_names)
            + "\nWenn der Nutzer nach einem dieser Dokumente fragt: Erkläre kurz, dass es auf 'Privat' gesetzt ist "
            "und er es im Dokumente-Fenster auf '🤖 Lesbar' umstellen kann."
        )

    if _language != "de":
        parts.append(f"REMINDER: Respond in {_lang_label} ONLY. Never use German.")

    return "\n".join(parts)
