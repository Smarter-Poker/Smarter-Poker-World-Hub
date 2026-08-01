#!/usr/bin/env python3
"""
daily_venue_scraper_daemon.py — Autonomous orchestrator for Daily Venue Scraper
Runs enrichment + missing-venue passes until 100% coverage is achieved.
Auto-restarts on crash. Logs all activity.

Usage:
    nohup .venv/bin/python3 scripts/daily_venue_scraper_daemon.py &
    .venv/bin/python3 scripts/daily_venue_scraper_daemon.py --once   # single round
"""

import argparse, json, os, subprocess, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PYTHON       = str(PROJECT_ROOT / ".venv" / "bin" / "python3")
SCRAPER      = str(PROJECT_ROOT / "scripts" / "daily_venue_scraper.py")
LOGDIR       = PROJECT_ROOT / "data" / "tournament-logs"
LOGDIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)

master_log = LOGDIR / f"daily_venue_scraper_{datetime.now().strftime('%Y%m%d')}.log"

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(master_log, "a") as f:
        f.write(line + "\n")

def sb_get(path: str) -> list:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())

PAGE = 1000  # PostgREST enforces a project-level max_rows cap (1000 here)

def sb_get_paged(path: str, params: str, order: str = "id") -> list:
    """Page through a PostgREST query.

    A single limit=10000 request is silently truncated at the server's max_rows,
    so every venue past the cap looked 'missing' and got re-scraped forever.

    The explicit order= is required: limit/offset paging without a stable sort
    lets Postgres return rows in a different order per request, which silently
    skips and duplicates rows across pages — reintroducing the same phantom
    'missing' venues the paging was added to fix.
    """
    rows, offset = [], 0
    while True:
        page = sb_get(f"{path}{params}&order={order}&limit={PAGE}&offset={offset}")
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE

def get_coverage() -> dict | None:
    """Current coverage stats, or None when the DB could not be queried.

    Returning a fabricated {'missing': 999, ...} made a transient Supabase
    outage look like a catastrophic coverage regression, drove both scrape
    phases against a database we could not reach, and produced bogus
    'no progress' streaks that terminated the daemon.
    """
    try:
        recs = sb_get_paged("venue_daily_tournaments",
                            "?select=venue_id,venue_name&is_active=eq.true")
        ids_with   = {r["venue_id"]   for r in recs if r.get("venue_id")}
        names_with = {r["venue_name"] for r in recs if r.get("venue_name")}

        skip = {"charity","charity_event","charity_game","series","poker_series",
                "tour","poker_tour","traveling_tour","regional_tour","tournament_series"}
        venues = sb_get_paged("poker_venues",
                              "?select=id,name,venue_type&is_active=eq.true&has_tournaments=eq.true")
        card_rooms = [v for v in venues if (v.get("venue_type") or "").lower() not in skip]
        missing    = [v for v in card_rooms if v["id"] not in ids_with and v["name"] not in names_with]

        # Low-score venues (need enrichment)
        low = sb_get_paged("venue_daily_tournaments",
                           "?select=venue_id&is_active=eq.true&scrape_completeness_score=lt.60")
        low_ids = {r["venue_id"] for r in low if r.get("venue_id")}

        return {
            "total_card_rooms": len(card_rooms),
            "with_data": len(card_rooms) - len(missing),
            "missing": len(missing),
            "low_score": len(low_ids),
            "pct": round((len(card_rooms) - len(missing)) / len(card_rooms) * 100, 1) if card_rooms else 0,
        }
    except Exception as e:
        log(f"  [COVERAGE ERR] {e}")
        return None

def run_pass(mode: str, round_num: int, args: list = None) -> bool:
    """Run one scraper pass. Returns True if process exited cleanly."""
    log_file = LOGDIR / f"dvs_{mode}_r{round_num}_{datetime.now().strftime('%H%M%S')}.log"
    cmd = [PYTHON, SCRAPER] + (args or [])
    log(f"  → Running: {' '.join(cmd[2:])}")
    log(f"  → Log: {log_file.name}")
    try:
        with open(log_file, "w") as lf:
            proc = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT, timeout=7200)
        # Show last 3 lines of pass log
        try:
            lines = log_file.read_text().strip().split("\n")
            for line in lines[-3:]:
                if line.strip(): log(f"    {line.strip()}")
        except: pass
        return proc.returncode == 0
    except subprocess.TimeoutExpired:
        log(f"  ⚠️  Pass timed out after 2h")
        return False
    except Exception as e:
        log(f"  ❌ Pass error: {e}")
        return False

def main():
    p = argparse.ArgumentParser(description="Daily Venue Scraper — Autonomous Daemon")
    p.add_argument("--once",       action="store_true", help="Run one round and exit")
    p.add_argument("--max-rounds", type=int, default=30, help="Max rounds (default 30)")
    p.add_argument("--state",      default="", help="Limit to one state")
    args = p.parse_args()

    state_args = ["--state", args.state] if args.state else []

    log("=" * 68)
    log("DAILY VENUE SCRAPER — AUTONOMOUS DAEMON")
    log(f"  Scraper:    {SCRAPER}")
    log(f"  Max rounds: {args.max_rounds}")
    log(f"  State:      {args.state or 'ALL'}")
    log(f"  Master log: {master_log}")
    log("=" * 68)

    round_num = 0
    no_progress_streak = 0
    MAX_NO_PROGRESS = 5  # stop after 5 rounds with no improvement
    query_fail_streak = 0
    MAX_QUERY_FAILS = 5
    pass_failures = 0

    while round_num < args.max_rounds:
        round_num += 1
        log("")
        log(f"══ ROUND {round_num}/{args.max_rounds} ══════════════════════════════════════════")

        # Coverage check — a failed query means we do NOT know the coverage, so
        # the round is skipped and retried rather than run against invented counts.
        cov = get_coverage()
        if cov is None:
            query_fail_streak += 1
            log(f"  WARN: Coverage query FAILED ({query_fail_streak}/{MAX_QUERY_FAILS}) — "
                f"skipping this round, not scraping against unknown state")
            if query_fail_streak >= MAX_QUERY_FAILS:
                log(f"  ERROR: Coverage unavailable {MAX_QUERY_FAILS} rounds in a row — aborting")
                sys.exit(1)
            time.sleep(120)
            continue
        query_fail_streak = 0
        log(f"  Coverage: {cov['with_data']}/{cov['total_card_rooms']} venues "
            f"({cov['pct']}%) | Missing: {cov['missing']} | Low-score: {cov['low_score']}")

        # Done?
        if cov["missing"] == 0 and cov["low_score"] == 0:
            log("🎉 100% COVERAGE + FULL ENRICHMENT ACHIEVED!")
            break

        prev_missing = cov["missing"]
        prev_low     = cov["low_score"]
        made_progress = False

        # ── Phase A: Enrich low-score venues ────────────────────────────────
        if cov["low_score"] > 0:
            log(f"\n  Phase A: ENRICH — {cov['low_score']} venues with score < 60")
            ok = run_pass("enrich", round_num, ["--enrich", "--min-score", "60", "--pass-limit", "2"] + state_args)
            if not ok: pass_failures += 1
            log(f"  Enrich pass {'completed' if ok else 'FAILED (non-zero exit)'}")
            time.sleep(15)

        # ── Phase B: Hunt missing venues ────────────────────────────────────
        if cov["missing"] > 0:
            log(f"\n  Phase B: MISSING — {cov['missing']} venues with no data")
            ok = run_pass("missing", round_num, ["--pass-limit", "2"] + state_args)
            if not ok: pass_failures += 1
            log(f"  Missing pass {'completed' if ok else 'FAILED (non-zero exit)'}")
            time.sleep(15)

        # Post-round check
        new_cov = get_coverage()
        if new_cov is None:
            log(f"  WARN: Post-round coverage query failed — progress unknown this round")
            if args.once:
                log("  --once mode: exiting after one round")
                break
            time.sleep(120)
            continue
        log(f"\n  After round {round_num}:")
        log(f"    Missing:   {prev_missing} → {new_cov['missing']} ({prev_missing - new_cov['missing']:+d})")
        log(f"    Low-score: {prev_low} → {new_cov['low_score']} ({prev_low - new_cov['low_score']:+d})")
        log(f"    Coverage:  {new_cov['pct']}%")

        if new_cov["missing"] < prev_missing or new_cov["low_score"] < prev_low:
            made_progress = True
            no_progress_streak = 0
        else:
            no_progress_streak += 1
            log(f"  ⚠️  No progress (streak: {no_progress_streak}/{MAX_NO_PROGRESS})")

        if no_progress_streak >= MAX_NO_PROGRESS:
            log(f"  🛑 {MAX_NO_PROGRESS} rounds with no progress — remaining venues may be unscrappable")
            log(f"  Final missing venues: {new_cov['missing']}")
            break

        if args.once:
            log("  --once mode: exiting after one round")
            break

        sleep_s = 30 if made_progress else 300
        log(f"  Sleeping {sleep_s}s before next round...")
        time.sleep(sleep_s)

    log("")
    log("=" * 68)
    final = get_coverage()
    log(f"DAILY VENUE SCRAPER DONE — {round_num} rounds, {pass_failures} failed passes")
    if final is None:
        log("Final coverage: UNKNOWN — the coverage query failed")
    else:
        log(f"Final: {final['with_data']}/{final['total_card_rooms']} venues ({final['pct']}%)")
        log(f"Missing: {final['missing']} | Low-score: {final['low_score']}")
    log("=" * 68)

    # The orchestrator above this daemon only sees the exit code.
    if pass_failures:
        log(f"Exiting non-zero: {pass_failures} scraper pass(es) failed.")
        sys.exit(1)
    if final is None:
        sys.exit(1)

if __name__ == "__main__":
    main()
