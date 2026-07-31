"""
browser_heal.py — in-process Playwright/Camoufox browser self-heal.

WHY THIS EXISTS (2026-07-26 -> 2026-07-31 incident)
---------------------------------------------------
A Playwright upgrade started expecting a NEW chromium revision directory. The
previous revision is not reused, so every Scrapling/Playwright daemon began
failing on session start with:

    ERROR_SESSION_DEAD: BrowserType.launch_persistent_context:
    Executable doesn't exist at .../ms-playwright/chromium-1208/...
    "Looks like Playwright was just installed or updated.
     Please run the following command to download new browsers: playwright install"

Three scraper families went dark simultaneously — bravo-live (cash games),
pokeratlas-live (game catalogue) and the poker-series pipeline — and stayed
down for days. Nothing recovered, for three compounding reasons:

  1. The only auto-heal in the repo (scrape-daemon-runner.sh) tested for a
     missing .venv. The venv was perfectly fine; only the browser was gone.
  2. launchd invokes the daemons as `.venv/bin/python3 scripts/<daemon>.py`
     DIRECTLY, so shell-level healing in the launchers never ran at all.
  3. The daemons kept writing fresh heartbeats while looping on the failure,
     so the watchdog read them as healthy.

Because of (2), the heal has to live in-process. Import this from any daemon
that drives a browser and call ensure_browser() before creating a session, and
heal_and_retry() when a session fails to start.

Both functions are safe to call repeatedly: they probe first and only download
when the executable is genuinely absent.
"""

import os
import subprocess
import sys

__all__ = ["browser_present", "ensure_browser", "heal_and_retry", "is_missing_browser_error"]

# Substrings that identify "the browser binary is not on disk" as opposed to a
# network block, a Cloudflare challenge, or a crashed page.
_MISSING_MARKERS = (
    "executable doesn't exist",
    "please run the following command to download new browsers",
    "playwright install",
    "looks like playwright was just installed or updated",
)


def is_missing_browser_error(err):
    """True when err looks like a missing-browser-binary failure."""
    return any(m in str(err).lower() for m in _MISSING_MARKERS)


def browser_present():
    """Return True when Playwright's chromium executable actually exists."""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            path = p.chromium.executable_path
        return bool(path) and os.path.exists(path)
    except Exception:
        return False


def ensure_browser(log=None):
    """
    Verify the chromium binary and re-download it when missing.

    Returns True when a browser is available afterwards. Never raises — a
    daemon must survive a failed heal (offline box, transient CDN error) and
    retry on its next cycle rather than crash out of its supervision loop.
    """
    emit = log or (lambda m: print(m, flush=True))

    if browser_present():
        return True

    emit("[browser_heal] chromium missing — running 'playwright install chromium'")
    py = sys.executable or "python3"
    try:
        proc = subprocess.run(
            [py, "-m", "playwright", "install", "chromium"],
            capture_output=True, text=True, timeout=900,
        )
        if proc.returncode != 0:
            emit("[browser_heal] playwright install failed rc=%s: %s"
                 % (proc.returncode, (proc.stderr or "")[-500:]))
    except Exception as exc:
        emit("[browser_heal] playwright install raised: %r" % (exc,))

    # Camoufox is optional; Scrapling's StealthySession prefers it when present.
    try:
        subprocess.run([py, "-m", "camoufox", "fetch"],
                       capture_output=True, text=True, timeout=900)
    except Exception:
        pass

    ok = browser_present()
    emit("[browser_heal] heal %s" % ("succeeded" if ok else "FAILED — will retry next cycle"))
    return ok


def heal_and_retry(err, log=None):
    """
    Call from an except block around session creation.

    Returns True when the error was a missing browser AND the heal succeeded,
    meaning the caller should retry immediately. Returns False otherwise, so
    the caller falls through to its normal backoff.
    """
    if not is_missing_browser_error(err):
        return False
    emit = log or (lambda m: print(m, flush=True))
    emit("[browser_heal] session failure is a missing browser binary — healing now")
    return ensure_browser(log=emit)
