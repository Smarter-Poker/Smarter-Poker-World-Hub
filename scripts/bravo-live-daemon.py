#!/usr/bin/env python3
"""
BRAVO POKER LIVE — AUTONOMOUS LIVE TABLE SCRAPER DAEMON v2.0
==============================================================
LOCKED-IN PRODUCTION PROCESS — DO NOT MODIFY CORE ARCHITECTURE.

Runs every 15 minutes with ZERO human involvement.
Uses a PERSISTENT Scrapling StealthySession to stay logged in
between scrape cycles, only re-authenticating when the session
expires or Cloudflare rotates its challenge.

Architecture (LOCKED IN):
  ┌─────────────────────────────────────────────────┐
  │  1. StealthySession(solve_cloudflare=True)      │
  │  2. context.new_page() → Login form             │
  │  3. fill Email + Password → press Enter         │
  │  4. PERSISTENT PAGE stays open between cycles   │
  │  5. Navigate /venues/{slug}/ → extract data     │
  │  6. Upsert to Supabase venue_live_tables        │
  │  7. Sleep 15 min → reuse same page → Step 5     │
  │  8. On failure → auto-reconnect → Step 1        │
  └─────────────────────────────────────────────────┘

Troubleshooting Protocol:
  ERROR_CF_BLOCKED    → Cloudflare rotated challenge → full restart
  ERROR_LOGIN_FAILED  → Credentials rejected → retry 3x then alert
  ERROR_SESSION_DEAD  → Browser crashed → full restart
  ERROR_VENUE_403     → Single venue blocked → skip, retry next cycle
  ERROR_SUPABASE      → DB write failed → queue for retry

Usage:
  # Foreground:
  .venv/bin/python3 scripts/bravo-live-daemon.py

  # Background (no terminal needed):
  nohup .venv/bin/python3 scripts/bravo-live-daemon.py >> data/bravo-logs/daemon.log 2>&1 &

  # Auto-start on macOS boot:
  launchctl load ~/Library/LaunchAgents/com.smarter-poker.bravo-daemon.plist
"""

import json
import os
import re
import hashlib
import sys
import time
import uuid
import signal
import logging
import traceback
import urllib.request
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from typing import Dict, List, Optional

# Resolve the absolute path to the project root and load the correct .env file
project_root = Path(__file__).resolve().parent.parent
env_candidates = ['.env.local', '.env.production.local', '.env.prod', '.env']
for env_file in env_candidates:
    env_path = project_root / env_file
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        print(f"Loaded environment from {env_file}")
        break

# Optional: Fallback to regular load_dotenv if none of the above are found
load_dotenv()

# ============================================================
# CONFIG — LOCKED IN
# ============================================================
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
BRAVO_EMAIL = os.environ.get('BRAVO_EMAIL', 'admin@smarter.poker')
BRAVO_PASS = os.environ.get('BRAVO_PASS')
BRAVO_LOGIN_URL = 'https://www.bravopokerlive.com/login/'

# ── STARTUP CREDENTIAL VALIDATION ──
# Fail fast instead of silently looping with None password
if not BRAVO_PASS:
    print('\n' + '=' * 60)
    print('FATAL: BRAVO_PASS environment variable is not set.')
    print('The daemon cannot log in to Bravo without credentials.')
    print('Set BRAVO_PASS in .env.local or launchd plist.')
    print('=' * 60 + '\n')
    sys.exit(1)
if not SUPABASE_KEY:
    print('FATAL: SUPABASE_SERVICE_ROLE_KEY not set. Cannot write data.')
    sys.exit(1)
BRAVO_VENUE_URL = 'https://www.bravopokerlive.com/venues/{slug}/'
SCRAPE_INTERVAL = 900          # 15 minutes
MAX_RETRIES = 3                # Max login retries before full restart
VENUE_TIMEOUT = 15000          # 15s per venue page load (was 10s — too tight for Bravo CDN)
LOGIN_TIMEOUT = 15000          # 15s for login flow
RATE_LIMIT_DELAY = 0.5         # 0.5s between venues
HEALTH_CHECK_INTERVAL = 3      # Health-check every N cycles
VENUE_RETRY_COUNT = 1          # Retry failed venues once before giving up
CIRCUIT_BREAKER_THRESHOLD = 8  # Abort cycle + reconnect if this many consecutive venues fail
SESSION_REFRESH_MINUTES = 45   # Proactive session refresh to prevent zombie browsers (was 90 — too long)
WATCHDOG_MAX_STALE_MINUTES = 30  # Exit process if no successful save in this many minutes (launchd restarts)
CONNECT_TIMEOUT_SECONDS = 120  # Hard kill if connect() hangs longer than this (covers CF solve + login)
CHUNK_SIZE = 25                 # Publish partial results every N venues (don't wait for full cycle)
PAGE_RECYCLE_INTERVAL = 50     # Recycle browser page every N venues to prevent memory leaks
BASE_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = BASE_DIR / 'data' / 'bravo-logs'
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'
HEARTBEAT_FILE = LOG_DIR / 'heartbeat.json'
COOKIE_CACHE_FILE = LOG_DIR / 'cf_cookies.json'

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
log = logging.getLogger('bravo-daemon')

# ============================================================
# ERROR CODES
# ============================================================
ERROR_CF_BLOCKED = 'ERROR_CF_BLOCKED'
ERROR_LOGIN_FAILED = 'ERROR_LOGIN_FAILED'
ERROR_SESSION_DEAD = 'ERROR_SESSION_DEAD'
ERROR_VENUE_403 = 'ERROR_VENUE_403'
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
# BRAVO VENUE SLUG REGISTRY
# ============================================================
# Non-US venues to permanently exclude (UK, Canada, cruise ships)
# These cause timeouts and are outside our USA-only scope.
NON_US_EXCLUDED = {
    'alea-glasgow', 'alea-nottingham',           # UK
    'elements-casino-brantford',                  # Canada
    'fallsview-casino-resort', 'casino-niagara',  # Canada (Niagara Falls, ON)
    'rendezvous-brighton',                        # UK
    'norwegian-cruise-lines-poker-challenge',     # Cruise ship
}

def load_bravo_slugs():
    """Load venue slugs from locked-in registry (USA only)."""
    registry_path = BASE_DIR / 'data' / 'bravo-room-registry.json'
    if registry_path.exists():
        with open(registry_path) as f:
            data = json.load(f)
            return [v['slug'] for v in data.get('venues', []) if v['slug'] not in NON_US_EXCLUDED]
    return []

def discover_bravo_slugs(page):
    """Extract venue slugs from Bravo homepage, filtering non-US venues."""
    page.goto('https://www.bravopokerlive.com/')
    page.wait_for_load_state('networkidle', timeout=15000)
    html = page.content()
    all_slugs = sorted(set(re.findall(r'/venues/([a-z0-9-]+)/', html)))
    slugs = [s for s in all_slugs if s not in NON_US_EXCLUDED]
    excluded = [s for s in all_slugs if s in NON_US_EXCLUDED]
    if excluded:
        log.info(f'  🚫 Filtered {len(excluded)} non-US venues: {excluded}')
    log.info(f'Discovered {len(slugs)} USA venue slugs (from {len(all_slugs)} total)')
    # Save for next time (only USA venues)
    reg = {
        'metadata': {
            'generated': datetime.now(timezone.utc).isoformat(),
            'total_venues': len(slugs),
            'non_us_excluded': sorted(NON_US_EXCLUDED),
        },
        'venues': [{'slug': s, 'url': f'https://www.bravopokerlive.com/venues/{s}/'} for s in slugs]
    }
    (BASE_DIR / 'data').mkdir(exist_ok=True)
    with open(BASE_DIR / 'data' / 'bravo-room-registry.json', 'w') as f:
        json.dump(reg, f, indent=2)
    return slugs

# ============================================================
# DATA EXTRACTION — LOCKED IN
# ============================================================
def extract_live_data(html, venue_slug):
    """Extract live games and waitlist from Bravo venue HTML.
    
    Data format (from Bravo HTML):
      Table 1: "Current Live Games" → <td>game_name</td><td>table_count</td>
      Table 2: "Current Waiting List" → <td>game_name</td><td>players_waiting</td>
    """
    body = html.encode('utf-8')
    rhash = hashlib.sha256(body).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    result = {
        'venue_slug': venue_slug,
        'scrape_timestamp': now,
        'scrape_html_hash': rhash,
        'scrape_byte_count': len(body),
        'live_games': [],
        'waitlist': [],
        'venue_name': '',
        'address': '',
        'phone': '',
    }

    h1 = re.search(r'<h1>(.*?)</h1>', html)
    if h1:
        result['venue_name'] = h1.group(1).strip()

    addr = re.search(r'glyphicon-map-marker.*?</i>\s*(.*?)(?:\s*<br|\s*\n)', html, re.DOTALL)
    if addr:
        result['address'] = addr.group(1).strip()

    phone = re.search(r'glyphicon-phone.*?<strong>([\d-]+)</strong>', html)
    if phone:
        result['phone'] = phone.group(1).strip()

    # ── Parse live games and waitlist tables ──
    # Bravo uses two patterns:
    #   OLD: Header text ("Current Live Games") appears BEFORE the <table>
    #   NEW: Header text appears INSIDE the <table> as a <th> element
    # The old regex `Current Live Games.*?<table>` broke on the new format
    # because it skipped past the table containing the header and captured
    # the NEXT table (the waitlist), inflating table counts across all venues.
    #
    # FIX: Find ALL <table> elements, check which CONTAINS each header.
    # Fallback to old regex if no table contains the header text.

    all_tables = re.findall(r'<table[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)

    live_table_content = None
    wait_table_content = None

    for tbl in all_tables:
        if re.search(r'Current\s+Live\s+Games', tbl, re.IGNORECASE):
            live_table_content = tbl
        elif re.search(r'Current\s+Waiting\s+List', tbl, re.IGNORECASE):
            wait_table_content = tbl

    # Fallback: old Bravo format where header text is OUTSIDE/BEFORE the <table>
    if live_table_content is None:
        m = re.search(r'Current\s+Live\s+Games.*?<table[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
        if m:
            live_table_content = m.group(1)

    if wait_table_content is None:
        m = re.search(r'Current\s+Waiting\s+List.*?<table[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
        if m:
            wait_table_content = m.group(1)

    # Extract live games
    if live_table_content:
        rows = re.findall(r'<tr>(.*?)</tr>', live_table_content, re.DOTALL)
        for row in rows:
            cells = re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', row, re.DOTALL)
            if len(cells) >= 2:
                game_name = cells[0].strip()
                table_count = cells[1].strip()
                if game_name and table_count.isdigit():
                    result['live_games'].append({'game': game_name, 'tables': int(table_count)})

    # Extract waitlist
    if wait_table_content:
        rows = re.findall(r'<tr>(.*?)</tr>', wait_table_content, re.DOTALL)
        for row in rows:
            cells = re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', row, re.DOTALL)
            if len(cells) >= 2:
                game_name = cells[0].strip()
                players = cells[1].strip()
                if game_name and players.isdigit():
                    result['waitlist'].append({'game': game_name, 'players_waiting': int(players)})

    return result

# ============================================================
# HEARTBEAT WRITER
# ============================================================
def write_heartbeat(status, extra=None):
    """Write a heartbeat file so external watchdog can detect stale daemons."""
    try:
        hb = {
            'daemon': 'bravo',
            'status': status,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'pid': os.getpid(),
        }
        if extra:
            hb.update(extra)
        with open(HEARTBEAT_FILE, 'w') as f:
            json.dump(hb, f, indent=2)
    except Exception:
        pass  # Never crash on heartbeat write


# ============================================================
# FALLBACK FETCHER — TIER 2: PlayWrightFetcher
# ============================================================
def fallback_fetch_venue_playwright(slug):
    """Tier 2 fallback: Use Scrapling's PlayWrightFetcher (non-stealth but faster reconnect)."""
    try:
        from scrapling.fetchers import PlayWrightFetcher
        fetcher = PlayWrightFetcher(headless=True)
        url = BRAVO_VENUE_URL.format(slug=slug)
        resp = fetcher.fetch(url)
        if resp and resp.status == 200:
            html = resp.html_content or ''
            if not html:
                html = resp.body.decode('utf-8', errors='ignore') if resp.body else ''
            if html and 'Current Live Games' in html:
                log.info(f'  🔄 TIER-2 (PlayWrightFetcher) success for {slug}')
                return html
    except Exception as e:
        log.debug(f'  Tier-2 failed for {slug}: {e}')
    return None


def fallback_fetch_venue_urllib(slug):
    """Tier 3 fallback: Use raw urllib with cached CF cookies (fastest, least reliable)."""
    try:
        if not COOKIE_CACHE_FILE.exists():
            return None
        with open(COOKIE_CACHE_FILE) as f:
            cookies = json.load(f)
        if not cookies.get('cf_clearance'):
            return None

        url = BRAVO_VENUE_URL.format(slug=slug)
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': f'cf_clearance={cookies["cf_clearance"]}; bravo_session={cookies.get("bravo_session", "")}',
            'Accept': 'text/html,application/xhtml+xml',
        })
        resp = urllib.request.urlopen(req, timeout=10)
        html = resp.read().decode('utf-8', errors='ignore')
        if 'Current Live Games' in html:
            log.info(f'  🔄 TIER-3 (urllib+cookies) success for {slug}')
            return html
    except Exception as e:
        log.debug(f'  Tier-3 failed for {slug}: {e}')
    return None


def save_cookies_from_page(page):
    """Extract CF cookies from browser context for Tier 3 fallback."""
    try:
        cookies = page.context.cookies()
        cache = {}
        for c in cookies:
            if c.get('name') in ('cf_clearance', '__cf_bm', 'bravo_session', '_bravo_session'):
                cache[c['name']] = c['value']
        if cache:
            with open(COOKIE_CACHE_FILE, 'w') as f:
                json.dump(cache, f)
    except Exception:
        pass


# ============================================================
# PERSISTENT SESSION MANAGER
# ============================================================
class BravoSessionManager:
    """Manages a persistent Scrapling browser session with Bravo.
    
    Multi-tier fallback strategy:
      Tier 1: StealthySession (primary — full CF bypass)
      Tier 2: PlayWrightFetcher (no CF solve, but fast reconnect)
      Tier 3: Raw urllib with cached CF cookies (fastest, needs valid cookies)
    
    Only re-authenticates when:
      - Session is first created
      - Health check detects session death
      - Cloudflare rotates its challenge
      - Login token expires (redirected to login page)
      - Proactive refresh after SESSION_REFRESH_MINUTES
    """

    def __init__(self):
        self.session = None
        self.context = None
        self.page = None
        self.is_authenticated = False
        self.cycles_since_health_check = 0
        self.total_cycles = 0
        self.consecutive_failures = 0
        self.consecutive_nav_failures = 0
        self.last_login_time = None
        self._session_dead = False
        self.tier2_failures = 0  # Track Tier 2 failures to avoid wasting time

    def connect(self):
        """Establish a new Scrapling StealthySession and login to Bravo.
        
        Protected by CONNECT_TIMEOUT_SECONDS hard-kill timer to prevent
        zombie states when StealthySession.start() hangs.
        Includes network pre-check and retry on initial CF-solve fetch.
        """
        from scrapling.fetchers import StealthySession

        # Close any existing session and kill zombie browser processes
        self.disconnect()
        _kill_zombie_browsers()

        # Network pre-check — don't waste time on browser if network is down
        if not _network_available():
            log.warning('  ⚠️  Network unavailable — skipping browser launch')
            return False

        log.info('🔌 Establishing new StealthySession...')

        # Arm a hard-kill timer — if connect takes too long, force-exit
        # so launchd can restart us with a clean process
        watchdog_timer = threading.Timer(
            CONNECT_TIMEOUT_SECONDS,
            _hard_kill_on_hang,
            args=('connect() hung for >{}s'.format(CONNECT_TIMEOUT_SECONDS),)
        )
        watchdog_timer.daemon = True
        watchdog_timer.start()

        try:
            self.session = StealthySession(headless=True, solve_cloudflare=True)
            self.session.start()
            self._session_dead = False
            self.consecutive_nav_failures = 0

            # Step 1: Solve Cloudflare Turnstile (with retry)
            # The first fetch can fail with ERR_INTERNET_DISCONNECTED if network
            # just came back from sleep. Retry up to 3 times with backoff.
            resp = None
            for cf_attempt in range(3):
                try:
                    log.info(f'  ☁️  Solving Cloudflare Turnstile (attempt {cf_attempt + 1})...')
                    resp = self.session.fetch(BRAVO_LOGIN_URL, google_search=True)
                    if resp.status == 200 or resp.status == 307:
                        break
                    log.warning(f'  Attempt {cf_attempt + 1} returned HTTP {resp.status}')
                except Exception as e:
                    log.warning(f'Attempt {cf_attempt + 1} failed: {e}. Retrying in {2 ** cf_attempt}s...')
                    if cf_attempt < 2:
                        time.sleep(2 ** cf_attempt)
                        # Browser context may have died, need fresh session
                        try:
                            self.session.close()
                        except Exception:
                            pass
                        _kill_zombie_browsers()
                        self.session = StealthySession(headless=True, solve_cloudflare=True)
                        self.session.start()
                    else:
                        raise

            if not resp or resp.status not in (200, 307):
                log.error(f'  {ERROR_CF_BLOCKED}: Status {resp.status if resp else "None"}')
                watchdog_timer.cancel()
                return False

            log.info('  ✅ Cloudflare solved')

            # Step 2: Create page in CF-cleared context and login
            self.context = self.session.context
            self.page = self.context.new_page()

            result = self._login()
            watchdog_timer.cancel()
            return result

        except Exception as e:
            watchdog_timer.cancel()
            log.error(f'  {ERROR_SESSION_DEAD}: {e}')
            traceback.print_exc()
            self.disconnect()
            return False

    def _login(self):
        """Submit login credentials on the current page."""
        log.info('  🔑 Logging in to Bravo...')

        for attempt in range(MAX_RETRIES):
            try:
                self.page.goto(f'{BRAVO_LOGIN_URL}?ReturnUrl=%2fvenues%2f', timeout=LOGIN_TIMEOUT, wait_until='domcontentloaded')
                time.sleep(3)  # Let page render — safer than networkidle which hangs on trackers

                content = self.page.content()
                if 'name="Email"' not in content:
                    # Already logged in or CF challenge page
                    if 'Welcome back' in content:
                        log.info('  ✅ Already authenticated')
                        self.is_authenticated = True
                        self.last_login_time = datetime.now(timezone.utc)
                        return True
                    elif 'Just a moment' in content:
                        log.warning(f'  ⚠️  CF challenge on login page (attempt {attempt+1})')
                        time.sleep(5)
                        continue
                    else:
                        log.error(f'  {ERROR_LOGIN_FAILED}: No email field found')
                        continue

                # Fill credentials
                self.page.fill('input[name="Email"]', BRAVO_EMAIL)
                self.page.fill('input[name="Password"]', BRAVO_PASS)
                self.page.press('input[name="Password"]', 'Enter')
                time.sleep(5)  # Wait for login redirect — safer than networkidle

                url = self.page.url
                post_content = self.page.content()

                if 'Welcome back' in post_content:
                    log.info(f'  ✅ Login successful (URL: {url})')
                    self.is_authenticated = True
                    self.last_login_time = datetime.now(timezone.utc)
                    self.consecutive_failures = 0
                    return True
                elif 'login' not in url.lower():
                    # Redirected away from login — likely success
                    log.info(f'  ✅ Login successful (redirected to: {url})')
                    self.is_authenticated = True
                    self.last_login_time = datetime.now(timezone.utc)
                    self.consecutive_failures = 0
                    return True
                else:
                    # Still on login page — check for errors
                    err = re.search(r'class="[^"]*(?:error|alert|danger)[^"]*"[^>]*>(.*?)</(?:div|span)', post_content, re.DOTALL | re.I)
                    err_msg = re.sub(r'<[^>]+>', '', err.group(1)).strip()[:100] if err else 'unknown'
                    log.warning(f'  ⚠️  Login attempt {attempt+1} failed: {err_msg}')
                    time.sleep(2 ** attempt)

            except Exception as e:
                log.warning(f'  ⚠️  Login attempt {attempt+1} error: {e}')
                time.sleep(2 ** attempt)

        log.error(f'  {ERROR_LOGIN_FAILED}: All {MAX_RETRIES} attempts exhausted')
        self.is_authenticated = False
        return False

    def health_check(self):
        """Check if the current session is still alive and authenticated."""
        if not self.page or not self.session:
            return False

        try:
            # Navigate to a known Bravo page
            self.page.goto('https://www.bravopokerlive.com/venues/bellagio/')
            self.page.wait_for_load_state('networkidle', timeout=VENUE_TIMEOUT)

            content = self.page.content()

            if 'Welcome back' in content:
                log.info('  💚 Health check: authenticated')
                return True
            elif 'Just a moment' in content:
                log.warning('  🟡 Health check: CF challenge — need re-auth')
                return False
            elif 'name="Email"' in content or 'loginmodal' in content.lower():
                log.warning('  🟡 Health check: session expired — need re-auth')
                return False
            elif '<h1>' in content:
                # Got venue content but no "Welcome back" text
                log.info('  💚 Health check: page loaded (venue content present)')
                return True
            else:
                log.warning('  🟡 Health check: unknown page state')
                return False

        except Exception as e:
            log.error(f'  🔴 Health check failed: {e}')
            return False

    def ensure_connected(self):
        """Ensure session is connected and authenticated, reconnecting if needed."""
        # Check if session is dead from crash
        if self._session_dead:
            log.info('🔄 Session marked dead (browser crashed), reconnecting...')
            return self.connect()

        # Check consecutive navigation failures (crash recovery)
        if self.consecutive_nav_failures >= 3:
            log.warning(f'🔄 {self.consecutive_nav_failures} consecutive nav failures — forcing reconnect')
            return self.connect()

        # PROACTIVE SESSION REFRESH — prevent zombie browsers
        if self.last_login_time:
            age_minutes = (datetime.now(timezone.utc) - self.last_login_time).total_seconds() / 60
            if age_minutes >= SESSION_REFRESH_MINUTES:
                log.info(f'🔄 Proactive session refresh (age: {age_minutes:.0f}min >= {SESSION_REFRESH_MINUTES}min)')
                return self.connect()

        # Periodic health check
        self.cycles_since_health_check += 1
        needs_health = self.cycles_since_health_check >= HEALTH_CHECK_INTERVAL

        if not self.is_authenticated or self.page is None:
            log.info('🔄 Session not authenticated, connecting...')
            return self.connect()

        if needs_health:
            log.info('🩺 Running periodic health check...')
            self.cycles_since_health_check = 0
            if not self.health_check():
                log.info('🔄 Health check failed, reconnecting...')
                return self.connect()

        return True

    def navigate_venue(self, slug):
        """Navigate to a venue page with multi-tier fallback.
        
        Tier 1: Primary StealthySession page navigation
        Tier 2: PlayWrightFetcher (independent browser, no CF solve)
        Tier 3: Raw urllib with cached CF cookies
        """
        # === TIER 1: Primary StealthySession ===
        for attempt in range(1 + VENUE_RETRY_COUNT):
            try:
                self.page.goto(BRAVO_VENUE_URL.format(slug=slug), timeout=VENUE_TIMEOUT, wait_until='load')

                content = self.page.content()

                # Check if we got redirected to login (session expired)
                if 'name="Email"' in content and 'loginmodal' in content.lower():
                    log.warning(f'  ⚠️  Session expired during scrape, re-authenticating...')
                    if self._login():
                        # Retry the venue
                        self.page.goto(BRAVO_VENUE_URL.format(slug=slug), timeout=VENUE_TIMEOUT, wait_until='load')
                        content = self.page.content()
                    else:
                        break  # Fall through to Tier 2

                # Check for CF challenge
                if 'Just a moment' in content:
                    log.warning(f'  ⚠️  {ERROR_VENUE_403}: CF challenge on {slug}')
                    break  # Fall through to Tier 2

                # Success — reset failure counter, cache cookies for Tier 3
                self.consecutive_nav_failures = 0
                save_cookies_from_page(self.page)
                return content

            except Exception as e:
                err_msg = str(e)

                # CRASH RECOVERY: Detect dead browser context
                if 'has been closed' in err_msg or 'Target page' in err_msg:
                    log.warning(f'  🔴 Browser context dead — trying fallback fetchers')
                    self._session_dead = True
                    self.consecutive_nav_failures += 1
                    break  # Fall through to Tier 2

                # Retry on timeout (transient network issue)
                if attempt < VENUE_RETRY_COUNT and 'Timeout' in err_msg:
                    log.info(f'  🔄 Retry {attempt + 1} for {slug} (timeout)')
                    time.sleep(1)
                    continue

                self.consecutive_nav_failures += 1
                if 'Timeout' in err_msg and self.consecutive_nav_failures >= CIRCUIT_BREAKER_THRESHOLD:
                    log.warning(f'  🔴 {self.consecutive_nav_failures} consecutive timeouts — browser is zombie, marking dead')
                    self._session_dead = True

                log.warning(f'  ❌ Tier-1 navigate error on {slug}: {e}')
                break  # Fall through to Tier 2

        # === TIER 2: PlayWrightFetcher (independent browser) ===
        if self.tier2_failures < 5:  # Don't keep trying Tier 2 if it's dead too
            html = fallback_fetch_venue_playwright(slug)
            if html:
                self.consecutive_nav_failures = 0
                return html
            else:
                self.tier2_failures += 1

        # === TIER 3: Raw urllib with cached cookies ===
        html = fallback_fetch_venue_urllib(slug)
        if html:
            self.consecutive_nav_failures = 0
            return html

        # All tiers failed
        return None

    def recycle_page(self):
        """Close and reopen the browser page to free memory.
        
        After navigating ~50 pages, the browser context accumulates DOM
        snapshots and network data that leak memory. Recycling the page
        (but keeping the context/session) clears this without losing
        authentication cookies.
        """
        try:
            if self.page:
                self.page.close()
            self.page = self.context.new_page()
            log.info('  ♻️  Page recycled (memory cleanup)')
            return True
        except Exception as e:
            log.warning(f'  ⚠️  Page recycle failed: {e} — marking session dead')
            self._session_dead = True
            return False

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
            self._session_dead = False

# ============================================================
# CLEANUP: EVIDENCE FILES (keep last 7 days)
# ============================================================
def cleanup_evidence_files():
    """Delete evidence JSON files older than 7 days (any source)."""
    try:
        cutoff = time.time() - (7 * 86400)
        count = 0
        # Clean ALL evidence files, not just bravo's — prevents cross-daemon accumulation
        for f in EVIDENCE_DIR.glob('*.json'):
            if f.stat().st_mtime < cutoff:
                f.unlink()
                count += 1
        if count:
            log.info(f'  🧹 Cleaned up {count} evidence files (>7 days old)')
    except Exception as e:
        log.debug(f'  Evidence cleanup error: {e}')


# ============================================================
# CLEANUP: LOG FILES (keep last 14 days)
# ============================================================
def cleanup_log_files():
    """Delete daemon log files older than 14 days. Truncate launchd stderr/stdout if >5MB."""
    try:
        cutoff = time.time() - (14 * 86400)
        count = 0
        for f in LOG_DIR.glob('daemon_*.log'):
            if f.stat().st_mtime < cutoff:
                f.unlink()
                count += 1
        # Truncate launchd stderr/stdout logs if over 5MB
        for logname in ['launchd-stderr.log', 'launchd-stdout.log']:
            lf = LOG_DIR / logname
            if lf.exists() and lf.stat().st_size > 5 * 1024 * 1024:
                # Keep last 1000 lines
                try:
                    lines = lf.read_text().splitlines()[-1000:]
                    lf.write_text('\n'.join(lines) + '\n')
                    count += 1
                except Exception:
                    pass
        if count:
            log.info(f'  🧹 Cleaned up {count} log files (>14 days old / truncated)')
    except Exception as e:
        log.debug(f'  Log cleanup error: {e}')


# ============================================================
# DAILY DISCOVERY: Detect new/removed Bravo venues
# ============================================================
_last_bravo_discovery_date = None

def daily_bravo_discovery(mgr):
    """Once per day, scrape Bravo homepage to detect new venue slugs."""
    global _last_bravo_discovery_date
    today = datetime.now().strftime('%Y%m%d')
    if _last_bravo_discovery_date == today:
        return
    _last_bravo_discovery_date = today

    log.info('📡 Running daily Bravo venue discovery...')
    try:
        current_slugs = set(load_bravo_slugs())
        new_slugs = discover_bravo_slugs(mgr.page)
        new_set = set(new_slugs)

        added = new_set - current_slugs
        removed = current_slugs - new_set

        if added:
            log.info(f'  💡 NEW venues discovered: {sorted(added)}')
        if removed:
            log.info(f'  🗑️  Venues no longer listed: {sorted(removed)}')
        if not added and not removed:
            log.info(f'  ✅ No venue changes (still {len(new_set)} venues)')
    except Exception as e:
        log.warning(f'  ⚠️ Daily discovery failed: {e}')


# ============================================================
# HISTORICAL SNAPSHOT: Save per-cycle venue summary for trending
# ============================================================
def save_history_snapshot(batch_id, results):
    """Insert a summary row per venue into venue_live_history for trending."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for data in results:
            total_tables = sum(g['tables'] for g in data['live_games'])
            total_waiting = sum(w['players_waiting'] for w in data['waitlist'])
            rows.append({
                'bravo_slug': data['venue_slug'],
                'venue_name': data['venue_name'],
                'total_tables': total_tables,
                'total_waiting': total_waiting,
                'game_count': len(data['live_games']),
                'source': 'bravo',
                'snapshot_time': now,
                'batch_id': batch_id,
            })
        if rows:
            body = json.dumps(rows).encode()
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/venue_live_history',
                data=body, method='POST',
                headers={**SB_HEADERS, 'Prefer': 'return=minimal'}
            )
            try:
                urllib.request.urlopen(req, timeout=15)
                log.info(f'  📊 Saved {len(rows)} history snapshots')
            except Exception as e:
                # Table may not exist yet — that's OK, don't crash
                log.debug(f'  History snapshot insert skipped: {e}')
    except Exception as e:
        log.debug(f'  History snapshot error: {e}')


# ============================================================
# GAME-LEVEL HISTORICAL SNAPSHOT: Per-game rows for heatmaps/predictions
# ============================================================
def save_game_history_snapshot(batch_id, results):
    """Insert per-game rows into game_live_history for game-type heatmaps.
    
    This is ADDITIVE — it writes to a separate table (game_live_history)
    and never touches venue_live_history. Safe to fail silently.
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for data in results:
            for game in data['live_games']:
                rows.append({
                    'bravo_slug': data['venue_slug'],
                    'venue_name': data['venue_name'],
                    'game_type': game['game'],
                    'stakes': '',
                    'tables': game['tables'],
                    'waiting': 0,
                    'source': 'bravo',
                    'snapshot_time': now,
                    'batch_id': batch_id,
                })
            for w in data['waitlist']:
                # Check if already covered by live_games
                live_names = [g['game'].lower() for g in data['live_games']]
                if w['game'].lower() not in live_names:
                    rows.append({
                        'bravo_slug': data['venue_slug'],
                        'venue_name': data['venue_name'],
                        'game_type': w['game'],
                        'stakes': '',
                        'tables': 0,
                        'waiting': w['players_waiting'],
                        'source': 'bravo',
                        'snapshot_time': now,
                        'batch_id': batch_id,
                    })
        if rows:
            body = json.dumps(rows).encode()
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/game_live_history',
                data=body, method='POST',
                headers={**SB_HEADERS, 'Prefer': 'return=minimal'}
            )
            try:
                urllib.request.urlopen(req, timeout=15)
                log.info(f'  📊 Saved {len(rows)} game history rows')
            except Exception as e:
                # Table may not exist yet — that's OK, don't crash
                log.debug(f'  Game history insert skipped: {e}')
    except Exception as e:
        log.debug(f'  Game history snapshot error: {e}')


# ============================================================
# CHUNKED PUBLISH HELPER
# ============================================================
def build_payload_from_results(results, batch_id):
    """Convert venue results into Supabase-ready payload records."""
    payload = []
    for data in results:
        for game in data['live_games']:
            record = {
                'bravo_slug': data['venue_slug'],
                'venue_name': data['venue_name'],
                'game_name': game['game'],
                'tables_running': game['tables'],
                'players_waiting': 0,
                'scrape_timestamp': data['scrape_timestamp'],
                'scrape_html_hash': data['scrape_html_hash'],
                'scrape_batch_id': batch_id,
                'data_quality': 'scraped_verified',
                'source': 'bravo',
            }
            for w in data['waitlist']:
                if w['game'].lower() == game['game'].lower():
                    record['players_waiting'] = w['players_waiting']
            payload.append(record)

        live_names = [g['game'].lower() for g in data['live_games']]
        for w in data['waitlist']:
            if w['game'].lower() not in live_names:
                record = {
                    'bravo_slug': data['venue_slug'],
                    'venue_name': data['venue_name'],
                    'game_name': w['game'],
                    'tables_running': 0,
                    'players_waiting': w['players_waiting'],
                    'scrape_timestamp': data['scrape_timestamp'],
                    'scrape_html_hash': data['scrape_html_hash'],
                    'scrape_batch_id': batch_id,
                    'data_quality': 'scraped_verified',
                    'source': 'bravo',
                }
                payload.append(record)
    return payload


def publish_chunk(chunk_results, batch_id, chunk_num):
    """Publish a chunk of venue results to Supabase immediately.
    
    Returns (records_saved, success).
    """
    payload = build_payload_from_results(chunk_results, batch_id)
    if not payload:
        return 0, True
    
    if sb_upsert('venue_live_tables', payload):
        log.info(f'  📤 CHUNK {chunk_num} published: {len(payload)} records from {len(chunk_results)} venues')
        return len(payload), True
    else:
        log.error(f'  ❌ CHUNK {chunk_num} publish FAILED')
        return 0, False


# ============================================================
# MAIN SCRAPE CYCLE
# ============================================================
def run_scrape_cycle(mgr):
    """Run one full scrape cycle with chunked publish.
    
    CHUNKED PUBLISH PATTERN:
    Instead of scraping all 156 venues then saving at the end (where a
    crash at venue #50 means zero data), we publish every CHUNK_SIZE
    venues. Users get partial data within minutes.
    
    Flow:
      Scrape venues 1-25 → PUBLISH → Scrape 26-50 → PUBLISH → ...
      At the very end, delete stale records from previous batches.
    """
    batch_id = str(uuid.uuid4())
    cycle_start = datetime.now(timezone.utc)

    # Rotate log file handler if day changed
    _maybe_rotate_log()

    # Run periodic cleanup (lightweight, runs at start of each cycle)
    cleanup_evidence_files()
    cleanup_log_files()

    log.info(f'=== SCRAPE CYCLE #{mgr.total_cycles + 1} | Batch: {batch_id[:8]} ===')

    # Ensure connected
    if not mgr.ensure_connected():
        mgr.consecutive_failures += 1
        write_heartbeat('connect_failed', {'consecutive_failures': mgr.consecutive_failures})
        
        import random
        base_delays = [5, 15, 45, 120, 300]
        idx = min(max(0, mgr.consecutive_failures - 1), len(base_delays) - 1)
        backoff = int(base_delays[idx] * random.uniform(0.9, 1.1))
        
        log.error(f'🚨 {mgr.consecutive_failures} consecutive failures — applying stealth backoff ({backoff}s)')
        time.sleep(backoff)
        return 0

    # Daily discovery pass (once per day)
    daily_bravo_discovery(mgr)

    # Load venue slugs
    slugs = load_bravo_slugs()
    if not slugs:
        log.info('No registry found, discovering slugs...')
        slugs = discover_bravo_slugs(mgr.page)
    log.info(f'Scraping {len(slugs)} venues (chunked publish every {CHUNK_SIZE})...')

    # Scrape each venue — CHUNKED PUBLISH
    all_results = []        # All results for evidence/history
    chunk_results = []      # Current chunk buffer
    total_saved = 0
    total_errors = 0
    total_skipped = 0
    chunk_num = 0

    consecutive_venue_failures = 0
    cycle_aborted = False

    in_cycle_reconnects = 0
    MAX_IN_CYCLE_RECONNECTS = 2  # Max mid-cycle reconnects before giving up

    for i, slug in enumerate(slugs):
        # CIRCUIT BREAKER: If too many consecutive venues fail, abort and reconnect
        if consecutive_venue_failures >= CIRCUIT_BREAKER_THRESHOLD:
            log.error(f'🔴 CIRCUIT BREAKER: {consecutive_venue_failures} consecutive failures — aborting cycle, forcing reconnect')
            mgr._session_dead = True
            mgr.tier2_failures = 0
            cycle_aborted = True
            break

        # IN-CYCLE SESSION RECOVERY: If session died mid-cycle, reconnect
        # immediately instead of wasting venues on doomed Tier 2/3 attempts.
        # This recovers ~130 venues per cycle that were previously lost.
        if mgr._session_dead and in_cycle_reconnects < MAX_IN_CYCLE_RECONNECTS:
            log.info(f'🔄 In-cycle reconnect #{in_cycle_reconnects + 1} (session died at venue {i})...')
            # Flush any accumulated results before reconnect
            if chunk_results:
                chunk_num += 1
                saved, ok = publish_chunk(chunk_results, batch_id, chunk_num)
                total_saved += saved
                chunk_results = []

            if mgr.connect():
                in_cycle_reconnects += 1
                consecutive_venue_failures = 0
                log.info(f'  ✅ In-cycle reconnect succeeded — resuming at venue {i+1}/{len(slugs)}')
            else:
                log.error(f'  ❌ In-cycle reconnect failed — aborting cycle')
                cycle_aborted = True
                break

        # PAGE RECYCLING: Prevent browser memory leaks
        if (i + 1) % PAGE_RECYCLE_INTERVAL == 0 and not mgr._session_dead:
            mgr.recycle_page()

        html = mgr.navigate_venue(slug)
        if html is None:
            total_errors += 1
            consecutive_venue_failures += 1
            continue

        consecutive_venue_failures = 0  # Reset on success

        data = extract_live_data(html, slug)
        data['batch_id'] = batch_id

        total_tables = sum(g['tables'] for g in data['live_games'])
        total_waiting = sum(w['players_waiting'] for w in data['waitlist'])

        if data['live_games'] or data['waitlist']:
            chunk_results.append(data)
            all_results.append(data)
            log.info(
                f'  [{i+1}/{len(slugs)}] ✅ {data["venue_name"][:28]:28} | '
                f'{total_tables} tables | {total_waiting} waiting'
            )
        else:
            total_skipped += 1
            if total_skipped <= 3 or total_skipped % 10 == 0:
                log.info(f'  [{i+1}/{len(slugs)}] ⏭️  {slug[:28]:28} | no live data')

        time.sleep(RATE_LIMIT_DELAY)

        # ── CHUNKED PUBLISH: Flush buffer every CHUNK_SIZE venues with data ──
        if len(chunk_results) >= CHUNK_SIZE:
            chunk_num += 1
            saved, ok = publish_chunk(chunk_results, batch_id, chunk_num)
            total_saved += saved
            chunk_results = []  # Reset buffer

            # Update heartbeat after each chunk so watchdog sees activity
            write_heartbeat('scraping', {
                'cycle': mgr.total_cycles + 1,
                'progress': f'{i+1}/{len(slugs)}',
                'records_saved': total_saved,
                'chunk': chunk_num,
            })

    # ── Flush remaining venues in the last partial chunk ──
    if chunk_results:
        chunk_num += 1
        saved, ok = publish_chunk(chunk_results, batch_id, chunk_num)
        total_saved += saved

    # ── Stale record cleanup (only AFTER all chunks published) ──
    if total_saved > 0:
        sb_delete('venue_live_tables', f'scrape_batch_id=neq.{batch_id}&source=eq.bravo')
        # Save historical snapshots
        save_history_snapshot(batch_id, all_results)
        save_game_history_snapshot(batch_id, all_results)

    # Save evidence
    duration = (datetime.now(timezone.utc) - cycle_start).total_seconds()
    evidence = {
        'batch_id': batch_id,
        'scrape_timestamp': cycle_start.isoformat(),
        'venues_scraped': len(slugs),
        'venues_with_data': len(all_results),
        'venues_skipped': total_skipped,
        'total_records_saved': total_saved,
        'errors': total_errors,
        'chunks_published': chunk_num,
        'cycle_aborted': cycle_aborted,
        'duration_seconds': duration,
        'session_uptime_minutes': (
            (datetime.now(timezone.utc) - mgr.last_login_time).total_seconds() / 60
            if mgr.last_login_time else 0
        ),
    }
    evidence_file = EVIDENCE_DIR / f'bravo_live_{cycle_start.strftime("%Y%m%d_%H%M%S")}.json'
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)

    # Save performance metrics to Supabase for monitoring dashboard
    try:
        metrics_row = json.dumps({
            'source': 'bravo',
            'cycle_start': cycle_start.isoformat(),
            'duration_seconds': int(duration),
            'venues_scraped': len(slugs),
            'venues_with_data': len(all_results),
            'errors': total_errors,
            'records_saved': total_saved,
        }).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/scraper_metrics',
            data=metrics_row, method='POST',
            headers={**SB_HEADERS, 'Prefer': 'return=minimal'}
        )
        urllib.request.urlopen(req, timeout=10)
        log.debug('  📈 Scraper metrics recorded')
    except Exception as e:
        log.debug(f'  Metrics insert skipped: {e}')

    with open(BASE_DIR / 'data' / 'bravo-live-snapshot.json', 'w') as f:
        json.dump({
            'metadata': evidence,
            'venues': all_results,
        }, f, indent=2, default=str)

    mgr.total_cycles += 1
    # Only reset consecutive_failures when we actually saved data
    if total_saved > 0:
        mgr.consecutive_failures = 0

    # Write heartbeat for external watchdog
    write_heartbeat('ok' if total_saved > 0 else 'empty', {
        'cycle': mgr.total_cycles,
        'records_saved': total_saved,
        'venues_with_data': len(all_results),
        'errors': total_errors,
        'chunks_published': chunk_num,
        'duration_seconds': round(duration),
    })

    log.info(
        f'=== CYCLE #{mgr.total_cycles} COMPLETE | {len(all_results)}/{len(slugs)} venues | '
        f'{total_saved} records in {chunk_num} chunks | {duration:.0f}s | Errors: {total_errors} ==='
    )
    return len(all_results)

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

# ============================================================
# LOG ROTATION HELPER
# ============================================================
_last_log_date = datetime.now().strftime('%Y%m%d')

def _maybe_rotate_log():
    """Rotate log file handler when date changes (midnight crossing)."""
    global _last_log_date
    today = datetime.now().strftime('%Y%m%d')
    if today != _last_log_date:
        _last_log_date = today
        new_path = LOG_DIR / f'daemon_{today}.log'
        root_logger = logging.getLogger()
        for h in root_logger.handlers[:]:
            if isinstance(h, logging.FileHandler) and 'daemon_' in str(h.baseFilename):
                root_logger.removeHandler(h)
                h.close()
        root_logger.addHandler(logging.FileHandler(new_path))
        log.info(f'📅 Rotated log file to {new_path}')

# ============================================================
# NETWORK PRE-CHECK
# ============================================================
def _network_available():
    """Quick network check before launching a browser.
    
    Prevents wasting 30-60s on StealthySession.start() when network is down
    (e.g., machine waking from sleep, WiFi reconnecting).
    """
    try:
        req = urllib.request.Request('https://1.1.1.1', method='HEAD')
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        try:
            req = urllib.request.Request('https://www.google.com', method='HEAD')
            urllib.request.urlopen(req, timeout=5)
            return True
        except Exception:
            return False


# ============================================================
# ZOMBIE BROWSER CLEANUP
# ============================================================
def _kill_zombie_browsers():
    """Kill orphaned camoufox/chromium processes that belong to THIS daemon.
    
    IMPORTANT: Only kills processes in our own process tree. Previous versions
    used `pgrep -f chromium` which killed ALL browser processes, including 
    the OTHER daemon's live browser — causing cascading context-dead errors.
    
    Now uses `pgrep -P <our_pid>` to scope kills to our own children,
    then recursively kills their children.
    """
    my_pid = os.getpid()
    killed = 0
    
    def _kill_tree(parent_pid):
        """Recursively kill all children of a process."""
        nonlocal killed
        try:
            # Get children of this process
            result = subprocess.run(
                ['pgrep', '-P', str(parent_pid)],
                capture_output=True, text=True, timeout=5
            )
            if result.stdout.strip():
                child_pids = [int(p) for p in result.stdout.strip().split('\n') if p.strip()]
                for cpid in child_pids:
                    # Recursively kill grandchildren first
                    _kill_tree(cpid)
                    try:
                        os.kill(cpid, signal.SIGKILL)
                        killed += 1
                        log.info(f'  🧹 Killed child process (PID {cpid})')
                    except (ProcessLookupError, PermissionError):
                        pass
        except Exception:
            pass
    
    _kill_tree(my_pid)
    
    if killed:
        log.info(f'  🧹 Cleaned up {killed} child processes')


def _hard_kill_on_hang(reason):
    """Force-exit the process when connect() or fetch() hangs.
    
    This is called by a threading.Timer as a last resort when the
    daemon gets stuck inside Scrapling/browser calls that never return.
    launchd KeepAlive=true will restart us with a clean process.
    """
    log.error(f'🚨 HARD KILL: {reason}')
    write_heartbeat('hard_kill', {'reason': reason})
    _kill_zombie_browsers()
    os._exit(1)  # os._exit to bypass finally blocks that might hang


def main():
    log.info('=' * 60)
    log.info('BRAVO POKER LIVE — AUTONOMOUS DAEMON v3.0 (Chunked Publish)')
    log.info(f'Interval: {SCRAPE_INTERVAL}s ({SCRAPE_INTERVAL // 60}min)')
    log.info(f'Persistent session: YES (stays logged in between cycles)')
    log.info(f'Retry policy: {MAX_RETRIES}x with exponential backoff')
    log.info(f'Health check: every {HEALTH_CHECK_INTERVAL} cycles')
    log.info(f'Watchdog: exit after {WATCHDOG_MAX_STALE_MINUTES}min with no data')
    log.info(f'Connect timeout: {CONNECT_TIMEOUT_SECONDS}s hard-kill')
    log.info(f'Log dir: {LOG_DIR}')
    log.info('=' * 60)

    mgr = BravoSessionManager()
    last_successful_save = time.time()  # Assume fresh at boot
    process_start = time.time()

    while running:
        # ── GLOBAL WATCHDOG: Check wall-clock time BEFORE entering scrape ──
        # This catches the case where connect() or scrape hangs indefinitely
        stale_minutes = (time.time() - last_successful_save) / 60
        if stale_minutes >= WATCHDOG_MAX_STALE_MINUTES:
            log.error(
                f'🚨 WATCHDOG: No successful data save in {stale_minutes:.0f} minutes '
                f'(threshold: {WATCHDOG_MAX_STALE_MINUTES}min). '
                f'Exiting so launchd can restart with a clean process.'
            )
            write_heartbeat('watchdog_exit', {
                'stale_minutes': round(stale_minutes),
                'consecutive_failures': mgr.consecutive_failures,
            })
            mgr.disconnect()
            _kill_zombie_browsers()
            sys.exit(1)

        try:
            count = run_scrape_cycle(mgr)
            if count > 0:
                last_successful_save = time.time()
                log.info(f'⏰ Next scrape in {SCRAPE_INTERVAL // 60} minutes...')
            else:
                # Shorter backoff with exponential multiplier & ±10% Jitter
                import random
                base_delays = [5, 15, 45, 120, 300]
                idx = min(mgr.consecutive_failures, len(base_delays) - 1)
                backoff = int(base_delays[idx] * random.uniform(0.9, 1.1))
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
            # Force disconnect on any unexpected error to prevent zombie state
            try:
                mgr.disconnect()
            except Exception:
                pass

        # Sleep in 1s intervals for signal responsiveness with sleep/wake detection
        sleep_start = time.time()
        for _ in range(SCRAPE_INTERVAL):
            if not running:
                break
            time.sleep(1)
        
        # SLEEP/WAKE DETECTION: If wall-clock time drifted significantly,
        # the machine was likely sleeping. Force session reconnect.
        actual_elapsed = time.time() - sleep_start
        if actual_elapsed > SCRAPE_INTERVAL * 2:
            log.warning(
                f'⏰ Sleep/wake detected: expected {SCRAPE_INTERVAL}s sleep, '
                f'actual {actual_elapsed:.0f}s. Forcing session reconnect.'
            )
            mgr._session_dead = True
            mgr.consecutive_failures = 0  # Reset — this isn't a real failure

    # Clean shutdown
    log.info('🛑 Shutting down, closing session...')
    mgr.disconnect()
    _kill_zombie_browsers()
    log.info('Daemon stopped.')

if __name__ == '__main__':
    main()
