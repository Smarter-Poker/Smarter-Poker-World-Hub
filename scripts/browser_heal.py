"""
browser_heal.py — in-process Playwright/Camoufox browser self-heal.

WHY THIS EXISTS (2026-07-26 -> 2026-07-31 incident)
---------------------------------------------------
A Playwright upgrade started expecting a NEW chromium revision directory. The
previous revision is not reused, so every Scrapling/Playwright daemon began
failing on session start with:

    ERROR_SESSION_DEAD: BrowserType.launch_persistent_context:
    Executable doesn't exist at .../ms-playwright/chromium-1208/...

Three scraper families went dark simultaneously — bravo-live (cash games),
pokeratlas-live (game catalogue) and the poker-series pipeline — and stayed
down for days, because:

  1. The only auto-heal in the repo tested for a missing .venv. The venv was
     fine; only the browser was gone.
  2. launchd invokes the daemons as `.venv/bin/python3 scripts/<daemon>.py`
     DIRECTLY, so shell-level healing in the launchers never ran.
  3. The daemons kept writing fresh heartbeats while looping on the failure,
     so the watchdog read them as healthy.

Because of (2), the heal has to live in-process.

PROBE CORRECTNESS (2026-08-01 follow-up)
----------------------------------------
The first version probed with `sync_playwright()`. Inside a long-running daemon
that already owns an asyncio loop (or an open Playwright context) that call
RAISES — "Playwright Sync API inside asyncio loop" — and a bare `except` turned
that into "browser missing". Observed live: the heal logged "chromium missing"
at 12:17 while the very same daemon solved a Cloudflare challenge at 12:23, and
it re-ran `playwright install` every cycle for hours.

So the probe is now three-state and filesystem-first:
  True  -> executable found on disk
  False -> cache directory searched and genuinely empty
  None  -> could not determine (never triggers an install)

Only an explicit False heals, and a cooldown stops reinstall storms.
"""

import glob
import os
import subprocess
import sys
import time

__all__ = [
    "browser_present", "ensure_browser", "heal_and_retry",
    "is_missing_browser_error", "browser_cache_dir",
]

_MISSING_MARKERS = (
    "executable doesn't exist",
    "please run the following command to download new browsers",
    "playwright install",
    "looks like playwright was just installed or updated",
)

# Do not attempt another download within this window (seconds).
HEAL_COOLDOWN_SECONDS = 6 * 60 * 60
_last_heal_attempt = 0.0


def is_missing_browser_error(err):
    """True when err looks like a missing-browser-binary failure."""
    return any(m in str(err).lower() for m in _MISSING_MARKERS)


def browser_cache_dir():
    """Playwright's browser cache root, honouring PLAYWRIGHT_BROWSERS_PATH."""
    env = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if env and env not in ("0", "1"):
        return env
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Caches/ms-playwright")
    if os.name == "nt":
        return os.path.expandvars(r"%USERPROFILE%\AppData\Local\ms-playwright")
    return os.path.expanduser("~/.cache/ms-playwright")


def browser_present():
    """
    Three-state probe. NEVER starts Playwright, so it is safe to call from
    inside a daemon that already owns an event loop or a browser context.

    Returns True (found), False (cache searched, nothing there), or
    None (undeterminable — caller must not treat this as missing).
    """
    root = browser_cache_dir()
    try:
        if not os.path.isdir(root):
            return False
        revs = [d for d in glob.glob(os.path.join(root, "chromium*")) if os.path.isdir(d)]
        if not revs:
            return False
        for rev in revs:
            for pattern in (
                "chrome-mac*/Chromium.app/Contents/MacOS/Chromium",
                "chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
                "chrome-linux/chrome",
                "chrome-linux/headless_shell",
                "chrome-win/chrome.exe",
                "chrome-headless-shell-*/chrome-headless-shell",
            ):
                for hit in glob.glob(os.path.join(rev, pattern)):
                    if os.path.exists(hit):
                        return True
        return False
    except Exception:
        # Permission error, odd layout, anything else: unknown, not missing.
        return None


def ensure_browser(log=None, force=False):
    """
    Re-download the browser only when it is *positively* absent.

    Returns True when a browser is believed available, False when a heal was
    attempted and the browser is still missing. Never raises: a daemon must
    survive a failed heal and retry on a later cycle rather than crash out of
    its supervision loop.
    """
    global _last_heal_attempt
    emit = log or (lambda m: print(m, flush=True))

    state = browser_present()
    if state is True:
        return True
    if state is None:
        # Could not determine. Do nothing — assuming "missing" here is what
        # caused the reinstall storm this module was rewritten to stop.
        return True

    now = time.time()
    if not force and (now - _last_heal_attempt) < HEAL_COOLDOWN_SECONDS:
        waited = int((now - _last_heal_attempt) / 60)
        emit("[browser_heal] browser still missing, but last attempt was %dm ago "
             "— inside the %dh cooldown, skipping" % (waited, HEAL_COOLDOWN_SECONDS // 3600))
        return False
    _last_heal_attempt = now

    emit("[browser_heal] chromium not found under %s — running 'playwright install chromium'"
         % browser_cache_dir())
    py = sys.executable or "python3"
    try:
        proc = subprocess.run(
            [py, "-m", "playwright", "install", "chromium"],
            capture_output=True, text=True, timeout=1800,
        )
        if proc.returncode != 0:
            emit("[browser_heal] playwright install rc=%s stderr=%s"
                 % (proc.returncode, (proc.stderr or "").strip()[-600:]))
        else:
            emit("[browser_heal] playwright install completed")
    except Exception as exc:
        emit("[browser_heal] playwright install raised: %r" % (exc,))

    # Scrapling's StealthySession prefers camoufox when it is available.
    try:
        cf = subprocess.run([py, "-m", "camoufox", "fetch"],
                            capture_output=True, text=True, timeout=1800)
        if cf.returncode != 0:
            emit("[browser_heal] camoufox fetch rc=%s (non-fatal)" % cf.returncode)
    except Exception as exc:
        emit("[browser_heal] camoufox fetch raised: %r (non-fatal)" % (exc,))

    ok = browser_present() is not False
    emit("[browser_heal] heal %s" % ("succeeded" if ok else "FAILED — will retry after cooldown"))
    return ok


def heal_and_retry(err, log=None):
    """
    Call from an except block around session creation.

    Returns True when the error was a missing browser AND a heal ran, meaning
    the caller should retry immediately. Otherwise False, so the caller falls
    through to its normal backoff. Passes force=True because the error itself
    is direct evidence the browser is missing, which beats the probe.
    """
    if not is_missing_browser_error(err):
        return False
    emit = log or (lambda m: print(m, flush=True))
    emit("[browser_heal] session failure names a missing browser binary — healing now")
    return ensure_browser(log=emit, force=True)
