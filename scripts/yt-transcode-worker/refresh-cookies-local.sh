#!/usr/bin/env bash
# ============================================================
# refresh-cookies-local.sh
# Run ON YOUR MAC to harvest fresh YouTube auth cookies and
# push them to the Hetzner transcode worker.
#
# WHY THIS EXISTS:
#   Google blocks automated login from Hetzner datacenter IPs.
#   Your Mac's residential IP passes Google's trust checks.
#   We harvest cookies locally and upload them via scp.
#
# WHEN TO RUN:
#   - Worker starts failing with "Sign in to confirm you're not a bot"
#   - Cookies are ~30 days old (check: ssh server "ls -la /opt/smarter-poker/yt-transcode-worker/cookies.txt")
#   - After any password change on smarterpoker45@gmail.com
#
# USAGE:
#   chmod +x scripts/yt-transcode-worker/refresh-cookies-local.sh
#   ./scripts/yt-transcode-worker/refresh-cookies-local.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="openclaw@5.161.49.206"
SSH_KEY="$HOME/.ssh/id_ed25519"
REMOTE_PATH="/opt/smarter-poker/yt-transcode-worker/cookies.txt"
LOCAL_COOKIES="$SCRIPT_DIR/cookies.txt"

echo "=== Smarter Poker — Local Cookie Harvester ==="
echo "Credentials from environment (YT_GOOGLE_EMAIL / YT_GOOGLE_PASS)"
echo ""

# Use .env.local if env vars not set
if [[ -z "${YT_GOOGLE_EMAIL:-}" ]]; then
  ENV_FILE="$SCRIPT_DIR/../../.env.local"
  if [[ -f "$ENV_FILE" ]]; then
    export YT_GOOGLE_EMAIL=$(grep YT_GOOGLE_EMAIL "$ENV_FILE" | cut -d= -f2-)
    export YT_GOOGLE_PASS=$(grep YT_GOOGLE_PASS "$ENV_FILE" | cut -d= -f2-)
  fi
fi

if [[ -z "${YT_GOOGLE_EMAIL:-}" ]]; then
  echo "ERROR: YT_GOOGLE_EMAIL not set."
  echo "  Set it: export YT_GOOGLE_EMAIL=smarterpoker45@gmail.com"
  exit 1
fi

echo "Step 1/3: Harvesting cookies locally via camoufox..."
python3 "$SCRIPT_DIR/refresh-yt-cookies.py" --test
if [[ $? -ne 0 ]]; then
  echo "ERROR: Cookie harvest failed — check output above."
  exit 1
fi

echo ""
echo "Step 2/3: Uploading cookies to Hetzner worker..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$LOCAL_COOKIES" "$SERVER:$REMOTE_PATH"
echo "  Uploaded to $SERVER:$REMOTE_PATH"

echo ""
echo "Step 3/3: Restarting worker to pick up fresh cookies..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" \
  "sudo systemctl restart sp-yt-transcode && sleep 2 && sudo systemctl is-active sp-yt-transcode"

echo ""
echo "=== Done. Worker restarted with fresh authenticated cookies. ==="
echo "Monitor: ssh openclaw@5.161.49.206 'sudo journalctl -u sp-yt-transcode -f'"
