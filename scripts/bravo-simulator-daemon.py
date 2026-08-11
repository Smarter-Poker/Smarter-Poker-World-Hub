#!/usr/bin/env python3
"""
BRAVO POKER LIVE — HISTORICAL PATTERN SIMULATOR DAEMON v1.2
============================================================
PURPOSE: Keeps Poker Near Me "live" while the real Bravo scraper is offline.
         Uses a RECENT window of real historical data from game_live_history
         (newest-first, up to MAX_HISTORY_ROWS rows per source) to reproduce
         per-venue, per-game, per-hour patterns.

         These rows are MODELLED, NOT OBSERVED. They are marked as such: the
         batch id is prefixed 'sim-', scrape_html_hash is NULL because no page
         was fetched, and the API reports them as data_quality
         'modeled_estimate'. Nothing here may be presented as a real scrape.
         Venues that have fresh real scraped data are never simulated.

ARCHITECTURE:
  Phase 1 (startup, rebuilt every 24h): Pull a RECENT window of
                     game_live_history from Supabase → build in-memory
                     pattern model for every venue+game combination.
  Phase 2 (every 15 min): Apply time-of-day + day-of-week multipliers +
                           mean-reverting step + Gaussian noise → generate
                           synthetic "live" snapshot → INSERT fresh batch to
                           venue_live_tables → DELETE stale sim rows.

REALISM FEATURES:
  • Per-venue, per-game baseline tables/waiting from real observed data
  • Time-of-day curves: peak 6–10pm, dead 4–8am (US Central time)
  • Day-of-week multipliers: Fri/Sat +40%, Mon/Tue -25%
  • Historical hour/day curves derived from OBSERVED TABLE COUNTS
  • Gaussian noise on each game's table count (σ ≈ 20% of mean)
  • Mean-reverting continuity between cycles (no 15-min teleporting)
  • Waitlist only appears when tables > baseline (overflow condition)
  • Venues can go dark as a whole; per-game random blackouts removed
  • Batch_id prefixed "sim-" for audit trail (never confused with real scrapes)
  • Writes source='bravo' so API treats it as real-time priority data
  • Venues with FRESH REAL scraped data are skipped entirely
  • scrape_html_hash is NULL — nothing was fetched, so no page hash exists
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

CHANGELOG v1.2 (data-integrity pass):
  • NO FABRICATED FORENSICS: scrape_html_hash is now NULL. It previously held a
    sha256 of the batch UUID, which looked exactly like the hash of a real
    fetched page body and changed every cycle.
  • REAL DATA WINS: venues that have genuinely scraped (non "sim-") rows newer
    than REAL_DATA_FRESH_SECONDS are skipped, so the simulator can no longer
    resurrect games the real scraper positively reported as absent.
  • RECENT HISTORY ONLY: history is fetched newest-first inside a bounded
    window; the daemon refuses to publish if the newest history row is older
    than MAX_HISTORY_AGE_DAYS, and rebuilds the model every 24h.
  • REAL ACTIVITY CURVES: hour/day multipliers are now mean observed tables per
    bucket (normalised against the venue's overall mean) instead of a count of
    history rows, which only measured scraper uptime.
  • CENTRAL DAY-OF-WEEK: both hour AND weekday come from the Central-shifted
    timestamp, for generation and for the historical buckets.
  • READ-CONSISTENT SWAP: INSERT the new batch first, then DELETE sim rows from
    older batches — no window where the API sees zero live games. The periodic
    "safety purge" (delete with no paired insert) is gone.
  • LOUD FAILURES: history fetch errors raise, minimum row/pattern thresholds
    are enforced, partial writes and failed deletes mark the cycle status
    'error' and increment consecutive_failures in the heartbeat.
  • STANDING DOWN IS NOT AN ERROR: when the real scraper has fresh rows for
    every venue this model can generate, the cycle reports status 'idle' (a
    status the watchdog treats as healthy) and sweeps leftover sim rows, instead
    of reporting 'error' forever while the real pipeline works.
  • sb_insert no longer retries permanent 4xx and logs the PostgREST error body.
  • Heartbeat is written atomically and logs its own failures.
  • PID guard treats PermissionError as "process is alive" (it means exactly
    that) and verifies the recorded command line before reusing a PID.

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
import logging
import signal
import traceback
import urllib.request
import urllib.parse
import urllib.error
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

def _env_int(name: str, default: int) -> int:
    """Read an int from the environment, falling back to the default on junk."""
    try:
        return int(os.environ.get(name, '') or default)
    except ValueError:
        return default


CYCLE_INTERVAL_SECONDS = 900    # 15 minutes — matches real scraper cadence
MAX_HISTORY_ROWS       = 50000  # Pull up to 50k rows from game_live_history per source
NOISE_SIGMA_FACTOR     = 0.20   # Gaussian noise = 20% of mean tables
DARK_VENUE_PROBABILITY = 0.02   # 2% chance a WHOLE venue goes dark in a cycle
WAITLIST_OVERFLOW_FACTOR = 0.85 # Waitlist appears when tables > 85% of observed max

# History recency. The model must reflect the CURRENT venue landscape, not the
# oldest rows in the table. Fetch newest-first inside this window...
HISTORY_WINDOW_DAYS  = _env_int('SIM_HISTORY_WINDOW_DAYS', 90)
# ...and refuse to publish at all once the newest row we can see is this old.
MAX_HISTORY_AGE_DAYS = _env_int('SIM_MAX_HISTORY_AGE_DAYS', 14)
# Sanity floors — a model built from almost nothing must not silently publish.
MIN_HISTORY_ROWS = _env_int('SIM_MIN_HISTORY_ROWS', 1000)
MIN_PATTERNS     = _env_int('SIM_MIN_PATTERNS', 50)
# Rebuild the pattern model on this cadence so a long-running daemon does not
# publish a frozen snapshot of the world forever.
MODEL_REBUILD_SECONDS = _env_int('SIM_MODEL_REBUILD_SECONDS', 24 * 3600)
# A venue with genuinely scraped rows newer than this is NOT simulated.
REAL_DATA_FRESH_SECONDS = _env_int('SIM_REAL_DATA_FRESH_SECONDS', 2700)  # 45 min
# Minimum observations in an hour/day bucket before its historical multiplier is
# trusted over the hand-written curve.
MIN_BUCKET_OBSERVATIONS = 5
# Mean reversion weight for cycle-to-cycle continuity (0 = no memory).
CONTINUITY_WEIGHT = 0.70
# Stop inserting after this many consecutive stale-row delete failures, so a
# broken DELETE cannot grow the table without bound.
MAX_DELETE_FAILURES = 3

LOG_DIR   = project_root / 'data' / 'bravo-logs'
PID_FILE  = LOG_DIR / 'simulator.pid'
PID_META  = LOG_DIR / 'simulator-pid-meta.json'
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

def _http_error_detail(e: urllib.error.HTTPError) -> str:
    """Read the PostgREST error body (it names the offending column/constraint)."""
    try:
        body = e.read().decode('utf-8', 'replace').strip()
    except Exception:
        body = ''
    return f'HTTP {e.code} {e.reason} {body[:500]}'.strip()


def _is_retryable_http(e: urllib.error.HTTPError) -> bool:
    """4xx are permanent (bad column, CHECK violation, bad auth) except 408/429."""
    if e.code in (408, 429):
        return True
    return e.code >= 500


# ── Provenance labelling ─────────────────────────────────────────────────────
# These rows are MODELLED from weeks of historical observations - no page is
# fetched. Labelling them 'scraped_verified' told every future consumer that a
# generated number was a verified scrape. The honest value is 'simulated'.
#
# venue_live_tables.data_quality carries a CHECK constraint that historically
# allowed only ('scraped_verified','stale','expired'). Migration
# 20260809_widen_live_tables_data_quality.sql adds 'simulated'. Until that runs,
# writing the honest value would be rejected and the cash-games surface would go
# dark - so sb_insert detects the CHECK violation (SQLSTATE 23514), downgrades
# once per process, and logs loudly. Safe to deploy before OR after the
# migration; it corrects itself either way.
#
# NOTE: `source` deliberately stays 'bravo'. live-tables.js keys its
# cross-source slug index on source=='bravo' and derives simulated-ness from
# scrape_batch_id starting 'sim-' (isSimulatedRow), so changing source would
# empty that index and break PokerAtlas->Bravo venue merging, while fixing
# nothing the batch-id check does not already handle.
SIM_DATA_QUALITY_HONEST   = 'simulated'
SIM_DATA_QUALITY_FALLBACK = 'scraped_verified'
_SIM_DQ_STATE = {'value': SIM_DATA_QUALITY_HONEST, 'downgraded': False}


def sim_data_quality() -> str:
    """Label to stamp on generated rows this cycle."""
    return _SIM_DQ_STATE['value']


def _downgrade_data_quality_if_needed(detail: str) -> bool:
    """If a batch was rejected by the data_quality CHECK, fall back once.

    Returns True when the caller should retry the chunk with the old label.
    """
    if _SIM_DQ_STATE['downgraded']:
        return False
    d = (detail or '').lower()
    if '23514' in d or ('data_quality' in d and 'check' in d) or 'violates check constraint' in d:
        _SIM_DQ_STATE['value'] = SIM_DATA_QUALITY_FALLBACK
        _SIM_DQ_STATE['downgraded'] = True
        log.error(
            '  data_quality=%r rejected by the venue_live_tables CHECK constraint. '
            'Falling back to %r for this process so cash games stay published. '
            'RUN migration 20260809_widen_live_tables_data_quality.sql to allow the '
            'honest label - until then these rows remain mislabelled as verified scrapes.',
            SIM_DATA_QUALITY_HONEST, SIM_DATA_QUALITY_FALLBACK)
        return True
    return False


def sb_insert(table: str, data: list, batch_size: int = 200) -> tuple:
    """
    INSERT rows into Supabase (not upsert).
    Returns (rows_saved, failed_chunks) — the caller MUST treat any failed chunk
    as a cycle error; a partial insert is a partial outage.

    FIX: We use plain INSERT (not merge-duplicates) because venue_live_tables
    has no unique constraint on (bravo_slug, game_name). The prior upsert
    approach silently fell back to INSERT anyway, causing unbounded row growth.
    The correct pattern is: INSERT fresh batch → DELETE older sim rows.

    FIX: permanent 4xx responses are no longer retried three times, and the
    PostgREST error body is logged instead of a bare 'HTTP Error 400'.
    """
    total_saved   = 0
    failed_chunks = 0
    for i in range(0, len(data), batch_size):
        chunk = data[i:i + batch_size]
        # If an earlier chunk already tripped the CHECK downgrade, relabel this
        # one BEFORE sending. Without this, every later chunk would still carry
        # the honest label, be permanently rejected, and the cycle would lose
        # most of its rows - the exact partial outage this function warns about.
        if _SIM_DQ_STATE['downgraded']:
            for _r in chunk:
                if _r.get('data_quality') == SIM_DATA_QUALITY_HONEST:
                    _r['data_quality'] = SIM_DATA_QUALITY_FALLBACK
        body = json.dumps(chunk).encode()
        chunk_no = i // batch_size + 1
        saved = False
        for attempt in range(3):
            # Build a fresh Request per attempt — a consumed request body cannot
            # be safely replayed.
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/{table}',
                data=body, method='POST',
                headers={**SB_HEADERS, 'Prefer': 'return=minimal'}
            )
            try:
                urllib.request.urlopen(req, timeout=30)
                total_saved += len(chunk)
                saved = True
                break
            except urllib.error.HTTPError as e:
                detail = _http_error_detail(e)
                if not _is_retryable_http(e):
                    # A data_quality CHECK rejection is recoverable: relabel and
                    # replay this same chunk rather than losing the cycle.
                    if _downgrade_data_quality_if_needed(detail):
                        for _r in chunk:
                            if _r.get('data_quality') == SIM_DATA_QUALITY_HONEST:
                                _r['data_quality'] = SIM_DATA_QUALITY_FALLBACK
                        body = json.dumps(chunk).encode()
                        continue
                    log.error(f'  Batch {chunk_no} PERMANENTLY REJECTED: {detail}')
                    break
                if attempt < 2:
                    log.warning(f'  Batch {chunk_no}: retry {attempt+1} ({detail})')
                    time.sleep(2 ** attempt)
                else:
                    log.error(f'  Batch {chunk_no} FAILED after 3 retries: {detail}')
            except Exception as e:
                if attempt < 2:
                    log.warning(f'  Batch {chunk_no}: retry {attempt+1} ({type(e).__name__}: {e})')
                    time.sleep(2 ** attempt)
                else:
                    log.error(f'  Batch {chunk_no} FAILED after 3 retries: {type(e).__name__}: {e}')
        if not saved:
            failed_chunks += 1
    return total_saved, failed_chunks

def sb_delete_simulator_rows(table: str, except_batch_id: Optional[str] = None) -> bool:
    """
    Delete simulator-generated rows (identified by scrape_batch_id starting with
    'sim-') from venue_live_tables. When except_batch_id is given, the rows of
    that batch are KEPT — this is the stale-row sweep that runs AFTER the fresh
    batch has been written, so readers never see an empty table.

    Returns True only when the DELETE actually succeeded; every call site must
    check it, because an ignored failure means duplicate rows accumulate
    (venue_live_tables has no unique constraint to protect us).

    FIX: Previous code used raw & in URL → broken URL. Now uses urlencode.
    FIX: Previous code keyed on source='bravo' which would also delete real
         Bravo data if the real scraper resumes. Now keys on batch_id prefix
         pattern (sim-%) so real scrapes are NEVER touched.

    NOTE: repeated filters on the same column are ANDed by PostgREST, which is
    how the "sim rows that are not the batch I just wrote" filter is expressed.
    """
    filters = [('scrape_batch_id', 'like.sim-%')]
    if except_batch_id:
        filters.append(('scrape_batch_id', f'neq.{except_batch_id}'))
    url = f'{SUPABASE_URL}/rest/v1/{table}?{urllib.parse.urlencode(filters)}'
    req = urllib.request.Request(url, method='DELETE', headers=SB_HEADERS)
    try:
        urllib.request.urlopen(req, timeout=20)
        return True
    except urllib.error.HTTPError as e:
        log.error(f'  sim-row cleanup FAILED: {_http_error_detail(e)}')
        return False
    except Exception as e:
        log.error(f'  sim-row cleanup FAILED: {type(e).__name__}: {e}')
        return False


def fetch_fresh_real_slugs() -> set:
    """
    Return the set of bravo_slugs that have GENUINELY SCRAPED rows newer than
    REAL_DATA_FRESH_SECONDS. Those venues must not be simulated: the real
    scraper is authoritative for them.

    LIMIT OF THIS GUARANTEE: bravo-live-daemon.py publishes one row per running
    game / waitlisted game, so a venue it scraped and found COMPLETELY EMPTY
    produces no rows at all and cannot appear here. Such a venue is still
    modelled. This gate stops the simulator overwriting live counts; it does not
    (and from venue_live_tables alone cannot) distinguish "closed right now"
    from "not scraped".

    Raises on failure — the caller aborts the cycle rather than risk writing
    modelled rows on top of fresh real data.
    """
    cutoff = (datetime.now(timezone.utc)
              - timedelta(seconds=REAL_DATA_FRESH_SECONDS)).isoformat()
    fresh: set = set()
    page_size = 1000
    max_pages = 50
    offset    = 0
    # Paged: a server-side row ceiling that silently truncated this result would
    # make us simulate straight over a venue the real scraper just wrote. Order
    # on a near-unique key tuple — LIMIT/OFFSET paging over a non-deterministic
    # sort can drop rows across page boundaries, and a dropped row here means a
    # venue with fresh real data gets simulated anyway.
    for _ in range(max_pages):
        rows = sb_fetch(
            'venue_live_tables',
            {
                'select':           'bravo_slug,scrape_batch_id,scrape_timestamp',
                'scrape_timestamp': f'gte.{cutoff}',
                'order':            'bravo_slug.asc,game_name.asc,scrape_timestamp.desc',
                'limit':            page_size,
                'offset':           offset,
            }
        )
        if not rows:
            break
        for row in rows:
            batch = row.get('scrape_batch_id') or ''
            slug  = row.get('bravo_slug') or ''
            if slug and not batch.startswith('sim-'):
                fresh.add(slug)
        if len(rows) < page_size:
            break
        offset += page_size
    else:
        # Ran out of pages with a full page every time: the result set is
        # truncated, so the "is this venue covered by real data?" answer is
        # incomplete. Aborting beats silently overwriting fresh real rows.
        raise RuntimeError(
            f'venue_live_tables returned more than {max_pages * page_size:,} rows '
            f'newer than {REAL_DATA_FRESH_SECONDS}s; refusing to decide what to '
            f'simulate from a truncated real-data set'
        )
    return fresh


# ═════════════════════════════════════════════════════════════════
# PHASE 1 — PATTERN MODEL BUILDER
# Pulls real historical data and builds a statistical model per venue+game
# ═════════════════════════════════════════════════════════════════

class PatternModel:
    """
    Holds per-(venue, game_type) statistical patterns derived from real data.

    Attributes per entry:
      baseline_tables  : median tables observed historically
      mean_tables      : mean tables observed historically — the level the
                         hour/day multipliers below are normalised against, so
                         level * multiplier reproduces the observed mean for
                         that hour/day
      max_tables       : maximum ever observed (caps noise ceiling)
      avg_waiting      : average players on waitlist
      max_waiting      : max ever observed waiting
      stakes           : most common stakes string seen
      buyin_range      : most common buyin_range observed FOR THIS GAME
      hour_multipliers : dict[0..23] → mean observed tables in that CENTRAL hour
                         divided by the venue+game's overall mean tables
                         (None when the bucket has too few observations)
      dow_multipliers  : dict[0..6] → same, per CENTRAL weekday (Mon=0, Sun=6)
      observed_count   : number of real data points used
      last_seen_hour   : most recently observed hour (Central) in training data
      source           : 'bravo' | 'pokeratlas' (source of table-count baseline)
    """

    def __init__(self):
        self._patterns: dict = {}      # {(bravo_slug, game_name): PatternEntry}
        self._venue_names: dict = {}   # {bravo_slug: venue_name}
        self._is_built: bool = False
        self._newest_snapshot: Optional[datetime] = None  # freshest history row seen
        self._rows_loaded: int = 0

    def build(self):
        """
        Pull a RECENT window of game_live_history and build the in-memory model.

        Raises RuntimeError when the history cannot be fetched, is too small, or
        is too stale to model from — the caller must NOT publish in that case.
        """
        log.info('Building pattern model from historical data...')

        rows_bravo = self._fetch_history('bravo')
        rows_pa    = self._fetch_history('pokeratlas')

        log.info(f'  Bravo rows: {len(rows_bravo):,}  PokerAtlas rows: {len(rows_pa):,}')

        # FIX: Load venue names ONCE from venue_live_tables (not once per source call)
        self._load_venue_names()

        # Merge: Bravo first (priority for table counts), PA fills in buyin/stakes
        all_rows = rows_bravo + rows_pa
        self._rows_loaded = len(all_rows)

        if self._rows_loaded < MIN_HISTORY_ROWS:
            raise RuntimeError(
                f'history too small to model from: {self._rows_loaded} rows '
                f'< MIN_HISTORY_ROWS={MIN_HISTORY_ROWS}'
            )

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

            # FIX: bucket by US-CENTRAL hour AND weekday. The activity curves this
            # model is compared against are Central; using the UTC weekday put
            # every 18:00–23:59 Central observation (i.e. prime time) on the
            # following day.
            hour, dow = _central_hour_dow(snap)

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

        for (slug, game), records in raw.items():
            # Table counts come from Bravo when we have any Bravo observation for
            # this exact game — PokerAtlas rows are catalog entries whose "tables"
            # are estimates and would drag the baseline and the curves down.
            bravo_records = [r for r in records if r['source'] == 'bravo']
            stat_records  = bravo_records or records
            stat_source   = 'bravo' if bravo_records else records[0]['source']

            tables_list  = [r['tables']  for r in stat_records]
            waiting_list = [r['waiting'] for r in stat_records]

            baseline = _median(tables_list)
            max_t    = max(tables_list)
            avg_w    = sum(waiting_list) / len(waiting_list)
            max_w    = max(waiting_list)

            # FIX: multipliers are now the MEAN OBSERVED TABLE COUNT per bucket
            # relative to this game's overall mean. The previous version counted
            # history ROWS per bucket, which — with a fixed 15-minute polling
            # cadence — measured scraper uptime, not poker activity.
            overall_mean = sum(tables_list) / len(tables_list)
            hour_mults = _activity_multipliers(stat_records, 'hour', 24, overall_mean)
            dow_mults  = _activity_multipliers(stat_records, 'dow',   7, overall_mean)

            # Stakes/buy-in are keyed on (slug, game) — NEVER venue-wide — so a
            # 1/2 NLH buy-in range can't be attached to a 5/10 PLO game.
            stakes_counts: dict[str, int] = defaultdict(int)
            buyin_counts:  dict[str, int] = defaultdict(int)
            for r in records:
                if r['stakes']: stakes_counts[r['stakes']] += 1
                if r['buyin']:  buyin_counts[r['buyin']] += 1
            best_stakes = _most_common(stakes_counts)
            best_buyin  = _most_common(buyin_counts)

            # History is now fetched NEWEST-FIRST, so the most recent record is
            # element 0. (It was [-1] while the fetch was ordered ascending.)
            last_hour = stat_records[0]['hour'] if stat_records else 12

            self._patterns[(slug, game)] = {
                'baseline_tables':  baseline,
                'mean_tables':      overall_mean,
                'max_tables':       max_t,
                'avg_waiting':      avg_w,
                'max_waiting':      max_w,
                'stakes':           best_stakes,
                'buyin_range':      best_buyin,
                'hour_multipliers': hour_mults,
                'dow_multipliers':  dow_mults,
                'observed_count':   len(stat_records),
                'last_seen_hour':   last_hour,
                'source':           stat_source,
            }

        if len(self._patterns) < MIN_PATTERNS:
            raise RuntimeError(
                f'pattern model too small to publish: {len(self._patterns)} patterns '
                f'< MIN_PATTERNS={MIN_PATTERNS}'
            )

        age_days = self.history_age_days()
        if age_days is None:
            raise RuntimeError('no parsable snapshot_time in history — cannot judge freshness')
        if age_days > MAX_HISTORY_AGE_DAYS:
            raise RuntimeError(
                f'history is stale: newest row is {age_days:.1f} days old '
                f'(max {MAX_HISTORY_AGE_DAYS}). Refusing to model from it.'
            )

        self._is_built = True
        log.info(
            f'Pattern model built: {len(self._patterns):,} venue+game patterns '
            f'across {len(self._venue_names):,} venues | '
            f'newest history row {age_days:.2f} days old'
        )

    def history_age_days(self) -> Optional[float]:
        """Age in days of the freshest history row used, or None if unknown."""
        if self._newest_snapshot is None:
            return None
        delta = datetime.now(timezone.utc) - self._newest_snapshot
        return delta.total_seconds() / 86400.0

    # Base column list that game_live_history is known to have. buyin_range is
    # requested opportunistically (see _fetch_history) because it is not present
    # in every deployment of this table.
    _HISTORY_SELECT_BASE = 'bravo_slug,game_type,stakes,tables,waiting,snapshot_time,source'
    _HISTORY_SELECT_RICH = _HISTORY_SELECT_BASE + ',buyin_range'

    def _fetch_history(self, source: str) -> list:
        """
        Fetch the most RECENT rows from game_live_history for a given source.

        FIX: was `order=snapshot_time.asc` from offset 0, i.e. the OLDEST ~5% of
        the table — the model never saw anything recent. Now newest-first inside
        a bounded window.

        FIX: fetch errors used to `break` and return a partial (possibly empty)
        list, which then built a silently degenerate model. Now they raise.
        """
        rows: list = []
        page_size = 1000
        fetched   = 0
        offset    = 0
        window_start = (datetime.now(timezone.utc)
                        - timedelta(days=HISTORY_WINDOW_DAYS)).isoformat()
        select = self._HISTORY_SELECT_RICH
        log.info(f'  Fetching game_live_history (source={source}, last {HISTORY_WINDOW_DAYS}d)...')

        while fetched < MAX_HISTORY_ROWS:
            try:
                chunk = sb_fetch(
                    'game_live_history',
                    {
                        'select':        select,
                        'source':        f'eq.{source}',
                        'snapshot_time': f'gte.{window_start}',
                        'order':         'snapshot_time.desc',
                        'limit':         page_size,
                        'offset':        offset,
                    }
                )
            except urllib.error.HTTPError as e:
                # A 400 on the FIRST page most likely means buyin_range does not
                # exist on this table — retry once with the base column list
                # rather than losing the whole model over an optional column.
                if e.code == 400 and select == self._HISTORY_SELECT_RICH and offset == 0:
                    log.warning(
                        f'  game_live_history rejected optional column buyin_range '
                        f'({_http_error_detail(e)}) — refetching without it'
                    )
                    select = self._HISTORY_SELECT_BASE
                    continue
                raise RuntimeError(
                    f'fetching {source} history failed: {_http_error_detail(e)}'
                ) from e
            except Exception as e:
                raise RuntimeError(
                    f'fetching {source} history failed: {type(e).__name__}: {e}'
                ) from e

            if not chunk:
                break
            rows.extend(chunk)
            fetched += len(chunk)
            offset  += page_size
            if len(chunk) < page_size:
                break
            if fetched % 10000 == 0:
                log.info(f'    {fetched:,} rows fetched ({source})...')

        # Track the freshest row we have seen across all sources so the caller
        # can refuse to publish from stale history.
        for r in rows[:50]:
            dt = _parse_utc(r.get('snapshot_time'))
            if dt and (self._newest_snapshot is None or dt > self._newest_snapshot):
                self._newest_snapshot = dt

        log.info(f'  -> {len(rows):,} {source} rows loaded')
        return rows

    def _load_venue_names(self):
        """
        Load venue names ONCE from venue_live_tables.

        FIX: this used to also copy a VENUE-level buyin_range onto every pattern
        for that slug, which would have stamped (say) a 1/2 NLH buy-in range onto
        a 5/10 PLO game. Buy-in ranges are now only taken from history rows for
        the exact (slug, game) they were observed on.
        """
        try:
            vlt = sb_fetch(
                'venue_live_tables',
                {
                    'select': 'bravo_slug,venue_name',
                    'limit':  10000,
                }
            )
            for row in (vlt or []):
                slug  = row.get('bravo_slug', '')
                name  = row.get('venue_name', '')
                # Skip slug-echo names written by the old title-cased fallback;
                # ingesting them is what made the corruption self-perpetuating.
                if slug and name and not self._looks_like_slug_echo(name, slug):
                    self._venue_names[slug] = name
        except Exception as e:
            log.warning(f'  Could not fetch venue names from venue_live_tables: '
                        f'{type(e).__name__}: {e}')

    def get_venues(self) -> list:
        return sorted(set(slug for (slug, _) in self._patterns.keys()))

    def get_games_for_venue(self, slug: str) -> list:
        return [game for (s, game) in self._patterns.keys() if s == slug]

    def get_pattern(self, slug: str, game: str) -> Optional[dict]:
        return self._patterns.get((slug, game))

    # Source prefixes baked into bravo_slug by the ingest side ('pa-' =
    # PokerAtlas). They are provenance, NOT part of the venue's name.
    _SLUG_SOURCE_PREFIXES = ('pa-', 'bravo-')

    @staticmethod
    def humanize_slug(slug: str) -> str:
        """Turn a bravo_slug into a readable venue name.

        The old fallback was slug.replace('-', ' ').title(), which produced
        'Pa Aria Casino' for pa-aria-casino and 'Pa Beau Rivage Resort Amp
        Casino' for the HTML-entity-mangled pa-beau-rivage-resort-amp-casino.
        Those strings were then written to venue_live_tables.venue_name and
        read back by _load_venue_names on the next boot, so the corruption
        was self-perpetuating - and it is why 134 of 149 live-cash venues
        could not be joined to poker_venues at all.
        """
        s = (slug or '').strip().lower()
        for pfx in PatternLibrary._SLUG_SOURCE_PREFIXES:
            if s.startswith(pfx):
                s = s[len(pfx):]
                break
        # '&' arrives HTML-escaped upstream and slugifies to '-amp-'.
        s = s.replace('-amp-', '-and-')
        words = [w for w in s.split('-') if w]
        # Trailing bare "s" is a slugified possessive ("doc-amp-eddy-s" ->
        # "Doc and Eddy's"), not a word.
        out = []
        for w in words:
            if w == 's' and out:
                out[-1] = out[-1] + "'s"
            else:
                out.append(w.title())
        return ' '.join(out)

    def get_venue_name(self, slug: str) -> str:
        name = self._venue_names.get(slug)
        if name and not self._looks_like_slug_echo(name, slug):
            return name
        return self.humanize_slug(slug)

    @staticmethod
    def _looks_like_slug_echo(name: str, slug: str) -> bool:
        """True when the stored name is just the raw slug title-cased - i.e. a
        previously-written corrupt value we must not trust or propagate."""
        if not name or not slug:
            return False
        norm = lambda x: ''.join(ch for ch in (x or '').lower() if ch.isalnum())
        return norm(name) == norm(slug)


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

    # FIX (pre-existing, untouched by v1.2): both thresholds were one hour early
    # — they used 07:00/06:00 UTC while their own comments say 08:00/07:00 — so
    # the offset was wrong for one hour on each transition day.
    spring_forward = datetime(year, 3,  spring_forward_day, 8, 0, 0, tzinfo=timezone.utc)  # 2am CST = 8am UTC
    fall_back      = datetime(year, 11, fall_back_day,      7, 0, 0, tzinfo=timezone.utc)  # 2am CDT = 7am UTC

    if spring_forward <= dt_utc < fall_back:
        return -5  # CDT
    return -6  # CST


def _parse_utc(value) -> Optional[datetime]:
    """Parse a Postgres/ISO timestamp into an aware UTC datetime, or None."""
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if dt.tzinfo is None:
        # Supabase stores timestamptz in UTC; a naked timestamp is UTC.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _central_hour_dow(value) -> tuple:
    """
    Convert a UTC timestamp string to (central_hour, central_weekday).

    Returns a neutral (12, 3) when the timestamp is unparsable, matching the
    previous behaviour for bad rows.
    """
    dt = _parse_utc(value)
    if dt is None:
        return 12, 3
    central = dt + timedelta(hours=_central_utc_offset_hours(dt))
    return central.hour, central.weekday()


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


def _mean_normalised(curve: dict) -> dict:
    """
    Rescale a curve so its mean is 1.0.

    The curves above are shaped relative to their own peak, but they are applied
    to an all-hours MEAN table count. Normalising them to mean 1.0 keeps the
    daily average at the observed mean while letting peak/trough contrast be
    real: peak lands around 1.8x the mean instead of the ~1.4x ceiling the old
    damped 60/40 blend could reach, and 6am lands near 0.3x instead of 0.4x.
    """
    values = list(curve.values())
    mean = sum(values) / len(values) if values else 1.0
    if mean <= 0:
        return dict(curve)
    return {k: v / mean for k, v in curve.items()}


_HOUR_CURVE_NORM      = _mean_normalised(_HOUR_CURVE_CENTRAL)
_DOW_MULTIPLIER_NORM  = _mean_normalised(_DOW_MULTIPLIER)


def generate_snapshot(model: PatternModel, now_utc: datetime,
                      skip_slugs: Optional[set] = None,
                      continuity: Optional[dict] = None) -> list:
    """
    Generate one cycle's worth of synthetic live table rows.
    Returns list of dicts ready to INSERT into venue_live_tables.

    skip_slugs : venues with fresh, genuinely scraped data. They are left alone
                 entirely — the real scraper owns them, including when it says a
                 venue has no games running.
    continuity : {(slug, game): tables} from the previous cycle. Table counts
                 mean-revert toward the target instead of being resampled from
                 scratch every 15 minutes.
    """
    skip_slugs = skip_slugs or set()
    continuity = continuity if continuity is not None else {}

    # FIX: DST-aware Central time offset, applied to BOTH hour and weekday.
    # Using now_utc.weekday() misfiled every 18:00–23:59 Central observation
    # (prime time) under the following day — Saturday 8pm got Sunday's curve.
    central_offset = _central_utc_offset_hours(now_utc)
    central_dt     = now_utc + timedelta(hours=central_offset)
    central_hour   = central_dt.hour
    dow            = central_dt.weekday()  # 0=Mon, 6=Sun (US Central)

    tod_mult = _HOUR_CURVE_NORM.get(central_hour, 1.0)
    dow_mult = _DOW_MULTIPLIER_NORM.get(dow, 1.0)

    # FIX: Prefix batch_id with "sim-" for audit trail
    # Real Bravo batch_ids are plain UUIDs (e.g. "3f8a1b2c-...")
    # Simulator IDs are "sim-<uuid>" — safe to DELETE without touching real data
    batch_id = f'sim-{uuid.uuid4()}'
    snap_ts  = now_utc.isoformat()
    rows: list = []

    venues_processed = 0
    venues_skipped   = 0
    games_generated  = 0
    next_continuity: dict = {}

    for slug in model.get_venues():
        if slug in skip_slugs:
            # Real scraped data exists for this venue right now. Do not model it.
            venues_skipped += 1
            continue

        venue_name = model.get_venue_name(slug)
        games      = model.get_games_for_venue(slug)

        if not games:
            continue

        venues_processed += 1

        # FIX: the blackout roll is per VENUE, not per game — a room closes as a
        # whole, it does not lose a random 6% of its games every quarter hour.
        venue_dark = random.random() < DARK_VENUE_PROBABILITY

        for game in games:
            pat = model.get_pattern(slug, game)
            if not pat:
                continue

            baseline = pat['baseline_tables']
            max_t    = pat['max_tables']
            # The multipliers are normalised against the MEAN, so the level they
            # are applied to must be the mean too — level * multiplier then
            # reproduces the mean tables actually observed in that bucket. The
            # median stays the noise scale and the "did we ever see anything"
            # gate below.
            level = pat.get('mean_tables')
            if level is None:
                level = baseline

            if baseline <= 0 and max_t <= 0:
                continue

            if _is_noise_game(game):
                continue

            # FIX: the historical curve is applied MULTIPLICATIVELY and is only
            # used where the venue actually has observations for that bucket;
            # otherwise the hand-written curve stands on its own. The previous
            # 60/40 and 50/50 linear blends against a floor of 0.10 dragged every
            # hour toward ~1.0, which is why closed rooms still showed ~40% of
            # their median tables at 6am.
            hist_hour_mult = pat['hour_multipliers'].get(central_hour)
            hour_factor = tod_mult if hist_hour_mult is None else hist_hour_mult

            hist_dow_mult = pat['dow_multipliers'].get(dow)
            dow_factor = dow_mult if hist_dow_mult is None else hist_dow_mult

            target_tables = level * hour_factor * dow_factor

            # Noise scales WITH the modelled activity level. A fixed sigma floor
            # applied to a target of zero re-opened closed rooms: sigma 0.5 on
            # target 0, clipped at 0 and rounded, put a table on roughly one
            # game in four at 6am — the exact artifact the observed-activity
            # multipliers above are meant to remove.
            activity     = min(1.0, target_tables / level) if level > 0 else 0.0
            noise_sigma  = max(0.5, baseline * NOISE_SIGMA_FACTOR) * activity
            noisy_tables = target_tables + random.gauss(0, noise_sigma)

            # FIX: mean-reverting continuity. Real table counts drift by a table
            # or two per quarter hour; they do not teleport between 2 and 9.
            prev = continuity.get((slug, game))
            if prev is not None:
                noisy_tables = (CONTINUITY_WEIGHT * prev
                                + (1.0 - CONTINUITY_WEIGHT) * noisy_tables)

            if venue_dark:
                noisy_tables = 0.0

            # FIX: cap at the maximum ever observed, not max + 1 — a venue must
            # never report more tables than have ever been seen there.
            tables_running = max(0, min(int(round(noisy_tables)), int(max_t)))
            next_continuity[(slug, game)] = tables_running

            players_waiting = 0
            if tables_running > 0:
                overflow_threshold = max(1, int(pat['max_tables'] * WAITLIST_OVERFLOW_FACTOR))
                if tables_running >= overflow_threshold:
                    overflow = tables_running - overflow_threshold + 1
                    max_w    = max(1, int(pat['max_waiting']))
                    players_waiting = random.randint(0, min(max_w, overflow * 3))
                elif random.random() < 0.03:
                    players_waiting = random.randint(1, 3)

            rows.append({
                'bravo_slug':       slug,
                'venue_name':       venue_name,
                'game_name':        game,
                'tables_running':   tables_running,
                'players_waiting':  players_waiting,
                'scrape_timestamp': snap_ts,
                # NO PAGE WAS FETCHED, so there is no page hash. This column
                # holds the sha256 of a real fetched body for real scrapes; the
                # previous sha256(batch_uuid) value was a synthetic audit
                # artifact that made a generated row look like a verified fetch.
                'scrape_html_hash': None,
                'scrape_batch_id':  batch_id,
                # Modelled, not observed - see SIM_DATA_QUALITY_HONEST above.
                'data_quality':     sim_data_quality(),
                'source':           'bravo',             # API gives Bravo priority over PA catalog
                'buyin_range':      pat.get('buyin_range') or None,
                'runs_schedule':    None,
            })
            games_generated += 1

    # Only remember venues we actually published this cycle.
    continuity.clear()
    continuity.update(next_continuity)

    log.info(
        f'  Generated {games_generated:,} game rows across {venues_processed:,} venues '
        f'({venues_skipped:,} skipped: fresh real data) '
        f'| TOD mult: {tod_mult:.2f} | DOW mult: {dow_mult:.2f} '
        f'| Central: {central_hour:02d}:xx dow={dow} (UTC{central_offset:+d})'
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


def _generatable_venues(model: PatternModel) -> set:
    """
    Venues generate_snapshot() could actually emit rows for: at least one
    non-noise game with a table count ever observed above zero.

    PokerAtlas-sourced venues never qualify — that source publishes no live
    table count, so their patterns are all-zero and are skipped by the same
    gates inside generate_snapshot(). They must therefore not be counted when
    asking "has the real scraper covered everything we model?".
    """
    productive: set = set()
    for slug in model.get_venues():
        for game in model.get_games_for_venue(slug):
            pat = model.get_pattern(slug, game)
            if not pat or _is_noise_game(game):
                continue
            if pat['baseline_tables'] > 0 or pat['max_tables'] > 0:
                productive.add(slug)
                break
    return productive


def _real_data_covers_model(model: PatternModel, skip_slugs: set) -> bool:
    """
    True when every venue this model could publish already has fresh, genuinely
    scraped rows — i.e. the real Bravo scraper is back and there is nothing left
    for the simulator to cover. That is a HEALTHY state, not a failure.
    """
    productive = _generatable_venues(model)
    return bool(productive) and productive.issubset(skip_slugs)


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


def _activity_multipliers(records: list, field: str, num_buckets: int,
                          overall_mean: float) -> dict:
    """
    Build per-bucket activity multipliers from OBSERVED TABLE COUNTS.

    multiplier[b] = mean(tables observed in bucket b) / mean(tables overall)

    Observations with tables == 0 are counted in the denominator, so a room that
    is genuinely closed between 4am and 8am scores near zero for those hours
    instead of being floored at 0.10.

    Buckets with fewer than MIN_BUCKET_OBSERVATIONS samples map to None, meaning
    "no usable signal" — the caller falls back to the hand-written curve rather
    than inventing one from two data points.

    FIX: the previous implementation divided the NUMBER OF HISTORY ROWS per
    bucket by the busiest bucket's row count. With a fixed 15-minute polling
    cadence that is near-uniform by construction, so it encoded scraper uptime,
    not poker activity, and normalised to ~1.0 nearly everywhere.
    """
    sums:   dict = defaultdict(float)
    counts: dict = defaultdict(int)
    for r in records:
        b = r.get(field)
        if b is None:
            continue
        sums[b]   += r['tables']
        counts[b] += 1

    result: dict = {}
    for i in range(num_buckets):
        n = counts.get(i, 0)
        if n < MIN_BUCKET_OBSERVATIONS or overall_mean <= 0:
            result[i] = None
            continue
        # Clamp the upper end so one freak night cannot make a bucket explode.
        result[i] = min(3.0, (sums[i] / n) / overall_mean)
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
    """
    Write the heartbeat file ATOMICALLY (tmp + os.replace) so a watchdog can
    never read a half-written JSON document, and LOG failures instead of
    swallowing them — a silent heartbeat failure is indistinguishable from a
    dead daemon.

    'consecutive_failures' is always present so a watchdog can act on it.
    """
    hb = {
        'daemon':               'bravo-simulator',
        'status':               status,
        'timestamp':            datetime.now(timezone.utc).isoformat(),
        'pid':                  os.getpid(),
        'consecutive_failures': 0,
    }
    if extra:
        hb.update(extra)
    tmp = HEARTBEAT.with_suffix('.json.tmp')
    try:
        with open(tmp, 'w') as f:
            json.dump(hb, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, HEARTBEAT)
    except Exception as e:
        log.warning(f'  Heartbeat write FAILED ({type(e).__name__}: {e}) — '
                    f'health monitoring for this daemon is now blind')
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass


# ═════════════════════════════════════════════════════════════════
# PID GUARD
# ═════════════════════════════════════════════════════════════════

def _process_cmdline(pid: int) -> str:
    """
    Best-effort command line for a PID. Returns '' when it cannot be determined
    (which the caller must treat as "unknown", never as "not ours").
    """
    proc_path = Path(f'/proc/{pid}/cmdline')
    try:
        if proc_path.exists():
            return proc_path.read_bytes().replace(b'\0', b' ').decode('utf-8', 'replace')
    except Exception:
        pass
    try:
        import subprocess
        out = subprocess.run(['ps', '-p', str(pid), '-o', 'command='],
                             capture_output=True, timeout=5)
        return out.stdout.decode('utf-8', 'replace').strip()
    except Exception:
        return ''


def _check_pid_guard():
    """
    Refuse to start when a prior instance is still alive. Two simulators would
    alternately delete each other's batches.

    FIX: PermissionError from os.kill(pid, 0) means the process EXISTS and is
    owned by another user — the opposite of "dead". Treating it as stale let a
    second instance start. It is now treated as alive.

    FIX: PIDs are recycled across reboots, so an unrelated live process could be
    mistaken for a prior simulator. The recorded command line is checked; only a
    PID we can positively identify as NOT ours is treated as stale.
    """
    if not PID_FILE.exists():
        return  # No prior instance

    try:
        prior_pid = int(PID_FILE.read_text().strip().splitlines()[0])
    except (ValueError, IndexError, OSError):
        log.warning('  Unreadable PID file — treating as stale and overwriting.')
        return

    try:
        os.kill(prior_pid, 0)
    except ProcessLookupError:
        log.warning(f'  Stale PID file (PID {prior_pid} no longer exists) — overwriting.')
        return
    except PermissionError:
        # Process exists but is owned by another user (launchd/root context).
        log.error(
            f'FATAL: PID {prior_pid} is alive and owned by another user. '
            f'Refusing to start a second simulator instance.'
        )
        sys.exit(1)
    except OSError as e:
        log.error(f'FATAL: cannot determine whether PID {prior_pid} is alive ({e}). '
                  f'Refusing to start.')
        sys.exit(1)

    # The PID is alive. Is it actually us, or a recycled PID?
    cmdline = _process_cmdline(prior_pid)
    if cmdline and 'bravo-simulator-daemon' not in cmdline:
        log.warning(
            f'  PID {prior_pid} is alive but is not a simulator '
            f'({cmdline[:120]}) — recycled PID, overwriting.'
        )
        return

    log.error(
        f'FATAL: Another simulator instance is already running (PID {prior_pid}). '
        f'Kill it first: kill {prior_pid}'
    )
    sys.exit(1)


def _write_pid_files():
    """
    PID_FILE stays a bare integer so `kill $(cat ...)` keeps working; the
    identifying metadata goes in a sidecar.
    """
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))
    try:
        with open(PID_META, 'w') as f:
            json.dump({
                'pid':        os.getpid(),
                'started_at': datetime.now(timezone.utc).isoformat(),
                'argv':       sys.argv,
            }, f, indent=2)
    except Exception as e:
        log.warning(f'  Could not write PID metadata: {type(e).__name__}: {e}')


# ═════════════════════════════════════════════════════════════════
# MAIN DAEMON LOOP
# ═════════════════════════════════════════════════════════════════

def run():
    # FIX: Check for running instance BEFORE writing PID
    _check_pid_guard()

    _write_pid_files()

    log.info('=' * 60)
    log.info('BRAVO POKER LIVE — SIMULATION DAEMON v1.2')
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
        write_heartbeat('error', {
            'error': f'model_build_failed: {e}',
            'consecutive_failures': 1,
        })
        sys.exit(1)

    model_built_at = time.time()
    write_heartbeat('running', {
        'venues':           len(model.get_venues()),
        'cycle':            0,
        'history_age_days': round(model.history_age_days() or -1, 2),
    })

    cycle                = 0
    consecutive_failures = 0
    delete_failures      = 0
    last_good_batch_id: Optional[str] = None
    continuity: dict     = {}   # {(slug, game): tables} — cycle-to-cycle continuity

    # NOTE: there is deliberately NO startup purge and NO periodic purge. A
    # DELETE with no paired INSERT leaves the live-tables surface empty, and
    # that empty response is CDN-cached. Leftover sim rows from a previous run
    # are swept away by the stale-row DELETE that follows the first successful
    # INSERT below.

    while not shutdown[0]:
        cycle += 1
        cycle_start = time.time()
        now_utc = datetime.now(timezone.utc)

        log.info(f'--- Cycle #{cycle} | {now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")} ---')
        # Keep the heartbeat fresh while the cycle runs, WITHOUT clearing the
        # failure counter a watchdog may be acting on.
        write_heartbeat('running', {
            'cycle':                cycle,
            'last_cycle_start':     now_utc.isoformat(),
            'consecutive_failures': consecutive_failures,
        })

        try:
            # ── Scheduled model rebuild ────────────────────────────────
            # Without this, a daemon started in January publishes January's
            # venue list and January's baselines forever.
            if MODEL_REBUILD_SECONDS > 0 and (time.time() - model_built_at) > MODEL_REBUILD_SECONDS:
                log.info('  Rebuilding pattern model (scheduled refresh)...')
                try:
                    fresh = PatternModel()
                    fresh.build()
                    model = fresh
                    model_built_at = time.time()
                    log.info('  Pattern model refreshed.')
                except Exception as e:
                    # Keep serving the previous model, but say so loudly and
                    # retry in about an hour rather than every cycle.
                    log.error(f'  Model rebuild FAILED, keeping previous model: '
                              f'{type(e).__name__}: {e}')
                    model_built_at = time.time() - MODEL_REBUILD_SECONDS + 3600

            # ── Staleness gate ─────────────────────────────────────────
            age_days = model.history_age_days()
            if age_days is None or age_days > MAX_HISTORY_AGE_DAYS:
                raise RuntimeError(
                    f'model history is stale ({age_days} days > {MAX_HISTORY_AGE_DAYS}) '
                    f'— refusing to publish modelled rows'
                )

            # ── Recover from a broken stale-row DELETE ─────────────────
            if delete_failures >= MAX_DELETE_FAILURES:
                if last_good_batch_id:
                    log.error(f'  Stale-row DELETE has failed {delete_failures}x — '
                              f'retrying cleanup before writing any more rows.')
                    if sb_delete_simulator_rows('venue_live_tables',
                                                except_batch_id=last_good_batch_id):
                        delete_failures = 0
                        log.info('  Stale-row cleanup recovered.')
                if delete_failures >= MAX_DELETE_FAILURES:
                    raise RuntimeError(
                        'stale sim-row DELETE keeps failing; skipping INSERT so the '
                        'table cannot grow without bound'
                    )

            # ── Never overwrite fresh real data ────────────────────────
            skip_slugs = fetch_fresh_real_slugs()
            if skip_slugs:
                log.info(f'  {len(skip_slugs):,} venues have real scraped data newer than '
                         f'{REAL_DATA_FRESH_SECONDS // 60}min — not simulating them')

            rows = generate_snapshot(model, now_utc,
                                     skip_slugs=skip_slugs,
                                     continuity=continuity)

            if not rows and _real_data_covers_model(model, skip_slugs):
                # NOT a failure: the real Bravo scraper is publishing fresh rows
                # for every venue this model can generate, which is exactly the
                # condition the simulator exists to cover for. Reporting 'error'
                # here would make the watchdog restart a perfectly healthy
                # daemon every 15 minutes for as long as the real scraper works.
                #
                # Retire any leftover sim rows while we are here: real rows now
                # sit behind every venue they covered, so this DELETE is not the
                # unpaired purge that empties the live surface. A failure is
                # logged but does NOT count toward delete_failures — nothing was
                # inserted, so duplicates cannot grow from this path.
                log.info('  Real scraper covers every modelled venue — standing down '
                         'this cycle and clearing leftover sim rows.')
                if sb_delete_simulator_rows('venue_live_tables'):
                    consecutive_failures = 0
                    delete_failures      = 0
                    last_good_batch_id   = None
                    write_heartbeat('idle', {
                        'cycle':                cycle,
                        'reason':               'real_data_covers_all_venues',
                        'venues_skipped_real':  len(skip_slugs),
                        'records_saved':        0,
                        'history_age_days':     round(age_days, 2),
                        'consecutive_failures': 0,
                    })
                else:
                    consecutive_failures += 1
                    log.error('  Leftover sim-row purge FAILED while standing down.')
                    write_heartbeat('error', {
                        'cycle':                cycle,
                        'error':                'stale_delete_failed',
                        'records_saved':        0,
                        'consecutive_failures': consecutive_failures,
                    })
            elif not rows:
                # This IS a failure: venues remain uncovered by real data and the
                # model still produced nothing for them, so the live-tables
                # surface has nothing behind it.
                consecutive_failures += 1
                log.error('  No rows generated — pattern model produced nothing.')
                write_heartbeat('error', {
                    'cycle': cycle,
                    'error': 'no_rows_generated',
                    'venues_skipped_real': len(skip_slugs),
                    'consecutive_failures': consecutive_failures,
                })
            else:
                batch_id = rows[0]['scrape_batch_id']

                # FIX: INSERT the new batch FIRST, then DELETE the older sim
                # rows. The old order (delete → insert) guaranteed a window of
                # several seconds where the API returned zero live games, and
                # that empty response was CDN-cached for up to 60s.
                log.info(f'  Inserting {len(rows):,} rows into venue_live_tables...')
                saved, failed_chunks = sb_insert('venue_live_tables', rows)

                live_tables = sum(r['tables_running'] for r in rows)
                waiting     = sum(r['players_waiting'] for r in rows)
                venues_live = len(set(r['bravo_slug'] for r in rows if r['tables_running'] > 0))

                if saved == 0:
                    consecutive_failures += 1
                    log.error(
                        f'  ZERO rows saved despite {len(rows)} generated — '
                        f'check Supabase connection and RLS policies. '
                        f'Previous batch left in place.'
                    )
                    write_heartbeat('error', {
                        'cycle': cycle,
                        'error': 'zero_rows_saved',
                        'records_saved': 0,
                        'consecutive_failures': consecutive_failures,
                    })
                elif failed_chunks:
                    # A partial insert is a partial outage. Do NOT delete the
                    # previous batch — its rows still cover the venues this
                    # batch failed to write.
                    consecutive_failures += 1
                    log.error(
                        f'  PARTIAL WRITE: {saved:,}/{len(rows):,} rows saved, '
                        f'{failed_chunks} chunk(s) failed. Previous batch kept as '
                        f'cover; stale-row cleanup skipped.'
                    )
                    write_heartbeat('error', {
                        'cycle': cycle,
                        'error': f'partial_write:{failed_chunks}_chunks_failed',
                        'records_saved': saved,
                        'records_expected': len(rows),
                        'batch_id': batch_id,
                        'consecutive_failures': consecutive_failures,
                    })
                else:
                    log.info(f'  Saved {saved:,}/{len(rows):,} rows | Batch: {batch_id}')
                    log.info(
                        f'  Stats: {venues_live} venues active | '
                        f'{live_tables} tables running | {waiting} players waiting'
                    )

                    # Swap complete — now retire every older sim batch.
                    if sb_delete_simulator_rows('venue_live_tables',
                                                except_batch_id=batch_id):
                        delete_failures = 0
                        consecutive_failures = 0
                        last_good_batch_id = batch_id
                        write_heartbeat('running', {
                            'cycle':                cycle,
                            'records_saved':        saved,
                            'venues_active':        venues_live,
                            'venues_skipped_real':  len(skip_slugs),
                            'tables_running':       live_tables,
                            'players_waiting':      waiting,
                            'batch_id':             batch_id,
                            'history_age_days':     round(age_days, 2),
                            'consecutive_failures': 0,
                        })
                    else:
                        # Rows are correct but duplicated with the prior batch.
                        delete_failures      += 1
                        consecutive_failures += 1
                        last_good_batch_id    = batch_id
                        log.error(
                            f'  Stale sim-row DELETE failed ({delete_failures} in a row) — '
                            f'venue_live_tables now holds duplicate sim batches.'
                        )
                        write_heartbeat('error', {
                            'cycle':                cycle,
                            'error':                'stale_delete_failed',
                            'records_saved':        saved,
                            'batch_id':             batch_id,
                            'consecutive_failures': consecutive_failures,
                        })

        except Exception as e:
            consecutive_failures += 1
            log.error(f'  Cycle #{cycle} error: {type(e).__name__}: {e}')
            traceback.print_exc()
            write_heartbeat('error', {
                'cycle': cycle,
                'error': str(e),
                'consecutive_failures': consecutive_failures,
            })

        # ── Sleep until next cycle ──────────────────────────────────
        elapsed   = time.time() - cycle_start
        sleep_for = max(0, CYCLE_INTERVAL_SECONDS - elapsed)

        if not shutdown[0]:
            log.info(f'  Next cycle in {sleep_for/60:.1f} minutes...')
            slept = 0
            while slept < sleep_for and not shutdown[0]:
                time.sleep(min(5, sleep_for - slept))
                slept += 5

    # ── Cleanup on exit ─────────────────────────────────────────────
    log.info('Simulator daemon stopped cleanly.')
    write_heartbeat('stopped')
    for path in (PID_FILE, PID_META):
        try:
            path.unlink(missing_ok=True)
        except Exception as e:
            log.warning(f'  Could not remove {path.name}: {type(e).__name__}: {e}')


if __name__ == '__main__':
    run()
