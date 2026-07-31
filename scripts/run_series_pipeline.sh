#!/bin/bash
# run_series_pipeline.sh
# Wrapper script for the poker series pipeline
# Runs discovery first, then event scraping
# Used by launchd (com.smarter-poker.series-scraper)

# `$?` after a `| tee` pipe reads tee's status (always 0), so every step used to
# report success even when Python crashed on its first line. pipefail + explicit
# ${PIPESTATUS[0]} capture fixes that. Requires bash (ensure-browsers.sh is bash too).
set -o pipefail

# Repo root: honour SERIES_PIPELINE_ROOT, else derive from this script's location,
# else fall back to the original hardcoded macOS path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SERIES_PIPELINE_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
[ -d "$ROOT" ] || ROOT="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub"
PYTHON="$ROOT/.venv/bin/python3"
LOG="$ROOT/data/tournament-logs/series_pipeline.log"

ts() { date "+%Y-%m-%d %H:%M:%S"; }

echo "==================================================================" | tee -a "$LOG"
echo "[$(ts)] Series Pipeline Started" | tee -a "$LOG"
echo "==================================================================" | tee -a "$LOG"

cd "$ROOT" || exit 1

# Browser self-heal — the whole pipeline crashed for weeks on a missing chromium.
. "$ROOT/scripts/ensure-browsers.sh"
ensure_browsers "$ROOT" 2>&1 | tee -a "$LOG"

# Step 1: Discovery — find new series from 4 sources
echo "[$(ts)] Step 1: Running series discovery..." | tee -a "$LOG"
"$PYTHON" scripts/scrape_poker_series_discovery.py 2>&1 | tee -a "$LOG"
DISCOVERY_EXIT=${PIPESTATUS[0]}
echo "[$(ts)] Discovery exited with code: $DISCOVERY_EXIT" | tee -a "$LOG"

# Step 2: Event scraping — scrape events for all discovered series
echo "[$(ts)] Step 2: Running event scraper..." | tee -a "$LOG"
"$PYTHON" scripts/poker_series_scraper.py 2>&1 | tee -a "$LOG"
SCRAPER_EXIT=${PIPESTATUS[0]}
echo "[$(ts)] Event scraper exited with code: $SCRAPER_EXIT" | tee -a "$LOG"

# Step 3: Enrichment — backfill venue data, extract guarantees
echo "[$(ts)] Step 3: Running enrichment pass..." | tee -a "$LOG"
"$PYTHON" scripts/enrich_series_from_evidence.py 2>&1 | tee -a "$LOG"
ENRICH_EXIT=${PIPESTATUS[0]}
echo "[$(ts)] Enrichment exited with code: $ENRICH_EXIT" | tee -a "$LOG"

echo "==================================================================" | tee -a "$LOG"
echo "[$(ts)] Pipeline complete (discovery=$DISCOVERY_EXIT, scraper=$SCRAPER_EXIT, enrich=$ENRICH_EXIT)" | tee -a "$LOG"
echo "==================================================================" | tee -a "$LOG"

# Exit with the worst code across ALL THREE steps — ENRICH_EXIT used to be
# ignored entirely, so a broken enrichment step was invisible to launchd.
WORST=$DISCOVERY_EXIT
[ "$SCRAPER_EXIT" -gt "$WORST" ] && WORST=$SCRAPER_EXIT
[ "$ENRICH_EXIT"  -gt "$WORST" ] && WORST=$ENRICH_EXIT
exit "$WORST"
