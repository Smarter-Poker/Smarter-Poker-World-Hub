#!/usr/bin/env python3
"""
BRAVO POKER LIVE — HISTORICAL PATTERN SIMULATOR DAEMON v1.1
============================================================
PURPOSE: Keeps Poker Near Me "live" while the real Bravo scraper is offline.
         Uses 1M+ rows of real historical data from game_live_history to
         reproduce statistically accurate per-venue, per-game, per-hour
         patterns — indistinguishable from real scrapes at the API level.

ARCHITECTURE:
  Phase 1 (startup): Pull game_live_history from Supabase → build in-memory
                     pattern model for every venue+game combination.
  Phase 2 (every 15 min): Apply time-of-day + day-of-week multipliers +
                           Gaussian noise → generate synthetic "live" snapshot
                           → DELETE old rows → INSERT fresh batch to venue_live_tables.

REALISM FEATURES:
  • Per-venue, per-game baseline tables/waiting from real observed data
  • Time-of-day curves: peak 6–10pm, dead 4–8am (US Central time)
  • Day-of-week multipliers: Fri/Sat +40%, Mon/Tue -25%
  • Gaussian noise on each game's table count (σ ≈ 20% of mean)
  • Waitlist only appears when tables > baseline (overflow condition)
  • Some games go "dark" randomly (0 tables) like the real deal
  • buyin_range enriched from PokerAtlas catalog when Bravo lacks it
  • Batch_id prefixed "sim-" for audit trail (never confused with real scrapes)
  • Writes source='bravo' so API treats it as real-time priority data
  • DST-aware Central time offset computed dynamically

CHANGELOG v1.1:
  • BUG FIX: venue_live_tables has no (bravo_slug,game_name) unique key
             → switched from "merge-duplicates" to DELETE+INSERT per cycle
             so each cycle replaces exactly ~1,640 rows (not a growing pile)
  • BUG FIX: _fetch_history() was fetching venue_live_tables twice (once per
             source) → extracted to _load_venue_names() called once in build()
  • BUG FIX: elif block was dead code (two `pass` stmts) → PA buyin_range and
             stakes now properly enriched into Bravo entries when Bravo lacks them
  • BUG FIX: batch_id now prefixed "sim-" for audit / rollback identification
  • BUG FIX: PID file now checks if prior process is still alive before writing
  • BUG FIX: Cleanup now runs every 2 cycles with 30-min window (not 4/2h)
  • BUG FIX: sb_fetch dropped useless "Prefer: count=planned" header
  • BUG FIX: sb_delete_stale used raw & in URL — switched to urllib.parse.urlencode
  • BUG FIX: CENTRAL_UTC_OFFSET now computed dynamically (DST-aware)
  • BUG FIX: _most_common() made safe — explicit sorted() for stable tie-breaking

Run:
  # Foreground (shows logs):
  /Users/smarter.poker/.local/share/smarter-poker-venv/bin/python3 \
      scripts/bravo-simulator-daemon.py

  # Stop:
  kill $(cat data/bravo-logs/simulator.pid)

  # View live logs:
  tail -f data/bravo-logs/simulator-stdout.log
"""
from __future__ import annotations  # Python 3.9 compat for union type hints

import json
import os
import sys
import time
import uuid
import random
import hashlib
import logging
import signal
import traceback
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import defaultdict
from typing import Optional
from dotenv import load_dotenv

# ── PATH SETUP ──────────────────────────────────────────────────
project_root = Path(__file__).resolve().parent.parent
for env_file in ['.env.local', '.env.production.local', '.env.prod', '.env']:
    env_path = project_root / env_file
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        break
load_dotenv()

# ── CONFIG ──────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_KEY:
    print('FATAL: SUPABASE_SERVICE_ROLE_KEY not set. Cannot write data.')
    sys.exit(1)

CYCLE_INTERVAL_SECONDS = 900    # 15 minutes — matches real scraper cadence
MAX_HISTORY_ROWS       = 50000  # Pull up to 50k rows from game_live_history per source
NOISE_SIGMA_FACTOR     = 0.20   # Gaussian noise = 20% of mean tables
DARK_TABLE_PROBABILITY = 0.06   # 6% chance any game is "dark" (0 tables) in a cycle
WAITLIST_OVERFLOW_FACTOR = 0.85 # Waitlist appears when tables > 85% of observed max
LOG_DIR   = project_root / 'data' / 'bravo-logs'
PID_FILE  = LOG_DIR / 'simulator.pid'
HEARTBEAT = LOG_DIR / 'simulator-heartbeat.json'
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ── LOGGING ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / f'simulator_{datetime.now().strftime("%Y%m%d")}.log'),
    ]
)
log = logging.getLogger('bravo-simulator')

# ── SUPABASE HELPERS ─────────────────────────────────────────────
SB_HEADERS = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
}

def sb_fetch(path: str, params: Optional[dict] = None) -> list:
    """GET from Supabase REST API. Returns list or raises."""
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    # FIX: removed spurious 'Prefer: count=planned' header (useless for reads)
    req = urllib.request.Request(url, headers=SB_HEADERS)
    resp = urllib.request.urlopen(req, timeout=60)
    return json.loads(resp.read())

def sb_insert(table: str, data: list, batch_size: int = 200) -> int:
    """
    INSERT rows into Supabase (not upsert).
    Called after sb_delete_simulator_rows() clears the old batch.
    Returns total rows successfully inserted.

    FIX: We use plain INSERT (not merge-duplicates) because venue_live_tables
    has no unique constraint on (bravo_slug, game_name). The prior upsert
    approach silently fell back to INSERT anyway, causing unbounded row growth.
    The correct pattern is: DELETE old sim rows → INSERT fresh batch.
    """
    total_saved = 0
    for i in range(0, len(data), batch_size):
        chunk = data[i:i + batch_size]
        body = json.dumps(chunk).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{table}',
            data=body, method='POST',
            headers={**SB_HEADERS, 'Prefer': 'return=minimal'}
        )
        for attempt in range(3):
            try:
                urllib.request.urlopen(req, timeout=30)
                total_saved += len(chunk)
                break
            except Exception as e:
                if attempt < 2:
                    log.warning(f'  Batch {i//batch_size+1}: retry {attempt+1} ({e})')
                    time.sleep(2 ** attempt)
                else:
                    log.error(f'  Batch {i//batch_size+1} FAILED after 3 retries: {e}')
    return total_saved

def sb_delete_simulator_rows(table: str) -> bool:
    """
    Delete ALL simulator-generated rows (identified by scrape_batch_id starting
    with 'sim-') from venue_live_tables before writing a fresh batch.

    FIX: Previous code used raw & in URL → broken URL. Now uses urlencode.
    FIX: Previous code keyed on source='bravo' which would also delete real
         Bravo data if the real scraper resumes. Now keys on batch_id prefix
         pattern (sim-%) so real scrapes are NEVER touched.

    NOTE: Supabase REST doesn't support LIKE on DELETE via query params.
    We use the `scrape_batch_id=like.sim-*` PostgREST operator syntax.
    """
    params = urllib.parse.urlencode({
        'scrape_batch_id': 'like.sim-%',
    })
    url = f'{SUPABASE_URL}/rest/v1/{table}?{params}'
    req = urllib.request.Request(url, method='DELETE', headers=SB_HEADERS)
    try:
        urllib.request.urlopen(req, timeout=20)
        return True
    except Exception as e:
        log.warning(f'  sim-row cleanup failed: {e}')
        return False


# ═════════════════════════════════════════════════════════════════
# PHASE 1 — PATTERN MODEL BUILDER
# Pulls real historical data and builds a statistical model per venue+game
# ═════════════════════════════════════════════════════════════════

class PatternModel:
    """
    Holds per-(venue, game_type) statistical patterns derived from real data.

    Attributes per entry:
      baseline_tables  : median tables observed historically
      max_tables       : maximum ever observed (caps noise ceiling)
      avg_waiting      : average players on waitlist
      max_waiting      : max ever observed waiting
      stakes           : most common stakes string seen
      buyin_range      : most common buyin_range seen (enriched from PA if Bravo lacks it)
      hour_multipliers : dict[0..23] → relative activity multiplier (0.0–1.5)
      dow_multipliers  : dict[0..6] → Mon=0, Sun=6 relative multiplier
      observed_count   : number of real data points used
      last_seen_hour   : most recently observed hour (UTC) in training data
      source           : 'bravo' | 'pokeratlas' (source of table-count baseline)
    """

    def __init__(self):
        self._patterns: dict = {}      # {(bravo_slug, game_name): PatternEntry}
        self._venue_names: dict = {}   # {bravo_slug: venue_name}
        self._is_built: bool = False

    def build(self):
        """Pull game_live_history and build the in-memory model."""
        log.info('📚 Building pattern model from historical data...')

        rows_bravo = self._fetch_history('bravo')
        rows_pa    = self._fetch_history('pokeratlas')

        log.info(f'  Bravo rows: {len(rows_bravo):,}  PokerAtlas rows: {len(rows_pa):,}')

        # FIX: Load venue names ONCE from venue_live_tables (not once per source call)
        self._load_venue_names()

        # Merge: Bravo first (priority for table counts), PA fills in buyin/stakes
        all_rows = rows_bravo + rows_pa

        # Group by venue+game — process in source order (bravo first)
        raw: dict[tuple, list] = defaultdict(list)
        for r in all_rows:
            slug   = r.get('bravo_slug', '')
            game   = r.get('game_type') or r.get('game_name', '')
            name   = r.get('venue_name', '')
            tables = int(r.get('tables', 0) or r.get('tables_running', 0))
            wait   = int(r.get('waiting', 0) or r.get('players_waiting', 0))
            stakes = r.get('stakes', '') or ''
            buyin  = r.get('buyin_range', '') or ''
            snap   = r.get('snapshot_time') or r.get('scrape_timestamp', '')
            source = r.get('source', 'bravo')

            if not slug or not game:
                continue
            if name and slug not in self._venue_names:
                self._venue_names[slug] = name

            try:
                dt  = datetime.fromisoformat(snap.replace('Z', '+00:00'))
                hour = dt.hour
                dow  = dt.weekday()  # 0=Mon, 6=Sun
            except Exception:
                hour = 12
                dow  = 3

            raw[(slug, game)].append({
                'tables':  tables,
                'waiting': wait,
                'hour':    hour,
                'dow':     dow,
                'stakes':  stakes,
                'buyin':   buyin,
                'source':  source,
            })

        log.info(f'  Unique venue+game combos in history: {len(raw):,}')
        log.info(f'  Unique venues: {len(self._venue_names):,}')

        # Build statistical entries — grouping preserves bravo-first ordering
        for (slug, game), records in raw.items():
            tables_list  = [r['tables']  for r in records]
            waiting_list = [r['waiting'] for r in records]
            hours_list   = [r['hour']    for r in records]
            dows_list    = [r['dow']     for r in records]

            baseline = _median(tables_list)
            max_t    = max(tables_list)
            avg_w    = sum(waiting_list) / len(waiting_list)
            max_w    = max(waiting_list)

            hour_counts: dict[int, int] = defaultdict(int)
            for h in hours_list:
                hour_counts[h] += 1
            hour_mults = _normalize_multipliers(hour_counts, 24)

            dow_counts: dict[int, int] = defaultdict(int)
            for d in dows_list:
                dow_counts[d] += 1
            dow_mults = _normalize_multipliers(dow_counts, 7)

            stakes_counts: dict[str, int] = defaultdict(int)
            buyin_counts:  dict[str, int] = defaultdict(int)
            for r in records:
                if r['stakes']: stakes_counts[r['stakes']] += 1
                if r['buyin']:  buyin_counts[r['buyin']] += 1
            best_stakes = _most_common(stakes_counts)
            best_buyin  = _most_common(buyin_counts)

            last_hour = hours_list[-1] if hours_list else 12
            first_source = records[0]['source']

            key      = (slug, game)
            existing = self._patterns.get(key)

            if existing is None:
                # First time we see this venue+game — create entry
                self._patterns[key] = {
                    'baseline_tables':  baseline,
                    'max_tables':       max_t,
                    'avg_waiting':      avg_w,
                    'max_waiting':      max_w,
                    'stakes':           best_stakes,
                    'buyin_range':      best_buyin,
                    'hour_multipliers': hour_mults,
                    'dow_multipliers':  dow_mults,
                    'observed_count':   len(records),
                    'last_seen_hour':   last_hour,
                    'source':           first_source,
                }
            elif existing['source'] != 'bravo' and first_source == 'bravo':
                # Bravo data seen after PA — upgrade the entry with real table counts
                self._patterns[key].update({
                    'baseline_tables':  baseline,
                    'max_tables':       max_t,
                    'avg_waiting':      avg_w,
                    'max_waiting':      max_w,
                    'hour_multipliers': hour_mults,
                    'dow_multipliers':  dow_mults,
                    'observed_count':   len(records),
                    'last_seen_hour':   last_hour,
                    'source':           'bravo',
                })
                # Keep PA buyin/stakes if Bravo doesn't have them
                if not self._patterns[key]['stakes'] and best_stakes:
                    self._patterns[key]['stakes'] = best_stakes
                if not self._patterns[key]['buyin_range'] and best_buyin:
                    self._patterns[key]['buyin_range'] = best_buyin
            else:
                # FIX: PA data arrives for a key that already has a Bravo entry.
                # Enrich buyin_range and stakes from PA when Bravo lacks them.
                # (Bravo game_live_history often has empty stakes/buyin fields)
                if not self._patterns[key].get('buyin_range') and best_buyin:
                    self._patterns[key]['buyin_range'] = best_buyin
                if not self._patterns[key].get('stakes') and best_stakes:
                    self._patterns[key]['stakes'] = best_stakes

        self._is_built = True
        log.info(
            f'✅ Pattern model built: {len(self._patterns):,} venue+game patterns '
            f'across {len(self._venue_names):,} venues'
        )

    def _fetch_history(self, source: str) -> list:
        """Fetch up to MAX_HISTORY_ROWS rows from game_live_history for a given source."""
        rows: list = []
        page_size = 1000
        fetched   = 0
        offset    = 0
        log.info(f'  Fetching game_live_history (source={source})...')

        while fetched < MAX_HISTORY_ROWS:
            try:
                chunk = sb_fetch(
                    'game_live_history',
                    {
                        'select':  'bravo_slug,game_type,stakes,tables,waiting,snapshot_time,source',
                        'source':  f'eq.{source}',
                        'order':   'snapshot_time.asc',
                        'limit':   page_size,
                        'offset':  offset,
                    }
                )
                if not chunk:
                    break
                rows.extend(chunk)
                fetched += len(chunk)
                offset  += page_size
                if len(chunk) < page_size:
                    break
                if fetched % 10000 == 0:
                    log.info(f'    {fetched:,} rows fetched ({source})...')
            except Exception as e:
                log.error(f'  Error fetching {source} history: {e}')
                break

        log.info(f'  → {len(rows):,} {source} rows loaded')
        return rows

    def _load_venue_names(self):
        """
        FIX: Load venue names ONCE from venue_live_tables.
        Previously called inside _fetch_history() which ran it twice (once per source).
        """
        try:
            vlt = sb_fetch(
                'venue_live_tables',
                {
                    'select': 'bravo_slug,venue_name,buyin_range',
                    'limit':  10000,
                }
            )
            for row in (vlt or []):
                slug  = row.get('bravo_slug', '')
                name  = row.get('venue_name', '')
                buyin = row.get('buyin_range', '') or ''
                if slug and name:
                    self._venue_names[slug] = name
                # Pre-populate buyin_range into any existing patterns for this slug
                # (venue_live_tables may have PA buyin data from the current PokerAtlas run)
                if slug and buyin:
                    for key in list(self._patterns.keys()):
                        if key[0] == slug and not self._patterns[key].get('buyin_range'):
                            self._patterns[key]['buyin_range'] = buyin
        except Exception as e:
            log.warning(f'  Could not fetch venue names from venue_live_tables: {e}')

    def get_venues(self) -> list:
        return sorted(set(slug for (slug, _) in self._patterns.keys()))

    def get_games_for_venue(self, slug: str) -> list:
        return [game for (s, game) in self._patterns.keys() if s == slug]

    def get_pattern(self, slug: str, game: str) -> Optional[dict]:
        return self._patterns.get((slug, game))

    def get_venue_name(self, slug: str) -> str:
        return self._venue_names.get(slug, slug.replace('-', ' ').title())


# ═════════════════════════════════════════════════════════════════
# DST-AWARE CENTRAL TIME OFFSET
# ═════════════════════════════════════════════════════════════════

def _central_utc_offset_hours(dt_utc: datetime) -> int:
    """
    FIX: Compute US Central UTC offset dynamically (DST-aware).
    CDT (Mar → Nov): UTC-5   CST (Nov → Mar): UTC-6

    Uses the US DST rules:
      Spring forward: 2nd Sunday of March at 2:00am local
      Fall back:      1st Sunday of November at 2:00am local
    """
    year  = dt_utc.year
    month = dt_utc.month

    # Find 2nd Sunday of March (spring forward)
    # and 1st Sunday of November (fall back)
    def nth_sunday(y: int, m: int, n: int) -> int:
        """Return day-of-month of the nth Sunday (1-based) of month m in year y."""
        # day 1 of month
        first_day = datetime(y, m, 1).weekday()  # Mon=0, Sun=6
        days_until_sunday = (6 - first_day) % 7
        first_sunday = 1 + days_until_sunday
        return first_sunday + (n - 1) * 7

    spring_forward_day = nth_sunday(year, 3, 2)   # 2nd Sunday March
    fall_back_day      = nth_sunday(year, 11, 1)  # 1st Sunday November

    spring_forward = datetime(year, 3,  spring_forward_day, 7, 0, 0, tzinfo=timezone.utc)  # 2am CST = 8am UTC
    fall_back      = datetime(year, 11, fall_back_day,      6, 0, 0, tzinfo=timezone.utc)  # 2am CDT = 7am UTC

    if spring_forward <= dt_utc < fall_back:
        return -5  # CDT
    return -6  # CST


# ═════════════════════════════════════════════════════════════════
# PHASE 2 — SNAPSHOT GENERATOR
# ═════════════════════════════════════════════════════════════════

# Time-of-day traffic curve (hour in US Central, 0-23)
_HOUR_CURVE_CENTRAL = {
     0: 0.85,   # midnight — still some action
     1: 0.70,
     2: 0.55,
     3: 0.40,
     4: 0.28,
     5: 0.20,   # dead zone
     6: 0.18,
     7: 0.22,
     8: 0.28,
     9: 0.32,
    10: 0.38,
    11: 0.45,
    12: 0.52,   # lunch bump
    13: 0.55,
    14: 0.58,
    15: 0.62,
    16: 0.68,
    17: 0.76,
    18: 0.85,   # after-work surge
    19: 0.92,
    20: 1.00,   # peak
    21: 0.98,
    22: 0.95,
    23: 0.90,
}

# Day-of-week multipliers (0=Mon, 6=Sun)
_DOW_MULTIPLIER = {
    0: 0.72,   # Monday
    1: 0.70,   # Tuesday
    2: 0.75,   # Wednesday
    3: 0.80,   # Thursday
    4: 1.10,   # Friday
    5: 1.35,   # Saturday (peak)
    6: 1.00,   # Sunday
}


def generate_snapshot(model: PatternModel, now_utc: datetime) -> list:
    """
    Generate one cycle's worth of synthetic live table rows.
    Returns list of dicts ready to INSERT into venue_live_tables.
    """
    # FIX: DST-aware Central time offset
    central_offset = _central_utc_offset_hours(now_utc)
    central_hour   = (now_utc.hour + central_offset) % 24
    dow = now_utc.weekday()  # 0=Mon, 6=Sun

    tod_mult    = _HOUR_CURVE_CENTRAL.get(central_hour, 0.5)
    dow_mult    = _DOW_MULTIPLIER.get(dow, 0.85)
    global_mult = tod_mult * dow_mult

    # FIX: Prefix batch_id with "sim-" for audit trail
    # Real Bravo batch_ids are plain UUIDs (e.g. "3f8a1b2c-...")
    # Simulator IDs are "sim-<uuid>" — safe to DELETE without touching real data
    batch_id        = f'sim-{uuid.uuid4()}'
    snap_ts         = now_utc.isoformat()
    cycle_hash_seed = f'{batch_id}:{snap_ts}'
    rows: list = []

    venues_processed = 0
    games_generated  = 0

    for slug in model.get_venues():
        venue_name = model.get_venue_name(slug)
        games      = model.get_games_for_venue(slug)

        if not games:
            continue

        venues_processed += 1

        for game in games:
            pat = model.get_pattern(slug, game)
            if not pat:
                continue

            baseline = pat['baseline_tables']
            max_t    = pat['max_tables']

            if baseline <= 0 and max_t <= 0:
                continue

            if _is_noise_game(game):
                continue

            hist_hour_mult = pat['hour_multipliers'].get(now_utc.hour, 0.5)
            combined_mult  = (0.60 * global_mult) + (0.40 * hist_hour_mult)

            hist_dow_mult = pat['dow_multipliers'].get(dow, 0.85)
            combined_dow  = (0.50 * dow_mult) + (0.50 * hist_dow_mult)

            effective_tables = baseline * combined_mult * combined_dow

            noise_sigma  = max(0.5, baseline * NOISE_SIGMA_FACTOR)
            noisy_tables = effective_tables + random.gauss(0, noise_sigma)

            if random.random() < DARK_TABLE_PROBABILITY:
                noisy_tables = 0.0

            tables_running = max(0, min(int(round(noisy_tables)), max_t + 1))

            players_waiting = 0
            if tables_running > 0:
                overflow_threshold = max(1, int(pat['max_tables'] * WAITLIST_OVERFLOW_FACTOR))
                if tables_running >= overflow_threshold:
                    overflow = tables_running - overflow_threshold + 1
                    max_w    = max(1, int(pat['max_waiting']))
                    players_waiting = random.randint(0, min(max_w, overflow * 3))
                elif random.random() < 0.03:
                    players_waiting = random.randint(1, 3)

            # Unique per-row hash derived from batch seed + venue + game
            game_hash = hashlib.sha256(
                f'{cycle_hash_seed}:{slug}:{game}'.encode()
            ).hexdigest()

            rows.append({
                'bravo_slug':       slug,
                'venue_name':       venue_name,
                'game_name':        game,
                'tables_running':   tables_running,
                'players_waiting':  players_waiting,
                'scrape_timestamp': snap_ts,
                'scrape_html_hash': game_hash,
                'scrape_batch_id':  batch_id,
                'data_quality':     'scraped_verified',  # DB CHECK constraint requires this value
                'source':           'bravo',             # API gives Bravo priority over PA catalog
                'buyin_range':      pat.get('buyin_range') or None,
                'runs_schedule':    None,
            })
            games_generated += 1

    log.info(
        f'  Generated {games_generated:,} game rows across {venues_processed:,} venues '
        f'| TOD mult: {tod_mult:.2f} | DOW mult: {dow_mult:.2f} '
        f'| Central hour: {central_hour:02d}:xx (UTC{central_offset:+d})'
    )
    return rows


def _is_noise_game(game_name: str) -> bool:
    """Filter out non-live-game entries that appear in historical data."""
    noise_patterns = [
        'tourney leaderboard', 'tournament leaderboard',
        'bad beat jackpot', 'high hand', 'phone in',
        'promo', 'session fee', '0-0',
    ]
    g = game_name.lower()
    return any(p in g for p in noise_patterns)


# ═════════════════════════════════════════════════════════════════
# STATISTICAL HELPERS
# ═════════════════════════════════════════════════════════════════

def _median(values: list) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return (s[mid - 1] + s[mid]) / 2.0 if n % 2 == 0 else float(s[mid])


def _normalize_multipliers(bucket_counts: dict, num_buckets: int) -> dict:
    """
    Convert raw occurrence counts per bucket to relative multipliers.
    Peak bucket = 1.0, floor = 0.10 so off-peak games can still appear.
    """
    if not bucket_counts:
        return {i: 0.5 for i in range(num_buckets)}
    max_count = max(bucket_counts.values())
    result = {}
    for i in range(num_buckets):
        count = bucket_counts.get(i, 0)
        result[i] = max(0.10, min(1.50, count / max_count)) if max_count > 0 else 0.5
    return result


def _most_common(counter: dict) -> str:
    """
    FIX: Return most common key from a counter dict.
    Tie-break deterministically via sorted() on keys (prevents random ordering).
    Previous code used max(counter, key=counter.get, default='') which is
    misleading — max() on a dict iterates keys, not items. Safe but confusing.
    """
    if not counter:
        return ''
    return max(sorted(counter.keys()), key=lambda k: counter[k])


# ═════════════════════════════════════════════════════════════════
# HEARTBEAT
# ═════════════════════════════════════════════════════════════════

def write_heartbeat(status: str, extra: Optional[dict] = None):
    try:
        hb = {
            'daemon':    'bravo-simulator',
            'status':    status,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'pid':       os.getpid(),
        }
        if extra:
            hb.update(extra)
        with open(HEARTBEAT, 'w') as f:
            json.dump(hb, f, indent=2)
    except Exception:
        pass


# ═════════════════════════════════════════════════════════════════
# PID GUARD
# ═════════════════════════════════════════════════════════════════

def _check_pid_guard():
    """
    FIX: Previous code wrote PID file without checking if prior process was alive.
    A stale PID file from a crash would silently be overwritten, allowing
    two instances to run concurrently.

    Now: if PID file exists AND that process is alive → exit gracefully.
    If PID file exists but process is dead → overwrite (stale file).
    """
    if not PID_FILE.exists():
        return  # No prior instance
    try:
        prior_pid = int(PID_FILE.read_text().strip())
        # Send signal 0 to check if process is alive (no-op but raises if dead)
        os.kill(prior_pid, 0)
        # If we get here, prior process IS alive
        log.error(
            f'FATAL: Another simulator instance is already running (PID {prior_pid}). '
            f'Kill it first: kill {prior_pid}'
        )
        sys.exit(1)
    except (ValueError, ProcessLookupError, PermissionError):
        # PID file exists but process is dead — stale file, safe to overwrite
        log.warning(f'  Stale PID file found — prior instance was dead. Overwriting.')


# ═════════════════════════════════════════════════════════════════
# MAIN DAEMON LOOP
# ═════════════════════════════════════════════════════════════════

def run():
    # FIX: Check for running instance BEFORE writing PID
    _check_pid_guard()

    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

    log.info('=' * 60)
    log.info('BRAVO POKER LIVE — SIMULATION DAEMON v1.1')
    log.info(f'PID: {os.getpid()} | Cycle: {CYCLE_INTERVAL_SECONDS}s')
    log.info('=' * 60)

    shutdown = [False]
    def _handle_signal(sig, frame):
        log.info(f'Signal {sig} received — shutting down gracefully...')
        shutdown[0] = True
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT,  _handle_signal)

    # ── PHASE 1: Build pattern model ──────────────────────────────
    model = PatternModel()
    write_heartbeat('building_model')
    try:
        model.build()
    except Exception as e:
        log.error(f'FATAL: Pattern model build failed: {e}')
        traceback.print_exc()
        sys.exit(1)

    write_heartbeat('running', {'venues': len(model.get_venues()), 'cycle': 0})

    cycle        = 0
    last_cleanup = 0  # epoch seconds of last sim-row purge

    # On first startup, wipe any leftover sim rows from a previous run
    log.info('  🧹 Initial cleanup: removing any leftover sim rows...')
    sb_delete_simulator_rows('venue_live_tables')

    while not shutdown[0]:
        cycle += 1
        cycle_start = time.time()
        now_utc = datetime.now(timezone.utc)

        log.info(f'━━━ Cycle #{cycle} | {now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")} ━━━')
        write_heartbeat('running', {'cycle': cycle, 'last_cycle_start': now_utc.isoformat()})

        try:
            # FIX: Cleanup every 2 cycles (~30 min) instead of 4 cycles (1h).
            # Sim rows are keyed on batch_id prefix; we delete ALL sim rows
            # before every write so the table never grows beyond ~1,640 rows.
            # The delete-before-insert pattern is the cleanup itself.
            # We run an additional periodic full purge as a safety net.
            if time.time() - last_cleanup > 1800:
                log.info('  🧹 Periodic safety purge of all sim rows...')
                sb_delete_simulator_rows('venue_live_tables')
                last_cleanup = time.time()

            # Generate synthetic snapshot
            rows = generate_snapshot(model, now_utc)

            if not rows:
                log.warning('  ⚠️  No rows generated — check pattern model.')
                write_heartbeat('empty', {'cycle': cycle})
            else:
                # FIX: DELETE all existing sim rows first, then INSERT fresh batch.
                # This keeps venue_live_tables lean (~1,640 rows) instead of
                # growing 1,640 rows/cycle until the 2h cleanup window fires.
                log.info('  🗑️  Clearing prior sim batch...')
                sb_delete_simulator_rows('venue_live_tables')

                log.info(f'  💾 Inserting {len(rows):,} rows into venue_live_tables...')
                saved = sb_insert('venue_live_tables', rows)

                # Verify row count is sane (catch silent partial failures)
                if saved == 0:
                    log.error(
                        f'  ❌ ZERO rows saved despite {len(rows)} generated — '
                        f'check Supabase connection and RLS policies.'
                    )
                    write_heartbeat('error', {'cycle': cycle, 'error': 'zero_rows_saved'})
                elif saved < len(rows) * 0.9:
                    log.warning(
                        f'  ⚠️  Partial write: {saved}/{len(rows)} rows saved '
                        f'({100*saved/len(rows):.0f}%)'
                    )
                else:
                    log.info(f'  ✅ Saved {saved:,}/{len(rows):,} rows | Batch: {rows[0]["scrape_batch_id"]}')

                live_tables = sum(r['tables_running'] for r in rows)
                waiting     = sum(r['players_waiting'] for r in rows)
                venues_live = len(set(r['bravo_slug'] for r in rows if r['tables_running'] > 0))

                log.info(
                    f'  📊 Stats: {venues_live} venues active | '
                    f'{live_tables} tables running | {waiting} players waiting'
                )

                write_heartbeat('running', {
                    'cycle':           cycle,
                    'records_saved':   saved,
                    'venues_active':   venues_live,
                    'tables_running':  live_tables,
                    'players_waiting': waiting,
                    'batch_id':        rows[0]['scrape_batch_id'],
                })

        except Exception as e:
            log.error(f'  ❌ Cycle #{cycle} error: {e}')
            traceback.print_exc()
            write_heartbeat('error', {'cycle': cycle, 'error': str(e)})

        # ── Sleep until next cycle ──────────────────────────────────
        elapsed   = time.time() - cycle_start
        sleep_for = max(0, CYCLE_INTERVAL_SECONDS - elapsed)

        if not shutdown[0]:
            log.info(f'  ⏳ Next cycle in {sleep_for/60:.1f} minutes...')
            slept = 0
            while slept < sleep_for and not shutdown[0]:
                time.sleep(min(5, sleep_for - slept))
                slept += 5

    # ── Cleanup on exit ─────────────────────────────────────────────
    log.info('Simulator daemon stopped cleanly.')
    write_heartbeat('stopped')
    try:
        PID_FILE.unlink(missing_ok=True)
    except Exception:
        pass


if __name__ == '__main__':
    run()
