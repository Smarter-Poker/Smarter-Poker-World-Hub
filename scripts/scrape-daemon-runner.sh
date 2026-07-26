#!/bin/bash
# Auto-healing daemon wrapper: Rebuilds .venv automatically if missing
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

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
. "$DIR/scripts/ensure-browsers.sh"
ensure_browsers "$DIR"

# Execute the actual python script passed as argument 1
echo "$(date) - Launching $1..."
exec .venv/bin/python3 "$1"
