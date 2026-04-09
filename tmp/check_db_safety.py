import os
import json
import urllib.request
import urllib.parse
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
    'Accept': 'application/json'
}

def count_stuff(table, group_by):
    req = urllib.request.Request(f"{url}{table}?select={group_by},count", headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            print(f"{table} grouping by {group_by}: {data}")
    except Exception as e:
        print(f"Error: {e}")

count_stuff('poker_series', 'data_quality')
