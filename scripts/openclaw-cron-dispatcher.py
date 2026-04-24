#!/usr/bin/env python3
"""
OpenClaw Cron Dispatcher v1.3
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
    ('/api/cron/scrape-venue-info?batch=1',       dict(hour=6, minute=0)),
    ('/api/cron/scrape-venue-info?batch=2',       dict(hour=12, minute=0)),
    ('/api/cron/scrape-venue-info?batch=3',       dict(day_of_week='mon,wed,fri', hour=6, minute=0)),
    ('/api/cron/scrape-venue-info?batch=4',       dict(day_of_week='mon,wed,fri', hour=12, minute=0)),
    ('/api/cron/scrape-venue-info?batch=5',       dict(day_of_week='mon,wed,fri', hour=18, minute=0)),
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
]

# Legacy alias — kept through Wave 1 as a guardrail for any external tooling
# that still imports the old name. Safe to remove in a follow-up once
# confirmed nothing else reads it. Both names refer to the same list object.
OVERFLOW_CRONS = ALL_CRONS


SCRAPER_PY = str(
    Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / 'scripts' / 'video_library_scraper.py'
)

# ─── Jobs that invoke a local Python script instead of a Vercel HTTP endpoint ─
# Maps cron path → list of args passed to `python3 SCRAPER_PY`
SCRIPT_JOBS = {
    '/api/cron/video-library-scraper':  [],                   # full daily run
    '/api/cron/video-library-backfill': ['--backfill'],
    '/api/cron/video-library-purge':    ['--purge'],
    '/api/cron/video-library-views':    ['--refresh-views'],
}


def fire_cron(path: str):
    """Make an authenticated GET request to a Vercel cron endpoint."""
    url = f'{BASE_URL}{path}'
    headers = {
        'Authorization': f'Bearer {CRON_SECRET}',
        'User-Agent':    'OpenClaw-CronDispatcher/1.0',
        'Accept':        'application/json',
    }
    try:
        log.info(f'▶ Firing {path}')
        t0 = time.time()
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        elapsed = round(time.time() - t0, 1)
        if resp.status_code == 200:
            log.info(f'✅ {path} → {resp.status_code} [{elapsed}s]')
        else:
            log.warning(f'⚠️ {path} → {resp.status_code} [{elapsed}s]: {resp.text[:200]}')
    except requests.exceptions.Timeout:
        log.error(f'❌ {path} → TIMEOUT after {REQUEST_TIMEOUT}s')
    except Exception as e:
        log.error(f'❌ {path} → {type(e).__name__}: {e}')


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
    """Return a closure that fires the given cron path (HTTP or local script)."""
    if path in SCRIPT_JOBS:
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
    SCRIPT_JOBS invoke a local Python scraper at SCRAPER_PY. That path only
    exists on Dan's Mac (Path.home()/Documents/Smarter-Poker-World-Hub/...)
    because deploy-openclaw.sh syncs dispatcher.py only — it doesn't push
    video_library_scraper.py to Hetzner.

    On Hetzner (role='secondary'), SCRIPT_JOBS would fire subprocess.run()
    against a non-existent file every cycle, logging FileNotFoundError into
    journalctl and providing zero useful burn-in signal. Skip them at
    registration time so the secondary dispatcher's logs stay clean.

    The Mac (role='primary') keeps running them. Phase 2B.2 will HTTP-port
    video-library-* handlers into the workers repo, at which point
    SCRIPT_JOBS becomes empty and this guard is a no-op.
    """
    return role == 'secondary' and path in SCRIPT_JOBS


def main():
    role = os.environ.get('DISPATCHER_ROLE', 'primary').strip().lower()
    if role not in ('primary', 'secondary'):
        log.warning(f"DISPATCHER_ROLE='{role}' not recognized, defaulting to 'primary'")
        role = 'primary'

    log.info('=' * 60)
    log.info('OpenClaw Cron Dispatcher v1.3 starting up')
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
