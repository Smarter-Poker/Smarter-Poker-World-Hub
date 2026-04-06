import urllib.request, json, os, datetime
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path('.env.local'))
load_dotenv()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

# Fetch the most recent 15 records from Bravo
req = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/venue_live_tables?source=eq.bravo&select=venue_name,game_name,tables_running,players_waiting,scrape_timestamp&order=scrape_timestamp.desc&limit=15',
    method='GET', headers=headers
)
try:
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read().decode('utf-8'))
    print(f'========== LATEST 15 BRAVO DATABASE RECORDS ==========')
    for row in data:
        print(f'{row["venue_name"]:>30} | {row["game_name"][:20]:<20} | Tables: {row["tables_running"]} | Wait: {row["players_waiting"]}')
except Exception as e:
    print(f'Error fetching Bravo data: {e}')
