import argparse
import asyncio
import os
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple
from bs4 import BeautifulSoup

from scrapling import StealthyFetcher
from supabase import create_client, Client

from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Load config
load_dotenv('.env.local')
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
# Use service role key to bypass RLS for data seeding
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Missing Supabase credentials in .env.local")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
EVIDENCE_DIR = 'data/scrape-evidence'
os.makedirs(EVIDENCE_DIR, exist_ok=True)
CHECKPOINT_FILE = os.path.join(EVIDENCE_DIR, 'liveness_sweep_evidence.json')

# ── SAFETY RAILS ─────────────────────────────────────────────────────────────
# This sweep is DESTRUCTIVE: it flips poker_venues.is_active to False and
# cascade-disables every row in venue_daily_tournaments for that venue, and
# nothing else in the repo ever flips them back automatically. Every guard
# below exists so a bad page, a markup change, or a Cloudflare interstitial
# cannot wipe the venue catalogue in one run.
PAGE_SIZE = 1000                 # PostgREST default max rows — must paginate
FETCH_TIMEOUT_SECONDS = 90       # Hard cap per venue fetch (CF solve included)
MAX_RUNTIME_MINUTES = int(os.environ.get('LIVENESS_MAX_RUNTIME_MINUTES', '150'))
MAX_DEACTIVATIONS = int(os.environ.get('LIVENESS_MAX_DEACTIVATIONS', '25'))
RESUME_WINDOW_HOURS = int(os.environ.get('LIVENESS_RESUME_WINDOW_HOURS', '20'))
CHECKPOINT_EVERY = 25

# Status vocabulary written to poker_venues.scrape_status
STATUS_ACTIVE = 'active'
STATUS_PERMANENTLY_CLOSED = 'permanently_closed'
STATUS_TEMPORARILY_CLOSED = 'temporarily_closed'
STATUS_UNKNOWN = 'unknown'

# Phrases that mean the room is GONE. Matched against rendered page text only.
PERMANENT_CLOSURE_PHRASES = [
    'permanently closed',
    'poker room is closed',
    'no live poker',
]
# Non-destructive: a remodel/seasonal shutdown must not erase the venue.
TEMPORARY_CLOSURE_PHRASES = [
    'temporarily closed',
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Blocks that belong to the page, not to this venue. A 'Nearby Rooms' aside or
# a JS template must never be able to close a live room.
_NOISE_TAGS = ['nav', 'footer', 'script', 'style', 'aside', 'noscript']


def _content_node(soup):
    """The venue's own content subtree, with page chrome pruned.

    MUTATES `soup` (decomposes noise tags) — callers must own their soup.
    """
    node = None
    for name, attrs in (
        ('main', None),
        ('div', {'id': 'content'}),
        ('div', {'id': 'venue'}),
        ('article', None),
    ):
        node = soup.find(name, attrs=attrs) if attrs else soup.find(name)
        if node:
            break
    if node is None:
        node = soup.find('body') or soup
    # Prune unconditionally, including inside <main>: PokerAtlas nests the
    # 'Nearby Rooms' sidebar and inline JSON templates INSIDE the main content
    # element, so pruning only on the <body> fallback left the sidebar
    # false-positive (the whole point of this function) wide open.
    for tag in node.find_all(_NOISE_TAGS):
        tag.decompose()
    return node


def _venue_text(html: str) -> str:
    """Rendered text of the venue's own content, excluding chrome.

    Matching closure phrases against the RAW HTML (or against the whole
    document) meant a 'Temporarily Closed' badge in a 'Nearby Rooms' sidebar,
    an SEO meta tag, a JS string or a hidden template permanently disabled a
    live venue. Scope to the main content element when PokerAtlas gives us
    one, and never look at raw markup.

    Parses its own soup so the pruning cannot mutate the caller's tree.
    """
    return _content_node(BeautifulSoup(html, 'html.parser')).get_text(
        separator=' ', strip=True
    ).lower()


def is_venue_active_from_html(html: str) -> Tuple[bool, str, str]:
    """Deterministically evaluate whether a PokerAtlas poker room is active.

    Returns (is_active, reason, status) where status is one of
    active / permanently_closed / temporarily_closed / unknown.
    Only `permanently_closed` is destructive for the caller.
    """
    soup = BeautifulSoup(html, 'html.parser')
    # Two views of the page:
    #   `content` — this venue's own subtree, chrome pruned. Everything that
    #               can lead to a DESTRUCTIVE verdict must be read from here.
    #   `soup`    — the whole document, used only for POSITIVE (non-destructive)
    #               signals, where a false positive merely keeps a venue live.
    content = _content_node(soup)
    text = content.get_text(separator=' ', strip=True).lower()

    # Prefer the venue's own status/header element when PokerAtlas exposes one.
    # Searched inside `content` ONLY: a document-wide search picked up the first
    # element with 'status' in its class anywhere on the page — e.g. a
    # 'Nearby Rooms' card reading "Permanently Closed" — and, because this check
    # runs before the positive signals, that closed a venue whose own page was
    # still listing live games.
    status_node = (
        content.find(class_=lambda c: bool(c) and 'status' in ' '.join(c if isinstance(c, list) else [c]).lower())
        or content.find('h1')
    )
    status_text = status_node.get_text(separator=' ', strip=True).lower() if status_node else ''

    for phrase in PERMANENT_CLOSURE_PHRASES:
        if phrase in status_text:
            return False, f'Venue status element says: "{phrase}"', STATUS_PERMANENTLY_CLOSED
    for phrase in TEMPORARY_CLOSURE_PHRASES:
        if phrase in status_text:
            return True, f'Venue status element says: "{phrase}"', STATUS_TEMPORARILY_CLOSED

    # Positive signals win over body-text phrase matches: a page that is still
    # listing games is open regardless of what a blurb elsewhere says.
    games_section = soup.find('div', id='games')
    if games_section:
        return True, 'Active: Found #games division', STATUS_ACTIVE

    tables_badge = soup.find(string=lambda s: s and 'Tables:' in s)
    if tables_badge:
        return True, 'Active: Found Tables: count', STATUS_ACTIVE

    cash_games_hdr = soup.find(string=lambda s: s and 'Cash Games' in s)
    if cash_games_hdr:
        return True, 'Active: Found Cash Games header', STATUS_ACTIVE

    for phrase in PERMANENT_CLOSURE_PHRASES:
        if phrase in text:
            return False, f'Found explicit closure phrase: "{phrase}"', STATUS_PERMANENTLY_CLOSED
    for phrase in TEMPORARY_CLOSURE_PHRASES:
        if phrase in text:
            return True, f'Found temporary closure phrase: "{phrase}"', STATUS_TEMPORARILY_CLOSED

    # Explicit "nothing running at all" statement
    if 'no cash games' in text and 'no tournaments' in text:
        return False, 'Found no cash games and no tournaments text', STATUS_PERMANENTLY_CLOSED

    # Fallback to true if we didn't explicitly prove it was closed.
    # Usually venues without a games block are just poorly documented.
    return True, 'Active: Default fallback', STATUS_UNKNOWN


def fetch_all_rows(select: str, filters) -> List[Dict[str, Any]]:
    """Fetch every matching row, paginating past PostgREST's max-rows cap.

    An unpaginated select() silently returns only the first PAGE_SIZE rows
    with HTTP 200, so every venue past the cutoff was never liveness-checked.
    """
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        query = supabase.table('poker_venues').select(select)
        query = filters(query)
        page = query.range(offset, offset + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def load_checkpoint() -> Dict[str, Dict[str, Any]]:
    """Load prior sweep results keyed by venue id (for resume)."""
    if not os.path.exists(CHECKPOINT_FILE):
        return {}
    try:
        with open(CHECKPOINT_FILE) as f:
            raw = json.load(f)
    except Exception as e:
        logger.warning(f"Could not read checkpoint {CHECKPOINT_FILE}: {e}")
        return {}
    entries = raw.get('results', []) if isinstance(raw, dict) else raw
    out = {}
    for entry in entries:
        if isinstance(entry, dict) and entry.get('id') is not None:
            out[str(entry['id'])] = entry
    return out


def save_checkpoint(results_by_id: Dict[str, Dict[str, Any]], meta: Dict[str, Any]) -> None:
    payload = {
        'generated_at': _now_iso(),
        'source': 'pokeratlas',
        **meta,
        'results': list(results_by_id.values()),
    }
    tmp = CHECKPOINT_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, CHECKPOINT_FILE)


def _checked_recently(entry: Dict[str, Any]) -> bool:
    ts = entry.get('checked_at')
    if not ts:
        return False
    try:
        when = datetime.fromisoformat(ts)
    except ValueError:
        return False
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - when < timedelta(hours=RESUME_WINDOW_HOURS)


def deactivate_venue(vid: Any, name: str, reason: str, dry_run: bool) -> Dict[str, Any]:
    """Disable a venue and cascade to its tournaments, checking BOTH writes.

    The two updates each get their own try/except and their result is
    inspected, so a failed write can never be recorded as a successful
    verification (it previously fell through to the fetch-error handler and
    was written to the evidence file as `is_active: True`).
    """
    outcome = {'venue_disabled': False, 'tournaments_disabled': False, 'db_error': None}
    if dry_run:
        logger.warning(f"  [DRY-RUN] would disable {name} ({vid}): {reason}")
        outcome['dry_run'] = True
        return outcome

    try:
        res = supabase.table('poker_venues').update({
            "is_active": False,
            "scrape_status": f"verified_closed: {reason}"[:255],
        }).eq('id', vid).execute()
        if getattr(res, 'data', None):
            outcome['venue_disabled'] = True
        else:
            outcome['db_error'] = 'poker_venues update returned no rows'
            logger.error(f"  DB ERROR: poker_venues update affected 0 rows for {name} ({vid})")
    except Exception as e:
        outcome['db_error'] = f'poker_venues update failed: {e}'
        logger.error(f"  DB ERROR: poker_venues update failed for {name} ({vid}): {e}")

    if not outcome['venue_disabled']:
        # Do NOT cascade when the venue itself was not disabled — that leaves
        # a live venue with all of its tournaments hidden.
        return outcome

    try:
        supabase.table('venue_daily_tournaments').update({
            "is_active": False,
        }).eq('venue_id', vid).execute()
        outcome['tournaments_disabled'] = True
    except Exception as e:
        outcome['db_error'] = f'venue_daily_tournaments cascade failed: {e}'
        logger.error(f"  DB ERROR: tournament cascade failed for {name} ({vid}): {e}")

    return outcome


def reactivate_venue(vid: Any, name: str, reason: str, dry_run: bool) -> Dict[str, Any]:
    """Flip a previously auto-disabled venue back on once it verifies active."""
    outcome = {'venue_reactivated': False, 'db_error': None}
    if dry_run:
        logger.warning(f"  [DRY-RUN] would re-activate {name} ({vid}): {reason}")
        outcome['dry_run'] = True
        return outcome
    try:
        res = supabase.table('poker_venues').update({
            "is_active": True,
            "scrape_status": f"verified_open: {reason}"[:255],
        }).eq('id', vid).execute()
        if getattr(res, 'data', None):
            outcome['venue_reactivated'] = True
            logger.warning(
                f"  RE-ACTIVATED {name} ({vid}). Its tournaments stay disabled until the "
                "tournament scraper re-runs for this venue."
            )
        else:
            outcome['db_error'] = 'poker_venues re-activation returned no rows'
            logger.error(f"  DB ERROR: re-activation affected 0 rows for {name} ({vid})")
    except Exception as e:
        outcome['db_error'] = f'poker_venues re-activation failed: {e}'
        logger.error(f"  DB ERROR: re-activation failed for {name} ({vid}): {e}")
    return outcome


async def sweep_venues(dry_run: bool = False, resume: bool = True, limit: int = 0):
    started = time.time()
    deadline = started + MAX_RUNTIME_MINUTES * 60
    logger.info(
        f"Starting Venue Liveness Verification Sweep "
        f"(dry_run={dry_run}, resume={resume}, max_runtime={MAX_RUNTIME_MINUTES}min, "
        f"max_deactivations={MAX_DEACTIVATIONS})..."
    )

    # Active venues (paginated) + venues THIS script previously disabled, so a
    # room that has reopened can be verified and switched back on.
    active_venues = fetch_all_rows(
        'id, name, pokeratlas_url',
        lambda q: q.eq('is_active', True),
    )
    logger.info(f"Found {len(active_venues)} active venues (paginated).")

    try:
        reopened_candidates = fetch_all_rows(
            'id, name, pokeratlas_url',
            lambda q: q.eq('is_active', False).like('scrape_status', 'verified_closed%'),
        )
    except Exception as e:
        logger.error(f"Could not query previously auto-disabled venues: {e}")
        reopened_candidates = []
    logger.info(f"Found {len(reopened_candidates)} previously auto-disabled venues to re-verify.")

    targets = (
        [dict(v, _mode='check') for v in active_venues if v.get('pokeratlas_url')]
        + [dict(v, _mode='recheck') for v in reopened_candidates if v.get('pokeratlas_url')]
    )
    logger.info(f"Targeting {len(targets)} venues with verifiable PokerAtlas URLs.")

    results_by_id = load_checkpoint() if resume else {}
    if resume and results_by_id:
        before = len(targets)
        targets = [
            v for v in targets
            if not _checked_recently(results_by_id.get(str(v['id']), {}))
        ]
        logger.info(
            f"Resume: skipping {before - len(targets)} venues already checked "
            f"within {RESUME_WINDOW_HOURS}h."
        )
    if limit:
        targets = targets[:limit]
        logger.info(f"Limit flag: sweeping at most {len(targets)} venues this run.")

    deactivations = 0
    stopped_reason = 'completed'
    count = 0

    fetcher = StealthyFetcher(solve_cloudflare=True)

    try:
        for venue in targets:
            if time.time() > deadline:
                stopped_reason = f'runtime cap reached ({MAX_RUNTIME_MINUTES}min)'
                logger.warning(
                    f"Stopping sweep: {stopped_reason}. "
                    f"Re-run to resume from the checkpoint ({len(targets) - count} venues left)."
                )
                break

            count += 1
            url = venue['pokeratlas_url']
            name = venue['name']
            vid = venue['id']
            mode = venue['_mode']

            logger.info(f"[{count}/{len(targets)}] Sweeping {name} ({mode})...")

            entry = {
                "id": vid,
                "name": name,
                "url": url,
                "mode": mode,
                "checked_at": _now_iso(),
                "source_url": url,
                "verification": "unverified",
            }

            try:
                # Rate-limit courtesy delay (StealthyFetcher also self-throttles)
                await asyncio.sleep(2)
                r = await asyncio.wait_for(
                    fetcher.async_fetch(url), timeout=FETCH_TIMEOUT_SECONDS
                )

                if r.status == 404:
                    logger.warning("  -> 404 Not Found. Marking inactive.")
                    is_active, reason, status = False, "HTTP 404 Not Found", STATUS_PERMANENTLY_CLOSED
                elif r.status != 200:
                    logger.warning(f"  -> HTTP {r.status}. Skipping update.")
                    is_active, reason, status = True, f"HTTP {r.status}", STATUS_UNKNOWN
                else:
                    is_active, reason, status = is_venue_active_from_html(r.text)
                    logger.info(f"  -> {is_active} | {status} | {reason}")

                entry.update({
                    "is_active": is_active,
                    "status": status,
                    "reason": reason,
                    "http_status": r.status,
                    "verification": "verified" if r.status in (200, 404) else "unverified",
                })

                if status == STATUS_PERMANENTLY_CLOSED:
                    if mode == 'recheck':
                        logger.info("  -> Still closed; leaving disabled.")
                        entry['db_action'] = 'none (already disabled)'
                    elif deactivations >= MAX_DEACTIVATIONS:
                        # A markup change or a site-wide interstitial would
                        # otherwise deactivate the whole catalogue in one run.
                        logger.error(
                            f"  DEACTIVATION CAP reached ({MAX_DEACTIVATIONS}) — refusing to "
                            f"disable {name}. Investigate before re-running."
                        )
                        entry['db_action'] = 'skipped (deactivation cap)'
                        stopped_reason = 'deactivation cap reached'
                    else:
                        logger.warning(f"  [X] DISABLING VENUE {name} in database...")
                        outcome = deactivate_venue(vid, name, reason, dry_run)
                        entry['db_action'] = outcome
                        if outcome.get('db_error'):
                            # A failed write is NOT a successful verification.
                            entry['verification'] = 'db_error'
                        elif outcome.get('venue_disabled'):
                            deactivations += 1
                elif status == STATUS_TEMPORARILY_CLOSED:
                    # Non-destructive: record the status, keep the venue live.
                    logger.warning(f"  [!] {name} reports TEMPORARILY closed — not disabling.")
                    entry['db_action'] = 'none (temporarily closed)'
                elif mode == 'recheck' and is_active and status == STATUS_ACTIVE:
                    outcome = reactivate_venue(vid, name, reason, dry_run)
                    entry['db_action'] = outcome
                    if outcome.get('db_error'):
                        entry['verification'] = 'db_error'
                else:
                    entry['db_action'] = 'none'

            except asyncio.TimeoutError:
                logger.error(f"  -> Fetch TIMED OUT after {FETCH_TIMEOUT_SECONDS}s for {name}")
                entry.update({
                    "is_active": True,
                    "status": STATUS_UNKNOWN,
                    "reason": f"Fetch timeout after {FETCH_TIMEOUT_SECONDS}s",
                    "verification": "fetch_error",
                    "db_action": "none",
                })
            except Exception as e:
                logger.error(f"  -> Failed to fetch {name}: {str(e)}")
                # Don't mark closed on generic fetch failures (timeout, connection reset)
                entry.update({
                    "is_active": True,
                    "status": STATUS_UNKNOWN,
                    "reason": f"Fetch error: {str(e)}",
                    "verification": "fetch_error",
                    "db_action": "none",
                })

            results_by_id[str(vid)] = entry

            if count % CHECKPOINT_EVERY == 0:
                save_checkpoint(results_by_id, {
                    'run_status': 'in_progress',
                    'venues_targeted': len(targets),
                    'venues_checked_this_run': count,
                    'deactivations_this_run': deactivations,
                    'dry_run': dry_run,
                })
                logger.info(f"Saved checkpoint to {CHECKPOINT_FILE}")

    finally:
        db_errors = sum(1 for e in results_by_id.values() if e.get('verification') == 'db_error')
        fetch_errors = sum(1 for e in results_by_id.values() if e.get('verification') == 'fetch_error')
        save_checkpoint(results_by_id, {
            'run_status': stopped_reason,
            'venues_targeted': len(targets),
            'venues_checked_this_run': count,
            'deactivations_this_run': deactivations,
            'db_errors': db_errors,
            'fetch_errors': fetch_errors,
            'duration_seconds': round(time.time() - started),
            'dry_run': dry_run,
        })
        logger.info(
            f"Sweep finished ({stopped_reason}): checked {count}, deactivated {deactivations}, "
            f"db_errors {db_errors}, fetch_errors {fetch_errors}. Evidence: {CHECKPOINT_FILE}"
        )
        if db_errors:
            logger.error(f"{db_errors} venue(s) could not be updated in the database — see evidence file.")


def main():
    parser = argparse.ArgumentParser(description='PokerAtlas venue liveness sweep (destructive).')
    parser.add_argument('--dry-run', action='store_true',
                        help='Verify venues and write evidence, but perform no database writes.')
    parser.add_argument('--no-resume', action='store_true',
                        help='Ignore the checkpoint and re-check every venue.')
    parser.add_argument('--limit', type=int, default=0,
                        help='Only sweep the first N venues this run (0 = no limit).')
    args = parser.parse_args()

    asyncio.run(sweep_venues(
        dry_run=args.dry_run or os.environ.get('LIVENESS_DRY_RUN') == '1',
        resume=not args.no_resume,
        limit=args.limit,
    ))


if __name__ == "__main__":
    main()
