#!/bin/bash
# run_weekly_scraper.sh — Run all 28 batches of the weekly tournament scraper
# Usage:
#   ./scripts/run_weekly_scraper.sh                     # all 28 batches
#   ./scripts/run_weekly_scraper.sh --batches 1-7       # specific range
#   ./scripts/run_weekly_scraper.sh --state TX          # single state
#   ./scripts/run_weekly_scraper.sh --dry-run           # test mode
#   ./scripts/run_weekly_scraper.sh --batch 5           # single batch

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Load env
if [ -f ".env.local" ]; then
    export $(grep -v '^#' .env.local | xargs) 2>/dev/null || true
fi

PYTHON=".venv/bin/python3"
SCRAPER="scripts/scrape_weekly_schedules.py"
TOTAL_BATCHES=28
BATCH_SLEEP=30   # seconds between batches (allow rate limits to reset)

# Parse flags
DRY_RUN=""
STATE_FLAG=""
BATCH_SINGLE=""
BATCH_START=1
BATCH_END=$TOTAL_BATCHES

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)    DRY_RUN="--dry-run";       shift ;;
        --state)      STATE_FLAG="--state $2";   shift 2 ;;
        --batch)      BATCH_SINGLE="$2";         shift 2 ;;
        --batches)    IFS='-' read BATCH_START BATCH_END <<< "$2"; shift 2 ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

echo "========================================================================"
echo "  Smarter.Poker — Weekly Tournament Schedule Scraper"
echo "  $(date)"
echo "  Batches: ${BATCH_SINGLE:-${BATCH_START}-${BATCH_END}} / $TOTAL_BATCHES"
echo "  Mode: ${DRY_RUN:-LIVE}"
echo "========================================================================"

# Verify Python + Scrapling
$PYTHON -c "import scrapling; print('Scrapling', scrapling.__version__, '✅')" ||
    { echo "❌ Scrapling not installed. Run: .venv/bin/pip install scrapling"; exit 1; }

if [ -n "$BATCH_SINGLE" ]; then
    echo ""
    echo "▶ Batch $BATCH_SINGLE"
    $PYTHON "$SCRAPER" --batch "$BATCH_SINGLE" $DRY_RUN $STATE_FLAG
else
    for batch in $(seq $BATCH_START $BATCH_END); do
        echo ""
        echo "▶ Batch $batch / $TOTAL_BATCHES  ($(date +%H:%M:%S))"
        echo "──────────────────────────────────────────────────────────────────────"
        $PYTHON "$SCRAPER" --batch "$batch" $DRY_RUN $STATE_FLAG || {
            echo "⚠️  Batch $batch failed — continuing to next batch"
        }

        if [ "$batch" -lt "$BATCH_END" ]; then
            echo "  Sleeping ${BATCH_SLEEP}s before next batch..."
            sleep $BATCH_SLEEP
        fi
    done
fi

echo ""
echo "========================================================================"
echo "  All batches complete: $(date)"
echo "========================================================================"
