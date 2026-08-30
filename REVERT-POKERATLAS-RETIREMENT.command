#!/bin/bash
# ============================================================================
# REVERT-POKERATLAS-RETIREMENT.command  —  World Hub half of the revert
# ----------------------------------------------------------------------------
# WHY
# PR #943 retired PokerAtlas from the health endpoint on the assumption the
# scraper was decommissioned. It was not. It was suffering a six-day outage,
# and it RECOVERED the same evening. The watchdog said so itself at
# 2026-08-29 20:00:06 UTC:
#
#     "ALL CLEAR / POKERATLAS scraper recovered! Data is now 7 min fresh."
#
# Verified live at 21:30 UTC: six clean cycles in ninety minutes (19:13, 19:35,
# 19:51, 20:08, 20:25, 20:42) at 148 venues / 689 records each — its exact
# historical volume. game_live_history grew 130,346 -> 134,819 rows that day.
#
# Meanwhile /api/poker/scraper-health was returning:
#     {"status":"healthy", "scrapers":{}}
# An empty object. Monitoring nothing, while reporting healthy. If the scraper
# dies again — and it just proved it can — nothing will say so.
#
# WHAT THIS REVERTS
# ONLY the one-line source-list change from #943. The video-library host
# portability fix in the same PR is correct and STAYS.
#
# Companion script for the other half:
#   ~/Documents/smarter-poker-workers/REVERT-POKERATLAS-RETIREMENT.command
# Run both. Reverting only one leaves the watchdog and the endpoint disagreeing.
# ============================================================================
set -euo pipefail

REPO="$HOME/Documents/Smarter-Poker-World-Hub"
BRANCH="fix/restore-pokeratlas-monitoring"
FILE="pages/api/poker/scraper-health.js"

cd "$REPO"
echo "==> Repo: $REPO"

echo "==> Fetching origin"
git fetch origin main

echo "==> Creating $BRANCH from origin/main"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" origin/main
fi

if ! grep -q "const sources = \[\]; // pokeratlas retired 2026-08-29" "$FILE"; then
  if grep -q "const sources = \['pokeratlas'\]" "$FILE"; then
    echo "Already reverted on this branch — pokeratlas is present. Nothing to do."
    exit 0
  fi
  echo "ABORT: could not find the expected line in $FILE."
  echo "       Look for 'const sources' and restore 'pokeratlas' by hand."
  grep -n "const sources" "$FILE" || true
  exit 1
fi

echo "==> Restoring pokeratlas to the monitored sources"
python3 - "$FILE" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
s = p.read_text()
old = "    const sources = []; // pokeratlas retired 2026-08-29\n"
new = (
    "    // DO NOT RETIRE POKERATLAS WITHOUT CHECKING scraper_metrics FIRST.\n"
    "    // It was removed on 2026-08-29 on the belief that it was decommissioned.\n"
    "    // It was not - it was six days into an outage, and it recovered the same\n"
    "    // evening (watchdog: \"ALL CLEAR ... recovered! Data is now 7 min fresh.\"\n"
    "    // at 20:00:06 UTC). An empty sources list makes this endpoint report\n"
    "    // \"healthy\" while monitoring nothing, which is worse than no endpoint.\n"
    "    // A silent scraper and a retired scraper look identical from here; the\n"
    "    // difference is visible in scraper_metrics.cycle_start. Check that.\n"
    "    const sources = ['pokeratlas'];\n"
)
assert old in s, "expected retired line not found"
p.write_text(s.replace(old, new, 1))
print("   patched", p)
PY

git add -- "$FILE"
if git diff --cached --quiet; then
  echo "Nothing staged. Exiting."; exit 0
fi
git diff --cached --stat
echo

git commit -m "fix(monitoring): restore PokerAtlas health monitoring

#943 retired PokerAtlas from this endpoint on the belief that the scraper had
been decommissioned in favour of simulated estimates. That belief was wrong.
The scraper was six days into a real outage, and it recovered the same evening
this change shipped - the watchdog announced it at 20:00:06 UTC:

    ALL CLEAR / POKERATLAS scraper recovered! Data is now 7 min fresh.

Verified at 21:30 UTC: six cycles in ninety minutes at 148 venues and 689
records each, its exact pre-outage volume, and game_live_history up from
130,346 to 134,819 rows on the day.

With an empty sources list this endpoint returns {\"status\":\"healthy\",
\"scrapers\":{}} - healthy while watching nothing. That is strictly worse than
no endpoint at all, because it answers the question wrongly instead of not
answering it.

The lesson is in the comment now: a silent scraper and a retired scraper look
identical from the endpoint. scraper_metrics.cycle_start tells them apart, and
should be checked before anything here is removed again.

The video-library host-portability half of #943 is correct and is untouched."

echo "==> Handing off to the sanctioned push path (CLAUDE.md 1.3)"
bash scripts/git-safe-push.sh "fix(monitoring): restore PokerAtlas health monitoring"

echo
echo "============================================================"
echo "World Hub half done. NOW RUN THE OTHER HALF:"
echo "  ~/Documents/smarter-poker-workers/REVERT-POKERATLAS-RETIREMENT.command"
echo "============================================================"
