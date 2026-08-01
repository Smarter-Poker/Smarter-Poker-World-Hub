#!/usr/bin/env python3
"""Audit unscraped series — identify pa_ vs numeric, check venue Bravo coverage."""
import json, urllib.request, os

KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BASE = 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1'

def get(path):
    url = BASE + path
    req = urllib.request.Request(url, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    return json.loads(urllib.request.urlopen(req).read())

# Get unscraped series (without venue_name which may not be a column)
unscraped = get('/poker_series?select=series_uid,series_name,scrape_status,events_count,start_date,end_date,scrape_fail_count' + '&events_scraped=eq.false' + '&limit=300')
pa = [s for s in unscraped if s['series_uid'].startswith('pa_')]
num = [s for s in unscraped if s['series_uid'].isdigit()]

print(f'Total unscraped: {len(unscraped)}')
print(f'  pa_ prefix: {len(pa)}')
print(f'  Numeric ID: {len(num)}')
print()

print('=== UNSCRAPED pa_ SERIES (have PA slug => can construct URL) ===')
for r in pa:
    slug = r['series_uid'].replace('pa_', '')
    d = r.get('start_date') or 'nodate'
    name = (r.get('series_name') or slug)[:45]
    fc = r.get('scrape_fail_count', 0)
    print(f'  fail:{fc} | {d:10s} | {name}')

print()
print(f'=== NUMERIC UID — {len(num)} total (need Bravo/HendonMob/venue site) ===')
for r in num[:20]:
    name = (r.get('series_name') or '?')[:40]
    print(f'  {r["series_uid"]:6s} | {name}')

# Load master list to get venue_name for numeric series
master_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'master_poker_series_list.json')
if os.path.exists(master_path):
    with open(master_path) as f:
        mdata = json.load(f)
    entries = mdata.get('master_list', mdata) if isinstance(mdata, dict) else mdata
    # Build ID -> entry map
    master_map = {}
    for e in entries:
        master_map[str(e.get('id', ''))] = e
    
    print(f'\nMaster list: {len(entries)} entries')
    print()
    
    # For each numeric unscraped, check if master list has a source_url
    with_url = 0
    without_url = 0
    for r in num:
        uid = r['series_uid']
        m = master_map.get(uid, {})
        if m.get('source_url'):
            with_url += 1
        else:
            without_url += 1
    
    print(f'Numeric unscraped with master list source_url: {with_url}')
    print(f'Numeric unscraped WITHOUT any URL: {without_url}')
