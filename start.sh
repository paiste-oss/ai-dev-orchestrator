#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh — AI Buddy Starter via Infisical Secrets Manager
#
# Infisical injiziert alle Secrets in die Prozessumgebung, danach startet
# Docker Compose und liest die Variablen via ${VAR} Interpolation.
#
# Voraussetzungen:
#   1. Infisical CLI installiert: https://infisical.com/docs/cli/overview
#   2. Einmalig einloggen: infisical login
#   3. Projekt-Konfiguration in .infisical.json (bereits vorhanden)
#
# Verwendung:
#   ./start.sh              → docker-compose up -d (detached)
#   ./start.sh up           → docker-compose up -d
#   ./start.sh down         → docker-compose down
#   ./start.sh logs         → docker-compose logs -f
#   ./start.sh restart      → docker-compose restart
#   ./start.sh pull         → docker-compose pull + up --build
#   ./start.sh <anything>   → docker-compose <anything>
#
# CI/CD (ohne Browser-Login):
#   INFISICAL_TOKEN=<machine-identity-token> ./start.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

COMMAND=${1:-up}

# Prüfen ob infisical installiert ist
if ! command -v infisical &> /dev/null; then
  echo "❌ Infisical CLI nicht gefunden."
  echo "   Installation: curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo bash && sudo apt install infisical"
  echo "   Oder: brew install infisical/get-cli/infisical"
  exit 1
fi

echo "🔐 Lade Secrets aus Infisical..."

case "$COMMAND" in
  up)
    infisical run -- docker compose up -d
    echo "✅ Stack gestartet."
    ;;
  down)
    infisical run -- docker compose down
    ;;
  logs)
    infisical run -- docker compose logs -f "${@:2}"
    ;;
  pull)
    infisical run -- docker compose pull
    infisical run -- docker compose up -d --build
    echo "✅ Images aktualisiert und Stack neugestartet."
    ;;
  *)
    infisical run -- docker compose "$@"
    ;;
esac
