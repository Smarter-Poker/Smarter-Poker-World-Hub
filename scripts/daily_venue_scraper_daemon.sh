#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# run_until_100pct.sh — Autonomous tournament coverage orchestrator
# Runs enrichment + missing-venue passes until 100% coverage achieved.
# Restarts automatically on crash/exit. Logs everything.
# Usage: bash scripts/run_until_100pct.sh [&]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python3"
SCRIPT="$ROOT/scripts/daily_venue_scraper.py"
LOGDIR="$ROOT/data/tournament-logs"
MASTERLOG="$LOGDIR/orchestrator_$(date +%Y%m%d_%H%M%S).log"
LOCKFILE="/tmp/sp_scraper.lock"

mkdir -p "$LOGDIR"

# Browser self-heal — see scripts/ensure-browsers.sh
. "$ROOT/scripts/ensure-browsers.sh"
ensure_browsers "$ROOT"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$MASTERLOG"; }

# ── Prevent duplicate instances ───────────────────────────────────────────────
if [ -f "$LOCKFILE" ]; then
  OLD_PID=$(cat "$LOCKFILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    log "⚠️  Scraper already running (PID $OLD_PID). Exiting."
    exit 0
  fi
fi
echo $$ > "$LOCKFILE"
trap "rm -f $LOCKFILE; log 'Orchestrator stopped.'" EXIT

log "══════════════════════════════════════════════════════════════════"
log "TOURNAMENT COVERAGE ORCHESTRATOR — RUN UNTIL 100%"
log "Python: $PYTHON"
log "Script: $SCRIPT"
log "Log:    $MASTERLOG"
log "══════════════════════════════════════════════════════════════════"

check_network() {
  curl -s --max-time 5 https://1.1.1.1 >/dev/null 2>&1 && return 0
  return 1
}

get_missing_count() {
  "$PYTHON" - << 'PYEOF' 2>/dev/null
import json, urllib.request, os
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
URL="https://kuklfnapbkmacvwxktbh.supabase.co"
hdrs={"apikey":KEY,"Authorization":f"Bearer {KEY}"}

def get(path):
    req=urllib.request.Request(f"{URL}/rest/v1/{path}",headers=hdrs)
    with urllib.request.urlopen(req,timeout=20) as r: return json.loads(r.read())

recs=get("venue_daily_tournaments?select=venue_id,venue_name&limit=10000")
ids={r["venue_id"] for r in recs if r.get("venue_id")}
names={r["venue_name"] for r in recs if r.get("venue_name")}

venues=get("poker_venues?select=id,name,venue_type&is_active=eq.true&has_tournaments=eq.true&limit=2000")
skip={"charity","charity_event","charity_game","series","poker_series","tour","poker_tour","traveling_tour","regional_tour","tournament_series"}
card_rooms=[v for v in venues if (v.get("venue_type") or "").lower() not in skip]
missing=[v for v in card_rooms if v["id"] not in ids and v["name"] not in names]
print(len(missing))
PYEOF
}

get_low_score_count() {
  "$PYTHON" - << 'PYEOF' 2>/dev/null
import json, urllib.request
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
URL="https://kuklfnapbkmacvwxktbh.supabase.co"
hdrs={"apikey":KEY,"Authorization":f"Bearer {KEY}"}
req=urllib.request.Request(f"{URL}/rest/v1/venue_daily_tournaments?select=venue_id&is_active=eq.true&scrape_completeness_score=lt.50&limit=5000",headers=hdrs)
with urllib.request.urlopen(req,timeout=20) as r:
    rows=json.loads(r.read())
ids={r["venue_id"] for r in rows if r.get("venue_id")}
print(len(ids))
PYEOF
}

ROUND=0
MAX_ROUNDS=50  # safety cap — 50 rounds of passes should get us there

while [ $ROUND -lt $MAX_ROUNDS ]; do
  ROUND=$((ROUND + 1))
  log ""
  log "══ ROUND $ROUND ══════════════════════════════════════════════════════"

  # Wait for network
  NETRETRY=0
  while ! check_network; do
    NETRETRY=$((NETRETRY + 1))
    log "⚠️  No network (retry $NETRETRY/20)..."
    sleep 30
    [ $NETRETRY -ge 20 ] && { log "❌ Network unavailable after 10m — aborting"; exit 1; }
  done

  # Check current state
  MISSING=$(get_missing_count 2>/dev/null || echo "999")
  LOW_SCORE=$(get_low_score_count 2>/dev/null || echo "999")
  log "📊 Missing venues: $MISSING | Low-score venues (<50): $LOW_SCORE"

  if [ "$MISSING" -eq 0 ] && [ "$LOW_SCORE" -eq 0 ]; then
    log "🎉 100% COVERAGE + 100% ENRICHMENT ACHIEVED! All done."
    break
  fi

  # ── Phase A: Enrich low-score venues (score < 50) ──────────────────────────
  if [ "$LOW_SCORE" -gt 0 ]; then
    log "🔄 Phase A: ENRICH — $LOW_SCORE venues with score < 50"
    ENRICH_LOG="$LOGDIR/enrich_round${ROUND}_$(date +%H%M%S).log"
    "$PYTHON" "$SCRIPT" --enrich --min-score 50 --pass-limit 3 >> "$ENRICH_LOG" 2>&1 || true
    ENRICH_TAIL=$(tail -5 "$ENRICH_LOG" 2>/dev/null)
    log "  Enrich done. Last lines: $ENRICH_TAIL"
    sleep 10
  fi

  # ── Phase B: Hunt missing venues ───────────────────────────────────────────
  if [ "$MISSING" -gt 0 ]; then
    log "🔄 Phase B: MISSING — $MISSING venues with no data"
    MISS_LOG="$LOGDIR/missing_round${ROUND}_$(date +H%M%S).log"
    "$PYTHON" "$SCRIPT" --pass-limit 2 >> "$MISS_LOG" 2>&1 || true
    MISS_TAIL=$(tail -5 "$MISS_LOG" 2>/dev/null)
    log "  Missing pass done. Last lines: $MISS_TAIL"
    sleep 10
  fi

  # Re-check progress
  NEW_MISSING=$(get_missing_count 2>/dev/null || echo "999")
  NEW_LOW=$(get_low_score_count 2>/dev/null || echo "999")
  log "📊 After round $ROUND — Missing: $NEW_MISSING (was $MISSING) | Low-score: $NEW_LOW (was $LOW_SCORE)"

  # If no progress this round, wait longer before retry
  if [ "$NEW_MISSING" -eq "$MISSING" ] && [ "$NEW_LOW" -eq "$LOW_SCORE" ]; then
    log "⚠️  No progress this round — waiting 10m before retry"
    sleep 600
  else
    log "✅ Progress made — sleeping 30s"
    sleep 30
  fi

done

log ""
log "══════════════════════════════════════════════════════════════════"
log "ORCHESTRATOR FINISHED after $ROUND rounds"
FINAL_MISSING=$(get_missing_count 2>/dev/null || echo "?")
FINAL_LOW=$(get_low_score_count 2>/dev/null || echo "?")
log "Final state — Missing: $FINAL_MISSING | Low-score (<50): $FINAL_LOW"
log "══════════════════════════════════════════════════════════════════"
