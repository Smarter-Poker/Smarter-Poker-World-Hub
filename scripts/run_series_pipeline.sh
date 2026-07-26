#!/bin/zsh
# run_series_pipeline.sh
# Wrapper script for the poker series pipeline
# Runs discovery first, then event scraping
# Used by launchd (com.smarter-poker.series-scraper)

ROOT="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub"
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
DISCOVERY_EXIT=$?
echo "[$(ts)] Discovery exited with code: $DISCOVERY_EXIT" | tee -a "$LOG"

# Step 2: Event scraping — scrape events for all discovered series
echo "[$(ts)] Step 2: Running event scraper..." | tee -a "$LOG"
"$PYTHON" scripts/poker_series_scraper.py 2>&1 | tee -a "$LOG"
SCRAPER_EXIT=$?
echo "[$(ts)] Event scraper exited with code: $SCRAPER_EXIT" | tee -a "$LOG"

# Step 3: Enrichment — backfill venue data, extract guarantees
echo "[$(ts)] Step 3: Running enrichment pass..." | tee -a "$LOG"
"$PYTHON" scripts/enrich_series_from_evidence.py 2>&1 | tee -a "$LOG"
ENRICH_EXIT=$?
echo "[$(ts)] Enrichment exited with code: $ENRICH_EXIT" | tee -a "$LOG"

echo "==================================================================" | tee -a "$LOG"
echo "[$(ts)] Pipeline complete (discovery=$DISCOVERY_EXIT, scraper=$SCRAPER_EXIT, enrich=$ENRICH_EXIT)" | tee -a "$LOG"
echo "==================================================================" | tee -a "$LOG"

# Exit with worst code
exit $(( DISCOVERY_EXIT > SCRAPER_EXIT ? DISCOVERY_EXIT : SCRAPER_EXIT ))
