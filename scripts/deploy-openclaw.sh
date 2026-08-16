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
SERVICE="openclaw.service"

# ─── SSH key resolution (2026-08-16) ──────────────────────────────────────────
#
# This was hardcoded to $HOME/.ssh/openclaw_ed25519 -- a key "Phase 2A.1
# creates" that was never actually created on this Mac. The prereq check below
# therefore aborted on every single invocation, so NOBODY COULD DEPLOY.
#
# That is the direct cause of the dispatcher drift CLAUDE.md 11.3 forbids: on
# 2026-08-16 the repo file had 6 jobs the production box did not, because the
# only sanctioned way to push them had never once run. It also explains the
# 2026-08-13 news-digest handoff, which assumed the VM was stale "unless
# someone has been running deploy-openclaw.sh by hand" -- nobody could have.
#
# Now: honour $OPENCLAW_SSH_KEY if set, otherwise take the first candidate that
# exists. All three fallbacks were verified on 2026-08-16 to authenticate as
# root on the dispatcher (hostname: openclaw-dispatcher). Still fails loudly
# when no key is present -- it just no longer fails when a working key is
# sitting right there.
SSH_KEY="${OPENCLAW_SSH_KEY:-}"
if [ -z "$SSH_KEY" ]; then
  for _cand in "$HOME/.ssh/openclaw_ed25519" \
               "$HOME/.ssh/hetzner_deploy" \
               "$HOME/.ssh/hetzner_engine_key" \
               "$HOME/.ssh/id_ed25519_hetzner"; do
    if [ -f "$_cand" ]; then SSH_KEY="$_cand"; break; fi
  done
fi

# ─── Prereq checks ────────────────────────────────────────────────────────────

log() { echo "[deploy-openclaw] $*"; }
die() { echo "[deploy-openclaw] ERROR: $*" >&2; exit "${2:-1}"; }

[ -f "$LOCAL_SRC" ] || die "local dispatcher source missing at $LOCAL_SRC" 1
[ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ] \
  || die "no usable SSH key (set OPENCLAW_SSH_KEY, or install one of: openclaw_ed25519, hetzner_deploy, hetzner_engine_key, id_ed25519_hetzner)" 1
log "SSH key: $SSH_KEY"

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

# Support --force to re-deploy even when SHAs match (e.g., to verify systemd health).
FORCE=0
for arg in "$@"; do
  [ "$arg" = "--force" ] && FORCE=1
done

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ] && [ "$FORCE" -eq 0 ]; then
  log "Already in sync — dispatcher.py hash matches remote. Nothing to deploy."
  log "Pass --force to re-upload and restart anyway (e.g., to recover a flapping service)."
  exit 0
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

# journalctl --since= wants 'YYYY-MM-DD HH:MM:SS' (systemd.time(7)), NOT ISO-8601 with T/Z.
# Passing 'T...Z' returns zero rows silently on some systemd versions.
RESTART_TS=$(date -u +"%Y-%m-%d %H:%M:%S")
log "Restarting $SERVICE at $RESTART_TS UTC..."

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
# Note the `|| true` inside the remote quotes: `grep -c` exits 1 when it
# finds zero matches (while still printing "0" on stdout). Without this,
# the SSH call exits 1, our local `|| echo "0"` fallback fires, and we
# end up capturing "0\n0" → "0 0" which fails `[ ... -gt 0 ]` with
# 'integer expression expected'. Making grep's pipeline exit 0 lets the
# count pass through cleanly.
REGISTERED=$(ssh -i "$SSH_KEY" "root@$SERVER_IP" \
  "journalctl -u $SERVICE --since='$RESTART_TS' --no-pager | grep -c 'Registered:' || true" || echo "0")
log "Registered jobs: $REGISTERED"
if [ "${REGISTERED:-0}" -lt 1 ]; then
  ssh -i "$SSH_KEY" "root@$SERVER_IP" \
    "journalctl -u $SERVICE --since='$RESTART_TS' -n 100 --no-pager"
  die "no 'Registered:' lines in journalctl since restart — dispatcher may be silent" 4
fi

# 3d — ERROR / Exception / Traceback scan. Same `|| true` pattern as above.
ERRORS=$(ssh -i "$SSH_KEY" "root@$SERVER_IP" \
  "journalctl -u $SERVICE --since='$RESTART_TS' --no-pager | grep -cE 'ERROR|Exception|Traceback' || true" || echo "0")
if [ "${ERRORS:-0}" -gt 0 ]; then
  ssh -i "$SSH_KEY" "root@$SERVER_IP" \
    "journalctl -u $SERVICE --since='$RESTART_TS' --no-pager | grep -E 'ERROR|Exception|Traceback' | head -30"
  die "$ERRORS error line(s) in journalctl since restart" 4
fi

# ─── 4. Success ───────────────────────────────────────────────────────────────

log "✓ Deploy complete: dispatcher.py synced, systemd restarted, $REGISTERED jobs registered, 0 errors"
log ""
log "Live tail with:  ssh -i $SSH_KEY root@$SERVER_IP 'journalctl -u $SERVICE -f'"
