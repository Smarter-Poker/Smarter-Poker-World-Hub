#!/usr/bin/env bash
# ================================================================
# install-cookie-refresh-launchd.sh
#
# Idempotent installer for the 3-hour YouTube cookie refresh
# launchd job. Run on Dan's mac (residential IP needed to pass
# Google's bot detection during automated login).
#
#   bash scripts/yt-transcode-worker/install-cookie-refresh-launchd.sh
#
# Re-running is safe: it unloads any previous version of the plist
# before reinstalling.
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.smarter-poker.yt-cookie-refresh.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.smarter-poker.yt-cookie-refresh.plist"
LABEL="com.smarter-poker.yt-cookie-refresh"

if [[ ! -f "$PLIST_SRC" ]]; then
  echo "ERROR: source plist not found at $PLIST_SRC"
  exit 1
fi

# Sanity: refresh script must be executable
chmod +x "$SCRIPT_DIR/refresh-cookies-local.sh"

# Sanity: SSH key must exist (the refresh script SCPs cookies to Hetzner)
if [[ ! -f "$HOME/.ssh/id_ed25519" ]]; then
  echo "WARN: $HOME/.ssh/id_ed25519 not found — refresh-cookies-local.sh will fail at SCP step"
  echo "      install your Hetzner SSH key first"
fi

# Sanity: scrapling python deps must be present
if ! python3 -c "from scrapling.fetchers import StealthySession" 2>/dev/null; then
  echo "WARN: scrapling Python package not installed."
  echo "      pip3 install --user scrapling   # then re-run this installer"
fi

# Sanity: .env.local with YT_GOOGLE_EMAIL/PASS at the repo root
ENV_FILE="$SCRIPT_DIR/../../.env.local"
if [[ ! -f "$ENV_FILE" ]] || ! grep -q '^YT_GOOGLE_EMAIL=' "$ENV_FILE"; then
  echo "WARN: $ENV_FILE missing YT_GOOGLE_EMAIL — refresh-cookies-local.sh will abort early"
fi

# Unload existing plist if any (gracefully — ignore "not loaded" errors)
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# Copy / overwrite
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DEST"

# Load the agent (RunAtLoad=true triggers an immediate first run)
launchctl load "$PLIST_DEST"

# Confirm it's loaded
if launchctl list | grep -q "$LABEL"; then
  echo "✓ Loaded $LABEL"
  echo ""
  echo "Next steps:"
  echo "  - Verify the first run wrote a fresh cookies.txt:"
  echo "      tail -50 $SCRIPT_DIR/cookie-refresh.log"
  echo "  - The job will repeat every 3 hours."
  echo "  - Force a manual refresh on demand:"
  echo "      launchctl kickstart -k gui/\$(id -u)/$LABEL"
else
  echo "✗ Load failed. Check /tmp/sp-yt-cookie-refresh.stderr.log"
  exit 1
fi
