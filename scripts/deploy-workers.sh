#!/usr/bin/env bash
# deploy-workers.sh — Sync latest worker code to Hetzner worker VMs + restart services
#
# Usage:
#   bash scripts/deploy-workers.sh             # yt-transcode-worker only (default)
#   bash scripts/deploy-workers.sh --all       # yt-transcode-worker + transcode-worker
#   bash scripts/deploy-workers.sh --dry-run   # diff only, no scp/restart
#
# Prerequisites (configured in Phase 2B.1):
#   - SSH key: ~/.ssh/openclaw_ed25519 (0600, authorized on both VMs as openclaw)
#   - macOS Keychain entries:
#       security find-generic-password -a smarter-poker -s reels-transcode-worker-ip
#       security find-generic-password -a smarter-poker -s openclaw-server-ip
#   - If Keychain entries are missing, the script falls back to env vars:
#       REELS_WORKER_IP   (reels-transcode-worker, ash, 5.161.49.206)
#       OPENCLAW_IP       (workers-dispatcher,  fsn1, 178.104.180.220)
#
# VMs:
#   reels-transcode-worker  (Hetzner 128782737, ash)   — sp-yt-transcode.service
#   workers-dispatcher      (Hetzner 127930016, fsn1)  — sp-transcode.service (HEVC)
#
# Exit codes:  0 success | 1 prereq missing | 2 scp/ssh failed | 3 service failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SSH_KEY=""
YT_SRC="$REPO_ROOT/scripts/yt-transcode-worker/index.js"
HEVC_SRC="$REPO_ROOT/scripts/transcode-worker/index.js"

DRY_RUN=false
DEPLOY_ALL=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --all)     DEPLOY_ALL=true ;;
  esac
done

log()  { echo "[deploy-workers] $*"; }
die()  { echo "[deploy-workers] ERROR: $*" >&2; exit "${2:-1}"; }
warn() { echo "[deploy-workers] WARN: $*" >&2; }

# ─── Prereq checks ────────────────────────────────────────────────────────────

[ -f "$YT_SRC" ]  || die "yt-transcode-worker/index.js missing at $YT_SRC" 1

get_ip() {
  local service="$1" fallback="$2"
  local ip
  ip=$(security find-generic-password -a smarter-poker -s "$service" -w 2>/dev/null || echo "")
  if [ -z "$ip" ]; then
    warn "Keychain entry 'smarter-poker/$service' missing — falling back to env var / hardcoded default"
    ip="$fallback"
  fi
  echo "$ip"
}

REELS_IP=$(get_ip reels-transcode-worker-ip "${REELS_WORKER_IP:-5.161.49.206}")
OPENCLAW_IP=$(get_ip openclaw-server-ip "${OPENCLAW_IP:-178.104.180.220}")

# Auto-detect working SSH key + user.
#
# 2026-08-15: this probe never matched, which is why "SSH to Hetzner is
# broken" has been assumed since 2026-05-17. Two reasons, both here:
#   1. It probed user `openclaw`. The key that is actually authorised on
#      reels-transcode-worker is authorised for `root`
#      (~/.ssh/hetzner_deploy and ~/.ssh/id_ed25519 both work as root;
#      every key fails as openclaw).
#   2. ConnectTimeout=3. The box runs ffmpeg at preset=slow with
#      concurrency 3 and sits at load ~18, so sshd routinely needs longer
#      than 3s just to send its banner. The probe timed out on a host that
#      was up and reachable.
# Both are fixed below: try root first, and allow 20s.
SSH_USER=""
for key in "$HOME/.ssh/hetzner_deploy" "$HOME/.ssh/id_ed25519" "$HOME/.ssh/openclaw_ed25519" "$HOME/.ssh/workers_ed25519"; do
  [ -f "$key" ] || continue
  for user in root openclaw; do
    if ssh -i "$key" -o ConnectTimeout=20 -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o ChallengeResponseAuthentication=no -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$user@$REELS_IP" "uname" &>/dev/null; then
      SSH_KEY="$key"
      SSH_USER="$user"
      break 2
    fi
  done
done

if [ -z "$SSH_KEY" ]; then
  # Fallback
  SSH_KEY="$HOME/.ssh/openclaw_ed25519"
fi
SSH_USER="${SSH_USER:-root}"

[ -f "$SSH_KEY" ] || die "SSH key missing at $SSH_KEY" 1

log "reels-transcode-worker : $REELS_IP (ash)"
log "workers-dispatcher     : $OPENCLAW_IP (fsn1)"
log "using SSH key          : $SSH_KEY (user: $SSH_USER)"
$DRY_RUN && log "DRY RUN — no files will be transferred or services restarted"

ssh_cmd() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25 "$SSH_USER@$1" "${@:2}"; }
scp_file() {
  local src="$1" dst_host="$2" dst_path="$3"
  if $DRY_RUN; then
    LOCAL_SHA=$(sha256sum "$src" | cut -d' ' -f1)
    REMOTE_SHA=$(ssh_cmd "$dst_host" "sha256sum $dst_path 2>/dev/null | cut -d' ' -f1" 2>/dev/null || echo "missing")
    log "  local  SHA256: $LOCAL_SHA"
    log "  remote SHA256: $REMOTE_SHA"
    [ "$LOCAL_SHA" = "$REMOTE_SHA" ] && log "  (no change)" || log "  (would update)"
    return 0
  fi
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25 "$src" "$SSH_USER@${dst_host}:${dst_path}" \
    || die "scp to $dst_host failed" 2
}

# ─── Deploy yt-transcode-worker (reels-transcode-worker VM) ───────────────────

REMOTE_YT_PATH="/opt/smarter-poker/yt-transcode-worker/index.js"
log "Deploying yt-transcode-worker/index.js → $REELS_IP:$REMOTE_YT_PATH"
scp_file "$YT_SRC" "$REELS_IP" "$REMOTE_YT_PATH"

if ! $DRY_RUN; then
  log "Restarting sp-yt-transcode.service …"
  ssh_cmd "$REELS_IP" "sudo systemctl restart sp-yt-transcode" \
    || die "systemctl restart failed on $REELS_IP" 3
  sleep 3
  STATUS=$(ssh_cmd "$REELS_IP" "systemctl is-active sp-yt-transcode" 2>/dev/null || echo "unknown")
  [ "$STATUS" = "active" ] || die "sp-yt-transcode is $STATUS after restart (expected: active)" 3
  log "sp-yt-transcode.service: $STATUS"
  log "Recent logs:"
  ssh_cmd "$REELS_IP" "sudo journalctl -u sp-yt-transcode -n 15 --no-pager" 2>/dev/null || true
fi

# ─── Deploy transcode-worker (openclaw VM) — only with --all ──────────────────

if $DEPLOY_ALL; then
  REMOTE_HEVC_PATH="/opt/smarter-poker/transcode-worker/index.js"
  log "Deploying transcode-worker/index.js → $OPENCLAW_IP:$REMOTE_HEVC_PATH"
  scp_file "$HEVC_SRC" "$OPENCLAW_IP" "$REMOTE_HEVC_PATH"
  if ! $DRY_RUN; then
    log "Restarting sp-transcode.service …"
    ssh_cmd "$OPENCLAW_IP" "sudo systemctl restart sp-transcode" \
      || die "systemctl restart failed on $OPENCLAW_IP" 3
    sleep 3
    STATUS=$(ssh_cmd "$OPENCLAW_IP" "systemctl is-active sp-transcode" 2>/dev/null || echo "unknown")
    [ "$STATUS" = "active" ] || die "sp-transcode is $STATUS after restart" 3
    log "sp-transcode.service: $STATUS"
  fi
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

$DRY_RUN && log "Dry run complete. Re-run without --dry-run to apply." && exit 0
log "Workers deploy complete."
log "Monitor: ssh -i $SSH_KEY $SSH_USER@$REELS_IP 'sudo journalctl -u sp-yt-transcode -f'"
