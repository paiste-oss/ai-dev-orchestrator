✓ [2026-03-22 22:14] Bitte pushen
Gepusht. Commit: `feat: Zurück-Button im Chat-Header für Admin-User`
---
✓ [2026-03-25 21:16] Schaue dir den Kundenbereich in der Admin Seite Kunden an, da steht Fehler beim 
Fertig. Das Problem war: `fetch()` zu `/v1/customers` (ohne Slash) löste einen **307 Redirect** aus. Browser-CORS-Preflights (OPTIONS) folgen keinem Redirect → Request schlägt mit "Failed to fetch" fehl.
Fix: Trailing Slash in `config.ts` → `/v1/customers/` — kein Redirect mehr, kein CORS-Problem.
---
✓ [2026-03-25 21:19] Bitte github pushen
Gepusht. Commit: `fix: Trailing Slash bei /v1/customers/ — verhindert CORS-Fehler durch 307 Redirect`
---
✓ [2026-03-25 21:25] Tool: Trainingsplan & Erinnerungen
Implementiert und gepusht. Hier was gebaut wurde:
**Neues Tool: `training_reminders`**
| Datei | Was |
|---|---|
| `models/training_reminder.py` | DB-Model: Wochenplan, E-Mail, Timezone, last_reminded_at |
| `services/tools/handlers/training.py` | 3 Tool-Actions: create / list / delete |
| `services/tools/definitions.py` | Anthropic Tool-Definitionen (Claude wählt selbst) |
| `services/tools/registry.py` | Tool im Katalog registriert |
| `tasks/training_reminders.py` | Celery Task: prüft alle 5 Min, sendet E-Mail-Erinnerung |
| `tasks/celery_app.py` | Beat-Schedule für alle 5 Minuten eingetragen |
| `core/database.py` | DB-Migration (idempotent) |
**Wie es funktioniert:**
1. Nutzer sagt "Erinnere mich Montag/Mittwoch/Freitag um 07:00 an mein Krafttraining"
2. Claude ruft `create_training_reminder` auf → Plan in DB gespeichert
3. Celery Beat läuft alle 5 Min → prüft ob jetzt Erinnerungszeit (±5 Min Fenster)
4. Wenn ja → E-Mail via Brevo SMTP → `last_reminded_at` gesetzt (kein Doppelsenden)
Kein neuer API-Key nötig — nutzt den bestehenden SMTP (Brevo) aus `.env`.
---
✓ [2026-03-28 09:30] In der Desktop Ansicht erscheinen alle Symbole auf der Seite eher klein. Kannst 
Fertig. Ich habe eine CSS-Regel in `globals.css` hinzugefügt die auf Desktop (≥1024px) alle SVG-Icons um ~10% vergrössert:
| Vorher | Nachher |
|--------|---------|
| w-3 (12px) | 13px |
| w-3.5 (14px) | 15px |
| w-4 (16px) | 18px |
| w-5 (20px) | 22px |
| w-6 (24px) | 26px |
| w-7 (28px) | 31px |
Die Regel greift nur auf `<svg>`-Elemente mit diesen Klassen — keine Auswirkung auf Divs oder andere Layout-Elemente. Auf Mobile bleibt alles unverändert.
---
✓ [2026-03-28 09:35] Schau dir im Namensnetz die Zoom Funktion des Canvas an. Auf dem Mobile springt 
Fertig. Der Pinch-Zoom-Faktor ist jetzt pro Frame auf **±12%** begrenzt (`rawRatio` wird auf `0.88–1.12` geclampt). Das verhindert die unkontrollierten Sprünge auf Mobile, während normale Pinch-Gesten weiterhin flüssig funktionieren.
---
✓ [2026-03-28 13:18] Schau dir bitte das Chat Fenster im Chat an. Wenn man das Fenster verkleinert sc
Fertig. Der Fix:
- Ein `ResizeObserver` beobachtet den Chat-Scroll-Container
- Sobald das Fenster kleiner wird (oder die mobile Tastatur aufgeht), scrollt er sofort ans Ende
- Nur wenn der User manuell nach oben gescrollt hat (`userScrolledUp.current`), bleibt die Position stehen
Das gilt für beide Layouts (Mobile & Desktop). Der Baddi-Ladeindikator bleibt jetzt immer sichtbar, weil beim Erscheinen schon der bestehende `useEffect([messages, loading])` scrollt — und beim anschliessenden Resize-Ereignis der neue Observer übernimmt.
---
✓ [2026-03-28 13:20] Bitte github pushen
Gepusht. Commit: `fix: ResizeObserver hält Scroll am Ende beim Verkleinern des Fensters`