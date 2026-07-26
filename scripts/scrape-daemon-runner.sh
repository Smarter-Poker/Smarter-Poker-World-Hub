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

# ─────────────────────────────────────────────────────────────────────────────
# BROWSER SELF-HEAL (added 2026-07-26)
# The venv check above is not sufficient. When Playwright upgrades it expects a
# NEW chromium revision directory; the old one is not reused. Both live daemons
# died permanently with:
#   ERROR_SESSION_DEAD: Executable doesn't exist at .../chromium-1208/...
#   "Looks like Playwright was just installed or updated. Please run: playwright install"
# .venv/bin/python3 still existed, so auto-heal never fired and the scrapers
# stayed down while still emitting fresh heartbeats. Verify the browser binary
# itself and re-fetch when it is missing.
# ─────────────────────────────────────────────────────────────────────────────
BROWSER_OK=$(.venv/bin/python3 - <<'PYCHECK'
import os, sys
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        path = p.chromium.executable_path
    print("yes" if path and os.path.exists(path) else "no")
except Exception:
    print("no")
PYCHECK
)

if [ "$BROWSER_OK" != "yes" ]; then
    echo "$(date) - Playwright browser missing or stale. Re-fetching..."
    .venv/bin/python3 -m playwright install chromium || echo "$(date) - WARNING: playwright install failed (network?)"
    .venv/bin/python3 -m camoufox fetch || echo "$(date) - WARNING: camoufox fetch failed (non-fatal)"
    echo "$(date) - Browser heal attempt complete."
else
    echo "$(date) - Playwright browser present."
fi

# Execute the actual python script passed as argument 1
echo "$(date) - Launching $1..."
exec .venv/bin/python3 "$1"
