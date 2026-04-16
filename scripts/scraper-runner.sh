#!/bin/bash
# ============================================================
# SELF-HEALING SCRAPER DAEMON RUNNER
# ============================================================
# Wraps bravo-live-daemon.py and pokeratlas-live-daemon.py.
# If .venv is missing or broken, auto-rebuilds it before launching.
# This prevents the exit-code-78 crash loop permanently.
#
# Usage (from launchd plist):
#   /bin/bash scripts/scraper-runner.sh scripts/bravo-live-daemon.py
#   /bin/bash scripts/scraper-runner.sh scripts/pokeratlas-live-daemon.py
# ============================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

LOGFILE="$DIR/data/scraper-runner.log"
mkdir -p "$(dirname "$LOGFILE")"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [runner] $*" | tee -a "$LOGFILE"; }

SCRIPT="$1"
if [ -z "$SCRIPT" ]; then
    log "FATAL: No script argument provided"
    exit 1
fi

# ── AUTO-HEAL: Rebuild .venv if missing or broken ──
VENV_DIR="/Users/smarter.poker/.local/share/smarter-poker-venv"

if [ ! -x "$VENV_DIR/bin/python3" ]; then
    log "⚠️  .venv missing or broken — auto-rebuilding..."
    rm -rf "$VENV_DIR"

    # Use Homebrew Python to avoid macOS TCC permission issues
    BREW_PY="/opt/homebrew/bin/python3"
    if [ ! -x "$BREW_PY" ]; then
        BREW_PY="$(which python3)"
    fi

    log "Using Python: $BREW_PY"
    "$BREW_PY" -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --upgrade pip -q
    "$VENV_DIR/bin/pip" install scrapling patchright curl_cffi msgspec camoufox python-dotenv supabase playwright requests -q
    "$VENV_DIR/bin/playwright" install chromium
    "$VENV_DIR/bin/camoufox" fetch
    log "✅ .venv auto-healed successfully"
fi

# ── Verify critical imports before launching ──
if ! "$VENV_DIR/bin/python3" -c "import scrapling, dotenv" 2>/dev/null; then
    log "⚠️  Import check failed — reinstalling deps..."
    "$VENV_DIR/bin/pip" install scrapling patchright curl_cffi msgspec camoufox python-dotenv supabase playwright requests -q
fi

log "🚀 Launching $SCRIPT (PID $$)"
exec "$VENV_DIR/bin/python3" "$DIR/$SCRIPT"
