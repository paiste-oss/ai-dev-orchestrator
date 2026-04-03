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
---
✓ [2026-03-28 20:53] Schau dir das Fenster Gedächtnis an, es scheint seit der umstellung auf kürzere 
Fertig. Drei Änderungen:
| Was | Wo |
|---|---|
| **Refresh-Button** im Gedächtnis-Fenster (oben rechts) | `MemoryWindow.tsx` |
| **Sofort-Refresh** beim Öffnen des Gedächtnis-Fensters | `page.tsx` → `handleAddCard` |
| **Doppelter Refresh** nach 6s + 12s statt einmal nach 4s | `page.tsx` → `handleSend` |
Der Celery-Task (Claude Haiku + Qdrant + PostgreSQL) braucht oft 5–10 Sekunden — 4s war zu knapp. Mit 6s + 12s wird er fast immer erwischt. Und falls nicht, gibt's jetzt den Refresh-Button.
---
✓ [2026-03-29 19:14] Tool: Lokale Dokumentensuche
/home/naor/ai-dev-orchestrator/backend/celerybeat-schedule is not a directory. Did you mean to add the parent directory /home/naor/ai-dev-orchestrator/backend?
Implementiert und gepusht.
**Neues Tool: `document_search`**
| Datei | Was |
|---|---|
| `services/tools/defs/documents.py` | Tool-Definitionen für `search_documents` + `list_documents` |
| `services/tools/handlers/documents.py` | Handler: PostgreSQL-Suche (ILIKE auf Dateiname + Inhalt), Snippets |
| `services/tools/defs/__init__.py` | Export ergänzt |
| `services/tools/registry.py` | Tool im Katalog eingetragen |
**Wie es funktioniert:**
- `search_documents` — Claude sucht in allen hochgeladenen Dokumenten des Nutzers via ILIKE; gibt Dateiname, Typ, Seiten und einen ~300-Zeichen-Textausschnitt rund um den Treffer zurück
- `list_documents` — listet alle Dateien mit Metadaten auf (bis 50 Einträge)
- Kein externer API-Key nötig — alles direkt in der bestehenden PostgreSQL-Datenbank (`customer_documents`)
---
✓ [2026-04-02 21:49] Unter Testseiten werden nun auch Admin Seiten aufgeführt, dass ist unnötig. Bitt
/home/naor/ai-dev-orchestrator/backend/celerybeat-schedule is not a directory. Did you mean to add the parent directory /home/naor/ai-dev-orchestrator/backend?
Erledigt. Die Admin-Seiten wurden aus der `ALL_PAGES`-Liste entfernt. Jetzt werden nur noch Public- und Kunde-Seiten aufgeführt.
---
✓ [2026-04-02 21:52] Unter der Testseite Kunde kommt: Recoverable Error
/home/naor/ai-dev-orchestrator/backend/celerybeat-schedule is not a directory. Did you mean to add the parent directory /home/naor/ai-dev-orchestrator/backend?
Fertig. `BaddiAvatar3D` wird jetzt mit `dynamic(..., { ssr: false })` geladen, sodass `@react-three/fiber` nie serverseitig ausgewertet wird. Der Fehler ist damit behoben.
---
✓ [2026-04-02 21:56] Die Seite Register unter Testseite zeigt nicht die registrierungsseite sondern d
/home/naor/ai-dev-orchestrator/backend/celerybeat-schedule is not a directory. Did you mean to add the parent directory /home/naor/ai-dev-orchestrator/backend?
`show_register_menschen` ist in Redis auf `false` gesetzt — daher leitet die Register-Seite sofort zu `/login` weiter.
Das ist eine echte Einstellung, keine Bug. Zwei Möglichkeiten:
1. **Setting in Redis auf `true` setzen** — dann funktioniert die Registrierungsseite wieder
2. **Testseiten-Vorschau ignoriert den Redirect** — schwieriger, da der iFrame die Seite eigenständig rendert
Da es sich um eine bewusst gesetzte Einstellung handelt: Soll ich `show_register_menschen` auf `true` setzen, oder möchtest du die Seite nur in der Vorschau anzeigen können ohne die Einstellung zu ändern?