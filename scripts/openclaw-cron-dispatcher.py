#!/usr/bin/env python3
"""
OpenClaw Cron Dispatcher v1.4
==============================

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓ CANONICAL SCHEDULER for all smarter.poker cron jobs.                      ▓
▓                                                                           ▓
▓ TO ADD A NEW CRON JOB:                                                    ▓
▓   1. Edit this file — add an entry to the ALL_CRONS list below.           ▓
▓   2. Commit to main.                                                      ▓
▓   3. Run: bash scripts/deploy-openclaw.sh                                  ▓
▓      (scp + systemctl restart + journalctl verify, automated)             ▓
▓                                                                           ▓
▓ DO NOT:                                                                   ▓
▓   • Add entries to vercel.json's "crons" array (CI blocks this)           ▓
▓   • Create new files in pages/api/cron/ without retiring an existing one  ▓
▓     in the same PR (CI blocks this)                                       ▓
▓   • Edit this file and forget to run deploy-openclaw.sh — repo and the    ▓
▓     live Hetzner dispatcher MUST stay in sync                             ▓
▓                                                                           ▓
▓ Full policy: CLAUDE.md section 11                                         ▓
▓ Deploy target: Hetzner VM `openclaw-dispatcher` (systemd openclaw.service)▓
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

Source of truth for scheduled jobs: the ALL_CRONS list below. As of Phase
2A.4 Wave 1 this includes the original overflow crons + 18 migrated
Vercel crons (scrapers, content gen, cleanup). Wave 2 (horses, social,
tournaments, aggregates) and Wave 3 (ledger, diamond economy, identity)
still live in vercel.json and migrate in follow-up PRs.

Two job classes:
  * HTTP jobs — fire_cron(path) → authenticated GET to BASE_URL + path.
  * SCRIPT_JOBS — subprocess.run(python3, SCRAPER_PY, ...extra_args). These
    resolve SCRAPER_PY against the Mac filesystem and are skipped on
    secondary role (see should_skip_on_secondary).

Auth: Authorization: Bearer <CRON_SECRET>
"""

import os
import sys
import time
import logging
import subprocess
import requests
from datetime import datetime
from pathlib import Path

try:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'apscheduler', 'requests'])
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger

# ─── Config ───────────────────────────────────────────────────────────────────
BASE_URL     = 'https://smarter.poker'
def _load_cron_secret():
    """Load CRON_SECRET from env or .env.local — never hardcode secrets."""
    secret = os.environ.get('CRON_SECRET')
    if secret:
        return secret
    env_file = Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / '.env.local'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith('CRON_SECRET='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return ''

CRON_SECRET  = _load_cron_secret()
LOG_DIR      = Path.home() / '.smarter-poker' / 'logs'
LOG_FILE     = LOG_DIR / 'openclaw-cron.log'
REQUEST_TIMEOUT = 120  # seconds — cron jobs can be slow

LOG_DIR.mkdir(parents=True, exist_ok=True)

# ─── PID file lock — prevents double-execution if launchd races or restart overlaps ──
import atexit
import fcntl

PID_FILE = LOG_DIR / 'openclaw-cron.pid'

def _acquire_pid_lock():
    """Bail out if another instance is already running."""
    try:
        fp = open(PID_FILE, 'w')
        fcntl.flock(fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fp.write(str(os.getpid()))
        fp.flush()
        atexit.register(lambda: PID_FILE.unlink(missing_ok=True))
        return fp  # keep file handle open to hold the lock
    except BlockingIOError:
        # Another instance holds the lock — exit silently
        import sys
        print(f"[openclaw-cron] Another instance is running (lock held). Exiting.", flush=True)
        sys.exit(0)

_pid_lock_fh = _acquire_pid_lock()



logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger('openclaw-cron')


# ─── All jobs: (path, trigger_kwargs) ─────────────────────────────────────────
# Phase 2A.4 Wave 1 (2026-04-24): renamed OVERFLOW_CRONS → ALL_CRONS and
# absorbed 18 previously-on-Vercel scrapers / content-gen / cleanup crons.
# See .memory/context/phase-2a4-wave-plan.md for the classification.
#
# Composition (35 jobs total):
#   Original overflow set (13): auto-settlement stack, license-reminders,
#     scraper-watchdog, venue-game-alerts, scraper-data-cleanup,
#     clawbot/orchestrator, venue-review-prompts, tour-schedule-scraper,
#     scrape-charity-schedules, deploy-error-poll + 4 video-library-* SCRIPT_JOBS.
#   Restored orphan (1): hard-stop.
#   Wave 1 additions (18): scrapers, content generation, cleanup jobs that
#     were in vercel.json before this PR.
ALL_CRONS = [
    # ══ ORIGINAL OVERFLOW SET (was OVERFLOW_CRONS — in dispatcher since Phase 2A.1) ══
    # path                                  cron trigger kwargs
    ('/api/cron/auto-settlement',           dict(day_of_week='mon', hour=10, minute=0)),
    ('/api/cron/auto-settlement-distribute',dict(day_of_week='mon', hour=10, minute=10)),
    ('/api/cron/license-reminders',         dict(hour=9,  minute=0)),
    ('/api/cron/union-rakeback',            dict(day_of_week='mon', hour=10, minute=20)),
    ('/api/cron/scraper-watchdog',          dict(hour='*/2', minute=0)),
    ('/api/cron/venue-game-alerts',         dict(minute=0)),          # every hour
    ('/api/cron/scraper-data-cleanup',      dict(hour=3, minute=0)),
    ('/api/clawbot/orchestrator',           dict(hour=7, minute=0)),
    ('/api/cron/venue-review-prompts',      dict(hour='*/6', minute=0)),
    ('/api/cron/tour-schedule-scraper',     dict(day='*/3', hour=4, minute=0)),
    ('/api/cron/scrape-charity-schedules',  dict(day='*/3', hour=3, minute=0)),
    ('/api/cron/deploy-error-poll',         dict(minute='*/2')),       # every 2 min — autopilot build error detector
    # ── 2026-04-24 — restored from orphan audit ──────────────────────────
    # hard-stop auto-closes commander_tables at each venue's hard_stop_time.
    # Has 1 opted-in venue (id=1996, 02:00 UTC) with 34 in_use tables at
    # audit time. Lost its schedule some time before 2026-04-24 — was in
    # neither vercel.json nor this file. Idempotent: the handler checks
    # current_time vs hard_stop_time per-venue, closes matching tables.
    # See .memory/context/cron-handler-orphans.md for full forensics.
    ('/api/cron/hard-stop',                 dict(minute='*/1')),       # every minute — enforces venue hard_stop_time
    # ── Video Library — daily fresh content from all 25 creators (SCRIPT_JOBS) ──
    ('/api/cron/video-library-scraper',     dict(hour=6, minute=0)),   # Daily 6am UTC — RSS ingest
    ('/api/cron/video-library-backfill',    dict(day_of_week='sat', hour=23, minute=0)),  # Weekly Sat 23:00 UTC — fix zero-views/fake dates
    ('/api/cron/video-library-purge',       dict(day_of_week='sun', hour=0,  minute=0)),  # Weekly Sun 00:00 UTC — delete dead videos
    ('/api/cron/video-library-views',       dict(day_of_week='fri', hour=22, minute=0)),  # Weekly Fri 22:00 UTC — refresh view counts for top 50

    # ══ WAVE 1 (2026-04-24 — migrated from vercel.json; see phase-2a4-wave-plan.md) ══
    # Scrapers (read-only ingest into Supabase, upsert on unique keys)
    ('/api/cron/scrape-sports-clips',             dict(hour=4, minute=0)),
    # /api/cron/scrape-venue-info?batch=1..5 RETIRED 2026-04-25 (Phase 2B.3
    # partial cleanup). Superseded by .github/workflows/venue-scraper.yml +
    # daily_venue_scraper.py which has been the actual scraper since
    # before this dispatcher existed. The .js handler was an unused parallel
    # implementation. Handler file deleted from pages/api/cron/ in same
    # commit. No code outside this file referenced the route.
    ('/api/cron/venue-tournaments',               dict(hour=4, minute=0)),
    ('/api/cron/refresh-venue-json',              dict(hour=5, minute=0)),   # cache refresh
    ('/api/cron/news-scraper',                    dict(hour='*/2', minute=0)),
    ('/api/cron/pokernews-videos',                dict(hour='*/3', minute=30)),
    ('/api/cron/poker-news',                      dict(hour='*/4', minute=15)),
    # Content generation (upserts daily challenge/question rows; safely re-generatable)
    ('/api/cron/trivia-daily-generator',          dict(hour=5, minute=59)),
    ('/api/cron/memory-matrix-daily-challenge',   dict(hour=6, minute=0)),
    ('/api/cron/training-daily-challenge',        dict(hour=6, minute=5)),
    ('/api/cron/daily-challenges',                dict(hour=0, minute=5)),
    ('/api/cron/content-health-check',            dict(hour=6, minute=0)),   # self-healing monitor
    # Log / state cleanup
    ('/api/cron/purge-idempotency-keys',          dict(hour=8, minute=30)),
    ('/api/cron/trivia-pvp-cleanup',              dict(hour='*/4', minute=0)),

    # ══ WAVE 2 (2026-04-24 — migrated from vercel.json; see phase-2a4-wave-plan.md) ══
    # Horses infrastructure (10 batches + 3 social/stories)
    ('/api/cron/horses-social-all',               dict(hour='*/2', minute=0)),
    ('/api/cron/horses-social-friends',           dict(hour='*/6', minute=15)),
    ('/api/cron/horses-stories',                  dict(minute='5,20,35,50')),
    ('/api/cron/horse-batch/0',                   dict(hour=0, minute=0)),
    ('/api/cron/horse-batch/1',                   dict(hour=2, minute=30)),
    ('/api/cron/horse-batch/2',                   dict(hour=5, minute=0)),
    ('/api/cron/horse-batch/3',                   dict(hour=7, minute=30)),
    ('/api/cron/horse-batch/4',                   dict(hour=10, minute=0)),
    ('/api/cron/horse-batch/5',                   dict(hour=12, minute=30)),
    ('/api/cron/horse-batch/6',                   dict(hour=15, minute=0)),
    ('/api/cron/horse-batch/7',                   dict(hour=17, minute=30)),
    ('/api/cron/horse-batch/8',                   dict(hour=20, minute=0)),
    ('/api/cron/horse-batch/9',                   dict(hour=22, minute=30)),
    # Trivia tournament lifecycle
    ('/api/cron/trivia-tournaments',              dict(hour=1, minute=0)),
    ('/api/cron/trivia-tournament-rounds',        dict(minute=0)),           # hourly round advance
    # User-facing reports / analytics aggregates
    ('/api/cron/training-daily-report',           dict(hour=8, minute=0)),
    ('/api/cron/commander-daily-aggregate',       dict(hour=10, minute=0)),
    ('/api/cron/freeroll-qualification-sync',     dict(hour='*/6', minute=0)),

    # ══ WAVE 3 (2026-04-24 — highest-risk; closes Phase 2A) ══════════════════
    # ledger / diamond economy / identity. Each has its own idempotence
    # guarantees inside the handler (unique keys, cursor-based writes, flag
    # columns). Running on a schedule with no variance to reconcile == no-op.
    ('/api/cron/ledger-reconcile',                dict(hour=8, minute=0)),
    ('/api/cron/vip-status-check',                dict(minute=0)),          # every hour
    ('/api/cron/vip-diamond-stipend',             dict(day=1, hour=0, minute=5)),  # monthly, 1st @ 00:05 UTC
    ('/api/cron/collusion-scan',                  dict(hour=3, minute=30)),
]

# Legacy alias — kept through Wave 1 as a guardrail for any external tooling
# that still imports the old name. Safe to remove in a follow-up once
# confirmed nothing else reads it. Both names refer to the same list object.
OVERFLOW_CRONS = ALL_CRONS


SCRAPER_PY = str(
    Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / 'scripts' / 'video_library_scraper.py'
)

# ─── Jobs that invoke a local Python script instead of a Vercel HTTP endpoint ─
# Maps cron path → list of args passed to `python3 SCRAPER_PY`.
# Only used as a primary-role fallback for the Mac dispatcher. On secondary
# (Hetzner), any path in WORKERS_PREFERRED below fires via HTTP instead.
SCRIPT_JOBS = {
    '/api/cron/video-library-scraper':  [],                   # full daily run
    '/api/cron/video-library-backfill': ['--backfill'],
    '/api/cron/video-library-purge':    ['--purge'],
    '/api/cron/video-library-views':    ['--refresh-views'],
}


# ─── Workers-dispatch routing (Phase 2B.2(b), 2026-04-24) ─────────────────────
# Paths that have been HTTP-ported to the smarter-poker-workers service.
# When a path is in this map, the dispatcher fires against the workers VM
# instead of smarter.poker (Vercel). The value is the path on the workers
# service — which is typically the same name minus the /api/cron/ prefix,
# but kept explicit so we can route around renames without surprises.
#
# WORKERS_BASE_URL and DISPATCHER_PRIVATE_IP come from env so the same code
# runs on primary (Mac, no private network → empty URL → falls through to
# Vercel) and secondary (Hetzner, with private network → workers URL set).
WORKERS_BASE_URL       = os.environ.get('WORKERS_BASE_URL', '').strip()
DISPATCHER_PRIVATE_IP  = os.environ.get('DISPATCHER_PRIVATE_IP', '').strip()

WORKERS_PREFERRED = {
    # ─── 2B.2(b) — video-library SCRIPT_JOBS, all idempotent via Supabase upserts ───
    '/api/cron/video-library-scraper':  '/cron/video-library-scraper',
    '/api/cron/video-library-backfill': '/cron/video-library-backfill',
    '/api/cron/video-library-purge':    '/cron/video-library-purge',
    '/api/cron/video-library-views':    '/cron/video-library-views',
    # ─── 2B.2(c) Batch A+B — lowest-risk: scrapers, content gen, log cleanup ───
    # Each verified to return 200 from openclaw via private net before flip.
    # Each handler is idempotent via DELETE-by-cutoff or upsert-on-unique-key.
    '/api/cron/scraper-data-cleanup':   '/cron/scraper-data-cleanup',
    '/api/cron/purge-idempotency-keys': '/cron/purge-idempotency-keys',
    '/api/cron/trivia-pvp-cleanup':     '/cron/trivia-pvp-cleanup',
    '/api/cron/refresh-venue-json':     '/cron/refresh-venue-json',
    '/api/cron/content-health-check':   '/cron/content-health-check',
    '/api/cron/trivia-daily-generator': '/cron/trivia-daily-generator',
    '/api/cron/pokernews-videos':       '/cron/pokernews-videos',
    # NOT FLIPPED: /api/cron/daily-challenges — workers handler returns 500
    # (references training_daily_challenges.bonus_xp_multiplier column that
    # does not exist in the production schema). Defer until workers repo
    # owner reconciles the schema. Keep firing against Vercel monolith.
    # ─── 2B.2(d) Batch C — notification routes ──────────────────────────────
    # Each verified to return 200. OneSignal + Twilio env vars synced to
    # /opt/workers/.env first so push/SMS actually fire (handler skips
    # gracefully if not configured, which would silently mute alerts).
    '/api/cron/venue-game-alerts':      '/cron/venue-game-alerts',
    '/api/cron/license-reminders':      '/cron/license-reminders',
    '/api/cron/scraper-watchdog':       '/cron/scraper-watchdog',
    '/api/cron/venue-review-prompts':   '/cron/venue-review-prompts',
    # ─── 2B.2(e) Batch F — money routes (highest risk in plan terms) ───────
    # Each compared workers-vs-monolith response side-by-side first; results
    # match exactly (clubs_locked:3, clubs_unfrozen:3, identical message
    # strings). Postgres-atomic idempotency guards in the underlying handlers
    # (settlement_locks table, fn_claim_settlement_period RPC) prevent any
    # double-payout even under transient bugs. Schedule: Mon 10:00/10:10/10:20
    # UTC; on secondary role the +5 min stagger from STAGGERED_JOBS still
    # applies (harmless, late-by-5min). Mon's first scheduled fire after
    # this commit will be the production validation.
    '/api/cron/auto-settlement':            '/cron/auto-settlement',
    '/api/cron/auto-settlement-distribute': '/cron/auto-settlement-distribute',
    '/api/cron/union-rakeback':             '/cron/union-rakeback',

    # ─── 2B.2(g) Batch G — 18 routes from parallel session's 38/44 wave ─────
    # Workers repo HEAD 6db801e (handlers 23-38 + bonus_xp_multiplier fix).
    # All 18 probed 200 from openclaw with auth+XFF. Bumps total flipped
    # to 36 of 44 dispatcher paths. Remaining 8: deploy-error-poll
    # (VERCEL_TOKEN missing on workers), scrape-sports-clips (workers
    # timeout), 5 scrape-venue-info?batch=1..5 (SUPERSEDED — Python
    # workflows replace them, will be deleted in 2B.3), tour-schedule-scraper
    # + horse-batch/0..9 + horses-stories + horses-social-* (DEFERRED
    # to dedicated AG dispatch sessions per 2b2-wrap-38-of-44.md).
    #
    # Path remap notes:
    #   /api/clawbot/orchestrator → /cron/clawbot-orchestrator (workers
    #     uses hyphen instead of slash; value-side mapping handles it)
    '/api/cron/collusion-scan':                '/cron/collusion-scan',
    '/api/cron/commander-daily-aggregate':     '/cron/commander-daily-aggregate',
    '/api/cron/daily-challenges':              '/cron/daily-challenges',
    '/api/cron/freeroll-qualification-sync':   '/cron/freeroll-qualification-sync',
    '/api/cron/hard-stop':                     '/cron/hard-stop',
    '/api/cron/ledger-reconcile':              '/cron/ledger-reconcile',
    '/api/cron/memory-matrix-daily-challenge': '/cron/memory-matrix-daily-challenge',
    '/api/cron/news-scraper':                  '/cron/news-scraper',
    '/api/cron/poker-news':                    '/cron/poker-news',
    '/api/cron/scrape-charity-schedules':      '/cron/scrape-charity-schedules',
    '/api/cron/training-daily-challenge':      '/cron/training-daily-challenge',
    '/api/cron/training-daily-report':         '/cron/training-daily-report',
    '/api/cron/trivia-tournament-rounds':      '/cron/trivia-tournament-rounds',
    '/api/cron/trivia-tournaments':            '/cron/trivia-tournaments',
    '/api/cron/venue-tournaments':             '/cron/venue-tournaments',
    '/api/cron/vip-diamond-stipend':           '/cron/vip-diamond-stipend',
    '/api/cron/vip-status-check':              '/cron/vip-status-check',
    '/api/clawbot/orchestrator':               '/cron/clawbot-orchestrator',
    # ─── 2B.2(h) — late add: scrape-sports-clips ───────────────────────────
    # Re-probed after fixing 30s timeout in the test harness — workers
    # responds 200 in ~40s with same payload shape as monolith
    # (channels_scraped:38, found:100). Dispatcher REQUEST_TIMEOUT=120s
    # easily covers it.
    '/api/cron/scrape-sports-clips':           '/cron/scrape-sports-clips',
    # ─── 2B.2(i) — horses-social-friends (parallel session, handler 39) ────
    # Workers repo HEAD b44078b extracted slim HorseSocialEngine.sendFriendRequests +
    # acceptFriendRequests (the handler's only actual deps) so we don't need
    # the full ~3000-LOC horse engine to flip this one. Probe 200:
    # {success:true, sent:10, accepted:3}.
    '/api/cron/horses-social-friends':         '/cron/horses-social-friends',
    # NOT FLIPPED: /api/cron/deploy-error-poll — workers handler returns
    # 500 ("VERCEL_TOKEN not configured"). The Vercel API token isn't in
    # any location reachable from the Cowork sandbox or from openclaw VM.
    # On Vercel-hosted monolith the token is injected via Vercel project
    # env vars — that's where it has to keep firing. Workers can't autofix
    # Vercel deployment errors without Vercel API auth anyway.
}


def _workers_dispatch(path: str) -> bool:
    """True if this firing should go to the workers VM instead of Vercel."""
    return bool(WORKERS_BASE_URL) and path in WORKERS_PREFERRED


def fire_cron(path: str):
    """Make an authenticated GET request to a Vercel cron endpoint (or workers when routed)."""
    if _workers_dispatch(path):
        url = f'{WORKERS_BASE_URL}{WORKERS_PREFERRED[path]}'
        target_label = 'workers'
    else:
        url = f'{BASE_URL}{path}'
        target_label = 'vercel'
    headers = {
        'Authorization': f'Bearer {CRON_SECRET}',
        'User-Agent':    'OpenClaw-CronDispatcher/1.4',
        'Accept':        'application/json',
    }
    # Workers' ipAllowlist middleware reads X-Forwarded-For only (see
    # .memory/context/workers-hetzner.md §2B.2(a) re-verified). Always set
    # it when we have a known private IP — harmless for Vercel, required
    # for workers.
    if DISPATCHER_PRIVATE_IP:
        headers['X-Forwarded-For'] = DISPATCHER_PRIVATE_IP
    try:
        log.info(f'▶ Firing {path} → {target_label}')
        t0 = time.time()
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        elapsed = round(time.time() - t0, 1)
        if resp.status_code == 200:
            log.info(f'✅ {path} → {target_label} {resp.status_code} [{elapsed}s]')
        else:
            log.warning(f'⚠️ {path} → {target_label} {resp.status_code} [{elapsed}s]: {resp.text[:200]}')
    except requests.exceptions.Timeout:
        log.error(f'❌ {path} → {target_label} TIMEOUT after {REQUEST_TIMEOUT}s')
    except Exception as e:
        log.error(f'❌ {path} → {target_label} {type(e).__name__}: {e}')


def fire_script(path: str, extra_args: list):
    """
    Run the video_library_scraper.py with the given extra args.
    The script itself POSTs its result back to the Vercel status webhook,
    so the audit log stays up to date even though we're running locally.
    """
    cmd = [sys.executable, SCRAPER_PY] + extra_args
    log.info(f'▶ Script job {path} → {" ".join(cmd)}')
    t0 = time.time()
    try:
        result = subprocess.run(
            cmd,
            capture_output=False,  # let stdout/stderr flow to our log
            timeout=REQUEST_TIMEOUT,
        )
        elapsed = round(time.time() - t0, 1)
        if result.returncode == 0:
            log.info(f'✅ {path} script exited 0 [{elapsed}s]')
        else:
            log.warning(f'⚠️ {path} script exited {result.returncode} [{elapsed}s]')
    except subprocess.TimeoutExpired:
        log.error(f'❌ {path} script TIMEOUT after {REQUEST_TIMEOUT}s')
    except Exception as e:
        log.error(f'❌ {path} script {type(e).__name__}: {e}')


def make_job(path):
    """Return a closure that fires the given cron path.

    Precedence:
      1. workers HTTP (if path in WORKERS_PREFERRED AND WORKERS_BASE_URL set)
      2. local script (if path in SCRIPT_JOBS, typically primary/Mac only)
      3. Vercel HTTP (the default — smarter.poker/api/cron/...)
    """
    if _workers_dispatch(path):
        def _job():
            fire_cron(path)   # fire_cron auto-routes to workers via _workers_dispatch
    elif path in SCRIPT_JOBS:
        extra_args = SCRIPT_JOBS[path]
        def _job():
            fire_script(path, extra_args)
    else:
        def _job():
            fire_cron(path)
    _job.__name__ = path.replace('/', '_').lstrip('_')
    return _job


# ─── Phase 2A.2 burn-in — non-idempotent jobs that get a stagger offset ───
# When DISPATCHER_ROLE=secondary (Hetzner during burn-in), these 3 jobs fire
# 5 minutes later than their scheduled minute so the Mac dispatcher (primary)
# gets first crack at acquiring settlement_locks / claiming the idempotency
# slot. Per the Phase 2A.2 idempotence audit (.memory/context/phase-2a2-
# idempotence-audit.md), all 3 are already idempotent — this stagger is
# defense-in-depth per plan line 235, not a correctness requirement.
# Removing the env var OR setting DISPATCHER_ROLE=primary restores the
# original schedule.
STAGGERED_JOBS = {
    # Monday-morning money movement (see .memory/context/phase-2a2-idempotence-audit.md)
    '/api/cron/auto-settlement',
    '/api/cron/auto-settlement-distribute',
    '/api/cron/union-rakeback',
    # Notification jobs where a read/compute/write race could duplicate
    # user-facing sends (SMS + push). Covered in
    # .memory/context/phase-2a2-full-cron-audit.md.
    '/api/cron/venue-game-alerts',     # hourly, 4h cooldown via alert.last_triggered
    '/api/cron/scraper-watchdog',      # every 2h, SMS via Twilio + push via OneSignal
}
STAGGER_MINUTES = 5


def apply_stagger_if_secondary(path: str, kwargs: dict, role: str) -> dict:
    """If role is 'secondary' and path is in STAGGERED_JOBS, shift minute by +5."""
    if role != 'secondary' or path not in STAGGERED_JOBS:
        return kwargs
    shifted = dict(kwargs)
    original_minute = shifted.get('minute', 0)
    # Only shift integer minute values — wildcards/cron-expressions left alone
    if isinstance(original_minute, int):
        shifted['minute'] = (original_minute + STAGGER_MINUTES) % 60
    return shifted


def should_skip_on_secondary(path: str, role: str) -> bool:
    """
    SCRIPT_JOBS invoke a local Python scraper at SCRAPER_PY. That file only
    exists on Dan's Mac. On Hetzner (role='secondary'), subprocess.run()
    against it would FileNotFoundError every cycle.

    Phase 2B.2(b) (2026-04-24): paths in WORKERS_PREFERRED now fire via HTTP
    against the workers VM instead — they are NOT skipped on secondary. Only
    SCRIPT_JOBS that haven't been workers-ported are skipped.

    Currently this means: if all SCRIPT_JOBS are in WORKERS_PREFERRED (they
    are, as of 2B.2(b)), this function returns False for everything and the
    function becomes a no-op. Retained to catch any future SCRIPT_JOBS
    additions that land before their workers HTTP port.
    """
    return (
        role == 'secondary'
        and path in SCRIPT_JOBS
        and path not in WORKERS_PREFERRED
    )


def main():
    role = os.environ.get('DISPATCHER_ROLE', 'primary').strip().lower()
    if role not in ('primary', 'secondary'):
        log.warning(f"DISPATCHER_ROLE='{role}' not recognized, defaulting to 'primary'")
        role = 'primary'

    log.info('=' * 60)
    log.info('OpenClaw Cron Dispatcher v1.4 starting up')
    if WORKERS_BASE_URL:
        log.info(f'Workers routing:   {len(WORKERS_PREFERRED)} paths → {WORKERS_BASE_URL}')
    if DISPATCHER_PRIVATE_IP:
        log.info(f'X-Forwarded-For:   {DISPATCHER_PRIVATE_IP}')
    log.info(f'Base URL:        {BASE_URL}')
    log.info(f'Dispatcher role: {role}')
    if role == 'secondary':
        log.info(f'Stagger active:  +{STAGGER_MINUTES} min on {len(STAGGERED_JOBS)} non-idempotent jobs')
        if SCRIPT_JOBS:
            log.info(f'Skipping {len(SCRIPT_JOBS)} SCRIPT_JOBS on secondary (SCRAPER_PY is Mac-only)')
    log.info(f'Managing {len(ALL_CRONS)} cron jobs')
    log.info('=' * 60)

    scheduler = BlockingScheduler(timezone='UTC')

    registered = 0
    skipped = 0
    for path, trigger_kwargs in ALL_CRONS:
        if should_skip_on_secondary(path, role):
            log.info(f'  Skipped (secondary, SCRIPT_JOB): {path}')
            skipped += 1
            continue
        effective_kwargs = apply_stagger_if_secondary(path, trigger_kwargs, role)
        trigger = CronTrigger(**effective_kwargs)
        scheduler.add_job(
            make_job(path),
            trigger=trigger,
            id=path.replace('/', '_').lstrip('_'),
            name=path,
            misfire_grace_time=300,   # 5 min grace — if Mac was asleep, still fire
            coalesce=True,            # Don't stack if behind
        )
        staggered = ' [STAGGERED]' if effective_kwargs != trigger_kwargs else ''
        log.info(f'  Registered: {path}  [{effective_kwargs}]{staggered}')
        registered += 1

    log.info(f'Registration complete: {registered} registered, {skipped} skipped')
    log.info('Scheduler ready. Waiting for triggers...')
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info('Dispatcher shutting down cleanly.')


if __name__ == '__main__':
    main()
