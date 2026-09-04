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
    python3 <repo>/scripts/video_library_scraper.py
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

# ── Paths ──────────────────────────────────────────────────────────────────────
# Host-portability (2026-08-29). Every path below used to be the literal string
# /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/... so this scraper
# could only ever run on one laptop. The dispatcher schedules it as a SCRIPT_JOB
# and skips it cleanly on any host where the file is absent, so when the Mac
# dispatcher stopped on 2026-04-22 ingestion stopped with it and the skip looked
# like normal operation. Resolving against the repo root makes the same file
# runnable on the Hetzner dispatcher, in CI, and on the Mac unchanged.
REPO_ROOT = Path(__file__).resolve().parents[1]

# SP_LOG_DIR / SP_EVIDENCE_DIR let a deploy target place these on a writable
# volume without editing code; both default to the previous locations.
#
# 2026-09-04: the defaults must also SURVIVE a host where they cannot be
# created. Deployed flat into /opt/openclaw on the Hetzner dispatcher,
# REPO_ROOT resolves to /opt, so the evidence default became
# /opt/data/scrape-evidence and mkdir died with PermissionError at import time.
# The scraper exited 1 in 0.2s at 06:00 UTC every day from 2026-08-31 and the
# dispatcher logged each run as "executed successfully". Evidence files are a
# nice-to-have; ingestion is the job. A directory we cannot write is a reason
# to fall back to one we can, never a reason to skip the day's videos.
def _first_writable_dir(*candidates: Path) -> Path:
    """Return the first candidate that exists-or-can-be-created and is
    writable. The last candidate is returned regardless so callers still get a
    meaningful path in their error message when nothing is usable."""
    for cand in candidates:
        try:
            cand.mkdir(parents=True, exist_ok=True)
            if os.access(cand, os.W_OK):
                return cand
        except OSError:
            continue
    return candidates[-1]


_HOME_STATE = Path.home() / '.smarter-poker'

LOG_DIR = _first_writable_dir(
    *([Path(os.environ['SP_LOG_DIR'])] if os.environ.get('SP_LOG_DIR') else []),
    _HOME_STATE / 'logs',
    Path('/tmp') / 'smarter-poker' / 'logs',
)

_handlers: list = [logging.StreamHandler()]
try:
    _handlers.insert(0, logging.FileHandler(LOG_DIR / 'video-library-scraper.log'))
except OSError:
    pass  # stderr still reaches journald / the dispatcher log
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=_handlers,
)
log = logging.getLogger('video-library-scraper')

# Evidence directory. Same override, same fallback discipline.
EVIDENCE_DIR = _first_writable_dir(
    *([Path(os.environ['SP_EVIDENCE_DIR'])] if os.environ.get('SP_EVIDENCE_DIR') else []),
    REPO_ROOT / 'data' / 'scrape-evidence',
    _HOME_STATE / 'scrape-evidence',
    Path('/tmp') / 'smarter-poker' / 'scrape-evidence',
)

# ── Env ─────────────────────────────────────────────────────────────────────────
def _load_env():
    """Load credentials from every env file that exists, earliest wins.

    2026-08-30: a single hard-coded candidate was not enough. Deployed to
    /opt/openclaw on the Hetzner VM, REPO_ROOT resolves to /opt, so this looked
    for /opt/.env.local, found nothing, and died with "Missing SUPABASE
    credentials" on the first real run after the host-portability fix. The
    dispatcher's own environment lives in /opt/openclaw/.env, right beside this
    script, and that is where the keys actually are on that host. (This loader
    ran on the box for five days before anyone committed it; it is in the repo
    now so the next deploy cannot regress it.)

    Order: explicit override, then next to this script (the deployed case),
    then the repo root (the Mac case). Every candidate is tried, not just the
    first that exists - setdefault means the earliest value for any key wins,
    and a partial file on one host cannot mask complete credentials on another.
    """
    here = Path(__file__).resolve().parent
    candidates = []
    if os.environ.get('SP_ENV_FILE'):
        candidates.append(Path(os.environ['SP_ENV_FILE']))
    candidates += [here / '.env', here / '.env.local', REPO_ROOT / '.env.local', REPO_ROOT / '.env']

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
            continue  # an unreadable candidate must not stop the others

    # Names only, never values - this lands in a journal people paste into chat.
    if loaded:
        print(f"[env] loaded: {', '.join(loaded)}", flush=True)
    else:
        print(f"[env] no env file found; tried: {', '.join(str(c) for c in candidates)}", flush=True)

_load_env()

SUPABASE_URL      = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY      = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
CRON_SECRET       = os.environ.get('CRON_SECRET', '')
PRODUCTION_URL    = os.environ.get('NEXT_PUBLIC_SITE_URL', 'https://smarter.poker')  # used by AI tagging
SLACK_WEBHOOK     = os.environ.get('SLACK_WEBHOOK_URL', '')  # optional — alert on scraper failures

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error('Missing SUPABASE credentials — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or an env file listed above')
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
    # 2026-09-04: the four below answer HTTP 404 from YouTube - the handles do
    # not exist - and were counted as four "creator failures" on every run,
    # which is enough to trip the >=3 Slack alert daily for a condition nobody
    # can act on. Inactive until someone supplies a real handle; a source with
    # active: False is listed, skipped and never counted as a failure.
    {'source_id': 'HELLMUTH',  'name': 'Phil Hellmuth',        'handle': 'PhilHellmuth',        'type': 'tournament', 'max':  6, 'active': False},
    {'source_id': 'IVEY',      'name': 'Phil Ivey',            'handle': 'PhilIvey',            'type': 'cash',       'max':  6, 'active': False},
    {'source_id': 'DWAN',      'name': 'Tom Dwan',             'handle': 'TomDwan',             'type': 'cash',       'max':  6, 'active': False},
    {'source_id': 'GARRETT',   'name': 'Garrett Adelstein',    'handle': 'GarrettAdelstein',    'type': 'cash',       'max':  6, 'active': False},
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


# ── YouTube RSS metadata (datacenter-safe) ─────────────────────────────────────
# 2026-09-04. On the Hetzner dispatcher every per-video `yt-dlp --dump-json`
# call answers "Sign in to confirm you're not a bot" - YouTube gates the watch
# page from datacenter IPs. The channel listing (--flat-playlist) still works,
# so discovery is fine, but flat entries carry no upload_date and no
# view_count: every video inserted from that host got published_at = now and
# views 0, the post-scrape backfill then failed 100/100, and the library page
# showed a wall of "today, 0 views". The channel's public RSS feed
# (feeds/videos.xml?channel_id=UC...) has no such gate and carries the real
# <published> date and <media:statistics views> for the latest 15 uploads -
# which is exactly the set a daily scraper inserts. yt-dlp per-video stays as
# the fallback for older rows (it works from a residential IP such as the Mac).
import xml.etree.ElementTree as _ET

_RSS_NS = {
    'a':     'http://www.w3.org/2005/Atom',
    'yt':    'http://www.youtube.com/xml/schemas/2015',
    'media': 'http://search.yahoo.com/mrss/',
}
_CHANNEL_ID_CACHE = LOG_DIR.parent / 'youtube-channel-ids.json'
_channel_ids: dict = {}
_rss_meta_cache: dict = {}


def _load_channel_id_cache() -> None:
    if _channel_ids or not _CHANNEL_ID_CACHE.exists():
        return
    try:
        _channel_ids.update(json.loads(_CHANNEL_ID_CACHE.read_text()))
    except Exception:
        pass


def resolve_channel_id(handle: str) -> str | None:
    """@handle → UC... channel id, via the (ungated) channel listing. Cached
    on disk beside the logs because a handle's channel id never changes."""
    _load_channel_id_cache()
    if handle in _channel_ids:
        return _channel_ids[handle]
    cmd = ['yt-dlp', '--flat-playlist', '--dump-single-json', '--no-warnings', '--quiet',
           '--playlist-end', '1', f'https://www.youtube.com/@{handle}/videos']
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        d = json.loads(r.stdout or '{}')
        cid = d.get('channel_id') or d.get('uploader_id') or ''
        if not str(cid).startswith('UC'):
            return None
        _channel_ids[handle] = cid
        try:
            _CHANNEL_ID_CACHE.write_text(json.dumps(_channel_ids, indent=2, sort_keys=True))
        except OSError:
            pass
        return cid
    except Exception as e:
        log.warning(f'  channel id for @{handle} unresolved: {type(e).__name__}: {e}')
        return None


def fetch_rss_meta(channel_id: str) -> dict:
    """channel id → {video_id: {'published_at': iso, 'views': int}} for the
    channel's latest ~15 uploads. Empty dict on any failure; cached per run."""
    if channel_id in _rss_meta_cache:
        return _rss_meta_cache[channel_id]
    meta = {}
    try:
        req = urllib.request.Request(
            f'https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}',
            headers={'User-Agent': 'smarter-poker-video-library/3.1'})
        with urllib.request.urlopen(req, timeout=20) as r:
            root_el = _ET.fromstring(r.read())
        for entry in root_el.findall('a:entry', _RSS_NS):
            vid = entry.findtext('yt:videoId', default='', namespaces=_RSS_NS)
            if not vid:
                continue
            published = entry.findtext('a:published', default='', namespaces=_RSS_NS)
            stats = entry.find('media:group/media:community/media:statistics', _RSS_NS)
            views = 0
            if stats is not None:
                try:
                    views = int(stats.get('views') or 0)
                except ValueError:
                    views = 0
            meta[vid] = {'published_at': published or None, 'views': views}
    except Exception as e:
        log.warning(f'  RSS for {channel_id} failed: {type(e).__name__}: {e}')
    _rss_meta_cache[channel_id] = meta
    return meta


def rss_meta_for_creator(creator: dict) -> dict:
    cid = resolve_channel_id(creator['handle'])
    return fetch_rss_meta(cid) if cid else {}


def _rss_apply(row: dict, meta: dict) -> dict:
    """The update dict for one DB row given its RSS entry (or {} if nothing)."""
    if not meta:
        return {}
    upd = {}
    if meta.get('published_at'):
        upd['published_at'] = meta['published_at']
    if meta.get('views'):
        upd['views_count'] = meta['views']
        upd['views_text']  = fmt_views(meta['views'])
    return upd


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
        .select('id,youtube_video_id,source_id,published_at,views_count,views_text')
        .or_(f'published_at.gte.{TODAY}T00:00:00Z,views_count.eq.0')
        .limit(limit)
        .execute().data or [])

    log.info(f'Backfill: {len(needs_fix)} rows need date/views fix')
    updated = failed = 0
    BATCH = 5

    # Pass 1 - RSS per creator (datacenter-safe; covers each channel's latest
    # ~15 uploads, which is where a fake today-date almost always lives).
    by_source = {c['source_id']: c for c in CREATORS}
    remaining = []
    for row in needs_fix:
        creator = by_source.get(row.get('source_id') or '')
        entry = rss_meta_for_creator(creator).get(row['youtube_video_id']) if creator else None
        upd = _rss_apply(row, entry or {})
        if not upd:
            remaining.append(row)
            continue
        # Only overwrite a date that is provably fake (today) - a real one stays.
        if 'published_at' in upd and str(row.get('published_at', ''))[:10] != TODAY:
            upd.pop('published_at')
        if 'views_count' in upd and (row.get('views_count') or 0) > 0:
            upd.pop('views_count'); upd.pop('views_text', None)
        if not upd:
            remaining.append(row)
            continue
        upd['updated_at'] = datetime.now(timezone.utc).isoformat()
        supabase.table('video_library_videos').update(upd).eq('id', row['id']).execute()
        updated += 1
    if updated:
        log.info(f'  Backfill via RSS: {updated} rows fixed, {len(remaining)} left for yt-dlp')
    needs_fix = remaining
    _ytdlp_reason_logged = False

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
            if not meta and r.stderr and not _ytdlp_reason_logged:
                # Say WHY once per run instead of a bare failed=N. From a
                # datacenter IP this is YouTube's "Sign in to confirm you're
                # not a bot"; that is expected there, not a scraper defect.
                log.warning(f'  yt-dlp per-video metadata unavailable: {r.stderr.strip().splitlines()[-1][:160]}')
                _ytdlp_reason_logged = True

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
        rss    = rss_meta_for_creator(creator)   # real dates + views, no bot gate
        for line in result.stdout.strip().splitlines():
            try:
                d = json.loads(line)
                vid_id = d.get('id')
                if not vid_id:
                    continue

                # Real upload date: flat entries rarely carry one, RSS does for
                # the latest 15; fall back to now only when neither knows.
                real_date = yt_upload_date_to_iso(d.get('upload_date', '') or '')
                rss_entry = rss.get(vid_id) or {}
                pub_date  = real_date or rss_entry.get('published_at') or now
                view_ct   = d.get('view_count') or rss_entry.get('views') or 0

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
                    'views_count':      view_ct,
                    'views_text':       fmt_views(view_ct),
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
        if creator.get('active') is False and not filter_source:
            log.info(f'Skipping {creator["name"]} (@{creator["handle"]}) - inactive source')
            continue
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

    # RSS first: free, ungated, exact for anything still in a channel's latest 15.
    by_source = {c['source_id']: c for c in CREATORS}
    remaining = []
    for row in rows:
        creator = by_source.get(row.get('source_id') or '')
        entry = rss_meta_for_creator(creator).get(row['youtube_video_id']) if creator else None
        vc = (entry or {}).get('views') or 0
        if not vc:
            remaining.append(row)
            continue
        if vc != row.get('views_count', 0):
            if not dry_run:
                supabase.table('video_library_videos').update({
                    'views_count': vc,
                    'views_text':  fmt_views(vc),
                    'updated_at':  datetime.now(timezone.utc).isoformat(),
                }).eq('id', row['id']).execute()
            log.info(f'  [{row["source_id"]}] {row["youtube_video_id"]}: {row["views_count"]:,} → {vc:,} views (rss)')
            updated += 1
    rows = remaining
    _ytdlp_reason_logged = False

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
            if not meta and r.stderr and not _ytdlp_reason_logged:
                log.warning(f'  yt-dlp per-video metadata unavailable: {r.stderr.strip().splitlines()[-1][:160]}')
                _ytdlp_reason_logged = True

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
