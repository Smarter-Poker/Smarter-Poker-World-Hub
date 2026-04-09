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
    'Prefer': 'return=minimal'
}

def delete_all(table):
    print(f"Purging {table}...")
    req = urllib.request.Request(f"{url}{table}?id=not.is.null", headers=headers, method='DELETE')
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Purged {table}. Status: {response.status}")
    except Exception as e:
        print(f"Failed to purge {table}. Error: {e}")

delete_all('poker_events')
delete_all('poker_series')
