import json, urllib.request, re

URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def normalize(name):
    if not name: return ''
    return re.sub(r'[^a-z0-9 ]', '', name.lower().replace('&','and').replace("'",'').replace('-',' ')).strip()

def get_live_tables():
    req = urllib.request.Request(f"{URL}/rest/v1/venue_live_tables?select=bravo_slug,venue_name", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def get_poker_venues():
    # Fetch all, assume less than 1000
    req = urllib.request.Request(f"{URL}/rest/v1/poker_venues?select=id,name,slug&limit=1000", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def update_venue_slug(id, slug):
    req = urllib.request.Request(
        f"{URL}/rest/v1/poker_venues?id=eq.{id}", 
        method="PATCH", 
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}
    )
    data = json.dumps({"slug": slug}).encode('utf-8')
    urllib.request.urlopen(req, data=data)

print("Fetching data...")
live = get_live_tables()
venues = get_poker_venues()

slug_map = {}
for l in live:
    norm = normalize(l.get('venue_name'))
    slug = l.get('bravo_slug')
    # Use exact match or Bravo/PA slug
    if norm and slug:
        slug_map[norm] = slug

# Additional manual matches
MANUAL = {
    "wind creek chicago southland": "wind-creek-chicago-southland",
    "rivers casino des plaines": "rivers-casino-des-plaines"
}
for k, v in MANUAL.items():
    slug_map[k] = v

updates = 0
for v in venues:
    # If it already has a slug and matches something perfectly, we can still update if wrong, but let's just update all where slug differs
    norm = normalize(v.get('name'))
    if norm in slug_map:
        target_slug = slug_map[norm]
        if v.get('slug') != target_slug:
            print(f"Updating {v.get('name')}: {v.get('slug')} -> {target_slug}")
            update_venue_slug(v['id'], target_slug)
            updates += 1
    else:
        # Fallback to PA stripping
        # Sometimes PA adds "Hotel & Casino" etc. Let's try some fuzzy matching if needed.
        pass

print(f"Updated {updates} venues.")
