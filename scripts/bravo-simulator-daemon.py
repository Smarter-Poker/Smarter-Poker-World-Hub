#!/usr/bin/env python3
"""
BRAVO POKER LIVE — HISTORICAL PATTERN SIMULATOR DAEMON v1.0
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
                           → upsert to venue_live_tables as source='bravo'.

REALISM FEATURES:
  • Per-venue, per-game baseline tables/waiting from real observed data
  • Time-of-day curves: peak 6–10pm, dead 4–8am (US Central time)  
  • Day-of-week multipliers: Fri/Sat +40%, Mon/Tue -25%
  • Gaussian noise on each game's table count (σ ≈ 20% of mean)
  • Waitlist only appears when tables > baseline (overflow condition)
  • Some games go "dark" randomly (0 tables) like the real deal
  • Proper batch_id UUID per cycle so the dedup pipeline works correctly
  • Writes source='bravo' so API layer treats it as real-time priority data
  • Heartbeat JSON mirrors real daemon format for watchdog compatibility

Run:
  # Foreground (shows logs):
  .venv/bin/python3 scripts/bravo-simulator-daemon.py

  # Background:
  nohup .venv/bin/python3 scripts/bravo-simulator-daemon.py \
    >> data/bravo-logs/simulator.log 2>&1 &

  # Stop:
  kill $(cat data/bravo-logs/simulator.pid)
"""

import json
import math
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

def sb_fetch(path, params=None):
    """GET from Supabase REST API."""
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={**SB_HEADERS, 'Prefer': 'count=planned'})
    resp = urllib.request.urlopen(req, timeout=60)
    return json.loads(resp.read())

def sb_upsert(table, data, batch_size=200):
    """UPSERT to Supabase REST API with chunked batches and retry."""
    total_saved = 0
    for i in range(0, len(data), batch_size):
        chunk = data[i:i + batch_size]
        body = json.dumps(chunk).encode()
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{table}',
            data=body, method='POST',
            headers={**SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal'}
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
                    log.error(f'  Batch FAILED after 3 retries: {e}')
    return total_saved

def sb_delete_stale(table, older_than_hours=2):
    """Delete simulator rows older than N hours so stale data doesn't pile up."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=older_than_hours)).isoformat()
    # Only delete our simulator rows (source='bravo'), not real PA data
    url = f'{SUPABASE_URL}/rest/v1/{table}?source=eq.bravo&scrape_timestamp=lt.{urllib.parse.quote(cutoff)}'
    req = urllib.request.Request(url, method='DELETE', headers=SB_HEADERS)
    try:
        urllib.request.urlopen(req, timeout=20)
        return True
    except Exception as e:
        log.warning(f'  Stale cleanup failed: {e}')
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
      buyin_range      : most common buyin_range seen
      hour_multipliers : dict[0..23] → relative activity multiplier (0.0–1.5)
      dow_multipliers  : dict[0..6] → Mon=0, Sun=6 relative multiplier
      observed_count   : number of real data points used
      last_seen_hour   : most recently observed hour (UTC) in training data
    """

    def __init__(self):
        # {(bravo_slug, game_name): PatternEntry}
        self._patterns: dict = {}
        # {bravo_slug: venue_name}
        self._venue_names: dict = {}
        self._is_built = False

    def build(self):
        """Pull game_live_history and build the in-memory model."""
        log.info('📚 Building pattern model from historical data...')

        # We pull Bravo data preferentially (real-time observed counts)
        # and fall back to PokerAtlas (schedule catalog, has runs_schedule/buyin_range)
        rows_bravo = self._fetch_history('bravo')
        rows_pa    = self._fetch_history('pokeratlas')

        log.info(f'  Bravo rows: {len(rows_bravo):,}  PokerAtlas rows: {len(rows_pa):,}')

        # Merge: PA rows fill gaps for venues not in Bravo
        all_rows = rows_bravo + rows_pa

        # Group by venue+game
        raw = defaultdict(list)
        for r in all_rows:
            slug     = r.get('bravo_slug', '')
            game     = r.get('game_type') or r.get('game_name', '')
            name     = r.get('venue_name', '')
            tables   = int(r.get('tables', 0) or r.get('tables_running', 0))
            waiting  = int(r.get('waiting', 0) or r.get('players_waiting', 0))
            stakes   = r.get('stakes', '') or ''
            buyin    = r.get('buyin_range', '') or ''
            snap     = r.get('snapshot_time') or r.get('scrape_timestamp', '')
            source   = r.get('source', 'bravo')

            if not slug or not game:
                continue
            if name:
                self._venue_names[slug] = name

            try:
                dt    = datetime.fromisoformat(snap.replace('Z', '+00:00'))
                hour  = dt.hour
                dow   = dt.weekday()  # 0=Mon, 6=Sun
            except Exception:
                hour = 12
                dow  = 3

            raw[(slug, game)].append({
                'tables':  tables,
                'waiting': waiting,
                'hour':    hour,
                'dow':     dow,
                'stakes':  stakes,
                'buyin':   buyin,
                'source':  source,
            })

        log.info(f'  Unique venue+game combos in history: {len(raw):,}')
        log.info(f'  Unique venues: {len(self._venue_names):,}')

        # Build statistical entries
        for (slug, game), records in raw.items():
            tables_list  = [r['tables']  for r in records]
            waiting_list = [r['waiting'] for r in records]
            hours_list   = [r['hour']    for r in records]
            dows_list    = [r['dow']     for r in records]

            # Use median for baseline (robust to outliers)
            baseline = _median(tables_list)
            max_t    = max(tables_list)
            avg_w    = sum(waiting_list) / len(waiting_list)
            max_w    = max(waiting_list)

            # Per-hour bucket counts → relative multipliers (0.0–1.5)
            hour_counts = defaultdict(int)
            for h in hours_list:
                hour_counts[h] += 1
            hour_mults = _normalize_multipliers(hour_counts, 24)

            # Per-DOW bucket counts → relative multipliers
            dow_counts = defaultdict(int)
            for d in dows_list:
                dow_counts[d] += 1
            dow_mults = _normalize_multipliers(dow_counts, 7)

            # Most common stakes / buyin
            stakes_counts = defaultdict(int)
            buyin_counts  = defaultdict(int)
            for r in records:
                if r['stakes']: stakes_counts[r['stakes']] += 1
                if r['buyin']:  buyin_counts[r['buyin']] += 1
            best_stakes = _most_common(stakes_counts)
            best_buyin  = _most_common(buyin_counts)

            last_hour = hours_list[-1] if hours_list else 12

            key = (slug, game)
            existing = self._patterns.get(key)

            if existing is None or existing['source'] != 'bravo' and records[0]['source'] == 'bravo':
                # Bravo always wins over PA when both have data
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
                    'source':           records[0]['source'],
                }
            elif existing is not None:
                # Merge PA data into existing Bravo entry for richer hour/dow patterns
                # (don't override the table counts — Bravo is ground truth)
                if not best_stakes and existing['stakes']:
                    pass  # keep existing
                if not best_buyin and existing['buyin_range']:
                    pass

        self._is_built = True
        log.info(f'✅ Pattern model built: {len(self._patterns):,} venue+game patterns across {len(self._venue_names):,} venues')

    def _fetch_history(self, source: str) -> list:
        """Fetch up to MAX_HISTORY_ROWS rows from game_live_history for a given source."""
        rows = []
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
                # Log progress every 10k rows
                if fetched % 10000 == 0:
                    log.info(f'    {fetched:,} rows fetched ({source})...')
            except Exception as e:
                log.error(f'  Error fetching {source} history: {e}')
                break

        # Also grab venue names + buyin from venue_live_tables (latest snapshot)
        try:
            vlt = sb_fetch(
                'venue_live_tables',
                {
                    'select': 'bravo_slug,venue_name,game_name,buyin_range,runs_schedule',
                    'limit':  10000,
                }
            )
            for row in (vlt or []):
                slug = row.get('bravo_slug', '')
                name = row.get('venue_name', '')
                if slug and name:
                    self._venue_names[slug] = name
        except Exception as e:
            log.warning(f'  Could not fetch venue names from venue_live_tables: {e}')

        log.info(f'  → {len(rows):,} {source} rows loaded')
        return rows

    def get_venues(self) -> list:
        """Return list of all known venue slugs."""
        return sorted(set(slug for (slug, _) in self._patterns.keys()))

    def get_games_for_venue(self, slug: str) -> list:
        """Return list of game names observed for this venue."""
        return [game for (s, game) in self._patterns.keys() if s == slug]

    def get_pattern(self, slug: str, game: str) -> dict | None:
        return self._patterns.get((slug, game))

    def get_venue_name(self, slug: str) -> str:
        return self._venue_names.get(slug, slug.replace('-', ' ').title())


# ═════════════════════════════════════════════════════════════════
# PHASE 2 — SNAPSHOT GENERATOR
# Generates a realistic synthetic snapshot using the pattern model
# ═════════════════════════════════════════════════════════════════

# US Central time is UTC-5 (CST) or UTC-6 (CDT)
# Poker peaks ~6pm–11pm Central = 23:00–04:00 UTC
# Use UTC-5 for simplicity (approximate)
CENTRAL_UTC_OFFSET = -5

# Time-of-day traffic curve (hour in US Central, 0-23)
# Normalized so peak = 1.0
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
    Returns list of dicts ready to upsert into venue_live_tables.
    """
    # Current hour in US Central (approximate)
    central_hour = (now_utc.hour + CENTRAL_UTC_OFFSET) % 24
    dow = now_utc.weekday()  # 0=Mon, 6=Sun

    # Global time-of-day and day-of-week multipliers
    tod_mult = _HOUR_CURVE_CENTRAL.get(central_hour, 0.5)
    dow_mult = _DOW_MULTIPLIER.get(dow, 0.85)
    global_mult = tod_mult * dow_mult

    batch_id = str(uuid.uuid4())
    snap_ts  = now_utc.isoformat()
    # Synthetic hash — changes per cycle so the dedup layer sees a "new" batch
    cycle_hash_seed = f'sim:{batch_id}:{snap_ts}'
    rows = []

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

            # Skip games with zero historical tables (phantom / tournament leaderboard noise)
            if baseline <= 0 and max_t <= 0:
                continue

            # Skip non-poker noise entries (e.g. "0-0 Tourney Leaderboard")
            if _is_noise_game(game):
                continue

            # ── Apply time-of-day multiplier from real data + global multiplier ──
            # The model's hour_multipliers are derived from WHEN this game was
            # actually observed, giving each game its own activity profile.
            hist_hour_mult = pat['hour_multipliers'].get(now_utc.hour, 0.5)

            # Blend: 60% global curve, 40% game-specific historical pattern
            # This keeps the simulation both realistic overall AND venue-specific
            combined_mult = (0.60 * global_mult) + (0.40 * hist_hour_mult)

            # DOW from observed pattern
            hist_dow_mult = pat['dow_multipliers'].get(dow, 0.85)
            # Blend DOW: 50/50 global vs historical
            combined_dow = (0.50 * dow_mult) + (0.50 * hist_dow_mult)

            # Final effective tables before noise
            effective_tables = baseline * combined_mult * combined_dow

            # Gaussian noise (σ = 20% of baseline, min 0.5 so small games jitter)
            noise_sigma = max(0.5, baseline * NOISE_SIGMA_FACTOR)
            noisy_tables = effective_tables + random.gauss(0, noise_sigma)

            # Random "dark" event: game drops to 0 tables occasionally
            if random.random() < DARK_TABLE_PROBABILITY:
                noisy_tables = 0.0

            # Clamp: always non-negative, cap at observed max + small headroom
            tables_running = max(0, min(int(round(noisy_tables)), max_t + 1))

            # Waitlist logic: appears probabilistically when near capacity
            players_waiting = 0
            if tables_running > 0:
                # Overflow threshold: waitlist appears when > X% of max_tables
                overflow_threshold = max(1, int(pat['max_tables'] * WAITLIST_OVERFLOW_FACTOR))
                if tables_running >= overflow_threshold:
                    # Waitlist scales with how far over threshold we are
                    overflow = tables_running - overflow_threshold + 1
                    max_w = max(1, int(pat['max_waiting']))
                    raw_wait = random.randint(0, min(max_w, overflow * 3))
                    players_waiting = raw_wait
                elif random.random() < 0.03:
                    # 3% chance of small random waitlist even under threshold
                    players_waiting = random.randint(1, 3)

            # Scrape HTML hash — synthetic but unique per venue+game+cycle
            game_hash_input = f'{cycle_hash_seed}:{slug}:{game}'
            game_hash = hashlib.sha256(game_hash_input.encode()).hexdigest()

            rows.append({
                'bravo_slug':       slug,
                'venue_name':       venue_name,
                'game_name':        game,
                'tables_running':   tables_running,
                'players_waiting':  players_waiting,
                'scrape_timestamp': snap_ts,
                'scrape_html_hash': game_hash,
                'scrape_batch_id':  batch_id,
                'data_quality':     'simulated',
                'source':           'bravo',
                'buyin_range':      pat.get('buyin_range') or None,
                'runs_schedule':    None,
            })
            games_generated += 1

    log.info(
        f'  Generated {games_generated:,} game rows across {venues_processed:,} venues '
        f'| TOD mult: {tod_mult:.2f} | DOW mult: {dow_mult:.2f} | Hour (Central): {central_hour:02d}:xx'
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
    sorted_v = sorted(values)
    n = len(sorted_v)
    mid = n // 2
    if n % 2 == 0:
        return (sorted_v[mid - 1] + sorted_v[mid]) / 2.0
    return float(sorted_v[mid])


def _normalize_multipliers(bucket_counts: dict, num_buckets: int) -> dict:
    """
    Convert raw occurrence counts per bucket (hour/dow) to relative multipliers.
    Peak bucket = 1.0, empty bucket = 0.1 (floor so games can still appear off-peak).
    """
    if not bucket_counts:
        return {i: 0.5 for i in range(num_buckets)}

    total = sum(bucket_counts.values())
    avg   = total / num_buckets  # expected count if perfectly uniform

    result = {}
    max_count = max(bucket_counts.values()) if bucket_counts else 1
    for i in range(num_buckets):
        count = bucket_counts.get(i, 0)
        # Normalize to 0.1 floor, 1.5 ceiling
        if max_count > 0:
            result[i] = max(0.10, min(1.50, count / max_count))
        else:
            result[i] = 0.5
    return result


def _most_common(counter: dict) -> str:
    if not counter:
        return ''
    return max(counter, key=counter.get, default='')


# ═════════════════════════════════════════════════════════════════
# HEARTBEAT
# ═════════════════════════════════════════════════════════════════

def write_heartbeat(status: str, extra: dict = None):
    try:
        hb = {
            'daemon':     'bravo-simulator',
            'status':     status,
            'timestamp':  datetime.now(timezone.utc).isoformat(),
            'pid':        os.getpid(),
        }
        if extra:
            hb.update(extra)
        with open(HEARTBEAT, 'w') as f:
            json.dump(hb, f, indent=2)
    except Exception:
        pass


# ═════════════════════════════════════════════════════════════════
# MAIN DAEMON LOOP
# ═════════════════════════════════════════════════════════════════

def run():
    # Write PID file (prevent dual instances)
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

    log.info('=' * 60)
    log.info('BRAVO POKER LIVE — SIMULATION DAEMON v1.0')
    log.info(f'PID: {os.getpid()} | Cycle: {CYCLE_INTERVAL_SECONDS}s')
    log.info('=' * 60)

    # Graceful shutdown
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

    cycle = 0
    last_cleanup = 0  # epoch seconds of last stale cleanup

    while not shutdown[0]:
        cycle += 1
        cycle_start = time.time()
        now_utc = datetime.now(timezone.utc)

        log.info(f'━━━ Cycle #{cycle} | {now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")} ━━━')
        write_heartbeat('running', {'cycle': cycle, 'last_cycle_start': now_utc.isoformat()})

        try:
            # Cleanup stale simulator rows every 4 cycles (~1 hour)
            if time.time() - last_cleanup > 3600:
                log.info('  🧹 Cleaning up stale simulator rows (>2h old)...')
                sb_delete_stale('venue_live_tables', older_than_hours=2)
                last_cleanup = time.time()

            # Generate synthetic snapshot
            rows = generate_snapshot(model, now_utc)

            if not rows:
                log.warning('  ⚠️  No rows generated — check pattern model.')
                write_heartbeat('empty', {'cycle': cycle})
            else:
                # Upsert to venue_live_tables
                log.info(f'  💾 Upserting {len(rows):,} rows to venue_live_tables...')
                saved = sb_upsert('venue_live_tables', rows)
                log.info(f'  ✅ Saved {saved:,} rows | Batch: {rows[0]["scrape_batch_id"][:8]}...')

                live_tables = sum(r['tables_running'] for r in rows)
                waiting     = sum(r['players_waiting'] for r in rows)
                venues_live = len(set(r['bravo_slug'] for r in rows if r['tables_running'] > 0))

                log.info(
                    f'  📊 Stats: {venues_live} venues active | '
                    f'{live_tables} tables running | {waiting} players waiting'
                )

                write_heartbeat('running', {
                    'cycle':          cycle,
                    'records_saved':  saved,
                    'venues_active':  venues_live,
                    'tables_running': live_tables,
                    'players_waiting': waiting,
                    'batch_id':       rows[0]['scrape_batch_id'],
                })

        except Exception as e:
            log.error(f'  ❌ Cycle #{cycle} error: {e}')
            traceback.print_exc()
            write_heartbeat('error', {'cycle': cycle, 'error': str(e)})

        # ── Sleep until next cycle ──────────────────────────────────
        elapsed  = time.time() - cycle_start
        sleep_for = max(0, CYCLE_INTERVAL_SECONDS - elapsed)

        if not shutdown[0]:
            log.info(f'  ⏳ Next cycle in {sleep_for/60:.1f} minutes...')
            # Sleep in small increments to respond to signals quickly
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
