#!/usr/bin/env bash
# deploy-transcode.sh — deploy the HEVC→H.264 transcode worker to Hetzner
#
# Usage:  bash scripts/deploy-transcode.sh
#
# Prerequisites:
#   - SSH key: ~/.ssh/openclaw_ed25519 (same as deploy-openclaw.sh)
#   - macOS Keychain: smarter-poker/openclaw-server-ip
#   - .env.local with SUPABASE_SERVICE_ROLE_KEY
#
# What it does:
#   1. Reads the Hetzner IP from macOS Keychain
#   2. Creates /opt/smarter-poker/transcode-worker/ on the VM
#   3. Uploads index.js + package.json
#   4. Installs npm deps
#   5. Writes the environment file with the service role key
#   6. Installs + starts the systemd service
#   7. Verifies the worker started cleanly

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$SCRIPT_DIR/transcode-worker"
SSH_KEY="$HOME/.ssh/openclaw_ed25519"
REMOTE_DIR="/opt/smarter-poker/transcode-worker"
SERVICE_NAME="sp-transcode"
SERVICE_FILE="sp-transcode.service"

# ─── Prereq checks ────────────────────────────────────────────────────────────

log() { echo "[deploy-transcode] $*"; }
die() { echo "[deploy-transcode] ERROR: $*" >&2; exit "${2:-1}"; }

[ -f "$SSH_KEY" ] || die "SSH key missing at $SSH_KEY" 1
[ -f "$WORKER_DIR/index.js" ] || die "Worker index.js missing at $WORKER_DIR/index.js" 1
[ -f "$WORKER_DIR/package.json" ] || die "Worker package.json missing at $WORKER_DIR/package.json" 1

SERVER_IP=$(security find-generic-password -a smarter-poker -s openclaw-server-ip -w 2>/dev/null) \
  || die "Keychain entry 'smarter-poker/openclaw-server-ip' missing" 1

# Read the service role key from .env.local
SERVICE_ROLE_KEY=""
if [ -f "$REPO_ROOT/.env.local" ]; then
  SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO_ROOT/.env.local" | sed 's/^SUPABASE_SERVICE_ROLE_KEY=//' | sed 's/^"//' | sed 's/"$//')
fi
[ -n "$SERVICE_ROLE_KEY" ] || die "SUPABASE_SERVICE_ROLE_KEY not found in .env.local" 1

log "Target: $SERVER_IP"
log "Worker dir: $WORKER_DIR"

# ─── 1. Create remote directory ───────────────────────────────────────────────

log "Creating remote directory..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "root@$SERVER_IP" "
  mkdir -p $REMOTE_DIR
  id openclaw >/dev/null 2>&1 || useradd -r -s /bin/false openclaw
  chown -R openclaw:openclaw /opt/smarter-poker
"

# ─── 2. Upload worker files ───────────────────────────────────────────────────

log "Uploading worker files..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
  "$WORKER_DIR/index.js" "$WORKER_DIR/package.json" \
  "root@$SERVER_IP:$REMOTE_DIR/"

# Upload systemd service file
scp -i "$SSH_KEY" "$WORKER_DIR/$SERVICE_FILE" \
  "root@$SERVER_IP:/etc/systemd/system/$SERVICE_FILE"

# ─── 3. Install npm deps + set permissions ────────────────────────────────────

log "Installing npm dependencies..."
ssh -i "$SSH_KEY" "root@$SERVER_IP" "
  cd $REMOTE_DIR
  npm install --production 2>&1 | tail -5
  chown -R openclaw:openclaw $REMOTE_DIR
"

# ─── 4. Write environment file ────────────────────────────────────────────────

log "Writing environment file..."
ssh -i "$SSH_KEY" "root@$SERVER_IP" "
  cat > /etc/sp-transcode.env << 'ENVEOF'
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
ENVEOF
  chmod 600 /etc/sp-transcode.env
  chown root:openclaw /etc/sp-transcode.env
"

# ─── 5. Enable + start systemd service ────────────────────────────────────────

RESTART_TS=$(date -u +"%Y-%m-%d %H:%M:%S")
log "Starting systemd service..."
ssh -i "$SSH_KEY" "root@$SERVER_IP" "
  systemctl daemon-reload
  systemctl enable $SERVICE_NAME
  systemctl restart $SERVICE_NAME
  sleep 5
"

# ─── 6. Verify ────────────────────────────────────────────────────────────────

STATE=$(ssh -i "$SSH_KEY" "root@$SERVER_IP" "systemctl is-active $SERVICE_NAME" || echo "failed")
if [ "$STATE" != "active" ]; then
  ssh -i "$SSH_KEY" "root@$SERVER_IP" "journalctl -u $SERVICE_NAME -n 40 --no-pager"
  die "systemctl is-active = $STATE (expected: active)" 3
fi
log "systemctl is-active: $STATE"

# Check startup log
log "Recent logs:"
ssh -i "$SSH_KEY" "root@$SERVER_IP" "journalctl -u $SERVICE_NAME -n 20 --no-pager"

# ─── 7. Success ───────────────────────────────────────────────────────────────

log ""
log "✓ Transcode worker deployed and running!"
log ""
log "  Monitor:    ssh -i $SSH_KEY root@$SERVER_IP 'journalctl -u $SERVICE_NAME -f'"
log "  Restart:    ssh -i $SSH_KEY root@$SERVER_IP 'systemctl restart $SERVICE_NAME'"
log "  Stop:       ssh -i $SSH_KEY root@$SERVER_IP 'systemctl stop $SERVICE_NAME'"
log "  Status:     ssh -i $SSH_KEY root@$SERVER_IP 'systemctl status $SERVICE_NAME'"
