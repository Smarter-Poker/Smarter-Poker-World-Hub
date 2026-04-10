#!/usr/bin/env python3
"""Quick post-task verification: Check how many venues are now in the scraper."""
import json, urllib.request, os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
env_path = PROJECT_ROOT / ".env.local"
SUPABASE_URL = ""
SUPABASE_KEY = ""

if env_path.exists():
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

# Check active venues in scraper pool (has_tournaments=true, is_active=true)
active = sb_get("poker_venues", "?select=id,name,venue_type&is_active=eq.true&has_tournaments=eq.true&order=id.asc&limit=2000")
active = [v for v in active if (v.get("venue_type") or "").lower() not in SKIP_TYPES]

# Check venues with data
venue_ids = [v["id"] for v in active]
venues_with_data_ids = set()
for i in range(0, len(venue_ids), 100):
    chunk = venue_ids[i:i+100]
    rows = sb_get("venue_daily_tournaments", f"?select=venue_id&venue_id=in.({','.join(str(x) for x in chunk)})&limit=2000")
    for r in rows:
        if r.get("venue_id"): venues_with_data_ids.add(r["venue_id"])

pct = (len(venues_with_data_ids) / len(active) * 100) if active else 0

print(f"""
===========================================
POST-TASK VERIFICATION
===========================================
Active venues in scraper pool: {len(active)}
Venues with tournament data:   {len(venues_with_data_ids)}
Coverage:                      {pct:.1f}%
Zero-result still in scraper:  {len(active) - len(venues_with_data_ids)}
===========================================
""")

# Also check pre-2025 data
old = sb_get("venue_daily_tournaments", "?select=id&event_date=lt.2025-01-01&limit=1000")
print(f"Pre-2025 records remaining:    {len(old)}")
