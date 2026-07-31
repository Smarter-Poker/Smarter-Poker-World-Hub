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
  ERROR_SUPABASE      → DB write failed → chunk re-queued once at end of
                        cycle; if it still fails the stale-row cleanup is
                        suppressed and the cycle is reported as degraded.

Fetch strategy (single tier):
  All venue HTML comes from the persistent, authenticated StealthySession
  page. There is deliberately NO unauthenticated fallback fetcher: the
  "Current Live Games" table is only rendered for logged-in sessions, so a
  fallback fetch could never return live data. When the session dies the
  cycle reconnects in-place (see MAX_IN_CYCLE_RECONNECTS) rather than
  falling back.

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
import urllib.error
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from typing import Dict, List, Optional

import os as _bh_os, sys as _bh_sys
_bh_sys.path.insert(0, _bh_os.path.dirname(_bh_os.path.abspath(__file__)))
# Browser self-heal — launchd runs this daemon directly, so shell-level healing
# in the launchers never fires. See scripts/browser_heal.py for the 2026-07-26
# incident where a missing chromium revision kept this daemon down for days.
try:
    import browser_heal as _browser_heal
except Exception:  # pragma: no cover - heal is best-effort
    _browser_heal = None


# Resolve the absolute path to the project root and load ALL env files.
# CRITICAL: Load in REVERSE priority order (lowest first) so that higher-priority
# files override lower-priority ones via override=True. This mirrors Next.js env
# resolution: .env < .env.prod < .env.production.local < .env.local
# DO NOT use break — all files must be loaded so missing keys are filled by others.
project_root = Path(__file__).resolve().parent.parent
_env_priority = ['.env', '.env.prod', '.env.production', '.env.production.local', '.env.local']
for env_file in _env_priority:
    env_path = project_root / env_file
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)
        print(f"Loaded environment from {env_file}")

# ============================================================
# CONFIG — LOCKED IN
# ============================================================
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
BRAVO_LOGIN_URL = 'https://www.bravopokerlive.com/login/'

# ── CREDENTIAL POOL ──
# Supports up to 3 accounts. Set BRAVO_EMAIL_2/PASS_2 and BRAVO_EMAIL_3/PASS_3
# in .env.local as backup accounts. Daemon cycles to the next on login failure.
# Create each backup account through the proxy (different IP) to avoid IP-linking.
_cred_pool_raw = [
    (os.environ.get('BRAVO_EMAIL'), os.environ.get('BRAVO_PASS')),
    (os.environ.get('BRAVO_EMAIL_2'), os.environ.get('BRAVO_PASS_2')),
    (os.environ.get('BRAVO_EMAIL_3'), os.environ.get('BRAVO_PASS_3')),
]
CRED_POOL = [(e, p) for e, p in _cred_pool_raw if e and p]
_active_cred_idx = 0

if not CRED_POOL:
    print('\n' + '=' * 60)
    print('FATAL: No Bravo credentials configured.')
    print('Set BRAVO_EMAIL + BRAVO_PASS in .env.local or launchd plist.')
    print('=' * 60 + '\n')
    sys.exit(1)

if not SUPABASE_KEY:
    print('FATAL: SUPABASE_SERVICE_ROLE_KEY not set. Cannot write data.')
    sys.exit(1)

BRAVO_EMAIL = CRED_POOL[0][0]
BRAVO_PASS  = CRED_POOL[0][1]
log_creds = f'{len(CRED_POOL)} account(s) in pool'

# ── RESIDENTIAL PROXY (STICKY SESSION) ──
# BRAVO_PROXY_BASE: Geonode base URL (no session ID).
# The daemon injects -session-XXXXX into the username at each connect() so
# the same residential IP is pinned for the full login + venue scrape cycle.
# Format: http://user:pass@us.proxy.geonode.io:9000
BRAVO_PROXY_BASE = os.environ.get('BRAVO_PROXY_BASE', '')
BRAVO_PROXY = os.environ.get('BRAVO_PROXY', '')  # Legacy fallback (non-sticky)

BRAVO_VENUE_URL = 'https://www.bravopokerlive.com/venues/{slug}/'

# ── STEALTH TIMING (hardened for residential proxy) ──
SCRAPE_INTERVAL = 1800         # 30 minutes (was 15 — reduce scrape frequency to avoid flagging)
MAX_RETRIES = 3                # Max login retries before full restart
VENUE_TIMEOUT = 15000          # 15s per venue page load
LOGIN_TIMEOUT = 15000          # 15s for login flow
RATE_LIMIT_DELAY = 1.5         # 1.5s between venues (was 0.5s — more human-like)
RATE_LIMIT_JITTER = 0.5        # ±0.5s random jitter added to each delay
HEALTH_CHECK_INTERVAL = 3      # Health-check every N cycles
VENUE_RETRY_COUNT = 1          # Retry failed venues once before giving up
CIRCUIT_BREAKER_THRESHOLD = 8  # Abort cycle + reconnect if this many consecutive venues fail
SESSION_REFRESH_MINUTES = 45   # Proactive session refresh to prevent zombie browsers
WATCHDOG_MAX_STALE_MINUTES = 45  # Exit process if no successful save in this many minutes
CONNECT_TIMEOUT_SECONDS = 120  # Hard kill if connect() hangs longer than this
CHUNK_SIZE = 25                 # Publish partial results every N venues
PAGE_RECYCLE_INTERVAL = 50     # Recycle browser page every N venues to prevent memory leaks
BASE_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = BASE_DIR / 'data' / 'bravo-logs'
EVIDENCE_DIR = BASE_DIR / 'data' / 'scrape-evidence'
HEARTBEAT_FILE = LOG_DIR / 'heartbeat.json'
COOKIE_CACHE_FILE = LOG_DIR / 'cf_cookies.json'
PID_FILE = LOG_DIR / 'daemon.pid'  # Prevents dual-instance orphans

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
        logging.FileHandler(LOG_DIR / f'daemon_{datetime.now(timezone.utc).strftime("%Y%m%d")}.log'),
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

def _http_error_detail(e):
    """Return a loggable description of an exception, including HTTP body.

    urllib raises HTTPError for 4xx/5xx; its str() is just 'HTTP Error 401:
    Unauthorized' which hides the PostgREST message (constraint violation,
    missing column, RLS denial). Read the body so failures are diagnosable.
    """
    try:
        if isinstance(e, urllib.error.HTTPError):
            try:
                body = e.read().decode('utf-8', errors='ignore')[:400]
            except Exception:
                body = ''
            return f'HTTP {e.code} {e.reason}: {body}'
    except Exception:
        pass
    return f'{type(e).__name__}: {e}'


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
                    log.error(
                        f'{ERROR_SUPABASE}: {table} batch {i//BATCH_SIZE + 1} FAILED '
                        f'after 3 retries: {_http_error_detail(e)}'
                    )
        if not success:
            return False
    log.info(f'  Upserted {total_saved}/{len(data)} records in {(len(data) + BATCH_SIZE - 1) // BATCH_SIZE} batches')
    return True

def sb_delete(table, query):
    """DELETE from Supabase REST API. Returns True only on a confirmed 2xx.

    NOTE: a bare `except:` here used to swallow every failure (including
    KeyboardInterrupt) and log nothing, so a permanently broken stale-cleanup
    was invisible. Failures are now logged at ERROR and the caller acts on the
    return value.
    """
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}?{query}',
        method='DELETE', headers=SB_HEADERS
    )
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return 200 <= resp.status < 300
    except Exception as e:
        log.error(f'{ERROR_SUPABASE}: DELETE {table}?{query[:120]} failed: {_http_error_detail(e)}')
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

REGISTRY_PATH = BASE_DIR / 'data' / 'bravo-room-registry.json'
REGISTRY_BACKUP_PATH = BASE_DIR / 'data' / 'bravo-room-registry.last-good.json'


def _read_registry(path):
    """Read a registry file, returning [] on any parse/IO problem."""
    if not path.exists():
        return []
    try:
        with open(path) as f:
            data = json.load(f)
        return [
            v['slug'] for v in data.get('venues', [])
            if v.get('slug') and v['slug'] not in NON_US_EXCLUDED
        ]
    except Exception as e:
        log.error(f'  Registry {path.name} unreadable: {type(e).__name__}: {e}')
        return []


def load_bravo_slugs():
    """Load venue slugs from locked-in registry (USA only).

    Never raises: a truncated/corrupt registry falls back to the last-good
    copy rather than killing every subsequent cycle.
    """
    slugs = _read_registry(REGISTRY_PATH)
    if slugs:
        return slugs
    backup = _read_registry(REGISTRY_BACKUP_PATH)
    if backup:
        log.error(f'  Falling back to last-good registry ({len(backup)} venues)')
    return backup


def discover_bravo_slugs(page):
    """Extract venue slugs from Bravo homepage, filtering non-US venues.

    The registry is only overwritten when the discovery result looks sane
    (non-empty AND >= 80% of the currently known venue count). A Cloudflare
    interstitial or a logged-out homepage returns HTTP 200 with zero venue
    links; persisting that would permanently empty the registry and silently
    stop the scraper.
    """
    page.goto('https://www.bravopokerlive.com/')
    page.wait_for_load_state('networkidle', timeout=15000)
    html = page.content()
    all_slugs = sorted(set(re.findall(r'/venues/([a-z0-9-]+)/', html)))
    slugs = [s for s in all_slugs if s not in NON_US_EXCLUDED]
    excluded = [s for s in all_slugs if s in NON_US_EXCLUDED]
    if excluded:
        log.info(f'  Filtered {len(excluded)} non-US venues: {excluded}')
    log.info(f'Discovered {len(slugs)} USA venue slugs (from {len(all_slugs)} total)')

    existing = load_bravo_slugs()
    if not slugs:
        log.error(
            '  Discovery returned ZERO venue slugs (CF interstitial / logged-out page / '
            f'markup change) — keeping existing registry of {len(existing)} venues'
        )
        return existing
    if existing and len(slugs) < 0.8 * len(existing):
        log.error(
            f'  Discovery returned {len(slugs)} venues vs {len(existing)} known '
            '(<80%) — refusing to overwrite registry'
        )
        return existing

    # Save for next time (only USA venues) — atomic write so a crash mid-write
    # cannot leave corrupt JSON behind.
    reg = {
        'metadata': {
            'generated': datetime.now(timezone.utc).isoformat(),
            'total_venues': len(slugs),
            'non_us_excluded': sorted(NON_US_EXCLUDED),
        },
        'venues': [{'slug': s, 'url': f'https://www.bravopokerlive.com/venues/{s}/'} for s in slugs]
    }
    (BASE_DIR / 'data').mkdir(exist_ok=True)
    try:
        if REGISTRY_PATH.exists() and existing:
            REGISTRY_BACKUP_PATH.write_text(REGISTRY_PATH.read_text())
        tmp_path = REGISTRY_PATH.with_suffix('.json.tmp')
        with open(tmp_path, 'w') as f:
            json.dump(reg, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, REGISTRY_PATH)
    except Exception as e:
        log.error(f'  Registry write failed: {type(e).__name__}: {e}')
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

    # Venue name: tolerate attributes on the <h1> (`<h1 class="venue-title">`)
    # and strip any nested markup. A bare `<h1>` regex silently produced an
    # empty venue_name on any markup change, which was then written to the DB.
    #
    # A bare `<h1>` is tried FIRST so this stays byte-identical to the previous
    # behaviour on today's markup: broadening the pattern to `<h1[^>]*>` alone
    # would start matching an attributed site-header <h1> that appears BEFORE
    # the venue's own bare <h1>, renaming every venue to the site title.
    h1 = (
        re.search(r'<h1>(.*?)</h1>', html, re.DOTALL)
        or re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
    )
    if h1:
        result['venue_name'] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', h1.group(1))).strip()
    if not result['venue_name']:
        og = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', html, re.IGNORECASE)
        if og:
            result['venue_name'] = og.group(1).strip()

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

    # Two INDEPENDENT checks (not if/elif): Bravo may render both sections
    # inside a single <table>, in which case an elif would silently drop the
    # entire waitlist. First match wins — a later duplicate must not clobber it.
    for tbl in all_tables:
        if live_table_content is None and re.search(r'Current\s+Live\s+Games', tbl, re.IGNORECASE):
            live_table_content = tbl
        if wait_table_content is None and re.search(r'Current\s+Waiting\s+List', tbl, re.IGNORECASE):
            wait_table_content = tbl
        if live_table_content is not None and wait_table_content is not None:
            break

    # A SINGLE table carrying BOTH headers matches both checks above and would
    # otherwise be parsed twice — every waitlist row read as a live game (with
    # players_waiting as its table count) and every live row read as a waitlist
    # entry. Split it at the waiting-list header instead. The split lands
    # mid-<tr>, which the row regex below simply ignores (no closing </tr> in
    # the live half, no opening <tr> in the waiting half).
    if (
        live_table_content is not None
        and wait_table_content is not None
        and live_table_content == wait_table_content
    ):
        split = re.search(
            r'(.*?)(Current\s+Waiting\s+List.*)', live_table_content,
            re.DOTALL | re.IGNORECASE,
        )
        if split:
            live_table_content, wait_table_content = split.group(1), split.group(2)

    # Fallback: old Bravo format where header text is OUTSIDE/BEFORE the <table>
    if live_table_content is None:
        m = re.search(r'Current\s+Live\s+Games.*?<table[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
        if m:
            live_table_content = m.group(1)

    if wait_table_content is None:
        m = re.search(r'Current\s+Waiting\s+List.*?<table[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
        if m:
            wait_table_content = m.group(1)

    # Distinguish "the section exists and is empty" from "we could not find the
    # section at all" (markup change or logged-out page). Without this, both
    # look identical downstream — a silent 'no live data'.
    header_present = bool(re.search(r'Current\s+Live\s+Games', html, re.IGNORECASE))
    result['live_section_found'] = live_table_content is not None
    result['authenticated_markup'] = header_present
    if header_present and live_table_content is None:
        log.warning(f'  MARKUP: {venue_slug}: "Current Live Games" header present but no table matched')
    elif not header_present:
        log.debug(f'  {venue_slug}: no "Current Live Games" section on page (logged-out or venue offline?)')

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
    """Write a heartbeat file so external watchdog can detect stale daemons.

    `status` MUST be one of the values scripts/scraper-watchdog-local.sh treats
    as healthy (running|ok|healthy|scraping|idle) whenever the daemon is in
    fact working, otherwise the watchdog force-restarts it. Failure is
    signalled through `consecutive_failures`, which is ALWAYS included so the
    watchdog's failure-streak check can see it.
    """
    try:
        hb = {
            'daemon': 'bravo',
            'status': status,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'pid': os.getpid(),
            'consecutive_failures': 0,
        }
        if extra:
            hb.update(extra)
        with open(HEARTBEAT_FILE, 'w') as f:
            json.dump(hb, f, indent=2)
    except Exception as e:
        # Never crash on heartbeat write — but never hide it either: a stale
        # heartbeat makes the external watchdog restart us with no explanation.
        log.warning(f'  Heartbeat write failed ({HEARTBEAT_FILE}): {type(e).__name__}: {e}')


# ============================================================
# CF COOKIE CACHE (used by the fast-path reconnect in connect())
# ============================================================
# NOTE: the previous Tier-2 (PlaywrightFetcher) and Tier-3 (urllib + cached
# cookies) venue fetchers were removed. They were never called from anywhere,
# and they could not have worked: both fetch venue pages WITHOUT the
# authenticated session, and Bravo only renders "Current Live Games" for
# logged-in users. Keeping them implied a resilience that did not exist.
# The cookie cache below is still live — connect() uses it to skip the
# Turnstile solve on reconnect.
def save_cookies_from_page(page):
    """Extract CF cookies from browser context for the fast-path reconnect."""
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
# PROXY + CREDENTIAL ROTATION HELPERS
# ============================================================
def _proxy_kwargs(session_id: str = ''):
    """Return StealthySession proxy kwargs with sticky-session support.

    Geonode sticky session format:
      http://USER-session-SESSIONID:PASS@us.proxy.geonode.io:9000
    Where SESSIONID is a random 8-char alphanumeric string injected into
    the username. Using the same session ID for the full login + venue scrape
    cycle pins the same residential IP so Bravo doesn't see an IP hop.

    Falls back to BRAVO_PROXY (legacy rotating) if BRAVO_PROXY_BASE unset.
    Returns {} (direct connection) if neither is configured.
    """
    if BRAVO_PROXY_BASE:
        # Inject -session-XXXXX into the username portion of the URL
        # URL format: http://USER:PASS@HOST:PORT
        import re as _re
        sid = session_id or uuid.uuid4().hex[:8]
        # Accept http/https and any username shape, not just geonode_*.
        # subn() so we can tell whether the injection actually happened —
        # a silent no-op means every request goes out on a ROTATING IP while
        # the log claims a sticky session, which shows up later as
        # unexplained login failures and credential-pool burn.
        if '@' in BRAVO_PROXY_BASE:
            proxy_url, n_subs = _re.subn(
                r'^(https?://)([^:/@]+)(:[^@]*@)',
                lambda m: f'{m.group(1)}{m.group(2)}-session-{sid}{m.group(3)}',
                BRAVO_PROXY_BASE,
                count=1,
            )
        else:
            # No credentials in the URL — there is no username to pin a
            # session onto. Do not mangle the hostname.
            proxy_url, n_subs = BRAVO_PROXY_BASE, 0
        if n_subs == 0:
            log.warning(
                '  Sticky-session injection did NOT apply — BRAVO_PROXY_BASE does not match '
                'scheme://user:pass@host:port. Falling back to the rotating proxy; '
                'expect IP hops mid-cycle.'
            )
            return {'proxy': BRAVO_PROXY or BRAVO_PROXY_BASE}
        log.info(f'  Sticky session ID: {sid} (same IP for entire cycle)')
        return {'proxy': proxy_url}
    if BRAVO_PROXY:
        return {'proxy': BRAVO_PROXY}
    return {}


def _rotate_credentials_if_needed(mgr):
    """Cycle to the next account in CRED_POOL if the current one failed.
    
    Called at the start of every connect() call. If mgr._cred_failed is
    set (by _login() after exhausting all retries), we advance to the
    next account in the pool. Wraps around to index 0 if we've tried
    all accounts.
    
    This is the ONLY place BRAVO_EMAIL/BRAVO_PASS globals are mutated.
    """
    global BRAVO_EMAIL, BRAVO_PASS, _active_cred_idx
    if not getattr(mgr, '_cred_failed', False):
        return
    mgr._cred_failed = False
    if len(CRED_POOL) <= 1:
        log.warning('  ⚠️  Credential pool exhausted (only 1 account). Retrying same account.')
        return
    _active_cred_idx = (_active_cred_idx + 1) % len(CRED_POOL)
    BRAVO_EMAIL, BRAVO_PASS = CRED_POOL[_active_cred_idx]
    log.warning(f'  🔄 Rotated to account #{_active_cred_idx + 1}: {BRAVO_EMAIL}')


# ============================================================
# PERSISTENT SESSION MANAGER
# ============================================================
class BravoSessionManager:
    """Manages a persistent Scrapling browser session with Bravo.

    Fetch strategy: StealthySession ONLY (full CF bypass + authenticated
    page). There is no fallback fetcher — see the module docstring. When the
    session dies mid-cycle, run_scrape_cycle reconnects in place.

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
        self._cred_failed = False  # Set by _login() to trigger credential rotation on next connect()

    def _fast_path_connect(self, watchdog_timer=None):
        """Attempt session restore using saved CF cookies (skips Turnstile solve).

        If cf_cookies.json contains a valid cf_clearance cookie, inject it into
        a fresh StealthySession context and go straight to login. This saves
        ~10-15 seconds per daemon restart when the CF session is still valid.

        Returns True on success, False if cookies are stale/rejected (caller
        should fall through to full Turnstile solve).
        """
        # Self-heal a missing Playwright browser before launching a session.
        # Cheap when present (a path probe); downloads only when genuinely absent.
        if _browser_heal is not None:
            _browser_heal.ensure_browser(log=log.warning)

        from scrapling.fetchers import StealthySession
        try:
            with open(COOKIE_CACHE_FILE) as f:
                cached = json.load(f)
            if not cached.get('cf_clearance'):
                return False

            # Start a fresh session WITHOUT solve_cloudflare to avoid wasting time
            fast_session = StealthySession(headless=True, solve_cloudflare=False, **_proxy_kwargs())
            fast_session.start()

            # Build context and inject cached cookies
            fast_context = fast_session.context
            if fast_context:
                cookie_list = []
                for name, value in cached.items():
                    cookie_list.append({
                        'name': name,
                        'value': value,
                        'domain': '.bravopokerlive.com',
                        'path': '/',
                    })
                try:
                    fast_context.add_cookies(cookie_list)
                    log.info(f'  Injected {len(cookie_list)} cached CF cookies into new context')
                    if BRAVO_PROXY:
                        log.info(f'  Proxy: {BRAVO_PROXY.split("@")[-1] if "@" in BRAVO_PROXY else BRAVO_PROXY}')
                except Exception as e:
                    log.debug(f'  Cookie injection failed: {e}')
                    fast_session.close()
                    return False

            fast_page = fast_context.new_page()

            # Quick sanity check — navigate to login page
            # If CF rejects our cookies, we'll see a challenge page
            fast_page.goto(BRAVO_LOGIN_URL, timeout=15000, wait_until='domcontentloaded')
            time.sleep(2)
            content = fast_page.content()

            if 'Just a moment' in content or 'Performing security' in content:
                log.info('  CF cookies rejected (challenge page) — stale cookies')
                try:
                    fast_page.close()
                    fast_session.close()
                except Exception:
                    pass
                return False

            # Cookies accepted — adopt this session as our primary
            self.session = fast_session
            self.context = fast_context
            self.page = fast_page
            self._session_dead = False
            self.consecutive_nav_failures = 0

            # Proceed to login
            result = self._login()
            if watchdog_timer:
                watchdog_timer.cancel()
            return result

        except Exception as e:
            log.debug(f'  Fast-path connect error: {e}')
            # Attempt cleanup
            try:
                fast_session.close()
            except Exception:
                pass
            return False

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

        # Network pre-check — give 3s for OS network stack to settle after browser kill
        time.sleep(3)
        if not _network_available():
            log.warning('  ⚠️  Network unavailable — skipping browser launch')
            return False

        # Self-heal a missing Playwright browser before launching a session.
        # Placed after the network check because healing needs to download.
        if _browser_heal is not None:
            _browser_heal.ensure_browser(log=log.warning)

        # Rotate credentials from pool if previous account failed
        _rotate_credentials_if_needed(self)

        proxy_display = BRAVO_PROXY.split('@')[-1] if '@' in BRAVO_PROXY else (BRAVO_PROXY or 'none')
        log.info(f'🔌 Establishing new StealthySession... (account: {BRAVO_EMAIL} | proxy: {proxy_display})')

        # ── CF COOKIE FAST-PATH ──
        # If saved CF cookies are <4 hours old, inject them into the new
        # browser context and skip Turnstile solving. Falls through on failure.
        # NOTE: watchdog_timer is not armed yet here — pass None (fast-path
        # has its own 30s internal timeout via goto(timeout=15000)).
        # Proxy is injected via StealthySession kwargs if configured.
        CF_COOKIE_MAX_AGE_SECONDS = 4 * 3600
        if COOKIE_CACHE_FILE.exists():
            try:
                cookie_age = time.time() - COOKIE_CACHE_FILE.stat().st_mtime
                if cookie_age < CF_COOKIE_MAX_AGE_SECONDS:
                    log.info(f'  🍪 CF cookie cache is {cookie_age/60:.0f}min old — attempting fast-path reconnect...')
                    result = self._fast_path_connect(watchdog_timer=None)
                    if result:
                        log.info('  ✅ Fast-path CF reconnect succeeded (skipped Turnstile solve)')
                        return True
                    log.info('  ⚠️  Fast-path failed — falling back to full Turnstile solve')
                else:
                    log.info(f'  CF cookie cache expired ({cookie_age/3600:.1f}h > 4h) — full solve required')
            except Exception as e:
                log.debug(f'  CF fast-path check failed: {e}')

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
            self.session = StealthySession(headless=True, solve_cloudflare=True, **_proxy_kwargs())
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
                        self.session = StealthySession(headless=True, solve_cloudflare=True, **_proxy_kwargs())
                        self.session.start()
                    else:
                        raise

            if not resp or resp.status not in (200, 307):
                log.error(f'  {ERROR_CF_BLOCKED}: Status {resp.status if resp else "None"}')
                watchdog_timer.cancel()
                return False

            log.info(f'  ✅ Cloudflare solved (proxy: {BRAVO_PROXY.split("@")[-1] if "@" in BRAVO_PROXY else ("direct" if not BRAVO_PROXY else BRAVO_PROXY)})')

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
                self.page.goto(f'{BRAVO_LOGIN_URL}?ReturnUrl=%2f', timeout=LOGIN_TIMEOUT, wait_until='domcontentloaded')
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
                elif 'chrome-error://' in url or 'about:blank' in url:
                    # Browser crashed or reset — NOT a login success
                    log.warning(f'  ⚠️  Login attempt {attempt+1} failed: browser crashed (URL: {url})')
                    # Mark page as dead so we reconnect cleanly
                    self._session_dead = True
                    time.sleep(2 ** attempt)
                    continue
                elif 'login' not in url.lower() and 'bravopokerlive.com' in url:
                    # Redirected to a valid Bravo page — real success
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

        log.error(f'  {ERROR_LOGIN_FAILED}: All {MAX_RETRIES} attempts exhausted for {BRAVO_EMAIL}')
        self.is_authenticated = False
        # Flag this credential as failed so next connect() rotates to next account
        self._cred_failed = True
        return False

    def health_check(self):
        """Check if the current session is still alive AND authenticated.

        A logged-out Bravo venue page still returns HTTP 200 with an <h1>, so
        the old `'<h1>' in content` fallback passed a fully de-authenticated
        session and the daemon then burned a whole cycle on pages that never
        contain the "Current Live Games" table. We now require a POSITIVE
        authenticated marker and explicitly fail on any login affordance.
        """
        if not self.page or not self.session:
            return False

        # Use a slug from the live registry rather than hardcoding 'bellagio',
        # which silently breaks the health check if that venue is delisted.
        slugs = load_bravo_slugs()
        slug = slugs[0] if slugs else 'bellagio'

        try:
            self.page.goto(BRAVO_VENUE_URL.format(slug=slug))
            self.page.wait_for_load_state('networkidle', timeout=VENUE_TIMEOUT)

            content = self.page.content()
            lowered = content.lower()

            if 'just a moment' in lowered or 'performing security' in lowered:
                log.warning('  Health check: CF challenge — need re-auth')
                return False
            login_prompt = ('name="Email"' in content) or ('loginmodal' in lowered)
            authenticated_marker = (
                'welcome back' in lowered
                or 'current live games' in lowered
                or '/logout' in lowered
            )
            if login_prompt or not authenticated_marker:
                log.warning(
                    f'  Health check: NOT authenticated on /venues/{slug}/ '
                    f'(login_prompt={login_prompt}) — need re-auth'
                )
                return False

            log.info('  Health check: authenticated')
            return True

        except Exception as e:
            log.error(f'  Health check failed: {e}')
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
        """Navigate to a venue page using the persistent authenticated page.

        ARCHITECTURE (LOCKED IN — per Scrapling scraper law):
          - self.page.goto() ONLY — uses the persistent logged-in page.
            The page lives in the CF-cleared, authenticated browser context.
            Auth cookies from login persist for the entire session lifespan.
            There is no unauthenticated fallback fetcher (it could not see
            the logged-in "Current Live Games" table).

        Return values:
          html string        — page fetched successfully
          '<BLOCKED_VENUE>'  — Cloudflare/HTTP block for this venue URL
          '<SKIPPED_VENUE>'  — navigation interrupted, page reset, session ok
          None               — navigation failed / session dead

        WHY page.goto() and NOT session.fetch():
          session.fetch() spins up a fresh fetch without persistent auth state.
          The persistent self.page (created in the same context as the CF solve)
          carries all login cookies and CF clearance between venue navigations.

        WHY page.goto() works for CF:
          The browser CONTEXT was created via StealthySession(solve_cloudflare=True).
          Any page in this context inherits the CF clearance cookies. Cloudflare
          checks cookies, not per-request challenge prompts, on subsequent navigations.
        """
        if not self.page or self._session_dead:
            return None

        # === TIER 1: Persistent logged-in page.goto() ===
        for attempt in range(1 + VENUE_RETRY_COUNT):
            try:
                self.page.goto(
                    BRAVO_VENUE_URL.format(slug=slug),
                    timeout=VENUE_TIMEOUT,
                    wait_until='domcontentloaded'
                )

                content = self.page.content()

                # Session expired — re-auth inline
                if 'name="Email"' in content and 'loginmodal' in content.lower():
                    log.warning(f'  ⚠️  Session expired during scrape, re-authenticating...')
                    if self._login():
                        self.page.goto(
                            BRAVO_VENUE_URL.format(slug=slug),
                            timeout=VENUE_TIMEOUT,
                            wait_until='domcontentloaded'
                        )
                        content = self.page.content()
                    else:
                        self._session_dead = True
                        return None

                # CF challenge on venue page — Bravo is BLOCKING us here.
                # Reported separately from "venue has no live games": a wave of
                # blocks used to be indistinguishable from a quiet night.
                if 'Just a moment' in content or 'Performing security' in content:
                    log.warning(f'  BLOCKED: {slug}: Cloudflare challenge on venue page')
                    return '<BLOCKED_VENUE>'

                # Success — reset failure counter
                self.consecutive_nav_failures = 0
                save_cookies_from_page(self.page)
                return content

            except Exception as e:
                err_msg = str(e)

                # PER-VENUE HTTP ERROR: 4xx/5xx from Bravo server (venue disabled)
                # NOT a browser crash — skip this venue, keep session alive
                if 'ERR_HTTP_RESPONSE_CODE_FAILURE' in err_msg or 'ERR_ABORTED' in err_msg:
                    log.warning(f'  BLOCKED: {slug}: {ERROR_VENUE_403} HTTP error (venue offline/removed/blocked)')
                    try:
                        self.page.goto('about:blank', timeout=5000, wait_until='commit')
                    except Exception:
                        pass
                    return '<BLOCKED_VENUE>'

                # CHROME ERROR / BROWSER CRASH: page in bad state
                if 'chrome-error' in err_msg or 'interrupted by another navigation' in err_msg:
                    log.warning(f'  {slug}: Navigation interrupted — resetting page')
                    try:
                        self.page.goto('about:blank', timeout=5000, wait_until='commit')
                    except Exception:
                        pass
                    return '<SKIPPED_VENUE>'

                # BROWSER CONTEXT DEAD: session needs full restart
                if any(x in err_msg for x in ('has been closed', 'Target page',
                                               'context was destroyed', 'Session closed')):
                    log.warning(f'  🔴 Browser context dead — marking session dead')
                    self._session_dead = True
                    self.consecutive_nav_failures += 1
                    return None

                # Timeout — retry once
                if attempt < VENUE_RETRY_COUNT and 'Timeout' in err_msg:
                    log.info(f'  🔄 Retry {attempt + 1} for {slug} (timeout)')
                    time.sleep(1)
                    continue

                # Other errors
                self.consecutive_nav_failures += 1
                if self.consecutive_nav_failures >= CIRCUIT_BREAKER_THRESHOLD:
                    log.warning(f'  🔴 {self.consecutive_nav_failures} consecutive failures — session marked dead')
                    self._session_dead = True

                log.warning(f'  ❌ Navigate error on {slug}: {type(e).__name__}: {str(e)[:120]}')
                return None

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
                except Exception as e:
                    log.debug(f'  page.close() failed: {type(e).__name__}: {e}')
            if self.session:
                try:
                    self.session.close()
                except Exception as e:
                    log.debug(f'  session.close() failed: {type(e).__name__}: {e}')
        except Exception as e:
            log.debug(f'  disconnect() error: {type(e).__name__}: {e}')
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
    """Delete THIS daemon's evidence JSON files older than 7 days.

    Scoped to bravo_live_*.json (the naming used when writing evidence below).
    data/scrape-evidence is shared with other scrapers — globbing '*.json' here
    deleted their evidence too, including the liveness sweep's only record of
    which venues it deactivated.
    """
    try:
        cutoff = time.time() - (7 * 86400)
        count = 0
        for f in EVIDENCE_DIR.glob('bravo_live_*.json'):
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
    """Once per day (UTC), scrape Bravo homepage to detect new venue slugs.

    The once-per-day gate is keyed on the UTC date so it lines up with the
    timestamps written to the database; it is only set AFTER a discovery that
    actually returned venues, so a Cloudflare interstitial does not lock
    discovery out until the next calendar day.
    """
    global _last_bravo_discovery_date
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    if _last_bravo_discovery_date == today:
        return

    log.info('Running daily Bravo venue discovery...')
    try:
        current_slugs = set(load_bravo_slugs())
        new_slugs = discover_bravo_slugs(mgr.page)
        new_set = set(new_slugs)

        if not new_set:
            log.error('  Daily discovery produced no venues — will retry next cycle')
            return

        added = new_set - current_slugs
        removed = current_slugs - new_set

        if added:
            log.info(f'  NEW venues discovered: {sorted(added)}')
        if removed:
            log.info(f'  Venues no longer listed: {sorted(removed)}')
        if not added and not removed:
            log.info(f'  No venue changes (still {len(new_set)} venues)')

        _last_bravo_discovery_date = today
    except Exception as e:
        log.warning(f'  Daily discovery failed: {e}')


# ============================================================
# HISTORICAL SNAPSHOT: Save per-cycle venue summary for trending
# ============================================================
def save_history_snapshot(batch_id, results):
    """Insert a summary row per venue into venue_live_history for trending.

    Returns True on success; the caller counts failures into the heartbeat.
    """
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
        if not rows:
            return True
        body = json.dumps(rows).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/venue_live_history',
            data=body, method='POST',
            headers={**SB_HEADERS, 'Prefer': 'return=minimal'}
        )
        try:
            urllib.request.urlopen(req, timeout=15)
            log.info(f'  Saved {len(rows)} venue history snapshots')
            return True
        except Exception as e:
            log.error(f'{ERROR_SUPABASE}: venue_live_history insert FAILED '
                      f'({len(rows)} rows): {_http_error_detail(e)}')
            return False
    except Exception as e:
        log.error(f'  venue_live_history snapshot error: {type(e).__name__}: {e}')
        return False


# ============================================================
# GAME-LEVEL HISTORICAL SNAPSHOT: Per-game rows for heatmaps/predictions
# ============================================================
_STAKES_RE = re.compile(
    r'(\$\s?\d[\d,]*(?:\.\d+)?\s*(?:/|-|\\|and)\s*\$?\s?\d[\d,]*(?:\.\d+)?'
    r'(?:\s*(?:/|-)\s*\$?\s?\d[\d,]*(?:\.\d+)?)*)'
)


def _parse_stakes(game_name):
    """Extract the stakes portion of a Bravo game name, e.g. '$1/$3 NL Hold'em'.

    Returns '' when no stakes pattern is present. (The column is written as ''
    rather than NULL because the existing rows use '' and the column's
    nullability is not guaranteed — do not change the shape of the write.)
    """
    m = _STAKES_RE.search(game_name or '')
    return m.group(1).strip() if m else ''


def _waiting_for_game(data, game_name):
    """Players waiting for `game_name` at this venue, from the waitlist table.

    Bravo publishes live games and the waiting list as two separate tables
    keyed by the same game name, so the two must be joined case-insensitively.
    Returns 0 only when the game genuinely has no waitlist entry.
    """
    target = (game_name or '').strip().lower()
    for w in data.get('waitlist', []):
        if w['game'].strip().lower() == target:
            return w['players_waiting']
    return 0


def save_game_history_snapshot(batch_id, results):
    """Insert per-game rows into game_live_history for game-type heatmaps.

    Writes to game_live_history only; never touches venue_live_history.
    Returns True on success — the caller counts and reports failures, they are
    NOT safe to swallow (game-predictions / peak-activity / heatmap APIs all
    read this table).
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for data in results:
            live_names = [g['game'].strip().lower() for g in data['live_games']]
            for game in data['live_games']:
                rows.append({
                    'bravo_slug': data['venue_slug'],
                    'venue_name': data['venue_name'],
                    'game_type': game['game'],
                    'stakes': _parse_stakes(game['game']),
                    'tables': game['tables'],
                    # Real per-game waiting count from the waitlist table.
                    # This was hard-coded to 0, so every running game with a
                    # queue was recorded as having nobody waiting.
                    'waiting': _waiting_for_game(data, game['game']),
                    'source': 'bravo',
                    'snapshot_time': now,
                    'batch_id': batch_id,
                })
            for w in data['waitlist']:
                # Waitlist-only games (nobody seated yet)
                if w['game'].strip().lower() not in live_names:
                    rows.append({
                        'bravo_slug': data['venue_slug'],
                        'venue_name': data['venue_name'],
                        'game_type': w['game'],
                        'stakes': _parse_stakes(w['game']),
                        'tables': 0,
                        'waiting': w['players_waiting'],
                        'source': 'bravo',
                        'snapshot_time': now,
                        'batch_id': batch_id,
                    })
        if not rows:
            return True
        body = json.dumps(rows).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/game_live_history',
            data=body, method='POST',
            headers={**SB_HEADERS, 'Prefer': 'return=minimal'}
        )
        try:
            urllib.request.urlopen(req, timeout=15)
            log.info(f'  Saved {len(rows)} game history rows')
            return True
        except Exception as e:
            log.error(f'{ERROR_SUPABASE}: game_live_history insert FAILED '
                      f'({len(rows)} rows): {_http_error_detail(e)}')
            return False
    except Exception as e:
        log.error(f'  game_live_history snapshot error: {type(e).__name__}: {e}')
        return False


# ============================================================
# CHUNKED PUBLISH HELPER
# ============================================================
def build_payload_from_results(results, batch_id):
    """Convert venue results into Supabase-ready payload records.

    Venues whose name could not be extracted are QUARANTINED (skipped) rather
    than published with venue_name='': the live-tables API merges cross-source
    venues on the normalised name, so a blank name can mis-merge unrelated
    rooms onto a Bravo slug.
    """
    payload = []
    for data in results:
        if not (data.get('venue_name') or '').strip():
            log.warning(
                f'  QUARANTINE: {data["venue_slug"]} produced an empty venue_name '
                '(markup change?) — not publishing this venue'
            )
            continue
        for game in data['live_games']:
            record = {
                'bravo_slug': data['venue_slug'],
                'venue_name': data['venue_name'],
                'game_name': game['game'],
                'tables_running': game['tables'],
                'players_waiting': _waiting_for_game(data, game['game']),
                'scrape_timestamp': data['scrape_timestamp'],
                'scrape_html_hash': data['scrape_html_hash'],
                'scrape_batch_id': batch_id,
                'data_quality': 'scraped_verified',
                'source': 'bravo',
            }
            payload.append(record)

        live_names = [g['game'].strip().lower() for g in data['live_games']]
        for w in data['waitlist']:
            if w['game'].strip().lower() not in live_names:
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
        log.info(f'  CHUNK {chunk_num} published: {len(payload)} records from {len(chunk_results)} venues')
        return len(payload), True
    else:
        log.error(
            f'{ERROR_SUPABASE}: CHUNK {chunk_num} publish FAILED '
            f'({len(payload)} records from {len(chunk_results)} venues) — re-queued for retry'
        )
        return 0, False


# ============================================================
# MAIN SCRAPE CYCLE
# ============================================================
# Stale-cleanup safety gates. A cycle that did not see most of the registry
# must NEVER be allowed to delete the previous batch's rows for the venues it
# never reached — the live-tables API deliberately serves rows up to 24h old.
MIN_COVERAGE_FOR_FULL_DELETE = 0.7   # fraction of registry that must be reached
MAX_BLOCKED_RATIO_FOR_DELETE = 0.2   # abort full delete above this block rate
DELETE_SLUG_BATCH = 40               # slugs per scoped DELETE (URL length cap)


def run_scrape_cycle(mgr):
    """Run one full scrape cycle with chunked publish.

    CHUNKED PUBLISH PATTERN:
    Instead of scraping all 156 venues then saving at the end (where a
    crash at venue #50 means zero data), we publish every CHUNK_SIZE
    venues. Users get partial data within minutes.

    Flow:
      Scrape venues 1-25 → PUBLISH → Scrape 26-50 → PUBLISH → ...
      Retry any chunk whose publish failed.
      Only then, and only if the cycle completed cleanly with sane coverage,
      delete stale records from previous batches (otherwise the delete is
      scoped to just the slugs re-scraped this cycle).

    Returns (records_saved, cycle_ok) where cycle_ok is False whenever the
    cycle was aborted, publishes failed, or venues were scraped but nothing
    reached the database. main() uses records_saved/cycle_ok to decide whether
    the in-process watchdog clock may be reset.
    """
    batch_id = str(uuid.uuid4())
    cycle_start = datetime.now(timezone.utc)

    # Rotate log file handler if day changed
    _maybe_rotate_log()

    # Run periodic cleanup (lightweight, runs at start of each cycle)
    cleanup_evidence_files()
    cleanup_log_files()

    log.info(f'=== SCRAPE CYCLE #{mgr.total_cycles + 1} | Batch: {batch_id[:8]} ===')

    # Fresh heartbeat BEFORE the (slow) connect, so the external watchdog does
    # not see a stale file while a legitimate connect/CF solve is in progress.
    write_heartbeat('scraping', {
        'cycle': mgr.total_cycles + 1,
        'phase': 'connecting',
        'consecutive_failures': mgr.consecutive_failures,
    })

    # Ensure connected
    if not mgr.ensure_connected():
        mgr.consecutive_failures += 1
        write_heartbeat('connect_failed', {'consecutive_failures': mgr.consecutive_failures})
        
        import random
        base_delays = [5, 15, 45, 120, 300]
        idx = min(max(0, mgr.consecutive_failures - 1), len(base_delays) - 1)
        backoff = int(base_delays[idx] * random.uniform(0.9, 1.1))
        
        log.error(f'{mgr.consecutive_failures} consecutive failures — applying stealth backoff ({backoff}s)')
        time.sleep(backoff)
        return 0, False

    # Daily discovery pass (once per day)
    daily_bravo_discovery(mgr)

    # Load venue slugs
    slugs = load_bravo_slugs()
    if not slugs:
        log.info('No registry found, discovering slugs...')
        slugs = discover_bravo_slugs(mgr.page)
    if not slugs:
        # Nothing to scrape is a FAILURE, not a quiet cycle — otherwise an
        # emptied/corrupt registry looks healthy forever.
        mgr.consecutive_failures += 1
        log.error('No venue slugs available (registry empty and discovery failed) — nothing to scrape')
        write_heartbeat('idle', {
            'cycle': mgr.total_cycles,
            'records_saved': 0,
            'cycle_ok': False,
            'reason': 'empty_registry',
            'consecutive_failures': mgr.consecutive_failures,
        })
        return 0, False
    log.info(f'Scraping {len(slugs)} venues (chunked publish every {CHUNK_SIZE})...')

    # Scrape each venue — CHUNKED PUBLISH
    all_results = []        # All results for evidence/history
    chunk_results = []      # Current chunk buffer
    pending_publish = []    # Venues whose chunk publish FAILED — retried at end
    total_saved = 0
    total_errors = 0
    total_blocked = 0       # CF/HTTP blocks — Bravo refusing us
    total_no_data = 0       # Page loaded fine, venue simply has no live games
    publish_failures = 0
    chunk_num = 0

    consecutive_venue_failures = 0
    cycle_aborted = False

    in_cycle_reconnects = 0
    MAX_IN_CYCLE_RECONNECTS = 2  # Max mid-cycle reconnects before giving up

    for i, slug in enumerate(slugs):
        # CIRCUIT BREAKER: If too many consecutive venues fail, abort and reconnect
        if consecutive_venue_failures >= CIRCUIT_BREAKER_THRESHOLD:
            log.error(f'CIRCUIT BREAKER: {consecutive_venue_failures} consecutive failures — aborting cycle, forcing reconnect')
            mgr._session_dead = True
            cycle_aborted = True
            break

        # IN-CYCLE SESSION RECOVERY: If session died mid-cycle, reconnect
        # immediately instead of wasting venues on doomed Tier 2/3 attempts.
        # This recovers ~130 venues per cycle that were previously lost.
        if mgr._session_dead and in_cycle_reconnects < MAX_IN_CYCLE_RECONNECTS:
            log.info(f'In-cycle reconnect #{in_cycle_reconnects + 1} (session died at venue {i})...')
            # Flush any accumulated results before reconnect
            if chunk_results:
                chunk_num += 1
                saved, ok = publish_chunk(chunk_results, batch_id, chunk_num)
                total_saved += saved
                if not ok:
                    publish_failures += 1
                    pending_publish.extend(chunk_results)
                chunk_results = []

            if mgr.connect():
                in_cycle_reconnects += 1
                consecutive_venue_failures = 0
                log.info(f'  In-cycle reconnect succeeded — resuming at venue {i+1}/{len(slugs)}')
            else:
                log.error('  In-cycle reconnect failed — aborting cycle')
                cycle_aborted = True
                break

        # PAGE RECYCLING: Prevent browser memory leaks
        if (i + 1) % PAGE_RECYCLE_INTERVAL == 0 and not mgr._session_dead:
            mgr.recycle_page()

        html = mgr.navigate_venue(slug)
        if html in ('<SKIPPED_VENUE>', '<BLOCKED_VENUE>'):
            # Blocked/erroring venues are counted SEPARATELY from venues that
            # loaded fine but have no live games. Conflating them hid mass
            # Cloudflare blocks behind a benign-looking 'skipped' number.
            total_blocked += 1
            # Do NOT increment consecutive_venue_failures or total_errors
            # Just move to the next venue
            continue
        elif html is None:
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
                f'  [{i+1}/{len(slugs)}] OK {(data["venue_name"] or slug)[:28]:28} | '
                f'{total_tables} tables | {total_waiting} waiting'
            )
        else:
            total_no_data += 1
            if total_no_data <= 3 or total_no_data % 10 == 0:
                log.info(f'  [{i+1}/{len(slugs)}] {slug[:28]:28} | no live data')

        # Human-like delay with jitter
        import random as _random
        time.sleep(RATE_LIMIT_DELAY + _random.uniform(-RATE_LIMIT_JITTER, RATE_LIMIT_JITTER))

        # ── CHUNKED PUBLISH: Flush buffer every CHUNK_SIZE venues with data ──
        if len(chunk_results) >= CHUNK_SIZE:
            chunk_num += 1
            saved, ok = publish_chunk(chunk_results, batch_id, chunk_num)
            total_saved += saved
            if not ok:
                # Do NOT discard the scraped rows — re-queue them for one
                # retry at the end of the cycle (the docstring's
                # "ERROR_SUPABASE -> queue for retry" contract).
                publish_failures += 1
                pending_publish.extend(chunk_results)
            chunk_results = []  # Reset buffer

            # Update heartbeat after each chunk so watchdog sees activity
            write_heartbeat('scraping', {
                'cycle': mgr.total_cycles + 1,
                'progress': f'{i+1}/{len(slugs)}',
                'records_saved': total_saved,
                'chunk': chunk_num,
                'publish_failures': publish_failures,
                'venues_blocked': total_blocked,
                'consecutive_failures': mgr.consecutive_failures,
            })

    # ── Flush remaining venues in the last partial chunk ──
    if chunk_results:
        chunk_num += 1
        saved, ok = publish_chunk(chunk_results, batch_id, chunk_num)
        total_saved += saved
        if not ok:
            publish_failures += 1
            pending_publish.extend(chunk_results)
        chunk_results = []

    # ── RETRY: re-publish everything whose chunk failed ──
    unpublished_venues = 0
    if pending_publish:
        log.warning(f'Retrying publish for {len(pending_publish)} venues from {publish_failures} failed chunk(s)...')
        chunk_num += 1
        saved, ok = publish_chunk(pending_publish, batch_id, chunk_num)
        total_saved += saved
        if ok:
            log.info(f'  Retry succeeded — {saved} records recovered')
            pending_publish = []
        else:
            unpublished_venues = len(pending_publish)
            log.error(
                f'{ERROR_SUPABASE}: retry FAILED — {unpublished_venues} venues were scraped '
                'but never persisted this cycle'
            )

    # ── Stale record cleanup ──
    # A partial/aborted cycle must never wipe the previous batch's rows for
    # venues it did not reach: the live-tables API intentionally serves rows
    # up to 24h old, and deleting them makes those venues vanish from the site.
    venues_reached = len(all_results) + total_no_data
    coverage = (venues_reached / len(slugs)) if slugs else 0.0
    blocked_ratio = (total_blocked / len(slugs)) if slugs else 0.0
    delete_ok = False
    delete_scope = 'none'

    if total_saved > 0 and not pending_publish:
        full_delete_safe = (
            not cycle_aborted
            and unpublished_venues == 0
            and coverage >= MIN_COVERAGE_FOR_FULL_DELETE
            and blocked_ratio <= MAX_BLOCKED_RATIO_FOR_DELETE
        )
        if full_delete_safe:
            delete_scope = 'full'
            delete_ok = sb_delete('venue_live_tables', f'scrape_batch_id=neq.{batch_id}&source=eq.bravo')
        else:
            # Degraded cycle: only retire stale rows for the slugs we actually
            # re-scraped, leaving untouched venues' previous rows in place.
            published_slugs = sorted({
                d['venue_slug'] for d in all_results if (d.get('venue_name') or '').strip()
            })
            # ENFORCE the charset the in.() filter below assumes, rather than
            # trusting it: slugs are re-read from a JSON file on disk, and a
            # slug containing ',' or ')' would silently widen the DELETE to
            # venues this cycle never republished — wiping them from the site.
            unsafe = [s for s in published_slugs if not re.fullmatch(r'[a-z0-9-]+', s)]
            if unsafe:
                log.error(
                    f'  Refusing to include {len(unsafe)} slug(s) with unexpected characters '
                    f'in the scoped DELETE: {unsafe[:5]}'
                )
                published_slugs = [s for s in published_slugs if s not in set(unsafe)]
            log.warning(
                f'Degraded cycle (aborted={cycle_aborted}, coverage={coverage:.0%}, '
                f'blocked={blocked_ratio:.0%}, publish_failures={publish_failures}) — '
                f'scoping stale cleanup to {len(published_slugs)} re-scraped venues only'
            )
            delete_scope = 'scoped'
            delete_ok = True
            for j in range(0, len(published_slugs), DELETE_SLUG_BATCH):
                batch_slugs = published_slugs[j:j + DELETE_SLUG_BATCH]
                # Slugs are [a-z0-9-] only (see the discovery regex), so they
                # need no quoting/escaping inside the PostgREST in.() list.
                slug_filter = ','.join(batch_slugs)
                if not sb_delete(
                    'venue_live_tables',
                    f'bravo_slug=in.({slug_filter})&scrape_batch_id=neq.{batch_id}&source=eq.bravo'
                ):
                    delete_ok = False
        if not delete_ok:
            log.error(f'{ERROR_SUPABASE}: stale cleanup ({delete_scope}) failed — '
                      'venue_live_tables may contain duplicate/stale rows')
    else:
        log.warning('Skipping stale cleanup: nothing was persisted this cycle')

    # ── Historical snapshots (only for data that actually reached the DB) ──
    history_write_failures = 0
    if total_saved > 0:
        # Same quarantine rule as build_payload_from_results: never write
        # rows for a venue whose name failed to extract.
        history_results = [d for d in all_results if (d.get('venue_name') or '').strip()]
        if not save_history_snapshot(batch_id, history_results):
            history_write_failures += 1
        if not save_game_history_snapshot(batch_id, history_results):
            history_write_failures += 1

    # Save evidence
    duration = (datetime.now(timezone.utc) - cycle_start).total_seconds()
    evidence = {
        'batch_id': batch_id,
        'scrape_timestamp': cycle_start.isoformat(),
        'venues_scraped': len(slugs),
        'venues_with_data': len(all_results),
        'venues_no_data': total_no_data,
        'venues_blocked': total_blocked,
        'venues_reached': venues_reached,
        'coverage': round(coverage, 4),
        'blocked_ratio': round(blocked_ratio, 4),
        'total_records_saved': total_saved,
        'errors': total_errors,
        'publish_failures': publish_failures,
        'unpublished_venues': unpublished_venues,
        'history_write_failures': history_write_failures,
        'stale_delete_scope': delete_scope,
        'stale_delete_ok': delete_ok,
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
        log.info('  Scraper metrics recorded')
    except Exception as e:
        history_write_failures += 1
        log.error(f'{ERROR_SUPABASE}: scraper_metrics insert FAILED: {_http_error_detail(e)}')

    with open(BASE_DIR / 'data' / 'bravo-live-snapshot.json', 'w') as f:
        json.dump({
            'metadata': evidence,
            'venues': all_results,
        }, f, indent=2, default=str)

    mgr.total_cycles += 1

    # ── Was this cycle actually OK? ──
    # A cycle is degraded when it was aborted, when a publish never landed, or
    # when venues WERE scraped but nothing reached the database (total DB
    # outage). A genuinely quiet cycle — every venue loaded, none had games —
    # is NOT a failure.
    # A chunk that failed but was recovered by the end-of-cycle retry is NOT a
    # degraded cycle (all rows landed); it is still counted in the heartbeat's
    # publish_failures so intermittent DB trouble stays visible.
    cycle_ok = (
        not cycle_aborted
        and unpublished_venues == 0
        and not (all_results and total_saved == 0)
        and blocked_ratio <= MAX_BLOCKED_RATIO_FOR_DELETE
    )

    if cycle_ok and total_saved > 0:
        mgr.consecutive_failures = 0
    elif not cycle_ok:
        # Surface the streak to the external watchdog via the heartbeat.
        mgr.consecutive_failures += 1

    # Write heartbeat for external watchdog.
    # Status stays within the watchdog's healthy vocabulary
    # (running|ok|healthy|scraping|idle) so a legitimately quiet cycle is not
    # force-restarted; degradation is reported through consecutive_failures
    # and the counters below.
    write_heartbeat('ok' if total_saved > 0 else 'idle', {
        'cycle': mgr.total_cycles,
        'records_saved': total_saved,
        'venues_with_data': len(all_results),
        'venues_no_data': total_no_data,
        'venues_blocked': total_blocked,
        'coverage': round(coverage, 4),
        'errors': total_errors,
        'publish_failures': publish_failures,
        'unpublished_venues': unpublished_venues,
        'history_write_failures': history_write_failures,
        'stale_delete_scope': delete_scope,
        'stale_delete_ok': delete_ok,
        'cycle_ok': cycle_ok,
        'cycle_aborted': cycle_aborted,
        'chunks_published': chunk_num,
        'duration_seconds': round(duration),
        'consecutive_failures': mgr.consecutive_failures,
    })

    log.info(
        f'=== CYCLE #{mgr.total_cycles} {"COMPLETE" if cycle_ok else "DEGRADED"} | '
        f'{len(all_results)}/{len(slugs)} venues with data | coverage {coverage:.0%} | '
        f'{total_saved} records in {chunk_num} chunks | {duration:.0f}s | '
        f'errors: {total_errors} | blocked: {total_blocked} | '
        f'publish failures: {publish_failures} ==='
    )
    return total_saved, cycle_ok

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
# UTC so the daemon's notion of "day" matches every timestamp it writes to
# the database (and the UTC-stamped evidence files).
_last_log_date = datetime.now(timezone.utc).strftime('%Y%m%d')

def _maybe_rotate_log():
    """Rotate log file handler when the UTC date changes (midnight crossing)."""
    global _last_log_date
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
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

    # ── PID LOCKFILE: Prevent dual-instance orphans ──
    # If a previous PID file exists and that process is still running,
    # give it 30s to finish (one throttle interval), then terminate it.
    if PID_FILE.exists():
        try:
            old_pid = int(PID_FILE.read_text().strip())
            if old_pid != os.getpid():
                try:
                    os.kill(old_pid, 0)  # Check if process is alive
                    log.warning(f'  ⚠️  Found orphan instance (PID {old_pid}) — sending SIGTERM')
                    os.kill(old_pid, signal.SIGTERM)
                    # Give 30s for graceful exit
                    for _ in range(30):
                        time.sleep(1)
                        try:
                            os.kill(old_pid, 0)
                        except ProcessLookupError:
                            break
                    else:
                        log.warning(f'  🔴 Orphan did not exit — sending SIGKILL')
                        try:
                            os.kill(old_pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    log.info(f'  ✅ Orphan PID {old_pid} terminated')
                except ProcessLookupError:
                    log.info(f'  PID file stale (PID {old_pid} not running) — replacing')
        except (ValueError, OSError):
            pass
    # Write our own PID
    try:
        PID_FILE.write_text(str(os.getpid()))
        # 'running', not 'starting': scraper-watchdog-local.sh only accepts
        # running|ok|healthy|scraping|idle and force-restarts anything else,
        # and the first cycle takes longer than one watchdog interval.
        write_heartbeat('running')
    except Exception as e:
        log.warning(f'  Could not write PID file: {e}')  # Non-fatal

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
            records_saved, cycle_ok = run_scrape_cycle(mgr)
            # The watchdog clock is reset ONLY on a cycle that actually
            # persisted records, or a clean cycle that legitimately had none.
            # Resetting it on "venues parsed" made a total database outage
            # look healthy forever.
            if records_saved > 0 or cycle_ok:
                last_successful_save = time.time()
                log.info(f'Next scrape in {SCRAPE_INTERVAL // 60} minutes...')
            else:
                # Shorter backoff with exponential multiplier & ±10% Jitter
                import random
                base_delays = [5, 15, 45, 120, 300]
                idx = min(mgr.consecutive_failures, len(base_delays) - 1)
                backoff = int(base_delays[idx] * random.uniform(0.9, 1.1))
                log.warning(f'Retrying in {backoff}s (failure #{mgr.consecutive_failures})...')
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
    # Remove PID file on clean exit
    try:
        if PID_FILE.exists() and int(PID_FILE.read_text().strip()) == os.getpid():
            PID_FILE.unlink()
    except Exception:
        pass
    log.info('Daemon stopped.')

if __name__ == '__main__':
    main()
