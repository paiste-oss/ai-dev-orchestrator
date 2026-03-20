#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh — AI Buddy Starter mit Infisical On-Premise Secrets Manager
#
# Zweiphasiger Start:
#   Phase 1: Infisical selbst hochfahren (nutzt .env.infisical für Bootstrap)
#   Phase 2: App-Secrets aus Infisical injizieren → Rest des Stacks starten
#
# ERSTES SETUP (einmalig):
#   ./start.sh init
#
# NORMALER START:
#   ./start.sh              → alles starten
#   ./start.sh down         → alles stoppen
#   ./start.sh restart      → neustart
#   ./start.sh logs [svc]   → logs
#   ./start.sh pull         → images aktualisieren + neustart
#
# ─────────────────────────────────────────────────────────────────────────────
set -e

# .env.infisical muss vorhanden sein
if [ ! -f ".env.infisical" ]; then
  echo "❌ .env.infisical nicht gefunden."
  echo "   Kopiere .env.infisical.example → .env.infisical und fülle die Werte aus."
  echo "   Dann: ./start.sh init"
  exit 1
fi

# Infisical-Token und Domain aus .env.infisical lesen
set -a; source .env.infisical; set +a

INFISICAL_DOMAIN="${INFISICAL_SITE_URL:-http://localhost:8080}"
COMMAND="${1:-up}"

# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

check_infisical_cli() {
  if ! command -v infisical &> /dev/null; then
    echo "❌ Infisical CLI nicht gefunden."
    echo "   Installation: sudo apt-get update && sudo apt-get install infisical"
    exit 1
  fi
}

wait_for_infisical() {
  echo "⏳ Warte auf Infisical..."
  for i in $(seq 1 30); do
    if curl -sf "${INFISICAL_DOMAIN}/api/status" > /dev/null 2>&1; then
      echo "✅ Infisical ist bereit."
      return 0
    fi
    sleep 2
  done
  echo "❌ Infisical antwortet nach 60s nicht. Prüfe: docker compose logs infisical"
  exit 1
}

run_with_secrets() {
  if [ -z "$INFISICAL_TOKEN" ]; then
    echo "❌ INFISICAL_TOKEN fehlt in .env.infisical"
    echo "   Erstelle einen Machine Identity Token in der Infisical Web UI:"
    echo "   ${INFISICAL_DOMAIN} → Project Settings → Machine Identities → + Add"
    echo "   Dann: INFISICAL_TOKEN=<token> in .env.infisical eintragen"
    exit 1
  fi
  check_infisical_cli
  echo "🔐 Lade App-Secrets aus Infisical (${INFISICAL_DOMAIN})..."
  infisical run \
    --silent \
    --token="$INFISICAL_TOKEN" \
    --domain="$INFISICAL_DOMAIN" \
    -- "$@"
}

# ── Kommandos ────────────────────────────────────────────────────────────────

case "$COMMAND" in

  init)
    # Erstes Setup: nur Infisical + DB + Redis starten
    echo "🚀 Starte Infisical (Phase 1 — erstes Setup)..."
    docker compose up infisical_db redis infisical -d
    wait_for_infisical
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Infisical läuft unter: ${INFISICAL_DOMAIN}"
    echo ""
    echo "  Nächste Schritte:"
    echo "  1. Öffne ${INFISICAL_DOMAIN} im Browser"
    echo "  2. Erstelle Admin-Konto + Projekt 'ai-buddy'"
    echo "  3. Füge alle Secrets aus .env.example hinzu (Umgebung: prod)"
    echo "  4. Erstelle Machine Identity:"
    echo "     Project Settings → Machine Identities → + Add"
    echo "  5. Trage den Token in .env.infisical ein: INFISICAL_TOKEN=<token>"
    echo "  6. Starte den vollen Stack: ./start.sh"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ;;

  up)
    # Erst Infisical starten (falls nicht schon läuft), dann App
    echo "🚀 Starte Stack..."
    docker compose up infisical_db redis infisical -d --wait 2>/dev/null || \
    docker compose up infisical_db redis infisical -d
    wait_for_infisical
    run_with_secrets docker compose up -d
    echo "✅ Stack vollständig gestartet."
    ;;

  down)
    docker compose down
    ;;

  restart)
    docker compose down
    exec "$0" up
    ;;

  logs)
    # Logs ohne Secrets-Injektion (nur Compose-Kontext nötig)
    docker compose logs -f "${@:2}"
    ;;

  pull)
    echo "📦 Aktualisiere Images..."
    run_with_secrets docker compose pull
    run_with_secrets docker compose up -d --build
    echo "✅ Images aktualisiert und Stack neugestartet."
    ;;

  infisical)
    # Direkter Infisical CLI Zugriff: ./start.sh infisical secrets list
    check_infisical_cli
    infisical --domain="$INFISICAL_DOMAIN" --token="$INFISICAL_TOKEN" "${@:2}"
    ;;

  *)
    run_with_secrets docker compose "$@"
    ;;

esac
