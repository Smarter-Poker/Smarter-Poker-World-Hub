#!/usr/bin/env bash
# restart-hetzner.sh — Restart the Club Arena Docker container on the engine host
set -euo pipefail

# The engine host is whatever engine.smarter.poker currently resolves to.
#
# It used to be hardcoded to 178.156.160.206. That box was the one rooted in the
# 2026-08-15 incident (Club Arena commit 0eec5922c) and the engine was moved off
# it; DNS was cut over to the replacement on 2026-08-16T01:30:50Z. A hardcoded IP
# here would have restarted the WRONG, decommissioned host while production sat
# untouched — and reported success, because the health check below reads the
# public hostname rather than the box it just restarted.
#
# Resolving from DNS keeps this script correct across any future move. Override
# with HETZNER_IP=<addr> when you deliberately need to target a specific box.
CONTAINER="club-arena-engine"
ENGINE_HOST="${ENGINE_HOST:-engine.smarter.poker}"
SSH_USER="${SSH_USER:-root}"

if [ -z "${HETZNER_IP:-}" ]; then
  HETZNER_IP="$(dig +short "$ENGINE_HOST" A | grep -E '^[0-9.]+$' | head -1 || true)"
fi
if [ -z "$HETZNER_IP" ]; then
  echo "FATAL: could not resolve $ENGINE_HOST to an A record, and HETZNER_IP was not set." >&2
  exit 1
fi
REMOTE="$SSH_USER@$HETZNER_IP"
echo "=== Engine host: $ENGINE_HOST -> $HETZNER_IP ==="

echo "=== Checking Docker status on the engine host ==="
ssh -i ~/.ssh/hetzner_deploy -o ConnectTimeout=10 "$REMOTE" "docker ps -a --filter name=$CONTAINER --format '{{.Names}} {{.Status}}'" 2>&1 || {
  echo "SSH failed. Trying with StrictHostKeyChecking=no..."
  ssh -i ~/.ssh/hetzner_deploy -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$REMOTE" "docker ps -a --filter name=$CONTAINER --format '{{.Names}} {{.Status}}'"
}

echo ""
echo "=== Restarting container ==="
ssh -i ~/.ssh/hetzner_deploy -o StrictHostKeyChecking=no "$REMOTE" "docker restart $CONTAINER 2>/dev/null || {
  echo 'Container not found, starting fresh...'
  docker run -d \
    --name $CONTAINER \
    --restart always \
    -p 8080:8080 \
    --env-file /opt/club-arena/server/.env \
    $CONTAINER
}"

echo ""
echo "=== Waiting 5 seconds for startup ==="
sleep 5

echo ""
echo "=== Checking health (pinned to the box we just restarted) ==="
# Pin the resolution so this verifies the host that was actually restarted,
# rather than silently passing on whatever DNS happens to serve.
HEALTH=$(curl -sf --connect-timeout 5 --resolve "$ENGINE_HOST:443:$HETZNER_IP" \
  "https://$ENGINE_HOST/health" 2>&1 || echo "HEALTH_CHECK_FAILED")
echo "$HEALTH"

echo ""
echo "=== Docker logs (last 20 lines) ==="
ssh -i ~/.ssh/hetzner_deploy -o StrictHostKeyChecking=no "$REMOTE" "docker logs --tail 20 $CONTAINER" 2>&1

echo ""
echo "=== DONE ==="
