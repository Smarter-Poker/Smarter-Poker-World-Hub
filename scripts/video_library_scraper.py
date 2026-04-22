#!/usr/bin/env python3
"""
VIDEO LIBRARY DAILY SCRAPER v2.0
=================================
Uses yt-dlp --flat-playlist to discover new videos from all 25 creators.
Runs locally/on Hetzner, NOT on Vercel (yt-dlp can't run serverless).

Architecture:
  - This script is the ingestion engine (runs on the machine via cron/daemon)
  - The API cron /api/cron/video-library-scraper is a status webhook
  - Open Claw triggers this script via a shell call or manages it as a daemon

CREATORS COVERED (25 — matches SOURCES in videoLibraryData.js):
  Live: HCL, LODGE, TRITON, LATB, TCH, POKERGO
  Tours: WSOP, WPT, EPT
  Vloggers: BRAD_OWEN, NEEME, RAMPAGE, MARIANO, WOLFGANG, JOHNNIE, BOSKI, RYAN
  Training: JLITTLE, POLK, BART, UPSWING
  Celebrity: NEGREANU, HELLMUTH, IVEY, DWAN, GARRETT

Usage:
    python3 scripts/video_library_scraper.py [--dry-run] [--source HCL]

Schedule (cron example):
    0 6 * * * /usr/bin/python3 /path/to/scripts/video_library_scraper.py >> ~/.smarter-poker/logs/video-library.log 2>&1
"""

import os
import sys
import json
import time
import hashlib
import logging
import subprocess
import argparse
from datetime import datetime, timezone
from pathlib import Path

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

# Evidence directory (Scrapling SKILL compliance)
EVIDENCE_DIR = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/data/scrape-evidence')
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# ── Env ───────────────────────────────────────────────────────────────────────
def _load_env():
    env_file = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local')
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
    log.error('Missing SUPABASE credentials')
    sys.exit(1)

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Creator Registry — verified @handles (yt-dlp resolves to real channel IDs) ──
# All handles verified by fetching from known video IDs or direct yt-dlp discovery.
# Last verified: 2026-04-22
CREATORS = [
    # LIVE STREAMS
    {'source_id': 'HCL',      'name': 'Hustler Casino Live', 'handle': 'HustlerCasinoLive',  'type': 'cash',       'max': 20},
    {'source_id': 'LODGE',    'name': 'The Lodge',            'handle': 'TheLodgeLive',        'type': 'cash',       'max': 15},  # was @TheLodgeCard — real handle verified
    {'source_id': 'TRITON',   'name': 'Triton Poker',         'handle': 'TritonPoker',         'type': 'tournament', 'max': 15},
    {'source_id': 'LATB',     'name': 'Bally Poker Live',     'handle': 'BallyPokerLive',      'type': 'cash',       'max': 12},  # LATB rebranded to Bally
    {'source_id': 'TCH',      'name': 'TCH Live',             'handle': 'texascardhouse',      'type': 'cash',       'max': 10},  # lowercase verified
    {'source_id': 'POKERGO',  'name': 'PokerGO',              'handle': 'PokerGO',             'type': 'cash',       'max': 10},

    # MAJOR TOURS
    {'source_id': 'WSOP',     'name': 'WSOP',                 'handle': 'wsop',                'type': 'tournament', 'max': 15},
    {'source_id': 'WPT',      'name': 'World Poker Tour',     'handle': 'worldpokertour',      'type': 'tournament', 'max': 12},  # verified
    {'source_id': 'EPT',      'name': 'EPT Poker',            'handle': 'PokerStars',          'type': 'tournament', 'max': 12},

    # TOP VLOGGERS
    {'source_id': 'BRAD_OWEN','name': 'Brad Owen',            'handle': 'BradOwenPoker',       'type': 'cash',       'max': 10},
    {'source_id': 'NEEME',    'name': 'Andrew Neeme',         'handle': 'AndrewNeeme',         'type': 'cash',       'max':  8},
    {'source_id': 'RAMPAGE',  'name': 'Rampage Poker',        'handle': 'RampagePoker',        'type': 'cash',       'max':  8},
    {'source_id': 'MARIANO',  'name': 'Mariano',              'handle': 'MarianoPoker',        'type': 'cash',       'max':  8},
    {'source_id': 'WOLFGANG', 'name': 'Wolfgang Poker',       'handle': 'Wolfgang_Poker',      'type': 'cash',       'max':  8},  # verified
    {'source_id': 'JOHNNIE',  'name': 'JohnnieVibes',         'handle': 'JohnnieVibes',        'type': 'cash',       'max':  6},
    {'source_id': 'BOSKI',    'name': 'Boski',                'handle': 'BoskiPoker',          'type': 'cash',       'max':  6},
    {'source_id': 'RYAN',     'name': 'Ryan Depaulo',         'handle': 'RyanDepaulo',         'type': 'cash',       'max':  6},

    # TRAINING / STRATEGY
    {'source_id': 'JLITTLE',  'name': 'Jonathan Little',      'handle': 'JonathanLittlePoker', 'type': 'cash',       'max': 10},
    {'source_id': 'POLK',     'name': 'Doug Polk Poker',      'handle': 'DougPolkPoker',       'type': 'cash',       'max': 10},
    {'source_id': 'BART',     'name': 'Bart Hanson',          'handle': 'CrushLivePoker',      'type': 'cash',       'max':  8},
    {'source_id': 'UPSWING',  'name': 'Upswing Poker',        'handle': 'UpswingPoker',        'type': 'cash',       'max': 10},

    # CELEBRITY PROS (best-effort — may not have active channels)
    {'source_id': 'NEGREANU', 'name': 'Daniel Negreanu',      'handle': 'dnegspoker',          'type': 'cash',       'max':  8},  # verified @dnegspoker
    {'source_id': 'HELLMUTH', 'name': 'Phil Hellmuth',        'handle': 'PhilHellmuth',        'type': 'tournament', 'max':  6},
    {'source_id': 'IVEY',     'name': 'Phil Ivey',            'handle': 'PhilIvey',            'type': 'cash',       'max':  6},
    {'source_id': 'DWAN',     'name': 'Tom Dwan',             'handle': 'TomDwan',             'type': 'cash',       'max':  6},
    {'source_id': 'GARRETT',  'name': 'Garrett Adelstein',    'handle': 'GarrettAdelstein',    'type': 'cash',       'max':  6},
]


def format_views(n: int) -> str:
    if not n:
        return '0'
    if n >= 1_000_000:
        return f'{n/1_000_000:.1f}M'
    if n >= 1_000:
        return f'{n/1_000:.0f}K'
    return str(n)


def format_duration(sec) -> str | None:
    if not sec:
        return None
    sec = int(sec)
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    if h:
        return f'{h}:{m:02d}:{s:02d}'
    return f'{m}:{s:02d}'


def fetch_channel_videos(creator: dict, dry_run: bool = False) -> list[dict]:
    """
    Use yt-dlp --flat-playlist to get the latest N videos from a YouTube channel.
    Returns list of video dicts.
    """
    handle = creator['handle']
    url = f'https://www.youtube.com/@{handle}/videos'
    max_vids = creator['max']

    cmd = [
        'yt-dlp',
        '--flat-playlist',
        '--dump-json',
        '--no-warnings',
        '--quiet',
        '--playlist-end', str(max_vids),
        url,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 and not result.stdout.strip():
            log.warning(f'  [{creator["source_id"]}] yt-dlp failed (rc={result.returncode}): {result.stderr[:200]}')
            return []

        videos = []
        for line in result.stdout.strip().splitlines():
            try:
                d = json.loads(line)
                vid_id = d.get('id')
                if not vid_id:
                    continue
                videos.append({
                    'youtube_video_id': vid_id,
                    'source_id':        creator['source_id'],
                    'source_name':      creator['name'],
                    'type':             creator['type'],
                    'title':            d.get('title', ''),
                    'views_count':      d.get('view_count', 0) or 0,
                    'views_text':       format_views(d.get('view_count', 0) or 0),
                    'duration':         format_duration(d.get('duration')),
                    'thumbnail_url':    (d.get('thumbnails') or [{}])[-1].get('url') or f'https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg',
                    'video_url':        f'https://www.youtube.com/watch?v={vid_id}',
                    'published_at':     datetime.now(timezone.utc).isoformat(),
                    'scraped_at':       datetime.now(timezone.utc).isoformat(),
                })
            except json.JSONDecodeError:
                continue

        return videos

    except subprocess.TimeoutExpired:
        log.warning(f'  [{creator["source_id"]}] yt-dlp timed out')
        return []
    except Exception as e:
        log.error(f'  [{creator["source_id"]}] Unexpected error: {e}')
        return []


def run_scraper(dry_run: bool = False, filter_source: str | None = None):
    """Main scraper loop — processes all 25 creators."""
    log.info('=' * 60)
    log.info(f'Video Library Scraper v2.0 — {"DRY RUN" if dry_run else "LIVE"}')
    log.info(f'Time: {datetime.now(timezone.utc).isoformat()}')
    log.info('=' * 60)

    start = datetime.now(timezone.utc)

    # Load all existing IDs for dedup
    existing_resp = supabase.table('video_library_videos').select('youtube_video_id').execute()
    existing_ids = set(v['youtube_video_id'] for v in (existing_resp.data or []))
    log.info(f'Existing videos in DB: {len(existing_ids)}')

    summary = {
        'processed': 0, 'failed': 0,
        'total_found': 0, 'total_new': 0, 'total_skipped': 0,
        'creator_results': [],
    }

    creators = CREATORS
    if filter_source:
        creators = [c for c in CREATORS if c['source_id'] == filter_source.upper()]
        if not creators:
            log.error(f'Unknown source_id: {filter_source}')
            return

    for creator in creators:
        log.info(f'Processing {creator["name"]} (@{creator["handle"]})...')
        cr = {'source_id': creator['source_id'], 'found': 0, 'new': 0, 'skipped': 0, 'error': None}

        try:
            videos = fetch_channel_videos(creator, dry_run)
            cr['found'] = len(videos)
            summary['total_found'] += len(videos)

            if not videos:
                log.info(f'  [{creator["source_id"]}] No videos fetched')
                summary['failed'] += 1
                cr['error'] = 'No videos fetched'
                summary['creator_results'].append(cr)
                continue

            new_vids = [v for v in videos if v['youtube_video_id'] not in existing_ids]
            cr['skipped'] = len(videos) - len(new_vids)
            summary['total_skipped'] += cr['skipped']

            if not new_vids:
                log.info(f'  [{creator["source_id"]}] All {len(videos)} videos already in DB')
                summary['processed'] += 1
                summary['creator_results'].append(cr)
                continue

            log.info(f'  [{creator["source_id"]}] Found {len(new_vids)} new videos')

            if not dry_run:
                inserted = 0
                for v in new_vids:
                    try:
                        supabase.table('video_library_videos').insert(v).execute()
                        existing_ids.add(v['youtube_video_id'])
                        inserted += 1
                    except Exception as e:
                        if '23505' in str(e) or 'duplicate' in str(e).lower():
                            pass  # race condition — already inserted
                        else:
                            log.warning(f'    Insert failed for {v["youtube_video_id"]}: {e}')

                cr['new'] = inserted
                summary['total_new'] += inserted
                log.info(f'  [{creator["source_id"]}] Inserted {inserted} new videos')
            else:
                cr['new'] = len(new_vids)
                log.info(f'  [{creator["source_id"]}] DRY RUN: would insert {len(new_vids)} videos')
                for v in new_vids[:3]:
                    log.info(f'    - {v["youtube_video_id"]} | {v["title"][:60]}')

            summary['processed'] += 1

        except Exception as e:
            log.error(f'  [{creator["source_id"]}] Fatal error: {e}')
            cr['error'] = str(e)
            summary['failed'] += 1

        summary['creator_results'].append(cr)
        time.sleep(1)  # Polite between channels

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    summary['elapsed_s'] = elapsed

    # Write evidence file
    evidence = {
        'scraper': 'video_library_scraper_v2',
        'ran_at': start.isoformat(),
        'dry_run': dry_run,
        'elapsed_s': elapsed,
        'summary': summary,
    }
    ts = start.strftime('%Y%m%d_%H%M%S')
    ev_file = EVIDENCE_DIR / f'video_library_scraper_{ts}.json'
    ev_file.write_text(json.dumps(evidence, indent=2))
    log.info(f'Evidence saved: {ev_file.name}')

    # Audit log (correct schema)
    if not dry_run:
        try:
            import uuid
            supabase.table('data_audit_log').insert({
                'record_id': str(uuid.uuid4()),
                'table_name': 'video_library_videos',
                'action': 'scrape',
                'scrape_proof': json.dumps({
                    'scraper': 'video_library_scraper_v2',
                    'creators_processed': summary['processed'],
                    'creators_failed': summary['failed'],
                    'total_found': summary['total_found'],
                    'total_new': summary['total_new'],
                    'elapsed_s': elapsed,
                    'ran_at': start.isoformat(),
                }),
            }).execute()
        except Exception as e:
            log.warning(f'Audit log insert failed: {e}')

    log.info('=' * 60)
    log.info(f'DONE: processed={summary["processed"]} failed={summary["failed"]} '
             f'found={summary["total_found"]} new={summary["total_new"]} '
             f'skipped={summary["total_skipped"]} elapsed={elapsed:.1f}s')
    log.info('=' * 60)

    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Video Library Daily Scraper')
    parser.add_argument('--dry-run', action='store_true', help='Fetch but do not write to DB')
    parser.add_argument('--source', type=str, help='Only scrape one source (e.g. HCL)')
    args = parser.parse_args()
    run_scraper(dry_run=args.dry_run, filter_source=args.source)
