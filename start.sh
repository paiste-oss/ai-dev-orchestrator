#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh — AI Buddy Starter
#
# Secrets werden über .env verwaltet (niemals in Git committen).
#
# Befehle:
#   ./start.sh              → alles starten
#   ./start.sh down         → alles stoppen
#   ./start.sh restart      → neustart
#   ./start.sh logs [svc]   → logs
#   ./start.sh pull         → images aktualisieren + neustart
# ─────────────────────────────────────────────────────────────────────────────
set -e

if [ ! -f ".env" ]; then
  echo "❌ .env nicht gefunden."
  echo "   Kopiere .env.example → .env und fülle die Werte aus."
  exit 1
fi

COMMAND="${1:-up}"

case "$COMMAND" in
  up)
    echo "🚀 Starte Stack..."
    docker compose up -d
    echo "✅ Stack gestartet."
    ;;
  down)
    docker compose down
    ;;
  restart)
    docker compose down
    docker compose up -d
    ;;
  logs)
    docker compose logs -f "${@:2}"
    ;;
  pull)
    echo "📦 Aktualisiere Images..."
    docker compose pull
    docker compose up -d --build
    echo "✅ Fertig."
    ;;
  *)
    docker compose "$@"
    ;;
esac
