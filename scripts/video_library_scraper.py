#!/usr/bin/env python3
"""
VIDEO LIBRARY DAILY SCRAPER v3.0
=================================
Uses yt-dlp --flat-playlist to discover new videos from all 23 active creators.
Runs locally on this machine. yt-dlp cannot run serverless on Vercel.

Architecture:
  - This is the ONLY real ingestion engine.
  - The API cron /api/cron/video-library-scraper is a status/reporting webhook only.
  - Open Claw triggers this script daily via shell call at 6am UTC.

CREATORS COVERED (23 active — BOSKI/RYAN have no accessible channel):
  Live:     HCL, LODGE, LATB, TCH, POKERGO, TRITON
  Tours:    WSOP, WPT, EPT
  Vloggers: BRAD_OWEN, NEEME, RAMPAGE, MARIANO, WOLFGANG, JOHNNIE
  Training: JLITTLE, POLK, BART, UPSWING
  Celebrity:NEGREANU, HELLMUTH, IVEY, DWAN, GARRETT

Usage:
    python3 scripts/video_library_scraper.py               # Full daily run
    python3 scripts/video_library_scraper.py --dry-run     # No DB writes
    python3 scripts/video_library_scraper.py --source HCL  # Single creator
    python3 scripts/video_library_scraper.py --purge       # Purge dead videos only
    python3 scripts/video_library_scraper.py --backfill    # Backfill dates+views only

Open Claw cron (daily 6am UTC):
    python3 /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/video_library_scraper.py
"""

import os
import sys
import json
import time
import uuid
import threading
import logging
import subprocess
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── Logging ────────────────────────────────────────────────────────────────────
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

# Evidence directory
EVIDENCE_DIR = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/data/scrape-evidence')
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# ── Env ─────────────────────────────────────────────────────────────────────────
def _load_env():
    env_file = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local')
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

_load_env()

SUPABASE_URL      = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY      = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
CRON_SECRET       = os.environ.get('CRON_SECRET', '')
PRODUCTION_URL    = os.environ.get('NEXT_PUBLIC_SITE_URL', 'https://smarter.poker')  # used by AI tagging
SLACK_WEBHOOK     = os.environ.get('SLACK_WEBHOOK_URL', '')  # optional — alert on scraper failures

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error('Missing SUPABASE credentials — check .env.local')
    sys.exit(1)

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Creator Registry ────────────────────────────────────────────────────────────
# All @handles verified 2026-04-22 via yt-dlp against real video metadata.
# To verify a handle: yt-dlp --flat-playlist --dump-json --playlist-end 1 "https://www.youtube.com/@handle/videos"
CREATORS = [
    # LIVE STREAMS
    {'source_id': 'HCL',       'name': 'Hustler Casino Live', 'handle': 'HustlerCasinoLive',  'type': 'cash',       'max': 20},
    {'source_id': 'LODGE',     'name': 'The Lodge',            'handle': 'TheLodgeLive',        'type': 'cash',       'max': 15},
    {'source_id': 'TRITON',    'name': 'Triton Poker',         'handle': 'TritonPoker',         'type': 'tournament', 'max': 15},
    {'source_id': 'LATB',      'name': 'Bally Poker Live',     'handle': 'BallyPokerLive',      'type': 'cash',       'max': 12},
    {'source_id': 'TCH',       'name': 'TCH Live',             'handle': 'texascardhouse',      'type': 'cash',       'max': 10},
    {'source_id': 'POKERGO',   'name': 'PokerGO',              'handle': 'PokerGO',             'type': 'cash',       'max': 10},

    # MAJOR TOURS
    {'source_id': 'WSOP',      'name': 'WSOP',                 'handle': 'wsop',                'type': 'tournament', 'max': 15},
    {'source_id': 'WPT',       'name': 'World Poker Tour',     'handle': 'worldpokertour',      'type': 'tournament', 'max': 12},
    {'source_id': 'EPT',       'name': 'EPT Poker',            'handle': 'PokerStars',          'type': 'tournament', 'max': 12},

    # TOP VLOGGERS
    {'source_id': 'BRAD_OWEN', 'name': 'Brad Owen',            'handle': 'BradOwenPoker',       'type': 'cash',       'max': 10},
    {'source_id': 'NEEME',     'name': 'Andrew Neeme',         'handle': 'AndrewNeeme',         'type': 'cash',       'max':  8},
    {'source_id': 'RAMPAGE',   'name': 'Rampage Poker',        'handle': 'RampagePoker',        'type': 'cash',       'max':  8},
    {'source_id': 'MARIANO',   'name': 'Mariano',              'handle': 'MarianoPoker',        'type': 'cash',       'max':  8},
    {'source_id': 'WOLFGANG',  'name': 'Wolfgang Poker',       'handle': 'Wolfgang_Poker',      'type': 'cash',       'max':  8},
    {'source_id': 'JOHNNIE',   'name': 'JohnnieVibes',         'handle': 'JohnnieVibes',        'type': 'cash',       'max':  6},

    # TRAINING / STRATEGY
    {'source_id': 'JLITTLE',   'name': 'Jonathan Little',      'handle': 'JonathanLittlePoker', 'type': 'cash',       'max': 10},
    {'source_id': 'POLK',      'name': 'Doug Polk Poker',      'handle': 'DougPolkPoker',       'type': 'cash',       'max': 10},
    {'source_id': 'BART',      'name': 'Bart Hanson',          'handle': 'CrushLivePoker',      'type': 'cash',       'max':  8},
    {'source_id': 'UPSWING',   'name': 'Upswing Poker',        'handle': 'UpswingPoker',        'type': 'cash',       'max': 10},

    # CELEBRITY PROS (may have limited/no active channels)
    {'source_id': 'NEGREANU',  'name': 'Daniel Negreanu',      'handle': 'dnegspoker',          'type': 'cash',       'max':  8},
    {'source_id': 'HELLMUTH',  'name': 'Phil Hellmuth',        'handle': 'PhilHellmuth',        'type': 'tournament', 'max':  6},
    {'source_id': 'IVEY',      'name': 'Phil Ivey',            'handle': 'PhilIvey',            'type': 'cash',       'max':  6},
    {'source_id': 'DWAN',      'name': 'Tom Dwan',             'handle': 'TomDwan',             'type': 'cash',       'max':  6},
    {'source_id': 'GARRETT',   'name': 'Garrett Adelstein',    'handle': 'GarrettAdelstein',    'type': 'cash',       'max':  6},
]


# ── Helpers ─────────────────────────────────────────────────────────────────────

def fmt_views(n: int) -> str:
    if not n: return ''
    if n >= 1_000_000: return f'{n/1_000_000:.1f}M'
    if n >= 1_000:     return f'{n/1_000:.0f}K'
    return str(n)


def fmt_duration(sec) -> str | None:
    if not sec: return None
    sec = int(sec)
    h, rem = divmod(sec, 3600)
    m, s   = divmod(rem, 60)
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}'


def yt_upload_date_to_iso(ud: str) -> str | None:
    """Convert YYYYMMDD → ISO 8601 UTC timestamp string."""
    if ud and len(ud) == 8 and ud.isdigit():
        return f'{ud[:4]}-{ud[4:6]}-{ud[6:]}T00:00:00+00:00'
    return None


def check_playable(vid_id: str) -> bool:
    """Returns True if the video is publicly embeddable (YouTube oEmbed 200)."""
    url = f'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid_id}&format=json'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=6):
            return True
    except urllib.error.HTTPError:
        return False
    except Exception:
        return True  # Network error — don't delete on uncertainty


def report_to_api(summary: dict) -> None:
    """POST scrape results back to the status API so audit log is kept up to date."""
    if not CRON_SECRET:
        return
    try:
        data = json.dumps(summary).encode('utf-8')
        url  = 'https://smarter.poker/api/cron/video-library-scraper?report=1'
        req  = urllib.request.Request(
            url, data=data, method='POST',
            headers={
                'Content-Type':  'application/json',
                'Authorization': f'Bearer {CRON_SECRET}',
            }
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as e:
        log.warning(f'Report-back to API failed (non-fatal): {e}')


def send_failure_alert(summary: dict) -> None:
    """
    POST a Slack webhook alert when >= 3 creators fail in one run.
    Requires SLACK_WEBHOOK_URL in .env.local (optional — silently skipped if absent).
    """
    if not SLACK_WEBHOOK:
        return
    try:
        failed_sources = [
            cr['source_id'] for cr in summary.get('creator_results', [])
            if cr.get('error')
        ]
        msg = {
            'text': (
                f':warning: *Video Library Scraper — {summary["failed"]} creator(s) failed*\n'
                f'Failed: `{",".join(failed_sources)}`\n'
                f'New: {summary["total_new"]}  Found: {summary["total_found"]}  '
                f'Elapsed: {summary.get("elapsed_s", 0):.0f}s\n'
                f'Time: {summary["ran_at"]}'
            )
        }
        data = json.dumps(msg).encode('utf-8')
        req  = urllib.request.Request(
            SLACK_WEBHOOK, data=data, method='POST',
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
        log.info('Slack failure alert sent.')
    except Exception as e:
        log.warning(f'Slack alert failed (non-fatal): {e}')


# ── Dead-video purge ─────────────────────────────────────────────────────────────

def purge_dead_videos(batch_size: int = 20, dry_run: bool = False) -> dict:
    """
    Check all DB videos via YouTube oEmbed API. Delete any that return 4xx.
    Safe: skips on network errors (only deletes on confirmed HTTP 4xx).
    """
    log.info('Starting dead-video purge...')
    # 2026-08-15: same 1000-row PostgREST cap — the purge silently stopped
    # checking anything past row 1000, so dead/private videos accumulated
    # forever once the library outgrew that.
    all_vids = []
    _page, _size = 0, 1000
    while True:
        _rows = (supabase.table('video_library_videos')
                 .select('id,youtube_video_id,source_id,title')
                 .range(_page * _size, _page * _size + _size - 1)
                 .execute().data or [])
        all_vids.extend(_rows)
        if len(_rows) < _size:
            break
        _page += 1

    dead_ids   = []
    dead_vids  = []
    checked    = 0

    for v in all_vids:
        vid_id = v['youtube_video_id']
        if not check_playable(vid_id):
            dead_ids.append(v['id'])
            dead_vids.append((v['source_id'], vid_id, v['title'][:60]))
        checked += 1
        time.sleep(0.08)  # ~12/sec — polite

    log.info(f'Checked {checked} videos. Dead: {len(dead_ids)}')
    for d in dead_vids:
        log.warning(f'  DEAD [{d[0]}] {d[1]} — {d[2]}')

    if dead_ids and not dry_run:
        # Get the youtube_video_ids of dead videos for orphan cleanup
        dead_youtube_ids = [v['youtube_video_id'] for v in all_vids if v['id'] in dead_ids]
        for db_id in dead_ids:
            supabase.table('video_library_videos').delete().eq('id', db_id).execute()
        log.info(f'Deleted {len(dead_ids)} unplayable videos.')
        # Purge orphaned video_analysis rows for the deleted videos
        if dead_youtube_ids:
            try:
                supabase.table('video_analysis').delete().in_('video_id', dead_youtube_ids).execute()
                log.info(f'Purged {len(dead_youtube_ids)} orphaned video_analysis rows.')
            except Exception as e:
                log.warning(f'video_analysis orphan cleanup failed (non-fatal): {e}')

    return {'checked': checked, 'dead': len(dead_ids), 'purged': 0 if dry_run else len(dead_ids)}


# ── Published-date + views backfill ─────────────────────────────────────────────

def backfill_metadata(limit: int = 300) -> dict:
    """
    For static-seeded videos with fake today-date or zero views, fetch real
    upload_date and view_count via yt-dlp --dump-json.
    """
    TODAY = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    needs_fix = (supabase.table('video_library_videos')
        .select('id,youtube_video_id,published_at,views_count,views_text')
        .or_(f'published_at.gte.{TODAY}T00:00:00Z,views_count.eq.0')
        .limit(limit)
        .execute().data or [])

    log.info(f'Backfill: {len(needs_fix)} rows need date/views fix')
    updated = failed = 0
    BATCH = 5

    for i in range(0, len(needs_fix), BATCH):
        batch = needs_fix[i:i+BATCH]
        urls = [f'https://www.youtube.com/watch?v={v["youtube_video_id"]}' for v in batch]
        cmd  = ['yt-dlp', '--dump-json', '--no-warnings', '--quiet', '--no-playlist'] + urls
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
            meta = {}
            for line in r.stdout.strip().splitlines():
                try:
                    d = json.loads(line)
                    if d.get('id'): meta[d['id']] = d
                except Exception:
                    pass

            for row in batch:
                vid = row['youtube_video_id']
                d   = meta.get(vid)
                if not d:
                    failed += 1
                    continue

                upd = {}
                real_date = yt_upload_date_to_iso(d.get('upload_date', ''))
                if real_date and str(row.get('published_at', ''))[:10] == TODAY:
                    upd['published_at'] = real_date

                vc = d.get('view_count') or 0
                if vc and (not row.get('views_count') or row['views_count'] == 0):
                    upd['views_count'] = vc
                    upd['views_text']  = fmt_views(vc)

                if upd:
                    upd['updated_at'] = datetime.now(timezone.utc).isoformat()
                    supabase.table('video_library_videos').update(upd).eq('id', row['id']).execute()
                    updated += 1

        except subprocess.TimeoutExpired:
            failed += len(batch)
        time.sleep(0.3)

    log.info(f'Backfill done — updated={updated} failed={failed}')
    return {'updated': updated, 'failed': failed}


# ── Channel scraper ─────────────────────────────────────────────────────────────

def fetch_channel_videos(creator: dict) -> list[dict]:
    """
    yt-dlp --flat-playlist scrape for a creator's latest N videos.
    Returns real upload_date (not today's date) for each video.
    """
    url = f'https://www.youtube.com/@{creator["handle"]}/videos'
    cmd = [
        'yt-dlp',
        '--flat-playlist',
        '--dump-json',
        '--no-warnings',
        '--quiet',
        '--playlist-end', str(creator['max']),
        url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 and not result.stdout.strip():
            log.warning(f'  [{creator["source_id"]}] yt-dlp rc={result.returncode}: {result.stderr[:180]}')
            return []

        videos = []
        now    = datetime.now(timezone.utc).isoformat()
        for line in result.stdout.strip().splitlines():
            try:
                d = json.loads(line)
                vid_id = d.get('id')
                if not vid_id:
                    continue

                # Real upload date from metadata; fall back to now only if missing
                real_date = yt_upload_date_to_iso(d.get('upload_date', '') or '')
                pub_date  = real_date or now

                # Best thumbnail (largest)
                thumbs = d.get('thumbnails') or []
                thumb  = (thumbs[-1].get('url') if thumbs
                          else f'https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg')

                videos.append({
                    'youtube_video_id': vid_id,
                    'source_id':        creator['source_id'],
                    'source_name':      creator['name'],
                    'type':             creator['type'],
                    'title':            d.get('title', ''),
                    'views_count':      d.get('view_count', 0) or 0,
                    'views_text':       fmt_views(d.get('view_count', 0) or 0),
                    'duration':         fmt_duration(d.get('duration')),
                    'thumbnail_url':    thumb,
                    'video_url':        f'https://www.youtube.com/watch?v={vid_id}',
                    'published_at':     pub_date,
                    'scraped_at':       now,
                })
            except json.JSONDecodeError:
                continue

        return videos

    except subprocess.TimeoutExpired:
        log.warning(f'  [{creator["source_id"]}] yt-dlp timed out after 60s')
        return []
    except Exception as e:
        log.error(f'  [{creator["source_id"]}] Error: {e}')
        return []


# ── AI Tagging trigger (fires async after insert) ─────────────────────────────
def _trigger_ai_analysis(youtube_video_id: str, title: str) -> None:
    """Non-blocking GET to /api/video/analyze to pre-warm AI chapter cache."""
    try:
        headers = {'Authorization': f'Bearer {CRON_SECRET}'}
        url = f'{PRODUCTION_URL}/api/video/analyze?videoId={youtube_video_id}&title={title}'
        import urllib.request
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60):
            pass
    except Exception:
        pass  # best-effort — failures are silent


def _trigger_ai_tag(youtube_video_id: str, title: str, source_id: str, v_type: str, duration: str) -> None:
    """Non-blocking POST to /api/video/tag — writes tags to video_library_videos.tags."""
    try:
        if not CRON_SECRET:
            return
        import json as _json
        import urllib.request as _req
        payload = _json.dumps({
            'videoId': youtube_video_id,
            'title':   title,
            'source':  source_id,
            'type':    v_type,
            'duration': duration,
        }).encode('utf-8')
        r = _req.Request(
            f'{PRODUCTION_URL}/api/video/tag',
            data=payload, method='POST',
            headers={
                'Content-Type':  'application/json',
                'x-cron-secret': CRON_SECRET,
            }
        )
        with _req.urlopen(r, timeout=60):
            pass
    except Exception:
        pass  # best-effort — failures are silent


# ── Main scraper ─────────────────────────────────────────────────────────────────

def run_scraper(dry_run: bool = False, filter_source: str | None = None,
                skip_purge: bool = True) -> dict:
    """Main scraper loop — processes all 23 active creators."""
    log.info('=' * 60)
    log.info(f'Video Library Scraper v3.0 — {"DRY RUN" if dry_run else "LIVE"}')
    log.info(f'Time: {datetime.now(timezone.utc).isoformat()}')
    log.info('=' * 60)

    start = datetime.now(timezone.utc)

    # One round-trip to load all existing IDs for fast dedup
    # 2026-08-15: PostgREST caps a select at 1000 rows. Without paging, every
    # dedupe check past row 1000 was blind: re-scrapes re-attempted inserts and
    # leaned on the 23505 catch below. Page explicitly.
    existing_ids = set()
    _page, _size = 0, 1000
    while True:
        _r = (supabase.table('video_library_videos')
              .select('youtube_video_id')
              .range(_page * _size, _page * _size + _size - 1)
              .execute())
        _rows = _r.data or []
        existing_ids.update(v['youtube_video_id'] for v in _rows)
        if len(_rows) < _size:
            break
        _page += 1
    log.info(f'Existing videos in DB: {len(existing_ids)}')

    summary = {
        'processed': 0, 'failed': 0,
        'total_found': 0, 'total_new': 0, 'total_skipped': 0,
        'creator_results': [],
        'ran_at': start.isoformat(),
    }

    creators = CREATORS
    if filter_source:
        creators = [c for c in CREATORS if c['source_id'] == filter_source.upper()]
        if not creators:
            log.error(f'Unknown source_id: {filter_source}')
            return summary

    for creator in creators:
        log.info(f'Processing {creator["name"]} (@{creator["handle"]})...')
        cr = {'source_id': creator['source_id'], 'found': 0, 'new': 0, 'skipped': 0, 'error': None}

        try:
            videos = fetch_channel_videos(creator)
            cr['found'] = len(videos)
            summary['total_found'] += len(videos)

            if not videos:
                log.info(f'  [{creator["source_id"]}] No videos returned')
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

                        # Phase 18: Pre-computed AI Tagging — fires async, never blocks ingest
                        threading.Thread(
                            target=_trigger_ai_tag,
                            args=(v['youtube_video_id'], v['title'], v['source_id'], v['type'], v.get('duration', '')),
                            daemon=True
                        ).start()
                        # Also pre-warm AI chapter analysis cache
                        threading.Thread(
                            target=_trigger_ai_analysis,
                            args=(v['youtube_video_id'], v['title']),
                            daemon=True
                        ).start()
                    except Exception as e:
                        if '23505' in str(e) or 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                            existing_ids.add(v['youtube_video_id'])  # already there
                        else:
                            log.warning(f'    Insert failed for {v["youtube_video_id"]}: {e}')
                cr['new'] = inserted
                summary['total_new'] += inserted
                log.info(f'  [{creator["source_id"]}] Inserted {inserted}')
            else:
                cr['new'] = len(new_vids)
                log.info(f'  [{creator["source_id"]}] DRY RUN: would insert {len(new_vids)}')
                for v in new_vids[:3]:
                    log.info(f'    • {v["youtube_video_id"]} | {v["title"][:60]}')

            summary['processed'] += 1

        except Exception as e:
            log.error(f'  [{creator["source_id"]}] Fatal: {e}')
            cr['error'] = str(e)
            summary['failed'] += 1

        summary['creator_results'].append(cr)
        time.sleep(0.8)  # Polite pacing between channels

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    summary['elapsed_s'] = elapsed

    # Send Slack alert if >= 3 creators failed
    if summary['failed'] >= 3 and not dry_run:
        log.warning(f'{summary["failed"]} creator failures — sending alert')
        send_failure_alert(summary)

    # Backfill dates/views for any static rows that still have fake today-dates
    if not dry_run and not filter_source:
        log.info('Running post-scrape metadata backfill...')
        backfill_metadata(limit=100)  # Fix up to 100 rows per run

    # Save evidence file
    ts       = start.strftime('%Y%m%d_%H%M%S')
    ev_file  = EVIDENCE_DIR / f'video_library_scraper_{ts}.json'
    ev_file.write_text(json.dumps({'scraper': 'v3', 'ran_at': start.isoformat(),
                                   'dry_run': dry_run, 'elapsed_s': elapsed,
                                   'summary': summary}, indent=2))
    log.info(f'Evidence saved: {ev_file.name}')

    # Audit log
    if not dry_run:
        try:
            supabase.table('data_audit_log').insert({
                'record_id':   str(uuid.uuid4()),
                'table_name':  'video_library_videos',
                'action':      'scrape',
                'scrape_proof': json.dumps({
                    'scraper':            'video_library_scraper_v3',
                    'creators_processed': summary['processed'],
                    'creators_failed':    summary['failed'],
                    'total_found':        summary['total_found'],
                    'total_new':          summary['total_new'],
                    'elapsed_s':          elapsed,
                    'ran_at':             start.isoformat(),
                }),
            }).execute()
        except Exception as e:
            log.warning(f'Audit log insert failed: {e}')

        # Report to API endpoint
        report_to_api(summary)

    log.info('=' * 60)
    log.info(f'DONE: processed={summary["processed"]} failed={summary["failed"]} '
             f'found={summary["total_found"]} new={summary["total_new"]} '
             f'skipped={summary["total_skipped"]} elapsed={elapsed:.1f}s')
    log.info('=' * 60)

    return summary


# ── Entry point ─────────────────────────────────────────────────────────────────

def refresh_views(limit: int = 50, dry_run: bool = False) -> dict:
    """
    Re-fetch view counts for the top N most-viewed videos.
    Keeps popular video stats accurate without re-scraping everything.
    Run weekly via: python3 scripts/video_library_scraper.py --refresh-views
    """
    log.info(f'View-count refresh: fetching top {limit} videos by views...')
    rows = (supabase.table('video_library_videos')
        .select('id,youtube_video_id,source_id,views_count')
        .order('views_count', desc=True)
        .limit(limit)
        .execute().data or [])

    log.info(f'  Refreshing {len(rows)} videos')
    updated = failed = 0
    BATCH = 5

    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        urls  = [f'https://www.youtube.com/watch?v={v["youtube_video_id"]}' for v in batch]
        cmd   = ['yt-dlp', '--dump-json', '--no-warnings', '--quiet', '--no-playlist'] + urls
        try:
            r    = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
            meta = {}
            for line in r.stdout.strip().splitlines():
                try:
                    d = json.loads(line)
                    if d.get('id'): meta[d['id']] = d
                except Exception:
                    pass

            for row in batch:
                vid = row['youtube_video_id']
                d   = meta.get(vid)
                if not d:
                    failed += 1
                    continue
                vc = d.get('view_count') or 0
                if vc and vc != row.get('views_count', 0):
                    if not dry_run:
                        supabase.table('video_library_videos').update({
                            'views_count': vc,
                            'views_text':  fmt_views(vc),
                            'updated_at':  datetime.now(timezone.utc).isoformat(),
                        }).eq('id', row['id']).execute()
                    log.info(f'  [{row["source_id"]}] {vid}: {row["views_count"]:,} → {vc:,} views')
                    updated += 1
        except subprocess.TimeoutExpired:
            failed += len(batch)
        time.sleep(0.3)

    log.info(f'View refresh done — updated={updated} failed={failed}')
    return {'updated': updated, 'failed': failed}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Video Library Daily Scraper v3')
    parser.add_argument('--dry-run',       action='store_true', help='Fetch without DB writes')
    parser.add_argument('--source',        type=str,            help='Only scrape one source (e.g. HCL)')
    parser.add_argument('--purge',         action='store_true', help='Check all videos for playability and delete dead ones')
    parser.add_argument('--backfill',      action='store_true', help='Backfill missing published_at dates and views only')
    parser.add_argument('--refresh-views', action='store_true', help='Re-fetch view counts for top 50 most-viewed videos', dest='refresh_views')
    parser.add_argument('--tag-backfill',  action='store_true', help='AI-tag all untagged videos via /api/video/tag', dest='tag_backfill')
    args = parser.parse_args()

    if args.purge:
        result = purge_dead_videos(dry_run=args.dry_run)
        log.info(f'Purge complete: {result}')
    elif args.backfill:
        result = backfill_metadata(limit=500)
        log.info(f'Backfill complete: {result}')
    elif args.refresh_views:
        result = refresh_views(limit=50, dry_run=args.dry_run)
        log.info(f'View refresh complete: {result}')
    elif args.tag_backfill:
        log.info('Starting AI tag backfill for all untagged videos...')
        # Call the /api/video/tag GET endpoint which handles batching internally
        import urllib.request as _req
        import json as _json
        try:
            url = f'{PRODUCTION_URL}/api/video/tag?limit=200'
            r = _req.Request(url, headers={'x-cron-secret': CRON_SECRET})
            with _req.urlopen(r, timeout=300) as resp:
                data = _json.loads(resp.read())
            log.info(f'Tag backfill complete: {data}')
        except Exception as e:
            log.error(f'Tag backfill failed: {e}')
    else:
        run_scraper(dry_run=args.dry_run, filter_source=args.source)
