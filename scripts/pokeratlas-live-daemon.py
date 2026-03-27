#!/usr/bin/env python3
"""
PokerAtlas Live Games — Autonomous Scraper Daemon v2.0
=====================================================
Uses Scrapling + Camoufox StealthySession for Cloudflare bypass.

Scrapes game catalog data from PokerAtlas region pages:
- Venue name, game name, buy-in range, run schedule
- This data COMPLEMENTS Bravo's real-time table counts

Architecture mirrors bravo-live-daemon.py with source='pokeratlas'.
"""

import hashlib
import json
import logging
import os
import re
import signal
import sys
import time
import traceback
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ============================================================
# CONFIG
# ============================================================
BASE_DIR = Path(__file__).resolve().parent.parent
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
)

# Timing
SCRAPE_INTERVAL = 900  # 15 minutes (offset 7min from Bravo via launchd start)
RATE_LIMIT_DELAY = 1.0  # seconds between region page fetches
MAX_RETRIES = 3

# Directories
LOG_DIR = BASE_DIR / 'data' / 'pokeratlas-logs'
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'

# ============================================================
# LOGGING
# ============================================================
LOG_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / f'daemon_{datetime.now().strftime("%Y%m%d")}.log'),
    ]
)
log = logging.getLogger('pokeratlas-daemon')

# ============================================================
# ERROR CODES
# ============================================================
ERROR_CF_BLOCKED = 'ERROR_CF_BLOCKED'
ERROR_SESSION_DEAD = 'ERROR_SESSION_DEAD'
ERROR_SUPABASE = 'ERROR_SUPABASE'

# ============================================================
# SUPABASE HELPERS
# ============================================================
SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def sb_upsert(table, data):
    """UPSERT to Supabase REST API with chunked batches and retry."""
    BATCH_SIZE = 100
    total_saved = 0
    for i in range(0, len(data), BATCH_SIZE):
        chunk = data[i:i + BATCH_SIZE]
        body = json.dumps(chunk).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{table}',
            data=body, method='POST',
            headers={**SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal'}
        )
        success = False
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=30)
                total_saved += len(chunk)
                success = True
                break
            except Exception as e:
                if attempt < 2:
                    log.warning(f'  Batch {i//BATCH_SIZE + 1}: retry {attempt + 1} ({e})')
                    time.sleep(2 ** attempt)
                else:
                    log.error(f'{ERROR_SUPABASE}: Batch {i//BATCH_SIZE + 1} FAILED after 3 retries: {e}')
        if not success:
            return False
    log.info(f'  Upserted {total_saved}/{len(data)} records in {(len(data) + BATCH_SIZE - 1) // BATCH_SIZE} batches')
    return True

def sb_delete(table, query):
    """DELETE from Supabase REST API."""
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}?{query}',
        method='DELETE', headers=SB_HEADERS
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except:
        return False

# ============================================================
# POKERATLAS REGION REGISTRY
# ============================================================
# PokerAtlas organizes data by region (city/state).
# URL pattern: /poker-cash-games/{region-slug}

PA_REGION_SLUGS = [
    # High-priority (major poker markets)
    'las-vegas-nevada', 'los-angeles-california', 'south-florida',
    'atlantic-city-new-jersey', 'san-francisco-bay-area-california',
    'connecticut', 'michigan', 'pennsylvania', 'maryland',
    'tampa-florida', 'central-florida', 'north-florida',
    'san-diego-california', 'sacramento-california',
    'reno-nevada', 'laughlin-nevada',
    'new-york', 'virginia', 'colorado', 'arizona',
    'texas', 'illinois', 'indiana', 'ohio',
    'central-valley-california', 'inland-empire-california',
    # Mid-tier
    'louisiana', 'mississippi', 'oklahoma', 'missouri',
    'iowa', 'kansas', 'minnesota', 'wisconsin',
    'washington', 'oregon', 'north-carolina', 'west-virginia',
    'south-carolina', 'massachusetts', 'rhode-island',
    'delaware', 'new-mexico', 'montana', 'maine',
    'new-hampshire', 'idaho',
    # Lower priority
    'south-dakota', 'north-dakota', 'nebraska', 'arkansas',
    'alabama', 'georgia', 'tennessee', 'kentucky',
    'hawaii', 'alaska', 'washington-dc',
    # Canada
    'alberta-canada', 'british-columbia-canada', 'ontario-canada',
]

def load_pa_regions():
    """Always use hardcoded master list as the floor.
    
    Registry file is no longer used for region loading — the hardcoded
    PA_REGION_SLUGS list covers all 61 US regions + Canada and must
    never be overridden by a restrictive auto-discovered subset.
    """
    return PA_REGION_SLUGS

# ============================================================
# DATA EXTRACTION
# ============================================================
def extract_games_from_region(html, region_slug):
    """Extract cash game data from a PokerAtlas region cash-games page.

    HTML structure (from production analysis):
    <li class="cash-games-list-item cds-item">
      <a href="/poker-cash-game/venue-slug-game-type-stakes">
        <div class="venue">
          <div class="venue-title">
            <h2 class="venue-name">VenueName</h2>
          </div>
        </div>
        <div class="cash-games-item-overview">
          <div class="uber-row title">
            <ul class="inline-list">
              <li class="inline-list-item">1/3 No Limit Holdem</li>
            </ul>
          </div>
          <div class="uber-row details">
            <ul class="inline-list">
              <li class="inline-list-item">
                <span class="label">Buy-in:</span> $100 to $500
              </li>
              <li class="inline-list-item">
                <span class="label">Runs:</span> Always
              </li>
            </ul>
          </div>
        </div>
      </a>
    </li>
    """
    body = html.encode('utf-8')
    rhash = hashlib.sha256(body).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    venues = {}  # venue_name -> { games: [...] }

    # Split by cash-games-list-item to process each item
    items = re.split(r'<li\s+class="cash-games-list-item\s+cds-item\s*">', html)

    for item in items[1:]:  # Skip first (before the first item)
        # Extract venue name
        venue_match = re.search(
            r'<h2\s+class="venue-name">(.*?)</h2>',
            item, re.DOTALL | re.IGNORECASE
        )
        if not venue_match:
            continue
        venue_name = re.sub(r'<[^>]+>', '', venue_match.group(1)).strip()
        if not venue_name:
            continue

        # Extract game name from "uber-row title"
        game_match = re.search(
            r'<div\s+class="uber-row title">\s*<ul[^>]*>\s*<li[^>]*>(.*?)</li>',
            item, re.DOTALL | re.IGNORECASE
        )
        game_name = ''
        if game_match:
            game_name = re.sub(r'<[^>]+>', '', game_match.group(1)).strip()

        if not game_name:
            continue

        # Extract buy-in
        buyin_match = re.search(
            r'<span\s+class="label">Buy-in:</span>\s*(.*?)(?:</li>|<)',
            item, re.DOTALL | re.IGNORECASE
        )
        buyin = ''
        if buyin_match:
            buyin = re.sub(r'<[^>]+>', '', buyin_match.group(1)).strip()

        # Extract runs schedule
        runs_match = re.search(
            r'<span\s+class="label">Runs:</span>\s*(.*?)(?:</li>|<)',
            item, re.DOTALL | re.IGNORECASE
        )
        runs = ''
        if runs_match:
            runs = re.sub(r'<[^>]+>', '', runs_match.group(1)).strip()

        # Convert "runs" to a table estimate
        tables_estimate = runs_to_tables(runs)

        # Group by venue
        if venue_name not in venues:
            venues[venue_name] = {
                'venue_name': venue_name,
                'region_slug': region_slug,
                'scrape_timestamp': now,
                'scrape_html_hash': rhash,
                'games': [],
            }

        venues[venue_name]['games'].append({
            'game': game_name,
            'buyin': buyin,
            'runs': runs,
            'tables_estimate': tables_estimate,
        })

    return list(venues.values()), rhash, now


def runs_to_tables(runs_text):
    """Convert PokerAtlas 'Runs' description to estimated table count.

    Examples:
    - 'Always' → 3 (multiple tables always running)
    - 'One or two tables' → 1
    - 'Daily' → 2
    - 'Multiple tables' → 3
    - '' → 1 (default)
    """
    if not runs_text:
        return 1

    r = runs_text.lower()
    if 'always' in r:
        return 3
    elif 'multiple' in r:
        return 3
    elif 'two' in r or '2' in r:
        return 2
    elif 'one' in r or '1' in r:
        return 1
    elif 'daily' in r:
        return 2
    elif 'weekday' in r or 'weekend' in r:
        return 1
    elif 'occasionally' in r or 'rare' in r:
        return 0  # Not currently running
    else:
        return 1  # Default


# ============================================================
# PERSISTENT SESSION MANAGER (Scrapling StealthySession)
# ============================================================
class PokerAtlasSessionManager:
    """Manages a persistent Scrapling StealthySession.

    Key insight from HTML analysis:
    - PokerAtlas does NOT require login for cash games data
    - session.fetch() handles Cloudflare bypass automatically
    - No need for context.new_page() — fetch() returns parsed HTML
    """

    def __init__(self):
        self.session = None
        self.total_cycles = 0
        self.consecutive_failures = 0
        self.consecutive_fetch_failures = 0
        self.last_connect_time = None
        self._session_dead = False

    def connect(self):
        """Establish a new StealthySession."""
        from scrapling.fetchers import StealthySession

        self.disconnect()

        log.info('🔌 Establishing new StealthySession...')
        try:
            self.session = StealthySession(headless=True, solve_cloudflare=True)
            self.session.start()
            self.last_connect_time = datetime.now(timezone.utc)
            self._session_dead = False
            self.consecutive_fetch_failures = 0
            log.info('  ✅ Session ready')
            return True
        except Exception as e:
            log.error(f'  {ERROR_SESSION_DEAD}: {e}')
            traceback.print_exc()
            self.disconnect()
            return False

    def fetch_page(self, url, expected_slug=None):
        """Fetch a page using the persistent session.

        Returns HTML string or None on failure.
        Detects 301 redirects that silently return Las Vegas data.
        Auto-reconnects when browser context dies (crash recovery).
        """
        try:
            resp = self.session.fetch(url, google_search=False)

            if resp.status != 200:
                log.warning(f'  ❌ HTTP {resp.status} for {url}')
                return None

            # Get HTML content from Scrapling response
            html = resp.html_content or ''
            if not html:
                html = resp.body.decode('utf-8', errors='ignore') if resp.body else ''

            if not html:
                log.warning(f'  ❌ Empty response for {url}')
                return None

            # Check for CF challenge
            if 'Just a moment' in html or 'Performing security verification' in html:
                log.warning(f'  ⚠️  {ERROR_CF_BLOCKED}: CF challenge on {url}')
                if self.connect():
                    resp = self.session.fetch(url, google_search=True)
                    html = resp.html_content or ''
                    if not html:
                        html = resp.body.decode('utf-8', errors='ignore') if resp.body else ''
                    if 'Just a moment' in html:
                        return None
                else:
                    return None

            # REDIRECT DETECTION: Check if page title matches requested region
            if expected_slug and expected_slug != 'las-vegas-nevada':
                title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
                if title_match:
                    title = title_match.group(1).strip().lower()
                    if 'las vegas' in title:
                        # Silently redirected to Las Vegas — skip
                        return None

            # Success — reset failure counter
            self.consecutive_fetch_failures = 0
            return html

        except Exception as e:
            err_msg = str(e)
            self.consecutive_fetch_failures += 1

            # CRASH RECOVERY: Detect dead browser context
            if 'has been closed' in err_msg or 'Target page' in err_msg:
                log.warning(f'  🔴 Browser context dead — marking for reconnection')
                self._session_dead = True

            log.warning(f'  ❌ Fetch error: {e}')
            return None

    def ensure_connected(self):
        """Ensure the session is alive. Auto-reconnects on dead browser."""
        if not self.session or self._session_dead:
            log.info('🔄 Session dead or missing, reconnecting...')
            return self.connect()

        # If we've had 3+ consecutive fetch failures, force reconnect
        if self.consecutive_fetch_failures >= 3:
            log.warning(f'🔄 {self.consecutive_fetch_failures} consecutive fetch failures — forcing reconnect')
            return self.connect()

        return True

    def disconnect(self):
        """Safely close the session."""
        try:
            if self.session:
                self.session.close()
        except:
            pass
        finally:
            self.session = None
            self._session_dead = False


# ============================================================
# REGION SLUG AUTO-DISCOVERY
# ============================================================
def discover_regions(mgr):
    """Discover new region slugs from PokerAtlas and MERGE with hardcoded list.
    
    IMPORTANT: The hardcoded PA_REGION_SLUGS is the FLOOR — discovery can only
    ADD new regions, never shrink the list. This prevents PokerAtlas's index page
    (which only shows ~11 links) from overriding our comprehensive 61-region coverage.
    """
    log.info('📡 Discovering PokerAtlas regions (additive only)...')
    html = mgr.fetch_page('https://www.pokeratlas.com/poker-rooms')
    if not html:
        return PA_REGION_SLUGS

    discovered = set(re.findall(r'/poker-cash-games/([a-z0-9-]+)', html))
    hardcoded = set(PA_REGION_SLUGS)
    merged = sorted(hardcoded | discovered)
    new_slugs = discovered - hardcoded
    if new_slugs:
        log.info(f'  Discovered {len(new_slugs)} NEW regions: {new_slugs}')
    log.info(f'  Total regions: {len(merged)} (hardcoded: {len(hardcoded)}, discovered: {len(discovered)})')
    return merged


# ============================================================
# MAIN SCRAPE CYCLE
# ============================================================
def run_scrape_cycle(mgr):
    """Run one full scrape cycle."""
    batch_id = str(uuid.uuid4())
    cycle_start = datetime.now(timezone.utc)
    log.info(f'=== SCRAPE CYCLE #{mgr.total_cycles + 1} | Batch: {batch_id[:8]} ===')

    # Ensure connected
    if not mgr.ensure_connected():
        mgr.consecutive_failures += 1
        if mgr.consecutive_failures >= 5:
            log.error(f'🚨 {mgr.consecutive_failures} consecutive failures — sleeping 5min')
            time.sleep(300)
            mgr.consecutive_failures = 0
        return 0

    # Load or discover region slugs
    regions = load_pa_regions()
    if not regions:
        regions = discover_regions(mgr)
    log.info(f'Scraping {len(regions)} regions...')

    # Scrape each region
    all_venues = []
    errors = 0
    skipped = 0

    for i, slug in enumerate(regions):
        url = f'https://www.pokeratlas.com/poker-cash-games/{slug}'
        html = mgr.fetch_page(url, expected_slug=slug)

        if html is None:
            errors += 1
            if errors <= 3:
                log.info(f'  [{i+1}/{len(regions)}] ❌ {slug[:30]:30} | failed')
            continue

        venues, rhash, now = extract_games_from_region(html, slug)

        if venues:
            total_games = sum(len(v['games']) for v in venues)
            log.info(
                f'  [{i+1}/{len(regions)}] ✅ {slug[:30]:30} | '
                f'{len(venues)} rooms | {total_games} games'
            )
            all_venues.extend(venues)
        else:
            skipped += 1
            if skipped <= 5 or skipped % 10 == 0:
                log.info(f'  [{i+1}/{len(regions)}] ⏭️  {slug[:30]:30} | no data')

        time.sleep(RATE_LIMIT_DELAY)

        # Checkpoint every 15
        if (i + 1) % 15 == 0:
            log.info(f'  --- {i+1}/{len(regions)} | {len(all_venues)} venues | {errors} errors ---')

    # Build Supabase payload
    log.info(f'💾 Saving {len(all_venues)} venue records to Supabase...')

    # DEDUPLICATION: Fetch Bravo venue names to skip duplicates
    bravo_names = set()
    bravo_names_normalized = set()
    try:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/venue_live_tables?source=eq.bravo&select=venue_name',
            headers=SB_HEADERS,
        )
        resp = urllib.request.urlopen(req, timeout=15)
        bravo_data = json.loads(resp.read())
        for r in bravo_data:
            name = r.get('venue_name', '')
            bravo_names.add(name)
            bravo_names_normalized.add(re.sub(r'[^a-z0-9]', '', name.lower()))
        log.info(f'  Dedup: {len(bravo_names)} Bravo venues loaded for exclusion')
    except Exception as e:
        log.warning(f'  Dedup: Could not load Bravo venues: {e}')

    payload = []
    skipped_dupes = 0
    for venue_data in all_venues:
        venue_name = venue_data['venue_name']
        # Skip if venue exists in Bravo (exact or normalized match)
        normalized = re.sub(r'[^a-z0-9]', '', venue_name.lower())
        if venue_name in bravo_names or normalized in bravo_names_normalized:
            skipped_dupes += 1
            continue

        # Generate unique slug per venue (not per region!)
        venue_slug = re.sub(r'[^a-z0-9]+', '-', venue_name.lower()).strip('-')
        for game in venue_data['games']:
            record = {
                'venue_name': venue_name,
                'game_name': game['game'],
                'tables_running': game['tables_estimate'],
                'players_waiting': 0,
                'scrape_timestamp': venue_data['scrape_timestamp'],
                'scrape_html_hash': venue_data['scrape_html_hash'],
                'scrape_batch_id': batch_id,
                'data_quality': 'scraped_verified',
                'source': 'pokeratlas',
                'bravo_slug': f'pa-{venue_slug}',
            }
            payload.append(record)

    if skipped_dupes:
        log.info(f'  Dedup: Skipped {skipped_dupes} venues (already in Bravo)')

    saved = 0
    if payload:
        # Atomic Batch Insert — only delete PokerAtlas records
        if sb_upsert('venue_live_tables', payload):
            saved = len(payload)
            sb_delete('venue_live_tables', f'scrape_batch_id=neq.{batch_id}&source=eq.pokeratlas')

    # Save evidence
    evidence = {
        'batch_id': batch_id,
        'scrape_timestamp': cycle_start.isoformat(),
        'source': 'pokeratlas',
        'regions_scraped': len(regions),
        'venues_with_data': len(all_venues),
        'regions_skipped': skipped,
        'total_records_saved': saved,
        'errors': errors,
        'duration_seconds': (datetime.now(timezone.utc) - cycle_start).total_seconds(),
    }
    evidence_file = EVIDENCE_DIR / f'pokeratlas_live_{cycle_start.strftime("%Y%m%d_%H%M%S")}.json'
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)

    # Snapshot
    with open(BASE_DIR / 'data' / 'pokeratlas-live-snapshot.json', 'w') as f:
        json.dump({
            'metadata': evidence,
            'venues': [{
                'venue_name': v['venue_name'],
                'region': v['region_slug'],
                'games': v['games'],
            } for v in all_venues],
        }, f, indent=2, default=str)

    duration = (datetime.now(timezone.utc) - cycle_start).total_seconds()
    mgr.total_cycles += 1
    mgr.consecutive_failures = 0
    log.info(
        f'=== CYCLE #{mgr.total_cycles} COMPLETE | {len(all_venues)} venues | '
        f'{saved} records | {duration:.0f}s | Errors: {errors} ==='
    )
    return len(all_venues)

# ============================================================
# DAEMON LOOP
# ============================================================
running = True

def signal_handler(sig, frame):
    global running
    log.info('⛔ Shutdown signal received, stopping...')
    running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def main():
    log.info('=' * 60)
    log.info('POKER ATLAS LIVE GAMES — AUTONOMOUS DAEMON v2.0')
    log.info(f'Interval: {SCRAPE_INTERVAL}s ({SCRAPE_INTERVAL // 60}min)')
    log.info(f'Strategy: session.fetch() per region (no login needed)')
    log.info(f'Data: game catalog + buy-in + run schedule')
    log.info(f'Log dir: {LOG_DIR}')
    log.info('=' * 60)

    mgr = PokerAtlasSessionManager()

    while running:
        try:
            count = run_scrape_cycle(mgr)
            if count > 0:
                log.info(f'⏰ Next scrape in {SCRAPE_INTERVAL // 60} minutes...')
            else:
                backoff = min(60 * (mgr.consecutive_failures + 1), 300)
                log.warning(f'⏰ Retrying in {backoff}s (failure #{mgr.consecutive_failures})...')
                for _ in range(backoff):
                    if not running:
                        break
                    time.sleep(1)
                continue

        except Exception as e:
            log.error(f'💥 Unexpected error: {e}')
            traceback.print_exc()
            mgr.consecutive_failures += 1

        # Sleep for interval
        for _ in range(SCRAPE_INTERVAL):
            if not running:
                break
            time.sleep(1)

    log.info('🛑 Shutting down...')
    mgr.disconnect()
    log.info('Daemon stopped.')

if __name__ == '__main__':
    main()
