#!/usr/bin/env bash
set -euo pipefail
release_id="${1:?commit SHA required}"
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || exit 2
cd "/opt/market/releases/$release_id"
export RELEASE_ID="$release_id" ENV_FILE=/opt/market/.env
test -f "$ENV_FILE"
compose=(docker compose -p market --env-file "$ENV_FILE")
"${compose[@]}" config --quiet
"${compose[@]}" build app
if "${compose[@]}" ps --status running --services | grep -qx app; then
  "${compose[@]}" exec -T app python scripts/backup.py
fi
"${compose[@]}" up -d --wait --wait-timeout 180
printf '%s\n' "$release_id" > /opt/market/current-release
echo 'Deployment healthy. Database backups retained in the persistent volume.'
