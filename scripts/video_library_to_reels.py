#!/usr/bin/env python3
"""
VIDEO LIBRARY -> SOCIAL REELS PUBLISHER
=======================================

Publishes verified poker and slots videos from ``video_library_videos`` through the
database's atomic ``publish_video_library_reel`` RPC. The RPC owns the
social_posts + social_reels transaction and canonical identity; this process
owns discovery, availability verification, and bounded scheduling.

Safety contract:
  * the publisher identity is resolved from service-only database configuration
    (video_reels_pipeline_config.video_library_publisher_profile_id). Before any
    YouTube probe or database write, in every mode (--dry-run,
    --sync-captions and --preflight-only included), that profile must be a
    UUID, exist, have profiles.is_horse exactly false and have no
    content_authors row; an optional VIDEO_LIBRARY_BOT_PROFILE_ID pin must
    equal it. Any failed or unreadable check exits non-zero. There is no
    fallback author (2026-09-21 fleet recertification D1 found the old bridge
    posting as the first content_authors profile, always a horse);
  * 2026-09-23 owner decision (Dan): Reels publish only as the official
    Smarter.Poker system account, gated by the dedicated
    video_reels_pipeline_controls kill switch. Both
    video_library_reel_creation and video_library_reel_publication must read
    exactly enabled=true before any YouTube probe; a readable ``false`` is a
    logged no-op and an unreadable, missing or non-boolean control exits
    non-zero. The horse-fleet switch content_settings.engine_enabled is NOT
    consulted here; it still gates the horse-authored workers bridge, which
    Open Claw never calls for this job;
  * only explicitly supported ``cash``, ``tournament``, and ``slots`` catalog
    rows are eligible;
  * every new or repaired publication is verified with YouTube oEmbed, the
    exact anonymous embed bootstrap, and yt-dlp restriction metadata; every
    unknown/error state fails closed;
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
        /opt/openclaw/current/video_library_to_reels.py --limit 750 --verify \
        --verify-platform-supply

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
VIDEO_LIBRARY_REEL_TYPES = POKER_VIDEO_TYPES | {'slots'}
OPS07_LIFECYCLE_STAGES = (
    'candidate',
    'verified',
    'published',
    'rejected',
    'stale',
    'feed_visible',
)
CATALOG_PAGE_SIZE = 250
EXISTING_PAGE_SIZE = 1000
FAILURE_PAGE_SIZE = 1000
FAILURE_VERIFY_LIMIT = 500
FEED_VISIBILITY_BATCH_SIZE = 100
PLATFORM_POOL_LIMIT = 1_000
YOUTUBE_ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')
VERIFIER_INCIDENT_START = datetime(2026, 9, 27, 3, 32, 27, tzinfo=timezone.utc)
VERIFIER_INCIDENT_END = datetime(
    2026, 9, 27, 4, 4, 25, 948844, tzinfo=timezone.utc
)
# The first bounded recovery was cancelled after production YouTube egress
# began returning its bot challenge for ordinary public controls. It wrote 90
# operational-error verdicts before custody was revoked. This exact window is
# a second, finite recovery generation: only error rows may bypass cooldown;
# the 12 explicit confirmed restrictions from the same operation never do.
CANCELLED_RECOVERY_START = datetime(
    2026, 9, 27, 4, 54, 42, 529360, tzinfo=timezone.utc
)
CANCELLED_RECOVERY_END = datetime(
    2026, 9, 27, 4, 56, 42, 443254, tzinfo=timezone.utc
)
# Renew well before the database's 7-day public-playback cutoff (installed
# SQL: fn_is_video_library_asset_eligible and its sibling predicates accept
# availability_checked_at no older than interval '7 days'; the JavaScript
# mirror is VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS). The dispatcher retains its
# daily 07:00 schedule and bounded 750-row pass. Its reserved 400 library slots
# cycle the current ~2,200 poker and slots rows inside six runs, while 175
# poker and 175 sports slots do the same for both Workers pools. The 12-hour value below is only
# the "due for renewal" threshold that makes every daily run pick the oldest
# rows; it is not the public expiry. Whole-catalog coverage inside one run is
# not implied: stale rows remain fail-closed until the existing verifier
# establishes fresh evidence. The relationship between these numbers is pinned
# by __tests__/video-library-freshness-contract.test.mjs.
VERIFICATION_REFRESH_AGE = timedelta(hours=12)
PUBLIC_VERIFICATION_MAX_AGE = timedelta(days=7)
PUBLIC_VERIFICATION_MAX_FUTURE_SKEW = timedelta(minutes=5)
TRANSIENT_RETRY_AGE = timedelta(hours=6)
PERMANENT_RETRY_AGE = timedelta(days=14)
PERMANENT_FAILURE_STATUSES = frozenset(
    {'private', 'restricted', 'unavailable', 'embed_disabled'}
)
EXPECTED_TRANSIENT_REASONS = frozenset({
    'youtube_embed_public_proof_incomplete',
    'youtube_upcoming',
    'youtube_made_for_kids',
    'youtube_restriction_signal_conflict',
})
# A content-specific expected transient remains in the per-video failure ledger,
# but one such row must not discard a large batch of conclusive work. Widespread
# expected transients still fail the run as a provider/parser anomaly.
EXPECTED_TRANSIENT_MIN_BUDGET = 5
EXPECTED_TRANSIENT_MAX_RATIO = 0.10
RELEASE_RECOVERY_SURFACE_PREFIX = 'release_recovery_v2_'
YOUTUBE_ANDROID_CLIENT_VERSION = '20.10.38'


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
# Optional host-side cross-check of the database-pinned publisher. It is
# never an author source: when set, it must equal
# video_reels_pipeline_config.video_library_publisher_profile_id or the run
# stops before any YouTube probe or write (get_system_bot_id lists the checks).
VIDEO_LIBRARY_BOT_PROFILE_ID = os.environ.get('VIDEO_LIBRARY_BOT_PROFILE_ID', '').strip()


def _bounded_env_int(name, default, minimum, maximum):
    try:
        value = int(os.environ.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


# Six parallel yt-dlp probes keep the Open Claw systemd cgroup comfortably
# below its 512 MB limit while processing the 750-row daily renewal batch.
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


_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)
REQUIRED_PUBLICATION_CONTROLS = frozenset(
    {'video_library_reel_creation', 'video_library_reel_publication'}
)


class PublisherIdentityError(RuntimeError):
    """The configured publisher is missing, unreadable, or not allowed to post."""


class PublicationControlsError(RuntimeError):
    """The dedicated Reel controls are unreadable, missing, or malformed."""


def get_system_bot_id():
    """Return the database-pinned publisher after the anti-horse checks.

    The author is never guessed and there is no fallback (2026-09-21 fleet
    recertification D1: the old bridge fell back to the first content_authors
    profile, and every such profile is a horse). The 2026-09-23 owner
    decision makes the official Smarter.Poker system account the only
    publisher. Each check reads fresh from the database; a failed check or an
    unreadable answer raises PublisherIdentityError, which stops the run with
    a non-zero exit before any YouTube probe or write:
      1. video_reels_pipeline_config (singleton 'video_library') holds exactly
         one video_library_publisher_profile_id, and it is a UUID (the
         official account 00000000-0000-0000-0000-000000000001 is a valid
         UUID but not an RFC 4122 v1-v5 one, so no version nibble is required);
      2. VIDEO_LIBRARY_BOT_PROFILE_ID, when set on the host, equals it;
      3. profiles has that id and its is_horse is exactly false (not true, not
         null, not missing);
      4. no content_authors row points at it, because the fleet engine treats
         every content_authors profile as one of its horses whatever
         profiles.is_horse says.
    publish_video_library_reel independently requires p_author_id to equal
    the configured profile.
    """
    config_rows = _request(
        'GET',
        'video_reels_pipeline_config',
        params={
            'select': 'video_library_publisher_profile_id',
            'singleton_key': 'eq.video_library',
            'limit': 1,
        },
    )
    if not isinstance(config_rows, list):
        raise PublisherIdentityError('Could not read video-library publisher configuration')
    if len(config_rows) != 1 or not isinstance(config_rows[0], dict):
        raise PublisherIdentityError('Video-library publisher configuration is missing')
    bot_id = str(config_rows[0].get('video_library_publisher_profile_id') or '').strip().lower()
    if not _UUID_RE.fullmatch(bot_id):
        raise PublisherIdentityError('Video-library publisher profile is not configured')

    if VIDEO_LIBRARY_BOT_PROFILE_ID and VIDEO_LIBRARY_BOT_PROFILE_ID.lower() != bot_id:
        raise PublisherIdentityError(
            'VIDEO_LIBRARY_BOT_PROFILE_ID does not match the database-pinned '
            f'video-library publisher {bot_id}'
        )

    profiles = _request(
        'GET',
        'profiles',
        params={'select': 'id,is_horse', 'id': f'eq.{bot_id}', 'limit': 1},
    )
    if not isinstance(profiles, list):
        raise PublisherIdentityError(
            f'Could not validate configured video-library publisher profile {bot_id}'
        )
    if not profiles or not isinstance(profiles[0], dict):
        raise PublisherIdentityError(
            f'Configured video-library publisher profile {bot_id} is not live'
        )
    if profiles[0].get('is_horse') is not False:
        raise PublisherIdentityError(
            f'Configured video-library publisher {bot_id} has '
            f'is_horse={profiles[0].get("is_horse")!r}, not false: '
            'Reels are never published as a horse'
        )

    roster = _request(
        'GET',
        'content_authors',
        params={'select': 'id', 'profile_id': f'eq.{bot_id}', 'limit': 1},
    )
    if not isinstance(roster, list):
        raise PublisherIdentityError(
            f'Could not check content_authors for the configured publisher {bot_id}'
        )
    if roster:
        raise PublisherIdentityError(
            f'Configured video-library publisher {bot_id} is a content_authors '
            '(horse fleet) profile'
        )
    log.info(
        'Publisher verified: %s is the configured profile, is_horse=false, '
        'not in content_authors',
        bot_id,
    )
    return bot_id


def read_publication_controls():
    """Return {control_key: enabled} for both dedicated Reel controls.

    2026-09-23 owner decision (Dan): this official-account publisher is gated
    by video_reels_pipeline_controls, NOT by the horse-fleet switch
    content_settings.engine_enabled, which is deliberately never read here.
    The fleet switch still gates the horse-authored workers bridge
    (/cron/video-library-reels), and Open Claw never routes this job there.
    Raises PublicationControlsError when the table cannot be read, a control
    row is missing or duplicated, or ``enabled`` is not a boolean.
    """
    rows = _request(
        'GET',
        'video_reels_pipeline_controls',
        params={
            'select': 'control_key,enabled,updated_at',
            'control_key': 'in.(' + ','.join(sorted(REQUIRED_PUBLICATION_CONTROLS)) + ')',
        },
    )
    if not isinstance(rows, list):
        raise PublicationControlsError('Could not read video_reels_pipeline_controls')
    controls = {}
    for row in rows:
        key = row.get('control_key') if isinstance(row, dict) else None
        if key not in REQUIRED_PUBLICATION_CONTROLS or key in controls:
            raise PublicationControlsError(
                f'Unexpected video_reels_pipeline_controls row: {row!r}'
            )
        if not isinstance(row.get('enabled'), bool):
            raise PublicationControlsError(
                f'Control {key} has enabled={row.get("enabled")!r}, not a boolean'
            )
        controls[key] = row['enabled']
    if set(controls) != REQUIRED_PUBLICATION_CONTROLS:
        raise PublicationControlsError('Required video-library Reel controls are missing')
    return controls


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
        'poker_clips': 'video_id,source_url,is_active,oembed_ok,published_at',
        'sports_clips': 'video_id,source_url,created_at',
    }
    for relation, columns in relation_contracts.items():
        rows = _request('GET', relation, params={'select': columns, 'limit': 1})
        if rows is None or not isinstance(rows, list):
            raise RuntimeError(f'Preflight could not read required relation {relation}')

    # A release preflight validates that both controls are present and
    # readable booleans; it does not require them to be on, so a deliberately
    # paused pipeline can still be installed. Every run requires both to be
    # exactly true before any YouTube probe (run_bridge).
    controls = read_publication_controls()
    log.info(
        'Open Claw publisher preflight: Reel controls %s',
        ', '.join(f'{key}={controls[key]}' for key in sorted(controls)),
    )

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


def _is_expected_transient_verifier_result(result):
    return (
        result.get('status') == 'error'
        and result.get('reason') in EXPECTED_TRANSIENT_REASONS
    )


def _classify_http_error(prefix, error):
    # Only oEmbed is the durable content-identity endpoint in this pipeline.
    # A 404/410 from the embed document or the internal player endpoint can be
    # caused by endpoint, key, routing, or transport drift after oEmbed already
    # proved the exact video exists. Keep those failures operational/unknown so
    # they cannot poison the 14-day availability verdict.
    if prefix == 'oembed' and error.code in (404, 410):
        return _availability('unavailable', f'{prefix}_http_{error.code}')
    return _availability('error', f'{prefix}_http_{error.code}')


def _classify_youtube_restriction_detail(detail):
    """Classify only explicit content verdicts; auth/challenge text stays unknown."""
    normalised = str(detail or '').lower()
    if 'private video' in normalised or 'this video is private' in normalised:
        return _availability('private', 'youtube_private')
    if any(
        marker in normalised
        for marker in (
            'members-only',
            'members only',
            "channel's members",
            'premium',
            'subscription',
            'subscriber',
        )
    ):
        return _availability('restricted', 'youtube_members_only')
    if any(
        marker in normalised
        for marker in ('age-restricted', 'age restricted', 'confirm your age')
    ):
        return _availability('restricted', 'youtube_age_restricted')
    if any(
        marker in normalised
        for marker in ('not available in your country', 'not available in your region')
    ):
        return _availability('restricted', 'youtube_region_restricted')
    if 'embedding disabled' in normalised or 'playback on other websites has been disabled' in normalised:
        return _availability('embed_disabled', 'youtube_embed_disabled')
    if any(
        marker in normalised
        for marker in ('video unavailable', 'video has been removed', 'video was removed', 'deleted video')
    ):
        return _availability('unavailable', 'youtube_unavailable')
    return None


def _is_youtube_bot_challenge(detail):
    if isinstance(detail, bytes):
        detail = detail.decode('utf-8', errors='replace')
    normalised = ' '.join(
        str(detail or '')
        .lower()
        .replace('\u2018', "'")
        .replace('\u2019', "'")
        .split()
    )
    return any(
        marker in normalised
        for marker in (
            'sign in to confirm you are not a bot',
            "sign in to confirm you're not a bot",
        )
    )


def _combined_process_output(stdout, stderr):
    def _text(value):
        if isinstance(value, bytes):
            return value.decode('utf-8', errors='replace')
        return str(value or '')

    return '\n'.join(_text(value) for value in (stdout, stderr))


def _classify_youtube_transient_detail(detail):
    """Recognize exact non-permanent states that yt-dlp reports as failures."""
    if isinstance(detail, bytes):
        detail = detail.decode('utf-8', errors='replace')
    normalised = ' '.join(str(detail or '').lower().split())
    if any(
        marker in normalised
        for marker in (
            'this live event will begin in a few moments',
            'this live event will begin in',
            'premieres in ',
        )
    ):
        return _availability('error', 'youtube_upcoming')
    return None


def _adjudicate_failed_ytdlp(
    detail,
    embed_verdict,
    fallback_reason,
    *,
    allow_embed_fallback=True,
    allow_challenge_rescue=True,
):
    """Resolve explicit/challenge output without promoting generic failures."""
    if 'no module named' in detail.lower() and 'yt_dlp' in detail.lower():
        raise YtDlpUnavailableError(
            'yt_dlp became unimportable in the isolated child during the run'
        )
    explicit = _classify_youtube_restriction_detail(detail)
    if explicit:
        if embed_verdict['status'] == explicit['status']:
            return explicit
        return _availability('error', 'youtube_restriction_signal_conflict')
    transient = _classify_youtube_transient_detail(detail)
    if transient:
        return transient
    if (
        allow_embed_fallback
        and embed_verdict['status'] in PERMANENT_FAILURE_STATUSES
    ):
        return embed_verdict
    if _is_youtube_bot_challenge(detail):
        if allow_challenge_rescue and embed_verdict['status'] == 'challenge':
            return _availability('verified')
        if allow_embed_fallback:
            return embed_verdict
        return _availability('error', fallback_reason)
    if any(
        marker in detail.lower()
        for marker in ('login required', 'sign in to continue')
    ):
        return _availability('error', 'youtube_auth_required')
    return _availability('error', fallback_reason)


def _anonymous_embed_verdict(video_id, request_headers):
    """Require both exact embed corroboration and anonymous player playback."""
    embed_url = (
        f'https://www.youtube.com/embed/{video_id}?'
        + urllib.parse.urlencode(
            {'enablejsapi': '1', 'origin': 'https://smarter.poker'}
        )
    )
    headers = {**request_headers, 'Referer': 'https://smarter.poker/'}
    try:
        request = urllib.request.Request(embed_url, headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status != 200:
                return _availability('error', f'youtube_embed_http_{response.status}')
            page = response.read(4 * 1024 * 1024).decode('utf-8', errors='replace')
    except urllib.error.HTTPError as error:
        return _classify_http_error('youtube_embed', error)
    except OSError as error:
        log.warning('Anonymous embed verification unknown for %s: %s', video_id, error)
        return _availability('error', 'youtube_embed_network_error')

    marker = re.search(r'"PLAYER_VARS"\s*:\s*', page)
    if marker is None:
        return _availability('error', 'youtube_embed_payload_missing')
    identities = set(
        re.findall(r'"VIDEO_ID"\s*:\s*"([A-Za-z0-9_-]{11})"', page)
    )
    if identities != {video_id}:
        return _availability('error', 'youtube_embed_identity_mismatch')
    try:
        player_vars, _ = json.JSONDecoder().raw_decode(page, marker.end())
        embedded_response = player_vars['embedded_player_response']
        if not isinstance(embedded_response, str):
            raise TypeError('embedded_player_response must be a JSON string')
        player = json.loads(embedded_response)
        if not isinstance(player, dict):
            raise TypeError('embedded player response must be an object')
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return _availability('error', 'youtube_embed_payload_malformed')

    playability = player.get('previewPlayabilityStatus')
    flags = player.get('videoFlags')
    if not isinstance(playability, dict):
        return _availability('error', 'youtube_embed_public_proof_incomplete')
    detail = ' '.join(
        str(playability.get(key) or '') for key in ('reason', 'status')
    )
    explicit = _classify_youtube_restriction_detail(detail)
    if explicit:
        return explicit
    if str(playability.get('status') or '').upper() != 'OK':
        return _availability('error', 'youtube_embed_unplayable_unknown')
    if (
        playability.get('playableInEmbed') is not True
        or not isinstance(flags, dict)
        or flags.get('playableInEmbed') is not True
        or flags.get('isCrawlable') is not True
    ):
        return _availability('error', 'youtube_embed_public_proof_incomplete')
    api_key_match = re.search(
        r'"INNERTUBE_API_KEY"\s*:\s*("(?:\\.|[^"\\])*")',
        page,
    )
    if api_key_match is None:
        return _availability('error', 'youtube_player_api_key_missing')
    try:
        api_key = json.loads(api_key_match.group(1))
    except (TypeError, json.JSONDecodeError):
        return _availability('error', 'youtube_player_api_key_malformed')
    if not isinstance(api_key, str) or not api_key:
        return _availability('error', 'youtube_player_api_key_malformed')

    player_request = urllib.request.Request(
        'https://www.youtube.com/youtubei/v1/player?'
        + urllib.parse.urlencode({'key': api_key, 'prettyPrint': 'false'}),
        data=json.dumps(
            {
                'context': {
                    'client': {
                        'clientName': 'ANDROID',
                        'clientVersion': YOUTUBE_ANDROID_CLIENT_VERSION,
                        'hl': 'en',
                        'gl': 'US',
                    },
                },
                'videoId': video_id,
            }
        ).encode('utf-8'),
        headers={
            **request_headers,
            'Content-Type': 'application/json',
            'Referer': embed_url,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(player_request, timeout=15) as response:
            if response.status != 200:
                return _availability('error', f'youtube_player_http_{response.status}')
            player_response = json.loads(
                response.read(4 * 1024 * 1024).decode('utf-8', errors='strict')
            )
    except urllib.error.HTTPError as error:
        return _classify_http_error('youtube_player', error)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        log.warning('Anonymous player verification unknown for %s: %s', video_id, error)
        return _availability('error', 'youtube_player_network_or_parse_error')

    if not isinstance(player_response, dict):
        return _availability('error', 'youtube_player_payload_malformed')
    player_status = player_response.get('playabilityStatus')
    player_details = player_response.get('videoDetails')
    streaming_data = player_response.get('streamingData')
    if not isinstance(player_status, dict):
        return _availability('error', 'youtube_player_public_proof_incomplete')
    player_detail = ' '.join(
        str(player_status.get(key) or '') for key in ('reason', 'status')
    )
    explicit = _classify_youtube_restriction_detail(player_detail)
    if explicit:
        return explicit
    # Production egress can be challenged even when oEmbed and the exact
    # anonymous embed bootstrap both prove a public, crawlable, embeddable
    # identity. Preserve that as an intermediate state, never as a positive on
    # its own. The caller promotes it only when yt-dlp independently reports
    # the same specific bot challenge, or returns complete public metadata.
    if _is_youtube_bot_challenge(player_detail):
        return _availability('challenge', 'youtube_player_bot_challenge')
    if str(player_status.get('status') or '').upper() != 'OK':
        return _availability('error', 'youtube_player_unplayable_unknown')
    if player_status.get('playableInEmbed') is not True:
        return _availability('error', 'youtube_player_public_proof_incomplete')
    if (
        not isinstance(player_details, dict)
        or player_details.get('videoId') != video_id
        or player_details.get('isPrivate') is not False
    ):
        return _availability('error', 'youtube_player_identity_or_privacy_unknown')
    if any(
        player_details.get(key) is True
        for key in ('isMadeForKids', 'isKidsContent')
    ):
        return _availability('error', 'youtube_made_for_kids')
    if not isinstance(streaming_data, dict) or not any(
        streaming_data.get(key)
        for key in ('formats', 'adaptiveFormats', 'hlsManifestUrl', 'dashManifestUrl')
    ):
        return _availability('error', 'youtube_player_stream_proof_missing')
    return _availability('verified')


def verify_youtube_video_scrapling(video_id):
    """Fail-closed YouTube verification (legacy function name retained).

    oEmbed proves public metadata is available. The anonymous YouTube embed
    bootstrap must prove the exact requested identity and public embedded
    playback. yt-dlp remains an independent restriction source; an explicit
    private, subscription, age, region, or embed-disabled verdict overrides a
    positive preview. A recognised anti-bot challenge may be rescued only by
    the oEmbed plus exact anonymous-player proof. Every other unknown fails
    closed without being mis-recorded as a permanent restriction.
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

    oembed_public = False
    oembed_failure = None
    try:
        request = urllib.request.Request(oembed_url, headers=request_headers)
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status != 200:
                return _availability('error', f'oembed_http_{response.status}')
            metadata = json.loads(response.read(256 * 1024).decode('utf-8'))
            if not isinstance(metadata, dict):
                return _availability('error', 'oembed_payload_malformed')
            if not metadata.get('title') or not metadata.get('author_name'):
                return _availability('error', 'oembed_missing_metadata')
            oembed_public = True
    except urllib.error.HTTPError as error:
        oembed_failure = _classify_http_error('oembed', error)
        # YouTube returns an otherwise-unspecific 403 for some private videos.
        # Continue only for that status so the anonymous embed and yt-dlp can
        # independently agree on an explicit permanent restriction. A public
        # result still requires the oEmbed metadata proof above.
        if error.code != 403:
            return oembed_failure
    except (OSError, ValueError, json.JSONDecodeError) as error:
        log.warning('oEmbed verification unknown for %s: %s', video_id, error)
        return _availability('error', 'oembed_network_or_parse_error')

    embed_verdict = _anonymous_embed_verdict(video_id, request_headers)

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
    except subprocess.TimeoutExpired as error:
        log.warning('yt-dlp verification unknown for %s: %s', video_id, error)
        # TimeoutExpired preserves any output captured before termination. A
        # production bot challenge may therefore be complete and independently
        # corroborated even though yt-dlp did not exit. Apply the same ordered
        # restriction-first adjudication as a nonzero exit; a generic timeout
        # remains operational UNKNOWN and can never inherit the embed positive.
        detail = _combined_process_output(error.stdout, error.stderr)
        adjudicated = _adjudicate_failed_ytdlp(
            detail,
            embed_verdict,
            'yt_dlp_timeout',
            allow_embed_fallback=oembed_public,
            allow_challenge_rescue=oembed_public,
        )
        if not oembed_public and adjudicated['status'] not in PERMANENT_FAILURE_STATUSES:
            return oembed_failure
        return adjudicated
    except OSError as error:
        log.warning('yt-dlp verification unknown for %s: %s', video_id, error)
        return _availability('error', 'yt_dlp_execution_error')

    if completed.returncode != 0:
        # yt-dlp can split the content verdict and the egress challenge across
        # stdout and stderr. Inspect both so a bot challenge can never hide an
        # explicit private/member/age/region/embed-disabled/removal signal.
        detail = _combined_process_output(completed.stdout, completed.stderr)
        adjudicated = _adjudicate_failed_ytdlp(
            detail,
            embed_verdict,
            'yt_dlp_nonzero',
            allow_embed_fallback=oembed_public,
            allow_challenge_rescue=oembed_public,
        )
        if (
            not oembed_public
            and adjudicated['status'] not in PERMANENT_FAILURE_STATUSES
            and adjudicated.get('reason') not in EXPECTED_TRANSIENT_REASONS
        ):
            return oembed_failure
        return adjudicated

    try:
        metadata = json.loads(completed.stdout)
    except (TypeError, json.JSONDecodeError):
        return _availability('error', 'yt_dlp_invalid_json')
    if not isinstance(metadata, dict):
        return _availability('error', 'yt_dlp_payload_malformed')
    if metadata.get('id') != video_id:
        return _availability('error', 'youtube_ytdlp_identity_mismatch')

    availability = str(metadata.get('availability') or '').lower()
    if availability == 'private':
        if embed_verdict['status'] == 'private':
            return _availability('private', 'youtube_private')
        return _availability('error', 'youtube_restriction_signal_conflict')
    if availability in ('premium_only', 'subscriber_only'):
        if embed_verdict['status'] == 'restricted':
            return _availability('restricted', f'youtube_{availability}')
        return _availability('error', 'youtube_restriction_signal_conflict')
    if availability == 'needs_auth':
        if embed_verdict['available'] and oembed_public:
            return embed_verdict
        if embed_verdict['status'] in PERMANENT_FAILURE_STATUSES:
            return embed_verdict
        return _availability('error', 'youtube_availability_needs_auth')
    if availability not in ('public', 'unlisted'):
        return _availability('error', 'youtube_availability_unknown')
    age_limit = metadata.get('age_limit')
    if type(age_limit) not in (int, float):
        return _availability('error', 'youtube_age_limit_unknown')
    if age_limit > 0:
        return _availability('restricted', 'youtube_age_restricted')
    if age_limit != 0:
        return _availability('error', 'youtube_age_limit_unknown')
    playable_in_embed = metadata.get('playable_in_embed')
    if playable_in_embed is False:
        return _availability('embed_disabled', 'youtube_embed_disabled')
    if playable_in_embed is not True:
        return _availability('error', 'youtube_embed_playability_unknown')
    live_status = metadata.get('live_status')
    if live_status == 'is_upcoming':
        return _availability('error', 'youtube_upcoming')
    if live_status not in ('not_live', 'is_live', 'was_live', 'post_live'):
        return _availability('error', 'youtube_live_status_unknown')
    if not oembed_public:
        return oembed_failure
    if embed_verdict['status'] == 'challenge':
        return _availability('verified')
    return embed_verdict


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


def _in_verifier_incident_window(value):
    checked = _parse_timestamp(value)
    return bool(
        checked
        and VERIFIER_INCIDENT_START <= checked <= VERIFIER_INCIDENT_END
    )


def _in_cancelled_recovery_window(value):
    checked = _parse_timestamp(value)
    return bool(
        checked
        and CANCELLED_RECOVERY_START <= checked <= CANCELLED_RECOVERY_END
    )


def _release_recovery_was_attempted(row):
    return str((row or {}).get('surface') or '').startswith(
        RELEASE_RECOVERY_SURFACE_PREFIX
    )


def _catalog_release_recovery_eligible(row):
    """Select only the two proven poisoned windows for the current generation."""
    if _in_verifier_incident_window(row.get('availability_checked_at')):
        return True
    return (
        str(row.get('availability_status') or '').lower() == 'error'
        and _in_cancelled_recovery_window(row.get('availability_checked_at'))
    )


def _failure_release_recovery_eligible(row):
    """Allow one v2 attempt; never bypass a confirmed v1 restriction."""
    if not row or _release_recovery_was_attempted(row):
        return False
    last_seen = _parse_timestamp(row.get('last_seen_at'))
    if _in_verifier_incident_window(row.get('last_verified_at')):
        # A report received after the poisoned operation is newer authority.
        # Let the normal pending-report lane adjudicate it instead of replaying
        # this generation from the old verifier timestamp/surface.
        return not last_seen or last_seen <= VERIFIER_INCIDENT_END
    return (
        str(row.get('verification_status') or '').lower() == 'error'
        and _in_cancelled_recovery_window(row.get('last_verified_at'))
        and (not last_seen or last_seen <= CANCELLED_RECOVERY_END)
    )


def _attempt_outcome(availability, verdict=None):
    """Describe this attempt, never a preserved older database verdict."""
    if availability.get('available'):
        if verdict is None or (
            verdict.get('verification_status') == 'resolved'
            and verdict.get('resolved') is True
        ):
            return 'verified'
        return 'unknown'
    if availability.get('status') in PERMANENT_FAILURE_STATUSES:
        if verdict is None or (
            verdict.get('verification_status') == 'confirmed'
            and verdict.get('resolved') is False
        ):
            return 'rejected'
    return 'unknown'


def _candidate_plan(
    row,
    current,
    caption_matches,
    now,
    force_audit,
    release_recovery=False,
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
    if release_recovery and _catalog_release_recovery_eligible(row):
        return (
            0,
            checked_sort,
            str(row.get('id') or ''),
            'verifier_incident_recovery',
        )
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


def _failure_candidate_plan(row, now, force_audit, release_recovery=False):
    """Prioritize fresh reports and cool down already-adjudicated failures."""
    status = str(row.get('verification_status') or 'pending').lower()
    last_seen = _parse_timestamp(row.get('last_seen_at'))
    last_verified = _parse_timestamp(row.get('last_verified_at'))
    stable_id = str(row.get('video_id') or '')
    oldest_seen = last_seen.timestamp() if last_seen else 0
    oldest_verified = last_verified.timestamp() if last_verified else 0
    if force_audit:
        return (0, oldest_verified, stable_id, 'forced_failure_audit')
    if (
        release_recovery
        and _failure_release_recovery_eligible(row)
    ):
        return (0, oldest_verified, stable_id, 'verifier_incident_recovery')
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


def _select_supply_candidates(catalog_plans, platform_plans, limit):
    """Bound one run while reserving renewal capacity for every supply family."""
    if limit is None:
        return list(catalog_plans), list(platform_plans)

    # A 750-row daily run reserves 400/175/175. Each current pool therefore
    # completes inside six runs, leaving one full-day margin before the
    # seven-day public gate instead of depending on a perfect seventh run.
    catalog_quota = max(1, (limit * 8) // 15)
    platform_quota = max(0, limit - catalog_quota)
    poker_quota = (platform_quota + 1) // 2
    sports_quota = platform_quota // 2

    poker = [
        item for item in platform_plans if item[1].get('platform_source') == 'poker'
    ]
    sports = [
        item for item in platform_plans if item[1].get('platform_source') == 'sports'
    ]
    selected_catalog = list(catalog_plans[:catalog_quota])
    selected_platform = list(poker[:poker_quota]) + list(sports[:sports_quota])

    selected_ids = {
        ('catalog', str(row.get('youtube_video_id') or ''))
        for _, row in selected_catalog
    }
    selected_ids.update(
        (str(row.get('platform_source') or ''), str(row.get('youtube_video_id') or ''))
        for _, row in selected_platform
    )
    leftovers = []
    leftovers.extend(
        (plan, row)
        for plan, row in catalog_plans
        if ('catalog', str(row.get('youtube_video_id') or '')) not in selected_ids
    )
    leftovers.extend(
        (plan, row)
        for plan, row in platform_plans
        if (
            str(row.get('platform_source') or ''),
            str(row.get('youtube_video_id') or ''),
        ) not in selected_ids
    )
    leftovers.sort(
        key=lambda item: (
            item[0][:3],
            0 if item[1].get('platform_source') == 'poker' else 1,
        )
    )
    remaining = max(0, limit - len(selected_catalog) - len(selected_platform))
    for item in leftovers[:remaining]:
        if item[1].get('platform_source'):
            selected_platform.append(item)
        else:
            selected_catalog.append(item)
    selected_catalog.sort(key=lambda item: item[0][:3])
    selected_platform.sort(
        key=lambda item: (
            0 if item[1].get('platform_source') == 'poker' else 1,
            item[0][:3],
        )
    )
    return selected_catalog, selected_platform


def _interleave_supply_candidates(catalog_rows, platform_rows):
    """Round-robin all three lanes so a deadline cannot starve one source."""
    lanes = [
        ('catalog', list(catalog_rows)),
        ('poker', [row for row in platform_rows if row.get('platform_source') == 'poker']),
        ('sports', [row for row in platform_rows if row.get('platform_source') == 'sports']),
    ]
    positions = [0, 0, 0]
    ordered = []
    while True:
        advanced = False
        for index, (lane, rows) in enumerate(lanes):
            if positions[index] >= len(rows):
                continue
            ordered.append((lane, rows[positions[index]]))
            positions[index] += 1
            advanced = True
        if not advanced:
            return ordered


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


def _youtube_id_from_url(value):
    try:
        parsed = urllib.parse.urlparse(str(value or '').strip())
    except ValueError:
        return None
    host = (parsed.hostname or '').lower().rstrip('.')
    path_parts = [part for part in parsed.path.split('/') if part]
    candidate = None
    if host == 'youtu.be':
        candidate = path_parts[0] if path_parts else None
    elif host == 'youtube.com' or host.endswith('.youtube.com'):
        if parsed.path.rstrip('/') == '/watch':
            candidate = urllib.parse.parse_qs(parsed.query).get('v', [None])[0]
        elif len(path_parts) >= 2 and path_parts[0] in ('shorts', 'embed', 'live'):
            candidate = path_parts[1]
    candidate = str(candidate or '')
    return candidate if YOUTUBE_ID_RE.fullmatch(candidate) else None


def _load_platform_supply_rows(exclude_video_ids=None):
    """Load the exact bounded platform pools consumed by the Workers fleet."""
    seen = {
        str(video_id)
        for video_id in (exclude_video_ids or ())
        if YOUTUBE_ID_RE.fullmatch(str(video_id or ''))
    }
    supply_rows = []
    specifications = (
        (
            'poker',
            'poker_clips',
            {'is_active': 'eq.true', 'oembed_ok': 'not.is.false'},
            'published_at.desc.nullslast',
        ),
        ('sports', 'sports_clips', {}, 'created_at.desc.nullslast'),
    )
    for platform_source, table, filters, order in specifications:
        rows = _select_page(
            table,
            'video_id,source_url',
            filters,
            order,
            PLATFORM_POOL_LIMIT,
            0,
        )
        for row in rows:
            video_id = str(row.get('video_id') or '')
            source_url = str(row.get('source_url') or '')
            if (
                not YOUTUBE_ID_RE.fullmatch(video_id)
                or _youtube_id_from_url(source_url) != video_id
                or video_id in seen
            ):
                continue
            seen.add(video_id)
            supply_rows.append(
                {
                    'youtube_video_id': video_id,
                    'source_url': source_url,
                    'platform_source': platform_source,
                }
            )
    return supply_rows


def _catalog_pages(source=None):
    filters = {'type': 'in.(cash,tournament,slots)'}
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


def _normalise_ops07_topic(row):
    """Return the public feed topic owned by this publisher."""
    video_type = str(row.get('type') or '').strip().lower()
    if video_type == 'slots':
        return 'slots'
    if video_type in POKER_VIDEO_TYPES:
        return 'poker'
    return 'unknown'


def _normalise_ops07_source_family(_row):
    """Return the provenance family, not an individual channel/source ID."""
    return 'video_library'


def _ops07_bucket(stats, dimension, key):
    dimension_counts = stats['ops07'][dimension]
    if key not in dimension_counts:
        dimension_counts[key] = {
            stage: 0 for stage in OPS07_LIFECYCLE_STAGES
        }
    return dimension_counts[key]


def _record_ops07(stats, stage, row, count=1):
    if stage not in OPS07_LIFECYCLE_STAGES:
        raise ValueError(f'Unknown OPS-07 lifecycle stage: {stage}')
    topic = _normalise_ops07_topic(row)
    source_family = _normalise_ops07_source_family(row)
    _ops07_bucket(stats, 'by_topic', topic)[stage] += count
    _ops07_bucket(stats, 'by_source_family', source_family)[stage] += count


def _catalog_row_is_stale(row, now=None):
    checked_at = _parse_timestamp(row.get('availability_checked_at'))
    if checked_at is None:
        return False
    reference = now or datetime.now(timezone.utc)
    return not (
        reference - VERIFICATION_REFRESH_AGE
        <= checked_at
        <= reference + PUBLIC_VERIFICATION_MAX_FUTURE_SKEW
    )


def _public_verification_is_fresh(row, now=None):
    if row.get('availability_status') != 'verified' or row.get('embeddable') is not True:
        return False
    checked_at = _parse_timestamp(row.get('availability_checked_at'))
    if checked_at is None:
        return False
    reference = now or datetime.now(timezone.utc)
    return (
        reference - PUBLIC_VERIFICATION_MAX_AGE
        <= checked_at
        <= reference + PUBLIC_VERIFICATION_MAX_FUTURE_SKEW
    )


def _select_by_values(table, select, column, values, value_pattern, extra_filters=None):
    unique_values = list(dict.fromkeys(str(value or '') for value in values if value))
    rows = []
    for start in range(0, len(unique_values), FEED_VISIBILITY_BATCH_SIZE):
        batch = unique_values[start:start + FEED_VISIBILITY_BATCH_SIZE]
        if any(not value_pattern.fullmatch(value) for value in batch):
            raise RuntimeError(f'Invalid {table}.{column} identity in feed visibility proof')
        result = _request(
            'GET',
            table,
            params={
                'select': select,
                column: f'in.({",".join(batch)})',
                'limit': len(batch),
                **(extra_filters or {}),
            },
        )
        if not isinstance(result, list):
            raise RuntimeError(f'Could not prove feed visibility from {table}')
        rows.extend(result)
    return rows


def _feed_visible_asset_ids(publications):
    """Read back the exact public feed contract for successful RPC results.

    A successful publication RPC is not evidence that its Reel can be served.
    This bounded readback validates the live asset, Reel, and source post plus
    the absence of a confirmed embed failure. Any unreadable relation raises;
    a readable contract mismatch is returned as a non-visible asset ID.
    """
    if not publications:
        return set()

    asset_ids = [item['row']['id'] for item in publications]
    reel_ids = [item['publication']['social_reel_id'] for item in publications]
    post_ids = [item['publication']['social_post_id'] for item in publications]
    video_ids = [item['row']['youtube_video_id'] for item in publications]

    assets = _select_by_values(
        'video_library_videos',
        'id,youtube_video_id,type,availability_status,embeddable,availability_checked_at',
        'id',
        asset_ids,
        _UUID_RE,
    )
    reels = _select_by_values(
        'social_reels',
        'id,author_id,source_post_id,is_public,is_deleted,source_type,youtube_video_id,'
        'video_url,original_youtube_url,media_status,origin_type,playback_type,topic,'
        'rights_status,source_asset_id,'
        'canonical_asset_key,publication_key,native_processing_requested',
        'id',
        reel_ids,
        _UUID_RE,
    )
    posts = _select_by_values(
        'social_posts',
        'id,author_id,content_type,visibility,audience_mode,is_deleted,origin_type,'
        'playback_type,topic,rights_status,source_asset_id,youtube_video_id,'
        'canonical_asset_key,publication_key',
        'id',
        post_ids,
        _UUID_RE,
    )
    active_failures = _select_by_values(
        'youtube_embed_failures',
        'video_id',
        'video_id',
        video_ids,
        YOUTUBE_ID_RE,
        {'verification_status': 'eq.confirmed', 'resolved': 'eq.false'},
    )

    asset_by_id = {str(row.get('id') or ''): row for row in assets}
    reel_by_id = {str(row.get('id') or ''): row for row in reels}
    post_by_id = {str(row.get('id') or ''): row for row in posts}
    failed_video_ids = {
        str(row.get('video_id') or '') for row in active_failures
    }
    visible_asset_ids = set()
    now = datetime.now(timezone.utc)

    for item in publications:
        row = item['row']
        publication = item['publication']
        author_id = item['author_id']
        asset_id = str(row.get('id') or '')
        video_id = str(row.get('youtube_video_id') or '')
        post_id = str(publication.get('social_post_id') or '')
        reel_id = str(publication.get('social_reel_id') or '')
        topic = _normalise_ops07_topic(row)
        canonical_key = f'youtube:{video_id}'
        publication_key = f'video-library:{asset_id}'
        video_url = f'https://www.youtube.com/watch?v={video_id}'
        asset = asset_by_id.get(asset_id)
        reel = reel_by_id.get(reel_id)
        post = post_by_id.get(post_id)

        asset_visible = bool(
            asset
            and str(asset.get('youtube_video_id') or '') == video_id
            and str(asset.get('type') or '').lower() == str(row.get('type') or '').lower()
            and _public_verification_is_fresh(asset, now)
            and video_id not in failed_video_ids
        )
        reel_visible = bool(
            reel
            and reel.get('author_id') == author_id
            and reel.get('source_post_id') == post_id
            and reel.get('is_public') is True
            and reel.get('is_deleted') is False
            and reel.get('source_type') == 'video_library'
            and reel.get('youtube_video_id') == video_id
            and reel.get('video_url') == video_url
            and reel.get('original_youtube_url') == video_url
            and reel.get('media_status') == 'ready'
            and reel.get('origin_type') == 'video_library'
            and reel.get('playback_type') == 'youtube_embed'
            and reel.get('topic') == topic
            and reel.get('rights_status') == 'embed_only'
            and reel.get('source_asset_id') == asset_id
            and reel.get('canonical_asset_key') == canonical_key
            and reel.get('publication_key') == publication_key
            and reel.get('native_processing_requested') is False
        )
        post_visible = bool(
            post
            and post.get('author_id') == author_id
            and post.get('content_type') == 'video'
            and post.get('visibility') == 'public'
            and post.get('audience_mode') == 'public'
            and post.get('is_deleted') is False
            and post.get('origin_type') == 'video_library'
            and post.get('playback_type') == 'youtube_embed'
            and post.get('topic') == topic
            and post.get('rights_status') == 'embed_only'
            and post.get('source_asset_id') == asset_id
            and post.get('youtube_video_id') == video_id
            and post.get('canonical_asset_key') == canonical_key
            and post.get('publication_key') == publication_key
        )
        if asset_visible and reel_visible and post_visible:
            visible_asset_ids.add(asset_id)

    return visible_asset_ids


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
        'expected_transient_verifier_results': 0,
        'verified': 0,
        'created': 0,
        'repaired_or_updated': 0,
        'would_publish': 0,
        'rejected': 0,
        'unknown': 0,
        'invalid_rows': 0,
        'platform_rows_loaded': 0,
        'platform_candidate_pool': 0,
        'platform_candidates': 0,
        'platform_deferred_by_limit': 0,
        'platform_cooldown': 0,
        'platform_verification_attempted': 0,
        'platform_verified': 0,
        'platform_rejected': 0,
        'platform_unknown': 0,
        'release_recovery_candidates': 0,
        'release_recovery_resolved': 0,
        'release_recovery_rejected': 0,
        'release_recovery_unknown': 0,
        'release_recovery_race_deferred': 0,
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
        'feed_visibility_checked': 0,
        'feed_visibility_failures': 0,
        'failure_verdict_errors': 0,
        'rpc_errors': 0,
        'checkpoint_writes': 0,
        'checkpoint_write_errors': 0,
        'deadline_reached': False,
        'deadline_phase': None,
        'catalog_scan_complete': False,
        'aborted_reason': None,
        'publication_controls': None,
        'verification_concurrency': VERIFY_CONCURRENCY,
        'candidate_reasons': Counter(),
        'failure_candidate_reasons': Counter(),
        'failure_verification_outcomes': Counter(),
        'verification_outcomes': Counter(),
        'platform_candidate_reasons': Counter(),
        'platform_verification_outcomes': Counter(),
        'platform_by_source': {
            source: {
                'candidate': 0,
                'attempted': 0,
                'verified': 0,
                'rejected': 0,
                'unknown': 0,
            }
            for source in ('poker', 'sports')
        },
        'ops07': {
            'by_topic': {},
            'by_source_family': {},
        },
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
        'release_recovery': bool(getattr(args, 'release_recovery', False)),
        'verify_platform_supply': bool(
            getattr(args, 'verify_platform_supply', False)
            or getattr(args, 'release_recovery', False)
        ),
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

    # Publisher identity, then the dedicated kill switch, both before any
    # YouTube probe or database write in every mode (dry runs and caption
    # sync included). An unsafe or unreadable publisher and unreadable
    # controls raise and exit non-zero; readable controls that are off are
    # a deliberate, logged no-op.
    author_id = get_system_bot_id()
    controls = read_publication_controls()
    stats['publication_controls'] = dict(sorted(controls.items()))
    if not all(controls[key] is True for key in REQUIRED_PUBLICATION_CONTROLS):
        stats['aborted_reason'] = 'publication_controls_disabled'
        log.warning(
            'Video-library Reel publication is switched off in '
            'video_reels_pipeline_controls (%s). Exiting without probing or writing.',
            ', '.join(f'{key}={controls[key]}' for key in sorted(controls)),
        )
        _write_checkpoint(args, stats, 'disabled')
        return stats
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
    release_recovery = bool(getattr(args, 'release_recovery', False))
    verify_platform_supply = bool(
        getattr(args, 'verify_platform_supply', False) or release_recovery
    )
    stats['failure_reports_loaded'] = len(failure_rows)
    stats['pending_embed_reports'] = sum(
        1 for row in failure_rows if row.get('verification_status') == 'pending'
    )
    active_confirmed_ids = {
        str(row['video_id'])
        for row in failure_rows
        if row.get('verification_status') == 'confirmed' and row.get('resolved') is False
    }
    failure_by_video_id = {}
    failure_plans = []
    for failure_row in failure_rows:
        video_id = str(failure_row.get('video_id') or '')
        if video_id:
            failure_by_video_id.setdefault(video_id, failure_row)
        plan = _failure_candidate_plan(
            failure_row,
            datetime.now(timezone.utc),
            force_audit,
            release_recovery,
        )
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
    planned_platform_candidates = []
    catalog_by_video_id = {}
    feed_visibility_publications = []
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
            if video_type not in VIDEO_LIBRARY_REEL_TYPES:
                stats['invalid_rows'] += 1
                continue
            stats['eligible_rows'] += 1
            catalog_by_video_id[vid_id] = row
            if _catalog_row_is_stale(row, freshness_now):
                _record_ops07(stats, 'stale', row)

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
                release_recovery
                and (
                    failure_by_video_id.get(vid_id) is None
                    or _failure_release_recovery_eligible(
                        failure_by_video_id.get(vid_id)
                    )
                ),
            )
            if plan == 'already_current':
                if vid_id in active_confirmed_ids:
                    stats['confirmed_blocked_current'] += 1
                else:
                    stats['already_current'] += 1
                    _record_ops07(stats, 'verified', row)
                    _record_ops07(stats, 'published', row)
                    if not args.dry_run:
                        feed_visibility_publications.append({
                            'row': row,
                            'publication': {
                                'social_post_id': current['source_post_id'],
                                'social_reel_id': current['id'],
                                'was_created': False,
                            },
                            'author_id': author_id,
                        })
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

    if verify_platform_supply and not args.source and not args.sync_captions:
        platform_rows = _load_platform_supply_rows(set(catalog_by_video_id))
        stats['platform_rows_loaded'] = len(platform_rows)
        for position, row in enumerate(platform_rows):
            video_id = str(row.get('youtube_video_id') or '')
            # The loader receives this same exclusion set, but enforce the
            # invariant here as well so a stale/alternate loader cannot cause
            # one ID to be verified and written twice in a single operation.
            if video_id in catalog_by_video_id:
                continue
            failure_row = failure_by_video_id.get(video_id)
            if failure_row is None:
                plan = (0, position, video_id, 'missing_platform_verdict')
            else:
                plan = _failure_candidate_plan(
                    failure_row,
                    freshness_now,
                    force_audit,
                    release_recovery,
                )
            if plan in ('permanent_cooldown', 'transient_cooldown') or plan is None:
                stats['platform_cooldown'] += 1
                continue
            planned_platform_candidates.append((plan, row))
        planned_platform_candidates.sort(
            key=lambda item: (
                0 if item[1].get('platform_source') == 'poker' else 1,
                item[0][:3],
            )
        )

    stats['platform_candidate_pool'] = len(planned_platform_candidates)
    selected_catalog_plans, selected_platform_plans = _select_supply_candidates(
        planned_candidates,
        planned_platform_candidates,
        max_candidates,
    )
    stats['deferred_by_limit'] = max(
        0,
        len(planned_candidates) - len(selected_catalog_plans),
    )
    stats['platform_deferred_by_limit'] = max(
        0,
        len(planned_platform_candidates) - len(selected_platform_plans),
    )
    planned_candidates = selected_catalog_plans
    candidates = [row for _, row in planned_candidates]
    platform_candidates = [row for _, row in selected_platform_plans]
    stats['candidates'] = len(candidates)
    stats['platform_candidates'] = len(platform_candidates)
    stats['candidate_reasons'].update(plan[3] for plan, _ in planned_candidates)
    stats['platform_candidate_reasons'].update(
        plan[3] for plan, _ in selected_platform_plans
    )
    for _, row in selected_platform_plans:
        stats['platform_by_source'][row['platform_source']]['candidate'] += 1
    for row in candidates:
        _record_ops07(stats, 'candidate', row)
    release_recovery_ids = {
        str(row.get('youtube_video_id') or row.get('video_id') or '')
        for plan, row in (
            planned_candidates
            + selected_platform_plans
            + selected_failure_plans
        )
        if plan[3] == 'verifier_incident_recovery'
    }
    stats['release_recovery_candidates'] = len(release_recovery_ids)
    _write_checkpoint(
        args,
        stats,
        'planned',
        {
            'catalog_candidates': len(candidates),
            'platform_candidates': len(platform_candidates),
            'failure_candidates': len(selected_failure_plans),
        },
    )

    supply_work = _interleave_supply_candidates(candidates, platform_candidates)
    if supply_work:
        log.info(
            'Verifying %s interleaved catalog/poker/sports candidates with concurrency=%s',
            len(supply_work),
            min(VERIFY_CONCURRENCY, len(supply_work)),
        )
    abort = False
    verification_cache = {}
    last_supply_commit = {}
    with ThreadPoolExecutor(max_workers=VERIFY_CONCURRENCY) as executor:
        for start in range(0, len(supply_work), VERIFY_CONCURRENCY):
            if _deadline_due(deadline_at, VERIFY_BATCH_START_RESERVE_SECONDS):
                _mark_deadline(stats, 'supply_verification')
                _write_checkpoint(args, stats, 'deadline', last_supply_commit)
                abort = True
                break
            batch = supply_work[start:start + VERIFY_CONCURRENCY]
            verified_results = executor.map(_verify_row, [row for _, row in batch])
            for (lane, row), availability in zip(batch, verified_results):
                video_id = str(row.get('youtube_video_id') or '')
                is_catalog = lane == 'catalog'
                if is_catalog:
                    stats['verification_attempted'] += 1
                    stats['verification_outcomes'][availability['status']] += 1
                else:
                    source_stats = stats['platform_by_source'][lane]
                    stats['platform_verification_attempted'] += 1
                    source_stats['attempted'] += 1
                    stats['platform_verification_outcomes'][availability['status']] += 1
                if _is_operational_verifier_error(availability):
                    stats['verifier_errors_observed'] += 1
                elif _is_expected_transient_verifier_result(availability):
                    stats['expected_transient_verifier_results'] += 1

                verdict = None
                if not args.dry_run:
                    if _deadline_due(deadline_at):
                        _mark_deadline(stats, 'supply_verdict')
                        abort = True
                        break
                    if video_id in release_recovery_ids:
                        surface = f'{RELEASE_RECOVERY_SURFACE_PREFIX}{lane}'
                    elif is_catalog:
                        surface = 'video_library_verifier'
                    else:
                        surface = f'horse_{lane}_supply_verifier'
                    try:
                        verdict = _record_embed_verdict(
                            video_id,
                            availability,
                            surface=surface,
                        )
                    except RuntimeError as error:
                        stats['failure_verdict_errors'] += 1
                        stats['aborted_reason'] = 'failure_verdict_failed'
                        log.error('Supply verdict failed for %s: %s', video_id, error)
                        abort = True
                        break

                verification_cache[video_id] = {
                    'availability': availability,
                    'verdict': verdict,
                }
                last_supply_commit = {
                    'asset_id': str(row.get('id') or '') if is_catalog else None,
                    'video_id': video_id,
                    'lane': lane,
                }
                outcome = _attempt_outcome(availability, verdict)

                if not is_catalog:
                    if outcome == 'verified':
                        stats['platform_verified'] += 1
                        source_stats['verified'] += 1
                    elif outcome == 'rejected':
                        stats['platform_rejected'] += 1
                        source_stats['rejected'] += 1
                    else:
                        stats['platform_unknown'] += 1
                        source_stats['unknown'] += 1
                        if verdict and verdict['verification_status'] == 'pending':
                            stats['failure_race_deferred'] += 1
                    continue

                if outcome == 'verified':
                    stats['verified'] += 1
                    _record_ops07(stats, 'verified', row)
                    if args.dry_run:
                        stats['would_publish'] += 1
                        continue
                elif outcome == 'rejected':
                    stats['rejected'] += 1
                    _record_ops07(stats, 'rejected', row)
                    log.warning(
                        'Rejected %s (%s): %s',
                        video_id,
                        availability['status'],
                        availability.get('reason'),
                    )
                    continue
                else:
                    stats['unknown'] += 1
                    if verdict and verdict['verification_status'] == 'pending':
                        stats['failure_race_deferred'] += 1
                    log.warning(
                        'Deferred %s (%s): %s',
                        video_id,
                        availability['status'],
                        availability.get('reason')
                        or 'authoritative verdict did not accept this attempt',
                    )
                    continue

                # The verdict RPC owns both youtube_embed_failures and every
                # matching catalog availability row in one transaction. Only
                # the accepted current attempt can proceed to publication.
                if _deadline_due(deadline_at):
                    stats['publication_deferred_deadline'] += 1
                    _mark_deadline(stats, 'catalog_publication')
                    abort = True
                    break
                try:
                    publication = _publish_row(row, author_id)
                    _record_ops07(stats, 'published', row)
                    feed_visibility_publications.append({
                        'row': row,
                        'publication': publication,
                        'author_id': author_id,
                    })
                    if publication['was_created']:
                        stats['created'] += 1
                    else:
                        stats['repaired_or_updated'] += 1
                except RuntimeError as error:
                    stats['rpc_errors'] += 1
                    log.error('Publication failed for %s: %s', video_id, error)
                time.sleep(0.15)
            _write_checkpoint(
                args,
                stats,
                'supply_batch',
                {
                    **last_supply_commit,
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
                cached_video_id = str(failure_row.get('video_id') or '')
                cached = verification_cache.get(cached_video_id)
                if cached and (
                    args.dry_run
                    or (cached.get('verdict') or {}).get('verification_status') != 'pending'
                    or cached_video_id in release_recovery_ids
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
                        or vid_id in release_recovery_ids
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
                                surface=(
                                    f'{RELEASE_RECOVERY_SURFACE_PREFIX}failure'
                                    if vid_id in release_recovery_ids
                                    else 'embed_failure_verifier'
                                ),
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
                elif (
                    not can_reuse
                    and _is_expected_transient_verifier_result(availability)
                ):
                    stats['expected_transient_verifier_results'] += 1

                outcome = _attempt_outcome(availability, verdict)
                if args.dry_run:
                    last_failure_commit = {'video_id': vid_id}
                    if outcome == 'verified':
                        stats['failure_resolved'] += 1
                    elif outcome == 'rejected':
                        stats['failure_confirmed'] += 1
                    else:
                        stats['failure_transient'] += 1
                    continue

                verdict_status = verdict['verification_status']
                if outcome == 'verified':
                    stats['failure_resolved'] += 1
                elif outcome == 'rejected':
                    stats['failure_confirmed'] += 1
                elif verdict_status == 'pending':
                    if not can_reuse:
                        stats['failure_race_deferred'] += 1
                else:
                    stats['failure_transient'] += 1

                catalog_row = catalog_by_video_id.get(vid_id)
                if catalog_row and not can_reuse:
                    # A newer report may have landed while the primary library
                    # verification was in flight. When the immediate race-safe
                    # retry resolves that report, finish the already-selected
                    # catalog candidate now instead of waiting another day.
                    selected_for_catalog = (
                        str(catalog_row.get('id') or '') in selected_candidate_asset_ids
                    )
                    if (
                        selected_for_catalog
                        and outcome == 'rejected'
                    ):
                        stats['rejected'] += 1
                        _record_ops07(stats, 'rejected', catalog_row)
                    if (
                        selected_for_catalog
                        and outcome == 'verified'
                    ):
                        if _deadline_due(deadline_at):
                            stats['publication_deferred_deadline'] += 1
                            _mark_deadline(stats, 'failure_race_publication')
                            failure_queue_abort = True
                            break
                        stats['failure_race_recovered'] += 1
                        stats['verified'] += 1
                        _record_ops07(stats, 'verified', catalog_row)
                        try:
                            publication = _publish_row(catalog_row, author_id)
                            _record_ops07(stats, 'published', catalog_row)
                            feed_visibility_publications.append({
                                'row': catalog_row,
                                'publication': publication,
                                'author_id': author_id,
                            })
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

    if feed_visibility_publications:
        stats['feed_visibility_checked'] = len(feed_visibility_publications)
        try:
            visible_asset_ids = _feed_visible_asset_ids(feed_visibility_publications)
        except RuntimeError as error:
            stats['feed_visibility_failures'] = len(feed_visibility_publications)
            stats['aborted_reason'] = (
                stats['aborted_reason'] or 'feed_visibility_unproven'
            )
            log.error('Feed visibility proof failed: %s', error)
        else:
            missing_asset_ids = []
            for item in feed_visibility_publications:
                asset_id = str(item['row'].get('id') or '')
                if asset_id in visible_asset_ids:
                    _record_ops07(stats, 'feed_visible', item['row'])
                else:
                    missing_asset_ids.append(asset_id)
            stats['feed_visibility_failures'] = len(missing_asset_ids)
            if missing_asset_ids:
                stats['aborted_reason'] = (
                    stats['aborted_reason'] or 'feed_visibility_unproven'
                )
                log.error(
                    'Published Reel feed visibility is unproven for %s asset(s): %s',
                    len(missing_asset_ids),
                    ', '.join(missing_asset_ids[:20]),
                )

    for video_id in release_recovery_ids:
        cached = verification_cache.get(video_id)
        if not cached:
            stats['release_recovery_unknown'] += 1
            continue
        availability = cached['availability']
        verdict = cached.get('verdict')
        outcome = _attempt_outcome(availability, verdict)
        if outcome == 'verified':
            stats['release_recovery_resolved'] += 1
        elif outcome == 'rejected':
            stats['release_recovery_rejected'] += 1
        else:
            stats['release_recovery_unknown'] += 1
            if verdict and verdict.get('verification_status') == 'pending':
                stats['release_recovery_race_deferred'] += 1

    stats['verification_outcomes'] = dict(stats['verification_outcomes'])
    stats['candidate_reasons'] = dict(stats['candidate_reasons'])
    stats['failure_candidate_reasons'] = dict(stats['failure_candidate_reasons'])
    stats['failure_verification_outcomes'] = dict(stats['failure_verification_outcomes'])
    stats['platform_candidate_reasons'] = dict(stats['platform_candidate_reasons'])
    stats['platform_verification_outcomes'] = dict(stats['platform_verification_outcomes'])
    return stats


def _expected_transient_budget_exceeded(stats):
    attempted = (
        stats['verification_attempted']
        + stats['platform_verification_attempted']
        + stats['failure_verification_attempted']
    )
    transient = stats['expected_transient_verifier_results']
    if not attempted or not transient:
        return False
    if transient >= attempted:
        return True
    budget = max(
        EXPECTED_TRANSIENT_MIN_BUDGET,
        int(attempted * EXPECTED_TRANSIENT_MAX_RATIO),
    )
    return transient > budget


def _stats_require_nonzero_exit(stats):
    return bool(
        stats['rpc_errors']
        or stats['failure_verdict_errors']
        or stats['verifier_errors_observed']
        or _expected_transient_budget_exceeded(stats)
        or stats['checkpoint_write_errors']
        or stats['deadline_reached']
        or stats['feed_visibility_failures']
    )


def _write_evidence(args, stats, elapsed, fatal_error=None, exit_code=0):
    evidence = {
        'publisher': 'video_library_to_reels_v2',
        'run_at': datetime.now(timezone.utc).isoformat(),
        'dry_run': args.dry_run,
        'source': args.source,
        'limit': args.limit,
        'force_audit': bool(getattr(args, 'audit_all', False)),
        'release_recovery': bool(getattr(args, 'release_recovery', False)),
        'verify_platform_supply': bool(
            getattr(args, 'verify_platform_supply', False)
            or getattr(args, 'release_recovery', False)
        ),
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
        '--verify-platform-supply',
        action='store_true',
        help='Renew the bounded Workers poker and sports pools in the shared verifier',
    )
    parser.add_argument(
        '--release-recovery',
        action='store_true',
        help=(
            'Reverify only rows written during the bounded 2026-09-27 verifier '
            'incident; also includes the platform supply pools'
        ),
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
        'Starting video-library publisher dry_run=%s limit=%s source=%s verification=mandatory sync_only=%s force_audit=%s release_recovery=%s platform_supply=%s max_runtime=%ss',
        args.dry_run,
        args.limit,
        args.source or 'ALL',
        args.sync_captions,
        args.audit_all,
        args.release_recovery,
        args.verify_platform_supply or args.release_recovery,
        MAX_RUNTIME_SECONDS,
    )
    try:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
        stats = run_bridge(args)
        if _stats_require_nonzero_exit(stats):
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
