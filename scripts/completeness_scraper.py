#!/usr/bin/env python3
"""
completeness_scraper.py — Secondary Completeness Pass for Daily Venue Tournament Scraper

PURPOSE:
  Targets venues that had ZERO tournament data returned on their last full scrape.
  Runs twice daily until coverage reaches 100%, then auto-switches to every 3 days.

OPERATION:
  - Queries DB for venues with has_tournaments=true but schedule_last_scraped_at NULL
    OR venues that returned 0 tournaments in the last 24h cycle.
  - Re-attempts scraping with more aggressive slug fallbacks.
  - Updates coverage percentage in a state file.
  - LaunchAgent fires at 8 AM and 6 PM daily.
  - When coverage >= 100% it writes the "3-day mode" flag to state file.
    The plist then elongates its StartInterval to 259200s (3 days).

STATE FILE: data/tournament-logs/completeness_state.json
  {
    "phase": "twice_daily" | "three_day",
    "last_run": "ISO timestamp",
    "coverage_pct": 61.8,
    "venues_with_data": 281,
    "venues_zero": 182,
    "total_venues": 463,
    "consecutive_100pct_runs": 0  -- when >= 2 we switch to 3-day mode
  }

USAGE:
  .venv/bin/python3 scripts/completeness_scraper.py
  .venv/bin/python3 scripts/completeness_scraper.py --dry-run
  .venv/bin/python3 scripts/completeness_scraper.py --force-full   # ignore state, scrape all zero-result
"""

import sys, os, re, json, time, uuid, argparse, urllib.request, urllib.error, hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Paths & Config ────────────────────────────────────────────────────────────
PROJECT_ROOT  = Path(__file__).resolve().parent.parent
LOG_DIR       = PROJECT_ROOT / "data" / "tournament-logs"
STATE_FILE    = LOG_DIR / "completeness_state.json"
LOG_DIR.mkdir(parents=True, exist_ok=True)

run_ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_FILE      = LOG_DIR / f"completeness_{run_ts}.log"

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""))

if not SUPABASE_URL or not SUPABASE_KEY:
    # Try .env.local
    env_path = PROJECT_ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                k = k.strip(); v = v.strip().strip('"').strip("'")
                if k == "NEXT_PUBLIC_SUPABASE_URL" and not SUPABASE_URL:
                    SUPABASE_URL = v
                if k in ("SUPABASE_SERVICE_ROLE_KEY",) and not SUPABASE_KEY:
                    SUPABASE_KEY = v
                if k == "NEXT_PUBLIC_SUPABASE_ANON_KEY" and not SUPABASE_KEY:
                    SUPABASE_KEY = v

SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

# ── Coverage thresholds ───────────────────────────────────────────────────────
COVERAGE_100_PCT_THRESHOLD = 95.0   # treat ≥95% as "100% coverage" (some venues simply have no tournaments)
CONSECUTIVE_RUNS_TO_SWITCH = 2      # after 2 consecutive ≥95% runs → switch to 3-day mode
THREE_DAY_SECONDS          = 259200 # 3 days in seconds

# ── Logging ───────────────────────────────────────────────────────────────────
_log_fh = open(LOG_FILE, "w", buffering=1)

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    _log_fh.write(line + "\n")

# ── Supabase helpers ──────────────────────────────────────────────────────────
def sb_get(table: str, params: str = "") -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    try:
        req = urllib.request.Request(url, headers={**SB_HDRS, "Prefer": "count=exact"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"  [SB GET ERR] {e}")
        return []

def sb_upsert(table: str, records: list) -> int:
    if not records:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(records).encode()
    try:
        req = urllib.request.Request(url, data=data, method="POST", headers=SB_HDRS)
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        return len(records)
    except Exception as e:
        log(f"  [SB UPSERT ERR] {e}")
        return 0

def sb_patch_venue(venue_id: int, patch: dict):
    url = f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{venue_id}"
    data = json.dumps(patch).encode()
    try:
        req = urllib.request.Request(url, data=data, method="PATCH", headers=SB_HDRS)
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
    except Exception as e:
        log(f"  [SB PATCH VENUE ERR] {e}")

# ── State management ──────────────────────────────────────────────────────────
def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except:
            pass
    return {
        "phase": "twice_daily",
        "last_run": None,
        "coverage_pct": 0.0,
        "venues_with_data": 0,
        "venues_zero": 0,
        "total_venues": 0,
        "consecutive_100pct_runs": 0,
    }

def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))
    log(f"  State saved → phase={state['phase']}, coverage={state['coverage_pct']:.1f}%, "
        f"consecutive_100pct={state['consecutive_100pct_runs']}")

# ── Coverage analysis ─────────────────────────────────────────────────────────
def analyze_coverage() -> dict:
    """
    Query the DB for:
      - Total active card-room venues (has_tournaments=true, not tour/series)
      - Venues that have at least 1 tournament record in venue_daily_tournaments
      - Venues with zero records (zero-result set)
    Returns coverage dict.
    """
    log("Analyzing current coverage from database...")

    SKIP_TYPES = {"tour", "series", "festival", "circuit", "event_only"}

    # All active card-room venues
    all_venues = sb_get(
        "poker_venues",
        "?select=id,name,state,city,venue_type,website,poker_atlas_url,pokeratlas_url,"
        "pokeratlas_slug,schedule_last_scraped_at,has_tournaments"
        "&is_active=eq.true&has_tournaments=eq.true&order=id.asc&limit=2000"
    )
    all_venues = [v for v in all_venues if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
    log(f"  Total active card-room venues: {len(all_venues)}")

    if not all_venues:
        return {"total": 0, "with_data": 0, "zero": [], "coverage_pct": 0.0}

    venue_ids = [v["id"] for v in all_venues]

    # Venues that have at least 1 tournament record
    # Query distinct venue_ids from venue_daily_tournaments
    # Use chunking to avoid URL length limits
    venues_with_data_ids = set()
    chunk_size = 100
    for i in range(0, len(venue_ids), chunk_size):
        chunk = venue_ids[i:i+chunk_size]
        id_list = ",".join(str(x) for x in chunk)
        rows = sb_get(
            "venue_daily_tournaments",
            f"?select=venue_id&venue_id=in.({id_list})&limit=2000"
        )
        for r in rows:
            if r.get("venue_id"):
                venues_with_data_ids.add(r["venue_id"])

    zero_venues = [v for v in all_venues if v["id"] not in venues_with_data_ids]
    pct = (len(venues_with_data_ids) / len(all_venues) * 100) if all_venues else 0.0

    log(f"  Venues with data:   {len(venues_with_data_ids)}")
    log(f"  Venues with zero:   {len(zero_venues)}")
    log(f"  Coverage:           {pct:.1f}%")

    return {
        "total": len(all_venues),
        "with_data": len(venues_with_data_ids),
        "zero": zero_venues,
        "coverage_pct": pct,
    }

# ── Import scraping engine from main daemon ───────────────────────────────────
def get_scrape_engine():
    """
    Import the scraping components from the main tournament-schedule-daemon.py.
    We reuse scrape_venue(), flush_chunk(), DaemonSessionManager, etc.
    """
    import importlib.util
    daemon_path = PROJECT_ROOT / "scripts" / "tournament-schedule-daemon.py"
    spec = importlib.util.spec_from_file_location("daemon_module", daemon_path)
    mod = importlib.util.module_from_spec(spec)
    # Suppress daemon's own argument parsing by mocking sys.argv
    orig_argv = sys.argv[:]
    sys.argv = [str(daemon_path)]
    try:
        spec.loader.exec_module(mod)
    except SystemExit:
        pass  # daemon calls sys.exit on --enrich; we ignore that
    finally:
        sys.argv = orig_argv
    return mod

# ── Main scraper ──────────────────────────────────────────────────────────────
def run_completeness_pass(dry_run: bool = False, force_full: bool = False):
    log("=" * 70)
    log("SECONDARY COMPLETENESS SCRAPER")
    log(f"  PID:      {os.getpid()}")
    log(f"  Mode:     {'DRY RUN' if dry_run else 'LIVE'}")
    log(f"  Log:      {LOG_FILE.name}")
    log("=" * 70)

    # Load state
    state = load_state()
    log(f"\nPhase: {state['phase']} | Last run: {state['last_run']} | "
        f"Coverage: {state['coverage_pct']:.1f}%")

    # Analyze current coverage
    coverage = analyze_coverage()
    current_pct = coverage["coverage_pct"]
    zero_venues = coverage["zero"]

    if not zero_venues and not force_full:
        log(f"\n✅ All venues have tournament data! Coverage: {current_pct:.1f}%")
        state["consecutive_100pct_runs"] = state.get("consecutive_100pct_runs", 0) + 1
        state["coverage_pct"] = current_pct
        state["venues_with_data"] = coverage["with_data"]
        state["venues_zero"] = 0
        state["total_venues"] = coverage["total"]
        state["last_run"] = datetime.now(timezone.utc).isoformat()

        if state["consecutive_100pct_runs"] >= CONSECUTIVE_RUNS_TO_SWITCH:
            state["phase"] = "three_day"
            log(f"🎯 SWITCHING TO 3-DAY MODE — {state['consecutive_100pct_runs']} consecutive full coverage runs!")
        save_state(state)
        return

    if current_pct >= COVERAGE_100_PCT_THRESHOLD and not force_full:
        log(f"\n✅ Coverage at {current_pct:.1f}% (≥ threshold {COVERAGE_100_PCT_THRESHOLD}%)")
        state["consecutive_100pct_runs"] = state.get("consecutive_100pct_runs", 0) + 1
        state["coverage_pct"] = current_pct
        state["venues_with_data"] = coverage["with_data"]
        state["venues_zero"] = len(zero_venues)
        state["total_venues"] = coverage["total"]
        state["last_run"] = datetime.now(timezone.utc).isoformat()

        if state["consecutive_100pct_runs"] >= CONSECUTIVE_RUNS_TO_SWITCH:
            state["phase"] = "three_day"
            log(f"🎯 SWITCHING TO 3-DAY MODE via {state['consecutive_100pct_runs']} consecutive high-coverage runs!")
        save_state(state)
        return

    # Reset consecutive counter (not at 100%)
    state["consecutive_100pct_runs"] = 0

    log(f"\n🔍 {len(zero_venues)} venues need scraping — targeting now...")

    # Load the scraping engine
    log("\nLoading scraping engine from tournament-schedule-daemon.py...")
    try:
        mod = get_scrape_engine()
        scrape_venue  = mod.scrape_venue
        flush_chunk   = mod.flush_chunk
        DaemonSessionManager = mod.DaemonSessionManager
        fetch_hendonmob      = mod.fetch_hendonmob
        fetch_cardplayer     = mod.fetch_cardplayer
    except Exception as e:
        log(f"  ❌ Failed to load scraping engine: {e}")
        log("  Attempting direct import fallback...")
        sys.exit(1)

    # Create session
    session_mgr = DaemonSessionManager()
    if not session_mgr.connect():
        log("  ❌ Session failed to start — aborting")
        sys.exit(1)

    batch_id = str(uuid.uuid4())
    log(f"  Batch ID: {batch_id}")

    # Fetch global HendonMob + CardPlayer maps once
    log("\nFetching global source maps (HendonMob, CardPlayer)...")
    hm_map = fetch_hendonmob(session_mgr)
    cp_map = fetch_cardplayer(session_mgr)
    log(f"  HendonMob: {len(hm_map)} entries | CardPlayer: {len(cp_map)} entries")

    # Process zero-result venues in chunks of 25
    CHUNK_SIZE = 25
    chunk_buf  = []
    total_upserted = 0
    newly_found = 0

    for i, venue in enumerate(zero_venues):
        name = venue.get("name", "Unknown")
        log(f"\n[{i+1}/{len(zero_venues)}] {name} ({venue.get('city','')}, {venue.get('state','')})")

        # Session health check every 50 venues
        if i > 0 and i % 50 == 0:
            log("  ♻️ Session refresh at #{}".format(i))
            try: session_mgr.disconnect()
            except: pass
            time.sleep(2)
            session_mgr.connect()

        try:
            session_mgr.ensure_connected()
            if not dry_run:
                vr = scrape_venue(venue, session_mgr, batch_id, hm_map, cp_map)
                chunk_buf.append(vr)
                if vr["found"]:
                    newly_found += 1
                    log(f"  ✅ FOUND {len(vr['records'])} records!")
            else:
                log(f"  [DRY RUN] Would scrape {name}")
                chunk_buf.append({"name": name, "vid": venue.get("id"), "found": False, "records": []})
        except Exception as e:
            log(f"  ❌ Error: {e}")
            chunk_buf.append({"name": name, "vid": venue.get("id"), "found": False, "records": []})

        # Flush every 25
        if len(chunk_buf) >= CHUNK_SIZE:
            if not dry_run:
                n = flush_chunk(chunk_buf, batch_id)
                total_upserted += n
            chunk_buf = []

        time.sleep(2)  # Respectful rate limit

    # Flush remainder
    if chunk_buf and not dry_run:
        n = flush_chunk(chunk_buf, batch_id)
        total_upserted += n

    try: session_mgr.disconnect()
    except: pass

    # Re-analyze coverage after scrape
    log("\n" + "=" * 70)
    log("POST-SCRAPE COVERAGE ANALYSIS")
    post_coverage = analyze_coverage()
    new_pct = post_coverage["coverage_pct"]

    log(f"\n  Before: {current_pct:.1f}%  →  After: {new_pct:.1f}%")
    log(f"  Newly found venues: {newly_found}")
    log(f"  Records upserted:   {total_upserted}")
    log(f"  Still zero:         {len(post_coverage['zero'])}")

    # Update state
    state["coverage_pct"]    = new_pct
    state["venues_with_data"]= post_coverage["with_data"]
    state["venues_zero"]     = len(post_coverage["zero"])
    state["total_venues"]    = post_coverage["total"]
    state["last_run"]        = datetime.now(timezone.utc).isoformat()

    if new_pct >= COVERAGE_100_PCT_THRESHOLD:
        state["consecutive_100pct_runs"] = state.get("consecutive_100pct_runs", 0) + 1
        if state["consecutive_100pct_runs"] >= CONSECUTIVE_RUNS_TO_SWITCH:
            state["phase"] = "three_day"
            log(f"\n🎯 COVERAGE REACHED! SWITCHING TO 3-DAY AUTOPILOT MODE!")
    else:
        state["consecutive_100pct_runs"] = 0

    save_state(state)

    log("\n" + "=" * 70)
    log("COMPLETENESS SCRAPER DONE")
    log(f"  Phase:    {state['phase']}")
    log(f"  Coverage: {new_pct:.1f}%")
    log("=" * 70)


# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Secondary Completeness Scraper")
    p.add_argument("--dry-run", action="store_true", help="No DB writes")
    p.add_argument("--force-full", action="store_true", help="Ignore state, scrape all zero-result venues")
    args = p.parse_args()
    run_completeness_pass(dry_run=args.dry_run, force_full=args.force_full)
