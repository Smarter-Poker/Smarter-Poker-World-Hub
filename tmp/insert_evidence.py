import json
import os
import urllib.request
from pathlib import Path

SUPA_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
with open('.env.local') as f:
    SUPA_KEY = [line.split('=')[1].strip() for line in f if 'SUPABASE_SERVICE_ROLE_KEY' in line][0]

SB_HEADERS = {
    'apikey': SUPA_KEY,
    'Authorization': f'Bearer {SUPA_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

def sb_upsert(table, records, on_conflict):
    CHUNK = 50
    total = 0
    url = f'{SUPA_URL}/rest/v1/{table}?on_conflict={on_conflict}'
    
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        body = json.dumps(chunk, default=str).encode('utf-8')
        req = urllib.request.Request(url, data=body, method='POST', headers=SB_HEADERS)
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=30)
                total += len(chunk)
                break
            except Exception as e:
                err_msg = e.read().decode()[:200] if hasattr(e, 'read') else str(e)
                if attempt == 2:
                    print(f'    [UPSERT FAIL] {table}: {err_msg}')
                else:
                    pass
    return total

def main():
    evidence_dir = Path('data/scrape-evidence/series-v6')
    all_series = []
    all_events = []
    for f in evidence_dir.glob('*.json'):
        data = json.loads(f.read_text())
        if 'series' in data:
            all_series.append(data['series'])
        if 'events' in data:
            all_events.extend(data['events'])
            
    if all_series:
        print(f"Upserting {len(all_series)} Series")
        print(f"Result: {sb_upsert('poker_series', all_series, 'series_uid')}")
    if all_events:
        print(f"Upserting {len(all_events)} Events")
        print(f"Result: {sb_upsert('poker_events', all_events, 'event_uid')}")

main()
