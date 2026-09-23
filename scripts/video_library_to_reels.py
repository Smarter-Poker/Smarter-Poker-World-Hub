#!/usr/bin/env python3
"""
VIDEO LIBRARY -> SOCIAL REELS PUBLISHER
=======================================

Publishes verified poker videos from ``video_library_videos`` through the
database's atomic ``publish_video_library_reel`` RPC. The RPC owns the
social_posts + social_reels transaction and canonical identity; this process
owns discovery, availability verification, and bounded scheduling.

Safety contract:
  * the publisher identity is resolved from service-only database configuration;
  * only ``cash`` and ``tournament`` catalog rows are eligible;
  * every new or repaired publication is verified with both YouTube oEmbed and
    yt-dlp's embedded-player metadata, and every unknown/error state fails closed;
  * authenticated player reports remain non-censoring until this verifier
    adjudicates them through the race-safe failure-verdict RPC;
  * no code in this process inserts directly into social_reels/social_posts;
  * paging and source_asset_id identity let a bounded run move beyond already
    published rows without duplicating them;
  * never-checked and oldest-stale catalog rows are renewed before cooled-down
    permanent failures, while reserved recovery lanes prevent report starvation;
  * a 1,650-second internal deadline and atomic per-batch checkpoints leave the
    database's verified/idempotent state as a safe resume cursor before Open
    Claw's 1,800-second subprocess ceiling.

Open Claw runs this daily after the catalog scraper. The dispatcher
(scripts/openclaw.service) uses the system interpreter with the vendored
packages on PYTHONPATH; there is no virtualenv on the host:

    PYTHONPATH=/opt/openclaw/current/vendor /usr/bin/python3 -s \
        /opt/openclaw/current/video_library_to_reels.py --limit 500 --verify

``--verify`` remains as an explicit scheduler assertion and compatibility
flag. Verification is mandatory even when the flag is omitted.
"""

import argparse
import importlib.util
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
_HOME_STATE = Path.home() / '.smarter-poker'
POKER_VIDEO_TYPES = {'cash', 'tournament'}
CATALOG_PAGE_SIZE = 250
EXISTING_PAGE_SIZE = 1000
FAILURE_PAGE_SIZE = 1000
FAILURE_VERIFY_LIMIT = 500
YOUTUBE_ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')
# Renew well before the database's 7-day public-playback cutoff (installed
# SQL: fn_is_video_library_asset_eligible and its sibling predicates accept
# availability_checked_at no older than interval '7 days'; the JavaScript
# mirror is VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS). The dispatcher retains its
# daily 07:00 schedule and bounded 500-row pass, so each of the ~1,417 poker
# rows is re-verified about every 2.8 days. The 12-hour value below is only
# the "due for renewal" threshold that makes every daily run pick the oldest
# rows; it is not the public expiry. Whole-catalog coverage inside one run is
# not implied: stale rows remain fail-closed until the existing verifier
# establishes fresh evidence. The relationship between these numbers is pinned
# by __tests__/video-library-freshness-contract.test.mjs.
VERIFICATION_REFRESH_AGE = timedelta(hours=12)
TRANSIENT_RETRY_AGE = timedelta(hours=6)
PERMANENT_RETRY_AGE = timedelta(days=14)
PERMANENT_FAILURE_STATUSES = frozenset(
    {'private', 'restricted', 'unavailable', 'embed_disabled'}
)
EXPECTED_TRANSIENT_REASONS = frozenset({'youtube_upcoming'})


def _first_writable_dir(*candidates: Path) -> Path:
    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            if os.access(candidate, os.W_OK):
                return candidate
        except OSError:
            continue
    return candidates[-1]


LOG_DIR = _first_writable_dir(
    *([Path(os.environ['SP_LOG_DIR'])] if os.environ.get('SP_LOG_DIR') else []),
    _HOME_STATE / 'logs',
    Path('/tmp') / 'smarter-poker' / 'logs',
)
_handlers = [logging.StreamHandler()]
try:
    _handlers.insert(0, logging.FileHandler(LOG_DIR / 'video-library-to-reels.log'))
except OSError as error:
    # Logging to stderr is still available when the host's persistent log
    # directory cannot be opened; make that degraded state visible.
    sys.stderr.write(f'[video-library-to-reels] file logging unavailable: {error}\n')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=_handlers,
)
log = logging.getLogger('video-library-to-reels')

EVIDENCE_DIR = _first_writable_dir(
    *([Path(os.environ['SP_EVIDENCE_DIR'])] if os.environ.get('SP_EVIDENCE_DIR') else []),
    REPO_ROOT / 'data' / 'scrape-evidence',
    _HOME_STATE / 'scrape-evidence',
    Path('/tmp') / 'smarter-poker' / 'scrape-evidence',
)


def _load_env():
    """Load host/repo env files without overriding the systemd environment."""
    here = Path(__file__).resolve().parent
    candidates = []
    if os.environ.get('SP_ENV_FILE'):
        candidates.append(Path(os.environ['SP_ENV_FILE']))
    candidates += [here / '.env', here / '.env.local']
    candidates += [
        REPO_ROOT / name
        for name in ('.env.local', '.env.production', '.env.vercel-db', '.env', '.env.prod')
    ]

    loaded = []
    for env_file in candidates:
        try:
            if not env_file.exists():
                continue
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
            loaded.append(str(env_file))
        except OSError:
            continue
    if loaded:
        log.info('Environment loaded from %s', ', '.join(loaded))


_load_env()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')


def _bounded_env_int(name, default, minimum, maximum):
    try:
        value = int(os.environ.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


# Six parallel yt-dlp probes keep the Open Claw systemd cgroup comfortably
# below its 512 MB limit while processing the 500-row daily renewal batch.
VERIFY_CONCURRENCY = _bounded_env_int('VIDEO_LIBRARY_VERIFY_CONCURRENCY', 6, 1, 8)
# Open Claw enforces a 1,800-second subprocess ceiling. Stop accepting new
# network work at 1,650 seconds so an in-flight bounded operation can finish,
# the last batch checkpoint can be closed, and final evidence can be
# emitted before the dispatcher would otherwise kill the process.
MAX_RUNTIME_SECONDS = _bounded_env_int(
    'VIDEO_LIBRARY_MAX_RUNTIME_SECONDS', 1650, 300, 1700
)
VERIFY_BATCH_START_RESERVE_SECONDS = 180
NETWORK_OPERATION_RESERVE_SECONDS = 120


def _headers(prefer='return=minimal'):
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': prefer,
    }


def _request(method, path, body=None, params=None, prefer='return=minimal'):
    """Return decoded JSON/[] on success and None on transport/API failure."""
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    data = json.dumps(body).encode('utf-8') if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers=_headers(prefer),
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as error:
        response_body = error.read().decode('utf-8', errors='replace')
        log.error('HTTP %s %s %s: %s', error.code, method, path, response_body[:500])
    except (OSError, ValueError) as error:
        log.error('Request error %s %s: %s', method, path, error)
    return None


def _select_page(table, select, filters, order, limit, offset):
    params = {
        'select': select,
        'limit': limit,
        'offset': offset,
        'order': order,
        **filters,
    }
    rows = _request('GET', table, params=params)
    if rows is None:
        raise RuntimeError(f'Failed to page {table} at offset {offset}')
    if not isinstance(rows, list):
        raise RuntimeError(f'Unexpected {table} response at offset {offset}')
    return rows


def _rpc(name, parameters):
    """Call a service-role RPC and require its row-returning response."""
    result = _request(
        'POST',
        f'rpc/{name}',
        body=parameters,
        prefer='return=representation',
    )
    if result is None:
        raise RuntimeError(f'RPC {name} failed')
    if isinstance(result, list):
        if len(result) != 1 or not isinstance(result[0], dict):
            raise RuntimeError(f'RPC {name} returned {len(result)} rows; expected one')
        return result[0]
    if isinstance(result, dict):
        return result
    raise RuntimeError(f'RPC {name} returned an unexpected response')


def _expect_rpc_error(name, parameters, expected_codes):
    """Verify an RPC signature through a deliberately non-mutating failure."""
    url = f'{SUPABASE_URL}/rest/v1/rpc/{name}'
    request = urllib.request.Request(
        url,
        data=json.dumps(parameters).encode('utf-8'),
        headers=_headers('return=representation'),
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
    except urllib.error.HTTPError as error:
        raw = error.read().decode('utf-8', errors='replace')
        try:
            error_code = str(json.loads(raw).get('code') or '')
        except (TypeError, ValueError, json.JSONDecodeError):
            error_code = ''
        if error_code not in expected_codes:
            raise RuntimeError(
                f'RPC {name} returned {error.code}/{error_code or "unknown"}; '
                f'expected one of {sorted(expected_codes)}'
            ) from error
        return error_code
    except OSError as error:
        raise RuntimeError(f'RPC {name} preflight transport failed: {error}') from error
    raise RuntimeError(f'RPC {name} unexpectedly accepted its invalid preflight input')


def get_system_bot_id():
    """Return the database-pinned publisher; never guess a host-local identity."""
    config_rows = _request(
        'GET',
        'video_reels_pipeline_config',
        params={
            'select': 'video_library_publisher_profile_id',
            'singleton_key': 'eq.video_library',
            'limit': 1,
        },
    )
    if config_rows is None:
        raise RuntimeError('Could not read video-library publisher configuration')
    if len(config_rows) != 1:
        raise RuntimeError('Video-library publisher configuration is missing')
    bot_id = config_rows[0].get('video_library_publisher_profile_id')
    if not re.fullmatch(
        r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}',
        str(bot_id or ''),
    ):
        raise RuntimeError('Video-library publisher profile is not configured')

    profiles = _request(
        'GET',
        'profiles',
        params={'select': 'id', 'id': f'eq.{bot_id}', 'limit': 1},
    )
    if profiles is None:
        raise RuntimeError('Could not validate configured video-library publisher profile')
    if not profiles:
        raise RuntimeError('Configured video-library publisher profile is not live')
    return bot_id


def run_schema_preflight():
    """Read required relations and prove RPC signatures without changing data."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

    publisher_id = get_system_bot_id()
    relation_contracts = {
        'video_library_videos': (
            'id,youtube_video_id,source_id,source_name,title,thumbnail_url,'
            'published_at,type,availability_status,embeddable,'
            'availability_checked_at,availability_failure_reason,availability_source'
        ),
        'youtube_embed_failures': (
            'video_id,error_code,surface,hit_count,last_seen_at,resolved,'
            'verification_status,last_verified_at'
        ),
        'social_posts': 'id,author_id,origin_type,source_asset_id,canonical_asset_key,is_deleted',
        'social_reels': (
            'id,author_id,source_post_id,origin_type,source_asset_id,'
            'canonical_asset_key,playback_type,is_deleted,caption,created_at'
        ),
    }
    for relation, columns in relation_contracts.items():
        rows = _request('GET', relation, params={'select': columns, 'limit': 1})
        if rows is None or not isinstance(rows, list):
            raise RuntimeError(f'Preflight could not read required relation {relation}')

    required_controls = {
        'video_library_reel_creation',
        'video_library_reel_publication',
    }
    controls = _request(
        'GET',
        'video_reels_pipeline_controls',
        params={
            'select': 'control_key,enabled,updated_at',
            'control_key': 'in.(' + ','.join(sorted(required_controls)) + ')',
        },
    )
    if controls is None or {row.get('control_key') for row in controls} != required_controls:
        raise RuntimeError('Required video-library Reel controls are missing')

    # Both inputs fail before either function reaches a write. Their SQLSTATEs
    # prove that PostgREST sees the deployed argument lists and behavior.
    _expect_rpc_error(
        'record_youtube_embed_failure_verdict',
        {
            'p_video_id': 'schema-preflight-invalid',
            'p_verdict': 'verified',
            'p_error_code': None,
            'p_surface': 'openclaw_release_preflight',
            'p_verification_started_at': datetime.now(timezone.utc).isoformat(),
        },
        {'22023'},
    )
    _expect_rpc_error(
        'publish_video_library_reel',
        {
            'p_video_id': 'schema-preflight-invalid',
            'p_author_id': publisher_id,
            'p_caption': None,
        },
        {'55000', 'P0002'},
    )
    log.info('Open Claw publisher preflight: schema and RPC behavior contract verified')


class YtDlpUnavailableError(RuntimeError):
    """The release-pinned yt_dlp runtime is missing or cannot execute.

    This is a release defect, never a statement about a video. It aborts the
    run; it must not be converted into per-row ``error`` verdicts.
    """


YTDLP_RUNTIME_EXIT_CODE = 3
YTDLP_SELF_CHECK_TIMEOUT_SECONDS = 30
_YTDLP_VERSION_RE = re.compile(r'^\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d+)?$')


def _vendored_ytdlp_root():
    """Return the one import root that holds this interpreter's yt_dlp.

    The immutable Open Claw release exposes yt_dlp only through
    ``PYTHONPATH=<release>/vendor``. The isolated child does not inherit the
    ambient environment, so the root is derived from the package this
    interpreter already resolves and only that directory is forwarded.
    """
    try:
        spec = importlib.util.find_spec('yt_dlp')
    except (ImportError, ValueError) as error:
        raise YtDlpUnavailableError(f'yt_dlp import lookup failed: {error}') from error
    locations = list(getattr(spec, 'submodule_search_locations', None) or [])
    if spec is None or len(locations) != 1:
        raise YtDlpUnavailableError(
            'yt_dlp is not importable by this interpreter; the release vendor '
            'directory is missing from PYTHONPATH or incomplete'
        )
    package_dir = Path(os.path.abspath(locations[0]))
    root = package_dir.parent
    if (
        package_dir.name != 'yt_dlp'
        or not root.is_absolute()
        or os.pathsep in str(root)
        or not root.is_dir()
        or not (package_dir / '__main__.py').is_file()
    ):
        raise YtDlpUnavailableError(
            f'yt_dlp resolved to an unusable location: {package_dir}'
        )
    return str(root)


def _run_isolated_ytdlp(arguments, timeout):
    """Run the release-pinned yt-dlp without host config, plugins, or cache."""
    vendored_root = _vendored_ytdlp_root()
    with tempfile.TemporaryDirectory(prefix='sp-openclaw-ytdlp-') as isolated_home:
        environment = {
            'HOME': isolated_home,
            'TMPDIR': isolated_home,
            'PATH': '/usr/bin:/bin',
            'LANG': 'C.UTF-8',
            'LC_ALL': 'C.UTF-8',
            'PYTHONNOUSERSITE': '1',
            'PYTHONDONTWRITEBYTECODE': '1',
            # Exactly one derived import root; the ambient PYTHONPATH is never
            # forwarded. The empty working directory keeps ``-m`` from adding
            # the caller's directory as a second import root.
            'PYTHONPATH': vendored_root,
        }
        return subprocess.run(
            [
                sys.executable,
                '-m',
                'yt_dlp',
                '--ignore-config',
                '--no-plugin-dirs',
                '--no-cache-dir',
                *arguments,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=environment,
            cwd=isolated_home,
        )


def ensure_ytdlp_runtime():
    """Execute the isolated child once, offline, and return its version.

    Release preflight and every run call this before any production row is
    touched, so a release whose child cannot import yt_dlp stops here.
    """
    try:
        completed = _run_isolated_ytdlp(
            ['--version'],
            timeout=YTDLP_SELF_CHECK_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise YtDlpUnavailableError(
            f'yt-dlp self-check could not execute: {error}'
        ) from error
    version = (completed.stdout or '').strip()
    if completed.returncode != 0 or not _YTDLP_VERSION_RE.fullmatch(version):
        detail = (completed.stderr or completed.stdout or '').strip()[-300:]
        raise YtDlpUnavailableError(
            f'yt-dlp self-check failed (exit {completed.returncode}): {detail}'
        )
    log.info('Isolated yt-dlp runtime verified: version %s', version)
    return version


def _availability(status, reason=None):
    return {
        'available': status == 'verified',
        'status': status,
        'reason': reason,
    }


def _is_operational_verifier_error(result):
    return (
        result.get('status') == 'error'
        and result.get('reason') not in EXPECTED_TRANSIENT_REASONS
    )


def _classify_http_error(prefix, error):
    if error.code == 401:
        return _availability('private', f'{prefix}_http_401')
    if error.code == 403:
        return _availability('restricted', f'{prefix}_http_403')
    if error.code in (404, 410):
        return _availability('unavailable', f'{prefix}_http_{error.code}')
    return _availability('error', f'{prefix}_http_{error.code}')


def verify_youtube_video_scrapling(video_id):
    """Fail-closed YouTube verification (legacy function name retained).

    oEmbed proves public metadata is available. yt-dlp then has to explicitly
    report public/unlisted availability and ``playable_in_embed=true``.
    Private, members-only, age/region restricted, embed-disabled, throttled,
    malformed, and network-unknown responses are never publishable.
    """
    if not YOUTUBE_ID_RE.fullmatch(str(video_id or '')):
        return _availability('error', 'invalid_youtube_id')

    watch_url = f'https://www.youtube.com/watch?v={video_id}'
    oembed_url = (
        'https://www.youtube.com/oembed?'
        + urllib.parse.urlencode({'url': watch_url, 'format': 'json'})
    )
    request_headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; SmarterPokerAvailability/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    try:
        request = urllib.request.Request(oembed_url, headers=request_headers)
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status != 200:
                return _availability('error', f'oembed_http_{response.status}')
            metadata = json.loads(response.read(256 * 1024).decode('utf-8'))
            if not metadata.get('title') or not metadata.get('author_name'):
                return _availability('error', 'oembed_missing_metadata')
    except urllib.error.HTTPError as error:
        return _classify_http_error('oembed', error)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        log.warning('oEmbed verification unknown for %s: %s', video_id, error)
        return _availability('error', 'oembed_network_or_parse_error')

    try:
        completed = _run_isolated_ytdlp(
            [
                '--dump-single-json',
                '--skip-download',
                '--no-playlist',
                '--no-warnings',
                '--socket-timeout',
                '15',
                '--extractor-retries',
                '1',
                '--retries',
                '1',
                watch_url,
            ],
            timeout=40,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        log.warning('yt-dlp verification unknown for %s: %s', video_id, error)
        return _availability('error', 'yt_dlp_execution_error')

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or '').lower()
        if 'no module named' in detail and 'yt_dlp' in detail:
            raise YtDlpUnavailableError(
                'yt_dlp became unimportable in the isolated child during the run'
            )
        if 'private video' in detail:
            return _availability('private', 'youtube_private')
        if any(marker in detail for marker in ('members-only', 'members only', 'premium', 'subscription')):
            return _availability('restricted', 'youtube_members_only')
        if any(marker in detail for marker in ('age-restricted', 'sign in to confirm your age', 'login required')):
            return _availability('restricted', 'youtube_login_required')
        if 'not available in your country' in detail:
            return _availability('restricted', 'youtube_region_restricted')
        if 'embedding disabled' in detail:
            return _availability('embed_disabled', 'youtube_embed_disabled')
        if any(marker in detail for marker in ('video unavailable', 'removed', 'deleted')):
            return _availability('unavailable', 'youtube_unavailable')
        return _availability('error', 'yt_dlp_nonzero')

    try:
        metadata = json.loads(completed.stdout)
    except (TypeError, json.JSONDecodeError):
        return _availability('error', 'yt_dlp_invalid_json')

    availability = str(metadata.get('availability') or '').lower()
    if availability == 'private':
        return _availability('private', 'youtube_private')
    if availability in ('premium_only', 'subscriber_only', 'needs_auth'):
        return _availability('restricted', f'youtube_{availability}')
    if availability not in ('public', 'unlisted'):
        return _availability('error', 'youtube_availability_unknown')
    try:
        age_limit = int(metadata.get('age_limit') or 0)
    except (TypeError, ValueError):
        return _availability('error', 'youtube_age_limit_unknown')
    if age_limit > 0:
        return _availability('restricted', 'youtube_age_restricted')
    if metadata.get('playable_in_embed') is not True:
        return _availability('embed_disabled', 'youtube_embed_disabled')
    if metadata.get('live_status') == 'is_upcoming':
        return _availability('error', 'youtube_upcoming')
    return _availability('verified')


def _verdict_for_availability(result):
    status = result['status']
    if status in ('verified', 'private', 'restricted', 'unavailable', 'embed_disabled'):
        return status
    reason = str(result.get('reason') or '')
    if any(marker in reason for marker in ('network', 'timeout', 'execution')):
        return 'network_error'
    return 'error'


def _record_embed_verdict(video_id, result, error_code=None, surface='video_library_verifier'):
    """Apply a race-safe service verdict and return its authoritative state."""
    verdict = _rpc(
        'record_youtube_embed_failure_verdict',
        {
            'p_video_id': video_id,
            'p_verdict': _verdict_for_availability(result),
            'p_error_code': error_code,
            'p_surface': surface,
            'p_verification_started_at': result['verification_started_at'],
        },
    )
    required = ('video_id', 'hit_count', 'verification_status', 'resolved')
    if any(key not in verdict for key in required):
        raise RuntimeError('record_youtube_embed_failure_verdict response is incomplete')
    return verdict


def _parse_timestamp(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _deadline_due(deadline_at, reserve_seconds=NETWORK_OPERATION_RESERVE_SECONDS):
    return time.monotonic() + reserve_seconds >= deadline_at


def _mark_deadline(stats, phase):
    stats['deadline_reached'] = True
    stats['deadline_phase'] = phase
    stats['aborted_reason'] = stats['aborted_reason'] or 'runtime_deadline'


def _verification_is_fresh(row, now=None):
    """Return true only inside the twelve-hour renewal window.

    The managed library's public gate accepts a verification for at most
    7 days. One bounded daily run renews the oldest rows first, cycling the
    whole catalog in roughly three days, well before that deadline; rows fail
    closed at the gate if YouTube verification becomes unavailable for longer.
    """
    if row.get('availability_status') != 'verified' or row.get('embeddable') is not True:
        return False
    parsed = _parse_timestamp(row.get('availability_checked_at'))
    if parsed is None:
        return False
    reference = now or datetime.now(timezone.utc)
    return (
        reference - VERIFICATION_REFRESH_AGE
        <= parsed
        <= reference + timedelta(minutes=5)
    )


def _candidate_plan(
    row,
    current,
    caption_matches,
    now,
    force_audit,
):
    """Return a stable priority tuple or a cooldown/complete skip reason."""
    checked = _parse_timestamp(row.get('availability_checked_at'))
    published = _parse_timestamp(row.get('published_at'))
    checked_sort = checked.timestamp() if checked else 0
    newest_sort = -(published.timestamp() if published else 0)
    status = str(row.get('availability_status') or 'unknown').lower()
    is_complete = bool(current and current.get('source_post_id'))

    if force_audit:
        return (0, checked_sort, str(row.get('id') or ''), 'forced_audit')
    if is_complete and caption_matches and _verification_is_fresh(row, now):
        return 'already_current'
    if checked is None or checked > now + timedelta(minutes=5):
        return (1, newest_sort, str(row.get('id') or ''), 'never_checked')
    if status == 'verified':
        if not is_complete or not caption_matches:
            return (2, newest_sort, str(row.get('id') or ''), 'publication_repair')
        return (3, checked_sort, str(row.get('id') or ''), 'stale_verified')

    age = now - checked
    if status in PERMANENT_FAILURE_STATUSES:
        if age < PERMANENT_RETRY_AGE:
            return 'permanent_cooldown'
        return (5, checked_sort, str(row.get('id') or ''), 'permanent_retry')
    if age < TRANSIENT_RETRY_AGE:
        return 'transient_cooldown'
    return (4, checked_sort, str(row.get('id') or ''), 'transient_retry')


def _failure_candidate_plan(row, now, force_audit):
    """Prioritize fresh reports and cool down already-adjudicated failures."""
    status = str(row.get('verification_status') or 'pending').lower()
    last_seen = _parse_timestamp(row.get('last_seen_at'))
    last_verified = _parse_timestamp(row.get('last_verified_at'))
    stable_id = str(row.get('video_id') or '')
    oldest_seen = last_seen.timestamp() if last_seen else 0
    oldest_verified = last_verified.timestamp() if last_verified else 0
    if force_audit:
        return (0, oldest_verified, stable_id, 'forced_failure_audit')
    if status == 'pending':
        return (0, oldest_seen, stable_id, 'pending_report')
    if last_verified is None or last_verified > now + timedelta(minutes=5):
        return (1, oldest_seen, stable_id, 'missing_failure_verdict')
    age = now - last_verified
    if status == 'resolved':
        if age < VERIFICATION_REFRESH_AGE:
            return None
        return (2, oldest_verified, stable_id, 'resolved_verification_renewal')
    if status == 'error':
        if age < TRANSIENT_RETRY_AGE:
            return 'transient_cooldown'
        return (2, oldest_verified, stable_id, 'transient_failure_retry')
    if status == 'confirmed':
        if age < PERMANENT_RETRY_AGE:
            return 'permanent_cooldown'
        return (3, oldest_verified, stable_id, 'confirmed_failure_retry')
    return None


def _select_failure_plans(plans, limit):
    """Reserve retry lanes so a report surge cannot starve recovery checks."""
    if limit is None or len(plans) <= limit:
        return plans
    selected = []
    selected_ids = set()
    reserve_per_retry_lane = max(1, min(10, limit // 5))
    for reason in ('transient_failure_retry', 'confirmed_failure_retry'):
        if len(selected) >= limit:
            break
        lane = [item for item in plans if item[0][3] == reason]
        for item in lane[:reserve_per_retry_lane]:
            if len(selected) >= limit:
                break
            selected.append(item)
            selected_ids.add(item[0][2])
    for item in plans:
        if len(selected) >= limit:
            break
        if item[0][2] in selected_ids:
            continue
        selected.append(item)
        selected_ids.add(item[0][2])
    selected.sort(key=lambda item: item[0][:3])
    return selected


def _load_existing_publications():
    """Map canonical library UUIDs to their current Reel publication state."""
    existing = {}
    offset = 0
    while True:
        rows = _select_page(
            'social_reels',
            'id,source_asset_id,source_post_id,caption',
            {'origin_type': 'eq.video_library', 'source_asset_id': 'not.is.null'},
            'created_at.desc,id.asc',
            EXISTING_PAGE_SIZE,
            offset,
        )
        for row in rows:
            asset_id = str(row.get('source_asset_id') or '')
            if asset_id:
                existing.setdefault(asset_id, row)
        if len(rows) < EXISTING_PAGE_SIZE:
            break
        offset += len(rows)
    return existing


def _load_embed_failure_rows():
    """Load pending work plus positive and negative verdicts due for renewal."""
    failure_rows = []
    offset = 0
    while True:
        rows = _select_page(
            'youtube_embed_failures',
            'video_id,error_code,surface,verification_status,resolved,last_seen_at,last_verified_at',
            {'verification_status': 'in.(pending,confirmed,error,resolved)'},
            'last_seen_at.desc,video_id.asc',
            FAILURE_PAGE_SIZE,
            offset,
        )
        failure_rows.extend(row for row in rows if row.get('video_id'))
        if len(rows) < FAILURE_PAGE_SIZE:
            break
        offset += len(rows)
    return failure_rows


def _catalog_pages(source=None):
    filters = {'type': 'in.(cash,tournament)'}
    if source:
        filters['source_id'] = f'eq.{source}'
    offset = 0
    while True:
        rows = _select_page(
            'video_library_videos',
            'id,youtube_video_id,source_id,source_name,title,thumbnail_url,published_at,type,'
            'availability_status,embeddable,availability_checked_at',
            filters,
            'published_at.desc.nullslast,id.asc',
            CATALOG_PAGE_SIZE,
            offset,
        )
        yield rows
        if len(rows) < CATALOG_PAGE_SIZE:
            break
        offset += len(rows)


def _publish_row(row, author_id):
    result = _rpc(
        'publish_video_library_reel',
        {
            'p_video_id': row['youtube_video_id'],
            'p_author_id': author_id,
            'p_caption': (row.get('title') or row.get('source_name') or '').strip(),
        },
    )
    required = ('social_post_id', 'social_reel_id', 'was_created')
    if any(key not in result for key in required):
        raise RuntimeError('publish_video_library_reel response is missing lineage fields')
    if not result['social_post_id'] or not result['social_reel_id']:
        raise RuntimeError('publish_video_library_reel returned incomplete lineage')
    return result


def _new_stats():
    return {
        'catalog_pages': 0,
        'catalog_rows': 0,
        'eligible_rows': 0,
        'already_current': 0,
        'confirmed_blocked_current': 0,
        'verification_expired': 0,
        'active_embed_failures': 0,
        'pending_embed_reports': 0,
        'candidate_pool': 0,
        'candidates': 0,
        'deferred_by_limit': 0,
        'permanent_cooldown': 0,
        'transient_cooldown': 0,
        'verification_attempted': 0,
        'verifier_errors_observed': 0,
        'verified': 0,
        'created': 0,
        'repaired_or_updated': 0,
        'would_publish': 0,
        'rejected': 0,
        'invalid_rows': 0,
        'failure_reports_loaded': 0,
        'failure_candidates': 0,
        'failure_deferred_by_limit': 0,
        'failure_cooldown': 0,
        'failure_verification_attempted': 0,
        'failure_verification_reused': 0,
        'failure_resolved': 0,
        'failure_confirmed': 0,
        'failure_transient': 0,
        'failure_race_deferred': 0,
        'failure_race_recovered': 0,
        'publication_deferred_deadline': 0,
        'failure_verdict_errors': 0,
        'rpc_errors': 0,
        'checkpoint_writes': 0,
        'checkpoint_write_errors': 0,
        'deadline_reached': False,
        'deadline_phase': None,
        'catalog_scan_complete': False,
        'aborted_reason': None,
        'verification_concurrency': VERIFY_CONCURRENCY,
        'candidate_reasons': Counter(),
        'failure_candidate_reasons': Counter(),
        'failure_verification_outcomes': Counter(),
        'verification_outcomes': Counter(),
    }


def _verify_row(row):
    vid_id = str(row.get('youtube_video_id') or '')
    started_at = datetime.now(timezone.utc).isoformat()
    try:
        result = verify_youtube_video_scrapling(vid_id)
    except YtDlpUnavailableError:
        raise  # a broken runtime aborts the run; it is not a video verdict
    except Exception as error:  # a malformed upstream field must fail closed
        log.exception('Unexpected verifier failure for %s: %s', vid_id, error)
        result = _availability('error', 'verifier_unhandled_error')
    result['verification_started_at'] = started_at
    result['verification_checked_at'] = datetime.now(timezone.utc).isoformat()
    return result


def _write_checkpoint(args, stats, phase, cursor=None):
    """Persist bounded-run progress without becoming a correctness dependency.

    Supabase availability verdicts and the idempotent publication RPC remain
    the authoritative resume cursor. This local checkpoint is atomic evidence
    of the last completed batch; losing it can never make selection skip work.
    """
    suffix = '_dry_run' if args.dry_run else ''
    checkpoint_path = EVIDENCE_DIR / f'video_library_to_reels_checkpoint{suffix}.json'
    temporary_path = checkpoint_path.with_name(
        f'.{checkpoint_path.name}.{os.getpid()}.tmp'
    )
    stats['checkpoint_writes'] += 1
    payload = {
        'publisher': 'video_library_to_reels_v2',
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'phase': phase,
        'cursor': cursor or {},
        'dry_run': args.dry_run,
        'source': args.source,
        'limit': args.limit,
        'force_audit': bool(getattr(args, 'audit_all', False)),
        'resume_basis': 'supabase_availability_and_atomic_publication_state',
        'stats': stats,
    }
    try:
        with temporary_path.open('w') as checkpoint_file:
            json.dump(payload, checkpoint_file, indent=2, sort_keys=True)
            checkpoint_file.flush()
            os.fsync(checkpoint_file.fileno())
        os.replace(temporary_path, checkpoint_path)
        log.info('Checkpoint saved phase=%s -> %s', phase, checkpoint_path)
        return True
    except (OSError, TypeError, ValueError) as error:
        stats['checkpoint_writes'] -= 1
        stats['checkpoint_write_errors'] += 1
        stats['aborted_reason'] = stats['aborted_reason'] or 'checkpoint_write_failed'
        log.error('Checkpoint write failed at phase=%s: %s', phase, error)
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError as cleanup_error:
            log.warning(
                'Checkpoint temp cleanup failed for %s: %s',
                temporary_path,
                cleanup_error,
            )
        return False


def run_bridge(args):
    stats = _new_stats()
    deadline_at = getattr(args, 'deadline_at', None)
    if deadline_at is None:
        deadline_at = time.monotonic() + MAX_RUNTIME_SECONDS

    if _deadline_due(deadline_at):
        _mark_deadline(stats, 'startup')
        _write_checkpoint(args, stats, 'deadline')
        return stats

    # Fail closed before any read, verdict, or publication: without a working
    # isolated yt-dlp every probe would be recorded as an ``error`` verdict.
    ensure_ytdlp_runtime()

    author_id = get_system_bot_id()
    if _deadline_due(deadline_at):
        _mark_deadline(stats, 'publisher_identity')
        _write_checkpoint(args, stats, 'deadline')
        return stats

    existing = _load_existing_publications()
    if _deadline_due(deadline_at):
        _mark_deadline(stats, 'publication_inventory')
        _write_checkpoint(args, stats, 'deadline')
        return stats

    failure_rows = _load_embed_failure_rows()
    log.info('Loaded %s existing video-library publications by source_asset_id', len(existing))
    log.info('Loaded %s YouTube verification records', len(failure_rows))

    force_audit = bool(getattr(args, 'audit_all', False))
    stats['failure_reports_loaded'] = len(failure_rows)
    stats['pending_embed_reports'] = sum(
        1 for row in failure_rows if row.get('verification_status') == 'pending'
    )
    active_confirmed_ids = {
        str(row['video_id'])
        for row in failure_rows
        if row.get('verification_status') == 'confirmed' and row.get('resolved') is False
    }
    failure_plans = []
    for failure_row in failure_rows:
        plan = _failure_candidate_plan(failure_row, datetime.now(timezone.utc), force_audit)
        if plan in ('permanent_cooldown', 'transient_cooldown'):
            stats['failure_cooldown'] += 1
        elif plan:
            failure_plans.append((plan, failure_row))
    failure_plans.sort(key=lambda item: item[0][:3])
    failure_limit = None if force_audit else FAILURE_VERIFY_LIMIT
    stats['failure_deferred_by_limit'] = (
        max(0, len(failure_plans) - failure_limit) if failure_limit is not None else 0
    )
    selected_failure_plans = _select_failure_plans(failure_plans, failure_limit)
    stats['failure_candidates'] = len(selected_failure_plans)
    stats['failure_candidate_reasons'].update(
        plan[3] for plan, _ in selected_failure_plans
    )
    max_candidates = None if force_audit else args.limit
    planned_candidates = []
    catalog_by_video_id = {}
    freshness_now = datetime.now(timezone.utc)

    if _deadline_due(deadline_at):
        _mark_deadline(stats, 'failure_inventory')
        _write_checkpoint(args, stats, 'deadline')
        return stats

    for rows in _catalog_pages(args.source):
        page_is_last = len(rows) < CATALOG_PAGE_SIZE
        stats['catalog_pages'] += 1
        stats['catalog_rows'] += len(rows)
        for row in rows:
            asset_id = str(row.get('id') or '')
            vid_id = str(row.get('youtube_video_id') or '')
            video_type = str(row.get('type') or '').lower()
            if not asset_id or not YOUTUBE_ID_RE.fullmatch(vid_id):
                stats['invalid_rows'] += 1
                continue
            if video_type not in POKER_VIDEO_TYPES:
                stats['invalid_rows'] += 1
                continue
            stats['eligible_rows'] += 1
            catalog_by_video_id[vid_id] = row

            current = existing.get(asset_id)
            caption = (row.get('title') or row.get('source_name') or '').strip()
            caption_matches = bool(current and (current.get('caption') or '').strip() == caption)
            verification_fresh = _verification_is_fresh(row, freshness_now)
            if vid_id in active_confirmed_ids:
                stats['active_embed_failures'] += 1

            if args.sync_captions and not current:
                continue
            plan = _candidate_plan(
                row,
                current,
                caption_matches,
                freshness_now,
                force_audit,
            )
            if plan == 'already_current':
                if vid_id in active_confirmed_ids:
                    stats['confirmed_blocked_current'] += 1
                else:
                    stats['already_current'] += 1
                continue
            if current and not verification_fresh:
                stats['verification_expired'] += 1
            if plan == 'permanent_cooldown':
                stats['permanent_cooldown'] += 1
                continue
            if plan == 'transient_cooldown':
                stats['transient_cooldown'] += 1
                continue
            planned_candidates.append((plan, row))
        if page_is_last:
            stats['catalog_scan_complete'] = True
            break
        if _deadline_due(deadline_at):
            _mark_deadline(stats, 'catalog_scan')
            break

    # Candidate priority is global (never checked, oldest stale, then cooled
    # retries), so never publish from a partial newest-first catalog scan.
    if not stats['catalog_scan_complete']:
        if not stats['deadline_reached']:
            _mark_deadline(stats, 'catalog_scan')
        _write_checkpoint(args, stats, 'deadline')
        return stats
    if _deadline_due(deadline_at):
        _mark_deadline(stats, 'catalog_scan')
        _write_checkpoint(args, stats, 'deadline')
        return stats

    planned_candidates.sort(key=lambda item: item[0][:3])
    stats['candidate_pool'] = len(planned_candidates)
    if max_candidates is not None:
        stats['deferred_by_limit'] = max(0, len(planned_candidates) - max_candidates)
        planned_candidates = planned_candidates[:max_candidates]
    candidates = [row for _, row in planned_candidates]
    stats['candidates'] = len(candidates)
    stats['candidate_reasons'].update(plan[3] for plan, _ in planned_candidates)
    _write_checkpoint(
        args,
        stats,
        'planned',
        {
            'catalog_candidates': len(candidates),
            'failure_candidates': len(selected_failure_plans),
        },
    )

    if candidates:
        log.info(
            'Verifying %s candidates with concurrency=%s',
            len(candidates),
            min(VERIFY_CONCURRENCY, len(candidates)),
        )
    abort = False
    verification_cache = {}
    last_catalog_commit = {}
    with ThreadPoolExecutor(max_workers=VERIFY_CONCURRENCY) as executor:
        for start in range(0, len(candidates), VERIFY_CONCURRENCY):
            if _deadline_due(deadline_at, VERIFY_BATCH_START_RESERVE_SECONDS):
                _mark_deadline(stats, 'catalog_verification')
                _write_checkpoint(args, stats, 'deadline', last_catalog_commit)
                abort = True
                break
            batch = candidates[start:start + VERIFY_CONCURRENCY]
            verified_results = executor.map(_verify_row, batch)
            for row, availability in zip(batch, verified_results):
                vid_id = str(row.get('youtube_video_id') or '')
                stats['verification_attempted'] += 1
                stats['verification_outcomes'][availability['status']] += 1
                if _is_operational_verifier_error(availability):
                    stats['verifier_errors_observed'] += 1
                if args.dry_run:
                    verification_cache[vid_id] = {'availability': availability, 'verdict': None}
                    last_catalog_commit = {
                        'asset_id': str(row.get('id') or ''),
                        'video_id': vid_id,
                    }
                    if availability['available']:
                        stats['verified'] += 1
                        stats['would_publish'] += 1
                    else:
                        stats['rejected'] += 1
                    continue

                if _deadline_due(deadline_at):
                    _mark_deadline(stats, 'catalog_verdict')
                    abort = True
                    break
                try:
                    verdict = _record_embed_verdict(vid_id, availability)
                except RuntimeError as error:
                    stats['failure_verdict_errors'] += 1
                    stats['aborted_reason'] = 'failure_verdict_failed'
                    log.error('Embed verdict failed for %s: %s', vid_id, error)
                    abort = True
                    break
                last_catalog_commit = {
                    'asset_id': str(row.get('id') or ''),
                    'video_id': vid_id,
                }
                verification_cache[vid_id] = {
                    'availability': availability,
                    'verdict': verdict,
                }

                effective_availability = availability
                if availability['available'] and not (
                    verdict['verification_status'] == 'resolved'
                    and verdict['resolved'] is True
                ):
                    effective_availability = {
                        **availability,
                        'available': False,
                        'status': 'error',
                        'reason': 'newer_embed_report_requires_reverification',
                    }
                    stats['failure_race_deferred'] += 1

                # The verdict RPC owns both youtube_embed_failures and every
                # matching catalog availability row in one transaction. A
                # separate PATCH here would reopen a split-write race.
                if not effective_availability['available']:
                    if not availability['available']:
                        stats['rejected'] += 1
                    log.warning(
                        '%s %s (%s): %s',
                        'Deferred' if availability['available'] else 'Rejected',
                        vid_id,
                        effective_availability['status'],
                        effective_availability.get('reason'),
                    )
                    continue

                stats['verified'] += 1

                if _deadline_due(deadline_at):
                    stats['publication_deferred_deadline'] += 1
                    _mark_deadline(stats, 'catalog_publication')
                    abort = True
                    break
                try:
                    publication = _publish_row(row, author_id)
                    if publication['was_created']:
                        stats['created'] += 1
                    else:
                        stats['repaired_or_updated'] += 1
                except RuntimeError as error:
                    stats['rpc_errors'] += 1
                    log.error('Publication failed for %s: %s', vid_id, error)
                time.sleep(0.15)
            _write_checkpoint(
                args,
                stats,
                'catalog_batch',
                {
                    **last_catalog_commit,
                    'batch_start': start,
                    'batch_size': len(batch),
                },
            )
            if abort:
                break

    failure_queue_abort = False
    selected_candidate_asset_ids = {
        str(row.get('id') or '') for row in candidates
    }
    failure_candidates = [row for _, row in selected_failure_plans]
    # A verdict/RPC error in the primary catalog pass is a real release signal.
    # Do not obscure it with more writes from the auxiliary report queue.
    if abort:
        failure_candidates = []
    if failure_candidates:
        log.info(
            'Verifying %s pending/retry embed-failure reports with concurrency=%s',
            len(failure_candidates),
            min(VERIFY_CONCURRENCY, len(failure_candidates)),
        )
    last_failure_commit = {}
    with ThreadPoolExecutor(max_workers=VERIFY_CONCURRENCY) as executor:
        for start in range(0, len(failure_candidates), VERIFY_CONCURRENCY):
            if _deadline_due(deadline_at, VERIFY_BATCH_START_RESERVE_SECONDS):
                _mark_deadline(stats, 'failure_verification')
                _write_checkpoint(args, stats, 'deadline', last_failure_commit)
                failure_queue_abort = True
                break
            batch = failure_candidates[start:start + VERIFY_CONCURRENCY]
            uncached = []
            for failure_row in batch:
                cached = verification_cache.get(str(failure_row.get('video_id') or ''))
                if cached and (
                    args.dry_run
                    or (cached.get('verdict') or {}).get('verification_status') != 'pending'
                ):
                    continue
                uncached.append({'youtube_video_id': failure_row['video_id']})
            fresh_results = iter(executor.map(_verify_row, uncached))

            for failure_row in batch:
                vid_id = str(failure_row.get('video_id') or '')
                cached = verification_cache.get(vid_id)
                can_reuse = bool(
                    cached
                    and (
                        args.dry_run
                        or (cached.get('verdict') or {}).get('verification_status') != 'pending'
                    )
                )
                if can_reuse:
                    stats['failure_verification_reused'] += 1
                    availability = cached['availability']
                    verdict = cached['verdict']
                else:
                    availability = next(fresh_results)
                    stats['failure_verification_attempted'] += 1
                    verdict = None
                    if not args.dry_run:
                        try:
                            error_code = failure_row.get('error_code')
                            error_code = int(error_code) if error_code is not None else None
                        except (TypeError, ValueError):
                            error_code = None
                        if _deadline_due(deadline_at):
                            _mark_deadline(stats, 'failure_verdict')
                            failure_queue_abort = True
                            break
                        try:
                            verdict = _record_embed_verdict(
                                vid_id,
                                availability,
                                error_code=error_code,
                                surface='embed_failure_verifier',
                            )
                        except RuntimeError as error:
                            stats['failure_verdict_errors'] += 1
                            stats['aborted_reason'] = (
                                stats['aborted_reason'] or 'failure_verdict_failed'
                            )
                            log.error('Pending embed verdict failed for %s: %s', vid_id, error)
                            failure_queue_abort = True
                            break
                        last_failure_commit = {'video_id': vid_id}
                        verification_cache[vid_id] = {
                            'availability': availability,
                            'verdict': verdict,
                        }

                stats['failure_verification_outcomes'][availability['status']] += 1
                if _is_operational_verifier_error(availability):
                    stats['verifier_errors_observed'] += 1

                if args.dry_run:
                    last_failure_commit = {'video_id': vid_id}
                    if availability['status'] == 'verified':
                        stats['failure_resolved'] += 1
                    elif availability['status'] in PERMANENT_FAILURE_STATUSES:
                        stats['failure_confirmed'] += 1
                    else:
                        stats['failure_transient'] += 1
                    continue

                verdict_status = verdict['verification_status']
                if verdict_status == 'resolved' and verdict['resolved'] is True:
                    stats['failure_resolved'] += 1
                elif verdict_status == 'confirmed' and verdict['resolved'] is False:
                    stats['failure_confirmed'] += 1
                elif verdict_status == 'pending':
                    stats['failure_race_deferred'] += 1
                else:
                    stats['failure_transient'] += 1

                catalog_row = catalog_by_video_id.get(vid_id)
                if catalog_row and not can_reuse:
                    effective_availability = availability
                    if availability['available'] and verdict_status != 'resolved':
                        effective_availability = {
                            **availability,
                            'available': False,
                            'status': 'error',
                            'reason': 'newer_embed_report_requires_reverification',
                        }

                    # A newer report may have landed while the primary library
                    # verification was in flight. When the immediate race-safe
                    # retry resolves that report, finish the already-selected
                    # catalog candidate now instead of waiting another day.
                    selected_for_catalog = (
                        str(catalog_row.get('id') or '') in selected_candidate_asset_ids
                    )
                    if (
                        selected_for_catalog
                        and effective_availability['available']
                        and verdict_status == 'resolved'
                        and verdict['resolved'] is True
                    ):
                        if _deadline_due(deadline_at):
                            stats['publication_deferred_deadline'] += 1
                            _mark_deadline(stats, 'failure_race_publication')
                            failure_queue_abort = True
                            break
                        stats['failure_race_recovered'] += 1
                        stats['verified'] += 1
                        try:
                            publication = _publish_row(catalog_row, author_id)
                            if publication['was_created']:
                                stats['created'] += 1
                            else:
                                stats['repaired_or_updated'] += 1
                        except RuntimeError as error:
                            stats['rpc_errors'] += 1
                            log.error(
                                'Publication after report-race recovery failed for %s: %s',
                                vid_id,
                                error,
                            )
            _write_checkpoint(
                args,
                stats,
                'failure_batch',
                {
                    **last_failure_commit,
                    'batch_start': start,
                    'batch_size': len(batch),
                },
            )
            if failure_queue_abort:
                break

    stats['verification_outcomes'] = dict(stats['verification_outcomes'])
    stats['candidate_reasons'] = dict(stats['candidate_reasons'])
    stats['failure_candidate_reasons'] = dict(stats['failure_candidate_reasons'])
    stats['failure_verification_outcomes'] = dict(stats['failure_verification_outcomes'])
    return stats


def _write_evidence(args, stats, elapsed, fatal_error=None, exit_code=0):
    evidence = {
        'publisher': 'video_library_to_reels_v2',
        'run_at': datetime.now(timezone.utc).isoformat(),
        'dry_run': args.dry_run,
        'source': args.source,
        'limit': args.limit,
        'force_audit': bool(getattr(args, 'audit_all', False)),
        'verification_required': True,
        'max_runtime_seconds': MAX_RUNTIME_SECONDS,
        'verification_refresh_hours': int(
            VERIFICATION_REFRESH_AGE.total_seconds() // 3600
        ),
        'transient_retry_hours': int(TRANSIENT_RETRY_AGE.total_seconds() // 3600),
        'permanent_retry_days': PERMANENT_RETRY_AGE.days,
        'failure_queue_limit': (
            None if getattr(args, 'audit_all', False) else FAILURE_VERIFY_LIMIT
        ),
        'verification_concurrency': VERIFY_CONCURRENCY,
        'sync_captions_only': args.sync_captions,
        'stats': stats,
        'elapsed_seconds': round(elapsed, 1),
        'exit_code': exit_code,
        'fatal_error': fatal_error,
    }
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    evidence_path = EVIDENCE_DIR / f'video_library_to_reels_{timestamp}.json'
    try:
        evidence_path.write_text(json.dumps(evidence, indent=2, sort_keys=True))
        log.info('Evidence saved -> %s', evidence_path)
    except OSError as error:
        log.warning('Evidence could not be saved: %s', error)


def _positive_int(value):
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError('must be at least 1')
    return parsed


def main():
    parser = argparse.ArgumentParser(
        description='Publish verified video-library entries through the atomic Reels RPC',
    )
    parser.add_argument('--dry-run', action='store_true', help='Verify without database writes')
    parser.add_argument(
        '--limit',
        type=_positive_int,
        default=None,
        help='Maximum publish, repair, or verification-renewal candidates',
    )
    parser.add_argument('--source', type=str, default=None, help='Single source ID, e.g. HCL')
    parser.add_argument(
        '--verify',
        action='store_true',
        help='Compatibility assertion; verification is always mandatory',
    )
    parser.add_argument(
        '--sync-captions',
        action='store_true',
        dest='sync_captions',
        help='Only repair/update already-linked publications via the atomic RPC',
    )
    parser.add_argument(
        '--audit-all',
        '--force-audit',
        action='store_true',
        dest='audit_all',
        help='Ignore freshness/cooldowns and exhaustively reverify every eligible row',
    )
    parser.add_argument(
        '--preflight-only',
        action='store_true',
        dest='preflight_only',
        help='Validate required schema and RPC behavior without changing data',
    )
    args = parser.parse_args()

    if args.audit_all and args.limit is not None:
        parser.error('--audit-all/--force-audit is exhaustive and cannot be combined with --limit')

    if args.source:
        args.source = args.source.strip().upper()
        if not re.fullmatch(r'[A-Z0-9_]{1,48}', args.source):
            parser.error('--source must contain only A-Z, 0-9, and underscore')

    if args.preflight_only:
        try:
            ensure_ytdlp_runtime()
            run_schema_preflight()
            return 0
        except YtDlpUnavailableError as error:
            log.error('Open Claw publisher preflight failed: yt-dlp runtime unavailable: %s', error)
            return YTDLP_RUNTIME_EXIT_CODE
        except RuntimeError as error:
            log.error('Open Claw publisher preflight failed: %s', error)
            return 2

    started = time.monotonic()
    args.deadline_at = started + MAX_RUNTIME_SECONDS
    stats = _new_stats()
    fatal_error = None
    exit_code = 0
    log.info(
        'Starting video-library publisher dry_run=%s limit=%s source=%s verification=mandatory sync_only=%s force_audit=%s max_runtime=%ss',
        args.dry_run,
        args.limit,
        args.source or 'ALL',
        args.sync_captions,
        args.audit_all,
        MAX_RUNTIME_SECONDS,
    )
    try:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
        stats = run_bridge(args)
        if (
            stats['rpc_errors']
            or stats['failure_verdict_errors']
            or stats['verifier_errors_observed']
            or stats['checkpoint_write_errors']
            or stats['deadline_reached']
        ):
            exit_code = 1
    except YtDlpUnavailableError as error:
        fatal_error = f'yt-dlp runtime unavailable: {error}'
        stats['aborted_reason'] = stats['aborted_reason'] or 'ytdlp_runtime_unavailable'
        log.error('Fatal publisher error: %s', fatal_error)
        exit_code = YTDLP_RUNTIME_EXIT_CODE
    except RuntimeError as error:
        fatal_error = str(error)
        log.error('Fatal publisher error: %s', fatal_error)
        exit_code = 2

    if not _write_checkpoint(
        args,
        stats,
        'final',
        {'exit_code_before_checkpoint': exit_code, 'fatal_error': fatal_error},
    ):
        exit_code = max(exit_code, 1)

    elapsed = time.monotonic() - started
    _write_evidence(args, stats, elapsed, fatal_error, exit_code)
    log.info('Publisher results: %s', json.dumps(stats, sort_keys=True))
    log.info('Elapsed: %.1fs; exit=%s', elapsed, exit_code)
    return exit_code


if __name__ == '__main__':
    sys.exit(main())
