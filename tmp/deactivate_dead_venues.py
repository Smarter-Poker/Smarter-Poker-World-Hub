import json
import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')
supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

with open('tmp/needs_logo.json', 'r') as f:
    venues = json.load(f)

for v in venues:
    vid = v['id']
    name = v['name']
    website = v['website']
    
    is_dead = False
    
    if not website:
        is_dead = True
    else:
        if not website.startswith('http'):
            website = 'https://' + website
        try:
            res = requests.get(website, timeout=5)
            # if the site returns some valid HTTP status, it exists
            if res.status_code >= 400:
                is_dead = True
        except:
            is_dead = True
            
    if is_dead:
        print(f"[{name}] is dead. Deactivating.")
        requests.patch(f"{supabase_url}/rest/v1/poker_venues?id=eq.{vid}", headers={
            "apikey": supabase_key, "Authorization": f"Bearer {supabase_key}", "Content-Type": "application/json"
        }, json={"is_active": False})
    else:
        print(f"[{name}] is alive. Need logo still.")
