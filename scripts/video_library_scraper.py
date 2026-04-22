#!/usr/bin/env python3
"""
VIDEO LIBRARY SCRAPER v1.0 — Duration Enricher + Camoufox Fallback
====================================================================
Companion to /api/cron/video-library-scraper.js

This script:
  1. Enriches videos in video_library_videos that have NULL duration
     by fetching metadata via yt-dlp (fast, no API key needed)
  2. Backfills any creators whose RSS was unavailable using Scrapling
     + camoufox (Cloudflare bypass)
  3. Runs nightly via OpenClaw at 3am UTC

Usage:
    cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
    source .venv/bin/activate
    python3 scripts/video_library_scraper.py

Schedule (openclaw-cron-dispatcher.py):
    /api/cron/video-library-scraper   06:00 UTC daily (RSS ingest)
    python3 scripts/video_library_scraper.py  03:00 UTC daily (enrichment)
"""

import os
import sys
import json
import time
import hashlib
import logging
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ── Deps check ────────────────────────────────────────────────────────────────
try:
    from supabase import create_client
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'supabase'])
    from supabase import create_client

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_DIR = Path.home() / '.smarter-poker' / 'logs'
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'video-library-scraper.log'),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger('video-library-scraper')


# ── Config ────────────────────────────────────────────────────────────────────
def _load_env():
    """Load .env.local into os.environ."""
    env_file = Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / '.env.local'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                val = val.strip().strip('"').strip("'")
                os.environ.setdefault(key.strip(), val)

_load_env()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error('Missing SUPABASE credentials. Check .env.local')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Evidence directory (Scrapling SKILL requirement)
EVIDENCE_DIR = Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / 'data' / 'scrape-evidence'
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


# ── Network Pre-check (Scrapling SKILL requirement) ───────────────────────────
def _network_available():
    try:
        req = urllib.request.Request('https://1.1.1.1', method='HEAD')
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False


# ── Duration fetcher via yt-dlp ───────────────────────────────────────────────
def get_duration_ytdlp(youtube_video_id: str) -> str | None:
    """
    Use yt-dlp to fetch duration for a single video.
    Returns 'MM:SS' or 'H:MM:SS' string, or None on failure.
    """
    url = f'https://www.youtube.com/watch?v={youtube_video_id}'
    try:
        result = subprocess.run(
            ['yt-dlp', '--dump-json', '--no-warnings', '--quiet', url],
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            return None
        data = json.loads(result.stdout)
        duration_sec = data.get('duration', 0)
        if not duration_sec:
            return None
        return format_duration(int(duration_sec))
    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        log.debug(f'yt-dlp failed for {youtube_video_id}: {e}')
        return None


def format_duration(total_seconds: int) -> str:
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    if h > 0:
        return f'{h}:{m:02d}:{s:02d}'
    return f'{m}:{s:02d}'


# ── Batch duration enrichment ─────────────────────────────────────────────────
def enrich_durations(batch_size: int = 50):
    """
    Fetch all videos with NULL duration and enrich them via yt-dlp.
    Processes in batches to avoid overwhelming the network.
    """
    log.info('=== Duration Enrichment Pass ===')

    # Fetch videos missing duration
    resp = supabase.table('video_library_videos') \
        .select('id, youtube_video_id, title') \
        .is_('duration', 'null') \
        .limit(batch_size) \
        .execute()

    videos = resp.data or []
    log.info(f'Found {len(videos)} videos needing duration enrichment')

    enriched = 0
    failed = 0

    for v in videos:
        vid_id = v['youtube_video_id']
        duration = get_duration_ytdlp(vid_id)

        if duration:
            supabase.table('video_library_videos') \
                .update({'duration': duration, 'enriched_at': datetime.now(timezone.utc).isoformat()}) \
                .eq('id', v['id']) \
                .execute()
            log.info(f'  ✓ {vid_id} → {duration}')
            enriched += 1
        else:
            # Set a placeholder so we don't retry endlessly
            supabase.table('video_library_videos') \
                .update({'duration': '?', 'enriched_at': datetime.now(timezone.utc).isoformat()}) \
                .eq('id', v['id']) \
                .execute()
            failed += 1

        # Polite delay between yt-dlp calls
        time.sleep(0.5)

    log.info(f'Duration enrichment: {enriched} enriched, {failed} failed')
    return enriched, failed


# ── Scrapling fallback for blocked RSS channels ───────────────────────────────
def scrape_channel_scrapling(channel_id: str, source_id: str, source_name: str, video_type: str, max_videos: int = 10):
    """
    Fallback scraper using Scrapling + camoufox for channels whose RSS
    returns empty or 403. Scrapes the YouTube channel page directly.

    Per Scrapling SKILL: always capture SHA-256 hash + save evidence.
    """
    if not _network_available():
        log.error('Network unavailable — skipping Scrapling fallback')
        return []

    url = f'https://www.youtube.com/channel/{channel_id}/videos'
    log.info(f'Scrapling fallback for {source_name}: {url}')

    try:
        from scrapling.fetchers import StealthySession
    except ImportError:
        log.warning('Scrapling not installed — skipping fallback')
        return []

    session = None
    videos = []

    try:
        session = StealthySession(headless=True, solve_cloudflare=True)
        session.start()

        # CF-solve retry (3x per Scrapling SKILL)
        resp = None
        for attempt in range(3):
            try:
                resp = session.fetch(url, google_search=True)
                if resp and resp.status == 200:
                    break
            except Exception as e:
                log.warning(f'Attempt {attempt + 1} failed for {source_name}: {e}')
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    session.close()
                    session = StealthySession(headless=True, solve_cloudflare=True)
                    session.start()
                else:
                    raise

        if not resp or resp.status != 200:
            log.warning(f'Failed to fetch {url} after 3 attempts')
            return []

        body = resp.body or b''

        # SHA-256 evidence (Scrapling SKILL requirement)
        html_hash = hashlib.sha256(body).hexdigest()
        evidence = {
            'scrape_url': url,
            'scrape_http_status': resp.status,
            'scrape_html_hash': html_hash,
            'scrape_byte_count': len(body),
            'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
            'scrape_script': __file__,
            'source_id': source_id,
            'body_preview': body.decode('utf-8', errors='replace')[:300],
        }

        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        evidence_file = EVIDENCE_DIR / f'video_library_{source_id}_{timestamp}.json'
        evidence_file.write_text(json.dumps(evidence, indent=2))
        log.info(f'Evidence saved: {evidence_file.name}')

        # Parse video IDs from page source
        import re
        html_text = body.decode('utf-8', errors='replace')
        # YouTube embeds video IDs in the page JSON
        id_pattern = re.compile(r'"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"')
        title_pattern = re.compile(r'"title"\s*:\s*\{"runs"\s*:\s*\[{"text"\s*:\s*"([^"]{5,120})"')

        found_ids = list(dict.fromkeys(id_pattern.findall(html_text)))[:max_videos]
        found_titles = title_pattern.findall(html_text)

        for i, vid_id in enumerate(found_ids):
            title = found_titles[i] if i < len(found_titles) else f'{source_name} Video'
            videos.append({
                'youtube_video_id': vid_id,
                'source_id': source_id,
                'source_name': source_name,
                'type': video_type,
                'title': title,
                'thumbnail_url': f'https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg',
                'video_url': f'https://www.youtube.com/watch?v={vid_id}',
                'views_text': '0',
                'views_count': 0,
                'published_at': datetime.now(timezone.utc).isoformat(),
                'duration': None,
                'scraped_at': datetime.now(timezone.utc).isoformat(),
            })

        log.info(f'Scrapling found {len(videos)} videos for {source_name}')

    except Exception as e:
        log.error(f'Scrapling error for {source_name}: {e}')
    finally:
        try:
            if session:
                session.close()
        except Exception:
            pass

    return videos


# ── Upsert scrapled videos to Supabase ────────────────────────────────────────
def upsert_videos(videos: list) -> dict:
    if not videos:
        return {'imported': 0, 'skipped': 0}

    # Load existing IDs
    existing_resp = supabase.table('video_library_videos') \
        .select('youtube_video_id') \
        .execute()
    existing = {v['youtube_video_id'] for v in (existing_resp.data or [])}

    new_videos = [v for v in videos if v['youtube_video_id'] not in existing]

    if not new_videos:
        return {'imported': 0, 'skipped': len(videos)}

    resp = supabase.table('video_library_videos') \
        .upsert(new_videos, on_conflict='youtube_video_id') \
        .execute()

    imported = len(new_videos)
    log.info(f'Upserted {imported} new videos')
    return {'imported': imported, 'skipped': len(videos) - imported}


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    log.info('=' * 60)
    log.info('Video Library Scraper v1.0 starting')
    log.info(f'Time: {datetime.now(timezone.utc).isoformat()}')
    log.info('=' * 60)

    # Step 1: Enrich durations for videos missing them
    enriched, failed = enrich_durations(batch_size=50)

    # Step 2: Audit log
    try:
        supabase.table('data_audit_log').insert({
            'table_name': 'video_library_videos',
            'action': 'duration_enrichment',
            'scrape_proof': json.dumps({
                'scraper': 'video_library_scraper_py',
                'enriched': enriched,
                'failed': failed,
                'ran_at': datetime.now(timezone.utc).isoformat(),
            }),
        }).execute()
    except Exception as e:
        log.warning(f'Audit log failed: {e}')

    log.info(f'Complete. Enriched={enriched}, Failed={failed}')


if __name__ == '__main__':
    main()
