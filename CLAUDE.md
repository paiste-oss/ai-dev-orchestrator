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

## Wichtige Konventionen
- Alle API-Endpunkte unter `/v1/` (FastAPI Router)
- Auth via JWT (`Bearer`-Token), Admin-Check via `require_admin`
- Stripe-Webhooks gehen direkt an `api.baddi.ch/v1/billing/webhook` (kein Next.js-Proxy)
- Frontend kommuniziert mit Backend via Next.js Rewrite `/v1/:path*` → `http://backend:8000`
- Deutsch als Sprache für Logs, Kommentare, Commit-Messages
- Kein Overengineering — minimale, direkte Lösungen bevorzugt

## Projektstruktur
```
backend/
  api/v1/          # FastAPI Router (billing, auth, chat, ...)
  models/          # SQLAlchemy Models
  services/        # Business Logic
  core/            # Config, DB, Dependencies
frontend/
  app/             # Next.js App Router Pages
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

## Wichtige Hinweise
- `.env` niemals committen
- Bei Docker-Netzwerkproblemen: `docker compose down && docker compose up -d`
- Frontend-Rewrites funktionieren; Route-Handler haben DNS-Probleme im Turbopack-Kontext
- Nach Code-Änderungen: `docker restart ai_backend` oder `ai_frontend`
