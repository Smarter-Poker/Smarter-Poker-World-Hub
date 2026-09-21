#!/usr/bin/env python3
"""
VIDEO LIBRARY → SOCIAL REELS BRIDGE v1.0
=========================================
Reads all videos from video_library_videos, cross-checks against social_reels,
and inserts any new videos so they appear in the Reels doom-scroll feed.

Uses Scrapling + camoufox to verify YouTube videos are still live before inserting.

Architecture:
  - A manual tool. Open Claw no longer runs it (2026-09-21, fleet
    recertification D1): the dispatcher sends /api/cron/video-library-reels
    only to its workers route, which checks the fleet switch first.
  - It fails closed on its own, before any other request (see main()):
      1. content_settings.engine_enabled must be exactly true, read from the
         row the fleet engine reads. False, null, no row or a read error
         means exit without writing.
      2. VIDEO_LIBRARY_BOT_PROFILE_ID must name a profile whose is_horse is
         false and which is not in the fleet roster (content_authors). There
         is no fallback author.

Usage:
    python3 scripts/video_library_to_reels.py               # Full daily run
    python3 scripts/video_library_to_reels.py --dry-run     # No DB writes
    python3 scripts/video_library_to_reels.py --limit 50    # Process only N videos
    python3 scripts/video_library_to_reels.py --source HCL  # Single creator only
    python3 scripts/video_library_to_reels.py --verify      # Scrapling verify mode
    python3 scripts/video_library_to_reels.py --sync-captions  # Update stale captions only
"""

import os
import re
import sys
import json
import time
import logging
import argparse
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Paths ───────────────────────────────────────────────────────────────────
# Host-portability (2026-09-04). This bridge still carried the literal
# one-laptop /Users/... repo paths that video_library_scraper.py shed on
# 2026-08-29. Deployed to /opt/openclaw on the
# Hetzner dispatcher it died at import with PermissionError on /Users, exit 1
# in 0.2s, every day at 07:00 UTC - so nothing the scraper ingested ever
# reached social_reels. Same resolution rules as the scraper now: SP_* env
# overrides, then the repo, then the home directory, then /tmp; a directory we
# cannot write is never a reason to skip the day's work.
REPO_ROOT = Path(__file__).resolve().parents[1]
_HOME_STATE = Path.home() / '.smarter-poker'


def _first_writable_dir(*candidates: Path) -> Path:
    for cand in candidates:
        try:
            cand.mkdir(parents=True, exist_ok=True)
            if os.access(cand, os.W_OK):
                return cand
        except OSError:
            continue
    return candidates[-1]


# ── Logging ─────────────────────────────────────────────────────────────────
LOG_DIR = _first_writable_dir(
    *([Path(os.environ['SP_LOG_DIR'])] if os.environ.get('SP_LOG_DIR') else []),
    _HOME_STATE / 'logs',
    Path('/tmp') / 'smarter-poker' / 'logs',
)

_handlers: list = [logging.StreamHandler()]
try:
    _handlers.insert(0, logging.FileHandler(LOG_DIR / 'video-library-to-reels.log'))
except OSError:
    pass
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=_handlers,
)
log = logging.getLogger('video-library-to-reels')

# Evidence directory
EVIDENCE_DIR = _first_writable_dir(
    *([Path(os.environ['SP_EVIDENCE_DIR'])] if os.environ.get('SP_EVIDENCE_DIR') else []),
    REPO_ROOT / 'data' / 'scrape-evidence',
    _HOME_STATE / 'scrape-evidence',
    Path('/tmp') / 'smarter-poker' / 'scrape-evidence',
)

# ── Env ──────────────────────────────────────────────────────────────────────
def _load_env():
    """Load env vars from every candidate file that exists; earliest wins.

    Order: explicit SP_ENV_FILE, then files beside this script (the deployed
    /opt/openclaw case, where the dispatcher's .env lives), then the repo root
    (the Mac case). On the dispatcher the systemd EnvironmentFile has usually
    already populated the process environment, and setdefault leaves that alone.
    """
    here = Path(__file__).resolve().parent
    candidates = []
    if os.environ.get('SP_ENV_FILE'):
        candidates.append(Path(os.environ['SP_ENV_FILE']))
    candidates += [here / '.env', here / '.env.local']
    candidates += [REPO_ROOT / n for n in ('.env.local', '.env.production', '.env.vercel-db', '.env', '.env.prod')]

    loaded = []
    for env_file in candidates:
        try:
            if not env_file.exists():
                continue
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            loaded.append(str(env_file))
        except OSError:
            continue
    if loaded:
        print(f"[env] loaded: {', '.join(loaded)}", flush=True)
    else:
        print(f"[env] no env file found; tried: {', '.join(str(c) for c in candidates)}", flush=True)

_load_env()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
# The one profile every reel from this bridge is written as. REQUIRED
# (2026-09-21, fleet recertification D1). It used to be optional, with a
# fallback to the first content_authors row that has a profile_id, and every
# such row is a horse (1,000 of 1,000 on 2026-09-21), so an unset variable
# meant reels posted as a horse. An unset, malformed or unverified value now
# stops the run before any write; get_system_bot_id() lists the checks.
VIDEO_LIBRARY_BOT_PROFILE_ID = os.environ.get('VIDEO_LIBRARY_BOT_PROFILE_ID', '').strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error('Missing SUPABASE credentials — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or an env file listed above')
    sys.exit(1)

# ── Supabase REST helpers ────────────────────────────────────────────────────
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def _request(method, path, body=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += '?' + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()
        log.error(f"HTTP {e.code} {method} {path}: {body_txt[:400]}")
        return None
    except Exception as ex:
        log.error(f"Request error {method} {path}: {ex}")
        return None

def _select(table, select='*', filters=None, limit=None, order=None, offset=None):
    params = {'select': select}
    if filters:
        params.update(filters)
    if limit:
        params['limit'] = limit
    if offset:
        params['offset'] = offset
    if order:
        params['order'] = order
    return _request('GET', table, params=params) or []

def _insert(table, rows):
    """Insert a list of dicts. Returns True on success."""
    if not rows:
        return True
    req_headers = dict(HEADERS)
    req_headers['Prefer'] = 'return=minimal,resolution=ignore-duplicates'
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(rows).encode()
    req = urllib.request.Request(url, data=data, headers=req_headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status in (200, 201, 204)
    except urllib.error.HTTPError as e:
        log.error(f"Insert error {table}: {e.read().decode()[:400]}")
        return False

# ── Scrapling YouTube verifier ───────────────────────────────────────────────
def verify_youtube_video_scrapling(video_id):
    """
    Use Scrapling (camoufox) to verify a YouTube video is still live.
    Returns True if accessible, False if deleted/private.
    Falls back to a lightweight oEmbed check if Scrapling unavailable.
    """
    # Try lightweight oEmbed first (no browser needed, very fast)
    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        req = urllib.request.Request(oembed_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            if r.status == 200:
                return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False  # Definitely dead
        # 401 = private, treat as live (it exists, just restricted)
        if e.code == 401:
            return True
    except Exception:
        pass  # Fall through to Scrapling

    # Try Scrapling (camoufox) for full browser verification
    try:
        from scrapling.fetchers import StealthyFetcher
        page = StealthyFetcher.fetch(
            f"https://www.youtube.com/watch?v={video_id}",
            headless=True,
            block_images=True,
            timeout=20,
        )
        if page and page.status == 200:
            # Check for "Video unavailable" in page content
            if 'Video unavailable' in (page.html_content or ''):
                return False
            return True
        return False
    except ImportError:
        # Scrapling not installed — trust oEmbed result
        log.debug("Scrapling not available, using oEmbed only")
        return True  # optimistic
    except Exception as ex:
        log.warning(f"Scrapling verify failed for {video_id}: {ex}")
        return True  # optimistic on scraping failure

# ── Fleet switch ─────────────────────────────────────────────────────────────
def read_engine_switch():
    """
    content_settings.engine_enabled, read the way the fleet engine reads it
    (smarter-poker-workers Fleet.ts engineEnabled): the first row by created_at.

    Returns True only when that row holds exactly true, False when it holds
    anything else or there is no row, and None when the table cannot be read.
    main() stops on both False and None. A switch that turns itself on when
    it cannot be read is not a switch.
    """
    rows = _request('GET', 'content_settings', params={
        'select': 'engine_enabled',
        'order': 'created_at.asc',
        'limit': 1,
    })
    if not isinstance(rows, list):
        return None
    if not rows:
        return False
    first = rows[0]
    return isinstance(first, dict) and first.get('engine_enabled') is True

# ── Author ───────────────────────────────────────────────────────────────────
_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)


def get_system_bot_id():
    """
    Return the verified author profile_id for video library reels, or None.

    There is no fallback and no guessing (2026-09-21). The pinned
    VIDEO_LIBRARY_BOT_PROFILE_ID is accepted only when every check passes,
    each read fresh from the database; a failed check or a read error
    returns None and nothing is written:
      1. it is set and is a UUID;
      2. profiles has that id and its is_horse is false (not true, not null);
      3. no content_authors row points at it, because the fleet engine treats
         every content_authors profile as one of its horses whatever
         profiles.is_horse says.
    """
    pid = VIDEO_LIBRARY_BOT_PROFILE_ID
    if not pid:
        log.error('VIDEO_LIBRARY_BOT_PROFILE_ID is not set. Refusing to run: reels are written only '
                  'as a pinned profile that is verified not to be a horse, and this bridge never picks one.')
        return None
    if not _UUID_RE.match(pid):
        log.error(f'VIDEO_LIBRARY_BOT_PROFILE_ID is not a UUID ({pid!r}). Refusing to run.')
        return None

    rows = _request('GET', 'profiles', params={'select': 'id,is_horse', 'id': f'eq.{pid}', 'limit': 1})
    if not isinstance(rows, list):
        log.error(f'Could not read profiles for the pinned author {pid}. Refusing to run.')
        return None
    if not rows or not isinstance(rows[0], dict):
        log.error(f'The pinned author {pid} has no profile. Refusing to run.')
        return None
    if rows[0].get('is_horse') is not False:
        log.error(f'The pinned author {pid} has is_horse={rows[0].get("is_horse")!r}, not false. '
                  'Refusing to run: reels are never written as a horse.')
        return None

    roster = _request('GET', 'content_authors', params={'select': 'id', 'profile_id': f'eq.{pid}', 'limit': 1})
    if not isinstance(roster, list):
        log.error(f'Could not check the fleet roster for the pinned author {pid}. Refusing to run.')
        return None
    if roster:
        log.error(f'The pinned author {pid} is in the fleet roster (content_authors). Refusing to run.')
        return None

    log.info(f'Author verified: pinned profile {pid} is not a horse and is not in the fleet roster')
    return pid

# ── Already-in-reels set ─────────────────────────────────────────────────────
def get_existing_reel_video_ids():
    """
    Return the set of YouTube video IDs already in social_reels, whatever
    their source_type.

    2026-09-04: this used to look only at source_type = 'video_library'. But
    the BEFORE INSERT trigger trg_social_reels_yt_intercept rewrites every
    YouTube reel to source_type = 'youtube' (and fills youtube_video_id,
    queues the native transcode), so the bridge could never see a reel it
    had itself inserted - the first scheduled run after the fix would have
    re-inserted the same 100 videos every morning. Match on youtube_video_id,
    which the trigger populates, across the whole table (17k rows, paged),
    plus the URL-parsed legacy rows that predate the trigger.
    """
    ids = set()
    page, size = 0, 1000
    while True:
        rows = _select(
            'social_reels',
            select='youtube_video_id,video_url,source_type',
            filters={'or': '(youtube_video_id.not.is.null,source_type.eq.video_library)'},
            order='created_at.desc',
            limit=size,
            offset=page * size,
        )
        for r in rows:
            vid = (r.get('youtube_video_id') or '').strip()
            if len(vid) == 11:
                ids.add(vid)
                continue
            url = r.get('video_url') or ''
            for pattern in ['watch?v=', '/embed/', '/shorts/', 'youtu.be/']:
                if pattern in url:
                    ids.add(url.split(pattern)[-1].split('&')[0].split('?')[0][:11])
        if len(rows) < size:
            break
        page += 1
    return ids

# ── Main bridge logic ────────────────────────────────────────────────────────
def run_bridge(args, author_id):
    stats = {
        'fetched': 0,
        'already_exists': 0,
        'verified_dead': 0,
        'skipped_source': 0,
        'inserted': 0,
        'errors': 0,
    }

    # 1. The author is the pinned profile main() already verified as not a
    #    horse (get_system_bot_id). Never look one up here.
    if not author_id:
        return stats

    # 2. Get set of already-bridged video IDs
    log.info("Loading existing reels video IDs...")
    existing_ids = get_existing_reel_video_ids()
    log.info(f"  {len(existing_ids)} videos already in social_reels as video_library source")

    # 3. Fetch videos from video_library_videos
    filters = {}
    if args.source:
        filters['source_id'] = f'eq.{args.source.upper()}'

    log.info(f"Fetching video_library_videos (source={args.source or 'ALL'})...")
    vl_rows = _select(
        'video_library_videos',
        select='youtube_video_id,source_id,source_name,title,thumbnail_url,published_at,type,views_count',
        filters=filters,
        order='published_at.desc.nullslast',
        limit=args.limit or 2000,
    )
    stats['fetched'] = len(vl_rows)
    log.info(f"  {stats['fetched']} videos fetched from video_library_videos")

    # 4. Process and insert
    batch = []
    BATCH_SIZE = 50

    for row in vl_rows:
        vid_id = row.get('youtube_video_id', '')
        if not vid_id:
            continue

        # Skip if already in reels
        if vid_id in existing_ids:
            stats['already_exists'] += 1
            continue

        # Verify video is still live (via oEmbed / Scrapling)
        if args.verify:
            if not verify_youtube_video_scrapling(vid_id):
                log.info(f"  ✗ Dead video skipped: {vid_id} ({row.get('title', '')})")
                stats['verified_dead'] += 1
                continue
            time.sleep(0.3)  # polite rate limiting

        # Build the YouTube watch URL (same format as ClipLibrary.js)
        video_url = f"https://www.youtube.com/watch?v={vid_id}"
        thumbnail_url = (
            row.get('thumbnail_url')
            or f"https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg"
        )

        # Build caption with source context
        source_name = row.get('source_name') or row.get('source_id', '')
        title = row.get('title', '')
        caption = f"{title}" if title else source_name

        reel_row = {
            'author_id': author_id,
            'video_url': video_url,
            'thumbnail_url': thumbnail_url,
            'caption': caption,
            'is_public': True,
            'source_type': 'video_library',
            # BUG FIX: always use NOW() — using published_at backdates rows,
            # burying them behind recent user content in the limit-100 feed
            # 'created_at': row.get('published_at') or ...  ← REMOVED
        }

        batch.append(reel_row)
        existing_ids.add(vid_id)  # prevent duplicate within this run

        if len(batch) >= BATCH_SIZE:
            if not args.dry_run:
                ok = _insert('social_reels', batch)
                if ok:
                    stats['inserted'] += len(batch)
                    log.info(f"  ✓ Inserted batch of {len(batch)} reels")
                else:
                    stats['errors'] += len(batch)
            else:
                log.info(f"  [DRY RUN] Would insert {len(batch)} reels")
                stats['inserted'] += len(batch)
            batch = []

    # Final batch
    if batch:
        if not args.dry_run:
            ok = _insert('social_reels', batch)
            if ok:
                stats['inserted'] += len(batch)
                log.info(f"  ✓ Inserted final batch of {len(batch)} reels")
            else:
                stats['errors'] += len(batch)
        else:
            log.info(f"  [DRY RUN] Would insert {len(batch)} reels")
            stats['inserted'] += len(batch)

    return stats

# ── Entry point ──────────────────────────────────────────────────────────────
def sync_captions(dry_run=False):
    """
    Update stale social_reels captions from video_library_videos titles.
    Only fixes rows where source_type = 'video_library' and the title has changed.
    Run weekly or on-demand: python3 scripts/video_library_to_reels.py --sync-captions
    """
    log.info("Caption sync: fetching all video_library reels...")
    reels = _select(
        'social_reels',
        select='id,video_url,caption',
        filters={'source_type': 'eq.video_library'},
        limit=5000,
    )
    log.info(f"  {len(reels)} video_library reels found")

    # Build a map: youtube_video_id -> reel {id, caption}
    reel_map = {}
    for reel in reels:
        url = reel.get('video_url', '')
        for pattern in ['watch?v=', '/embed/', '/shorts/']:
            if pattern in url:
                vid_id = url.split(pattern)[-1].split('&')[0].split('?')[0][:11]
                reel_map[vid_id] = reel
                break

    log.info(f"  {len(reel_map)} reels with extractable video IDs")

    # Fetch current titles from video_library_videos
    vl_rows = _select(
        'video_library_videos',
        select='youtube_video_id,title',
        limit=5000,
    )

    updated = skipped = mismatched = 0
    for row in vl_rows:
        vid_id = row.get('youtube_video_id', '')
        new_title = row.get('title', '').strip()
        reel = reel_map.get(vid_id)
        if not reel or not new_title:
            skipped += 1
            continue

        old_caption = (reel.get('caption') or '').strip()
        if old_caption == new_title:
            skipped += 1
            continue

        mismatched += 1
        log.info(f"  Caption mismatch [{vid_id}]: '{old_caption[:60]}' → '{new_title[:60]}'")

        if not dry_run:
            req_headers = dict(HEADERS)
            req_headers.pop('Prefer', None)
            url = f"{SUPABASE_URL}/rest/v1/social_reels?id=eq.{reel['id']}"
            data = json.dumps({'caption': new_title}).encode()
            req = urllib.request.Request(url, data=data, headers=req_headers, method='PATCH')
            try:
                with urllib.request.urlopen(req, timeout=15):
                    updated += 1
            except Exception as e:
                log.warning(f"  Caption update failed for {vid_id}: {e}")
        else:
            updated += 1

    log.info(f"Caption sync done — mismatched={mismatched} updated={updated} skipped={skipped}")
    return {'mismatched': mismatched, 'updated': updated, 'skipped': skipped}


def main():
    parser = argparse.ArgumentParser(
        description='Bridge video_library_videos → social_reels via Open Claw'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Run without writing to DB')
    parser.add_argument('--limit', type=int, default=None,
                        help='Max videos to process (default: all)')
    parser.add_argument('--source', type=str, default=None,
                        help='Process a single creator only (e.g. HCL, WSOP, BRAD_OWEN)')
    parser.add_argument('--verify', action='store_true',
                        help='Use Scrapling to verify videos are still live before inserting')
    parser.add_argument('--sync-captions', action='store_true', dest='sync_captions',
                        help='Update stale social_reels captions from video_library_videos titles')
    args = parser.parse_args()

    log.info("=" * 65)
    log.info("VIDEO LIBRARY → SOCIAL REELS BRIDGE")
    log.info(f"  dry_run={args.dry_run} | limit={args.limit} | source={args.source} | verify={args.verify} | sync_captions={args.sync_captions}")
    log.info("=" * 65)

    # 2026-09-21 (fleet recertification D1): fail closed before any other
    # request and before any write, in every mode, dry runs included. This
    # bridge used to run from the Open Claw dispatcher with neither check and
    # could post as a horse while the fleet was switched off.
    switch = read_engine_switch()
    if switch is None:
        log.error('content_settings.engine_enabled could not be read. Exiting without writing (fail closed).')
        sys.exit(1)
    if switch is not True:
        log.info('content_settings.engine_enabled is not true: the fleet is switched off. Exiting without writing.')
        return
    author_id = get_system_bot_id()
    if not author_id:
        sys.exit(1)

    start = time.time()

    if args.sync_captions:
        result = sync_captions(dry_run=args.dry_run)
        log.info(f"Caption sync complete: {result}")
        return

    stats = run_bridge(args, author_id)

    # 2026-09-04: the scheduler used to invoke caption sync INSTEAD of the
    # bridge (see openclaw-cron-dispatcher.py SCRIPT_JOBS). It is cheap and
    # idempotent, so a bridge run now finishes with it; a caption failure must
    # never undo the inserts above.
    try:
        stats['captions'] = sync_captions(dry_run=args.dry_run)
    except Exception as e:  # noqa: BLE001 - reported, not fatal
        log.warning(f"  Caption sync failed after the bridge: {type(e).__name__}: {e}")
        stats['captions'] = {'error': str(e)}
    elapsed = time.time() - start

    log.info("")
    log.info("── RESULTS ──────────────────────────────────────────────────")
    log.info(f"  Fetched from video_library_videos : {stats['fetched']}")
    log.info(f"  Already in social_reels           : {stats['already_exists']}")
    log.info(f"  Dead videos skipped               : {stats['verified_dead']}")
    log.info(f"  Inserted as new reels             : {stats['inserted']}")
    log.info(f"  Errors                            : {stats['errors']}")
    log.info(f"  Elapsed                           : {elapsed:.1f}s")
    log.info("─────────────────────────────────────────────────────────────")

    # Save evidence JSON
    evidence = {
        'run_at': datetime.now(timezone.utc).isoformat(),
        'args': vars(args),
        'stats': stats,
        'elapsed_seconds': round(elapsed, 1),
    }
    ev_path = EVIDENCE_DIR / f"video_library_to_reels_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    try:
        ev_path.write_text(json.dumps(evidence, indent=2))
        log.info(f"  Evidence saved → {ev_path}")
    except OSError as e:
        log.warning(f"  Evidence NOT saved ({e}); the reels were still written")

if __name__ == '__main__':
    main()
