#!/usr/bin/env bash
# ============================================================
# refresh-cookies-local.sh
# AUTONOMOUS YouTube cookie refresh — runs on your Mac every
# 3 hours via launchd. Harvests fresh authenticated cookies,
# deploys them to Hetzner, restarts the worker, and re-queues
# all failed cookie-auth jobs.
#
# WHY THIS RUNS ON YOUR MAC (not Hetzner):
#   Google blocks automated login from datacenter IPs.
#   Your Mac's residential IP passes Google's trust checks.
#   Cookies are then SCP'd to the Hetzner worker.
#
# MANUAL USE:
#   ./scripts/yt-transcode-worker/refresh-cookies-local.sh
#
# AUTOMATIC (launchd — installed separately):
#   ~/Library/LaunchAgents/com.smarter-poker.yt-cookie-refresh.plist
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../.."
SERVER="openclaw@5.161.49.206"
SSH_KEY="$HOME/.ssh/id_ed25519"
REMOTE_PATH="/opt/smarter-poker/yt-transcode-worker/cookies.txt"
LOCAL_COOKIES="$SCRIPT_DIR/cookies.txt"
LOG_FILE="$SCRIPT_DIR/cookie-refresh.log"

# ── Logging ────────────────────────────────────────────────────
log() {
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[$ts] $1" | tee -a "$LOG_FILE"
}

log "=== Smarter Poker — Autonomous Cookie Refresh ==="

# ── Load credentials from .env.local if not in env ────────────
if [[ -z "${YT_GOOGLE_EMAIL:-}" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.local"
  if [[ -f "$ENV_FILE" ]]; then
    export YT_GOOGLE_EMAIL=$(grep YT_GOOGLE_EMAIL "$ENV_FILE" | cut -d= -f2-)
    export YT_GOOGLE_PASS=$(grep YT_GOOGLE_PASS "$ENV_FILE" | cut -d= -f2-)
    log "  Loaded credentials from .env.local"
  fi
fi

if [[ -z "${YT_GOOGLE_EMAIL:-}" ]]; then
  log "ERROR: YT_GOOGLE_EMAIL not set. Cannot harvest cookies."
  exit 1
fi

# ── Step 1: Harvest fresh cookies locally ─────────────────────
log "Step 1/4: Harvesting cookies via camoufox (residential IP)..."
if python3 "$SCRIPT_DIR/refresh-yt-cookies.py" --test >> "$LOG_FILE" 2>&1; then
  COOKIE_COUNT=$(wc -l < "$LOCAL_COOKIES" | tr -d ' ')
  log "  ✓ Harvested cookies ($COOKIE_COUNT lines), local test passed"
else
  log "  ✗ Cookie harvest FAILED — aborting"
  exit 1
fi

# ── Step 2: Upload to Hetzner ─────────────────────────────────
log "Step 2/4: Uploading cookies to Hetzner..."
if scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
     "$LOCAL_COOKIES" "$SERVER:$REMOTE_PATH" >> "$LOG_FILE" 2>&1; then
  log "  ✓ Uploaded to $SERVER:$REMOTE_PATH"
else
  log "  ✗ SCP failed — Hetzner may be unreachable"
  exit 1
fi

# ── Step 3: Restart worker ────────────────────────────────────
log "Step 3/4: Restarting sp-yt-transcode service..."
WORKER_STATUS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$SERVER" \
  "sudo systemctl restart sp-yt-transcode && sleep 2 && sudo systemctl is-active sp-yt-transcode" 2>&1)
log "  Worker status: $WORKER_STATUS"

# ── Step 4: Re-queue failed cookie-auth jobs ──────────────────
log "Step 4/4: Re-queuing failed cookie-auth jobs..."

# Load DB password from .env.local
DB_PASS=$(grep SUPABASE_DB_PASSWORD "$PROJECT_ROOT/.env.local" | cut -d'"' -f2)
if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(grep SUPABASE_DB_PASSWORD "$PROJECT_ROOT/.env.local" | cut -d= -f2-)
fi

if [[ -n "$DB_PASS" ]]; then
  REQUEUE_SQL="
WITH ranked AS (
  SELECT id, youtube_url,
         ROW_NUMBER() OVER (PARTITION BY youtube_url ORDER BY created_at DESC) as rn
  FROM video_transcode_jobs
  WHERE source_type = 'youtube'
    AND status IN ('failed', 'cancelled')
    AND (
      error_message ILIKE '%cookies-from-browser%'
      OR error_message ILIKE '%cookies for the authentication%'
      OR error_message ILIKE '%Sign in to confirm%'
      OR error_message ILIKE '%requeued_cookie_refresh%'
      OR status = 'cancelled'
    )
)
UPDATE video_transcode_jobs vtj
SET status = 'queued',
    worker_id = NULL,
    started_at = NULL,
    completed_at = NULL,
    error_message = 'requeued_auto_' || to_char(now(), 'YYYYMMDD_HH24MI')
FROM ranked r
WHERE vtj.id = r.id AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM video_transcode_jobs vtj2
    WHERE vtj2.youtube_url = vtj.youtube_url
      AND vtj2.status IN ('queued', 'processing', 'completed')
  );
"

  REQUEUE_RESULT=$(PGPASSWORD="$DB_PASS" psql \
    "postgresql://postgres@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres" \
    -t -c "$REQUEUE_SQL" 2>&1)
  log "  Re-queue result: $(echo "$REQUEUE_RESULT" | tr -d '[:space:]')"

  # Get current queue snapshot
  QUEUE_STATUS=$(PGPASSWORD="$DB_PASS" psql \
    "postgresql://postgres@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres" \
    -t -c "SELECT status || ': ' || count(*) FROM video_transcode_jobs WHERE source_type='youtube' GROUP BY status ORDER BY count(*) DESC;" 2>&1)
  log "  Queue: $(echo "$QUEUE_STATUS" | tr '\n' ' | ')"
else
  log "  ⚠ No DB password found — skipping re-queue"
fi

log "=== Cookie refresh complete ==="
