#!/usr/bin/env bash
# restart-hetzner.sh — Restart the Club Arena Docker container on Hetzner VPS
set -euo pipefail

HETZNER_IP="178.156.160.206"
SSH_USER="openclaw"
REMOTE="$SSH_USER@$HETZNER_IP"
CONTAINER="club-arena-engine"

echo "=== Checking Docker status on Hetzner ==="
ssh -i ~/.ssh/openclaw_ed25519 -o ConnectTimeout=10 "$REMOTE" "docker ps -a --filter name=$CONTAINER --format '{{.Names}} {{.Status}}'" 2>&1 || {
  echo "SSH failed. Trying with StrictHostKeyChecking=no..."
  ssh -i ~/.ssh/openclaw_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$REMOTE" "docker ps -a --filter name=$CONTAINER --format '{{.Names}} {{.Status}}'"
}

echo ""
echo "=== Restarting container ==="
ssh -i ~/.ssh/openclaw_ed25519 -o StrictHostKeyChecking=no "$REMOTE" "docker restart $CONTAINER 2>/dev/null || {
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
echo "=== Checking health ==="
HEALTH=$(curl -sf --connect-timeout 5 "https://engine.smarter.poker/health" 2>&1 || echo "HEALTH_CHECK_FAILED")
echo "$HEALTH"

echo ""
echo "=== Docker logs (last 20 lines) ==="
ssh -i ~/.ssh/openclaw_ed25519 -o StrictHostKeyChecking=no "$REMOTE" "docker logs --tail 20 $CONTAINER" 2>&1

echo ""
echo "=== DONE ==="
