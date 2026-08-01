import urllib.request, json, os
SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
SKIP_TYPES = {"charity","charity_event","charity_game","series","poker_series","tour","poker_tour","traveling_tour","regional_tour","tournament_series"}

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/poker_venues?select=id,name,venue_type&is_active=eq.true&order=id.asc&limit=2000",
    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
)
with urllib.request.urlopen(req, timeout=20) as r:
    venues = json.loads(r.read())

total = len(venues)
card_rooms = [v for v in venues if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
excluded = total - len(card_rooms)
batches = (len(card_rooms) + 24) // 25  # ceiling division

print(f"Total active venues:     {total}")
print(f"Card rooms (targets):    {len(card_rooms)}")
print(f"Excluded (tours/series): {excluded}")
print(f"Batches of 25:           {batches}")
print(f"Est. time per venue:     ~25 sec (5 sources × ~5 sec each)")
print(f"Est. time per batch:     ~10 min")
print(f"Est. total time:         ~{batches * 10} min ({batches * 10 / 60:.1f} hours)")
print(f"Chunk flush interval:    Every 25 venues (built-in)")
