#!/bin/bash
# run-tournament-daemon.sh — Run the 5-source tournament schedule daemon
#
# FULL SWEEP (default) runs the daemon ONCE over every active venue in a single
# process. The old behaviour — one `--batch N` process per 25 venues — paid a
# browser cold start, two aggregator fetches (HendonMob + CardPlayer, ~45s each)
# and a full ~700-row venue-table read for EVERY batch, plus a 30s cooldown:
# ~28x that overhead before any venue is scraped, which no longer fits in a
# daily window. The daemon already flushes to the DB every 25 venues, so the
# crash-safety the batch loop was providing is unchanged.
# Use --legacy-batches to force the old batch-per-process loop.
#
# Usage:
#   ./scripts/run-tournament-daemon.sh                 # full sweep, single process
#   ./scripts/run-tournament-daemon.sh --batch 3       # single batch of 25 venues
#   ./scripts/run-tournament-daemon.sh --batches 1-5   # range of batches
#   ./scripts/run-tournament-daemon.sh --legacy-batches # full sweep, batch-per-process
#   ./scripts/run-tournament-daemon.sh --dry-run       # no DB writes

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Load env. `export $(... | xargs)` published every secret as a visible argv
# entry and word-split any value containing spaces; sourcing does neither.
# The old form ended in `|| true`: a malformed line (e.g. an unquoted value with
# a space) was tolerated and the run continued. Keep that tolerance — under
# `set -e` a bare `.` of a bad env file aborts the launcher with status 127
# before a single venue is scraped, which is a worse failure than a partially
# loaded environment.
if [ -f ".env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    . "./.env.local" || echo "WARNING: .env.local did not load cleanly — continuing with the environment as-is"
    set +a
fi

PYTHON=".venv/bin/python3"
SCRAPER="scripts/tournament-schedule-daemon.py"
BATCH_SLEEP=30

# Browser self-heal before verifying the stack. A failed heal means chromium is
# missing and every fetch will die with ERROR_SESSION_DEAD — do not start.
. "$PROJECT_ROOT/scripts/ensure-browsers.sh"
ensure_browsers "$PROJECT_ROOT" || {
    echo "Browser check failed — refusing to start the tournament daemon."
    exit 1
}

# Verify Scrapling
$PYTHON -c "import scrapling; print('  Scrapling', scrapling.__version__, '✅')" || {
    echo "❌ Scrapling not installed — run: .venv/bin/pip install scrapling[camoufox]"
    exit 1
}

PDF_CHECK=$($PYTHON -c "import pdfplumber; print('✅')" 2>/dev/null || echo "⚠️  missing (pip install pdfplumber)")
SESSION_CHECK=$($PYTHON -c "from scrapling.fetchers import StealthySession; print('✅')" 2>/dev/null || echo "⚠️  StealthySession unavailable")

# Parse args
DRY_RUN=""
BATCH_SINGLE=""
BATCH_START=1
BATCH_END=""
LEGACY_BATCHES=0
BATCHES_EXPLICIT=0

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)        DRY_RUN="--dry-run";  shift ;;
        --batch)          BATCH_SINGLE="$2";     shift 2 ;;
        --batches)        IFS='-' read BATCH_START BATCH_END <<< "$2"; BATCHES_EXPLICIT=1; shift 2 ;;
        --legacy-batches) LEGACY_BATCHES=1;      shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

# ── Load the venue set from the DB ───────────────────────────────────────────
# This used to be a count query whose `except: print(700)` invented a plausible
# number on ANY failure (DB down, key rotated), so the runner announced
# "~700 venues -> 28 batches" and scraped the wrong scope with a straight face.
# There is no correct run without this list, so a failure is now fatal.
# Filters mirror load_venues() in tournament-schedule-daemon.py exactly, which
# also makes the batch count match what the daemon actually slices.
VENUE_ID_FILE="$(mktemp "${TMPDIR:-/tmp}/sp_venue_ids.XXXXXX")"
trap 'rm -f "$VENUE_ID_FILE"' EXIT

if ! $PYTHON - "$VENUE_ID_FILE" <<'PYVENUES'
import json, os, sys, urllib.request

SKIP_TYPES = {
    "charity","charity_event","charity_game","series","poker_series",
    "tour","poker_tour","traveling_tour","regional_tour","tournament_series",
}
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs')
URL = ("https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/poker_venues"
       "?select=id,venue_type&is_active=eq.true&is_suppressed=eq.false"
       "&has_tournaments=eq.true&order=id.asc&limit=2000")

req = urllib.request.Request(URL, headers={
    'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
with urllib.request.urlopen(req, timeout=30) as r:
    rows = json.load(r)

ids = [str(v['id']) for v in rows
       if (v.get('venue_type') or '').lower() not in SKIP_TYPES]
if not ids:
    sys.stderr.write("Supabase returned 0 scrapeable venues — nothing to do.\n")
    sys.exit(1)
with open(sys.argv[1], 'w') as fh:
    fh.write(','.join(ids))
sys.stderr.write("venues=%d\n" % len(ids))
PYVENUES
then
    echo "FATAL: could not load the active venue list from Supabase."
    echo "       Check SUPABASE_SERVICE_ROLE_KEY and network. Refusing to run"
    echo "       with a guessed venue count."
    exit 1
fi

VENUE_IDS="$(cat "$VENUE_ID_FILE")"
TOTAL_VENUES=$(awk -F, '{print NF}' "$VENUE_ID_FILE")
TOTAL_BATCHES=$(( (TOTAL_VENUES + 24) / 25 ))
[ -n "$BATCH_END" ] || BATCH_END=$TOTAL_BATCHES

MODE="full"
RUN_MODE="full sweep (single process, ${TOTAL_VENUES} venues)"
if [ -n "$BATCH_SINGLE" ]; then
    MODE="single"
    RUN_MODE="single batch ${BATCH_SINGLE}"
# An explicit --batches request always means the batch loop. Inferring the mode
# from the range alone silently turned `--batches 1-N` (N == TOTAL_BATCHES) into
# the single-process sweep, i.e. the opposite of what the caller asked for.
elif [ "$LEGACY_BATCHES" -eq 1 ] || [ "$BATCHES_EXPLICIT" -eq 1 ]; then
    MODE="loop"
    RUN_MODE="batch loop ${BATCH_START}-${BATCH_END} (one process per 25 venues)"
fi

echo "========================================================================"
echo "  Smarter.Poker — 5-Source Tournament Schedule Daemon (Runner)"
echo "  $(date)"
echo "  Total venues:  ${TOTAL_VENUES} (live count from DB)  →  ${TOTAL_BATCHES} batches of 25"
echo "  Run mode:      ${RUN_MODE}"
echo "  Writes:        ${DRY_RUN:-LIVE}"
echo "  Scrapling:     ${SESSION_CHECK}"
echo "  pdfplumber:    ${PDF_CHECK}"
echo "  Sources:       PokerAtlas | Bravo | HendonMob | CardPlayer | VenueSite+PDF"
echo "========================================================================"

FAILED_BATCHES=0
RUN_STATUS=0

if [ "$MODE" = "single" ]; then
    echo ""
    echo "Running batch ${BATCH_SINGLE}"
    $PYTHON "$SCRAPER" --batch "$BATCH_SINGLE" $DRY_RUN || RUN_STATUS=1

elif [ "$MODE" = "full" ]; then
    # One process, one browser session, one HendonMob/CardPlayer fetch, one
    # venue-table read. The daemon still flushes to the DB every 25 venues and
    # exits after a single pass when --venue-ids is supplied.
    echo ""
    echo "Full sweep: ${TOTAL_VENUES} venues in one process  $(date +%H:%M:%S)"
    echo "------------------------------------------------------------------------"
    $PYTHON "$SCRAPER" --venue-ids "$VENUE_IDS" $DRY_RUN || RUN_STATUS=1

else
    for batch in $(seq "$BATCH_START" "$BATCH_END"); do
        start_venue=$(( (batch - 1) * 25 + 1 ))
        end_venue=$(( batch * 25 ))
        echo ""
        echo "Batch ${batch}/${TOTAL_BATCHES}  (venues ${start_venue}-${end_venue})  $(date +%H:%M:%S)"
        echo "------------------------------------------------------------------------"
        set +e
        $PYTHON "$SCRAPER" --batch "$batch" $DRY_RUN
        batch_rc=$?
        set -e
        if [ "$batch_rc" -ne 0 ]; then
            FAILED_BATCHES=$(( FAILED_BATCHES + 1 ))
            echo "  BATCH ${batch} FAILED (exit ${batch_rc}) — continuing with the rest"
        fi

        if [ "$batch" -lt "$BATCH_END" ]; then
            echo "  Sleeping ${BATCH_SLEEP}s..."
            sleep $BATCH_SLEEP
        fi
    done
    [ "$FAILED_BATCHES" -eq 0 ] || RUN_STATUS=1
fi

echo ""
echo "========================================================================"
if [ "$RUN_STATUS" -eq 0 ]; then
    echo "  Run complete: $(date)"
else
    # Batch failures used to be swallowed with a warning and the runner still
    # exited 0, so a scheduler saw a green run over an empty scrape.
    if [ "$MODE" = "loop" ]; then
        echo "  RUN FAILED: $(date) — ${FAILED_BATCHES} failed batch(es)"
    else
        echo "  RUN FAILED: $(date) — daemon exited non-zero"
    fi
fi
echo "========================================================================"
exit $RUN_STATUS
