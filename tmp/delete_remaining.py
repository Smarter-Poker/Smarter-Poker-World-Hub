#!/usr/bin/env python3
import urllib.request, json
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
    "Prefer": "return=minimal"
}

req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/poker_venues?select=id,name&is_active=eq.false", headers=SB_HDRS)
inactive = json.loads(urllib.request.urlopen(req).read())

# List of depend tables to clear first if there's an FK error
dependent_tables = ["commander_waitlist_history", "commander_tables", "venue_daily_tournaments", "venue_favorites"]

deleted = 0
for v in inactive:
    vid = v['id']
    # Clear dependencies
    for dt in dependent_tables:
        dr = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{dt}?venue_id=eq.{vid}", method="DELETE", headers=SB_HDRS)
        try: urllib.request.urlopen(dr)
        except: pass
        
    # Delete venue
    dr = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{vid}", method="DELETE", headers=SB_HDRS)
    try: 
        urllib.request.urlopen(dr)
        deleted += 1
    except Exception as e:
        print(f"Failed to delete {vid} {v['name']}: {e}")

print(f"Deleted {deleted} remaining obsolete venues.")
