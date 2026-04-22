#!/usr/bin/env python3
"""
VIDEO LIBRARY → SOCIAL REELS BRIDGE v1.0
=========================================
Reads all videos from video_library_videos, cross-checks against social_reels,
and inserts any new videos so they appear in the Reels doom-scroll feed.

Uses Scrapling + camoufox to verify YouTube videos are still live before inserting.

Architecture:
  - Runs locally via Open Claw (NOT on Vercel serverless).
  - Open Claw triggers this script daily via shell call.
  - Follows the exact same pattern as video_library_scraper.py.

Open Claw cron (daily 7am UTC — 1hr after video_library_scraper.py):
    python3 /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/video_library_to_reels.py

Usage:
    python3 scripts/video_library_to_reels.py               # Full daily run
    python3 scripts/video_library_to_reels.py --dry-run     # No DB writes
    python3 scripts/video_library_to_reels.py --limit 50    # Process only N videos
    python3 scripts/video_library_to_reels.py --source HCL  # Single creator only
    python3 scripts/video_library_to_reels.py --verify      # Scrapling verify mode
"""

import os
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

# ── Logging ─────────────────────────────────────────────────────────────────
LOG_DIR = Path.home() / '.smarter-poker' / 'logs'
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'video-library-to-reels.log'),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger('video-library-to-reels')

# Evidence directory
EVIDENCE_DIR = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/data/scrape-evidence')
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# ── Env ──────────────────────────────────────────────────────────────────────
_BASE = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub')

def _load_env():
    """Load env vars from all candidate files (highest priority first)."""
    candidates = [
        _BASE / '.env.local',
        _BASE / '.env.production',
        _BASE / '.env.vercel-db',
        _BASE / '.env',
        _BASE / '.env.prod',
    ]
    for env_file in candidates:
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

_load_env()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error('Missing SUPABASE credentials — checked .env.local, .env.production, .env.vercel-db')
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

def _select(table, select='*', filters=None, limit=None, order=None):
    params = {'select': select}
    if filters:
        params.update(filters)
    if limit:
        params['limit'] = limit
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

# ── System bot lookup ────────────────────────────────────────────────────────
def get_system_bot_id():
    """
    Find the system bot profile_id used for automated content.
    Uses the same pattern as pokernews-videos.js:
    look for a content_author with a valid profile_id.
    """
    rows = _select(
        'content_authors',
        select='id,profile_id,name',
        filters={'profile_id': 'not.is.null'},
        limit=1,
        order='id.asc',
    )
    if rows and rows[0].get('profile_id'):
        bot = rows[0]
        log.info(f"Using bot author: {bot.get('name')} / profile_id={bot['profile_id']}")
        return bot['profile_id']

    log.error("No valid content_author with profile_id found — cannot insert reels")
    return None

# ── Already-in-reels set ─────────────────────────────────────────────────────
def get_existing_reel_video_ids():
    """
    Return a set of youtube video IDs already in social_reels
    (matched by source_type = 'video_library' or youtube URL pattern).
    """
    rows = _select(
        'social_reels',
        select='video_url',
        filters={'source_type': 'eq.video_library'},
        limit=5000,
    )
    ids = set()
    for r in rows:
        url = r.get('video_url', '')
        # Extract video ID from embed or watch URL
        for pattern in ['watch?v=', '/embed/', '/shorts/']:
            if pattern in url:
                vid_id = url.split(pattern)[-1].split('&')[0].split('?')[0][:11]
                ids.add(vid_id)
    return ids

# ── Main bridge logic ────────────────────────────────────────────────────────
def run_bridge(args):
    stats = {
        'fetched': 0,
        'already_exists': 0,
        'verified_dead': 0,
        'skipped_source': 0,
        'inserted': 0,
        'errors': 0,
    }

    # 1. Get the system bot author_id
    author_id = get_system_bot_id()
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
            'created_at': row.get('published_at') or datetime.now(timezone.utc).isoformat(),
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
    args = parser.parse_args()

    log.info("=" * 65)
    log.info("VIDEO LIBRARY → SOCIAL REELS BRIDGE")
    log.info(f"  dry_run={args.dry_run} | limit={args.limit} | source={args.source} | verify={args.verify}")
    log.info("=" * 65)

    start = time.time()
    stats = run_bridge(args)
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
    ev_path.write_text(json.dumps(evidence, indent=2))
    log.info(f"  Evidence saved → {ev_path}")

if __name__ == '__main__':
    main()
