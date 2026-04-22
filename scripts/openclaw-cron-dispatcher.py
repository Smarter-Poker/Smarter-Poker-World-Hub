#!/usr/bin/env python3
"""
OpenClaw Cron Dispatcher v1.0
==============================
Fires the 11 Vercel cron jobs that overflow the Pro plan's 40-job limit.
Runs as a persistent LaunchAgent daemon on the same Mac as the Bravo/PA scrapers.

Jobs handled (positions 41-52 in vercel.json):
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

Auth: Authorization: Bearer <CRON_SECRET>
"""

import os
import time
import logging
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
]


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


def make_job(path):
    """Return a closure that fires the given cron path."""
    def _job():
        fire_cron(path)
    _job.__name__ = path.replace('/', '_').lstrip('_')
    return _job


def main():
    log.info('=' * 60)
    log.info('OpenClaw Cron Dispatcher v1.0 starting up')
    log.info(f'Base URL: {BASE_URL}')
    log.info(f'Managing {len(OVERFLOW_CRONS)} overflow Vercel cron jobs')
    log.info('=' * 60)

    scheduler = BlockingScheduler(timezone='UTC')

    for path, trigger_kwargs in OVERFLOW_CRONS:
        trigger = CronTrigger(**trigger_kwargs)
        scheduler.add_job(
            make_job(path),
            trigger=trigger,
            id=path.replace('/', '_').lstrip('_'),
            name=path,
            misfire_grace_time=300,   # 5 min grace — if Mac was asleep, still fire
            coalesce=True,            # Don't stack if behind
        )
        log.info(f'  Registered: {path}  [{trigger_kwargs}]')

    log.info('Scheduler ready. Waiting for triggers...')
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info('Dispatcher shutting down cleanly.')


if __name__ == '__main__':
    main()
