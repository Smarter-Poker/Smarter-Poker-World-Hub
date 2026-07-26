#!/bin/bash
# run-tournament-daemon.sh — Run all batches of the 5-source tournament schedule daemon
# Each batch = 25 venues. Runs sequentially with 30s cooldown between batches.
#
# Usage:
#   ./scripts/run-tournament-daemon.sh               # all batches
#   ./scripts/run-tournament-daemon.sh --batch 3     # single batch
#   ./scripts/run-tournament-daemon.sh --dry-run     # no DB writes
#   ./scripts/run-tournament-daemon.sh --batches 1-5 # range

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Load env
if [ -f ".env.local" ]; then
    export $(grep -v '^#' .env.local | xargs) 2>/dev/null || true
fi

PYTHON=".venv/bin/python3"
SCRAPER="scripts/tournament-schedule-daemon.py"
BATCH_SLEEP=30

# Browser self-heal before verifying the stack.
. "$PROJECT_ROOT/scripts/ensure-browsers.sh"
ensure_browsers "$PROJECT_ROOT"

# Verify Scrapling
$PYTHON -c "import scrapling; print('  Scrapling', scrapling.__version__, '✅')" || {
    echo "❌ Scrapling not installed — run: .venv/bin/pip install scrapling[camoufox]"
    exit 1
}

PDF_CHECK=$($PYTHON -c "import pdfplumber; print('✅')" 2>/dev/null || echo "⚠️  missing (pip install pdfplumber)")
SESSION_CHECK=$($PYTHON -c "from scrapling.fetchers import StealthySession; print('✅')" 2>/dev/null || echo "⚠️  StealthySession unavailable")

# Count total venues via DB to compute batch count dynamically
TOTAL_VENUES=$($PYTHON -c "
import urllib.request, json, os
KEY=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs')
try:
    req=urllib.request.Request('https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/poker_venues?select=count&is_active=eq.true',headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Prefer':'count=exact','Range':'0-0'})
    with urllib.request.urlopen(req,timeout=10) as r:
        cr=r.headers.get('Content-Range','0-0/0')
        print(cr.split('/')[-1].strip())
except: print(700)
" 2>/dev/null || echo "700")

TOTAL_BATCHES=$(( (TOTAL_VENUES + 24) / 25 ))

# Parse args
DRY_RUN=""
BATCH_SINGLE=""
BATCH_START=1
BATCH_END=$TOTAL_BATCHES

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)  DRY_RUN="--dry-run";     shift ;;
        --batch)    BATCH_SINGLE="$2";        shift 2 ;;
        --batches)  IFS='-' read BATCH_START BATCH_END <<< "$2"; shift 2 ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

echo "========================================================================"
echo "  Smarter.Poker — 5-Source Tournament Schedule Daemon (Batch Runner)"
echo "  $(date)"
echo "  Total venues:  ~${TOTAL_VENUES}  →  ${TOTAL_BATCHES} batches of 25"
echo "  Batches:       ${BATCH_SINGLE:-${BATCH_START}-${BATCH_END}}"
echo "  Mode:          ${DRY_RUN:-LIVE}"
echo "  Scrapling:     ${SESSION_CHECK}"
echo "  pdfplumber:    ${PDF_CHECK}"
echo "  Sources:       PokerAtlas | Bravo | HendonMob | CardPlayer | VenueSite+PDF"
echo "========================================================================"

if [ -n "$BATCH_SINGLE" ]; then
    echo ""
    echo "▶ Running Batch ${BATCH_SINGLE}"
    $PYTHON "$SCRAPER" --batch "$BATCH_SINGLE" $DRY_RUN
else
    for batch in $(seq $BATCH_START $BATCH_END); do
        start_venue=$(( (batch - 1) * 25 + 1 ))
        end_venue=$(( batch * 25 ))
        echo ""
        echo "▶ Batch ${batch}/${TOTAL_BATCHES}  (venues ${start_venue}–${end_venue})  $(date +%H:%M:%S)"
        echo "────────────────────────────────────────────────────────────────────────"
        $PYTHON "$SCRAPER" --batch "$batch" $DRY_RUN || {
            echo "  ⚠️  Batch $batch failed — continuing"
        }

        if [ "$batch" -lt "$BATCH_END" ]; then
            echo "  Sleeping ${BATCH_SLEEP}s..."
            sleep $BATCH_SLEEP
        fi
    done
fi

echo ""
echo "========================================================================"
echo "  All batches complete: $(date)"
echo "========================================================================"
