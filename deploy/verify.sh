#!/usr/bin/env bash
set -euo pipefail
release_id="${1:?commit SHA required}"
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || exit 2
cd "/opt/market/releases/$release_id"
export RELEASE_ID="$release_id" ENV_FILE=/opt/market/.env
compose=(docker compose -p market --env-file "$ENV_FILE")
if test -f /opt/market/admin-mode && test "$(cat /opt/market/admin-mode)" = tunnel; then
  export DOMAIN=localhost
  compose+=(-f compose.yaml -f compose.tunnel.yaml)
fi
test "$(cat /opt/market/current-release)" = "$release_id"
"${compose[@]}" ps
"${compose[@]}" exec -T app python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=10)'
