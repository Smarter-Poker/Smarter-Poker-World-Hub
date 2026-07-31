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
#   Usage:  source "$(dirname "$0")/ensure-browsers.sh"; ensure_browsers "$ROOT" || exit 1
#
# RETURN CONTRACT (added 2026-07-31):
#   0 = chromium is verifiably present (probed, not assumed)
#   1 = chromium is still missing after the heal attempt
# The heal used to `|| echo WARNING` and then return 0 unconditionally, so a
# failed download (offline, proxy, disk full) still reported "heal attempt
# complete" and every caller launched a daemon that died on ERROR_SESSION_DEAD.
# Callers MUST check the status and refuse to start the daemon on failure.
# ═══════════════════════════════════════════════════════════════════════════

# Probe: does a usable chromium executable exist for this venv?
# Echoes "yes"/"no"; never fails the caller.
_ensure_browsers_probe() {
    local py="$1"
    "$py" - <<'PYCHECK' 2>/dev/null || echo "no"
import os
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        path = p.chromium.executable_path
    print("yes" if path and os.path.exists(path) else "no")
except Exception:
    print("no")
PYCHECK
}

ensure_browsers() {
    local root="${1:-$PWD}"
    local py="$root/.venv/bin/python3"

    if [ ! -x "$py" ]; then
        echo "$(date) - [ensure-browsers] no venv at $py — cannot verify browsers"
        return 1
    fi

    if [ "$(_ensure_browsers_probe "$py")" = "yes" ]; then
        echo "$(date) - [ensure-browsers] chromium present"
        return 0
    fi

    echo "$(date) - [ensure-browsers] chromium MISSING — healing (playwright install chromium)"
    if ! "$py" -m playwright install chromium; then
        echo "$(date) - [ensure-browsers] playwright install chromium FAILED (network/proxy/disk?)"
    fi
    if ! "$py" -m camoufox fetch; then
        echo "$(date) - [ensure-browsers] WARNING: camoufox fetch failed (non-fatal)"
    fi

    # Re-probe: the install is only a heal if chromium is actually there now.
    if [ "$(_ensure_browsers_probe "$py")" = "yes" ]; then
        echo "$(date) - [ensure-browsers] heal succeeded — chromium verified present"
        return 0
    fi

    echo "$(date) - [ensure-browsers] HEAL FAILED — chromium still missing. Refusing to report success."
    echo "$(date) - [ensure-browsers] Fix with: $py -m playwright install chromium"
    return 1
}
