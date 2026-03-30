import json
import os
import requests
import hashlib
from dotenv import load_dotenv

load_dotenv('.env.local')
supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

with open('tmp/needs_logo.json', 'r') as f:
    venues = json.load(f)

GLOBE_HASH = "b8a0bf3"
count = 0

for v in venues:
    website = v['website']
    if not website: continue
    if not website.startswith('http'): website = 'https://' + website
    
    # Try Google Favicon V2 (256px) - Very high res
    url = f"https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={website}&size=256"
    
    try:
        b = requests.get(url, timeout=10).content
        hash_val = hashlib.md5(b).hexdigest()
        
        # Check if it's a generic google fallback (usually blue globe or single letter blocks we can ban)
        if len(b) > 850 and not hash_val.startswith('b8a0') and not hash_val.startswith('3bd7'):
            # Good logo!
            print(f"[{v['name']}] Found valid Google favicon ({len(b)} bytes)")
            requests.patch(f"{supabase_url}/rest/v1/poker_venues?id=eq.{v['id']}", headers={
                "apikey": supabase_key, "Authorization": f"Bearer {supabase_key}", "Content-Type": "application/json"
            }, json={
                "profile_photo_url": url,
                "data_quality": "scraped_verified",
                "scrape_batch_id": "google-favicon-v2"
            })
            count += 1
        else:
             print(f"[{v['name']}] Generic globe detected ({len(b)} bytes) - skipping")
    except Exception as e:
        print(f"[{v['name']}] error: {e}")

print(f"Resolved {count} logos via Google Favicons.")
