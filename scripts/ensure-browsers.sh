#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# ensure-browsers.sh — shared Playwright/Camoufox browser self-heal
# ═══════════════════════════════════════════════════════════════════════════
#
# WHY THIS EXISTS (2026-07-26 incident):
# Playwright upgraded and began expecting a NEW chromium revision directory.
# The old revision is not reused, so every Scrapling/Playwright daemon died with:
#
#   ERROR_SESSION_DEAD: BrowserType.launch_persistent_context:
#   Executable doesn't exist at .../ms-playwright/chromium-1208/...
#
# Three independent scraper families went dark at once — bravo-live (cash games),
# pokeratlas-live (game catalog) and the poker-series pipeline — and none of them
# recovered, because the only auto-heal in the repo tested for a missing .venv.
# The venv was fine; only the browser was gone.
#
# Source this from every daemon launcher BEFORE exec'ing python.
# Safe to call on every start: it probes first and only downloads when missing.
#
#   Usage:  source "$(dirname "$0")/ensure-browsers.sh"; ensure_browsers "$ROOT"
# ═══════════════════════════════════════════════════════════════════════════

ensure_browsers() {
    local root="${1:-$PWD}"
    local py="$root/.venv/bin/python3"

    if [ ! -x "$py" ]; then
        echo "$(date) - [ensure-browsers] no venv at $py — skipping browser check"
        return 0
    fi

    local ok
    ok=$("$py" - <<'PYCHECK' 2>/dev/null
import os
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        path = p.chromium.executable_path
    print("yes" if path and os.path.exists(path) else "no")
except Exception:
    print("no")
PYCHECK
)

    if [ "$ok" = "yes" ]; then
        echo "$(date) - [ensure-browsers] chromium present"
        return 0
    fi

    echo "$(date) - [ensure-browsers] chromium MISSING — healing (playwright install chromium)"
    "$py" -m playwright install chromium \
        || echo "$(date) - [ensure-browsers] WARNING: playwright install failed (network?)"
    "$py" -m camoufox fetch \
        || echo "$(date) - [ensure-browsers] WARNING: camoufox fetch failed (non-fatal)"
    echo "$(date) - [ensure-browsers] heal attempt complete"
}
