#!/bin/bash
# run-tour-stealth-scraper.sh - launcher for the Scrapling+camoufox tour scraper.
# Used by launchd (com.smarter-poker.tour-scraper). Every scrape in this repo
# goes through StealthySession + camoufox (Dan's standing Cloudflare rule).
set -o pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -d "$ROOT" ] || ROOT="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub"
LOG="$ROOT/data/tour-logs/launcher.log"
mkdir -p "$ROOT/data/tour-logs"

# Python: the shared scraper venv (where scrapling/camoufox live), then fallbacks.
for P in "/Users/smarter.poker/.local/share/smarter-poker-venv/bin/python3" \
         "$ROOT/.venv/bin/python3" \
         "$(command -v python3)"; do
  [ -x "$P" ] && PYTHON="$P" && break
done

# Env: launchd does not source shell profiles; the scraper itself also falls
# back to .env.local, so this is belt-and-braces.
if [ -f "$ROOT/.env.local" ]; then
  set -a; . "$ROOT/.env.local" 2>/dev/null; set +a
fi

cd "$ROOT" || exit 1
. "$ROOT/scripts/ensure-browsers.sh" 2>/dev/null && ensure_browsers "$ROOT" >> "$LOG" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] tour stealth scraper starting ($PYTHON)" >> "$LOG"
"$PYTHON" "$ROOT/scripts/tour_stealth_scraper.py" >> "$LOG" 2>&1
EXIT=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] exited $EXIT" >> "$LOG"
exit $EXIT
