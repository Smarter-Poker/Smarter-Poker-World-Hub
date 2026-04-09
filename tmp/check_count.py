import os
import urllib.request
import urllib.parse
import json
from pathlib import Path

ROOT = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub')
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'

creds = {}
if CRED_PATH.exists():
    for line in CRED_PATH.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            k, _, v = line.partition('=')
            creds[k.strip()] = v.strip().strip('"\'')

url = 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/'
headers = {
    'apikey': creds.get('SUPABASE_SERVICE_ROLE_KEY', ''),
    'Authorization': f"Bearer {creds.get('SUPABASE_SERVICE_ROLE_KEY', '')}",
    'Accept': 'application/json',
    'Prefer': 'count=exact'
}

def check_count(table):
    req = urllib.request.Request(f"{url}{table}?select=id&limit=1", headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            count = response.info().get('Content-Range', '').split('/')[-1]
            print(f"{table} count: {count}")
    except Exception as e:
        print(f"Failed count query: {e}")

check_count('poker_series')
check_count('poker_events')
