#!/bin/bash
# Weekly HendonMob Auto-Sync — Scrapes ALL linked users
# Run via macOS LaunchAgent or crontab
#
# LAW: REAL DATA ONLY. This script only saves explicitly labeled data
# scraped from HendonMob. No guessing, no simulating, no assuming.
#
# The script used to print "Sync completed" no matter what: the scraper was
# piped straight into `tee`, so `$?` read tee's status and a Python traceback
# looked identical to a clean run. It now captures ${PIPESTATUS[0]} and exits
# non-zero on failure so the scheduler and the log both show a failed sync.

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_PYTHON="$PROJECT_DIR/.venv/bin/python3"
SCRAPER="$PROJECT_DIR/scripts/hendon_scraper_scrapling.py"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/hendon_sync_$(date +%Y%m%d_%H%M%S).log"
ENV_FILE="$PROJECT_DIR/.agent/skills/credentials/.env"

# Keep this many past sync logs; older ones are pruned each run.
LOG_KEEP=14

# Ensure log dir
mkdir -p "$LOG_DIR"

# Load env.
# `export $(grep -v '^#' "$ENV_FILE" | xargs)` put every secret in the file into
# the process table as a visible argument to `export`, and word-split any value
# containing spaces or quotes (silently mangling the rest of the environment).
# Sourcing with allexport does neither.
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE" \
        || echo "WARNING: $ENV_FILE did not load cleanly (malformed line?) — some credentials may be missing" | tee -a "$LOG_FILE"
    set +a
else
    echo "WARNING: credentials file not found at $ENV_FILE" | tee -a "$LOG_FILE"
fi

echo "====================================================" | tee -a "$LOG_FILE"
echo "  HendonMob Weekly Auto-Sync — $(date)" | tee -a "$LOG_FILE"
echo "====================================================" | tee -a "$LOG_FILE"

if [ ! -x "$VENV_PYTHON" ]; then
    echo "FATAL: venv python not found at $VENV_PYTHON" | tee -a "$LOG_FILE"
    exit 1
fi
if [ ! -f "$SCRAPER" ]; then
    echo "FATAL: scraper not found at $SCRAPER" | tee -a "$LOG_FILE"
    exit 1
fi

# Run bulk scraper. PIPESTATUS[0] is the scraper's status, not tee's.
"$VENV_PYTHON" "$SCRAPER" --all 2>&1 | tee -a "$LOG_FILE"
SCRAPER_EXIT=${PIPESTATUS[0]}

# Rotate: keep only the most recent $LOG_KEEP sync logs (one was written per run
# and nothing ever removed them).
find "$LOG_DIR" -maxdepth 1 -type f -name 'hendon_sync_*.log' -print 2>/dev/null \
    | sort -r \
    | tail -n +$((LOG_KEEP + 1)) \
    | while IFS= read -r old_log; do rm -f "$old_log"; done

echo "" | tee -a "$LOG_FILE"
if [ "$SCRAPER_EXIT" -eq 0 ]; then
    echo "Sync completed OK at $(date)" | tee -a "$LOG_FILE"
else
    echo "SYNC FAILED at $(date) — scraper exited ${SCRAPER_EXIT}" | tee -a "$LOG_FILE"
fi
echo "Log saved to: $LOG_FILE"

exit "$SCRAPER_EXIT"
