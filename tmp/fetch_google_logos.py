import json
import os
import requests
import re
from dotenv import load_dotenv

load_dotenv('.env.local')
supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

with open('tmp/needs_logo.json', 'r') as f:
    venues = json.load(f)

def get_google_image_url(query):
    url = "https://www.google.com/search?tbm=isch&q=" + requests.utils.quote(query)
    headers = {
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    }
    html = requests.get(url, headers=headers).text
    
    # Try to extract the direct image URL from the script blocks that embed it
    # Usually large image URLs are in arrays, staring with http
    matches = re.finditer(r'\["(https://[^"]+?)",(\d+),(\d+)\]', html)
    
    for match in matches:
        img_url = match.group(1).encode('utf-8').decode('unicode_escape')
        # filter out favicons, profile shapes, google's own stuff
        if 'gstatic.com' in img_url or 'google.com' in img_url:
            continue
        return img_url
    return None

def update_db(vid, url):
    data = {"profile_photo_url": url, "data_quality": "scraped_verified", "scrape_batch_id": "google-isch"}
    res = requests.patch(f"{supabase_url}/rest/v1/poker_venues?id=eq.{vid}", headers={
        "apikey": supabase_key, "Authorization": f"Bearer {supabase_key}", "Content-Type": "application/json"
    }, json=data)
    return res.status_code == 204

count = 0
for v in venues:
    query = v['name'] + " poker logo"
    print(f"Searching for: {query}")
    img = get_google_image_url(query)
    if img:
        print(f"   ✓ Found: {img[:80]}")
        update_db(v['id'], img)
        count += 1
    else:
        print(f"   ✗ Not found")
        
print(f"Successfully resolved {count} logos via Google Images.")
