import json, os, requests
from dotenv import load_dotenv
load_dotenv('.env.local')
url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
with open('tmp/needs_logo.json', 'r') as f:
    venues = json.load(f)
for v in venues:
    requests.patch(f"{url}/rest/v1/poker_venues?id=eq.{v['id']}", headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json={"is_active": True})
