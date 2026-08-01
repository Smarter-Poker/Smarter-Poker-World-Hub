import urllib.request, json, os

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/poker_venues?select=id,name,venue_type,has_tournaments,is_active&is_active=eq.true&order=id.asc&limit=2000",
    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
)
with urllib.request.urlopen(req, timeout=20) as r:
    venues = json.loads(r.read())

SKIP_TYPES = {"charity","charity_event","charity_game","series","poker_series","tour","poker_tour","traveling_tour","regional_tour","tournament_series"}

total = len(venues)
by_type = {}
for v in venues:
    vt = (v.get("venue_type") or "unknown").lower()
    by_type.setdefault(vt, []).append(v)

print(f"Total active venues: {total}\n")
print("=== VENUE TYPES ===")
for vt, vlist in sorted(by_type.items(), key=lambda x: -len(x[1])):
    print(f"  {vt}: {len(vlist)}")

# Check has_tournaments field
has_t_true = [v for v in venues if v.get("has_tournaments") == True]
has_t_false = [v for v in venues if v.get("has_tournaments") == False]
has_t_null = [v for v in venues if v.get("has_tournaments") is None]
print(f"\n=== HAS_TOURNAMENTS FIELD ===")
print(f"  has_tournaments=true:  {len(has_t_true)}")
print(f"  has_tournaments=false: {len(has_t_false)}")
print(f"  has_tournaments=null:  {len(has_t_null)}")

# Show venues with has_tournaments=false
if has_t_false:
    print(f"\n=== VENUES MARKED NO TOURNAMENTS ({len(has_t_false)}) ===")
    for v in has_t_false[:30]:
        print(f"  [{v['id']}] {v['name']} ({v.get('venue_type','')})")

# Card rooms after ALL exclusions
card_rooms = [v for v in venues 
              if (v.get("venue_type") or "").lower() not in SKIP_TYPES
              and v.get("has_tournaments") != False]
excluded_type = [v for v in venues if (v.get("venue_type") or "").lower() in SKIP_TYPES]
excluded_no_tourn = [v for v in venues 
                     if (v.get("venue_type") or "").lower() not in SKIP_TYPES
                     and v.get("has_tournaments") == False]

print(f"\n=== FINAL TARGET COUNT ===")
print(f"  Total active:              {total}")
print(f"  Excluded (tour/series):    {len(excluded_type)}")
print(f"  Excluded (no tournaments): {len(excluded_no_tourn)}")
print(f"  ─────────────────────────────")
print(f"  SCRAPE TARGETS:            {len(card_rooms)}")
print(f"  Batches of 25:             {(len(card_rooms) + 24) // 25}")
