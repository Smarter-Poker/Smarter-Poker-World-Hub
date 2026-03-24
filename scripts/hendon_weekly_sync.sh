#!/bin/bash
# Weekly HendonMob Auto-Sync — Scrapes ALL linked users
# Run via macOS LaunchAgent or crontab
#
# LAW: REAL DATA ONLY. This script only saves explicitly labeled data
# scraped from HendonMob. No guessing, no simulating, no assuming.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_PYTHON="$PROJECT_DIR/.venv/bin/python3"
SCRAPER="$PROJECT_DIR/scripts/hendon_scraper_scrapling.py"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/hendon_sync_$(date +%Y%m%d_%H%M%S).log"

# Load env
if [ -f "$PROJECT_DIR/.agent/skills/credentials/.env" ]; then
    export $(grep -v '^#' "$PROJECT_DIR/.agent/skills/credentials/.env" | xargs)
fi

# Ensure log dir
mkdir -p "$LOG_DIR"

echo "════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "  HendonMob Weekly Auto-Sync — $(date)" | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

# Run bulk scraper
"$VENV_PYTHON" "$SCRAPER" --all 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Sync completed at $(date)" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE"
