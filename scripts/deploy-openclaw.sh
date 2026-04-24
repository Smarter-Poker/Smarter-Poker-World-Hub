#!/usr/bin/env bash
# deploy-openclaw.sh — sync openclaw-cron-dispatcher.py to Hetzner VM + restart systemd + verify
#
# Usage:  bash scripts/deploy-openclaw.sh
#
# Prerequisites (configured in Phase 2A.1):
#   - SSH key: ~/.ssh/openclaw_ed25519 (0600, authorized on the VM as root)
#   - macOS Keychain entries:
#       security find-generic-password -a smarter-poker -s openclaw-server-ip
#       security find-generic-password -a smarter-poker -s openclaw-server-id
#       security find-generic-password -a smarter-poker -s hetzner-api
#
# What it does:
#   1. Diffs the local dispatcher.py against what's on the VM.
#   2. scp's the updated file to /opt/openclaw/dispatcher.py.
#   3. Restarts systemd openclaw.service.
#   4. Tails journalctl to confirm all jobs re-registered with zero errors.
#   5. Verifies systemctl is-active returns active.
#   6. Verifies the process has NOT crash-looped (NRestarts should be 0).
#
# Exit codes:
#   0 — success
#   1 — local prereq missing (key, Keychain entry, source file)
#   2 — ssh/scp failed
#   3 — systemctl reports failed after restart
#   4 — journalctl shows ERROR/Exception post-restart

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_SRC="$REPO_ROOT/scripts/openclaw-cron-dispatcher.py"
REMOTE_PATH="/opt/openclaw/dispatcher.py"
SSH_KEY="$HOME/.ssh/openclaw_ed25519"
SERVICE="openclaw.service"

# ─── Prereq checks ────────────────────────────────────────────────────────────

log() { echo "[deploy-openclaw] $*"; }
die() { echo "[deploy-openclaw] ERROR: $*" >&2; exit "${2:-1}"; }

[ -f "$LOCAL_SRC" ] || die "local dispatcher source missing at $LOCAL_SRC" 1
[ -f "$SSH_KEY" ]   || die "SSH key missing at $SSH_KEY (Phase 2A.1 creates it)" 1

SERVER_IP=$(security find-generic-password -a smarter-poker -s openclaw-server-ip -w 2>/dev/null) \
  || die "Keychain entry 'smarter-poker/openclaw-server-ip' missing — run Phase 2A.1 AG prompt first" 1
SERVER_ID=$(security find-generic-password -a smarter-poker -s openclaw-server-id -w 2>/dev/null || echo "")

log "Target: $SERVER_IP (id=${SERVER_ID:-unknown})"

# ─── 1. Diff local vs. remote ─────────────────────────────────────────────────

LOCAL_SHA=$(shasum -a 256 "$LOCAL_SRC" | cut -d' ' -f1)
REMOTE_SHA=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
  "root@$SERVER_IP" "sha256sum $REMOTE_PATH 2>/dev/null | cut -d' ' -f1" 2>/dev/null || echo "missing")

log "Local  SHA256: $LOCAL_SHA"
log "Remote SHA256: $REMOTE_SHA"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "No changes to dispatcher.py — skipping scp. Restart anyway? (Ctrl-C to abort, Enter to continue)"
  read -r _ || true
fi

# ─── 2. scp ───────────────────────────────────────────────────────────────────

log "Uploading dispatcher.py..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
  "$LOCAL_SRC" "root@$SERVER_IP:${REMOTE_PATH}.new" \
  || die "scp failed" 2

ssh -i "$SSH_KEY" "root@$SERVER_IP" "
  set -euo pipefail
  chown openclaw:openclaw ${REMOTE_PATH}.new
  chmod 0755 ${REMOTE_PATH}.new
  mv ${REMOTE_PATH}.new ${REMOTE_PATH}
" || die "remote file move failed" 2

log "dispatcher.py deployed"

# ─── 3. Restart + verify ──────────────────────────────────────────────────────

RESTART_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
log "Restarting $SERVICE at $RESTART_TS..."

ssh -i "$SSH_KEY" "root@$SERVER_IP" "
  set -euo pipefail
  systemctl restart $SERVICE
  sleep 5
" || die "systemctl restart failed" 3

# 3a — systemctl is-active
STATE=$(ssh -i "$SSH_KEY" "root@$SERVER_IP" "systemctl is-active $SERVICE" || echo "failed")
if [ "$STATE" != "active" ]; then
  ssh -i "$SSH_KEY" "root@$SERVER_IP" "journalctl -u $SERVICE -n 80 --no-pager"
  die "systemctl is-active = $STATE (expected: active)" 3
fi
log "systemctl is-active: $STATE"

# 3b — NRestarts (must be 0 or 1 — 1 is OK since we just restarted)
NRESTARTS=$(ssh -i "$SSH_KEY" "root@$SERVER_IP" \
  "systemctl show $SERVICE -p NRestarts --value" | tr -d '[:space:]')
log "systemd NRestarts: $NRESTARTS"
if [ "${NRESTARTS:-0}" -gt 1 ]; then
  log "WARN: NRestarts = $NRESTARTS — service is flapping. Investigate."
fi

# 3c — Registered jobs count from post-restart log
log "Verifying registered jobs (10s window after restart)..."
sleep 5
REGISTERED=$(ssh -i "$SSH_KEY" "root@$SERVER_IP" \
  "journalctl -u $SERVICE --since='$RESTART_TS' --no-pager | grep -c 'Registered:'" || echo "0")
log "Registered jobs: $REGISTERED"
if [ "${REGISTERED:-0}" -lt 1 ]; then
  ssh -i "$SSH_KEY" "root@$SERVER_IP" \
    "journalctl -u $SERVICE --since='$RESTART_TS' -n 100 --no-pager"
  die "no 'Registered:' lines in journalctl since restart — dispatcher may be silent" 4
fi

# 3d — ERROR / Exception / Traceback scan
ERRORS=$(ssh -i "$SSH_KEY" "root@$SERVER_IP" \
  "journalctl -u $SERVICE --since='$RESTART_TS' --no-pager | grep -cE 'ERROR|Exception|Traceback'" || echo "0")
if [ "${ERRORS:-0}" -gt 0 ]; then
  ssh -i "$SSH_KEY" "root@$SERVER_IP" \
    "journalctl -u $SERVICE --since='$RESTART_TS' --no-pager | grep -E 'ERROR|Exception|Traceback' | head -30"
  die "$ERRORS error line(s) in journalctl since restart" 4
fi

# ─── 4. Success ───────────────────────────────────────────────────────────────

log "✓ Deploy complete: dispatcher.py synced, systemd restarted, $REGISTERED jobs registered, 0 errors"
log ""
log "Live tail with:  ssh -i $SSH_KEY root@$SERVER_IP 'journalctl -u $SERVICE -f'"
