#!/bin/zsh
# completeness_scheduler.sh
# Wrapper fired by launchd every 6 hours.
# Reads completeness_state.json to determine whether to run and respects 3-day cooldown.

ROOT="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub"
PYTHON="$ROOT/.venv/bin/python3"
SCRAPER="$ROOT/scripts/completeness_scraper.py"
STATE="$ROOT/data/tournament-logs/completeness_state.json"
LOG="$ROOT/data/tournament-logs/completeness_scheduler.log"

ts() { date "+%Y-%m-%d %H:%M:%S"; }

echo "[$(ts)] Completeness scheduler fired" | tee -a "$LOG"

# Read state
if [ -f "$STATE" ]; then
    PHASE=$(python3 -c "import json; d=json.load(open('$STATE')); print(d.get('phase','twice_daily'))" 2>/dev/null || echo "twice_daily")
    LAST_RUN=$(python3 -c "import json; d=json.load(open('$STATE')); print(d.get('last_run','') or '')" 2>/dev/null || echo "")
else
    PHASE="twice_daily"
    LAST_RUN=""
fi

echo "[$(ts)] Phase: $PHASE | Last run: $LAST_RUN" | tee -a "$LOG"

# --- Phase logic ---
if [ "$PHASE" = "three_day" ]; then
    # Only run if last run was >72 hours ago
    if [ -n "$LAST_RUN" ]; then
        NOW_EPOCH=$(date +%s)
        LAST_EPOCH=$(python3 -c "
from datetime import datetime, timezone
import sys
ts = '$LAST_RUN'
try:
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    print(int(dt.timestamp()))
except:
    print(0)
" 2>/dev/null || echo "0")
        DIFF=$(( NOW_EPOCH - LAST_EPOCH ))
        THREE_DAYS=259200
        if [ "$DIFF" -lt "$THREE_DAYS" ]; then
            HOURS_LEFT=$(( (THREE_DAYS - DIFF) / 3600 ))
            echo "[$(ts)] 3-day mode: next run in ~${HOURS_LEFT}h — skipping" | tee -a "$LOG"
            exit 0
        fi
    fi
    echo "[$(ts)] 3-day mode: running now" | tee -a "$LOG"
else
    # twice_daily mode: launchd fires every 6h — we always run
    echo "[$(ts)] Twice-daily mode: running now" | tee -a "$LOG"
fi

# --- Execute scraper ---
cd "$ROOT" || exit 1
"$PYTHON" "$SCRAPER" 2>&1 | tee -a "$LOG"
EXIT_CODE=${PIPESTATUS[0]}

echo "[$(ts)] Scraper exited with code: $EXIT_CODE" | tee -a "$LOG"
exit $EXIT_CODE
