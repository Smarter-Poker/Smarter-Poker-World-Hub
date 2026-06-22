import urllib.request
import json
import ssl

token = "sbp_0a796d56b4147b2e520718b24885d0cef7072ca3"
url = "https://api.supabase.com/v1/projects/nscdmxldtyszyvcxxwgr/database/query"
headers = {
    "Authorization": f"Bearer {token}", 
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

with open('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/supabase/migrations/20260622180000_mlb_player_directory_optimizations.sql', 'r') as f:
    sql = f.read()

data = json.dumps({"query": sql}).encode('utf-8')
req = urllib.request.Request(url, data=data, headers=headers, method='POST')
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

try:
    with urllib.request.urlopen(req, context=ctx) as response:
        print(f"OK: {response.read().decode('utf-8')}")
except Exception as e:
    if hasattr(e, 'read'):
        print(f"ERROR: {e.read().decode('utf-8')}")
    else:
        print(f"ERROR: {e}")
