#!/usr/bin/env python3
"""
apply_gemini_report.py

Parses the Gemini report findings to update 'is_active' and 'has_tournaments' flags on venues.
Then generates the final active venue list.
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

def sb_patch(table, params, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, data=json.dumps(data).encode(), method="PATCH", headers=SB_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except Exception as e:
        print(f"PATCH error: {e}")

closed_names = [
    "Casino Monterey", "Lake Elsinore Casino", "Seven Mile Casino", "Ace's Poker Room",
    "Oregon Poker Club", "Seven Feathers", "Spirit Mountain", "Muckleshoot Casino",
    "Tulalip Resort", "Sky Ute Casino", "Ute Mountain Casino", "Coeur d'Alene Casino",
    "Buffalo Thunder", "Inn of the Mountain Gods", "Dakota Sioux Casino", "Grand River Casino",
    "Royal River Casino", "Tin Lizzie Gaming", "Boot Hill Casino", "Bally's Evansville",
    "Blue Chip", "Harrahs Hoosier Park", "Hollywood", "Tropicana Evansville",
    "Catfish Bend Casino", "Mystic Lake", "Ameristar St Charles", "Harrahs Kansas City",
    "River City Casino", "Calder Casino", "Seminole Brighton", "Seminole Classic",
    "Seminole Immokalee", "Treasure Chest", "Club JAQK", "Golden Nugget LC",
    "Lady Luck Nemacolin", "Presque Isle Downs", "Valley Forge Casino", "Seneca Buffalo Creek",
    "Hollywood Bangor", "Caesars AC", "Harrahs AC", "Resorts Casino",
    # From paragraph text
    "Texas Station", "Eastside Cannery", "Binions", "Boomtown Reno", "Cannery", "Eldorado",
    "Eureka Mesquite", "Four Queens", "Fremont", "Jokers Wild", "Nugget Sparks",
    "Palace Station", "Sunset Station", "The D", "Treasure Island", "Barona Resort",
    "Cache Creek", "Crystal Park Casino", "Fantasy Springs", "Harrahs SoCal",
    "Normandie Casino", "Paiute Palace", "Rolling Hills Casino", "San Manuel",
    "Soboba Casino", "Spotlight 29", "Tachi Palace", "Twin Pine Casino", "Valley View Casino"
]

cash_names = [
    "500 Club Casino", "Diamond Jim's Casino", "Napa Valley Casino", "Limelight Card Room",
    "Kings Card Club", "Fallon Nugget", "Fernley Nugget", "Stagecoach Casino",
    "7 Cedars Casino", "Club 48 Poker Room", "Lancer Lanes", "Legends Casino",
    "Northern Quest", "Papa's Sports Lounge", "Choctaw Casino", "Choctaw Resort",
    "WinStar World Casino", "Jena Choctaw Pines"
]

all_venues = sb_get("poker_venues", "?select=id,name,city,state,is_active,has_tournaments,venue_type&limit=2000")

closed_ids = []
cash_ids = []

for v in all_venues:
    vname = v["name"]
    # check closed
    if any(c.lower() in vname.lower() or vname.lower() in c.lower() for c in closed_names):
        closed_ids.append(v)
    elif any(c.lower() in vname.lower() or vname.lower() in c.lower() for c in cash_names):
        cash_ids.append(v)

print(f"Matched {len(closed_ids)} venues to CLOSED:")
for v in closed_ids: print(f"  [{v['id']}] {v['name']} ({v['city']}, {v['state']})")

print(f"\nMatched {len(cash_ids)} venues to CASH ONLY:")
for v in cash_ids: print(f"  [{v['id']}] {v['name']} ({v['city']}, {v['state']})")

# Patch closed
if closed_ids:
    c_list = ",".join(str(v["id"]) for v in closed_ids)
    sb_patch("poker_venues", f"?id=in.({c_list})", {"is_active": False})

# Patch cash
if cash_ids:
    ca_list = ",".join(str(v["id"]) for v in cash_ids)
    sb_patch("poker_venues", f"?id=in.({ca_list})", {"has_tournaments": False})

print("\nPatched DB. Recalculating totals...")

# Recalculate Active venues (Not tour, series, charity)
SKIP_TYPES = {"charity","charity_event","charity_game","series","poker_series",
              "tour","poker_tour","traveling_tour","regional_tour","tournament_series"}

final_active = sb_get("poker_venues", "?select=id,name,city,state,venue_type,has_tournaments&is_active=eq.true&order=name.asc&limit=4000")
final_active = [v for v in final_active if (v.get("venue_type") or "").lower() not in SKIP_TYPES]

tourn_venues = [v for v in final_active if v.get("has_tournaments")]

print(f"\nTOTAL VENUE COUNT: {len(final_active)} active poker rooms live on the platform.")
print(f"OF THOSE: {len(tourn_venues)} are marked as having tournaments, and {len(final_active)-len(tourn_venues)} are cash-only hubs.")

# Save list to artifact file
with open("/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/tmp/active_venue_list.txt", "w") as f:
    f.write(f"Total Active Venues: {len(final_active)}\n")
    f.write("=======================================\n")
    for v in final_active:
        flag = "✅ Tournaments" if v.get("has_tournaments") else "💵 Cash Only"
        f.write(f"[{v['id']}] {v['name']} - {v['city']}, {v['state']} ({flag})\n")
        
print("Wrote active_venue_list.txt")
