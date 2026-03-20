#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# backup.sh — AI Buddy Backup
#
# Sichert:
#   - Docker Volumes (PostgreSQL, n8n, Redis, Qdrant, Infisical DB)
#   - .env.infisical (Bootstrap-Secrets — KRITISCH)
#
# Ziel: OneDrive → automatisch in die Cloud synchronisiert
#
# Verwendung:
#   ./backup.sh           → manuelles Backup
#   Automatisch via Cron: crontab -e
#   0 3 * * * /home/naor/ai-dev-orchestrator/backup.sh >> /var/log/ai-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -e

BACKUP_ROOT="/mnt/c/Users/chgun/OneDrive/Backups/ai-buddy"
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="${BACKUP_ROOT}/${DATE}"
PROJECT_DIR="/home/naor/ai-dev-orchestrator"

# Volumes die gesichert werden
VOLUMES=(
  "ai-dev-orchestrator_postgres_data"
  "ai-dev-orchestrator_n8n_data"
  "ai-dev-orchestrator_redis_data"
  "ai-dev-orchestrator_qdrant_data"
  "ai-dev-orchestrator_infisical_db_data"
)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AI Buddy Backup — $(date '+%d.%m.%Y %H:%M')"
echo "  Ziel: ${BACKUP_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "${BACKUP_DIR}"

# ── .env.infisical sichern (KRITISCH) ────────────────────────────────────────
echo ""
echo "🔐 Sichere .env.infisical..."
cp "${PROJECT_DIR}/.env.infisical" "${BACKUP_DIR}/.env.infisical"
echo "   ✓ .env.infisical"

# ── Docker Volumes sichern ───────────────────────────────────────────────────
echo ""
echo "💾 Sichere Docker Volumes..."
for VOLUME in "${VOLUMES[@]}"; do
  SHORT_NAME=$(echo "$VOLUME" | sed 's/ai-dev-orchestrator_//')
  OUTPUT="${BACKUP_DIR}/${SHORT_NAME}.tar.gz"
  echo -n "   ${SHORT_NAME}... "
  if docker volume inspect "$VOLUME" > /dev/null 2>&1; then
    docker run --rm \
      -v "${VOLUME}:/data:ro" \
      -v "${BACKUP_DIR}:/backup" \
      alpine \
      tar czf "/backup/${SHORT_NAME}.tar.gz" -C /data . 2>/dev/null
    SIZE=$(du -sh "$OUTPUT" | cut -f1)
    echo "✓ (${SIZE})"
  else
    echo "⚠ Volume nicht gefunden, übersprungen"
  fi
done

# ── Alte Backups aufräumen (älter als 14 Tage) ───────────────────────────────
echo ""
echo "🧹 Entferne Backups älter als 14 Tage..."
find "${BACKUP_ROOT}" -maxdepth 1 -type d -mtime +14 | while read -r OLD; do
  echo "   Lösche: $(basename "$OLD")"
  rm -rf "$OLD"
done

# ── Zusammenfassung ──────────────────────────────────────────────────────────
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
BACKUP_COUNT=$(ls "${BACKUP_ROOT}" | wc -l)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Backup abgeschlossen"
echo "  Grösse:         ${TOTAL_SIZE}"
echo "  Gespeicherte Backups: ${BACKUP_COUNT}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
