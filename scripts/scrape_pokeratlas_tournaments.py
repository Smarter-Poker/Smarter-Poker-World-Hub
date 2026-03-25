#!/usr/bin/env python3
"""
POKERATLAS DAILY TOURNAMENT SCRAPER — Scrapling-powered with provenance
Scrapes daily tournament schedules from PokerAtlas venue tournament pages.

Usage:
  .venv/bin/python3 scripts/scrape_pokeratlas_tournaments.py --batch 5
  .venv/bin/python3 scripts/scrape_pokeratlas_tournaments.py --all
"""
import json, hashlib, sys, os, re, time, uuid
from datetime import datetime, timezone
from scrapling.fetchers import Fetcher
import urllib.request as urllib_req
from urllib.error import HTTPError

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
EVIDENCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scrape-evidence')
BATCH_ID = str(uuid.uuid4())

def fetch_supabase(path):
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/{path}',
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'})
    return json.loads(urllib_req.urlopen(req).read().decode())

def supabase_insert(table, records):
    """Insert via REST API — enforces triggers"""
    body = json.dumps(records).encode()
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/{table}',
        data=body, method='POST',
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    urllib_req.urlopen(req)

def supabase_sql(sql):
    data = json.dumps({'query': sql}).encode()
    req = urllib_req.Request(f'{SUPABASE_URL}/rest/v1/rpc/exec_sql', data=data,
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
                 'Content-Type': 'application/json'})
    urllib_req.urlopen(req)


def parse_tournaments_from_html(html, venue_name, pokeratlas_url, provenance):
    """Parse daily tournament data from a PokerAtlas venue tournament page"""
    tournaments = []
    html_hash = provenance['scrape_html_hash']
    timestamp = provenance['scrape_timestamp']
    
    # PokerAtlas tournament pages have structured tournament tables
    # Look for tournament entries with day, time, buy-in, game type
    
    # Pattern 1: JSON-LD tournament events
    jsonld_matches = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', 
        html, re.DOTALL
    )
    for jm in jsonld_matches:
        try:
            ld = json.loads(jm)
            if isinstance(ld, dict) and ld.get('@type') == 'Event':
                t = {
                    'venue_name': venue_name,
                    'data_quality': 'scraped_verified',
                    'scrape_html_hash': html_hash,
                    'scrape_timestamp': timestamp,
                    'scrape_batch_id': BATCH_ID,
                    'source_url': pokeratlas_url,
                }
                if ld.get('name'):
                    t['tournament_name'] = ld['name']
                if ld.get('offers', {}).get('price'):
                    try:
                        t['buy_in'] = int(float(ld['offers']['price']))
                    except: pass
                if ld.get('startDate'):
                    t['start_time'] = ld['startDate']
                tournaments.append(t)
        except json.JSONDecodeError:
            continue
    
    # Pattern 2: HTML table parsing for daily schedule
    # Look for patterns like: "Monday 11:00 AM $340 NLH"
    day_pattern = re.compile(
        r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)'
        r'.*?(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))'
        r'.*?\$(\d[\d,]*)'
        r'.*?(NLH|PLO|Omaha|Hold.?em|Stud|Mixed|HORSE|Turbo|6-Max|Deep\s*Stack)',
        re.DOTALL | re.IGNORECASE
    )
    
    for match in day_pattern.finditer(html):
        day, time_str, buyin, game = match.groups()
        t = {
            'venue_name': venue_name,
            'day_of_week': day,
            'start_time': time_str.strip(),
            'buy_in': int(buyin.replace(',', '')),
            'game_type': game.strip(),
            'data_quality': 'scraped_verified',
            'scrape_html_hash': html_hash,
            'scrape_timestamp': timestamp,
            'scrape_batch_id': BATCH_ID,
            'source_url': pokeratlas_url,
        }
        # Avoid duplicates within same venue/day/time
        key = f"{venue_name}_{day}_{time_str}_{buyin}"
        if not any(x.get('_key') == key for x in tournaments):
            t['_key'] = key
            tournaments.append(t)
    
    # Clean up internal keys
    for t in tournaments:
        t.pop('_key', None)
    
    return tournaments


def scrape_venue_tournaments(venue_name, pokeratlas_url):
    """Scrape tournaments for a single venue"""
    # Tournament page is at /tournaments
    slug = pokeratlas_url.rstrip('/').split('/')[-1]
    tourn_url = f'https://www.pokeratlas.com/poker-room/{slug}/tournaments'
    
    page = Fetcher.get(tourn_url, stealthy_headers=True)
    body = page.body or (page.text.encode() if page.text else b'')
    html = body.decode('utf-8', errors='ignore')
    
    provenance = {
        'scrape_url': tourn_url,
        'scrape_http_status': page.status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body).hexdigest(),
        'scrape_byte_count': len(body),
        'scrape_script': 'scripts/scrape_pokeratlas_tournaments.py',
        'scrape_batch_id': BATCH_ID,
    }
    
    if page.status != 200:
        return [], provenance
    
    tournaments = parse_tournaments_from_html(html, venue_name, tourn_url, provenance)
    return tournaments, provenance


def main():
    args = sys.argv[1:]
    batch_size = 5
    if '--batch' in args:
        batch_size = int(args[args.index('--batch') + 1])
    if '--all' in args:
        batch_size = 999
    
    # Get verified venues with PokerAtlas URLs
    venues = fetch_supabase(
        f'poker_venues?select=id,name,pokeratlas_url'
        f'&data_quality=eq.scraped_verified'
        f'&pokeratlas_url=not.is.null'
        f'&limit={batch_size}'
    )
    
    print(f'='*60)
    print(f'POKERATLAS TOURNAMENT SCRAPER — Batch {BATCH_ID[:8]}')
    print(f'='*60)
    print(f'Venues to process: {len(venues)}')
    
    total_tournaments = 0
    venues_with_data = 0
    
    for v in venues:
        name = v['name']
        pa_url = v['pokeratlas_url']
        
        print(f'\n  {name}:')
        try:
            tournaments, provenance = scrape_venue_tournaments(name, pa_url)
            
            if tournaments:
                # Save evidence
                safe_name = re.sub(r'[^a-z0-9]', '_', name.lower())[:30]
                ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                evidence_path = os.path.join(EVIDENCE_DIR, f'tournaments_{safe_name}_{ts}.json')
                os.makedirs(EVIDENCE_DIR, exist_ok=True)
                with open(evidence_path, 'w') as f:
                    json.dump({'provenance': provenance, 'tournaments': tournaments}, f, indent=2, default=str)
                
                # Insert to Supabase via REST API (triggers enforce provenance)
                try:
                    supabase_insert('venue_daily_tournaments', tournaments)
                    print(f'    ✅ {len(tournaments)} tournaments inserted')
                    total_tournaments += len(tournaments)
                    venues_with_data += 1
                except HTTPError as e:
                    err = e.read().decode()[:150]
                    print(f'    ❌ Insert failed: {err}')
            else:
                print(f'    ℹ️ No tournaments found on page (status: {provenance["scrape_http_status"]})')
        except Exception as e:
            print(f'    ❌ Error: {str(e)[:100]}')
        
        time.sleep(1.5)
    
    print(f'\n{"="*60}')
    print(f'RESULTS')
    print(f'{"="*60}')
    print(f'  Venues processed: {len(venues)}')
    print(f'  Venues with tournaments: {venues_with_data}')
    print(f'  Total tournaments inserted: {total_tournaments}')
    print(f'  Batch ID: {BATCH_ID}')


if __name__ == '__main__':
    main()
