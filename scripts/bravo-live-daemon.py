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
from datetime import datetime, timezone
from pathlib import Path

# ============================================================
# CONFIG — LOCKED IN
# ============================================================
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
BRAVO_EMAIL = 'admin@smarter.poker'
BRAVO_PASS = '215SlalomCt!'
BRAVO_LOGIN_URL = 'https://www.bravopokerlive.com/login/'
BRAVO_VENUE_URL = 'https://www.bravopokerlive.com/venues/{slug}/'
SCRAPE_INTERVAL = 900          # 15 minutes
MAX_RETRIES = 3                # Max login retries before full restart
VENUE_TIMEOUT = 15000          # 15s per venue page load (was 10s — too tight for Bravo CDN)
LOGIN_TIMEOUT = 15000          # 15s for login flow
RATE_LIMIT_DELAY = 0.5         # 0.5s between venues
HEALTH_CHECK_INTERVAL = 3      # Health-check every N cycles
VENUE_RETRY_COUNT = 1          # Retry failed venues once before giving up
CIRCUIT_BREAKER_THRESHOLD = 5  # Abort cycle + reconnect if this many consecutive venues fail (was 10)
SESSION_REFRESH_MINUTES = 90   # Proactive session refresh to prevent zombie browsers
BASE_DIR = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub')
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
def load_bravo_slugs():
    """Load venue slugs from locked-in registry."""
    registry_path = BASE_DIR / 'data' / 'bravo-room-registry.json'
    if registry_path.exists():
        with open(registry_path) as f:
            data = json.load(f)
            return [v['slug'] for v in data.get('venues', [])]
    return []

def discover_bravo_slugs(page):
    """Extract venue slugs from Bravo homepage (fallback)."""
    page.goto('https://www.bravopokerlive.com/')
    page.wait_for_load_state('networkidle', timeout=15000)
    html = page.content()
    slugs = sorted(set(re.findall(r'/venues/([a-z0-9-]+)/', html)))
    log.info(f'Discovered {len(slugs)} Bravo venue slugs')
    # Save for next time
    reg = {
        'metadata': {'generated': datetime.now(timezone.utc).isoformat(), 'total_venues': len(slugs)},
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

    # Current Live Games table
    live_table = re.search(r'Current Live Games.*?<table[^>]*>(.*?)</table>', html, re.DOTALL)
    if live_table:
        rows = re.findall(r'<tr>(.*?)</tr>', live_table.group(1), re.DOTALL)
        for row in rows:
            cells = re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', row, re.DOTALL)
            if len(cells) >= 2:
                game_name = cells[0].strip()
                table_count = cells[1].strip()
                if game_name and table_count.isdigit():
                    result['live_games'].append({'game': game_name, 'tables': int(table_count)})

    # Current Waiting List table
    wait_table = re.search(r'Current Waiting List.*?<table[^>]*>(.*?)</table>', html, re.DOTALL)
    if wait_table:
        rows = re.findall(r'<tr>(.*?)</tr>', wait_table.group(1), re.DOTALL)
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
        """Establish a new Scrapling StealthySession and login to Bravo."""
        from scrapling.fetchers import StealthySession

        # Close any existing session
        self.disconnect()

        log.info('🔌 Establishing new StealthySession...')

        try:
            self.session = StealthySession(headless=True, solve_cloudflare=True)
            self.session.start()
            self._session_dead = False
            self.consecutive_nav_failures = 0

            # Step 1: Solve Cloudflare Turnstile
            log.info('  ☁️  Solving Cloudflare Turnstile...')
            resp = self.session.fetch(BRAVO_LOGIN_URL, google_search=True)

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
        """Submit login credentials on the current page."""
        log.info('  🔑 Logging in to Bravo...')

        for attempt in range(MAX_RETRIES):
            try:
                self.page.goto(f'{BRAVO_LOGIN_URL}?ReturnUrl=%2fvenues%2f', timeout=LOGIN_TIMEOUT, wait_until='load')
                self.page.wait_for_load_state('networkidle', timeout=LOGIN_TIMEOUT)

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
                self.page.wait_for_load_state('networkidle', timeout=LOGIN_TIMEOUT)

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
# MAIN SCRAPE CYCLE
# ============================================================
def run_scrape_cycle(mgr):
    """Run one full scrape cycle using the persistent session."""
    batch_id = str(uuid.uuid4())
    cycle_start = datetime.now(timezone.utc)

    # Rotate log file handler if day changed
    _maybe_rotate_log()

    log.info(f'=== SCRAPE CYCLE #{mgr.total_cycles + 1} | Batch: {batch_id[:8]} ===')

    # Ensure connected
    if not mgr.ensure_connected():
        mgr.consecutive_failures += 1
        write_heartbeat('connect_failed', {'consecutive_failures': mgr.consecutive_failures})
        if mgr.consecutive_failures >= 5:
            log.error(f'🚨 {mgr.consecutive_failures} consecutive failures — sleeping 5min before retry')
            time.sleep(300)
            mgr.consecutive_failures = 0
        return 0

    # Load venue slugs
    slugs = load_bravo_slugs()
    if not slugs:
        log.info('No registry found, discovering slugs...')
        slugs = discover_bravo_slugs(mgr.page)
    log.info(f'Scraping {len(slugs)} venues...')

    # Scrape each venue
    results = []
    errors = 0
    skipped = 0

    consecutive_venue_failures = 0
    for i, slug in enumerate(slugs):
        # CIRCUIT BREAKER: If too many consecutive venues fail, abort cycle and reconnect
        if consecutive_venue_failures >= CIRCUIT_BREAKER_THRESHOLD:
            log.error(f'🔴 CIRCUIT BREAKER: {consecutive_venue_failures} consecutive failures — aborting cycle, forcing reconnect')
            mgr._session_dead = True
            mgr.tier2_failures = 0  # Reset Tier 2 counter on full reconnect
            break

        html = mgr.navigate_venue(slug)
        if html is None:
            errors += 1
            consecutive_venue_failures += 1
            continue

        consecutive_venue_failures = 0  # Reset on success

        data = extract_live_data(html, slug)
        data['batch_id'] = batch_id

        total_tables = sum(g['tables'] for g in data['live_games'])
        total_waiting = sum(w['players_waiting'] for w in data['waitlist'])

        if data['live_games'] or data['waitlist']:
            results.append(data)
            log.info(
                f'  [{i+1}/{len(slugs)}] ✅ {data["venue_name"][:28]:28} | '
                f'{total_tables} tables | {total_waiting} waiting'
            )
        else:
            skipped += 1
            # Only log every 10th skip to reduce noise
            if skipped <= 3 or skipped % 10 == 0:
                log.info(f'  [{i+1}/{len(slugs)}] ⏭️  {slug[:28]:28} | no live data')

        time.sleep(RATE_LIMIT_DELAY)

        # Checkpoint every 50
        if (i + 1) % 50 == 0:
            log.info(f'  --- {i+1}/{len(slugs)} | {len(results)} active | {errors} errors ---')

    # Save to Supabase
    log.info(f'💾 Saving {len(results)} venue records to Supabase...')
    
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

    saved = 0
    if payload:
        # Atomic Batch Insert
        if sb_upsert('venue_live_tables', payload):
            saved = len(payload)
            # Safe delete of stale batches using neq (not equal to current batch) to prevent UI empty flash
            sb_delete('venue_live_tables', f'scrape_batch_id=neq.{batch_id}&source=eq.bravo')

    # Save evidence
    duration = (datetime.now(timezone.utc) - cycle_start).total_seconds()
    evidence = {
        'batch_id': batch_id,
        'scrape_timestamp': cycle_start.isoformat(),
        'venues_scraped': len(slugs),
        'venues_with_data': len(results),
        'venues_skipped': skipped,
        'total_records_saved': saved,
        'errors': errors,
        'duration_seconds': duration,
        'session_uptime_minutes': (
            (datetime.now(timezone.utc) - mgr.last_login_time).total_seconds() / 60
            if mgr.last_login_time else 0
        ),
    }
    evidence_file = EVIDENCE_DIR / f'bravo_live_{cycle_start.strftime("%Y%m%d_%H%M%S")}.json'
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)

    with open(BASE_DIR / 'data' / 'bravo-live-snapshot.json', 'w') as f:
        json.dump({
            'metadata': evidence,
            'venues': results,
        }, f, indent=2, default=str)

    mgr.total_cycles += 1
    mgr.consecutive_failures = 0

    # Write heartbeat for external watchdog
    write_heartbeat('ok' if saved > 0 else 'empty', {
        'cycle': mgr.total_cycles,
        'records_saved': saved,
        'venues_with_data': len(results),
        'errors': errors,
        'duration_seconds': round(duration),
    })

    log.info(
        f'=== CYCLE #{mgr.total_cycles} COMPLETE | {len(results)}/{len(slugs)} venues | '
        f'{saved} records | {duration:.0f}s | Errors: {errors} ==='
    )
    return len(results)

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

def main():
    log.info('=' * 60)
    log.info('BRAVO POKER LIVE — AUTONOMOUS DAEMON v2.0')
    log.info(f'Interval: {SCRAPE_INTERVAL}s ({SCRAPE_INTERVAL // 60}min)')
    log.info(f'Persistent session: YES (stays logged in between cycles)')
    log.info(f'Retry policy: {MAX_RETRIES}x with exponential backoff')
    log.info(f'Health check: every {HEALTH_CHECK_INTERVAL} cycles')
    log.info(f'Log dir: {LOG_DIR}')
    log.info('=' * 60)

    mgr = BravoSessionManager()

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
