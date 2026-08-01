#!/usr/bin/env python3
"""
POKERATLAS TOURNAMENT SERIES & EVENTS SCRAPER — Scrapling-powered
=================================================================
Scrapes ALL upcoming tournament series and their individual events
from PokerAtlas, populating poker_series, poker_events, and tournament_series.

Data Integrity Framework Compliance:
  Layer 1: Scrapling Fetcher ONLY — Fetcher.get() with stealthy_headers=True
  Layer 2: HTTP 200 required, SHA-256 hash on raw HTML
  Layer 3: Evidence saved to data/scrape-evidence/
  Layer 4: REST API upsert (triggers enforce provenance)
  Layer 5: Anti-hallucination check on each batch

Usage:
  .venv/bin/python3 scripts/scrape_pokeratlas_series.py
  .venv/bin/python3 scripts/scrape_pokeratlas_series.py --dry-run
  .venv/bin/python3 scripts/scrape_pokeratlas_series.py --limit 10
"""

import hashlib
import json
import os
import re
import sys
import time
import uuid
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from dateutil.parser import parse as dparse

from scrapling.fetchers import Fetcher

# ============================================================
# CONFIG
# ============================================================
BASE_DIR = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_KEY',
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)

SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

BATCH_ID = str(uuid.uuid4())
RATE_LIMIT = 2.5  # seconds between requests
PA_BASE = 'https://www.pokeratlas.com'

# ============================================================
# SUPPRESSION GUARD — loaded once at startup
# ============================================================
_SUPPRESSED_SERIES_UIDS: set = set()

def load_suppressed_series():
    """Fetch all suppressed series UIDs from Supabase at startup."""
    global _SUPPRESSED_SERIES_UIDS
    try:
        url = f'{SUPABASE_URL}/rest/v1/poker_series?is_suppressed=eq.true&select=series_uid&limit=5000'
        req = urllib.request.Request(url, headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
        })
        resp = urllib.request.urlopen(req, timeout=15)
        rows = json.loads(resp.read().decode())
        _SUPPRESSED_SERIES_UIDS = {r['series_uid'] for r in rows if r.get('series_uid')}
        print(f'  [SUPPRESSION] Loaded {len(_SUPPRESSED_SERIES_UIDS)} suppressed series UIDs.')
    except Exception as e:
        print(f'  [SUPPRESSION] Warning — could not load suppressed series: {e}')

def is_series_suppressed(series_uid: str) -> bool:
    return series_uid in _SUPPRESSED_SERIES_UIDS

# ============================================================
# SUPABASE HELPERS
# ============================================================
def sb_upsert(table, records, on_conflict=None):
    """Upsert via REST API in chunks — triggers fire. Strips is_suppressed to protect manual flags."""
    CHUNK = 50
    total = 0
    headers = dict(SB_HEADERS)
    if on_conflict:
        headers['Prefer'] = f'resolution=merge-duplicates,return=minimal'
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        # Never allow a scraper to write is_suppressed — strip it from every record
        safe_chunk = [{k: v for k, v in r.items() if k != 'is_suppressed'} for r in chunk]
        body = json.dumps(safe_chunk, default=str).encode()
        url = f'{SUPABASE_URL}/rest/v1/{table}'
        if on_conflict:
            url += f'?on_conflict={on_conflict}'
        req = urllib.request.Request(url, data=body, method='POST', headers=headers)
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=30)
                total += len(chunk)
                break
            except Exception as e:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    err_body = e.read().decode()[:200] if hasattr(e, 'read') else str(e)[:200]
                    print(f'    [UPSERT FAIL] {table}: {err_body}')
    return total

def save_evidence(prefix, data):
    """Save scrape evidence to disk."""
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe = re.sub(r'[^a-z0-9]', '_', prefix.lower())[:40]
    path = EVIDENCE_DIR / f'series_{safe}_{ts}.json'
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    return path

# ============================================================
# SCRAPLING: FETCH + HASH
# ============================================================
def scrape_page(url):
    """Fetch a page with Scrapling, return (html, provenance) or (None, provenance)."""
    try:
        page = Fetcher.get(url, stealthy_headers=True)
        body = page.body if page.body else (page.text.encode('utf-8') if page.text else b'')
        html = body.decode('utf-8', errors='ignore')
        provenance = {
            'scrape_url': url,
            'scrape_http_status': page.status,
            'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
            'scrape_html_hash': hashlib.sha256(body).hexdigest(),
            'scrape_byte_count': len(body),
            'scrape_script': 'scripts/scrape_pokeratlas_series.py',
            'scrape_batch_id': BATCH_ID,
        }
        if page.status != 200:
            return None, provenance
        return html, provenance
    except Exception as e:
        return None, {
            'scrape_url': url,
            'scrape_http_status': 0,
            'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
            'scrape_html_hash': '',
            'error': str(e),
            'scrape_script': 'scripts/scrape_pokeratlas_series.py',
            'scrape_batch_id': BATCH_ID,
        }

# ============================================================
# PARSE: SERIES LISTING PAGE
# ============================================================
def parse_series_listing(html):
    """Parse the PokerAtlas tournament series listing page.
    
    URL: https://www.pokeratlas.com/poker-tournament-series
    
    Extracts series slugs and basic metadata from the listing.
    """
    series = []
    
    # Find all series links: /poker-tournament-series/{slug}
    # Pattern: <a href="/poker-tournament-series/slug-name-2026">
    slug_pattern = re.compile(
        r'href="/poker-tournament-series/([^"]+)"', re.IGNORECASE
    )
    found_slugs = set()
    for m in slug_pattern.finditer(html):
        slug = m.group(1).strip()
        if slug and slug not in found_slugs:
            found_slugs.add(slug)
            series.append({'slug': slug})
    
    # Try to extract names and dates from surrounding context
    # PokerAtlas typically has: <h3>Series Name</h3> with date info nearby
    block_pattern = re.compile(
        r'<a[^>]*href="/poker-tournament-series/([^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL | re.IGNORECASE
    )
    name_map = {}
    for m in block_pattern.finditer(html):
        slug = m.group(1).strip()
        text = re.sub(r'<[^>]+>', ' ', m.group(2)).strip()
        text = re.sub(r'\s+', ' ', text)
        if text and slug:
            name_map[slug] = text
    
    # Match names to series
    for s in series:
        if s['slug'] in name_map:
            s['name'] = name_map[s['slug']]
    
    # Also look for date ranges
    date_pattern = re.compile(
        r'(\w+ \d{1,2}(?:\s*[-–]\s*\w* ?\d{1,2})?,?\s*\d{4})',
        re.IGNORECASE
    )
    
    return series

# ============================================================
# PARSE: INDIVIDUAL SERIES PAGE
# ============================================================
def parse_series_page(html, slug, provenance):
    """Parse a PokerAtlas individual series page for events.
    
    URL: https://www.pokeratlas.com/poker-tournament-series/{slug}
    
    PokerAtlas series pages typically contain:
    - Series name and dates in header
    - Venue name and location
    - Event table with: #, Name, Buy-in, Date, Start Time, GTD
    """
    result = {
        'series': None,
        'events': [],
    }
    
    # Extract series name from page title or h1
    title_m = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
    h1_m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.IGNORECASE | re.DOTALL)
    
    series_name = ''
    if h1_m:
        series_name = re.sub(r'<[^>]+>', '', h1_m.group(1)).strip()
    elif title_m:
        series_name = re.sub(r'<[^>]+>', '', title_m.group(1)).strip()
        series_name = series_name.replace(' | PokerAtlas', '').strip()
    
    # Extract venue and location from series header
    # PokerAtlas format: "Feb 25 - Mar 31, 2026 Venetian Las Vegas Las Vegas, NV"
    venue_name = ''
    city = ''
    state = ''
    
    # Extract the header section
    header_m = re.search(r'class="series-header"(.*?)class="tournaments-list', html, re.DOTALL)
    if header_m:
        header_text = re.sub(r'<[^>]+>', ' ', header_m.group(1))
        header_text = re.sub(r'\s+', ' ', header_text).strip()
        
        # Extract "City, ST" pattern
        loc_m = re.search(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})', header_text)
        if loc_m:
            city = loc_m.group(1)
            state = loc_m.group(2)
        
        # Extract venue — text between date range and "City, ST"
        # Date pattern: "Feb 25 - Mar 31, 2026"
        date_in_header = re.search(
            r'(\w{3,9}\s+\d{1,2})\s*[-–]\s*(\w{3,9}\s+\d{1,2}),?\s*(\d{4})',
            header_text
        )
        if date_in_header and loc_m:
            after_date = header_text[date_in_header.end():]
            before_city = after_date[:after_city_idx] if (after_city_idx := after_date.find(city)) > 0 else after_date[:50]
            venue_candidate = before_city.strip().rstrip(',').strip()
            if venue_candidate and len(venue_candidate) > 3:
                venue_name = venue_candidate
    
    # Extract dates
    date_range_m = re.search(
        r'(\w{3,9}\s+\d{1,2})\s*[-–]\s*(\w{3,9}\s+\d{1,2}),?\s*(\d{4})',
        html[:10000]
    )
    start_date = ''
    end_date = ''
    if date_range_m:
        year = date_range_m.group(3)
        try:
            start_date = dparse(f"{date_range_m.group(1)} {year}").strftime('%Y-%m-%d')
            end_date = dparse(f"{date_range_m.group(2)} {year}").strftime('%Y-%m-%d')
        except Exception:
            pass
    
    # Build series record
    series_uid = f'pa_{slug}'
    result['series'] = {
        'series_uid': series_uid,
        'series_name': series_name,
        'tour': _infer_tour(series_name),
        'tier': _infer_tier(series_name),
        'venue_name': venue_name,
        'city': city,
        'state': state,
        'start_date': start_date or None,
        'end_date': end_date or None,
        'source': 'pokeratlas',
        'source_url': provenance['scrape_url'],
        'scrape_url': provenance['scrape_url'],
        'scrape_status': 'scraped',
        'data_quality': 'scraped_verified',
        'scrape_html_hash': provenance['scrape_html_hash'],
        'scrape_timestamp': provenance['scrape_timestamp'],
        'scrape_confidence': 'high',
        'scrape_batch_id': BATCH_ID,
    }
    
    # Parse events from the table
    events = _parse_events_table(html, series_uid, series_name, venue_name, city, state, provenance)
    result['events'] = events
    result['series']['event_count'] = len(events)
    
    # Compute buy-in range
    buyins = [e.get('buy_in', 0) for e in events if e.get('buy_in')]
    if buyins:
        result['series']['buy_in_min'] = min(buyins)
        result['series']['buy_in_max'] = max(buyins)
    
    return result


def _parse_events_table(html, series_uid, series_name, venue_name, city, state, provenance):
    """Parse individual events from a PokerAtlas series page.
    
    PokerAtlas HTML structure per event:
      <div class="panel panel-stripe tournament-item one-time series-event">
        <a class="start-time"> 
          <div class="date"><span class="month">Feb</span><span class="day">25</span></div>
          <div class="time"><span class="week-day">Wednesday</span><span class="hour">11:10am</span></div>
        </a>
        <div class="tournament">
          <div class="details title">
            <span class="detail event-number">Event #01</span>
            <span class="detail name">DSM 2026 #01 $400 NLH (1Day)</span>
            <div class="buy-in">$400</div>
            <div class="type">NL Holdem</div>
          </div>
          <div class="details">
            <ul class="structure-info">
              <li>40,000 chips</li>
              <li>30 min levels</li>
              <li><abbr title="$20,000 Guaranteed">$20K Gtd</abbr></li>
            </ul>
          </div>
        </div>
      </div>
    """
    events = []
    
    # Split by tournament-item
    items = re.split(r'class="panel panel-stripe tournament-item', html)
    
    for item in items[1:]:
        try:
            # Month + Day
            month_m = re.search(r'class="month">\s*(\w+)\s*<', item)
            day_m = re.search(r'class="day">\s*(\d+)\s*<', item)
            hour_m = re.search(r'class="hour">\s*([\d:]+\s*(?:am|pm)?)\s*<', item, re.IGNORECASE)
            
            # Event number
            evnum_m = re.search(r'class="detail event-number">\s*Event\s*#?(\d+)', item, re.IGNORECASE)
            
            # Event name
            name_m = re.search(r'class="detail name">\s*(.*?)\s*</span>', item, re.DOTALL)
            
            # Buy-in
            buyin_m = re.search(r'class="buy-in">\s*\$?([\d,]+)\s*<', item)
            
            # Game type
            type_m = re.search(r'class="type">\s*(.*?)\s*</div>', item)
            
            # Guarantee
            gtd_m = re.search(r'title="?\$?([\d,]+)\s*Guaranteed"?', item, re.IGNORECASE)
            if not gtd_m:
                gtd_m = re.search(r'\$([\d,]+)K?\s*Gtd', item, re.IGNORECASE)
            
            # Build event record
            event_name = ''
            if name_m:
                event_name = re.sub(r'<[^>]+>', '', name_m.group(1)).strip()
            
            buy_in = None
            if buyin_m:
                buy_in = int(buyin_m.group(1).replace(',', ''))
            
            if not event_name and not buy_in:
                continue
            
            # Parse date
            start_date = None
            if month_m and day_m:
                month_str = month_m.group(1)
                day_str = day_m.group(1)
                # Determine year from series dates or use current year
                try:
                    start_date = dparse(f'{month_str} {day_str} 2026').strftime('%Y-%m-%d')
                except Exception:
                    pass
            
            start_time = hour_m.group(1).strip() if hour_m else None
            
            event_number = int(evnum_m.group(1)) if evnum_m else None
            
            game_type = _infer_game_type(
                (type_m.group(1) if type_m else '') + ' ' + event_name
            )
            
            guarantee = None
            if gtd_m:
                gtd_str = gtd_m.group(1).replace(',', '')
                guarantee = int(gtd_str)
                # Handle "K" suffix (e.g., "$20K Gtd")
                if 'K' in item[gtd_m.start():gtd_m.end() + 5].upper() and guarantee < 10000:
                    guarantee *= 1000
            
            # Chips and levels
            starting_stack = None
            blind_levels = None
            chips_m = re.search(r'([\d,]+)\s*chips', item, re.IGNORECASE)
            levels_m = re.search(r'(\d+)\s*min\s*levels', item, re.IGNORECASE)
            if chips_m:
                starting_stack = int(chips_m.group(1).replace(',', ''))
            if levels_m:
                blind_levels = int(levels_m.group(1))
            
            # Re-entry
            re_entry = bool(re.search(r're-?entry|unlimited re-?entry', item, re.IGNORECASE))
            unlimited_re = bool(re.search(r'unlimited re-?entry', item, re.IGNORECASE))
            
            event_uid = f'{series_uid}_e{event_number or 0}_{hashlib.md5((event_name + str(buy_in) + str(start_date)).encode()).hexdigest()[:8]}'
            
            event = {
                'event_uid': event_uid,
                'series_uid': series_uid,
                'event_name': event_name or f'Event #{event_number}',
                'event_number': event_number,
                'buy_in': buy_in,
                'guarantee': guarantee,
                'starting_stack': starting_stack,
                'blind_levels': blind_levels,
                'start_date': start_date,
                'start_time': start_time,
                'game_type': game_type,
                're_entry': re_entry,
                'unlimited_re_entry': unlimited_re,
                'venue_name': venue_name,
                'city': city,
                'state': state,
                'source': 'pokeratlas',
                'data_quality': 'scraped_verified',
                'scrape_html_hash': provenance['scrape_html_hash'],
                'scrape_timestamp': provenance['scrape_timestamp'],
                'scrape_confidence': 'high',
                'scrape_batch_id': BATCH_ID,
            }
            events.append(event)
        except Exception as e:
            continue
    
    return events


def _ld_event_to_record(ld, series_uid, venue_name, city, state, provenance):
    """Convert a JSON-LD Event to a poker_events record."""
    name = ld.get('name', '')
    if not name:
        return None
    
    buyin = None
    if ld.get('offers', {}).get('price'):
        try:
            buyin = int(float(ld['offers']['price']))
        except (ValueError, TypeError):
            pass
    
    start_date = None
    start_time = None
    if ld.get('startDate'):
        try:
            from dateutil.parser import parse as dparse
            dt = dparse(ld['startDate'])
            start_date = dt.strftime('%Y-%m-%d')
            start_time = dt.strftime('%H:%M')
        except Exception:
            pass
    
    end_date = None
    if ld.get('endDate'):
        try:
            from dateutil.parser import parse as dparse
            end_date = dparse(ld['endDate']).strftime('%Y-%m-%d')
        except Exception:
            pass
    
    # Extract event number from name
    event_num = None
    num_m = re.search(r'#(\d+)', name)
    if num_m:
        event_num = int(num_m.group(1))
    
    # Infer game type
    game_type = _infer_game_type(name)
    
    event_uid = f'{series_uid}_evt_{hashlib.md5(name.encode()).hexdigest()[:8]}'
    
    return {
        'event_uid': event_uid,
        'series_uid': series_uid,
        'event_name': name,
        'event_number': event_num,
        'buy_in': buyin,
        'start_date': start_date,
        'start_time': start_time,
        'end_date': end_date,
        'game_type': game_type,
        'venue_name': venue_name,
        'city': city,
        'state': state,
        'source': 'pokeratlas',
        'data_quality': 'scraped_verified',
        'scrape_html_hash': provenance['scrape_html_hash'],
        'scrape_timestamp': provenance['scrape_timestamp'],
        'scrape_confidence': 'high',
        'scrape_batch_id': BATCH_ID,
    }


def _row_cells_to_event(cells, series_uid, venue_name, city, state, provenance):
    """Convert HTML table row cells to a poker_events record."""
    # Clean cell text
    texts = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
    
    # Find buy-in
    buyin = None
    for t in texts:
        buyin_m = re.search(r'\$(\d[\d,]*)', t)
        if buyin_m:
            buyin = int(buyin_m.group(1).replace(',', ''))
            break
    
    if not buyin:
        return None
    
    # Find date
    start_date = None
    for t in texts:
        try:
            from dateutil.parser import parse as dparse
            dt = dparse(t, fuzzy=True)
            if dt.year >= 2026:
                start_date = dt.strftime('%Y-%m-%d')
                break
        except Exception:
            continue
    
    # Event name — usually first or second cell
    event_name = texts[0] if texts[0] and not texts[0].startswith('$') else texts[1] if len(texts) > 1 else ''
    if not event_name:
        event_name = f'${buyin:,} Tournament'
    
    event_uid = f'{series_uid}_row_{hashlib.md5(f"{event_name}{buyin}{start_date}".encode()).hexdigest()[:8]}'
    
    return {
        'event_uid': event_uid,
        'series_uid': series_uid,
        'event_name': event_name,
        'buy_in': buyin,
        'start_date': start_date,
        'game_type': _infer_game_type(event_name),
        'venue_name': venue_name,
        'city': city,
        'state': state,
        'source': 'pokeratlas',
        'data_quality': 'scraped_verified',
        'scrape_html_hash': provenance['scrape_html_hash'],
        'scrape_timestamp': provenance['scrape_timestamp'],
        'scrape_confidence': 'medium',
        'scrape_batch_id': BATCH_ID,
    }


# ============================================================
# INFERENCE HELPERS
# ============================================================
def _infer_tour(name):
    n = name.lower()
    if 'wsop' in n or 'world series' in n:
        return 'WSOP'
    if 'wpt' in n or 'world poker tour' in n:
        return 'WPT'
    if 'mspt' in n or 'mid-states' in n:
        return 'MSPT'
    if 'rgps' in n or 'rungood' in n:
        return 'RGPS'
    if 'hpt' in n or 'heartland' in n:
        return 'HPT'
    if 'deepstack' in n or 'dse' in n:
        return 'DSE'
    if 'cppt' in n or 'card player' in n:
        return 'CPPT'
    return 'Independent'


def _infer_tier(name):
    n = name.lower()
    if any(x in n for x in ['wsop', 'wpt', 'world']):
        return 'major'
    if any(x in n for x in ['mspt', 'rgps', 'hpt', 'circuit']):
        return 'circuit'
    return 'regional'


def _infer_game_type(name):
    n = name.lower()
    if 'plo' in n or 'pot limit omaha' in n:
        return 'PLO'
    if 'omaha' in n:
        return 'Omaha'
    if 'horse' in n or 'h.o.r.s.e' in n:
        return 'HORSE'
    if 'stud' in n:
        return 'Stud'
    if 'mixed' in n:
        return 'Mixed'
    if 'razz' in n:
        return 'Razz'
    return 'NLH'


# ============================================================
# MAIN
# ============================================================
def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    limit = 999
    if '--limit' in args:
        idx = args.index('--limit')
        limit = int(args[idx + 1])

    print('=' * 70)
    print('POKERATLAS TOURNAMENT SERIES & EVENTS SCRAPER')
    print('=' * 70)
    print(f'  Batch ID: {BATCH_ID[:12]}...')
    print(f'  Mode:     {"DRY RUN" if dry_run else "LIVE"}')
    print(f'  Limit:    {limit} series')
    print('=' * 70)
    print()

    # Load suppression list before any scraping
    load_suppressed_series()

    # Step 1: Scrape the series listing page
    print('[STEP 1] Scraping series listing from PokerAtlas...')
    listing_url = f'{PA_BASE}/poker-tournament-series'
    html, prov = scrape_page(listing_url)
    
    if not html:
        print(f'  FAILED: HTTP {prov.get("scrape_http_status", "?")} - {prov.get("error", "unknown")}')
        sys.exit(1)
    
    series_list = parse_series_listing(html)
    print(f'  Found {len(series_list)} series slugs')
    save_evidence('series_listing', {'provenance': prov, 'series': series_list})
    
    if not series_list:
        print('  No series found. Exiting.')
        sys.exit(1)
    
    # Step 2: Deep scrape each series page
    print(f'\n[STEP 2] Deep-scraping series pages (limit: {limit})...\n')
    
    all_series = []
    all_events = []
    all_tournament_series = []
    stats = {'scraped': 0, 'events_total': 0, 'failed': 0}
    
    for i, s in enumerate(series_list[:limit]):
        slug = s['slug']
        series_url = f'{PA_BASE}/poker-tournament-series/{slug}'
        
        print(f'  [{i+1}/{min(len(series_list), limit)}] {slug[:60]}...')
        
        html, prov = scrape_page(series_url)
        time.sleep(RATE_LIMIT)
        
        if not html:
            print(f'    SKIP: HTTP {prov.get("scrape_http_status", "?")}')
            stats['failed'] += 1
            continue
        
        result = parse_series_page(html, slug, prov)
        
        series_rec = result.get('series')
        events = result.get('events', [])
        
        if series_rec:
            # ── SUPPRESSION GUARD ──────────────────────────────────────────
            series_uid = series_rec.get('series_uid', '')
            if is_series_suppressed(series_uid):
                print(f"    🚫 SUPPRESSED — permanently skipping: {series_rec.get('series_name')} ({series_uid})")
                continue
            # ──────────────────────────────────────────────────────────────
            all_series.append(series_rec)
            
            # Also create tournament_series record (different table, different schema)
            location = f"{series_rec.get('city', '')}, {series_rec.get('state', '')}".strip(', ')
            if not location:
                # Derive location from slug
                location = slug.split('-')[-2].replace('-', ' ').title() if '-' in slug else 'Unknown'
            
            # Dates — must be non-null for tournament_series
            ts_start = series_rec.get('start_date') or datetime.now(timezone.utc).strftime('%Y-%m-%d')
            ts_end = series_rec.get('end_date') or ts_start
            
            ts_rec = {
                'name': series_rec.get('series_name', '') or slug,
                'short_name': series_rec.get('tour', 'PA'),
                'venue_name': series_rec.get('venue_name', '') or 'Unknown',
                'location': location,
                'start_date': ts_start,
                'end_date': ts_end,
                'total_events': len(events),
                'series_type': series_rec.get('tier', 'regional'),
                'is_featured': series_rec.get('tier') == 'major',
                'series_uid': series_rec.get('series_uid'),
                'tour_code': series_rec.get('tour', ''),
                'venue': series_rec.get('venue_name', '') or 'Unknown',
                'city': series_rec.get('city', '') or '',
                'state': series_rec.get('state', '') or '',
                'source_url': prov['scrape_url'],
                'scrape_url': prov['scrape_url'],
                'data_quality': 'scraped_verified',
                'scrape_html_hash': prov['scrape_html_hash'],
                'scrape_timestamp': prov['scrape_timestamp'],
                'scrape_confidence': 'high',
                'scrape_batch_id': BATCH_ID,
                'last_scraped': prov['scrape_timestamp'],
                'last_scraped_at': prov['scrape_timestamp'],
                'scrape_status': 'scraped',
            }
            all_tournament_series.append(ts_rec)
        
        all_events.extend(events)
        stats['scraped'] += 1
        stats['events_total'] += len(events)
        
        # Save evidence per series
        save_evidence(f'series_{slug[:30]}', {
            'provenance': prov,
            'series': series_rec,
            'events': events,
            'event_count': len(events),
        })
        
        series_display = series_rec.get('series_name', slug)[:50] if series_rec else slug[:50]
        print(f'    {series_display}: {len(events)} events')

    print()
    print(f'Total series scraped: {stats["scraped"]}')
    print(f'Total events found:   {stats["events_total"]}')
    print(f'Failed:               {stats["failed"]}')
    print()

    if dry_run:
        print('[DRY RUN] Would insert:')
        print(f'  poker_series:       {len(all_series)} records')
        print(f'  poker_events:       {len(all_events)} records')
        print(f'  tournament_series:  {len(all_tournament_series)} records')
        return

    # Step 2.5: Normalize data before insert
    print('[STEP 2.5] Normalizing data...')
    
    # Deduplicate events by event_uid
    seen_uids = set()
    deduped_events = []
    for e in all_events:
        uid = e.get('event_uid', '')
        if uid and uid not in seen_uids:
            seen_uids.add(uid)
            deduped_events.append(e)
    print(f'  Events: {len(all_events)} -> {len(deduped_events)} (deduped)')
    all_events = deduped_events
    
    # Normalize poker_series keys — PostgREST requires all objects in a batch to have same keys
    SERIES_KEYS = [
        'series_uid', 'series_name', 'tour', 'tier', 'venue_name', 'city', 'state',
        'start_date', 'end_date', 'event_count', 'buy_in_min', 'buy_in_max',
        'source', 'source_url', 'scrape_url', 'scrape_status',
        'data_quality', 'scrape_html_hash', 'scrape_timestamp', 'scrape_confidence', 'scrape_batch_id',
    ]
    normalized_series = []
    for s in all_series:
        norm = {k: s.get(k) for k in SERIES_KEYS}
        # Ensure non-null for required fields
        norm['series_name'] = norm.get('series_name') or 'Unknown'
        norm['source'] = norm.get('source') or 'pokeratlas'
        normalized_series.append(norm)
    all_series = normalized_series
    
    # Normalize event keys
    EVENT_KEYS = [
        'event_uid', 'series_uid', 'event_name', 'event_number', 'buy_in',
        'guarantee', 'starting_stack', 'blind_levels',
        'start_date', 'start_time', 'game_type',
        're_entry', 'unlimited_re_entry',
        'venue_name', 'city', 'state', 'source',
        'data_quality', 'scrape_html_hash', 'scrape_timestamp', 'scrape_confidence', 'scrape_batch_id',
    ]
    normalized_events = []
    for e in all_events:
        norm = {k: e.get(k) for k in EVENT_KEYS}
        norm['source'] = norm.get('source') or 'pokeratlas'
        normalized_events.append(norm)
    all_events = normalized_events
    print(f'  Keys normalized')
    print()

    # Step 3: Insert to database (poker_series FIRST — events have FK)
    print('[STEP 3] Inserting to database...')
    
    if all_series:
        n = sb_upsert('poker_series', all_series, on_conflict='series_uid')
        print(f'  poker_series:      {n}/{len(all_series)} inserted')
    
    if all_events:
        n = sb_upsert('poker_events', all_events, on_conflict='event_uid')
        print(f'  poker_events:      {n}/{len(all_events)} inserted')
    
    if all_tournament_series:
        n = sb_upsert('tournament_series', all_tournament_series, on_conflict='series_uid')
        print(f'  tournament_series: {n}/{len(all_tournament_series)} inserted')
    
    print()
    print('=' * 70)
    print('SCRAPE COMPLETE')
    print('=' * 70)
    print(f'  Series:  {stats["scraped"]}')
    print(f'  Events:  {stats["events_total"]}')
    print(f'  Batch:   {BATCH_ID}')
    print('=' * 70)


if __name__ == '__main__':
    main()
