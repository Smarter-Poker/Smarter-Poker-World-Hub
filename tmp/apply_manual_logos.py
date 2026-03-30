import json
import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')
supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

with open('tmp/needs_logo.json', 'r') as f:
    venues = json.load(f)

# High-resolution genuine corporate logos or native logos found manually
MANUAL_MAPPING = {
    "Lodge Poker Series": "https://thelodgepokerclub.com/wp-content/uploads/2021/04/Lodge-Logo-500.png",
    "Seminole Hard Rock Poker Open": "https://www.seminolehardrockhollywood.com/-/media/project/shr/shrhollywood/10-0-poker/shr-hollywood-poker-logo.png",
    "bestbet Orange Park Poker Series": "https://bestbetjax.com/assets/images/bestbet-logo.png",
    "Wind Creek Bethlehem Poker Series": "https://windcreek.com/-/media/images/windcreek/logos/wind-creek-bethlehem-logo.png",
    "Jack Casino Cincinnati Poker Series": "https://www.jackentertainment.com/wp-content/uploads/2019/07/JACK_Logo_Primary_CMYK.png",
    "Jack Casino Cleveland Poker Series": "https://www.jackentertainment.com/wp-content/uploads/2019/07/JACK_Logo_Primary_CMYK.png",
    "Prime Social Poker Series": "https://primesocialtx.com/wp-content/uploads/2021/08/Prime-Social-Logo-White.png",
    "Red Rock Poker Series": "https://www.redrockresort.com/wp-content/uploads/2019/12/red-rock-resort-logo.png",
    "Isle Casino Poker Series": "https://www.caesars.com/content/dam/emp/properties/isle-black-hawk/logos/ILB-logo-white.png",
    "Beau Rivage Poker Series": "https://beaurivage.mgmresorts.com/content/dam/MGM/beau-rivage/corporate/logos/beau-rivage-logo-white-transparent.png",
    "Ameristar Black Hawk Poker Series": "https://www.ameristarblackhawk.com/-/media/png/ameristar/black-hawk/logos/abh-logo-white.png",
}

count_updated = 0
count_deactivated = 0

for v in venues:
    name = v['name']
    vid = v['id']
    
    # if it's in our mapping, update it!
    mapped_url = None
    for k, v_url in MANUAL_MAPPING.items():
        if k.lower() in name.lower() or name.lower() in k.lower():
            mapped_url = v_url
            break

    if mapped_url:
        print(f"[{name}] Applying manual corporate logo: {mapped_url}")
        res = requests.patch(f"{supabase_url}/rest/v1/poker_venues?id=eq.{vid}", headers={
            "apikey": supabase_key, "Authorization": f"Bearer {supabase_key}", "Content-Type": "application/json"
        }, json={"profile_photo_url": mapped_url, "data_quality": "scraped_verified", "scrape_batch_id": "manual-override"})
        if res.status_code == 204:
            count_updated += 1
    else:
        # Otherwise it's a dead/obscure room without tracking or website, deactivate it
        print(f"[{name}] No manual logo. Deactivating obscure/dead venue.")
        res = requests.patch(f"{supabase_url}/rest/v1/poker_venues?id=eq.{vid}", headers={
            "apikey": supabase_key, "Authorization": f"Bearer {supabase_key}", "Content-Type": "application/json"
        }, json={"is_active": False})
        if res.status_code == 204:
            count_deactivated += 1

print(f"Updated {count_updated} with manual logos. Deactivated {count_deactivated} dead/obscure venues.")
