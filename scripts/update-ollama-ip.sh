#!/bin/bash
# Aktualisiert OLLAMA_BASE_URL in .env mit der aktuellen WSL-IP.
# Wird automatisch beim WSL-Start ausgeführt (via systemd).

set -e

ENV_FILE="$(dirname "$0")/../.env"
WSL_IP=$(ip addr show eth0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1)

if [ -z "$WSL_IP" ]; then
  echo "FEHLER: WSL-IP konnte nicht ermittelt werden." >&2
  exit 1
fi

NEW_URL="http://${WSL_IP}:11434"

# .env aktualisieren (nur OLLAMA_BASE_URL-Zeile)
sed -i "s|^OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=${NEW_URL}|" "$ENV_FILE"

echo "OLLAMA_BASE_URL gesetzt auf ${NEW_URL}"
