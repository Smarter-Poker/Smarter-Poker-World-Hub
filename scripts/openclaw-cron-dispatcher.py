#!/usr/bin/env python3
"""
OpenClaw Cron Dispatcher v1.0
==============================

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓ CANONICAL SCHEDULER for all smarter.poker cron jobs.                      ▓
▓                                                                           ▓
▓ TO ADD A NEW CRON JOB:                                                    ▓
▓   1. Edit this file — add an entry to the JOBS list below.                ▓
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

Fires the 11 Vercel cron jobs that overflow the Pro plan's 40-job limit.
Runs as a persistent LaunchAgent daemon on the same Mac as the Bravo/PA scrapers.

Jobs handled (positions 41-55 in vercel.json):
  /api/cron/auto-settlement         0 10 * * 1   (Mon 10am)
  /api/cron/auto-settlement-distribute  10 10 * * 1 (Mon 10:10am)
  /api/cron/license-reminders       0 9 * * *    (Daily 9am)
  /api/cron/union-rakeback          20 10 * * 1  (Mon 10:20am)
  /api/cron/scraper-watchdog        0 */2 * * *  (Every 2h)
  /api/cron/venue-game-alerts       0 * * * *    (Every hour)
  /api/cron/scraper-data-cleanup    0 3 * * *    (Daily 3am)
  /api/clawbot/orchestrator         0 7 * * *    (Daily 7am)
  /api/cron/venue-review-prompts    0 */6 * * *  (Every 6h)
  /api/cron/tour-schedule-scraper   0 4 */3 * *  (Every 3 days 4am)
  /api/cron/scrape-charity-schedules 0 3 */3 * * (Every 3 days 3am)
  /api/cron/deploy-error-poll       */2 * * * *  (Every 2 min — autopilot autofix)
  /api/cron/video-library-scraper   0 6 * * *    (Daily 6am UTC — fresh video ingest)
  /api/cron/video-library-backfill  0 23 * * sat (Sat 23:00 UTC — fix zero-views/fake dates)
  /api/cron/video-library-purge     0 0 * * sun  (Sun 00:00 UTC — delete dead videos)
  /api/cron/video-library-views     0 22 * * fri (Fri 22:00 UTC — refresh view counts)

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


# ─── Overflow jobs: (path, trigger_kwargs) ────────────────────────────────────
# Schedule exactly mirrors vercel.json entries 41-51
OVERFLOW_CRONS = [
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
    # ── Video Library — daily fresh content from all 25 creators ──────────
    ('/api/cron/video-library-scraper',     dict(hour=6, minute=0)),   # Daily 6am UTC — RSS ingest
    ('/api/cron/video-library-backfill',    dict(day_of_week='sat', hour=23, minute=0)),  # Weekly Sat 23:00 UTC — fix zero-views/fake dates
    ('/api/cron/video-library-purge',       dict(day_of_week='sun', hour=0,  minute=0)),  # Weekly Sun 00:00 UTC — delete dead videos
    ('/api/cron/video-library-views',       dict(day_of_week='fri', hour=22, minute=0)),  # Weekly Fri 22:00 UTC — refresh view counts for top 50
]


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


def main():
    role = os.environ.get('DISPATCHER_ROLE', 'primary').strip().lower()
    if role not in ('primary', 'secondary'):
        log.warning(f"DISPATCHER_ROLE='{role}' not recognized, defaulting to 'primary'")
        role = 'primary'

    log.info('=' * 60)
    log.info('OpenClaw Cron Dispatcher v1.1 starting up')
    log.info(f'Base URL:        {BASE_URL}')
    log.info(f'Dispatcher role: {role}')
    if role == 'secondary':
        log.info(f'Stagger active:  +{STAGGER_MINUTES} min on {len(STAGGERED_JOBS)} non-idempotent jobs')
    log.info(f'Managing {len(OVERFLOW_CRONS)} overflow Vercel cron jobs')
    log.info('=' * 60)

    scheduler = BlockingScheduler(timezone='UTC')

    for path, trigger_kwargs in OVERFLOW_CRONS:
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

    log.info('Scheduler ready. Waiting for triggers...')
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info('Dispatcher shutting down cleanly.')


if __name__ == '__main__':
    main()
