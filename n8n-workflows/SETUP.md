# n8n Buddy-Sinne — Setup

## 1. Workflows importieren

In n8n (http://localhost:5678):
**Workflows → New → Import from file** → jeweilige JSON-Datei hochladen.

| Datei | Quelle | Trigger |
|---|---|---|
| `buddy-email.json` | IMAP E-Mail | Jede Minute |
| `buddy-calendar.json` | Google Kalender | Alle 30 Min |
| `buddy-news.json` | SRF + Tagesanzeiger RSS | Stündlich |
| `buddy-weather.json` | OpenWeatherMap | 07:00 + 16:00 |
| `buddy-government.json` | Bundesrat + Fedlex RSS | Alle 4h |

---

## 2. Umgebungsvariablen setzen (kostenlos via .env)

Alle Variablen werden in der Root-`.env` gesetzt — kein n8n-Bezahlplan nötig.
n8n liest sie via `$env.VARIABLE_NAME` direkt aus dem Docker-Container.

| Variable in `.env` | Beschreibung | Pflicht |
|---|---|---|
| `N8N_WEBHOOK_SECRET` | Shared Secret für Backend-Auth | Ja |
| `N8N_DEFAULT_CUSTOMER_ID` | UUID aus der `customers` Tabelle | Ja |
| `N8N_DEFAULT_BUDDY_ID` | UUID aus der `ai_buddies` Tabelle | Optional |
| `OPENWEATHER_API_KEY` | Kostenlos auf openweathermap.org | Für Wetter |
| `WEATHER_CITY` | z.B. `Bern` oder `Zurich` | Für Wetter |
| `CUSTOMER_REGION` | z.B. `Kanton Bern` | Optional |

Nach Änderung der `.env`: `docker compose up -d n8n`

---

## 3. Credentials einrichten

### Email (IMAP)
- In n8n → **Credentials → New → IMAP**
- Host, Port, Username, Passwort eingeben
- Im Workflow `buddy-email.json` unter "Email Eingang" die Credential auswählen

### Google Kalender (OAuth2)
- In n8n → **Credentials → New → Google Calendar OAuth2 API**
- Google Cloud Console: OAuth2 Client ID erstellen, Redirect URI = `http://localhost:5678/rest/oauth2-credential/callback`
- Im Workflow `buddy-calendar.json` unter "Google Kalender" die Credential auswählen

---

## 4. Workflows aktivieren

Nach dem Einrichten: Workflow öffnen → Toggle oben rechts auf **Active** setzen.

---

## 5. Testen

**Manuell testen:** Im Workflow auf "Test workflow" klicken.
Danach in der Backend-Datenbank prüfen:
```
SELECT source, summary, decision, pushed_to_sse FROM buddy_events ORDER BY created_at DESC LIMIT 10;
```

Oder via API:
```
GET http://localhost:8000/v1/agent/events?customer_id={UUID}
```
