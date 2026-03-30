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
import os
from datetime import datetime, timezone
import json
import logging
import re
import signal
import sys
import time
import traceback
import urllib.request
import uuid
import subprocess
import threading
from typing import Dict, List, Optional
from pathlib import Path
from dotenv import load_dotenv

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
# CONFIG
# ============================================================
BASE_DIR = Path(__file__).resolve().parent.parent
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# ── STARTUP CREDENTIAL VALIDATION ──
if not SUPABASE_KEY:
    print('FATAL: SUPABASE_SERVICE_ROLE_KEY not set. Cannot write data.')
    sys.exit(1)

# Timing
SCRAPE_INTERVAL = 900  # 15 minutes (offset 7min from Bravo via launchd start)
RATE_LIMIT_DELAY = 1.0  # seconds between region page fetches
MAX_RETRIES = 3
CIRCUIT_BREAKER_THRESHOLD = 5  # Abort cycle + reconnect if this many consecutive regions fail (was 10)
SESSION_REFRESH_MINUTES = 90   # Proactive session refresh
WATCHDOG_MAX_STALE_MINUTES = 30  # Exit process if no successful save in this many minutes (launchd restarts)
CONNECT_TIMEOUT_SECONDS = 90   # Hard kill if connect() hangs longer than this

# Directories
LOG_DIR = BASE_DIR / 'data' / 'pokeratlas-logs'
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'
HEARTBEAT_FILE = LOG_DIR / 'heartbeat.json'

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

# Suppress Scrapling's noisy 'No Cloudflare challenge found' ERROR spam
# Scrapling uses a LoggerProxy that bypasses standard logger hierarchy,
# so we must filter at the root handler level instead of setLevel
class _CloudflareNoiseFilter(logging.Filter):
    def filter(self, record):
        return 'No Cloudflare challenge found' not in str(record.getMessage())

for handler in logging.getLogger().handlers:
    handler.addFilter(_CloudflareNoiseFilter())

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

# VALIDATED regions that actually return unique data (not 301 → Las Vegas)
# These 11 regions are the ONLY ones that contain unique games data.
# All other slugs redirect to Las Vegas and waste cycle time.
PA_VALIDATED_REGIONS = [
    'las-vegas-nevada',
    'texas',
    'montana',
    'portland-oregon',
    'biloxi-mississippi',
    'iowa',
    'atlantic-city-new-jersey',
    'wisconsin',
    'laughlin-nevada',
    'virginia',
    'georgia',
    # Expanded coverage (#7) — major poker markets
    'los-angeles-california',
    'south-florida',
    'san-francisco-bay-area-california',
    'connecticut',
    'michigan',
    'pennsylvania',
    'maryland',
    'tampa-florida',
    'central-florida',
    'north-florida',
    'san-diego-california',
    'sacramento-california',
    'reno-nevada',
    'colorado',
    'arizona',
    'new-york',
]

# Full list for daily discovery pass (to detect new regions)
PA_ALL_REGION_SLUGS = [
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

# Track last full discovery time
_last_discovery_date = None

def load_pa_regions():
    """Return validated regions for normal scraping.
    
    Only the 11 validated regions are scraped each cycle (~2-3 min).
    A full discovery pass runs once per day to detect new regions.
    """
    global _last_discovery_date
    today = datetime.now().strftime('%Y%m%d')
    
    # Check if we have a cached discovery file with additional regions
    discovery_file = BASE_DIR / 'data' / 'pokeratlas-discovered-regions.json'
    extra_regions = []
    if discovery_file.exists():
        try:
            with open(discovery_file) as f:
                data = json.load(f)
                extra_regions = data.get('extra_validated', [])
        except Exception:
            pass
    
    # Merge validated + any discovered extras (dedup)
    all_valid = list(dict.fromkeys(PA_VALIDATED_REGIONS + extra_regions))
    return all_valid

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
# HEARTBEAT WRITER
# ============================================================
def write_heartbeat(status, extra=None):
    """Write a heartbeat file so external watchdog can detect stale daemons."""
    try:
        hb = {
            'daemon': 'pokeratlas',
            'status': status,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'pid': os.getpid(),
        }
        if extra:
            hb.update(extra)
        with open(HEARTBEAT_FILE, 'w') as f:
            json.dump(hb, f, indent=2)
    except Exception:
        pass


# ============================================================
# FALLBACK FETCHERS
# ============================================================
def fallback_fetch_playwright(url, expected_slug=None):
    """Tier 2 fallback: Use Scrapling's PlayWrightFetcher."""
    try:
        from scrapling.fetchers import PlayWrightFetcher
        fetcher = PlayWrightFetcher(headless=True)
        resp = fetcher.fetch(url)
        if resp and resp.status == 200:
            html = resp.html_content or ''
            if not html:
                html = resp.body.decode('utf-8', errors='ignore') if resp.body else ''
            if html:
                # Redirect check
                if expected_slug and expected_slug != 'las-vegas-nevada':
                    title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
                    if title_match and 'las vegas' in title_match.group(1).strip().lower():
                        return 'REDIRECT'
                if 'cash-games-list-item' in html:
                    log.info(f'  \U0001f504 TIER-2 (PlayWrightFetcher) success')
                    return html
    except Exception as e:
        log.debug(f'  Tier-2 failed: {e}')
    return None


def fallback_fetch_urllib(url, expected_slug=None):
    """Tier 3 fallback: Use raw urllib (works when CF isn't blocking)."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
        })
        resp = urllib.request.urlopen(req, timeout=15)
        html = resp.read().decode('utf-8', errors='ignore')
        # Redirect check
        if expected_slug and expected_slug != 'las-vegas-nevada':
            title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
            if title_match and 'las vegas' in title_match.group(1).strip().lower():
                return 'REDIRECT'
        if 'cash-games-list-item' in html:
            log.info(f'  \U0001f504 TIER-3 (urllib) success')
            return html
    except Exception as e:
        log.debug(f'  Tier-3 failed: {e}')
    return None


# ============================================================
# PERSISTENT SESSION MANAGER (Scrapling StealthySession)
# ============================================================
class PokerAtlasSessionManager:
    """Manages a persistent Scrapling StealthySession.

    Multi-tier fallback strategy:
      Tier 1: StealthySession.fetch() (primary — full CF bypass)
      Tier 2: PlayWrightFetcher (no CF solve, but fast reconnect)
      Tier 3: Raw urllib (fastest, only works when CF isn't blocking)
    """

    def __init__(self):
        self.session = None
        self.total_cycles = 0
        self.consecutive_failures = 0
        self.consecutive_fetch_failures = 0
        self.last_connect_time = None
        self._session_dead = False
        self.tier2_failures = 0

    def connect(self):
        """Establish a new StealthySession.
        
        Protected by CONNECT_TIMEOUT_SECONDS hard-kill timer to prevent
        zombie states when StealthySession.start() hangs.
        """
        from scrapling.fetchers import StealthySession

        self.disconnect()
        _kill_zombie_browsers()

        log.info('🔌 Establishing new StealthySession...')

        # Arm a hard-kill timer
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
            self.last_connect_time = datetime.now(timezone.utc)
            self._session_dead = False
            self.consecutive_fetch_failures = 0
            log.info('  ✅ Session ready')
            watchdog_timer.cancel()
            return True
        except Exception as e:
            watchdog_timer.cancel()
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
                        # Silently redirected to Las Vegas — NOT a failure, just no data
                        return 'REDIRECT'

            # Success — reset failure counter
            self.consecutive_fetch_failures = 0
            return html

        except Exception as e:
            err_msg = str(e)
            self.consecutive_fetch_failures += 1

            # CRASH RECOVERY: Detect dead browser context OR persistent timeouts
            if 'has been closed' in err_msg or 'Target page' in err_msg:
                log.warning(f'  🔴 Browser context dead — marking for reconnection')
                self._session_dead = True
            elif ('Timeout' in err_msg or 'timed out' in err_msg.lower()) and self.consecutive_fetch_failures >= CIRCUIT_BREAKER_THRESHOLD:
                log.warning(f'  🔴 {self.consecutive_fetch_failures} consecutive fetch timeouts — browser is zombie, marking dead')
                self._session_dead = True

            log.warning(f'  ❌ Fetch error: {e}')
            return None

    def fetch_with_fallback(self, url, expected_slug=None):
        """Fetch a page with multi-tier fallback.
        
        Tier 1: Primary StealthySession
        Tier 2: PlayWrightFetcher
        Tier 3: Raw urllib
        """
        # === TIER 1 ===
        result = self.fetch_page(url, expected_slug=expected_slug)
        if result is not None:
            return result

        # === TIER 2: PlayWrightFetcher ===
        if self.tier2_failures < 5:
            result = fallback_fetch_playwright(url, expected_slug=expected_slug)
            if result is not None:
                return result
            self.tier2_failures += 1

        # === TIER 3: Raw urllib ===
        result = fallback_fetch_urllib(url, expected_slug=expected_slug)
        if result is not None:
            return result

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

        # PROACTIVE SESSION REFRESH
        if self.last_connect_time:
            age_minutes = (datetime.now(timezone.utc) - self.last_connect_time).total_seconds() / 60
            if age_minutes >= SESSION_REFRESH_MINUTES:
                log.info(f'🔄 Proactive session refresh (age: {age_minutes:.0f}min >= {SESSION_REFRESH_MINUTES}min)')
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
# CLEANUP: EVIDENCE FILES (keep last 7 days)
# ============================================================
def cleanup_evidence_files():
    """Delete evidence JSON files older than 7 days."""
    try:
        cutoff = time.time() - (7 * 86400)
        count = 0
        for f in EVIDENCE_DIR.glob('pokeratlas_live_*.json'):
            if f.stat().st_mtime < cutoff:
                f.unlink()
                count += 1
        if count:
            log.info(f'  \U0001f9f9 Cleaned up {count} evidence files (>7 days old)')
    except Exception as e:
        log.debug(f'  Evidence cleanup error: {e}')


# ============================================================
# CLEANUP: LOG FILES (keep last 14 days)
# ============================================================
def cleanup_log_files():
    """Delete daemon log files older than 14 days."""
    try:
        cutoff = time.time() - (14 * 86400)
        count = 0
        for f in LOG_DIR.glob('daemon_*.log'):
            if f.stat().st_mtime < cutoff:
                f.unlink()
                count += 1
        if count:
            log.info(f'  \U0001f9f9 Cleaned up {count} log files (>14 days old)')
    except Exception as e:
        log.debug(f'  Log cleanup error: {e}')


# ============================================================
# HISTORICAL SNAPSHOT: Save per-cycle venue summary for trending
# ============================================================
def save_history_snapshot(batch_id, all_venues):
    """Insert a summary row per venue into venue_live_history for trending."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for vdata in all_venues:
            total_tables = sum(g['tables_estimate'] for g in vdata['games'])
            venue_slug = re.sub(r'[^a-z0-9]+', '-', vdata['venue_name'].lower()).strip('-')
            rows.append({
                'bravo_slug': f'pa-{venue_slug}',
                'venue_name': vdata['venue_name'],
                'total_tables': total_tables,
                'total_waiting': 0,
                'game_count': len(vdata['games']),
                'source': 'pokeratlas',
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
                log.info(f'  \U0001f4ca Saved {len(rows)} history snapshots')
            except Exception as e:
                log.debug(f'  History snapshot insert skipped: {e}')
    except Exception as e:
        log.debug(f'  History snapshot error: {e}')


# ============================================================
# REGION SLUG AUTO-DISCOVERY
# ============================================================
def discover_regions(mgr):
    """Daily discovery pass: scrape ALL regions to detect new data sources.
    
    Runs once per day. Saves any newly discovered valid regions to a cache file
    so they get included in the fast primary loop.
    """
    global _last_discovery_date
    today = datetime.now().strftime('%Y%m%d')
    
    # Only run once per day
    if _last_discovery_date == today:
        return
    _last_discovery_date = today
    
    log.info('\U0001f4e1 Running daily discovery pass (all regions)...')
    new_valid = []
    
    for slug in PA_ALL_REGION_SLUGS:
        if slug in PA_VALIDATED_REGIONS:
            continue  # Already in primary list
        
        url = f'https://www.pokeratlas.com/poker-cash-games/{slug}'
        html = mgr.fetch_with_fallback(url, expected_slug=slug)
        
        if html and html != 'REDIRECT':
            venues, _, _ = extract_games_from_region(html, slug)
            if venues:
                new_valid.append(slug)
                log.info(f'  \U0001f4a1 NEW valid region: {slug} ({len(venues)} venues)')
        
        time.sleep(RATE_LIMIT_DELAY)
    
    if new_valid:
        log.info(f'  Discovered {len(new_valid)} new valid regions: {new_valid}')
        discovery_file = BASE_DIR / 'data' / 'pokeratlas-discovered-regions.json'
        try:
            with open(discovery_file, 'w') as f:
                json.dump({
                    'discovered': today,
                    'extra_validated': new_valid,
                }, f, indent=2)
        except Exception:
            pass
    else:
        log.info('  No new regions discovered.')


# ============================================================
# MAIN SCRAPE CYCLE
# ============================================================
def run_scrape_cycle(mgr):
    """Run one full scrape cycle."""
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
        if mgr.consecutive_failures >= 5:
            log.error(f'🚨 {mgr.consecutive_failures} consecutive failures — sleeping 5min')
            time.sleep(300)
            mgr.consecutive_failures = 0
        return 0

    # Load validated region slugs (fast — only ~11 regions)
    regions = load_pa_regions()
    log.info(f'Scraping {len(regions)} validated regions...')

    # Run daily discovery in background (once per day)
    discover_regions(mgr)

    # Scrape each region
    all_venues = []
    errors = 0
    skipped = 0

    consecutive_region_failures = 0
    for i, slug in enumerate(regions):
        # CIRCUIT BREAKER: abort cycle if too many consecutive failures
        if consecutive_region_failures >= CIRCUIT_BREAKER_THRESHOLD:
            log.error(f'🔴 CIRCUIT BREAKER: {consecutive_region_failures} consecutive failures — aborting cycle, forcing reconnect')
            mgr._session_dead = True
            break

        url = f'https://www.pokeratlas.com/poker-cash-games/{slug}'
        html = mgr.fetch_with_fallback(url, expected_slug=slug)

        # REDIRECT is a valid "no data" response — NOT a session failure
        if html == 'REDIRECT':
            skipped += 1
            continue

        if html is None:
            errors += 1
            consecutive_region_failures += 1
            if errors <= 3:
                log.info(f'  [{i+1}/{len(regions)}] ❌ {slug[:30]:30} | failed')
            continue

        consecutive_region_failures = 0  # Reset on success

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
            f'{SUPABASE_URL}/rest/v1/venue_live_tables?source=eq.bravo&select=venue_name&limit=5000',
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
                'tables_running': 0,
                'players_waiting': 0,
                'scrape_timestamp': venue_data['scrape_timestamp'],
                'scrape_html_hash': venue_data['scrape_html_hash'],
                'scrape_batch_id': batch_id,
                'data_quality': 'scraped_verified',
                'source': 'pokeratlas',
                'bravo_slug': f'pa-{venue_slug}',
                'buyin_range': game.get('buyin', ''),
                'runs_schedule': game.get('runs', ''),
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
            # Save historical snapshot for trend analysis (#5)
            save_history_snapshot(batch_id, all_venues)

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

    # Save performance metrics to Supabase for monitoring dashboard
    try:
        metrics_row = json.dumps({
            'source': 'pokeratlas',
            'cycle_start': cycle_start.isoformat(),
            'duration_seconds': int((datetime.now(timezone.utc) - cycle_start).total_seconds()),
            'venues_scraped': len(all_venues),
            'venues_with_data': len([v for v in all_venues if v['games']]),
            'errors': errors,
            'records_saved': saved,
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

    # Write heartbeat for external watchdog
    write_heartbeat('ok' if saved > 0 else 'empty', {
        'cycle': mgr.total_cycles,
        'records_saved': saved,
        'venues_with_data': len(all_venues),
        'errors': errors,
        'duration_seconds': round(duration),
        'regions_scraped': len(regions),
    })

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
        log.info(f'\U0001f4c5 Rotated log file to {new_path}')

# ============================================================
# ZOMBIE BROWSER CLEANUP
# ============================================================
def _kill_zombie_browsers():
    """Kill orphaned camoufox/chromium processes that leak on crash."""
    my_pid = os.getpid()
    for proc_name in ('camoufox', 'firefox', 'chromium'):
        try:
            result = subprocess.run(
                ['pgrep', '-f', proc_name],
                capture_output=True, text=True, timeout=5
            )
            if result.stdout.strip():
                pids = [int(p) for p in result.stdout.strip().split('\n') if p.strip()]
                for pid in pids:
                    if pid != my_pid:
                        try:
                            os.kill(pid, signal.SIGKILL)
                            log.info(f'  🧹 Killed zombie {proc_name} process (PID {pid})')
                        except ProcessLookupError:
                            pass
                        except PermissionError:
                            pass
        except Exception:
            pass


def _hard_kill_on_hang(reason):
    """Force-exit the process when connect() hangs."""
    log.error(f'🚨 HARD KILL: {reason}')
    write_heartbeat('hard_kill', {'reason': reason})
    _kill_zombie_browsers()
    os._exit(1)


def main():
    log.info('=' * 60)
    log.info('POKER ATLAS LIVE GAMES — AUTONOMOUS DAEMON v2.2')
    log.info(f'Interval: {SCRAPE_INTERVAL}s ({SCRAPE_INTERVAL // 60}min)')
    log.info(f'Strategy: session.fetch() per region (no login needed)')
    log.info(f'Data: game catalog + buy-in + run schedule')
    log.info(f'Watchdog: exit after {WATCHDOG_MAX_STALE_MINUTES}min with no data')
    log.info(f'Connect timeout: {CONNECT_TIMEOUT_SECONDS}s hard-kill')
    log.info(f'Log dir: {LOG_DIR}')
    log.info('=' * 60)

    mgr = PokerAtlasSessionManager()
    last_successful_save = time.time()  # Assume fresh at boot

    while running:
        # ── GLOBAL WATCHDOG: Check wall-clock time BEFORE entering scrape ──
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
            # Force disconnect on any unexpected error to prevent zombie state
            try:
                mgr.disconnect()
            except Exception:
                pass

        # Sleep for interval
        for _ in range(SCRAPE_INTERVAL):
            if not running:
                break
            time.sleep(1)

    log.info('🛑 Shutting down...')
    mgr.disconnect()
    _kill_zombie_browsers()
    log.info('Daemon stopped.')

if __name__ == '__main__':
    main()
