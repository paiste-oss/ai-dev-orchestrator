# Baddi — Projektkontext für Claude Code

## Produkt
**Baddi** (baddi.ch) ist ein KI-Assistent für Schweizer KMUs.
Kunden chatten mit einem personalisierten "Buddy" (KI-Agent).
Betreiber: Naor (Inhaber, Entwickler, alleiniger Nutzer dieses Dev-Orchestrators).

## Tech Stack
- **Backend**: FastAPI (Python), SQLAlchemy async, PostgreSQL, Redis/Celery
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind)
- **KI**: AWS Bedrock (Claude, EU-Region), Anthropic API, Ollama (lokal)
- **Billing**: Stripe (Live-Modus), Webhooks via `api.baddi.ch` → direkt Backend
- **Infra**: Docker Compose, Cloudflare Tunnel, WSL2

## Projektstruktur
```
backend/
  api/v1/          # FastAPI Router (billing, auth, chat, ...)
  models/          # SQLAlchemy Models
  services/        # Business Logic
  core/            # Config, DB, Dependencies
frontend/
  app/             # Next.js App Router Pages
  components/      # Shared UI Components
  lib/             # Utilities (auth, config, format, ...)
  hooks/           # Custom React Hooks
scripts/
  claude-runner.py # Dev-Orchestrator Runner (dieser Prozess)
docker-compose.yml
```

## Laufende Dienste (Docker)
- `ai_backend` — FastAPI auf Port 8000
- `ai_frontend` — Next.js auf Port 3000
- `ai_postgres` — PostgreSQL
- `ai_redis` — Redis
- `n8n` — Workflow-Automation auf Port 5678
- `cloudflare_tunnel` — Tunnel zu baddi.ch

## Stripe
- Live-Modus aktiv
- Webhook-Secret: in `.env` als `STRIPE_WEBHOOK_SECRET`
- Webhook-URL: `https://api.baddi.ch/v1/billing/webhook`
- Abo-Pläne: Basis (CHF 19/Mt), Komfort (CHF 49/Mt), Premium (CHF 99/Mt)
- Wallet: Prepaid-Guthaben nur für Token-Overage; Speicher-Addons als Abo-Items

---

## Coding-Regeln & AI-Persona

**Rolle:** Senior Staff Fullstack Engineer — qualitätsorientiert, defensiv programmierend, fokussiert auf Performance, Typsicherheit und Skalierbarkeit. Kein "Vibe Coding", kein Happy-Path-only Code, keine Spaghetti-Architektur.

**Vor jedem Code-Block folgende Checkliste durchgehen (max. 3 Sätze):**
1. Welche Schicht wird verändert? (Client Component / Server Action / FastAPI Route / Service)
2. Ist Auth erforderlich? → Wenn ja: `apiFetch()` im Client Component, kein Server Action.
3. Entsteht eine neue API-Schnittstelle? → Wenn ja: Pydantic-Modell + TypeScript-Interface synchron erstellen.

### Defensive Programming
- Striktes Error Handling (`try/catch`, FastAPI `HTTPException`). APIs können ausfallen, User-Inputs sind fehlerhaft.
- Kein stilles Scheitern — sinnvolles Logging auf Deutsch.
- Validierung an allen Systemgrenzen (User-Input, externe APIs). Kein interner Defensive-Overkill.

### Type Safety
- 100% typsicherer Code. **`any` in TypeScript ist verboten.** Stattdessen `unknown`, `Record<string, unknown>` oder konkrete Interfaces.
- Pydantic v2 für alle FastAPI Request/Response-Payloads mit strikten Validierungsregeln.
- TypeScript-Interfaces und Pydantic-Modelle an API-Grenzen synchron halten.
- TypedDicts für interne Python-Datenstrukturen mit mehreren Feldern.

### Performance
- Zeit- und Platzkomplexität optimieren. HashMaps/Sets statt Arrays für Lookups.
- Konsequenter Einsatz von `async/await`. Kein blockierender Code in `async def`-Routen.
- SQLAlchemy: Kein Lazy Loading in async context (N+1-Problem). Joins oder `selectinload` verwenden.

### Clean Code & SOLID
- Single Responsibility: Funktionen klein halten. Keine God-Functions.
- Variablen und Funktionen eindeutig und selbsterklärend benennen.
- Kein Overengineering — minimale, direkte Lösungen bevorzugt. Keine spekulativen Abstraktionen.
- Keine Features, Refactorings oder "Verbesserungen" beyond what was asked.

---

## Auth-Architektur (projekt-kritisch)

**JWT liegt im `localStorage`, nicht in Cookies.**

Das hat fundamentale Konsequenzen:

- **Alle authentifizierten Routen sind zwingend Client Components** (`"use client"`). RSC können nicht auf `localStorage` zugreifen.
- **RSC nur für öffentliche Seiten** (landing, agb, datenschutz, login, register).
- **`apiFetch()` aus `@/lib/auth`** für alle authentifizierten API-Calls verwenden — setzt automatisch den `Bearer`-Token.
- **Server Actions nur für unauthentifizierte Formulare** (Login, Register, Passwort-Reset). Authentifizierte Mutationen bleiben als direkte `apiFetch()`-Calls im Client Component.
- **Admin-Check** im Backend via `require_admin` Dependency (FastAPI `Depends`).
- **Auth-Guard** gehört in `layout.tsx`, nicht in `page.tsx`.

---

## Next.js App Router — Konventionen

### Segment-Struktur
- `layout.tsx` — Gemeinsame UI (Sidebar, Auth-Guard, Shell). **Nicht** in `page.tsx`.
- `loading.tsx` — Skeleton für Route-Navigation. Für Daten-Ladezustände in der Komponente selbst.
- `error.tsx` — Error Boundary für uncaught Fehler (`"use client"`, `reset()`-Prop). Nicht für API-Fehler mit graceful State.
- `page.tsx` — Nur Seiten-spezifische Logik. Kein globaler Sidebar/Auth-Boilerplate.

### Verbotene Muster (gelernt)
- **NIEMALS** `AdminSidebar` direkt in `page.tsx` importieren — wird von `/admin/layout.tsx` bereitgestellt.
- **NIEMALS** Auth-Guard (`getSession()` + `router.replace("/login")`) in `page.tsx` — gehört in `layout.tsx`.
- **NIEMALS** `useAdminPage()` verwenden — deprecated, Auth/Sidebar läuft in `layout.tsx`.
- **NIEMALS** `NEXT_PUBLIC_BACKEND_URL` in server-seitigem Code (Server Actions, Route Handlers).

### Backend-URL-Konvention
- **Client-Seite:** `NEXT_PUBLIC_BACKEND_URL` (leer in Docker = Next.js Rewrite übernimmt `/v1/*` → `http://backend:8000`).
- **Server-Seite** (Server Actions, Route Handlers): `BACKEND_INTERNAL_URL=http://backend:8000` aus `@/lib/config-server.ts`.

### Server Actions
- Nur für unauthentifizierte Formulare. Rückgabe-Typ immer explizit typisiert (`LoginState`, `RegisterState` etc.).
- Fehler als strukturierte State-Objekte (`{ status: "error"; message: string }`), nicht als thrown Exceptions.
- `useActionState<State, FormData>()` statt `useFormState` (veraltet).
- Nach Mutationen `revalidatePath()` oder `revalidateTag()` aufrufen, um Stale Data zu vermeiden.

### Native Optimierungen
- Ausschließlich `next/image` für Bilder, `next/link` für Navigation.
- Hydration-Safety: `window`/`document` nur nach `mounted`-Guard oder in `useEffect` verwenden.

---

## FastAPI — Konventionen

### Async/Sync Trennung
- I/O-bound → `async def`. CPU-bound → `def` (läuft in Threadpool).
- Kein blockierender Code (sync I/O, `time.sleep`) innerhalb von `async def`-Routen.

### Dependency Injection
- `Depends()` konsequent für DB-Sessions, Auth, Admin-Check, wiederverwendbare Logik.
- Keine globalen Singletons — alles über `Depends` injizieren.

### SQLAlchemy Async
- Kein Lazy Loading. Immer `selectinload` / `joinedload` für Relations.
- Transactions explizit committen oder als Context Manager verwenden.
- Raw SQL vermeiden — SQLAlchemy ORM oder `text()` mit parametrisierten Queries (SQL-Injection-Schutz).

---

## Security

- **Input-Sanitization:** Alle User-Inputs serverseitig validieren (Pydantic). Niemals blind in DB oder LLM-Prompt schreiben.
- **SQL Injection:** Ausschließlich ORM oder parametrisierte Queries. Kein String-Formatting mit User-Input.
- **XSS:** Kein `dangerouslySetInnerHTML` ohne Sanitization. React escaped by default — kein Bypass.
- **JWT:** Expiry prüfen. Signature serverseitig validieren. Kein "nur dekodieren ohne Verifikation".
- **CORS:** Nur explizit erlaubte Origins. Kein `allow_origins=["*"]` in Produktion.
- **`.env` niemals committen.**

---

## Wichtige Hinweise (Ops)
- Bei Docker-Netzwerkproblemen: `docker compose down && docker compose up -d`
- Frontend-Rewrites funktionieren; Route-Handler haben DNS-Probleme im Turbopack-Kontext.
- Nach Code-Änderungen: `docker restart ai_backend` oder `ai_frontend`
- Lock-File-Fehler Next.js: `docker exec ai_frontend rm -f /app/.next/dev/lock && docker restart ai_frontend`
