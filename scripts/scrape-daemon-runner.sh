#!/bin/bash
# Auto-healing daemon wrapper: Rebuilds .venv automatically if missing
#
# Usage: scrape-daemon-runner.sh <path/to/script.py>
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

# Validate the target BEFORE any healing work. `exec python3 "$1"` with an empty
# $1 (a plist typo) execs an interactive interpreter that blocks on stdin
# forever — the process stays alive, so every PID-based health check reports a
# healthy daemon while nothing is being scraped.
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
    echo "usage: scrape-daemon-runner.sh <script.py>" >&2
    exit 64
fi
case "$TARGET" in
    /*) ;;
    *) TARGET="$DIR/$TARGET" ;;
esac
if [ ! -f "$TARGET" ]; then
    echo "scrape-daemon-runner.sh: no such script: $TARGET" >&2
    exit 64
fi

# Check if .venv is missing or damaged
if [ ! -f ".venv/bin/python3" ]; then
    echo "$(date) - .venv missing or damaged. Triggering auto-heal protocol..."
    rm -rf .venv
    # Use explicit brew python to avoid macOS TCC boundaries
    /opt/homebrew/bin/python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    echo "$(date) - Installing Scrapling and stealth dependencies..."
    pip install scrapling patchright curl_cffi msgspec camoufox python-dotenv supabase playwright requests
    echo "$(date) - Fetching browsers..."
    playwright install chromium
    camoufox fetch
    echo "$(date) - Auto-heal complete."
else
    source .venv/bin/activate
fi

# Shared browser self-heal (see scripts/ensure-browsers.sh for the incident notes).
# A failed heal means chromium is missing: launching anyway just reproduces the
# ERROR_SESSION_DEAD crash loop under a log line that says the check completed.
. "$DIR/scripts/ensure-browsers.sh"
if ! ensure_browsers "$DIR"; then
    echo "$(date) - Browser check FAILED — refusing to launch $TARGET" >&2
    exit 1
fi

# Execute the actual python script passed as argument 1
echo "$(date) - Launching $TARGET..."
exec .venv/bin/python3 "$TARGET"
