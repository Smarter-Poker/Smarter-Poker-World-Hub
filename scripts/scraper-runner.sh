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
if [ ! -x "$DIR/.venv/bin/python3" ]; then
    log "⚠️  .venv missing or broken — auto-rebuilding..."
    rm -rf "$DIR/.venv"

    # Use Homebrew Python to avoid macOS TCC permission issues
    BREW_PY="/opt/homebrew/bin/python3"
    if [ ! -x "$BREW_PY" ]; then
        BREW_PY="$(which python3)"
    fi

    log "Using Python: $BREW_PY"
    "$BREW_PY" -m venv "$DIR/.venv"
    "$DIR/.venv/bin/pip" install --upgrade pip -q
    "$DIR/.venv/bin/pip" install scrapling patchright curl_cffi msgspec camoufox python-dotenv supabase playwright requests -q
    "$DIR/.venv/bin/playwright" install chromium
    "$DIR/.venv/bin/camoufox" fetch
    log "✅ .venv auto-healed successfully"
fi

# ── Verify critical imports before launching ──
if ! "$DIR/.venv/bin/python3" -c "import scrapling, dotenv" 2>/dev/null; then
    log "⚠️  Import check failed — reinstalling deps..."
    "$DIR/.venv/bin/pip" install scrapling patchright curl_cffi msgspec camoufox python-dotenv supabase playwright requests -q
fi

log "🚀 Launching $SCRIPT (PID $$)"
exec "$DIR/.venv/bin/python3" "$DIR/$SCRIPT"
