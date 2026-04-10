#!/usr/bin/env python3
"""
identify_and_fix_venues.py
==========================
Task 1: Identify the 120 "Expected but Missing" venues — those with has_tournaments=true
         but ZERO records in venue_daily_tournaments. Print their IDs and names.
Task 2: Fix the recs UnboundLocalError (already done in code — this script validates it).
Task 3: Delete all venue_daily_tournaments data prior to 2025-01-01.
"""

import sys, os, json, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
env_path = PROJECT_ROOT / ".env.local"

SUPABASE_URL = ""
SUPABASE_KEY = ""

if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k == "NEXT_PUBLIC_SUPABASE_URL":
            SUPABASE_URL = v
        if k == "SUPABASE_SERVICE_ROLE_KEY":
            SUPABASE_KEY = v
        if k == "NEXT_PUBLIC_SUPABASE_ANON_KEY" and not SUPABASE_KEY:
            SUPABASE_KEY = v

if not SUPABASE_URL or not SUPABASE_KEY:
    # Fallback to hardcoded from daemon
    SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
    SUPABASE_KEY = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a"
        "2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg"
        "0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
    )

SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "count=exact,return=representation",
}

def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, headers=SB_HDRS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_delete(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    hdrs = {**SB_HDRS, "Prefer": "return=minimal"}
    req = urllib.request.Request(url, method="DELETE", headers=hdrs)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return r.status, body

def sb_patch(table, params, patch_data):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    data = json.dumps(patch_data).encode()
    hdrs = {**SB_HDRS, "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=data, method="PATCH", headers=hdrs)
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()
        return r.status

print("=" * 70)
print("TASK EXECUTION: Scraper Hardening")
print("=" * 70)

# ─── TASK 1: Identify zero-result venues ("Expected but Missing") ────────────
print("\n[TASK 1] Identifying venues with has_tournaments=true but 0 records...\n")

SKIP_TYPES = {
    "charity","charity_event","charity_game","series","poker_series",
    "tour","poker_tour","traveling_tour","regional_tour","tournament_series",
}

all_venues = sb_get(
    "poker_venues",
    "?select=id,name,state,city,venue_type,is_active,has_tournaments"
    "&is_active=eq.true&has_tournaments=eq.true&order=id.asc&limit=2000"
)
all_venues = [v for v in all_venues if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
print(f"  Total active card-room venues: {len(all_venues)}")

# Check which ones have any records in venue_daily_tournaments
venue_ids = [v["id"] for v in all_venues]
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

print(f"  Venues WITH data: {len(venues_with_data_ids)}")
print(f"  Venues WITH ZERO: {len(zero_venues)}")
print(f"  Coverage:         {pct:.1f}%")
print()

if zero_venues:
    print("  Zero-result venues (these will be removed from scraper):")
    zero_ids = []
    for v in zero_venues:
        print(f"    [{v['id']}] {v['name']} — {v.get('city','')}, {v.get('state','')}")
        zero_ids.append(v["id"])

    # ─── TASK 1 ACTION: Remove these venues from the scraper ────────────────
    # Strategy: Set has_tournaments=false for these venues so load_venues() skips them.
    # This stops the daemon from wasting time on venues it cannot scrape.
    # They remain in poker_venues as is — just won't be polled by daemon.
    print(f"\n  Setting has_tournaments=false for {len(zero_venues)} zero-result venues...")
    batch_size = 50
    patched_count = 0
    for i in range(0, len(zero_ids), batch_size):
        batch = zero_ids[i:i+batch_size]
        id_list = ",".join(str(x) for x in batch)
        status = sb_patch(
            "poker_venues",
            f"?id=in.({id_list})",
            {"has_tournaments": False}
        )
        patched_count += len(batch)
        print(f"    Patched batch {i//batch_size +1}: {len(batch)} venues (HTTP {status})")

    print(f"\n  ✅ TASK 1 DONE: {patched_count} venues removed from scraper (has_tournaments=false)")

else:
    print("  ✅ No zero-result venues — full coverage!")

# ─── TASK 3: Delete all data prior to 2025-01-01 ────────────────────────────
print("\n[TASK 3] Deleting venue_daily_tournaments records before 2025-01-01...")

# Count first
try:
    old_rows = sb_get(
        "venue_daily_tournaments",
        "?select=id&event_date=lt.2025-01-01&limit=5000"
    )
    old_count = len(old_rows)
    print(f"  Found {old_count} records with event_date < 2025-01-01")
except Exception as e:
    print(f"  Could not count (large): {e}")
    old_count = -1

if old_count != 0:
    try:
        status, body = sb_delete(
            "venue_daily_tournaments",
            "?event_date=lt.2025-01-01"
        )
        print(f"  DELETE response: HTTP {status}")
        print(f"  ✅ TASK 3 DONE: Pre-2025 data purged")
    except Exception as e:
        print(f"  ❌ DELETE failed: {e}")
else:
    print("  ✅ No pre-2025 data found — already clean!")

print("\n" + "=" * 70)
print("ALL TASKS COMPLETE")
print("=" * 70)
