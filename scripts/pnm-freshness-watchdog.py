#!/usr/bin/env python3
"""Daily Poker Near Me freshness watchdog.

Runs pnm_freshness_invariants() (one call, every PNM data domain) and pushes an
ntfy alert if ANY check fails. This is the process-independent guard: it checks
what actually landed in the database, not whether a daemon process is alive —
the distinction that let both the 8-week tournament outage and the 11-day
PokerAtlas freeze hide behind healthy-looking heartbeats.

Scheduled by com.smarter-poker.pnm-freshness-watchdog.plist (daily 08:00 local).
Never raises: a watchdog that can crash is a watchdog that can go silent.
"""
import json, os, sys, urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
ALERT_TOPIC = os.environ.get("SCRAPER_ALERT_TOPIC", "smarter-poker-scrapers")

def load_key():
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if key:
        return key
    try:
        for line in (PROJECT_ROOT / ".env.local").read_text().splitlines():
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None

def alert(msg: str):
    try:
        req = urllib.request.Request(
            f"https://ntfy.sh/{ALERT_TOPIC}", data=msg.encode()[:1500],
            headers={"Title": "PNM freshness watchdog", "Priority": "high",
                     "Tags": "warning,bar_chart"}, method="POST")
        # urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        pass

def main() -> int:
    key = load_key()
    if not key:
        alert("PNM watchdog could not load SUPABASE_SERVICE_ROLE_KEY — "
              ".env.local missing or gutted (this exact failure happened 2026-08-12).")
        print("FATAL: no service key"); return 1
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/rpc/pnm_freshness_invariants",
            data=b"{}", method="POST",
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            checks = json.loads(r.read())
    except Exception as e:
        alert(f"PNM watchdog could not run invariants: {str(e)[:200]}")
        print(f"ERROR calling invariants: {e}"); return 1

    failing = [c for c in checks if not c.get("ok")]
    for c in checks:
        print(f"  {'OK ' if c.get('ok') else 'FAIL'} {c['check_name']}: {c['detail']}")
    if failing:
        lines = "; ".join(f"{c['check_name']} ({c['detail']})" for c in failing)
        alert(f"{len(failing)}/{len(checks)} PNM freshness checks FAILING: {lines}")
        return 1
    print(f"all {len(checks)} checks pass")
    return 0

if __name__ == "__main__":
    sys.exit(main())
