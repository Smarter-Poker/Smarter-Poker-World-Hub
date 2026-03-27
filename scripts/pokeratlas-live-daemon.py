#!/usr/bin/env python3
"""
PokerAtlas Live Games — Autonomous Scraper Daemon v1.0
=====================================================
Mirrors the Bravo daemon architecture using Scrapling + Camoufox
for Cloudflare Turnstile bypass.

Scrapes live cash game data from every PokerAtlas region page
and upserts into venue_live_tables with source='pokeratlas'.

Designed to run alongside bravo-live-daemon.py on offset cycles.
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

# PokerAtlas credentials
PA_USERNAME = 'danbekavac4545'
PA_PASSWORD = '215SlalomCt!'
PA_LOGIN_URL = 'https://www.pokeratlas.com/login'
PA_BASE_URL = 'https://www.pokeratlas.com'

# Timing
SCRAPE_INTERVAL = 900  # 15 minutes
RATE_LIMIT_DELAY = 1.5  # seconds between venue page loads (lighter than Bravo)
MAX_RETRIES = 3
LOGIN_TIMEOUT = 30000
PAGE_TIMEOUT = 20000
HEALTH_CHECK_INTERVAL = 3  # cycles between health checks

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
ERROR_LOGIN_FAILED = 'ERROR_LOGIN_FAILED'
ERROR_SESSION_DEAD = 'ERROR_SESSION_DEAD'
ERROR_PAGE_403 = 'ERROR_PAGE_403'
ERROR_SUPABASE = 'ERROR_SUPABASE'

# ============================================================
# SUPABASE HELPERS (identical to Bravo)
# ============================================================
SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def sb_upsert(table, data):
    """UPSERT to Supabase REST API with retry."""
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}',
        data=body, method='POST',
        headers={**SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal'}
    )
    for attempt in range(3):
        try:
            urllib.request.urlopen(req, timeout=15)
            return True
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                log.error(f'{ERROR_SUPABASE}: {e}')
                return False

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
# PokerAtlas organizes live cash games by region/city rather than
# individual venues. Each region page lists ALL venues in that area.
# URL pattern: /poker-cash-games/{city-state-slug}

# Master list of all US PokerAtlas cash game region slugs
PA_REGION_SLUGS = [
    # Nevada
    'las-vegas-nevada', 'reno-nevada', 'laughlin-nevada',
    # California
    'los-angeles-california', 'san-francisco-bay-area-california',
    'san-diego-california', 'sacramento-california',
    'central-valley-california', 'inland-empire-california',
    # Florida
    'south-florida', 'central-florida', 'north-florida', 'tampa-florida',
    # New Jersey / Atlantic City
    'atlantic-city-new-jersey',
    # New York
    'new-york',
    # Pennsylvania
    'pennsylvania',
    # Connecticut
    'connecticut',
    # Illinois
    'illinois',
    # Michigan
    'michigan',
    # Ohio
    'ohio',
    # Indiana
    'indiana',
    # Maryland
    'maryland',
    # Virginia
    'virginia',
    # Washington
    'washington',
    # Colorado
    'colorado',
    # Arizona
    'arizona',
    # Texas
    'texas',
    # Louisiana
    'louisiana',
    # Mississippi
    'mississippi',
    # Oklahoma
    'oklahoma',
    # Missouri
    'missouri',
    # Iowa
    'iowa',
    # Kansas
    'kansas',
    # Minnesota
    'minnesota',
    # Wisconsin
    'wisconsin',
    # Oregon
    'oregon',
    # North Carolina
    'north-carolina',
    # West Virginia
    'west-virginia',
    # South Carolina
    'south-carolina',
    # Maine
    'maine',
    # New Hampshire
    'new-hampshire',
    # Rhode Island
    'rhode-island',
    # Massachusetts
    'massachusetts',
    # Delaware
    'delaware',
    # New Mexico
    'new-mexico',
    # Montana
    'montana',
    # Idaho
    'idaho',
    # South Dakota
    'south-dakota',
    # North Dakota
    'north-dakota',
    # Nebraska
    'nebraska',
    # Alabama
    'alabama',
    # Georgia
    'georgia',
    # Tennessee
    'tennessee',
    # Kentucky
    'kentucky',
    # Arkansas
    'arkansas',
    # Hawaii
    'hawaii',
    # Alaska
    'alaska',
    # DC
    'washington-dc',
    # Canada (bonus coverage)
    'alberta-canada', 'british-columbia-canada', 'ontario-canada',
]

def load_pa_regions():
    """Load region slugs from registry file, or use hardcoded defaults."""
    registry_path = BASE_DIR / 'data' / 'pokeratlas-room-registry.json'
    if registry_path.exists():
        with open(registry_path) as f:
            data = json.load(f)
            return [r['slug'] for r in data.get('regions', [])]
    return PA_REGION_SLUGS

def discover_pa_regions(page):
    """Discover region slugs from PokerAtlas poker-rooms page."""
    log.info('📡 Discovering PokerAtlas regions...')
    try:
        page.goto(f'{PA_BASE_URL}/poker-rooms')
        page.wait_for_load_state('networkidle', timeout=PAGE_TIMEOUT)
        html = page.content()

        # Extract state/region links
        slugs = sorted(set(re.findall(r'/poker-cash-games/([a-z0-9-]+)', html)))
        if slugs:
            log.info(f'  Discovered {len(slugs)} PokerAtlas region slugs')
            reg = {
                'metadata': {'generated': datetime.now(timezone.utc).isoformat(), 'total_regions': len(slugs)},
                'regions': [{'slug': s, 'url': f'{PA_BASE_URL}/poker-cash-games/{s}'} for s in slugs]
            }
            (BASE_DIR / 'data').mkdir(exist_ok=True)
            with open(BASE_DIR / 'data' / 'pokeratlas-room-registry.json', 'w') as f:
                json.dump(reg, f, indent=2)
            return slugs
    except Exception as e:
        log.warning(f'  Discovery failed: {e}')

    return PA_REGION_SLUGS  # Fallback to hardcoded

# ============================================================
# DATA EXTRACTION — LOCKED IN
# ============================================================
def extract_live_data(html, region_slug):
    """Extract live cash game data from a PokerAtlas region page.

    PokerAtlas page structure (region cash games):
      - Each poker room is listed in a section with room name as header
      - Under each room, a table of currently running games
      - Columns typically: Game, Limit, Tables, Waiting, Players
    """
    body = html.encode('utf-8')
    rhash = hashlib.sha256(body).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    venues = []

    # PokerAtlas uses structured markup for cash game listings
    # Pattern: room sections contain venue name + game rows
    # Try multiple extraction patterns

    # Pattern 1: Table-based listing (most common)
    # Look for venue sections: <h3 class="poker-room-name">VenueName</h3>
    # followed by game rows
    venue_sections = re.findall(
        r'<(?:h[234]|div)[^>]*class="[^"]*(?:poker-room|room-name|venue)[^"]*"[^>]*>'
        r'(?:<a[^>]*>)?\s*(.*?)\s*(?:</a>)?</(?:h[234]|div)>'
        r'(.*?)(?=<(?:h[234]|div)[^>]*class="[^"]*(?:poker-room|room-name|venue)|$)',
        html, re.DOTALL | re.IGNORECASE
    )

    if not venue_sections:
        # Pattern 2: Generic table rows with venue grouping
        # PokerAtlas often uses <tr> with venue name in first column
        # and game data across the row
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
        current_venue = None

        for row in rows:
            cells = re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', row, re.DOTALL)
            if not cells:
                continue

            # Check for venue name header rows (typically bold/linked)
            venue_link = re.search(r'<a[^>]*href="[^"]*poker-room[^"]*"[^>]*>(.*?)</a>', row, re.DOTALL)
            if venue_link:
                current_venue = re.sub(r'<[^>]+>', '', venue_link.group(1)).strip()

            if current_venue and len(cells) >= 2:
                # Extract game info from cells
                game_name_raw = re.sub(r'<[^>]+>', '', cells[0]).strip()
                if not game_name_raw or game_name_raw == current_venue:
                    continue

                # Look for numeric values in remaining cells
                tables = 0
                waiting = 0
                for cell in cells[1:]:
                    clean = re.sub(r'<[^>]+>', '', cell).strip()
                    if clean.isdigit():
                        if tables == 0:
                            tables = int(clean)
                        else:
                            waiting = int(clean)

                if tables > 0:
                    # Find or create venue entry
                    existing = next((v for v in venues if v['venue_name'] == current_venue), None)
                    if not existing:
                        existing = {
                            'venue_name': current_venue,
                            'region_slug': region_slug,
                            'scrape_timestamp': now,
                            'scrape_html_hash': rhash,
                            'live_games': [],
                        }
                        venues.append(existing)

                    existing['live_games'].append({
                        'game': game_name_raw,
                        'tables': tables,
                        'players_waiting': waiting,
                    })
    else:
        # Process venue_sections from Pattern 1
        for venue_name_raw, section_html in venue_sections:
            venue_name = re.sub(r'<[^>]+>', '', venue_name_raw).strip()
            if not venue_name:
                continue

            venue_data = {
                'venue_name': venue_name,
                'region_slug': region_slug,
                'scrape_timestamp': now,
                'scrape_html_hash': rhash,
                'live_games': [],
            }

            # Parse game rows within this venue section
            game_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', section_html, re.DOTALL)
            for row in game_rows:
                cells = re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', row, re.DOTALL)
                if len(cells) >= 2:
                    game_name = re.sub(r'<[^>]+>', '', cells[0]).strip()
                    if not game_name:
                        continue

                    tables = 0
                    waiting = 0
                    for cell in cells[1:]:
                        clean = re.sub(r'<[^>]+>', '', cell).strip()
                        if clean.isdigit():
                            if tables == 0:
                                tables = int(clean)
                            elif waiting == 0:
                                waiting = int(clean)

                    if tables > 0:
                        venue_data['live_games'].append({
                            'game': game_name,
                            'tables': tables,
                            'players_waiting': waiting,
                        })

            if venue_data['live_games']:
                venues.append(venue_data)

    return venues, rhash, now

# ============================================================
# PERSISTENT SESSION MANAGER
# ============================================================
class PokerAtlasSessionManager:
    """Manages a persistent Scrapling browser session with PokerAtlas.

    Mirrors BravoSessionManager architecture:
    - Session stays open between 15-minute scrape cycles
    - Re-authenticates on session death or token expiry
    - Cloudflare Turnstile bypass via Camoufox
    """

    def __init__(self):
        self.session = None
        self.context = None
        self.page = None
        self.is_authenticated = False
        self.cycles_since_health_check = 0
        self.total_cycles = 0
        self.consecutive_failures = 0
        self.last_login_time = None

    def connect(self):
        """Establish a new Scrapling StealthySession and login to PokerAtlas."""
        from scrapling.fetchers import StealthySession

        self.disconnect()

        log.info('🔌 Establishing new StealthySession...')

        try:
            self.session = StealthySession(headless=True, solve_cloudflare=True)
            self.session.start()

            # Step 1: Solve Cloudflare Turnstile
            log.info('  ☁️  Solving Cloudflare Turnstile...')
            resp = self.session.fetch(PA_LOGIN_URL, google_search=True)

            if resp.status != 200:
                log.error(f'  {ERROR_CF_BLOCKED}: Status {resp.status}')
                return False

            log.info('  ✅ Cloudflare solved')

            # Step 2: Create page in CF-cleared context and login
            self.context = self.session.context
            self.page = self.context.new_page()

            return self._login()

        except Exception as e:
            log.error(f'  {ERROR_SESSION_DEAD}: {e}')
            traceback.print_exc()
            self.disconnect()
            return False

    def _login(self):
        """Submit login credentials to PokerAtlas."""
        log.info('  🔑 Logging in to PokerAtlas...')

        for attempt in range(MAX_RETRIES):
            try:
                self.page.goto(PA_LOGIN_URL)
                self.page.wait_for_load_state('networkidle', timeout=LOGIN_TIMEOUT)

                # Check if already logged in (was redirected)
                if '/login' not in self.page.url:
                    log.info(f'  ✅ Already logged in (URL: {self.page.url})')
                    self.is_authenticated = True
                    self.last_login_time = datetime.now(timezone.utc)
                    return True

                # Fill login form
                content = self.page.content()

                # PokerAtlas login form — search for email/username and password fields
                email_selectors = ['input[name="email"]', 'input[name="username"]', 'input[type="email"]', '#email', '#username']
                pass_selectors = ['input[name="password"]', 'input[type="password"]', '#password']

                email_filled = False
                for sel in email_selectors:
                    try:
                        el = self.page.query_selector(sel)
                        if el:
                            el.fill(PA_USERNAME)
                            email_filled = True
                            break
                    except:
                        continue

                pass_filled = False
                for sel in pass_selectors:
                    try:
                        el = self.page.query_selector(sel)
                        if el:
                            el.fill(PA_PASSWORD)
                            pass_filled = True
                            break
                    except:
                        continue

                if not email_filled or not pass_filled:
                    log.warning(f'  ⚠️  Login form fields not found (attempt {attempt + 1})')
                    time.sleep(3)
                    continue

                # Submit
                submit_selectors = ['button[type="submit"]', 'input[type="submit"]', '.login-btn', '#login-button']
                submitted = False
                for sel in submit_selectors:
                    try:
                        btn = self.page.query_selector(sel)
                        if btn:
                            btn.click()
                            submitted = True
                            break
                    except:
                        continue

                if not submitted:
                    # Try pressing Enter in password field
                    self.page.keyboard.press('Enter')

                self.page.wait_for_load_state('networkidle', timeout=LOGIN_TIMEOUT)

                # Verify login success
                post_url = self.page.url
                if '/login' not in post_url:
                    log.info(f'  ✅ Login successful (URL: {post_url})')
                    self.is_authenticated = True
                    self.last_login_time = datetime.now(timezone.utc)
                    return True
                else:
                    log.warning(f'  ⚠️  Login attempt {attempt + 1} — still on login page')
                    time.sleep(3)

            except Exception as e:
                log.warning(f'  ⚠️  Login attempt {attempt + 1} error: {e}')
                time.sleep(3)

        log.error(f'  {ERROR_LOGIN_FAILED}: All {MAX_RETRIES} attempts exhausted')
        return False

    def health_check(self):
        """Verify the session is still alive."""
        try:
            self.page.goto(f'{PA_BASE_URL}/poker-rooms')
            self.page.wait_for_load_state('networkidle', timeout=PAGE_TIMEOUT)
            content = self.page.content()

            if 'Just a moment' in content:
                log.warning('  ❌ Health check: CF challenge')
                return False
            if '/login' in self.page.url and 'Sign In' in content:
                log.warning('  ❌ Health check: Session expired')
                return False

            log.info('  ✅ Health check passed')
            return True
        except:
            return False

    def ensure_connected(self):
        """Ensure session is connected and authenticated."""
        if not self.is_authenticated or not self.page:
            log.info('🔄 Session not authenticated, connecting...')
            return self.connect()

        self.cycles_since_health_check += 1
        if self.cycles_since_health_check >= HEALTH_CHECK_INTERVAL:
            self.cycles_since_health_check = 0
            if not self.health_check():
                log.info('🔄 Health check failed, reconnecting...')
                return self.connect()

        return True

    def navigate_region(self, slug):
        """Navigate to a PokerAtlas cash games region page."""
        try:
            url = f'{PA_BASE_URL}/poker-cash-games/{slug}'
            self.page.goto(url)
            self.page.wait_for_load_state('networkidle', timeout=PAGE_TIMEOUT)

            content = self.page.content()

            # Check for login redirect
            if '/login' in self.page.url:
                log.warning(f'  ⚠️  Session expired during scrape, re-authenticating...')
                if self._login():
                    self.page.goto(url)
                    self.page.wait_for_load_state('networkidle', timeout=PAGE_TIMEOUT)
                    content = self.page.content()
                else:
                    return None

            # Check for CF challenge
            if 'Just a moment' in content:
                log.warning(f'  ⚠️  {ERROR_PAGE_403}: CF challenge on {slug}')
                return None

            return content

        except Exception as e:
            log.warning(f'  ❌ Navigate error on {slug}: {e}')
            return None

    def disconnect(self):
        """Safely close the session."""
        try:
            if self.page:
                try:
                    self.page.close()
                except:
                    pass
            if self.session:
                try:
                    self.session.close()
                except:
                    pass
        except:
            pass
        finally:
            self.page = None
            self.context = None
            self.session = None
            self.is_authenticated = False

# ============================================================
# MAIN SCRAPE CYCLE
# ============================================================
def run_scrape_cycle(mgr):
    """Run one full scrape cycle using the persistent session."""
    batch_id = str(uuid.uuid4())
    cycle_start = datetime.now(timezone.utc)
    log.info(f'=== SCRAPE CYCLE #{mgr.total_cycles + 1} | Batch: {batch_id[:8]} ===')

    # Ensure connected
    if not mgr.ensure_connected():
        mgr.consecutive_failures += 1
        if mgr.consecutive_failures >= 5:
            log.error(f'🚨 {mgr.consecutive_failures} consecutive failures — sleeping 5min before retry')
            time.sleep(300)
            mgr.consecutive_failures = 0
        return 0

    # Load region slugs
    regions = load_pa_regions()
    if not regions:
        log.info('No registry found, discovering regions...')
        regions = discover_pa_regions(mgr.page)
    log.info(f'Scraping {len(regions)} regions...')

    # Scrape each region
    all_venues = []
    errors = 0
    skipped = 0

    for i, slug in enumerate(regions):
        html = mgr.navigate_region(slug)
        if html is None:
            errors += 1
            if errors <= 3:
                log.info(f'  [{i+1}/{len(regions)}] ❌ {slug[:30]:30} | failed')
            continue

        venues, rhash, now = extract_live_data(html, slug)

        if venues:
            total_tables = sum(
                sum(g['tables'] for g in v['live_games'])
                for v in venues
            )
            log.info(
                f'  [{i+1}/{len(regions)}] ✅ {slug[:30]:30} | '
                f'{len(venues)} rooms | {total_tables} tables'
            )
            all_venues.extend(venues)
        else:
            skipped += 1
            if skipped <= 5 or skipped % 10 == 0:
                log.info(f'  [{i+1}/{len(regions)}] ⏭️  {slug[:30]:30} | no live data')

        time.sleep(RATE_LIMIT_DELAY)

        # Checkpoint every 20
        if (i + 1) % 20 == 0:
            log.info(f'  --- {i+1}/{len(regions)} | {len(all_venues)} venues | {errors} errors ---')

    # Build Supabase payload
    log.info(f'💾 Saving {len(all_venues)} venue records to Supabase...')

    payload = []
    for venue_data in all_venues:
        for game in venue_data['live_games']:
            record = {
                'venue_name': venue_data['venue_name'],
                'game_name': game['game'],
                'tables_running': game['tables'],
                'players_waiting': game.get('players_waiting', 0),
                'scrape_timestamp': venue_data['scrape_timestamp'],
                'scrape_html_hash': venue_data['scrape_html_hash'],
                'scrape_batch_id': batch_id,
                'data_quality': 'scraped_verified',
                'source': 'pokeratlas',
                'bravo_slug': f'pa-{venue_data["region_slug"]}',  # Prefix to avoid bravo slug collision
            }
            payload.append(record)

    saved = 0
    if payload:
        # Atomic Batch Insert
        if sb_upsert('venue_live_tables', payload):
            saved = len(payload)
            # Safe delete of stale PokerAtlas batches ONLY
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
        'session_uptime_minutes': (
            (datetime.now(timezone.utc) - mgr.last_login_time).total_seconds() / 60
            if mgr.last_login_time else 0
        ),
    }
    evidence_file = EVIDENCE_DIR / f'pokeratlas_live_{cycle_start.strftime("%Y%m%d_%H%M%S")}.json'
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)

    with open(BASE_DIR / 'data' / 'pokeratlas-live-snapshot.json', 'w') as f:
        json.dump({
            'metadata': evidence,
            'venues': [{
                'venue_name': v['venue_name'],
                'region': v['region_slug'],
                'games': v['live_games'],
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
    log.info('POKER ATLAS LIVE GAMES — AUTONOMOUS DAEMON v1.0')
    log.info(f'Interval: {SCRAPE_INTERVAL}s ({SCRAPE_INTERVAL // 60}min)')
    log.info(f'Persistent session: YES (stays logged in between cycles)')
    log.info(f'Retry policy: {MAX_RETRIES}x with exponential backoff')
    log.info(f'Health check: every {HEALTH_CHECK_INTERVAL} cycles')
    log.info(f'Log dir: {LOG_DIR}')
    log.info('=' * 60)

    mgr = PokerAtlasSessionManager()

    while running:
        try:
            count = run_scrape_cycle(mgr)
            if count > 0:
                log.info(f'⏰ Next scrape in {SCRAPE_INTERVAL // 60} minutes...')
            else:
                # Shorter backoff on failure
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

        # Sleep in 1s intervals for signal responsiveness
        for _ in range(SCRAPE_INTERVAL):
            if not running:
                break
            time.sleep(1)

    # Clean shutdown
    log.info('🛑 Shutting down, closing session...')
    mgr.disconnect()
    log.info('Daemon stopped.')

if __name__ == '__main__':
    main()
