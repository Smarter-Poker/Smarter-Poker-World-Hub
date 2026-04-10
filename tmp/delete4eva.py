#!/usr/bin/env python3
"""
delete4eva.py

1. Permanently deletes all venues that are marked as is_active=false (the 94 obsolete venues).
2. Regenerates the active venues list with ONLY ID, Venue Name, City, and State.
"""

import urllib.request, json, os

SUPABASE_URL = ""
SUPABASE_KEY = ""

env_path = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local"
with open(env_path) as f:
    for line in f.read().splitlines():
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
    "Prefer": "return=minimal"
}

def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"GET error: {e}")
        return []

# 1. Fetch inactive venues (the 94 we closed)
inactive = sb_get("poker_venues", "?select=id,name&is_active=eq.false&limit=1000")
print(f"Found {len(inactive)} inactive venues to DELETE4EVA.")

deleted_count = 0
for i in range(0, len(inactive), 50):
    batch = inactive[i:i+50]
    ids = ",".join(str(v['id']) for v in batch)
    
    del_url = f"{SUPABASE_URL}/rest/v1/poker_venues?id=in.({ids})"
    del_req = urllib.request.Request(del_url, method="DELETE", headers=SB_HDRS)
    try:
        with urllib.request.urlopen(del_req, timeout=30) as r:
            r.read()
            deleted_count += len(batch)
            print(f"  + Deleted batch of {len(batch)} venues.")
    except urllib.error.HTTPError as e:
        print(f"  ! HTTP Error on delete: {e.code} / {e.read().decode()}")
    except Exception as e:
        print(f"  ! Error on delete: {e}")

print(f"Successfully deleted {deleted_count} venues FOREVER.\n")


# 2. Get active venues
SKIP_TYPES = {"charity","charity_event","charity_game","series","poker_series",
              "tour","poker_tour","traveling_tour","regional_tour","tournament_series"}

final_active = sb_get("poker_venues", "?select=id,name,city,state,venue_type&is_active=eq.true&order=name.asc&limit=4000")
final_active = [v for v in final_active if (v.get("venue_type") or "").lower() not in SKIP_TYPES]

print(f"Regenerating final list for {len(final_active)} active venues...")

# 3. Write Artifact string
md_lines = []
md_lines.append("# Verified Active Venue List (Post-Deletion)")
md_lines.append("")
md_lines.append(f"**Total Active Venues on Platform: {len(final_active)}**")
md_lines.append("")
md_lines.append("| ID | Venue Name | City, State |")
md_lines.append("| :--- | :--- | :--- |")

for v in final_active:
    md_lines.append(f"| {v['id']} | {v['name']} | {v['city']}, {v['state']} |")

artifact_path = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/tmp/venue_list_clean.md"
with open(artifact_path, "w") as f:
    f.write("\n".join(md_lines))

print(f"Successfully wrote {artifact_path}")
