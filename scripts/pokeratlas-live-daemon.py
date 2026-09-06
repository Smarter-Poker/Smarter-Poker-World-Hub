#!/usr/bin/env python3
"""
PokerAtlas Live Games — Autonomous Scraper Daemon v3.2
=====================================================
Uses Scrapling + Camoufox StealthySession for Cloudflare bypass.

Scrapes game catalog data from PokerAtlas region pages:
- Venue name, game name, buy-in range, run schedule
- This data COMPLEMENTS Bravo's real-time table counts

Architecture mirrors bravo-live-daemon.py with source='pokeratlas'.

CRITICAL: Requires Python <=3.13. greenlet 3.x has a known infinite
CPU spin bug on Python 3.14+ (check_switch_allowed loop). The venv
MUST be built with python3.13.
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
import urllib.error
import urllib.request
import uuid
import subprocess
import threading
from typing import Dict, List, Optional
from pathlib import Path
from scraper_data_truth import (
    OBSERVATION_CATALOG,
    QUALITY_CATALOG,
    RUN_FAILED,
    RUN_PARTIAL,
    classify_persisted_run,
    is_observed_bravo_row,
)

# ── PYTHON RUNTIME COMPATIBILITY GUARD ──
# greenlet 3.x has a known infinite CPU spin bug on Python 3.14+.
# The process will appear to run (PID alive, 80%+ CPU) but produce
# zero output, zero logs, zero data — a silent catastrophic failure.
if sys.version_info >= (3, 14):
    print(
        f'FATAL: Python {sys.version_info.major}.{sys.version_info.minor} detected. '
        f'greenlet has a known CPU spin bug on Python >=3.14. '
        f'Rebuild venv with Python 3.13: '
        f'/opt/homebrew/bin/python3.13 -m venv /Users/smarter.poker/.local/share/smarter-poker-venv'
    )
    sys.exit(1)
from dotenv import load_dotenv

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
# CONFIG
# ============================================================
BASE_DIR = Path(__file__).resolve().parent.parent
def _resolve_supabase_url(default_url):
    """Return a TRUSTWORTHY Supabase URL.

    NEXT_PUBLIC_SUPABASE_URL is read from .env.local, and that file is edited by
    many hands. On 2026-08-01 a second definition -- NEXT_PUBLIC_SUPABASE_URL=
    https://dummy.supabase.co -- was appended below the real one. Dotenv keeps
    the LAST value, so every launchd daemon that read the variable started
    resolving dummy.supabase.co, which does not exist: urllib raised
    "[Errno 8] nodename nor servname provided, or not known", the dedup-index
    load failed, and the daemon's own safety guard then skipped the write
    entirely. venue_live_history and game_live_history took ZERO rows for 11
    days while the scrape itself reported 11/11 regions and 147 venues -- a
    silent outage that starved the cash-games simulator of training data.

    A hostname is not a secret and there is exactly one correct value here, so
    an obviously-wrong override is rejected rather than obeyed.
    """
    raw = (os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip().strip('"').strip("'")
    if not raw:
        return default_url
    host = raw.split('//')[-1].split('/')[0].lower()
    if (not host.endswith('.supabase.co')) or host.startswith('dummy') or 'example' in host:
        try:
            log.error(
                'ERROR_SUPABASE: refusing NEXT_PUBLIC_SUPABASE_URL=%r (host %r looks like a '
                'placeholder) - falling back to %s. Fix the duplicate/dummy entry in .env.local.',
                raw, host, default_url)
        except Exception:
            print('FATAL-ish: refusing placeholder NEXT_PUBLIC_SUPABASE_URL=%r; using %s'
                  % (raw, default_url), flush=True)
        return default_url
    return raw


SUPABASE_URL = _resolve_supabase_url('https://kuklfnapbkmacvwxktbh.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# ── STARTUP CREDENTIAL VALIDATION ──
if not SUPABASE_KEY:
    print(
        'FATAL: SUPABASE_SERVICE_ROLE_KEY not set. Cannot write data.\n'
        'Searched env files (in priority order): ' + ', '.join(_env_priority) + '\n'
        'Found files: ' + ', '.join(str(project_root / f) for f in _env_priority if (project_root / f).exists())
    )
    sys.exit(1)
print(f'Supabase key resolved: {SUPABASE_KEY[:20]}...{SUPABASE_KEY[-6:]}')

# Timing
SCRAPE_INTERVAL = 900  # 15 minutes (offset 7min from Bravo via launchd start)
RATE_LIMIT_DELAY = 1.0  # seconds between region page fetches
MAX_RETRIES = 3
CIRCUIT_BREAKER_THRESHOLD = 5  # Abort cycle + reconnect if this many consecutive regions fail

# A venue that has no cash-games page at all. Across a 710-venue sweep this is
# the single most common response, and it is NOT a failure - it is a definitive
# answer that happens to be "nothing here".
#
# It needs its own sentinel because the cycle used to compare against the
# literal string '404' that NO fetch tier has ever returned (fetch_page returns
# HTML, None or 'REDIRECT'). So every genuine 404 fell through to the `html is
# None` branch, was logged as an error, and incremented
# consecutive_region_failures - five such venues in a row tripped the circuit
# breaker and killed the cycle. It also meant each one paid for a Tier-2
# Playwright launch and a Tier-3 urllib attempt before being counted as a
# failure, which is most of why a cold sweep could not finish inside its
# 15-minute interval.
NO_CASH_PAGE = 'NO_CASH_PAGE'

# If more than this fraction of the venues we actually RETRIEVED parse to zero
# games, that is a parser break, not the entire country closing at once - so
# their slugs must not be written into the 7-day no-cash cache. See the commit
# for the outage this prevents.
EMPTY_PARSE_POISON_THRESHOLD = 0.8

# How long ONE cycle may spend sweeping before it saves its place and returns.
# The 710-venue sweep cannot finish in a single 15-minute interval - measured
# 2026-08-29 against the live daemon, ~4s per venue means ~47 minutes - so it
# is walked ACROSS cycles from a persisted cursor instead. Comfortably inside
# SCRAPE_INTERVAL so a cycle still ends before the next one is due.
SWEEP_SLICE_BUDGET_MINUTES = 9
SESSION_REFRESH_MINUTES = 60   # Proactive session refresh (was 90 — too long)
WATCHDOG_MAX_STALE_MINUTES = 30  # Exit process if no successful save in this many minutes (launchd restarts)
WATCHDOG_WARMUP_MINUTES = 5    # Grace period after boot before watchdog can kill (prevents boot-loop deaths)
SLOW_CYCLE_THRESHOLD_MINUTES = 20  # Force reconnect if cycle is running >20min and <50% regions done
CONNECT_TIMEOUT_SECONDS = 60   # Hard kill if connect() hangs longer than this (was 90)
MAX_CONSECUTIVE_CONNECT_FAILURES = 10  # After this many, force full venv reimport + session reset

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
# Raised when the fetch tiers are healthy but the PARSER is returning nothing -
# the failure mode that must never be cached, only shouted about.
ERROR_PARSE = 'ERROR_PARSE'

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
    """UPSERT and return the row count PostgREST confirms persisted."""
    BATCH_SIZE = 100
    total_saved = 0
    for i in range(0, len(data), BATCH_SIZE):
        chunk = data[i:i + BATCH_SIZE]
        body = json.dumps(chunk).encode()
        success = False
        for attempt in range(3):
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/{table}',
                data=body, method='POST',
                headers={**SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation'}
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    returned = json.loads(response.read() or b'[]')
                persisted = len(returned) if isinstance(returned, list) else 0
                total_saved += persisted
                if persisted != len(chunk):
                    log.error(
                        f'{ERROR_SUPABASE}: Batch {i//BATCH_SIZE + 1} persistence mismatch: '
                        f'{persisted}/{len(chunk)} rows confirmed')
                success = True
                break
            except urllib.error.HTTPError as e:
                try:
                    detail = e.read().decode('utf-8', 'replace')[:500]
                except Exception:
                    detail = str(e)
                if e.code not in (408, 429) and e.code < 500:
                    log.error(
                        f'{ERROR_SUPABASE}: Batch {i//BATCH_SIZE + 1} permanently rejected '
                        f'(HTTP {e.code}): {detail}')
                    break
                if attempt < 2:
                    log.warning(f'  Batch {i//BATCH_SIZE + 1}: retry {attempt + 1} (HTTP {e.code})')
                    time.sleep(2 ** attempt)
                else:
                    log.error(f'{ERROR_SUPABASE}: Batch {i//BATCH_SIZE + 1} FAILED after 3 retries: {detail}')
            except Exception as e:
                if attempt < 2:
                    log.warning(f'  Batch {i//BATCH_SIZE + 1}: retry {attempt + 1} ({e})')
                    time.sleep(2 ** attempt)
                else:
                    log.error(f'{ERROR_SUPABASE}: Batch {i//BATCH_SIZE + 1} FAILED after 3 retries: {e}')
        if not success:
            continue
    log.info(f'  Upserted {total_saved}/{len(data)} records in {(len(data) + BATCH_SIZE - 1) // BATCH_SIZE} batches')
    return total_saved

def sb_delete(table, query):
    """DELETE from Supabase REST API."""
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}?{query}',
        method='DELETE', headers=SB_HEADERS
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception as e:
        log.error(f'{ERROR_SUPABASE}: DELETE {table}?{query} FAILED: {e}')
        return False

# ============================================================
# POKERATLAS REGION REGISTRY
# ============================================================
# PokerAtlas organizes data by region (city/state).
# URL pattern: /poker-cash-games/{region-slug}

# VALIDATED regions that actually return unique data (not 301 → Las Vegas)
# These 11 regions are the ONLY ones that contain unique games data.
# All other slugs redirect to Las Vegas and waste cycle time.
# Major markets (LA, South FL, CT, MI, PA, etc.) 301→LV — verified 2026-04-06.
# Those venues are covered by the orphan venue system or Bravo direct scraping.
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
]

# Hardcoded fallback list for prominent venues located in regions that PokerAtlas
# does not aggregate into a regional cash-game slug (e.g. Chicago 301s to Vegas)
PA_ORPHAN_VENUES = [
    {
        'slug': 'wind-creek-chicago-southland-hazel-crest',
        'name': 'Wind Creek Chicago Southland',
        'region': 'illinois'
    },
    {
        'slug': 'horseshoe-hammond',
        'name': 'Horseshoe Hammond',
        'region': 'indiana'
    }
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
    # Canada removed — USA only
]

# Track last full discovery time
_last_discovery_date = None

def load_pa_venues():
    """Return ALL PokerAtlas venues from the slug map."""
    slug_map_file = BASE_DIR / 'data' / 'pokeratlas-slug-map.json'
    if not slug_map_file.exists():
        log.error(f'🚨 Slug map missing at {slug_map_file}')
        return []
    try:
        with open(slug_map_file) as f:
            data = json.load(f)
            return data.get('venues', [])
    except Exception as e:
        log.error(f'🚨 Failed to load slug map: {e}')
        return []

# ============================================================
# DATA EXTRACTION
# ============================================================
def extract_games_from_region(html, region_slug, fallback_venue_name=None, source_url=None):
    """Extract cash game CATALOG data from a PokerAtlas region cash-games page.

    Returns data in the SAME structure as Bravo's extract_live_data():
      - live_games: catalog entries for each game a venue spreads
      - waitlist: games with a published players-waiting count
    This ensures both daemons feed identical schemas into venue_live_tables.

    IMPORTANT — PokerAtlas publishes NO live table count on these pages. The
    'Runs:' descriptor is a prose schedule string ('Always', 'Daily',
    'Weekends'), NOT a count of tables currently running. Every game therefore
    carries tables=None (unknown), which is written to the DB as NULL. Only the
    'Players Waiting' figure is an observed real-time value.

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
              <li class="inline-list-item">
                <span class="label">Players Waiting:</span> 5
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

    venues = {}  # venue_name -> { live_games: [...], waitlist: [...] }

    # Split by cash-games-list-item to process each item
    items = re.split(r'<li\s+class="cash-games-list-item\s+cds-item\s*">', html)

    for item in items[1:]:  # Skip first (before the first item)
        # Extract venue name
        venue_match = re.search(
            r'<h2\s+class="venue-name">(.*?)</h2>',
            item, re.DOTALL | re.IGNORECASE
        )
        
        venue_name = ''
        if venue_match:
            venue_name = re.sub(r'<[^>]+>', '', venue_match.group(1)).strip()
        elif fallback_venue_name:
            venue_name = fallback_venue_name
            
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

        # Extract players waiting (if present on the page)
        waiting_match = re.search(
            r'<span\s+class="label">(?:Players\s+)?Wait(?:ing|list)?:?</span>\s*(\d+)',
            item, re.DOTALL | re.IGNORECASE
        )
        players_waiting = 0
        if waiting_match:
            players_waiting = int(waiting_match.group(1))

        # Group by venue — using Bravo-compatible live_games + waitlist structure
        if venue_name not in venues:
            venues[venue_name] = {
                'venue_name': venue_name,
                'venue_slug': re.sub(r'[^a-z0-9]+', '-', venue_name.lower()).strip('-'),
                'region_slug': region_slug,
                'source_url': source_url or f'https://www.pokeratlas.com/poker-cash-games/{region_slug}',
                'scrape_timestamp': now,
                'scrape_html_hash': rhash,
                'live_games': [],
                'waitlist': [],
                '_seen_games': set(),  # Dedup guard for overlapping regions
            }

        # DEDUP: Skip if we already have this game for this venue
        game_key = game_name.lower().strip()
        if game_key in venues[venue_name]['_seen_games']:
            continue
        venues[venue_name]['_seen_games'].add(game_key)

        # CATALOG ENTRY: the page tells us the venue spreads this game and on
        # what schedule ('runs'), but NOT how many tables are running right now.
        # tables=None means "unknown" and is persisted as NULL — never guessed.
        venues[venue_name]['live_games'].append({
            'game': game_name,
            'tables': None,
            'buyin': buyin,
            'runs': runs,
        })

        # Players Waiting IS an observed real-time value when present.
        if players_waiting > 0:
            venues[venue_name]['waitlist'].append({
                'game': game_name,
                'players_waiting': players_waiting,
            })

    # Clean up internal state before returning
    result = []
    for v in venues.values():
        del v['_seen_games']
        result.append(v)

    return result, rhash, now


# NOTE: runs_to_tables() was deleted. It converted the prose 'Runs:' schedule
# descriptor into an invented table count ('Always' -> 3, unknown -> 1) which
# was then published as a live count alongside Bravo's genuine real-time data.
# PokerAtlas region pages do not publish live table counts; there is nothing to
# derive one from. Do not reintroduce it.


# ============================================================
# PAYLOAD BUILDER (mirrors Bravo's build_payload_from_results)
# ============================================================
def build_payload_from_results(venue_results, batch_id):
    """Build Supabase payload from extracted venue data.

    Mirrors Bravo's build_payload_from_results() to ensure consistent
    data structure in venue_live_tables across both sources.

    Logic:
      1. For each catalog game, check waitlist for matching game names
         and attach the observed players_waiting count.
      2. Waitlist-only games (not in live_games) get separate records.
      3. Dedup by game name within each venue.

    PROVENANCE NOTES:
      - tables_running is ALWAYS NULL for source='pokeratlas'. These rows are a
        game catalog (game, buy-in range, run schedule), not a live count.
        Consumers must treat NULL as "unknown", never as zero tables.
      - data_quality='catalog_verified' means the source page was verified but
        the row is catalog availability, not a live table-count observation.
        observation_kind='catalog' makes that distinction machine-readable.
      - The source page URL is not written to the row: venue_live_tables has no
        source_url column and this script must not invent one. It is recorded
        in the per-cycle evidence + snapshot JSON instead.
    """
    payload = []
    for venue_data in venue_results:
        venue_name = venue_data['venue_name']
        venue_slug = venue_data.get('venue_slug') or re.sub(r'[^a-z0-9]+', '-', venue_name.lower()).strip('-')

        # Build waitlist lookup: game_name_lower -> players_waiting
        waitlist_map = {}
        for w in venue_data.get('waitlist', []):
            key = w['game'].lower().strip()
            waitlist_map[key] = w.get('players_waiting', 0)

        seen_games = set()

        # 1. Catalog games — merge observed waitlist counts.
        #    tables_running is written as NULL: PokerAtlas publishes no live
        #    table count, so any number here would be fabricated.
        for game in venue_data.get('live_games', []):
            game_key = game['game'].lower().strip()
            if game_key in seen_games:
                continue
            seen_games.add(game_key)

            players_waiting = waitlist_map.pop(game_key, 0)
            payload.append({
                'venue_name': venue_name,
                'game_name': game['game'],
                'tables_running': None,
                'players_waiting': players_waiting,
                'scrape_timestamp': venue_data['scrape_timestamp'],
                'scrape_html_hash': venue_data['scrape_html_hash'],
                'scrape_batch_id': batch_id,
                'data_quality': QUALITY_CATALOG,
                'observation_kind': OBSERVATION_CATALOG,
                'source': 'pokeratlas',
                'bravo_slug': f'pa-{venue_slug}',
                'buyin_range': game.get('buyin', ''),
                'runs_schedule': game.get('runs', ''),
            })

        # 2. Waitlist-only games (not already matched to a live game)
        for game_key, players_waiting in waitlist_map.items():
            if game_key in seen_games:
                continue
            seen_games.add(game_key)

            # Find the original game name (preserve casing)
            original_name = game_key
            for w in venue_data.get('waitlist', []):
                if w['game'].lower().strip() == game_key:
                    original_name = w['game']
                    break

            payload.append({
                'venue_name': venue_name,
                'game_name': original_name,
                'tables_running': None,
                'players_waiting': players_waiting,
                'scrape_timestamp': venue_data['scrape_timestamp'],
                'scrape_html_hash': venue_data['scrape_html_hash'],
                'scrape_batch_id': batch_id,
                'data_quality': QUALITY_CATALOG,
                'observation_kind': OBSERVATION_CATALOG,
                'source': 'pokeratlas',
                'bravo_slug': f'pa-{venue_slug}',
                'buyin_range': '',
                'runs_schedule': '',
            })

    return payload


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
    except Exception as e:
        # The watchdog reads this file — a silent failure here blinds it.
        log.error(f'Heartbeat write FAILED ({HEARTBEAT_FILE}): {e}')


def write_scraper_metric(cycle_start, outcome, venues_scraped, venues_with_data):
    """Persist a confirmed-output metric, with a pre-migration legacy retry."""
    payload = {
        'source': 'pokeratlas',
        'cycle_start': cycle_start.isoformat(),
        'duration_seconds': int((datetime.now(timezone.utc) - cycle_start).total_seconds()),
        'venues_scraped': max(0, int(venues_scraped or 0)),
        'venues_with_data': max(0, int(venues_with_data or 0)),
        **outcome,
    }

    def _post(row):
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/scraper_metrics',
            data=json.dumps(row).encode(), method='POST',
            headers={**SB_HEADERS, 'Prefer': 'return=minimal'},
        )
        urllib.request.urlopen(req, timeout=10)

    try:
        _post(payload)
        return True
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode('utf-8', 'replace')[:500]
        except Exception:
            detail = str(e)
        if e.code == 400 and any(name in detail for name in (
                'run_status', 'records_attempted', 'records_rejected', 'status_reason')):
            legacy = {k: payload[k] for k in (
                'source', 'cycle_start', 'duration_seconds', 'venues_scraped',
                'venues_with_data', 'errors', 'records_saved')}
            try:
                _post(legacy)
                log.error('  scraper_metrics schema lacks data-truth columns; legacy metric written')
                return False
            except Exception as legacy_err:
                log.error(f'{ERROR_SUPABASE}: scraper_metrics legacy retry FAILED: {legacy_err}')
                return False
        log.error(f'{ERROR_SUPABASE}: scraper_metrics insert FAILED: HTTP {e.code}: {detail}')
        return False
    except Exception as e:
        log.error(f'{ERROR_SUPABASE}: scraper_metrics insert FAILED: {e}')
        return False


# ============================================================
# FALLBACK FETCHERS
# ============================================================
def fallback_fetch_playwright(url, expected_slug=None):
    """Tier 2 fallback: Use Scrapling's PlayWrightFetcher."""
    try:
        from scrapling.fetchers import PlayWrightFetcher
        fetcher = PlayWrightFetcher(headless=True)
        resp = fetcher.fetch(url)
        if resp and resp.status in (404, 410):
            return NO_CASH_PAGE
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
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return NO_CASH_PAGE
        log.debug(f'  Tier-3 failed: HTTP {e.code}')
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
        # Cycles that completed but published nothing. NOT reset by cycle
        # completion — drives the retry backoff so a parser break backs off
        # instead of hammering PokerAtlas every few seconds.
        self.empty_cycle_streak = 0
        self.consecutive_fetch_failures = 0
        self.last_connect_time = None
        self._session_dead = False
        self.tier2_failures = 0

    def connect(self):
        """Establish a new StealthySession.
        
        Protected by CONNECT_TIMEOUT_SECONDS hard-kill timer to prevent
        zombie states when StealthySession.start() hangs.
        Includes network pre-check to avoid wasting browser startup when offline.
        """
        # Self-heal a missing Playwright browser before launching a session.
        # Cheap when present (a path probe); downloads only when genuinely absent.
        if _browser_heal is not None:
            _browser_heal.ensure_browser(log=log.warning)

        from scrapling.fetchers import StealthySession

        self.disconnect()
        _kill_zombie_browsers()

        # Network pre-check — don't waste time on browser if network is down
        if not _network_available():
            log.warning('  ⚠️  Network unavailable — skipping browser launch')
            return False

        log.info('🔌 Establishing new StealthySession...')

        # CRITICAL: Clear asyncio event loop reference before starting Playwright.
        # Playwright Sync API requires NO running event loop in the current thread.
        # threading.Timer callbacks and prior Scrapling calls can leave a dangling
        # loop that triggers "Playwright Sync API inside asyncio loop" errors.
        #
        # Uses new-style asyncio API compatible with Python 3.12+ (no deprecation).
        try:
            import asyncio
            try:
                # Python 3.10+: use get_running_loop to check without deprecation
                loop = asyncio.get_running_loop()
                # If we're inside a running loop, we can't close it — just reset policy
            except RuntimeError:
                # No running loop — safe to close any existing one
                try:
                    loop = asyncio.get_event_loop()
                    if not loop.is_closed():
                        loop.close()
                except RuntimeError:
                    pass  # No event loop at all — perfect
            # Wipe the loop reference — Playwright creates its own
            asyncio.set_event_loop(None)
            asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
        except Exception as e:
            log.debug(f'  Event loop cleanup: {e}')

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
            # Only print full traceback for unexpected errors (not browser launch failures)
            if 'browser' not in str(e).lower() and 'timeout' not in str(e).lower():
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

            if resp.status in (404, 410):
                # Definitive: this venue has no cash-games page. Returned as a
                # sentinel rather than None so fetch_with_fallback stops here
                # instead of spending a Playwright launch and a urllib attempt
                # discovering the same thing twice more.
                return NO_CASH_PAGE

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
        
        Tier 0: Pre-flight reconnect if session is dead
        Tier 1: Primary StealthySession
        Tier 2: PlayWrightFetcher
        Tier 3: Raw urllib
        """
        # === TIER 0: Pre-flight reconnect if session is dead ===
        if self._session_dead or not self.session:
            log.info('  🔄 Session dead — attempting reconnect before fetch')
            if not self.connect():
                # Fall through to Tier 2/3 without a live session
                pass

        # === TIER 1 ===
        if self.session and not self._session_dead:
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
        for f in EVIDENCE_DIR.glob('*.json'):
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
                try:
                    lines = lf.read_text().splitlines()[-1000:]
                    lf.write_text('\n'.join(lines) + '\n')
                    count += 1
                except Exception:
                    pass
        if count:
            log.info(f'  \U0001f9f9 Cleaned up {count} log files (>14 days old / truncated)')
    except Exception as e:
        log.debug(f'  Log cleanup error: {e}')


# ============================================================
# HISTORICAL SNAPSHOT: Save per-cycle venue summary for trending
# ============================================================
def save_history_snapshot(batch_id, all_venues):
    """Insert a summary row per venue into venue_live_history for trending.

    Returns True on success, False on failure. Failures are logged at ERROR —
    this table feeds /api/poker/peak-activity and /api/poker/game-trends, so a
    silent loss here quietly empties those surfaces.

    total_tables is NULL for PokerAtlas: the source has no live table count.
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for vdata in all_venues:
            total_waiting = sum(w['players_waiting'] for w in vdata['waitlist'])
            venue_slug = vdata.get('venue_slug') or re.sub(r'[^a-z0-9]+', '-', vdata['venue_name'].lower()).strip('-')
            rows.append({
                'bravo_slug': f'pa-{venue_slug}',
                'venue_name': vdata['venue_name'],
                'total_tables': None,
                'total_waiting': total_waiting,
                'game_count': len(vdata['live_games']),
                'source': 'pokeratlas',
                'observation_kind': OBSERVATION_CATALOG,
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
            log.info(f'  \U0001f4ca Saved {len(rows)} history snapshots')
            return True
        except Exception as e:
            log.error(f'{ERROR_SUPABASE}: venue_live_history insert FAILED ({len(rows)} rows lost): {e}')
            return False
    except Exception as e:
        log.error(f'History snapshot error (rows lost): {e}')
        return False


# ============================================================
# GAME-LEVEL HISTORICAL SNAPSHOT: Per-game rows for heatmaps/predictions
# ============================================================
def save_game_history_snapshot(batch_id, all_venues):
    """Insert per-game rows into game_live_history for game-type heatmaps.
    
    This is ADDITIVE — writes to a separate table (game_live_history)
    and never touches venue_live_history.
    Uses same live_games + waitlist structure as Bravo.

    Returns True on success, False on failure (logged at ERROR — this table
    feeds the heatmap/prediction endpoints).

    tables is NULL for PokerAtlas: the source publishes no live table count.
    waiting is taken from the venue's waitlist map so running games no longer
    record a hardcoded 0.
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for vdata in all_venues:
            venue_slug = vdata.get('venue_slug') or re.sub(r'[^a-z0-9]+', '-', vdata['venue_name'].lower()).strip('-')
            # Same waitlist map build as build_payload_from_results()
            waitlist_map = {}
            for w in vdata.get('waitlist', []):
                waitlist_map[w['game'].lower().strip()] = w.get('players_waiting', 0)
            for game in vdata['live_games']:
                rows.append({
                    'bravo_slug': f'pa-{venue_slug}',
                    'venue_name': vdata['venue_name'],
                    'game_type': game['game'],
                    'stakes': game.get('buyin', ''),
                    'tables': None,
                    'waiting': waitlist_map.get(game['game'].lower().strip(), 0),
                    'source': 'pokeratlas',
                    'observation_kind': OBSERVATION_CATALOG,
                    'snapshot_time': now,
                    'batch_id': batch_id,
                })
            # Include waitlist-only games (not already in live_games)
            live_names = [g['game'].lower().strip() for g in vdata['live_games']]
            for w in vdata['waitlist']:
                if w['game'].lower().strip() not in live_names:
                    rows.append({
                        'bravo_slug': f'pa-{venue_slug}',
                        'venue_name': vdata['venue_name'],
                        'game_type': w['game'],
                        'stakes': '',
                        'tables': None,
                        'waiting': w['players_waiting'],
                        'source': 'pokeratlas',
                        'observation_kind': OBSERVATION_CATALOG,
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
            log.info(f'  📊 Saved {len(rows)} game history rows')
            return True
        except Exception as e:
            log.error(f'{ERROR_SUPABASE}: game_live_history insert FAILED ({len(rows)} rows lost): {e}')
            return False
    except Exception as e:
        log.error(f'Game history snapshot error (rows lost): {e}')
        return False


# ============================================================
# REGION SLUG AUTO-DISCOVERY
# ============================================================
def discover_regions(mgr):
    """Daily discovery pass: scrape ALL regions to detect new data sources.
    
    Runs once per day. Saves any newly discovered valid regions to a cache file
    so they get included in the fast primary loop.
    
    HARDENED: Reconnects session on dead browser context and aborts after
    MAX_DISCOVERY_FAILS consecutive failures to prevent 30+ doomed iterations.
    """
    global _last_discovery_date
    # UTC day key so the discovery boundary matches the data timestamps.
    today = datetime.now(timezone.utc).strftime('%Y%m%d')

    # Only run once per day. The marker is set AFTER a pass completes, so an
    # aborted pass is retried on the next cycle instead of being skipped
    # until tomorrow.
    if _last_discovery_date == today:
        return

    log.info('\U0001f4e1 Running daily discovery pass (all regions)...')
    new_valid = []
    aborted = False
    consecutive_discovery_fails = 0
    MAX_DISCOVERY_FAILS = 3  # Abort discovery after this many consecutive failures

    for slug in PA_ALL_REGION_SLUGS:
        if slug in PA_VALIDATED_REGIONS:
            continue  # Already in primary list

        # ABORT GUARD: Stop wasting cycles on a dead session
        if consecutive_discovery_fails >= MAX_DISCOVERY_FAILS:
            log.warning(f'  ⚠️  Discovery aborted: {consecutive_discovery_fails} consecutive failures')
            aborted = True
            break

        # SESSION RECOVERY: Reconnect if session died during discovery
        if mgr._session_dead or not mgr.session:
            log.info('  🔄 Session dead during discovery — reconnecting...')
            if not mgr.connect():
                log.warning('  ⚠️  Discovery aborted: session reconnect failed')
                aborted = True
                break

        url = f'https://www.pokeratlas.com/poker-cash-games/{slug}'
        html = mgr.fetch_with_fallback(url, expected_slug=slug)

        if html and html != 'REDIRECT':
            venues, _, _ = extract_games_from_region(html, slug, source_url=url)
            if venues:
                new_valid.append(slug)
                log.info(f'  \U0001f4a1 NEW valid region: {slug} ({len(venues)} venues)')
            consecutive_discovery_fails = 0  # Reset on successful fetch
        elif html is None:
            consecutive_discovery_fails += 1
        else:
            consecutive_discovery_fails = 0  # REDIRECT is a valid response

        time.sleep(RATE_LIMIT_DELAY)

    if not aborted:
        _last_discovery_date = today

    if new_valid:
        log.info(f'  Discovered {len(new_valid)} new valid regions: {new_valid}')
        discovery_file = BASE_DIR / 'data' / 'pokeratlas-discovered-regions.json'
        # MERGE with previously discovered regions — a partial pass must never
        # drop regions that an earlier pass validated.
        previous = []
        try:
            if discovery_file.exists():
                with open(discovery_file) as f:
                    previous = json.load(f).get('extra_validated', []) or []
        except Exception as e:
            log.warning(f'  Could not read existing discovery cache (starting from new results only): {e}')
        merged = list(dict.fromkeys(list(previous) + new_valid))
        try:
            with open(discovery_file, 'w') as f:
                json.dump({
                    'discovered': today,
                    'partial': aborted,
                    'extra_validated': merged,
                }, f, indent=2)
        except Exception as e:
            log.error(f'  Discovery cache write FAILED — new regions {new_valid} not persisted: {e}')
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
        
        # Exponential Backoff natively applied on EVERY failure
        import random
        base_delays = [5, 15, 45, 120, 300]
        # Map failure 1 to index 0 (5s), clamp at index 4 (300s)
        idx = min(max(0, mgr.consecutive_failures - 1), len(base_delays) - 1)
        backoff = int(base_delays[idx] * random.uniform(0.9, 1.1))
        
        log.error(f'🚨 {mgr.consecutive_failures} consecutive failures — applying stealth backoff ({backoff}s)')
        time.sleep(backoff)
        return 0

    # Connected — publish a watchdog-healthy status so a slow boot (browser
    # launch + 11 region fetches) is not mistaken for a hung 'starting' daemon
    # and restarted mid-cycle.
    write_heartbeat('running', {
        'cycle': mgr.total_cycles + 1,
        'phase': 'scraping',
        'consecutive_failures': mgr.consecutive_failures,
    })

    # Load all venues from slug map
    map_venues = load_pa_venues()
    log.info(f'Loaded {len(map_venues)} venues from slug map...')

    # Fast 404 cache to skip venues without cash games
    cache_file = BASE_DIR / 'data' / 'pokeratlas-nocash-venues.json'
    import time
    now_ts = time.time()
    nocash_cache = {}
    if cache_file.exists():
        try:
            with open(cache_file) as f:
                nocash_cache = json.load(f)
        except Exception:
            pass

    # ── RESUME CURSOR ─────────────────────────────────────────────────────
    # A full sweep does not fit in one cycle, so it is walked across cycles.
    # Without this the cycle restarted at venue 0 every 15 minutes, was aborted
    # by the slow-cycle watchdog around venue ~250, and never reached the rest
    # of the estate at all - which also meant the no-cash cache it depends on
    # could never finish warming up. Measured on the live daemon 2026-08-29:
    # the old region sweep published 148 venues in 90 seconds; the venue sweep
    # was 7.5 minutes in and still inside California.
    sweep_file = BASE_DIR / 'data' / 'pokeratlas-sweep-state.json'
    sweep_state = {}
    if sweep_file.exists():
        try:
            with open(sweep_file) as f:
                sweep_state = json.load(f)
        except Exception:
            sweep_state = {}
    start_at = int(sweep_state.get('cursor') or 0)
    if start_at >= len(map_venues):
        start_at = 0
    # Every partial pass of one sweep is remembered, because the stale-row
    # delete at the end must not remove rows written by an EARLIER pass of the
    # sweep that is still in progress.
    sweep_batch_ids = list(sweep_state.get('batch_ids') or [])
    if start_at == 0:
        sweep_batch_ids = []
    sweep_batch_ids.append(batch_id)

    venues_to_scrape = map_venues
    cached_skips = sum(1 for v in map_venues if now_ts - nocash_cache.get(v['slug'], 0) < 7 * 86400)
    log.info(
        f'Scraping {len(venues_to_scrape)} venues from #{start_at} '
        f'({cached_skips} currently no-cash cached, {len(venues_to_scrape) - cached_skips} to fetch, '
        f'pass {len(sweep_batch_ids)} of this sweep)...'
    )

    all_venues = []
    errors = 0
    skipped = 0
    # fetch_ok MEANS: we retrieved a real venue page and ran the parser over it.
    # It is the guard on the destructive stale-row deletion at the end of this
    # function, so it must NOT count a redirect or a missing page. It used to:
    # `fetch_ok += 1` fired on the REDIRECT branch, which meant a cycle where
    # PokerAtlas redirected all 710 venues reported 710 successful fetches and
    # zero parsed venues - and the cleanup then deleted every PokerAtlas row in
    # venue_live_tables, because the one condition written to prevent exactly
    # that ("cannot distinguish outage from empty") had been satisfied by
    # responses that never contained a venue page at all.
    fetch_ok = 0
    no_page = 0           # definitive 404/410/redirect - an answer, not a page
    parsed_empty = 0
    # Buffered rather than written straight to the cache: see the commit at the
    # end of the loop.
    empty_slugs = []

    consecutive_region_failures = 0
    # False whenever the loop stops before the END of the venue list. It gates
    # the destructive stale-row delete below: a pass that covered venues 0-250
    # must never delete the rows for 251-709, which it simply has not visited.
    sweep_complete = True
    next_cursor = 0
    for idx_off, v in enumerate(venues_to_scrape[start_at:]):
        i = start_at + idx_off
        if consecutive_region_failures >= CIRCUIT_BREAKER_THRESHOLD:
            log.error(f'🔴 CIRCUIT BREAKER: {consecutive_region_failures} consecutive failures — aborting cycle, forcing reconnect')
            mgr._session_dead = True
            sweep_complete = False
            next_cursor = i
            break

        # TIME BUDGET: save our place and hand the rest to the next cycle.
        # Checked before the fetch so the cursor always points at a venue that
        # has NOT been done, never at one done twice.
        if (datetime.now(timezone.utc) - cycle_start).total_seconds() / 60 >= SWEEP_SLICE_BUDGET_MINUTES:
            log.info(
                f'⏸️  Slice budget reached at venue {i}/{len(venues_to_scrape)} — '
                f'saving cursor, the next cycle resumes here'
            )
            sweep_complete = False
            next_cursor = i
            break

        elapsed_cycle_min = (datetime.now(timezone.utc) - cycle_start).total_seconds() / 60
        progress_pct = (i / len(venues_to_scrape)) if venues_to_scrape else 1.0
        if elapsed_cycle_min > SLOW_CYCLE_THRESHOLD_MINUTES and progress_pct < 0.5:
            log.warning(
                f'⏱️  SLOW-CYCLE WATCHDOG: {elapsed_cycle_min:.0f}min elapsed, '
                f'only {i}/{len(venues_to_scrape)} venues done ({progress_pct:.0%}). '
                f'Forcing session reconnect.'
            )
            mgr._session_dead = True
            sweep_complete = False
            next_cursor = i
            break
            
        slug = v['slug']
        
        # Check cache (expire after 7 days)
        if slug in nocash_cache:
            if now_ts - nocash_cache[slug] < 7 * 86400:
                skipped += 1
                continue
            else:
                del nocash_cache[slug]

        url = f'https://www.pokeratlas.com/poker-room/{slug}/cash-games'
        html = mgr.fetch_with_fallback(url, expected_slug=slug)

        if html == 'REDIRECT' or html == NO_CASH_PAGE:
            # A definitive "no cash games here". Cacheable, and NOT a failure -
            # so it clears the circuit breaker. It is deliberately not counted
            # as a successful fetch: no venue page was parsed, so it is no
            # evidence that the parser still works.
            nocash_cache[slug] = now_ts
            skipped += 1
            no_page += 1
            consecutive_region_failures = 0
            continue

        if html is None:
            log.error(f'  ❌ All tiers failed for {slug}')
            consecutive_region_failures += 1
            errors += 1
            continue

        fetch_ok += 1
        consecutive_region_failures = 0

        region_slug = 'unknown'
        if v.get('discovered_from'):
            region_slug = v['discovered_from'].split('/')[-1]

        venues, rhash, _ = extract_games_from_region(html, region_slug, fallback_venue_name=v['name'], source_url=url)
        
        
        if not venues:
            # BUFFERED, not cached. Writing this straight into a 7-day cache
            # meant one bad cycle could silence the whole estate: if PokerAtlas
            # changes its markup, every venue parses to zero, all 710 slugs are
            # written as "no cash games", and the daemon then skips all of them
            # for a week while reporting success. Committed below only if the
            # empty rate is plausible.
            parsed_empty += 1
            empty_slugs.append(slug)
        else:
            all_venues.extend(venues)
            if slug in nocash_cache:
                del nocash_cache[slug]
                
        time.sleep(RATE_LIMIT_DELAY)
        if (i + 1) % 50 == 0:
            log.info(f'  --- {i+1}/{len(venues_to_scrape)} | {len(all_venues)} venues | {errors} errors ---')

    # ── PERSIST THE CURSOR ────────────────────────────────────────────────
    # A completed sweep resets to 0 and drops its batch-id list, so the next
    # sweep starts clean.
    try:
        with open(sweep_file, 'w') as f:
            json.dump(
                {
                    'cursor': 0 if sweep_complete else next_cursor,
                    'batch_ids': [] if sweep_complete else sweep_batch_ids,
                    'updated': datetime.now(timezone.utc).isoformat(),
                },
                f,
            )
    except Exception as e:
        log.warning(f'  Sweep cursor not saved ({e}) - next cycle restarts the sweep')

    if sweep_complete:
        log.info(f'✅ Sweep COMPLETE — all {len(venues_to_scrape)} venues visited across {len(sweep_batch_ids)} pass(es)')
    else:
        log.info(f'⏸️  Sweep INCOMPLETE — resuming at venue {next_cursor}/{len(venues_to_scrape)} next cycle')

    # ── COMMIT THE NO-CASH CACHE ──────────────────────────────────────────
    # A venue that fetched fine but parsed to zero games is only cached when
    # the cycle as a whole looks healthy. If most of what we retrieved came
    # back empty, the parser is broken - caching that would convert a bug we
    # would notice today into silence lasting a week.
    empty_rate = (parsed_empty / fetch_ok) if fetch_ok else 0.0
    if fetch_ok and empty_rate >= EMPTY_PARSE_POISON_THRESHOLD:
        log.error(
            f'{ERROR_PARSE}: {parsed_empty}/{fetch_ok} retrieved venues parsed to ZERO games '
            f'({empty_rate:.0%}). That is a parser break, not {parsed_empty} venues closing at '
            f'once - NOT caching them, so the next cycle retries instead of skipping them '
            f'for 7 days.'
        )
    else:
        for slug in empty_slugs:
            nocash_cache[slug] = now_ts

    try:
        with open(cache_file, 'w') as f:
            json.dump(nocash_cache, f)
    except Exception as e:
        log.warning(f'  No-cash cache not saved ({e}) - next cycle re-fetches everything')
        
    # Build Supabase payload — using Bravo-compatible build_payload_from_results()
    log.info(f'💾 Saving {len(all_venues)} venue records to Supabase...')

    # DEDUPLICATION: 3-tier match to catch name variations
    # Tier 1: Exact venue name match
    # Tier 2: Normalized alphanum match  (handles punctuation, spacing)
    # Tier 3: Slug word-overlap >= 70%   (handles "MGM Grand" vs "MGM Grand Las Vegas")
    bravo_names = set()
    bravo_names_normalized = set()
    bravo_slug_wordsets = []  # List of (slug, frozenset_of_words)
    dedup_index_ok = False
    try:
        # PAGINATE to exhaustion. venue_live_tables holds one row per
        # venue+game, so a flat limit=5000 truncated the index to a few hundred
        # venues and silently degraded dedup coverage.
        PAGE = 1000
        MAX_PAGES = 50
        bravo_rows = []
        for page in range(MAX_PAGES):
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/venue_live_tables'
                f'?source=eq.bravo&select=venue_name,bravo_slug,observation_kind,scrape_batch_id'
                f'&order=bravo_slug.asc&limit={PAGE}&offset={page * PAGE}',
                headers=SB_HEADERS,
            )
            resp = urllib.request.urlopen(req, timeout=20)
            chunk = json.loads(resp.read())
            bravo_rows.extend(chunk)
            if len(chunk) < PAGE:
                break
        else:
            log.warning(f'  Dedup: hit {MAX_PAGES * PAGE}-row page ceiling — index may be partial')

        # Only genuinely observed Bravo rows suppress PokerAtlas catalog data.
        # Legacy and current simulator rows retain source='bravo' for consumer
        # compatibility, so source alone is not an evidence boundary.
        observed_bravo_rows = [r for r in bravo_rows if is_observed_bravo_row(r)]
        modeled_excluded = len(bravo_rows) - len(observed_bravo_rows)
        for r in observed_bravo_rows:
            name = r.get('venue_name', '') or ''
            slug = r.get('bravo_slug', '') or ''
            bravo_names.add(name)
            bravo_names_normalized.add(re.sub(r'[^a-z0-9]', '', name.lower()))
            if slug:
                words = frozenset(w for w in slug.replace('-', ' ').split() if len(w) > 2)
                if words:
                    bravo_slug_wordsets.append(words)
        dedup_index_ok = True
        log.info(
            f'  Dedup: {len(bravo_names)} observed Bravo venues loaded from '
            f'{len(observed_bravo_rows)} rows ({modeled_excluded} modeled rows excluded; '
            f'3-tier match active)'
        )
    except Exception as e:
        # FAIL CLOSED: with an empty index every PokerAtlas venue looks unique,
        # so venues Bravo already covers get published twice and merge into
        # double-counted games downstream. Abort the write instead.
        log.error(f'{ERROR_SUPABASE}: Dedup index load FAILED — skipping upsert this cycle: {e}')

    # Tier 2.5 preparation: Build suffix-stripped variants for each Bravo name
    # PA often appends "Casino", "Resort", "Hotel" to names Bravo keeps short
    _SUFFIX_WORDS = {'casino', 'resort', 'hotel', 'spa', 'club', 'room', 'lounge'}
    bravo_names_stripped = set()
    for bn in bravo_names:
        stripped = re.sub(r'[^a-z0-9 ]', '', bn.lower())
        words = [w for w in stripped.split() if w not in _SUFFIX_WORDS]
        if words:
            bravo_names_stripped.add(''.join(words))

    def _is_bravo_duplicate(venue_name):
        """Check if a PokerAtlas venue is already covered by Bravo (4-tier)."""
        # Tier 1: Exact name
        if venue_name in bravo_names:
            return True, 'exact'
        # Tier 2: Normalized alphanum
        normalized = re.sub(r'[^a-z0-9]', '', venue_name.lower())
        if normalized in bravo_names_normalized:
            return True, 'normalized'
        # Tier 2.5: Suffix-stripped match (PA "Bellagio Casino" → Bravo "Bellagio")
        stripped = re.sub(r'[^a-z0-9 ]', '', venue_name.lower())
        words = [w for w in stripped.split() if w not in _SUFFIX_WORDS]
        if words:
            stripped_key = ''.join(words)
            if stripped_key in bravo_names_stripped:
                return True, 'suffix-stripped'
        # Tier 3: Slug word-overlap >= 70%
        pa_words = frozenset(w for w in re.sub(r'[^a-z0-9 ]', '', venue_name.lower()).split() if len(w) > 2)
        if pa_words and bravo_slug_wordsets:
            for bravo_words in bravo_slug_wordsets:
                if not bravo_words:
                    continue
                overlap = len(pa_words & bravo_words)
                pct = overlap / max(len(pa_words), len(bravo_words))
                if pct >= 0.70:
                    return True, f'slug-overlap({pct:.0%})'
        return False, None

    # Filter out venues that already have Bravo data
    filtered_venues = []
    skipped_dupes = 0
    for venue_data in all_venues:
        is_dupe, match_tier = _is_bravo_duplicate(venue_data['venue_name'])
        if is_dupe:
            skipped_dupes += 1
            if skipped_dupes <= 5:
                log.debug(f'  Dedup: Skipping "{venue_data["venue_name"]}" [{match_tier}]')
            continue
        filtered_venues.append(venue_data)

    if skipped_dupes:
        log.info(f'  Dedup: Skipped {skipped_dupes} venues (already in Bravo)')


    payload = build_payload_from_results(filtered_venues, batch_id)

    saved = 0
    write_blocked = False       # True when we must not touch published rows
    history_failures = 0
    metrics_failed = False
    stale_cleanup_ok = None

    if not dedup_index_ok:
        # Publishing without the Bravo index would duplicate venues that Bravo
        # already covers with real table counts.
        log.error(
            f'{ERROR_SUPABASE}: Skipping venue_live_tables write — Bravo dedup index '
            f'unavailable ({len(all_venues)} venues held back this cycle)'
        )
        write_blocked = True
    elif payload:
        # Atomic Batch Insert — only delete PokerAtlas records
        saved = sb_upsert('venue_live_tables', payload)
        if saved == len(payload):
            # Save historical snapshot for trend analysis
            if not save_history_snapshot(batch_id, filtered_venues):
                history_failures += 1
            # Save per-game history for game-type heatmaps
            if not save_game_history_snapshot(batch_id, filtered_venues):
                history_failures += 1
        elif saved == 0:
            log.error(
                f'{ERROR_SUPABASE}: venue_live_tables upsert FAILED — '
                f'{len(payload)} records NOT saved; leaving previous batch in place'
            )
            write_blocked = True
        else:
            log.error(
                f'{ERROR_SUPABASE}: venue_live_tables PARTIAL WRITE — '
                f'{saved}/{len(payload)} records confirmed; leaving previous batch in place'
            )
            write_blocked = True
    else:
        log.error(
            f'🧨 EMPTY PAYLOAD: {len(all_venues)} venues parsed, {len(filtered_venues)} after dedup, '
            f'0 records to publish (fetch_ok={fetch_ok}, no_page={no_page}, '
            f'parse_alerts={parsed_empty}). '
            f'Stale PokerAtlas rows will be cleared so they are not served as current '
            f'— IF this sweep completed; a partial pass keeps them (see below).'
        )

    # ── STALE-ROW DEACTIVATION ────────────────────────────────────────────
    # Runs on ANY cycle where pages were fetched successfully and the write
    # path was not blocked — including cycles that parsed nothing. Previously
    # this was nested inside `if payload:` + `if sb_upsert(...)`, so a parser
    # break left the last good batch published for another 24 hours.
    if not sweep_complete:
        # THE PARTIAL-SWEEP GUARD. The delete below removes every PokerAtlas
        # row that is not in this sweep - so running it after a pass that
        # covered venues 0-250 would delete 251-709, which were never visited.
        # With the sweep now walked across cycles this is the NORMAL state for
        # most cycles, not an error: rows are refreshed by upsert as each pass
        # reaches them, and nothing is removed until a full sweep has been
        # seen. Stale data beats deleted data, and it is visible.
        log.info(
            f'  Stale cleanup deferred: sweep incomplete '
            f'({next_cursor}/{len(venues_to_scrape)} visited) - rows for venues not yet '
            f'reached this sweep are kept'
        )
    elif write_blocked:
        log.warning('  Stale cleanup skipped: write blocked this cycle (previous rows kept)')
    elif fetch_ok == 0:
        # fetch_ok counts venue pages we actually RETRIEVED AND PARSED. A cycle
        # made entirely of redirects and missing pages lands here and keeps the
        # last good catalogue, which is the whole point of this guard: with
        # redirects previously counted as successful fetches, a site-wide
        # redirect would have satisfied it and deleted every PokerAtlas row in
        # venue_live_tables.
        log.warning(
            f'  Stale cleanup skipped: zero venue pages retrieved this cycle '
            f'(no_page={no_page}, errors={errors}) - cannot distinguish outage from empty, '
            f'previous rows kept'
        )
    else:
        # Scoped to the WHOLE sweep, not this one pass. A sweep is several
        # passes with different batch ids, and `neq.{batch_id}` would have
        # deleted the rows written by every earlier pass of the sweep that just
        # completed - emptying the catalogue down to the final slice.
        _ids = ','.join(sweep_batch_ids)
        stale_cleanup_ok = sb_delete(
            'venue_live_tables', f'scrape_batch_id=not.in.({_ids})&source=eq.pokeratlas'
        )
        if stale_cleanup_ok:
            log.info('  🧹 Stale PokerAtlas rows cleared (previous batches)')
        else:
            log.error(
                f'{ERROR_SUPABASE}: Stale-row cleanup FAILED — venue_live_tables may now '
                f'serve duplicate/stale PokerAtlas rows for batch != {batch_id[:8]}'
            )

    attempted = len(payload)
    rejected = max(0, attempted - saved)
    integrity_errors = errors + history_failures
    if write_blocked:
        integrity_errors += 1
    if stale_cleanup_ok is False:
        integrity_errors += 1

    valid_empty_reason = None
    if attempted == 0 and integrity_errors == 0:
        if all_venues and not filtered_venues:
            valid_empty_reason = 'all_catalog_venues_already_covered_by_observed_bravo'
        elif no_page > 0 and fetch_ok == 0 and parsed_empty == 0:
            valid_empty_reason = 'all_checked_venues_confirmed_no_cash_games_page'

    outcome = classify_persisted_run(
        attempted=attempted,
        persisted=saved,
        rejected=rejected,
        errors=integrity_errors,
        valid_empty=bool(valid_empty_reason),
        status_reason=valid_empty_reason or '',
    )

    # Save evidence
    evidence = {
        'batch_id': batch_id,
        'scrape_timestamp': cycle_start.isoformat(),
        'source': 'pokeratlas',
        'source_urls': sorted({v.get('source_url') for v in all_venues if v.get('source_url')}),
        'regions_scraped': len(venues_to_scrape),
        'venues_with_data': len(all_venues),
        'regions_skipped': skipped,
        'fetch_ok': fetch_ok,
        'no_page': no_page,
        'parse_alerts': parsed_empty,
        'total_records_saved': saved,
        'write_blocked': write_blocked,
        'stale_cleanup_ok': stale_cleanup_ok,
        'history_insert_failures': history_failures,
        'errors': errors,
        **outcome,
        'duration_seconds': (datetime.now(timezone.utc) - cycle_start).total_seconds(),
    }
    evidence_file = EVIDENCE_DIR / f'pokeratlas_live_{cycle_start.strftime("%Y%m%d_%H%M%S")}.json'
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)

    # Save confirmed-output metrics to Supabase for monitoring dashboard.
    try:
        if write_scraper_metric(
                cycle_start, outcome,
                fetch_ok + no_page + errors,
                len(filtered_venues)):
            log.info('  📈 Scraper metrics recorded')
        else:
            metrics_failed = True
    except Exception as e:
        metrics_failed = True
        log.warning(f'{ERROR_SUPABASE}: scraper_metrics insert threw: {e}')

    # Snapshot
    with open(BASE_DIR / 'data' / 'pokeratlas-live-snapshot.json', 'w') as f:
        json.dump({
            'metadata': evidence,
            'venues': [{
                'venue_name': v['venue_name'],
                'region': v['region_slug'],
                'source_url': v.get('source_url'),
                'live_games': v['live_games'],
                'waitlist': v['waitlist'],
            } for v in all_venues],
        }, f, indent=2, default=str)

    duration = (datetime.now(timezone.utc) - cycle_start).total_seconds()
    mgr.total_cycles += 1
    if outcome['run_status'] in (RUN_FAILED, RUN_PARTIAL):
        mgr.consecutive_failures += 1
    else:
        mgr.consecutive_failures = 0
    # Empty cycles must NOT reset this — it drives the retry backoff so a
    # broken parser cannot re-scrape every ~5 seconds forever.
    if saved > 0 or outcome['run_status'] == 'valid_empty':
        mgr.empty_cycle_streak = 0
    else:
        mgr.empty_cycle_streak += 1

    # Heartbeat status contract with scraper-watchdog-local.sh:
    #   'ok'          → healthy, data published
    #   'idle'        → explicitly proven valid-empty; never a parser default.
    #   'degraded'    → some output persisted but the run was incomplete.
    #   'no_output'   → zero persisted rows without a valid-empty proof.
    #   'save_failed' → write path broken; needs attention (and a restart is
    #                   at least harmless).
    if outcome['run_status'] == RUN_FAILED:
        hb_status = 'save_failed'
        if not write_blocked:
            hb_status = 'no_output'
    elif outcome['run_status'] == RUN_PARTIAL:
        hb_status = 'degraded'
    elif outcome['run_status'] == 'valid_empty':
        hb_status = 'idle'
    else:
        hb_status = 'ok'

    write_heartbeat(hb_status, {
        'cycle': mgr.total_cycles,
        'records_saved': saved,
        'records_attempted': attempted,
        'records_rejected': rejected,
        'run_status': outcome['run_status'],
        'status_reason': outcome['status_reason'],
        'valid_empty': outcome['run_status'] == 'valid_empty',
        'venues_with_data': len(all_venues),
        'errors': integrity_errors,
        'consecutive_failures': mgr.consecutive_failures,
        'empty_cycle_streak': mgr.empty_cycle_streak,
        'parser_alert': parsed_empty > 0 or (fetch_ok > 0 and not all_venues),
        'parse_alerts': parsed_empty,
        'fetch_ok': fetch_ok,
        'no_page': no_page,
        'write_blocked': write_blocked,
        'stale_cleanup_ok': stale_cleanup_ok,
        'history_insert_failed': history_failures,
        'metrics_insert_failed': metrics_failed,
        'duration_seconds': round(duration),
        'regions_scraped': len(venues_to_scrape),
    })

    log.info(
        f'=== CYCLE #{mgr.total_cycles} COMPLETE | {len(all_venues)} venues | '
        f'{saved} records | {duration:.0f}s | Errors: {errors} ==='
    )

    # Run daily discovery AFTER validated scrape (so real data gets published first).
    # Gated on a successful publish OR a clean-but-empty cycle, so discovery is
    # not permanently blocked while a region set legitimately yields nothing.
    if outcome['run_status'] in ('success', 'valid_empty'):
        discover_regions(mgr)

    # Return records actually WRITTEN, not venues parsed. main() treats the
    # return value as "successful save" for the staleness watchdog; returning
    # the parse count meant a total Supabase outage never tripped it.
    return saved

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
    """Kill orphaned browser processes that belong to THIS daemon.
    
    IMPORTANT: Only kills processes in our own process tree. Previous versions
    used `pgrep -f chromium` which killed ALL browser processes, including 
    the OTHER daemon's live browser — causing cascading context-dead errors.
    
    Now uses `pgrep -P <our_pid>` to scope kills to our own children.
    """
    my_pid = os.getpid()
    killed = 0
    
    def _kill_tree(parent_pid):
        """Recursively kill all children of a process."""
        nonlocal killed
        try:
            result = subprocess.run(
                ['pgrep', '-P', str(parent_pid)],
                capture_output=True, text=True, timeout=5
            )
            if result.stdout.strip():
                child_pids = [int(p) for p in result.stdout.strip().split('\n') if p.strip()]
                for cpid in child_pids:
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
    """Force-exit the process when connect() hangs."""
    log.error(f'🚨 HARD KILL: {reason}')
    write_heartbeat('hard_kill', {'reason': reason})
    _kill_zombie_browsers()
    os._exit(1)


def main():
    write_heartbeat('starting')
    log.info('=' * 60)
    log.info('POKER ATLAS LIVE GAMES — AUTONOMOUS DAEMON v3.2')
    log.info(f'Interval: {SCRAPE_INTERVAL}s ({SCRAPE_INTERVAL // 60}min)')
    log.info(f'Strategy: session.fetch() per region (no login needed)')
    log.info(f'Data: game catalog + buy-in + run schedule')
    log.info(f'Watchdog: exit after {WATCHDOG_MAX_STALE_MINUTES}min (warmup: {WATCHDOG_WARMUP_MINUTES}min)')
    log.info(f'Connect timeout: {CONNECT_TIMEOUT_SECONDS}s hard-kill')
    log.info(f'Max connect failures before full reset: {MAX_CONSECUTIVE_CONNECT_FAILURES}')
    log.info(f'Log dir: {LOG_DIR}')
    log.info('=' * 60)

    mgr = PokerAtlasSessionManager()
    daemon_boot_time = time.time()  # Track when daemon started
    last_successful_save = time.time()  # Assume fresh at boot

    while running:
        # ── GLOBAL WATCHDOG: Check wall-clock time BEFORE entering scrape ──
        # WARMUP GUARD: Don't kill the daemon during its initial boot period.
        # This prevents boot-loop deaths where: launchd restart → connect fails
        # once → watchdog sees stale_minutes from PREVIOUS run → immediate kill.
        uptime_minutes = (time.time() - daemon_boot_time) / 60
        stale_minutes = (time.time() - last_successful_save) / 60
        if stale_minutes >= WATCHDOG_MAX_STALE_MINUTES and uptime_minutes >= WATCHDOG_WARMUP_MINUTES:
            log.error(
                f'🚨 WATCHDOG: No successful data save in {stale_minutes:.0f} minutes '
                f'(threshold: {WATCHDOG_MAX_STALE_MINUTES}min, uptime: {uptime_minutes:.0f}min). '
                f'Exiting so launchd can restart with a clean process.'
            )
            write_heartbeat('watchdog_exit', {
                'stale_minutes': round(stale_minutes),
                'uptime_minutes': round(uptime_minutes),
                'consecutive_failures': mgr.consecutive_failures,
            })
            mgr.disconnect()
            _kill_zombie_browsers()
            sys.exit(1)
        elif stale_minutes >= WATCHDOG_MAX_STALE_MINUTES:
            log.info(
                f'⏳ Watchdog: {stale_minutes:.0f}min stale but still in warmup '
                f'({uptime_minutes:.0f}/{WATCHDOG_WARMUP_MINUTES}min) — continuing'
            )

        # ── SELF-HEALING: After too many consecutive connect failures,
        # force a full cleanup — kill zombies, sleep longer, then retry fresh
        if mgr.consecutive_failures >= MAX_CONSECUTIVE_CONNECT_FAILURES:
            log.warning(
                f'🔧 SELF-HEAL: {mgr.consecutive_failures} consecutive failures '
                f'(threshold: {MAX_CONSECUTIVE_CONNECT_FAILURES}). '
                f'Full cleanup + extended backoff...'
            )
            mgr.disconnect()
            _kill_zombie_browsers()
            mgr.consecutive_failures = 0  # Reset counter to break death spiral
            mgr.tier2_failures = 0  # Reset tier2 counter too
            write_heartbeat('self_heal', {'action': 'full_reset'})
            # Extended backoff — wait 5 minutes before retrying
            for _ in range(300):
                if not running:
                    break
                time.sleep(1)
            continue

        try:
            # run_scrape_cycle returns records actually SAVED to Supabase.
            saved_records = run_scrape_cycle(mgr)
            if saved_records > 0:
                last_successful_save = time.time()
                log.info(f'⏰ Next scrape in {SCRAPE_INTERVAL // 60} minutes...')
            else:
                # Exponential backoff keyed off the EMPTY-cycle streak (which
                # cycle completion does not reset). A markup change used to sit
                # at index 0 forever and re-scrape every ~5s.
                import random
                base_delays = [60, 300, 900, 1800, 3600]
                idx = min(max(0, mgr.empty_cycle_streak - 1), len(base_delays) - 1)
                backoff = int(base_delays[idx] * random.uniform(0.9, 1.1))
                log.warning(
                    f'⏰ No records saved — retrying in {backoff}s '
                    f'(empty cycle streak #{mgr.empty_cycle_streak})...'
                )
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

        # Sleep for interval with sleep/wake drift detection
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
            mgr.consecutive_fetch_failures = 0  # Reset — this isn't a real failure

    log.info('🛑 Shutting down...')
    mgr.disconnect()
    _kill_zombie_browsers()
    log.info('Daemon stopped.')

if __name__ == '__main__':
    main()
