#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# daily_venue_scraper_daemon.sh — Autonomous tournament coverage orchestrator
# Runs enrichment + missing-venue passes until 100% coverage achieved.
# Restarts automatically on crash/exit. Logs everything.
# Usage: bash scripts/daily_venue_scraper_daemon.sh [&]
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

# Both counters PAGE through PostgREST. A single limit=10000 request is
# silently truncated at the server's max_rows cap (1000 on this project), so
# every venue past the cap was classified as 'missing' and re-scraped forever.
# On any query error the helper exits non-zero and prints NOTHING — the caller
# must skip the round, never substitute a fabricated 999.
get_missing_count() {
  "$PYTHON" - << 'PYEOF'
import json, sys, urllib.request
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
URL="https://kuklfnapbkmacvwxktbh.supabase.co"
hdrs={"apikey":KEY,"Authorization":f"Bearer {KEY}"}
PAGE=1000

def get(path):
    req=urllib.request.Request(f"{URL}/rest/v1/{path}",headers=hdrs)
    with urllib.request.urlopen(req,timeout=30) as r: return json.loads(r.read())

def get_paged(path, params, order="id"):
    # order= is mandatory: limit/offset paging without a stable sort skips and
    # duplicates rows across pages.
    rows, offset = [], 0
    while True:
        page = get(f"{path}{params}&order={order}&limit={PAGE}&offset={offset}")
        rows.extend(page)
        if len(page) < PAGE: return rows
        offset += PAGE

try:
    recs=get_paged("venue_daily_tournaments","?select=venue_id,venue_name&is_active=eq.true")
    ids={r["venue_id"] for r in recs if r.get("venue_id")}
    names={r["venue_name"] for r in recs if r.get("venue_name")}

    venues=get_paged("poker_venues","?select=id,name,venue_type&is_active=eq.true&has_tournaments=eq.true")
    skip={"charity","charity_event","charity_game","series","poker_series","tour","poker_tour","traveling_tour","regional_tour","tournament_series"}
    card_rooms=[v for v in venues if (v.get("venue_type") or "").lower() not in skip]
    missing=[v for v in card_rooms if v["id"] not in ids and v["name"] not in names]
except Exception as e:
    print(f"missing-count query failed: {e.__class__.__name__}: {e}", file=sys.stderr)
    sys.exit(1)
print(len(missing))
PYEOF
}

get_low_score_count() {
  "$PYTHON" - << 'PYEOF'
import json, sys, urllib.request
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
URL="https://kuklfnapbkmacvwxktbh.supabase.co"
hdrs={"apikey":KEY,"Authorization":f"Bearer {KEY}"}
PAGE=1000
try:
    ids, offset = set(), 0
    while True:
        req=urllib.request.Request(
            f"{URL}/rest/v1/venue_daily_tournaments?select=venue_id&is_active=eq.true"
            f"&scrape_completeness_score=lt.50&order=id&limit={PAGE}&offset={offset}",
            headers=hdrs)
        with urllib.request.urlopen(req,timeout=30) as r:
            rows=json.loads(r.read())
        ids.update(r["venue_id"] for r in rows if r.get("venue_id"))
        if len(rows) < PAGE: break
        offset += PAGE
except Exception as e:
    print(f"low-score query failed: {e.__class__.__name__}: {e}", file=sys.stderr)
    sys.exit(1)
print(len(ids))
PYEOF
}

# Echo a count only if it is really a number — an empty/garbage capture used to
# flow straight into `[ "$MISSING" -eq 0 ]`.
is_number() { case "${1:-}" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

ROUND=0
MAX_ROUNDS=50  # safety cap — 50 rounds of passes should get us there
QUERY_FAILS=0
MAX_QUERY_FAILS=5
SCRAPER_FAILS=0
CONSEC_SCRAPER_FAILS=0
MAX_CONSEC_SCRAPER_FAILS=3

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

  # Check current state. A failed query means the coverage is UNKNOWN — skip the
  # round instead of inventing 999 and re-scraping against an unreachable DB.
  QUERY_OK=1
  MISSING=""
  LOW_SCORE=""
  if ! MISSING=$(get_missing_count 2>>"$MASTERLOG"); then QUERY_OK=0; fi
  if [ "$QUERY_OK" -eq 1 ]; then
    if ! LOW_SCORE=$(get_low_score_count 2>>"$MASTERLOG"); then QUERY_OK=0; fi
  fi
  if [ "$QUERY_OK" -eq 1 ]; then
    if ! is_number "$MISSING" || ! is_number "$LOW_SCORE"; then
      log "WARN: Coverage query returned non-numeric output (missing='$MISSING' low='$LOW_SCORE')"
      QUERY_OK=0
    fi
  fi

  if [ "$QUERY_OK" -eq 0 ]; then
    QUERY_FAILS=$((QUERY_FAILS + 1))
    log "WARN: Coverage query FAILED ($QUERY_FAILS/$MAX_QUERY_FAILS) — skipping this round"
    if [ "$QUERY_FAILS" -ge "$MAX_QUERY_FAILS" ]; then
      log "ERROR: Coverage unavailable $MAX_QUERY_FAILS rounds in a row — aborting"
      exit 1
    fi
    sleep 120
    continue
  fi
  QUERY_FAILS=0

  log "📊 Missing venues: $MISSING | Low-score venues (<50): $LOW_SCORE"
  ROUND_FAILED=0

  if [ "$MISSING" -eq 0 ] && [ "$LOW_SCORE" -eq 0 ]; then
    log "🎉 100% COVERAGE + 100% ENRICHMENT ACHIEVED! All done."
    break
  fi

  # ── Phase A: Enrich low-score venues (score < 50) ──────────────────────────
  if [ "$LOW_SCORE" -gt 0 ]; then
    log "🔄 Phase A: ENRICH — $LOW_SCORE venues with score < 50"
    ENRICH_LOG="$LOGDIR/enrich_round${ROUND}_$(date +%H%M%S).log"
    # Capture the REAL exit code — `|| true` made a crash on every round invisible.
    set +e
    "$PYTHON" "$SCRIPT" --enrich --min-score 50 --pass-limit 3 >> "$ENRICH_LOG" 2>&1
    ENRICH_RC=$?
    set -e
    ENRICH_TAIL=$(tail -5 "$ENRICH_LOG" 2>/dev/null || true)
    if [ "$ENRICH_RC" -ne 0 ]; then
      ROUND_FAILED=1
      SCRAPER_FAILS=$((SCRAPER_FAILS + 1))
      log "  ERROR: Enrich pass FAILED (exit $ENRICH_RC). Last lines: $ENRICH_TAIL"
    else
      log "  Enrich pass OK (exit 0). Last lines: $ENRICH_TAIL"
    fi
    sleep 10
  fi

  # ── Phase B: Hunt missing venues ───────────────────────────────────────────
  if [ "$MISSING" -gt 0 ]; then
    log "🔄 Phase B: MISSING — $MISSING venues with no data"
    # +%H%M%S — the missing % produced literal 'H' filenames that collided
    # across hours, interleaving different rounds in one appended log.
    MISS_LOG="$LOGDIR/missing_round${ROUND}_$(date +%H%M%S).log"
    set +e
    "$PYTHON" "$SCRIPT" --pass-limit 2 >> "$MISS_LOG" 2>&1
    MISS_RC=$?
    set -e
    MISS_TAIL=$(tail -5 "$MISS_LOG" 2>/dev/null || true)
    if [ "$MISS_RC" -ne 0 ]; then
      ROUND_FAILED=1
      SCRAPER_FAILS=$((SCRAPER_FAILS + 1))
      log "  ERROR: Missing pass FAILED (exit $MISS_RC). Last lines: $MISS_TAIL"
    else
      log "  Missing pass OK (exit 0). Last lines: $MISS_TAIL"
    fi
    sleep 10
  fi

  if [ "$ROUND_FAILED" -eq 1 ]; then
    CONSEC_SCRAPER_FAILS=$((CONSEC_SCRAPER_FAILS + 1))
    log "WARN: Round $ROUND had a failing scraper pass (streak $CONSEC_SCRAPER_FAILS/$MAX_CONSEC_SCRAPER_FAILS)"
    if [ "$CONSEC_SCRAPER_FAILS" -ge "$MAX_CONSEC_SCRAPER_FAILS" ]; then
      log "ERROR: Scraper failed $MAX_CONSEC_SCRAPER_FAILS rounds in a row — aborting"
      exit 1
    fi
  else
    CONSEC_SCRAPER_FAILS=0
  fi

  # Re-check progress — again, no invented counts.
  PROGRESS_OK=1
  if ! NEW_MISSING=$(get_missing_count 2>>"$MASTERLOG"); then PROGRESS_OK=0; fi
  if [ "$PROGRESS_OK" -eq 1 ]; then
    if ! NEW_LOW=$(get_low_score_count 2>>"$MASTERLOG"); then PROGRESS_OK=0; fi
  fi
  if [ "$PROGRESS_OK" -eq 1 ] && { ! is_number "$NEW_MISSING" || ! is_number "$NEW_LOW"; }; then
    PROGRESS_OK=0
  fi

  if [ "$PROGRESS_OK" -eq 0 ]; then
    log "WARN: Post-round coverage query failed — progress unknown, retrying in 2m"
    sleep 120
    continue
  fi

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
log "ORCHESTRATOR FINISHED after $ROUND rounds ($SCRAPER_FAILS failed scraper passes)"
FINAL_MISSING=$(get_missing_count 2>>"$MASTERLOG" || echo "unknown-query-failed")
FINAL_LOW=$(get_low_score_count 2>>"$MASTERLOG" || echo "unknown-query-failed")
log "Final state — Missing: $FINAL_MISSING | Low-score (<50): $FINAL_LOW"
log "══════════════════════════════════════════════════════════════════"

# The only reported outcome used to be 'FINISHED', printed regardless.
if [ "$SCRAPER_FAILS" -gt 0 ]; then
  log "Exiting non-zero: $SCRAPER_FAILS scraper pass(es) failed."
  exit 1
fi
