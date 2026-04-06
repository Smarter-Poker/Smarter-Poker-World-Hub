import glob
import json
import urllib.request
import urllib.parse
from dotenv import dotenv_values

env = dotenv_values('.agent/skills/credentials/.env')
SUPABASE_URL = env.get('SUPABASE_URL')
SERVICE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY')

def get_venues_map():
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
    }
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/poker_venues?venue_type=eq.charity&select=id,name", headers=headers)
    resp = urllib.request.urlopen(req)
    venues = json.loads(resp.read().decode())
    return {v['name'].lower(): v['id'] for v in venues}

def main():
    venues_map = get_venues_map()
    import sys
    sys.path.append('.')
    from scripts.utils.tournament_upsert import upsert_tournament_python

    files = glob.glob('data/scrape-evidence/charity_v3_*_20260406_15*.json')
    inserted = 0

    print(f"Found {len(files)} evidence files")

    for f in files:
        if 'output' in f: continue
        with open(f, 'r') as file:
            data = json.loads(file.read())
        
        name = data.get('label')
        if not name: continue
        
        venue_id = venues_map.get(name.lower())
        if not venue_id:
            for vname, vid in venues_map.items():
                if vname in name.lower() or name.lower() in vname:
                    venue_id = vid
                    break
        
        if not venue_id:
            continue
            
        tourns = data.get('extracted_data', {}).get('tournaments', [])
        for t in tourns:
            buyin_val = t.get('buy_in') if t.get('buy_in') is not None else 0
            record = {
                'venue_id': venue_id,
                'venue_name': name,
                'day_of_week': t['day_of_week'],
                'start_time': t.get('start_time') or 'TBA',
                'buy_in': buyin_val,
                'game_type': t.get('game_type', 'NLH'),
                'guaranteed': t.get('guaranteed'),
                'starting_stack': t.get('starting_stack'),
                'blind_levels': t.get('blind_levels'),
                'format': t.get('format'),
                'tournament_name': t.get('tournament_name'),
                'source_url': data.get('scrape_url', ''),
                'is_active': True,
                'data_quality': 'scraped_verified',
                'scrape_html_hash': data.get('scrape_html_hash', ''),
                'scrape_timestamp': data.get('scrape_timestamp', ''),
                'scrape_batch_id': data.get('scrape_batch_id', ''),
            }
            res = upsert_tournament_python(SUPABASE_URL, SERVICE_KEY, record)
            if res in ('inserted', 'updated'):
                inserted += 1

    print(f"Total inserted: {inserted}")

if __name__ == '__main__':
    main()
