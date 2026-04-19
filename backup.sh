#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# backup.sh — AI Buddy Backup (VPS)
#
# Sichert:
#   - PostgreSQL  → pg_dump (sauber, transaktionssicher)
#   - Docker Volumes: n8n, Qdrant, Radicale
#   - .env (Secrets)
#
# Ziel: Infomaniak S3 Bucket "baddi-backups" (Firmenbucket, kein User-Bucket)
# Retention: 30 Tage (ältere Backups werden automatisch gelöscht)
#
# Verwendung (VPS):
#   bash /mnt/data/app/backup.sh
#   Automatisch via Cron auf VPS:
#   0 3 * * * bash /mnt/data/app/backup.sh >> /var/log/ai-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Konfiguration ─────────────────────────────────────────────────────────────
PROJECT_DIR="/mnt/data/app"
TEMP_DIR="/tmp/ai-backup-$(date +%s)"
DATE=$(date +%Y-%m-%d_%H-%M)
S3_BACKUP_BUCKET="baddi-backups"
RETENTION_DAYS=30

# .env laden für DB- und S3-Credentials
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Z_][A-Z0-9_]*=' "${PROJECT_DIR}/.env")
  set +a
fi

# Pflicht-Variablen prüfen
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD fehlt in .env}"
: "${S3_ENDPOINT:?S3_ENDPOINT fehlt in .env}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY fehlt in .env}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY fehlt in .env}"

# Docker Compose Projekt-Prefix (Verzeichnisname = "app")
COMPOSE_PROJECT="app"

VOLUMES=(
  "n8n_data"
  "qdrant_data"
  "radicale_data"
)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AI Buddy Backup — $(date '+%d.%m.%Y %H:%M')"
echo "  Temp: ${TEMP_DIR}"
echo "  S3: s3://${S3_BACKUP_BUCKET}/${DATE}/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "${TEMP_DIR}"

# ── .env sichern ─────────────────────────────────────────────────────────────
echo ""
echo "🔐 Sichere .env..."
cp "${PROJECT_DIR}/.env" "${TEMP_DIR}/env.bak"
echo "   ✓ .env"

# ── PostgreSQL Dump ───────────────────────────────────────────────────────────
echo ""
echo "🗄️  PostgreSQL Dump..."
docker exec ai_postgres pg_dump \
  -U aibuddy \
  -d aibuddy \
  --no-password \
  --format=custom \
  --compress=9 \
  > "${TEMP_DIR}/postgres.dump"
PG_SIZE=$(du -sh "${TEMP_DIR}/postgres.dump" | cut -f1)
echo "   ✓ postgres.dump (${PG_SIZE})"

# ── Docker Volumes ────────────────────────────────────────────────────────────
echo ""
echo "💾 Sichere Docker Volumes..."
for VOL in "${VOLUMES[@]}"; do
  FULL_NAME="${COMPOSE_PROJECT}_${VOL}"
  OUTPUT="${TEMP_DIR}/${VOL}.tar.gz"
  echo -n "   ${VOL}... "
  if docker volume inspect "${FULL_NAME}" > /dev/null 2>&1; then
    docker run --rm \
      -v "${FULL_NAME}:/data:ro" \
      -v "${TEMP_DIR}:/backup" \
      alpine \
      tar czf "/backup/${VOL}.tar.gz" -C /data . 2>/dev/null
    SIZE=$(du -sh "${OUTPUT}" | cut -f1)
    echo "✓ (${SIZE})"
  else
    echo "⚠ Volume ${FULL_NAME} nicht gefunden, übersprungen"
  fi
done

# ── S3 Upload ─────────────────────────────────────────────────────────────────
echo ""
echo "☁️  Lade nach S3 hoch..."
# Backup-Verzeichnis in den Container mounten und Script ausführen
docker run --rm \
  -v "${TEMP_DIR}:/backup:ro" \
  -v "${PROJECT_DIR}/scripts:/scripts:ro" \
  -e S3_ENDPOINT="${S3_ENDPOINT}" \
  -e S3_ACCESS_KEY="${S3_ACCESS_KEY}" \
  -e S3_SECRET_KEY="${S3_SECRET_KEY}" \
  --entrypoint python3 \
  $(docker inspect --format='{{.Config.Image}}' ai_backend) \
  /scripts/backup_s3.py upload /backup "${DATE}"

# ── Alte S3-Backups löschen (> 30 Tage) ──────────────────────────────────────
echo ""
echo "🧹 Entferne S3-Backups älter als ${RETENTION_DAYS} Tage..."
docker run --rm \
  -v "${PROJECT_DIR}/scripts:/scripts:ro" \
  -e S3_ENDPOINT="${S3_ENDPOINT}" \
  -e S3_ACCESS_KEY="${S3_ACCESS_KEY}" \
  -e S3_SECRET_KEY="${S3_SECRET_KEY}" \
  --entrypoint python3 \
  $(docker inspect --format='{{.Config.Image}}' ai_backend) \
  /scripts/backup_s3.py cleanup "${RETENTION_DAYS}"

# ── Temp aufräumen ────────────────────────────────────────────────────────────
rm -rf "${TEMP_DIR}"
echo ""

# ── Zusammenfassung ───────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Backup abgeschlossen: ${DATE}"
echo "  S3: s3://${S3_BACKUP_BUCKET}/${DATE}/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
