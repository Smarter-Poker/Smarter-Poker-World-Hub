#!/usr/bin/env python3
"""
Verify: Which of the 320 has_tournaments=true venues have actual data on their venue cards?
"""
import json, urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
env_path = PROJECT_ROOT / ".env.local"
SUPABASE_URL = ""
SUPABASE_KEY = ""

for line in env_path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k, _, v = line.partition("=")
    k = k.strip(); v = v.strip().strip('"').strip("'")
    if k == "NEXT_PUBLIC_SUPABASE_URL": SUPABASE_URL = v
    if k == "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY = v

SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "count=exact",
}

def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, headers=SB_HDRS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

SKIP_TYPES = {
    "charity","charity_event","charity_game","series","poker_series",
    "tour","poker_tour","traveling_tour","regional_tour","tournament_series",
}

# 1. Get all 320 active tournament venues
all_venues = sb_get(
    "poker_venues",
    "?select=id,name,state,city,venue_type"
    "&is_active=eq.true&has_tournaments=eq.true&order=name.asc&limit=2000"
)
all_venues = [v for v in all_venues if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
print(f"Total active tournament venues: {len(all_venues)}")

# 2. Check which have records in venue_daily_tournaments
venue_ids = [v["id"] for v in all_venues]
venues_with_data = set()
for i in range(0, len(venue_ids), 100):
    chunk = venue_ids[i:i+100]
    rows = sb_get("venue_daily_tournaments", f"?select=venue_id&venue_id=in.({','.join(str(x) for x in chunk)})&limit=2000")
    for r in rows:
        if r.get("venue_id"): venues_with_data.add(r["venue_id"])

with_data = [v for v in all_venues if v["id"] in venues_with_data]
without_data = [v for v in all_venues if v["id"] not in venues_with_data]

pct = (len(with_data) / len(all_venues) * 100) if all_venues else 0

print(f"\nVenues WITH tournament data on venue cards: {len(with_data)} ({pct:.1f}%)")
print(f"Venues WITHOUT tournament data:             {len(without_data)}")

print(f"\n{'='*70}")
print(f"VENUES WITH DATA ({len(with_data)}):")
print(f"{'='*70}")
for v in with_data:
    print(f"  ✅ [{v['id']}] {v['name']} — {v.get('city','')}, {v.get('state','')}")

print(f"\n{'='*70}")
print(f"VENUES WITHOUT DATA ({len(without_data)}):")
print(f"{'='*70}")
for v in without_data:
    print(f"  ❌ [{v['id']}] {v['name']} — {v.get('city','')}, {v.get('state','')}")
