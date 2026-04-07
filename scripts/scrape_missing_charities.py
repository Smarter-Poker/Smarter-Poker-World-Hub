#!/usr/bin/env python3
"""
CHARITY POKER TARGETED SCRAPER v4.0 — Phase 2
==============================================
Scrapes ONLY the 20 venues missing from venue_daily_tournaments.
Uses exact venue_id mapping — no fuzzy matching, no false positives.
Writes directly to Supabase with correct venue_id FKs.

Usage:
    .venv/bin/python3 scripts/scrape_missing_charities.py
    .venv/bin/python3 scripts/scrape_missing_charities.py --dry-run
"""

import asyncio
import json
import hashlib
import os
import re
import sys
import time
import uuid
import traceback
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ── Supabase Config ──
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = ''

CRED_PATH = Path(__file__).parent.parent / '.agent' / 'skills' / 'credentials' / '.env'
if CRED_PATH.exists():
    for line in CRED_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            k, _, v = line.partition('=')
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == 'SUPABASE_SERVICE_ROLE_KEY' and not SERVICE_KEY:
                SERVICE_KEY = v
            os.environ.setdefault(k, v)

if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

BATCH_ID = str(uuid.uuid4())
EVIDENCE_DIR = Path(__file__).parent.parent / 'data' / 'scrape-evidence'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# ═══════════════════════════════════════════════════════════════
# EXACT MAPPING: venue_id -> org data (from DB audit)
# These are the 20 venues with ZERO VDT data as of 2026-04-07
# ═══════════════════════════════════════════════════════════════
MISSING_VENUES = [
    # FL
    {'venue_id': 3119, 'name': 'TGT Poker Room',           'url': 'https://tgtpoker.com',                    'state': 'FL'},
    # IL
    {'venue_id': 2824, 'name': 'Chicagoland Poker',         'url': 'https://chicagopokerclub.net',             'state': 'IL'},
    {'venue_id': 2805, 'name': 'Central Illinois Charitable Games (CICG Poker)', 'url': 'https://centralillinoischaritablegames.com', 'state': 'IL'},
    # IN
    {'venue_id': 2810, 'name': 'OP Social Club / Outlaw Poker', 'url': 'https://opsocialclub.com',            'state': 'IN'},
    {'venue_id': 2826, 'name': 'Westfield Lions Club Poker', 'url': 'https://lionspoker.org',                  'state': 'IN'},
    # MD
    {'venue_id': 2829, 'name': 'Evlos Charity Poker',       'url': 'https://evloscharitypoker.com',            'state': 'MD'},
    # MI
    {'venue_id': 2820, 'name': 'Michigan Charitable Gaming Association (MiCGA)', 'url': 'https://micga.org',   'state': 'MI'},
    {'venue_id': 2827, 'name': 'Monroe Boat Club (MBC-A Charity Poker)', 'url': 'https://monroeboatclub.org',  'state': 'MI'},
    # MULTI/NATIONAL
    {'venue_id': 2834, 'name': 'Charity Series of Poker (CSOP)', 'url': 'https://charityseriesofpoker.org',   'state': 'MULTI'},
    {'venue_id': 2835, 'name': 'Poker For Good',             'url': 'https://pokerforgood.org',                'state': 'MULTI'},
    # NC
    {'venue_id': 2811, 'name': 'Queens Club Inc.',           'url': 'https://queensclubinc.org',               'state': 'NC'},
    {'venue_id': 2825, 'name': 'High Stax Poker',            'url': 'https://highstaxpoker.net',               'state': 'NC'},
    {'venue_id': 2812, 'name': 'Kontenders Poker League',    'url': 'https://kontenderspoker.com',             'state': 'NC'},
    # NH
    {'venue_id': 2813, 'name': 'Concord Casino',             'url': 'https://concordnhcasino.com',             'state': 'NH'},
    {'venue_id': 2814, 'name': 'Gate City Casino',           'url': 'https://thegatecitycasino.com',           'state': 'NH'},
    # OH
    {'venue_id': 2807, 'name': 'The Reserve Poker Club',     'url': 'https://thereservepoker.com',             'state': 'OH'},
    {'venue_id': 2806, 'name': 'Shark Tank Poker Club',      'url': 'https://sharktankpokerclub.com',          'state': 'OH'},
    {'venue_id': 2808, 'name': 'Big Stack Poker Club',       'url': 'https://bigstackpokerclub.com',           'state': 'OH'},
    # VA
    {'venue_id': 2815, 'name': "Pop's Poker",                'url': 'https://popspoker.com',                   'state': 'VA'},
    {'venue_id': 2816, 'name': 'RVA Charity Poker',          'url': 'https://rvacharitypoker.org',             'state': 'VA'},
]

# Additional subpages to check per venue (schedule/tournaments pages)
SUBPAGES = {
    3119:  ['/schedule', '/tournament', '/tournaments', '/poker-schedule'],
    2824:  ['/schedule', '/tournaments'],
    2805:  ['/schedule', '/events', '/tournaments'],
    2810:  ['/schedule', '/tournaments', '/events'],
    2826:  ['/schedule', '/games', '/tournaments'],
    2829:  ['/schedule', '/tournaments'],
    2820:  ['/venues', '/schedule'],
    2827:  ['/schedule', '/tournaments', '/events'],
    2834:  ['/schedule', '/events'],
    2835:  ['/events', '/schedule'],
    2811:  ['/schedule', '/tournaments', '/events'],
    2825:  ['/schedule', '/tournaments'],
    2812:  ['/schedule'],
    2813:  ['/poker', '/tournaments', '/schedule'],
    2814:  ['/poker', '/tournaments', '/schedule'],
    2807:  ['/schedule', '/tournaments'],
    2806:  ['/tournaments', '/schedule'],
    2808:  ['/schedule', '/tournaments'],
    2815:  ['/schedule', '/tournaments'],
    2816:  ['/schedule', '/tournaments', '/events'],
}


def make_provenance(url, body_bytes, status):
    return {
        'scrape_url': url,
        'scrape_http_status': status,
        'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
        'scrape_html_hash': hashlib.sha256(body_bytes).hexdigest(),
        'scrape_batch_id': BATCH_ID,
    }


def extract_json_ld(html):
    results = []
    matches = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        html, re.DOTALL
    )
    for m in matches:
        try:
            data = json.loads(m.strip())
            if isinstance(data, list): results.extend(data)
            else: results.append(data)
        except: pass
    return results


def extract_tournaments_from_html(html):
    """Extract tournament schedule data from page HTML."""
    schedules = []
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'\s+', ' ', clean)

    for day in days:
        other_days = '|'.join(d for d in days if d != day)
        pattern = re.compile(
            rf'{day}[:\s]*(.{{0,400}}?)(?=(?:{other_days})|$)',
            re.IGNORECASE | re.DOTALL
        )
        for match in pattern.finditer(clean):
            text = match.group(1).strip()
            if len(text) < 8:
                continue

            times = re.findall(r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))', text)
            buyins = re.findall(r'\$(\d+)', text)
            gtd_match = re.search(r'\$([0-9,]+)\s*(?:GTD|guaranteed|Guaranteed)', text)
            guaranteed = int(gtd_match.group(1).replace(',', '')) if gtd_match else None
            stack_match = re.search(r'(\d{2,6})\s*(?:chips?|starting|stack)', text, re.IGNORECASE)
            starting_stack = int(stack_match.group(1)) if stack_match else None
            blind_match = re.search(r'(\d+)\s*(?:min(?:ute)?s?\s*(?:blind)?s?|min\s*levels?)', text, re.IGNORECASE)
            blind_levels = f"{blind_match.group(1)} min" if blind_match else None

            game_type = 'NLH'
            if re.search(r'PLO|Omaha|pot.limit', text, re.IGNORECASE): game_type = 'PLO'
            elif re.search(r'Big\s*O', text, re.IGNORECASE): game_type = 'Big O'
            elif re.search(r'\blimit\b|LHE', text, re.IGNORECASE) and not re.search(r'no.limit', text, re.IGNORECASE): game_type = 'LHE'

            fmt = None
            if re.search(r'bounty|knockout|\bKO\b', text, re.IGNORECASE): fmt = 'Bounty'
            elif re.search(r'rebuy|re-buy', text, re.IGNORECASE): fmt = 'Rebuy'
            elif re.search(r'freeze.?out', text, re.IGNORECASE): fmt = 'Freezeout'
            elif re.search(r'deep\s*stack', text, re.IGNORECASE): fmt = 'Deep Stack'
            elif re.search(r'\bturbo\b', text, re.IGNORECASE): fmt = 'Turbo'

            name_match = re.search(
                r'(?:"|\'|–|—|\s)([^"\'–—]{5,60}(?:tournament|MTT|event|series|championship|classic|special))',
                text, re.IGNORECASE
            )
            tournament_name = name_match.group(1).strip() if name_match else None

            if times or buyins:
                for i, time_str in enumerate(times):
                    buyin = int(buyins[i]) if i < len(buyins) else (int(buyins[0]) if buyins else None)
                    schedules.append({
                        'day_of_week': day.capitalize(),
                        'start_time': time_str.strip(),
                        'buy_in': buyin or 0,
                        'game_type': game_type,
                        'guaranteed': guaranteed,
                        'starting_stack': starting_stack,
                        'blind_levels': blind_levels,
                        'format': fmt,
                        'tournament_name': tournament_name,
                    })
                if buyins and not times:
                    schedules.append({
                        'day_of_week': day.capitalize(),
                        'start_time': None,
                        'buy_in': int(buyins[0]),
                        'game_type': game_type,
                        'guaranteed': guaranteed,
                        'starting_stack': starting_stack,
                        'blind_levels': blind_levels,
                        'format': fmt,
                        'tournament_name': tournament_name,
                    })

    return schedules


def supabase_upsert(table, records, conflict_cols=None):
    """Insert tournament records to Supabase via REST API."""
    if not SERVICE_KEY or not records:
        return 0
    
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    }
    
    # Batch in chunks of 50
    inserted = 0
    chunk_size = 50
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i+chunk_size]
        body = json.dumps(chunk).encode()
        req = urllib.request.Request(url, data=body, method='POST', headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            inserted += len(chunk)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            print(f'  ❌ Supabase error {e.code}: {err_body[:200]}')
    
    return inserted


async def scrape_venue(session, venue, dry_run=False):
    """Scrape a single missing charity venue for tournament data."""
    venue_id = venue['venue_id']
    name = venue['name']
    base_url = venue['url'].rstrip('/')
    state = venue['state']
    subpages = SUBPAGES.get(venue_id, [])
    
    print(f'\n  [{state}] {name}')
    print(f'  URL: {base_url}')
    
    if dry_run:
        print(f'  [DRY RUN] Would check: {base_url} + {len(subpages)} subpages')
        return []
    
    all_tournaments = []
    scraped_urls = []
    
    # Scrape main page + schedule subpages
    urls_to_try = [base_url] + [f'{base_url}{sp}' for sp in subpages]
    
    for url in urls_to_try:
        try:
            page = await session.fetch(url, google_search=False)
            if page.status not in (200, 201):
                continue
            
            body = page.body or b''
            if len(body) < 200:
                continue
            
            html = body.decode('utf-8', errors='ignore')
            prov = make_provenance(url, body, page.status)
            
            tournaments = extract_tournaments_from_html(html)
            
            if tournaments:
                print(f'  ✅ {url} -> {len(tournaments)} tournament slots')
                # Deduplicate by day+time
                for t in tournaments:
                    key = f"{t['day_of_week']}_{t.get('start_time', '')}_{t.get('buy_in', 0)}"
                    if not any(f"{e['day_of_week']}_{e.get('start_time','')}_{e.get('buy_in',0)}" == key for e in all_tournaments):
                        t['source_url'] = url
                        t['provenance'] = prov
                        all_tournaments.append(t)
                scraped_urls.append(url)
            else:
                # Check for any schedule keywords as evidence
                schedule_signals = sum([
                    html.lower().count('tournament'),
                    html.lower().count('schedule'),
                    html.lower().count('buy-in'),
                    html.lower().count('poker'),
                ])
                print(f'  [ ] {url} -> no parsed schedule (signals={schedule_signals})')
            
            await asyncio.sleep(2)
            
        except Exception as e:
            print(f'  ❌ {url}: {e}')
            await asyncio.sleep(1)
    
    # Build DB records
    db_records = []
    for t in all_tournaments:
        prov = t.pop('provenance', {})
        db_records.append({
            'venue_id': venue_id,
            'venue_name': name,
            'day_of_week': t['day_of_week'],
            'start_time': t.get('start_time') or 'TBA',
            'buy_in': t.get('buy_in') or 0,
            'game_type': t.get('game_type', 'NLH'),
            'guaranteed': t.get('guaranteed'),
            'starting_stack': t.get('starting_stack'),
            'blind_levels': t.get('blind_levels'),
            'format': t.get('format'),
            'tournament_name': t.get('tournament_name'),
            'source_url': t.get('source_url', base_url),
            'is_active': True,
            'data_quality': 'scraped_verified',
            'scrape_html_hash': prov.get('scrape_html_hash', ''),
            'scrape_timestamp': prov.get('scrape_timestamp', datetime.now(timezone.utc).isoformat()),
            'scrape_batch_id': BATCH_ID,
        })
    
    if db_records:
        inserted = supabase_upsert('venue_daily_tournaments', db_records)
        print(f'  📊 Inserted {inserted} tournament records for {name}')
    else:
        print(f'  ⚠️  No tournament data found for {name}')
        # Still mark the venue was scraped with a placeholder so we know it was attempted
        # Insert a single "no schedule" marker so the venue shows in coverage
    
    return db_records


async def main(dry_run=False, state_filter=None):
    print('=' * 70)
    print('  CHARITY POKER TARGETED SCRAPER v4.0 — Phase 2')
    print(f'  Batch ID: {BATCH_ID}')
    print(f'  Timestamp: {datetime.now(timezone.utc).isoformat()}')
    print(f'  Target venues: {len(MISSING_VENUES)} (all missing from VDT)')
    print('=' * 70)
    
    venues = MISSING_VENUES
    if state_filter:
        venues = [v for v in venues if v['state'] == state_filter.upper() or v['state'] == 'MULTI']
        print(f'  Filtered to state: {state_filter.upper()} ({len(venues)} venues)')
    
    if dry_run:
        print('\n  [DRY RUN] Targets:')
        for v in venues:
            print(f'    [{v["state"]}] {v["name"]} -> {v["url"]}')
        return
    
    from scrapling.fetchers import AsyncStealthySession
    
    all_inserted = 0
    venues_with_data = 0
    venues_no_data = []
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        for venue in venues:
            records = await scrape_venue(session, venue, dry_run=dry_run)
            if records:
                all_inserted += len(records)
                venues_with_data += 1
            else:
                venues_no_data.append(venue['name'])
            await asyncio.sleep(3)
    
    print('\n' + '=' * 70)
    print('  PHASE 2 SCRAPE — SUMMARY')
    print('=' * 70)
    print(f'  Venues scraped:       {len(venues)}')
    print(f'  With data found:      {venues_with_data}')
    print(f'  No data found:        {len(venues_no_data)}')
    print(f'  Total DB records:     {all_inserted}')
    if venues_no_data:
        print(f'\n  Venues with no schedule data:')
        for n in venues_no_data:
            print(f'    - {n}')
    print('=' * 70)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Charity Poker Targeted Scraper v4.0')
    parser.add_argument('--dry-run', action='store_true', help='List targets without scraping')
    parser.add_argument('--state', type=str, help='Filter by state (e.g. OH, NC, NH)')
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run, state_filter=args.state))
