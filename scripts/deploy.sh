#!/usr/bin/env bash
# Deploy BaseStriker to basestriker.xyz + api.basestriker.xyz.
#
# Usage:
#   ./scripts/deploy.sh              # frontend + backend
#   ./scripts/deploy.sh --front-only
#   ./scripts/deploy.sh --back-only
#
# Mirrors classic_games/cosmic-seeker pattern: build locally, rsync,
# restart systemd. Server is Hetzner Ubuntu 24.04 with Node 20 + Nginx
# + Certbot pre-installed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="root@157.180.45.83"
REMOTE_ROOT="/var/www/basestriker"

do_front=1
do_back=1
for arg in "$@"; do
  case "$arg" in
    --front-only) do_front=1; do_back=0 ;;
    --back-only)  do_front=0; do_back=1 ;;
    --help|-h)    grep '^#' "$0" | head -12; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if (( do_front )); then
  echo "==> building frontend"
  (cd "$ROOT" && npm run build)
  echo "==> rsync dist/ → $SERVER:$REMOTE_ROOT/frontend/dist/"
  rsync -avz --delete --exclude='.DS_Store' "$ROOT/dist/" "$SERVER:$REMOTE_ROOT/frontend/dist/"
fi

if (( do_back )); then
  echo "==> building backend (tsc)"
  (cd "$ROOT/backend" && npm run build)
  echo "==> rsync backend → $SERVER:$REMOTE_ROOT/backend/"
  rsync -avz --delete \
    --exclude='node_modules' --exclude='*.db' --exclude='*.db-*' \
    --exclude='.env' --exclude='*.bak' \
    --exclude='src' --exclude='tsconfig.json' \
    "$ROOT/backend/dist" \
    "$ROOT/backend/package.json" \
    "$ROOT/backend/package-lock.json" \
    "$SERVER:$REMOTE_ROOT/backend/"
  echo "==> reinstalling prod deps + restarting service"
  ssh "$SERVER" "
    cd $REMOTE_ROOT/backend &&
    npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3 &&
    chown -R www-data:www-data $REMOTE_ROOT &&
    systemctl restart basestriker-backend.service &&
    sleep 1 &&
    systemctl is-active basestriker-backend.service
  "
fi

echo "==> verify"
curl -fsS https://api.basestriker.xyz/api/health 2>&1 | head -1 && echo
echo "==> done."
