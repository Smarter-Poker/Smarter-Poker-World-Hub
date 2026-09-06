#!/usr/bin/env python3
"""
BRAVO POKER LIVE — OBSERVED-HISTORY ESTIMATOR DAEMON v1.4
============================================================
PURPOSE: Publishes Poker Near Me estimates while the real Bravo scraper is
         offline, but only where a RECENT window of saved Bravo observations
         contains enough samples for that exact venue, game, Central weekday,
         and Central hour.

         These rows are MODELLED, NOT OBSERVED. They are marked as such: the
         batch id is prefixed 'sim-', scrape_html_hash is NULL because no page
         was fetched, and the API reports them as data_quality
         'modeled_estimate'. Nothing here may be presented as a real scrape.
         Venues that have fresh real scraped data are never simulated.

ARCHITECTURE:
  Phase 1 (startup, rebuilt every 24h): Pull a RECENT window of
                     game_live_history from Supabase, retain qualified Bravo
                     observations, and map them to unique active directory
                     venues. PokerAtlas rows may enrich metadata only.
  Phase 2 (every 15 min): Select the saved median for the exact Central
                           weekday/hour context, UPSERT the modeled batch to
                           venue_live_tables, then DELETE stale sim rows.

REALISM FEATURES:
  • Exact venue + game + Central weekday + Central hour evidence gates
  • Median tables/waiting derived only from qualified Bravo observations
  • Minimum sample and distinct-date floors for every published context
  • Deterministic estimates: no generic curve, random noise, or blackout
  • Catalog metadata can enrich a matched observed game but cannot create one
  • Ambiguous or unmatched directory identities fail closed
  • Batch_id prefixed "sim-" for audit trail (never confused with real scrapes)
  • Writes observation_kind='modeled' while retaining the legacy source key
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

CHANGELOG v1.3 (retry safety):
  • RETRIES ARE IDEMPOTENT: every modeled current-feed row carries a stable
    negative primary key scoped to source + batch + venue + game. PostgREST
    conflict-merges those IDs and returns the persisted rows for confirmation,
    so a commit followed by a lost response cannot duplicate the batch.

CHANGELOG v1.4 (observed-history truth gate):
  • Removed the arbitrary one-table baseline for PokerAtlas-only catalog rows.
  • Removed hand-authored hour/day curves, random noise, random blackout, and
    simulated continuity as sources of activity counts.
  • An estimate now requires enough saved Bravo observations for the exact
    venue/game/weekday/hour context across multiple dates.
  • Qualified history is mapped to a unique active physical directory venue;
    ambiguous, orphaned, catalog-only, insufficient, or stale data publishes
    no count and retires prior modeled rows.

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

import fcntl
import html
import json
import os
import re
import sys
import time
import uuid
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
from scraper_data_truth import (
    OBSERVATION_MODELED,
    QUALITY_MODELED,
    classify_persisted_run,
    is_observed_bravo_row,
    stable_live_row_id,
)

# ── PATH SETUP ──────────────────────────────────────────────────
project_root = Path(__file__).resolve().parent.parent
for env_file in ['.env.local', '.env.production.local', '.env.prod', '.env']:
    env_path = project_root / env_file
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        break
load_dotenv()

# ── CONFIG ──────────────────────────────────────────────────────
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

# History recency. The model must reflect the CURRENT venue landscape, not the
# oldest rows in the table. Fetch newest-first inside this window...
HISTORY_WINDOW_DAYS  = _env_int('SIM_HISTORY_WINDOW_DAYS', 90)
# ...and refuse to publish at all once the newest row we can see is this old.
MAX_HISTORY_AGE_DAYS = _env_int('SIM_MAX_HISTORY_AGE_DAYS', 14)
# A single scrape or a single date is not a weekday/hour pattern. Six samples
# across at least three distinct Central dates is deliberately conservative
# while still allowing a venue sampled twice per matching hour to qualify after
# three occurrences of that weekday.
MIN_CONTEXT_OBSERVATIONS = _env_int('SIM_MIN_CONTEXT_OBSERVATIONS', 6)
MIN_CONTEXT_DAYS = _env_int('SIM_MIN_CONTEXT_DAYS', 3)
# Rebuild the pattern model on this cadence so a long-running daemon does not
# publish a frozen snapshot of the world forever.
MODEL_REBUILD_SECONDS = _env_int('SIM_MODEL_REBUILD_SECONDS', 24 * 3600)
# A venue with genuinely scraped rows newer than this is NOT simulated.
REAL_DATA_FRESH_SECONDS = _env_int('SIM_REAL_DATA_FRESH_SECONDS', 2700)  # 45 min
# Stop inserting after this many consecutive stale-row delete failures, so a
# broken DELETE cannot grow the table without bound.
MAX_DELETE_FAILURES = 3

LOG_DIR   = project_root / 'data' / 'bravo-logs'
PID_FILE  = LOG_DIR / 'simulator.pid'
PID_META  = LOG_DIR / 'simulator-pid-meta.json'
LOCK_FILE = LOG_DIR / 'simulator.lock'
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
# venue_live_tables.data_quality historically rejected 'simulated'. Migration
# 20260906210000_pnm_scraper_data_truth.sql adds the honest quality and the
# observation_kind discriminator. This daemon deliberately FAILS CLOSED when
# that contract is absent: a modeled row may never be relabelled as a verified
# scrape merely to keep a dashboard populated.
#
# NOTE: `source` deliberately stays 'bravo'. live-tables.js keys its
# cross-source slug index on source=='bravo' and derives simulated-ness from
# scrape_batch_id starting 'sim-' (isSimulatedRow), so changing source would
# empty that index and break PokerAtlas->Bravo venue merging, while fixing
# nothing the batch-id check does not already handle.
def sim_data_quality() -> str:
    """Label to stamp on generated rows this cycle."""
    return QUALITY_MODELED


def sb_insert(table: str, data: list, batch_size: int = 200) -> tuple:
    """
    Idempotently UPSERT current-feed rows and confirm their deterministic IDs.
    Returns (rows_saved, failed_chunks) — the caller MUST treat any failed chunk
    as a cycle error; a partial write is a partial outage.

    ``venue_live_tables`` has no natural key on (bravo_slug, game_name), but its
    primary key can still make transport retries safe. ``generate_snapshot``
    assigns a stable negative ID scoped to source + batch + venue + game, so a
    request that commits before its response is lost is merged on retry instead
    of duplicated. A fresh batch still receives fresh IDs and replaces the old
    one through the post-write stale-row sweep.

    FIX: permanent 4xx responses are no longer retried three times, and the
    PostgREST error body is logged instead of a bare 'HTTP Error 400'.
    """
    confirmed_ids = set()
    failed_chunks = 0
    for i in range(0, len(data), batch_size):
        chunk = data[i:i + batch_size]
        body = json.dumps(chunk).encode()
        expected_ids = {int(row['id']) for row in chunk}
        chunk_no = i // batch_size + 1
        saved = False
        for attempt in range(3):
            # Build a fresh Request per attempt — a consumed request body cannot
            # be safely replayed.
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/{table}',
                data=body, method='POST',
                headers={
                    **SB_HEADERS,
                    'Prefer': 'resolution=merge-duplicates,return=representation',
                }
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    returned = json.loads(response.read() or b'[]')
                returned_ids = {
                    int(row['id']) for row in returned
                    if isinstance(row, dict) and row.get('id') is not None
                } if isinstance(returned, list) else set()
                if returned_ids == expected_ids:
                    confirmed_ids.update(expected_ids)
                    saved = True
                    break

                detail = (
                    f'persistence mismatch: '
                    f'{len(returned_ids & expected_ids)}/{len(expected_ids)} '
                    'deterministic IDs confirmed'
                )
                if attempt < 2:
                    log.warning(f'  Batch {chunk_no}: retry {attempt+1} ({detail})')
                    time.sleep(2 ** attempt)
                else:
                    log.error(f'  Batch {chunk_no} FAILED after 3 retries: {detail}')
            except urllib.error.HTTPError as e:
                detail = _http_error_detail(e)
                if not _is_retryable_http(e):
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
    return len(confirmed_ids), failed_chunks

def sb_delete_simulator_rows(table: str, except_batch_id: Optional[str] = None) -> bool:
    """
    Delete simulator-generated rows (identified by scrape_batch_id starting with
    'sim-') from venue_live_tables. When except_batch_id is given, the rows of
    that batch are KEPT — this is the stale-row sweep that runs AFTER the fresh
    batch has been written, so readers never see an empty table.

    Returns True only when the DELETE actually succeeded; every call site must
    check it, because deterministic IDs protect retries within one batch, not
    accumulation across distinct batch IDs when stale cleanup fails.

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
    req = urllib.request.Request(url, method='DELETE', headers={
        **SB_HEADERS,
        'Prefer': 'return=minimal',
    })
    try:
        with urllib.request.urlopen(req, timeout=20):
            pass

        # A successful HTTP status only acknowledges the request. Verify the
        # exact predicate before treating the stale batch as retired.
        verify_params = [('select', 'id'), ('limit', '1'), *filters]
        verify_url = (
            f'{SUPABASE_URL}/rest/v1/{table}?'
            f'{urllib.parse.urlencode(verify_params)}'
        )
        verify_req = urllib.request.Request(verify_url, headers=SB_HEADERS)
        with urllib.request.urlopen(verify_req, timeout=20) as response:
            remaining = json.loads(response.read() or b'[]')
        if not isinstance(remaining, list):
            log.error('  sim-row cleanup verification returned a non-list payload')
            return False
        if remaining:
            log.error('  sim-row cleanup verification found rows still matching the delete')
            return False
        return True
    except urllib.error.HTTPError as e:
        log.error(f'  sim-row cleanup FAILED: {_http_error_detail(e)}')
        return False
    except Exception as e:
        log.error(f'  sim-row cleanup FAILED: {type(e).__name__}: {e}')
        return False


def retire_unqualified_simulator_rows() -> bool:
    """Remove all simulator-owned rows when no qualified estimate can replace them.

    The delegated predicate is strictly ``scrape_batch_id like sim-%``. Observed
    Bravo rows and PokerAtlas catalog rows are outside that ownership boundary.
    """
    return sb_delete_simulator_rows('venue_live_tables')


def fetch_fresh_real_slugs(model: Optional['PatternModel'] = None) -> set:
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
                'select':           'bravo_slug,source,observation_kind,scrape_batch_id,scrape_timestamp',
                'scrape_timestamp': f'gte.{cutoff}',
                'order':            'bravo_slug.asc,game_name.asc,scrape_timestamp.desc',
                'limit':            page_size,
                'offset':           offset,
            }
        )
        if not rows:
            break
        for row in rows:
            slug  = row.get('bravo_slug') or ''
            if slug and is_observed_bravo_row(row):
                canonical = model.resolve_directory_slug(row) if model else slug
                if canonical:
                    fresh.add(canonical)
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

PHYSICAL_DIRECTORY_VENUE_TYPES = frozenset({
    'casino', 'poker_club', 'card_room', 'charity',
})


def _identity_slug(value) -> str:
    """Normalize a saved source slug without guessing a venue identity."""
    return str(value or '').strip().lower().strip('/')


def _normalize_identity(value) -> str:
    """Exact, punctuation-insensitive venue-name key for fail-closed joins."""
    text = html.unescape(str(value or '')).lower().replace('&', ' and ')
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def _normalize_game_name(value) -> str:
    """Return a stable human game label, or an empty string for bad input."""
    return re.sub(r'\s+', ' ', html.unescape(str(value or ''))).strip()


def _nonnegative_int(value) -> Optional[int]:
    """Parse a saved observed count without turning missing data into zero."""
    if value is None or value == '' or isinstance(value, bool):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


class PatternModel:
    """
    Holds per-(directory venue, game) context medians from observed Bravo data.

    Attributes per entry:
      context_baselines: dict[(central_weekday, central_hour)] containing only
                         contexts with enough observed samples across enough
                         distinct dates
      stakes           : most common stakes string seen
      buyin_range      : most common buyin_range observed FOR THIS GAME
      observed_count   : number of real data points used
      observed_days    : distinct Central dates represented
      source           : always 'bravo'
    """

    def __init__(self):
        self._patterns: dict = {}      # {(bravo_slug, game_name): PatternEntry}
        self._venue_names: dict = {}   # {bravo_slug: venue_name}
        self._directory_identity_index: dict = {}
        self._directory_name_index: dict = {}
        self._directory_count: int = 0
        self._is_built: bool = False
        self._newest_snapshot: Optional[datetime] = None
        self._rows_loaded: int = 0
        self._qualified_rows: int = 0
        self._qualified_directory_venues: int = 0
        self._rejected_ambiguous_or_unmatched: int = 0
        self._rejected_unqualified: int = 0

    def build(self):
        """
        Build a model from observed Bravo history mapped to public venues.

        Network/schema failures raise. Zero qualified observations is a valid,
        truthful state: the model remains empty so the cycle can retire legacy
        simulator rows and publish count-unavailable instead of inventing data.
        """
        log.info('Building pattern model from historical data...')

        rows_bravo = self._fetch_history('bravo')
        # PokerAtlas can enrich metadata only after a real Bravo pattern
        # exists. Avoid downloading tens of thousands of catalog rows when
        # there is no qualified count-bearing source to enrich.
        rows_pa = self._fetch_history('pokeratlas') if rows_bravo else []

        log.info(f'  Bravo rows: {len(rows_bravo):,}  PokerAtlas rows: {len(rows_pa):,}')

        # A count is useful to a card only when the saved source identity maps to
        # one unique active physical venue. The durable directory is required;
        # transient feed rows are deliberately not treated as identity truth.
        self._load_directory_venues()

        # Bravo is the only count-bearing source. PokerAtlas may contribute
        # stakes/buy-in metadata after it maps to the same directory venue/game.
        all_rows = rows_bravo + rows_pa
        self._rows_loaded = len(all_rows)

        raw: dict[tuple, list] = defaultdict(list)
        rejected_venue_slugs: set[str] = set()
        for r in all_rows:
            source = str(r.get('source') or '').strip().lower()
            if source not in ('bravo', 'pokeratlas'):
                continue

            qualified = is_observed_bravo_row(r)
            if source == 'bravo' and not qualified:
                self._rejected_unqualified += 1
                continue

            source_slug = _identity_slug(r.get('bravo_slug'))
            source_name = _normalize_game_name(r.get('venue_name'))
            if _is_noise_venue(source_name, source_slug):
                self._rejected_ambiguous_or_unmatched += 1
                rejected_venue_slugs.add(source_slug)
                continue

            directory_venue = self._resolve_directory_venue(r)
            if not directory_venue:
                self._rejected_ambiguous_or_unmatched += 1
                rejected_venue_slugs.add(_identity_slug(r.get('bravo_slug')))
                continue

            game = _normalize_game_name(r.get('game_type') or r.get('game_name'))
            if not game or _is_noise_game(game):
                continue

            canonical_slug = directory_venue['_feed_slug']
            game_identity = _normalize_identity(game)
            if not game_identity:
                continue

            record = {
                'game':      game,
                'stakes':    _normalize_game_name(r.get('stakes')),
                'buyin':     _normalize_game_name(r.get('buyin_range')),
                'source':    source,
                'qualified': qualified,
            }

            if qualified:
                tables = _nonnegative_int(
                    r.get('tables') if 'tables' in r else r.get('tables_running')
                )
                waiting_raw = (
                    r.get('waiting') if 'waiting' in r else r.get('players_waiting')
                )
                waiting = 0 if waiting_raw in (None, '') else _nonnegative_int(waiting_raw)
                snapshot = _parse_utc(
                    r.get('snapshot_time') or r.get('scrape_timestamp')
                )
                if tables is None or waiting is None or snapshot is None:
                    self._rejected_unqualified += 1
                    continue
                central = snapshot + timedelta(
                    hours=_central_utc_offset_hours(snapshot)
                )
                record.update({
                    'tables':       tables,
                    'waiting':      waiting,
                    'hour':         central.hour,
                    'dow':          central.weekday(),
                    'central_date': central.date().isoformat(),
                    'snapshot':     snapshot,
                })
                self._qualified_rows += 1
                if self._newest_snapshot is None or snapshot > self._newest_snapshot:
                    self._newest_snapshot = snapshot

            raw[(canonical_slug, game_identity)].append(record)

        log.info(f'  Unique venue+game combos in history: {len(raw):,}')
        log.info(f'  Active physical directory venues: {self._directory_count:,}')
        if rejected_venue_slugs:
            log.warning(
                f'  Rejected {len(rejected_venue_slugs):,} ambiguous or unmatched '
                f'history venue identity/identities'
            )

        for (slug, _game_identity), records in raw.items():
            bravo_records = [r for r in records if r['qualified']]
            if not bravo_records:
                # Catalog rows establish game identity only. They can never
                # establish a table or waiting-count baseline.
                continue

            context_baselines = _build_context_baselines(bravo_records)
            if not context_baselines:
                continue

            game = bravo_records[0]['game']

            # Stakes/buy-in are keyed on (slug, game) — NEVER venue-wide — so a
            # 1/2 NLH buy-in range can't be attached to a 5/10 PLO game.
            stakes_counts: dict[str, int] = defaultdict(int)
            buyin_counts:  dict[str, int] = defaultdict(int)
            for r in records:
                if r['stakes']: stakes_counts[r['stakes']] += 1
                if r['buyin']:  buyin_counts[r['buyin']] += 1
            best_stakes = _most_common(stakes_counts)
            best_buyin  = _most_common(buyin_counts)

            self._patterns[(slug, game)] = {
                'context_baselines': context_baselines,
                'stakes':            best_stakes,
                'buyin_range':       best_buyin,
                'observed_count':    len(bravo_records),
                'observed_days':     len({r['central_date'] for r in bravo_records}),
                'source':            'bravo',
            }

        self._qualified_directory_venues = len(_generatable_venues(self))
        age_days = self.history_age_days()
        self._is_built = True
        age_label = f'{age_days:.2f} days' if age_days is not None else 'none'
        log.info(
            f'Pattern model built: {len(self._patterns):,} qualified venue+game '
            f'patterns across {self._qualified_directory_venues:,}/'
            f'{self._directory_count:,} directory venues | qualified rows '
            f'{self._qualified_rows:,} | newest qualified history {age_label}'
        )

    def history_age_days(self) -> Optional[float]:
        """Age in days of the freshest history row used, or None if unknown."""
        if self._newest_snapshot is None:
            return None
        delta = datetime.now(timezone.utc) - self._newest_snapshot
        return delta.total_seconds() / 86400.0

    # observation_kind is added by the data-truth migration and buyin_range is
    # not present in every deployment. Required legacy fields still include the
    # batch id so a pre-migration simulated source cannot be accepted as Bravo.
    _HISTORY_REQUIRED_FIELDS = (
        'bravo_slug', 'venue_name', 'game_type', 'stakes', 'tables', 'waiting',
        'snapshot_time', 'source', 'batch_id',
    )
    _HISTORY_OPTIONAL_FIELDS = ('observation_kind', 'buyin_range')

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
        optional_fields = list(self._HISTORY_OPTIONAL_FIELDS)
        log.info(f'  Fetching game_live_history (source={source}, last {HISTORY_WINDOW_DAYS}d)...')

        while fetched < MAX_HISTORY_ROWS:
            select = ','.join((*self._HISTORY_REQUIRED_FIELDS, *optional_fields))
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
                detail = _http_error_detail(e)
                # Strip only the optional field named by PostgREST, one at a
                # time. Any unknown 400 is a real schema/query failure.
                rejected_optional = next(
                    (field for field in optional_fields if field in detail), None
                )
                if e.code == 400 and offset == 0 and rejected_optional:
                    optional_fields.remove(rejected_optional)
                    log.warning(
                        f'  game_live_history rejected optional column '
                        f'{rejected_optional} ({detail}); refetching without it'
                    )
                    continue
                raise RuntimeError(
                    f'fetching {source} history failed: {detail}'
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

        log.info(f'  -> {len(rows):,} {source} rows loaded')
        return rows

    @staticmethod
    def _add_unique_index(index: dict, key: str, venue: dict) -> None:
        if not key:
            return
        current = index.get(key, '__missing__')
        if current == '__missing__':
            index[key] = venue
        elif current is not venue:
            index[key] = None

    def _load_directory_venues(self):
        """Load and index active physical card identities from poker_venues."""
        rows = []
        page_size = 1000
        max_pages = 10
        for page in range(max_pages):
            chunk = sb_fetch('poker_venues', {
                'select': (
                    'id,name,slug,pokeratlas_slug,venue_type,is_active,'
                    'is_suppressed,canonical_venue_id,country,state,city'
                ),
                'is_active': 'eq.true',
                'is_suppressed': 'eq.false',
                'canonical_venue_id': 'is.null',
                'id': 'neq.3109',
                'order': 'id.asc',
                'limit': page_size,
                'offset': page * page_size,
            })
            if not isinstance(chunk, list):
                raise RuntimeError('poker_venues returned a non-list payload')
            rows.extend(chunk)
            if len(chunk) < page_size:
                break
        else:
            raise RuntimeError(
                f'poker_venues exceeded the {max_pages * page_size:,}-row '
                'identity safety ceiling'
            )

        eligible = []
        canonical_counts: dict[str, int] = defaultdict(int)
        for row in rows:
            venue_type = str(row.get('venue_type') or '').strip().lower()
            if (
                venue_type not in PHYSICAL_DIRECTORY_VENUE_TYPES
                or row.get('is_active') is False
                or row.get('is_suppressed') is True
            ):
                continue
            name = _normalize_game_name(row.get('name'))
            if not name or _is_noise_venue(name):
                continue
            slug = _identity_slug(row.get('slug'))
            pokeratlas_slug = _identity_slug(row.get('pokeratlas_slug'))
            venue_id = row.get('id')
            feed_slug = slug or (f'pa-{pokeratlas_slug}' if pokeratlas_slug else '')
            if not feed_slug and venue_id is not None:
                feed_slug = f'pnm-venue-{venue_id}'
            if not feed_slug:
                continue
            venue = {
                **row,
                '_feed_slug': feed_slug,
                '_name_key': _normalize_identity(name),
                '_slug': slug,
                '_pokeratlas_slug': pokeratlas_slug,
            }
            eligible.append(venue)
            canonical_counts[feed_slug] += 1

        for venue in eligible:
            if canonical_counts[venue['_feed_slug']] != 1:
                continue
            self._directory_count += 1
            feed_slug = venue['_feed_slug']
            self._venue_names[feed_slug] = venue['name']

            identity_keys = {
                feed_slug,
                venue['_slug'],
                venue['_pokeratlas_slug'],
                f"pa-{venue['_slug']}" if venue['_slug'] else '',
                f"pa-{venue['_pokeratlas_slug']}" if venue['_pokeratlas_slug'] else '',
            }
            for key in identity_keys:
                self._add_unique_index(self._directory_identity_index, key, venue)
            self._add_unique_index(
                self._directory_name_index, venue['_name_key'], venue
            )

        if self._directory_count == 0:
            raise RuntimeError('no active physical directory venues available for identity mapping')

    def _resolve_directory_venue(self, row: dict) -> Optional[dict]:
        """Resolve a history row to one unique directory venue, or fail closed."""
        raw_slug = _identity_slug(row.get('bravo_slug'))
        slug_candidates = [raw_slug]
        for prefix in ('pa-', 'bravo-'):
            if raw_slug.startswith(prefix):
                slug_candidates.append(raw_slug[len(prefix):])

        for key in slug_candidates:
            if key not in self._directory_identity_index:
                continue
            return self._directory_identity_index[key]

        name_key = _normalize_identity(row.get('venue_name'))
        if name_key in self._directory_name_index:
            return self._directory_name_index[name_key]
        return None

    def resolve_directory_slug(self, row: dict) -> Optional[str]:
        """Return the canonical feed slug for a uniquely matched current row."""
        venue = self._resolve_directory_venue(row)
        return venue['_feed_slug'] if venue else None

    def get_venues(self) -> list:
        return sorted(set(slug for (slug, _) in self._patterns.keys()))

    def get_games_for_venue(self, slug: str) -> list:
        return [game for (s, game) in self._patterns.keys() if s == slug]

    def get_pattern(self, slug: str, game: str) -> Optional[dict]:
        return self._patterns.get((slug, game))

    def qualification_summary(self) -> dict:
        return {
            'directory_venues': self._directory_count,
            'qualified_rows': self._qualified_rows,
            'qualified_patterns': len(self._patterns),
            'qualified_venues': self._qualified_directory_venues,
            'unmatched_or_ambiguous_rows': self._rejected_ambiguous_or_unmatched,
            'unqualified_bravo_rows': self._rejected_unqualified,
        }

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
        for pfx in ('pa-', 'bravo-'):
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

def _build_context_baselines(records: list) -> dict:
    """Build exact weekday/hour medians from qualified observed rows only."""
    buckets: dict[tuple, list] = defaultdict(list)
    for record in records:
        if not record.get('qualified'):
            continue
        buckets[(record['dow'], record['hour'])].append(record)

    baselines = {}
    for context, samples in buckets.items():
        distinct_dates = {sample['central_date'] for sample in samples}
        if (
            len(samples) < MIN_CONTEXT_OBSERVATIONS
            or len(distinct_dates) < MIN_CONTEXT_DAYS
        ):
            continue
        baselines[context] = {
            'tables':         int(round(_median([r['tables'] for r in samples]))),
            'waiting':        int(round(_median([r['waiting'] for r in samples]))),
            'sample_count':   len(samples),
            'distinct_dates': len(distinct_dates),
            'newest_snapshot': max(r['snapshot'] for r in samples),
        }
    return baselines


def generate_snapshot(model: PatternModel, now_utc: datetime,
                      skip_slugs: Optional[set] = None) -> list:
    """
    Generate one cycle's modeled rows from the exact observed time context.

    skip_slugs : venues with fresh, genuinely scraped data. They are left alone
                 entirely — the real scraper owns them, including when it says a
                 venue has no games running.
    """
    skip_slugs = skip_slugs or set()

    central_offset = _central_utc_offset_hours(now_utc)
    central_dt     = now_utc + timedelta(hours=central_offset)
    central_hour   = central_dt.hour
    dow            = central_dt.weekday()

    batch_id = f'sim-{uuid.uuid4()}'
    snap_ts  = now_utc.isoformat()
    rows: list = []

    venues_processed = 0
    venues_skipped   = 0
    games_generated  = 0

    for slug in model.get_venues():
        if slug in skip_slugs:
            venues_skipped += 1
            continue

        venue_name = model.get_venue_name(slug)
        games      = model.get_games_for_venue(slug)
        if not games:
            continue

        venue_generated = False
        for game in games:
            pat = model.get_pattern(slug, game)
            if not pat:
                continue
            baseline = pat['context_baselines'].get((dow, central_hour))
            if not baseline:
                continue
            context_age_days = (
                now_utc - baseline['newest_snapshot']
            ).total_seconds() / 86400.0
            if context_age_days < 0 or context_age_days > MAX_HISTORY_AGE_DAYS:
                # Freshness is evaluated for this exact venue/game/context.
                # A recent sample from another venue or hour cannot make a
                # stale bucket publishable.
                continue

            tables_running = max(0, int(baseline['tables']))
            players_waiting = max(0, int(baseline['waiting']))

            rows.append({
                'id':               stable_live_row_id('bravo', batch_id, slug, game),
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
                # Modelled, not observed - see the provenance contract above.
                'data_quality':     sim_data_quality(),
                'observation_kind': OBSERVATION_MODELED,
                'source':           'bravo',             # API gives Bravo priority over PA catalog
                'buyin_range':      pat.get('buyin_range') or None,
                'runs_schedule':    None,
            })
            games_generated += 1
            venue_generated = True

        if venue_generated:
            venues_processed += 1

    log.info(
        f'  Generated {games_generated:,} game rows across {venues_processed:,} venues '
        f'({venues_skipped:,} skipped: fresh real data) '
        f'| qualified context: Central dow={dow} hour={central_hour:02d} '
        f'(UTC{central_offset:+d})'
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


def _is_noise_venue(venue_name: str, venue_slug: str = '') -> bool:
    """Reject scraper navigation copy accidentally stored as a venue.

    Keep the rule intentionally narrow: legitimate rooms may contain words
    such as "Live" or "Registration", but PokerAtlas' combined navigation
    labels use these distinctive phrases. Checking both the saved name and the
    slug also cleans rows whose bad label was already slugified upstream.
    """
    haystack = f'{venue_name} {venue_slug.replace("-", " ")}'.lower()
    navigation_phrases = (
        'view live info',
        'live info wait list',
        'wait list registration',
    )
    return any(phrase in haystack for phrase in navigation_phrases)


def _generatable_venues(model: PatternModel) -> set:
    """
    Venues with at least one qualified observed weekday/hour context.

    Whether a venue can emit in the current cycle still depends on that exact
    cycle's Central weekday and hour.
    """
    return set(model.get_venues())


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


def write_scraper_metric(cycle_start: datetime, outcome: dict,
                         venues_scraped: int, venues_with_data: int) -> bool:
    """Persist output-aware health for the admin scraper dashboard.

    The extended fields are introduced by the data-truth migration. A legacy
    retry keeps pre-migration dashboards observable, but the modeled data write
    itself never falls back to dishonest provenance.
    """
    duration = max(0, int((datetime.now(timezone.utc) - cycle_start).total_seconds()))
    payload = {
        'source': 'bravo-simulator',
        'cycle_start': cycle_start.isoformat(),
        'duration_seconds': duration,
        'venues_scraped': max(0, int(venues_scraped or 0)),
        'venues_with_data': max(0, int(venues_with_data or 0)),
        **outcome,
    }

    def _post(row: dict) -> None:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/scraper_metrics',
            data=json.dumps(row).encode(), method='POST',
            headers={**SB_HEADERS, 'Prefer': 'return=minimal'},
        )
        urllib.request.urlopen(req, timeout=15)

    try:
        _post(payload)
        return True
    except urllib.error.HTTPError as e:
        detail = _http_error_detail(e)
        if e.code == 400 and any(name in detail for name in (
                'run_status', 'records_attempted', 'records_rejected', 'status_reason')):
            legacy = {k: payload[k] for k in (
                'source', 'cycle_start', 'duration_seconds', 'venues_scraped',
                'venues_with_data', 'errors', 'records_saved')}
            try:
                _post(legacy)
                log.error('  scraper_metrics schema is missing the data-truth columns; '
                          'legacy metric written, but this run cannot be explicitly classified')
                return False
            except Exception as legacy_err:
                log.error(f'  scraper_metrics legacy retry FAILED: {legacy_err}')
                return False
        log.error(f'  scraper_metrics insert FAILED: {detail}')
        return False
    except Exception as e:
        log.error(f'  scraper_metrics insert FAILED: {type(e).__name__}: {e}')
        return False


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


def _acquire_process_lock():
    """Acquire the authoritative single-instance guard for this process.

    PID files remain useful operational metadata, but their check/write cycle
    cannot be atomic. The kernel lock closes that race and is released even
    after a crash or hard kill.
    """
    lock_handle = open(LOCK_FILE, 'a+')
    try:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock_handle.close()
        log.error('FATAL: Another simulator instance owns the process lock.')
        raise SystemExit(1)
    lock_handle.seek(0)
    lock_handle.truncate()
    lock_handle.write(f'{os.getpid()}\n')
    lock_handle.flush()
    return lock_handle


# ═════════════════════════════════════════════════════════════════
# MAIN DAEMON LOOP
# ═════════════════════════════════════════════════════════════════

def run():
    # Take the kernel lock before consulting compatibility PID metadata.
    process_lock = _acquire_process_lock()
    _check_pid_guard()

    _write_pid_files()

    log.info('=' * 60)
    log.info('BRAVO POKER LIVE — OBSERVED-HISTORY ESTIMATOR v1.4')
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
    initial_age = model.history_age_days()
    write_heartbeat('running', {
        'venues':           len(model.get_venues()),
        'cycle':            0,
        'history_age_days': round(initial_age, 2) if initial_age is not None else None,
        **model.qualification_summary(),
    })

    cycle                = 0
    consecutive_failures = 0
    delete_failures      = 0
    last_good_batch_id: Optional[str] = None

    # A normal successful batch still swaps insert-first/delete-second. The one
    # deliberate unpaired purge is the truth gate below: when there is no
    # qualified observed context, retaining a legacy catalog-derived estimate
    # would be worse than publishing an explicitly unavailable count.

    while not shutdown[0]:
        cycle += 1
        cycle_start = time.time()
        now_utc = datetime.now(timezone.utc)
        records_attempted = 0

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

            # ── Qualified-history gate ─────────────────────────────────
            age_days = model.history_age_days()
            unavailable_reason = None
            if age_days is None:
                unavailable_reason = 'no_qualified_observed_bravo_history'
            elif age_days > MAX_HISTORY_AGE_DAYS:
                unavailable_reason = 'qualified_observed_bravo_history_stale'

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
            skip_slugs = set()
            rows = []
            if unavailable_reason is None:
                skip_slugs = fetch_fresh_real_slugs(model)
                if skip_slugs:
                    log.info(
                        f'  {len(skip_slugs):,} venues have real scraped data newer '
                        f'than {REAL_DATA_FRESH_SECONDS // 60}min; not modeling them'
                    )
                rows = generate_snapshot(model, now_utc, skip_slugs=skip_slugs)

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
                    outcome = classify_persisted_run(
                        attempted=0, persisted=0, valid_empty=True,
                        status_reason='observed_bravo_covers_all_modeled_venues')
                    write_heartbeat('idle', {
                        'cycle':                cycle,
                        'reason':               'real_data_covers_all_venues',
                        'run_status':           outcome['run_status'],
                        'valid_empty':          True,
                        'venues_skipped_real':  len(skip_slugs),
                        'records_saved':        0,
                        'history_age_days':     round(age_days, 2),
                        'consecutive_failures': 0,
                    })
                    write_scraper_metric(
                        now_utc, outcome, len(_generatable_venues(model)), len(skip_slugs))
                else:
                    consecutive_failures += 1
                    log.error('  Leftover sim-row purge FAILED while standing down.')
                    outcome = classify_persisted_run(
                        attempted=0, persisted=0, errors=1,
                        status_reason='stale_modeled_row_delete_failed')
                    write_heartbeat('error', {
                        'cycle':                cycle,
                        'error':                'stale_delete_failed',
                        'run_status':           outcome['run_status'],
                        'records_saved':        0,
                        'consecutive_failures': consecutive_failures,
                    })
                    write_scraper_metric(
                        now_utc, outcome, len(_generatable_venues(model)), 0)
            elif not rows:
                reason = unavailable_reason or 'no_qualified_context_for_current_weekday_hour'
                log.warning(
                    f'  No qualified estimate ({reason}); retiring all simulator-owned '
                    'rows so cards report count unavailable.'
                )
                if retire_unqualified_simulator_rows():
                    consecutive_failures = 0
                    delete_failures = 0
                    last_good_batch_id = None
                    outcome = classify_persisted_run(
                        attempted=0, persisted=0, valid_empty=True,
                        status_reason=reason,
                    )
                    write_heartbeat('idle', {
                        'cycle':                cycle,
                        'reason':               reason,
                        'run_status':           outcome['run_status'],
                        'valid_empty':          True,
                        'records_saved':        0,
                        'venues_active':        0,
                        'tables_running':       0,
                        'venues_skipped_real':  len(skip_slugs),
                        'history_age_days':     (
                            round(age_days, 2) if age_days is not None else None
                        ),
                        'consecutive_failures': 0,
                        **model.qualification_summary(),
                    })
                    write_scraper_metric(
                        now_utc, outcome, len(_generatable_venues(model)), 0
                    )
                else:
                    consecutive_failures += 1
                    outcome = classify_persisted_run(
                        attempted=0, persisted=0, errors=1,
                        status_reason='unqualified_modeled_row_cleanup_failed',
                    )
                    write_heartbeat('error', {
                        'cycle': cycle,
                        'error': 'unqualified_modeled_row_cleanup_failed',
                        'run_status': outcome['run_status'],
                        'records_saved': 0,
                        'consecutive_failures': consecutive_failures,
                    })
                    write_scraper_metric(
                        now_utc, outcome, len(_generatable_venues(model)), 0
                    )
            else:
                batch_id = rows[0]['scrape_batch_id']
                records_attempted = len(rows)

                # FIX: UPSERT the new batch FIRST, then DELETE the older sim
                # rows. The old order (delete → insert) guaranteed a window of
                # several seconds where the API returned zero live games, and
                # that empty response was CDN-cached for up to 60s.
                log.info(f'  Upserting {len(rows):,} rows into venue_live_tables...')
                saved, failed_chunks = sb_insert('venue_live_tables', rows)

                live_tables = sum(r['tables_running'] for r in rows)
                waiting = sum(r['players_waiting'] for r in rows)
                venues_modeled = len(set(r['bravo_slug'] for r in rows))
                venues_live = len(set(
                    r['bravo_slug'] for r in rows if r['tables_running'] > 0
                ))

                if saved == 0:
                    consecutive_failures += 1
                    log.error(
                        f'  ZERO rows saved despite {len(rows)} generated — '
                        f'check Supabase connection and RLS policies. '
                        f'Previous batch left in place.'
                    )
                    outcome = classify_persisted_run(
                        attempted=len(rows), persisted=0, rejected=len(rows),
                        errors=max(1, failed_chunks), status_reason='modeled_batch_persisted_zero_rows')
                    write_heartbeat('error', {
                        'cycle': cycle,
                        'error': 'zero_rows_saved',
                        'run_status': outcome['run_status'],
                        'records_saved': 0,
                        'records_attempted': len(rows),
                        'records_rejected': len(rows),
                        'consecutive_failures': consecutive_failures,
                    })
                    write_scraper_metric(
                        now_utc, outcome, len(_generatable_venues(model)), 0)
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
                    outcome = classify_persisted_run(
                        attempted=len(rows), persisted=saved,
                        rejected=max(0, len(rows) - saved), errors=failed_chunks,
                        status_reason='modeled_batch_partially_persisted')
                    write_heartbeat('error', {
                        'cycle': cycle,
                        'error': f'partial_write:{failed_chunks}_chunks_failed',
                        'run_status': outcome['run_status'],
                        'records_saved': saved,
                        'records_expected': len(rows),
                        'batch_id': batch_id,
                        'consecutive_failures': consecutive_failures,
                    })
                    write_scraper_metric(
                        now_utc, outcome, len(_generatable_venues(model)), venues_live)
                else:
                    log.info(f'  Saved {saved:,}/{len(rows):,} rows | Batch: {batch_id}')
                    log.info(
                        f'  Stats: {venues_modeled} venues modeled | '
                        f'{venues_live} venues with running tables | '
                        f'{live_tables} tables running | {waiting} players waiting'
                    )

                    # Swap complete — now retire every older sim batch.
                    if sb_delete_simulator_rows('venue_live_tables',
                                                except_batch_id=batch_id):
                        delete_failures = 0
                        consecutive_failures = 0
                        last_good_batch_id = batch_id
                        outcome = classify_persisted_run(
                            attempted=len(rows), persisted=saved,
                            status_reason='modeled_batch_persisted_and_previous_batch_retired')
                        write_heartbeat('running', {
                            'cycle':                cycle,
                            'run_status':           outcome['run_status'],
                            'records_saved':        saved,
                            'records_attempted':    len(rows),
                            'records_rejected':     0,
                            'venues_modeled':       venues_modeled,
                            'venues_active':        venues_live,
                            'venues_skipped_real':  len(skip_slugs),
                            'tables_running':       live_tables,
                            'players_waiting':      waiting,
                            'batch_id':             batch_id,
                            'history_age_days':     round(age_days, 2),
                            'consecutive_failures': 0,
                        })
                        write_scraper_metric(
                            now_utc, outcome, len(_generatable_venues(model)), venues_modeled)
                    else:
                        # Rows are correct but duplicated with the prior batch.
                        delete_failures      += 1
                        consecutive_failures += 1
                        last_good_batch_id    = batch_id
                        log.error(
                            f'  Stale sim-row DELETE failed ({delete_failures} in a row) — '
                            f'venue_live_tables now holds duplicate sim batches.'
                        )
                        outcome = classify_persisted_run(
                            attempted=len(rows), persisted=saved, errors=1,
                            status_reason='modeled_batch_persisted_but_previous_batch_not_retired')
                        write_heartbeat('error', {
                            'cycle':                cycle,
                            'error':                'stale_delete_failed',
                            'run_status':           outcome['run_status'],
                            'records_saved':        saved,
                            'records_attempted':    len(rows),
                            'records_rejected':     0,
                            'batch_id':             batch_id,
                            'consecutive_failures': consecutive_failures,
                        })
                        write_scraper_metric(
                            now_utc, outcome, len(_generatable_venues(model)), venues_live)

        except Exception as e:
            consecutive_failures += 1
            log.error(f'  Cycle #{cycle} error: {type(e).__name__}: {e}')
            traceback.print_exc()
            outcome = classify_persisted_run(
                attempted=records_attempted, persisted=0,
                rejected=records_attempted, errors=1,
                status_reason=f'cycle_exception:{type(e).__name__}')
            write_heartbeat('error', {
                'cycle': cycle,
                'error': str(e),
                'run_status': outcome['run_status'],
                'records_saved': 0,
                'records_attempted': records_attempted,
                'records_rejected': records_attempted,
                'consecutive_failures': consecutive_failures,
            })
            write_scraper_metric(now_utc, outcome, 0, 0)

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
    process_lock.close()


if __name__ == '__main__':
    run()
