#!/usr/bin/env python3
"""
OpenClaw Cron Dispatcher v1.8
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

# ─── Phase 2A gate criterion: Hetzner monitoring + alerting (2026-04-25) ──────
# Plan line 285: "Dashboard/alerting on Hetzner up: at minimum a weekly log
# summary + PagerDuty/SMS if the dispatcher dies for >10 min." Implementation:
#   * Internal _workers-healthcheck cron pings http://10.0.0.3:8081/health
#     every 5 min; SMS-alerts after 2 consecutive failures (~10 min outage).
#   * Internal _heartbeat cron logs ALIVE every 15 min so journalctl shows
#     liveness; external scrape of the journal would catch a dead dispatcher.
# Twilio creds come from env (synced to /opt/openclaw/.env via 2B.2(d) batch).
TWILIO_SID    = os.environ.get('TWILIO_ACCOUNT_SID', '').strip()
TWILIO_TOKEN  = os.environ.get('TWILIO_AUTH_TOKEN', '').strip()
TWILIO_FROM   = os.environ.get('TWILIO_PHONE_NUMBER', '').strip()
ADMIN_PHONE   = os.environ.get('ADMIN_PHONE', '+17086775221').strip()
WORKERS_HEALTH_URL = (os.environ.get('WORKERS_BASE_URL', '').strip() or 'http://10.0.0.3:8081') + '/health'

# In-memory consecutive-failure counter for the workers healthcheck.
# Resets to 0 on success. Alerts at 2 (~10 min after first failure since
# the cron runs every 5 min). After alerting, suppresses further alerts
# until success+alert-clear cycle completes (avoids SMS storm).
_workers_health_state = {'consec_fail': 0, 'alert_sent': False}

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
    # ── Phase 49 (2026-05-05) — two-track trivia refill ───────────────────
    # Track A (deterministic engine, $0 cost): generates strategy-category
    # questions from solved_spots_gold + memory_charts_gold via the same
    # engine training games use. Track B (Grok-3-mini + 5-layer validator):
    # generates fact-category questions with reasoning_effort=low. Each run
    # picks the most-undertarget category. Target: 1,500/cat × 10 = 15,000.
    # Frequency bumped from daily → every 4 hours so refill keeps up.
    ('/api/cron/generate-trivia-questions', dict(hour='*/4', minute=30)),
    # Pool health watchdog — reports counts vs 1500 target, raises alerts
    # if any category drops below 60-day floor (1,200) or any difficulty
    # bucket below 60% of target.
    ('/api/cron/trivia-pool-monitor',       dict(hour=6, minute=15)),
    # ── Phase 52 (2026-05-05) — daily Grok question quality audit ────────
    # Audits up to 200 un-verified Grok-generated questions per run using
    # Grok-3 (full model) as the fact-checker. Bumps quality_score for
    # verified-correct (→ 9), soft-excludes incorrect (→ 2, below the
    # minQualityScore=6 gameplay floor), surfaces uncertain (→ 5) for
    # human review via /admin/trivia-pool. Cost ~$0.50/day. Schedule:
    # daily 09:00 UTC — runs after 4 ticks of generate-trivia-questions
    # (00:30, 04:30, 08:30) so the freshly-inserted batch is reviewed
    # before peak user hours.
    ('/api/cron/trivia-quality-audit',      dict(hour=9, minute=0)),
    # ── Phase 54 (2026-05-05) — quality-hardening cron set ──────────────
    # Embedding backfill: every 2 hours, embed up to 100 un-embedded
    # questions for pgvector dup detection.
    ('/api/cron/trivia-embed-backfill',     dict(hour='*/2', minute=15)),
    # Theme tag backfill: every 2 hours, tag up to 50 un-themed questions
    # via grok-3-mini for diversity tracking.
    ('/api/cron/trivia-theme-backfill',     dict(hour='*/2', minute=45)),
    # Player-success retag: daily 11:00 UTC. Retags difficulty + demotes
    # questions whose times_correct/times_shown signal mislabeling or
    # high skip rate.
    ('/api/cron/trivia-player-retag',       dict(hour=11, minute=0)),
    # Regression tests: daily 11:30 UTC. Position bias, length parity,
    # theme density. Writes to trivia_regression_runs; admin dashboard
    # surfaces failures.
    ('/api/cron/trivia-regression-tests',   dict(hour=11, minute=30)),
    # ── 2026-04-24 — restored from orphan audit ──────────────────────────
    # hard-stop auto-closes commander_tables at each venue's hard_stop_time.
    # Has 1 opted-in venue (id=1996, 02:00 UTC) with 34 in_use tables at
    # audit time. Lost its schedule some time before 2026-04-24 — was in
    # neither vercel.json nor this file. Idempotent: the handler checks
    # current_time vs hard_stop_time per-venue, closes matching tables.
    # See .memory/context/cron-handler-orphans.md for full forensics.
    ('/api/cron/hard-stop',                 dict(minute='*/1')),       # every minute — enforces venue hard_stop_time
    # ── 2026-04-29 — Auto-transcode HEVC/.mov uploads to H.264 MP4 ────────
    # iPhone records video as H.265/HEVC in .mov containers; Chrome and
    # Firefox desktop can't decode HEVC. The trigger fn_queue_video_transcode
    # marks new uploads as transcode_status='queued' and this cron handler
    # picks ONE per minute, runs ffmpeg, and updates the post + reel mirror.
    # Idempotent: returns {processed:0} immediately when nothing is queued.
    ('/api/cron/transcode-videos',          dict(minute='*/1')),       # every minute — drains video transcode queue
    # ── Storage hygiene — orphan upload cleanup (PHASE-D 2026-05-03) ──
    # Once daily at 03:30 UTC. Sweeps the social-media bucket for objects
    # older than 24h with no corresponding social_posts/social_reels row,
    # deletes them up to a 200-object cap per run. Dry-run available via
    # ?dry=1 query param.
    ('/api/cron/cleanup-orphan-uploads',    dict(hour=3, minute=30)),
    # ── Video Library — daily fresh content from all 25 creators (SCRIPT_JOBS) ──
    ('/api/cron/video-library-scraper',     dict(hour=6, minute=0)),   # Daily 6am UTC — RSS ingest
    ('/api/cron/video-library-reels',       dict(hour=7, minute=0)),   # Daily 7am UTC — Sync reels
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
    ('/api/cron/cardplayer-scraper',              dict(hour='*/2', minute=5)),
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
    ('/api/cron/collusion-scan',                  dict(minute='*/30')),       # every 30 min — 4-pattern detector incl. TIMING_CORRELATION (x67c)

    # ══ WAVE 4 — Live Streaming Infrastructure (2026-04-28) ═══════════════════
    # Zombie cleanup: marks stale live streams (>6h) as ended, cleans viewers.
    # Reminders: notifies followers 15 minutes before a scheduled live starts.
    ('/api/cron/live-cleanup',                    dict(minute='*/5')),       # every 5 min
    # BUG-FIX-LIVE-LIST-8b backstop: 60-second stale-stream cleanup.
    # Complements /api/cron/live-cleanup (which handles 6h+ zombies via
    # cleanup_zombie_streams). This one runs fn_auto_end_stale_streams(60)
    # every 5 minutes so streams that disconnect at low-traffic hours are
    # caught even when no users are loading the social-media feed.
    ('/api/cron/cleanup-stale-streams',           dict(minute='*/5')),       # every 5 min
    ('/api/cron/live-reminders',                  dict(minute='*/5')),       # every 5 min
    # STREAM-POLISH-R4 STORY-EXPIRY-1: hard-delete stories whose
    # expires_at + 24h grace has elapsed. Audit found ~23k expired
    # rows accumulated because nothing was actually deleting them.
    ('/api/cron/cleanup-expired-stories',         dict(minute='17', hour='*/6')),  # every 6 hours, off-the-hour

    # ── Social Page Completion Nudge (2026-05-14) ─────────────────────────
    # Finds social_pages with missing avatar_url / cover_url / description,
    # inserts an in-app notification for the owner_id nudging them to finish
    # their profile. 7-day dedup via social_pages.metadata.nudge_sent_at.
    # Fires every 3 days at 09:30 UTC — low-traffic, non-critical.
    ('/api/cron/social-page-completion-nudge',    dict(day='*/3', hour=9, minute=30)),


    # ══ WAVE 5 — Club Arena platform crons (Round 9 + X7.4, 2026-04-29) ═════
    # Wired in Round 23 of the relaunch sweep. All 7 handlers existed in
    # smarter-poker-workers/src/routes and were route-registered in workers
    # index.ts, but never scheduled by Open Claw — meaning manual curl
    # worked but the auto-fire path was dead.
    #
    # rakeback-period-settle is the relaunch-blocker of this batch — it
    # runs 30 min after the auto-settlement-distribute Mon-10:10 fire, to
    # close all pending rakeback periods for clubs that just settled.
    #
    # Anti-cheat cadences (2026-05-03 — AG dispatch final closeout v2):
    # Previous draft cadences (every 6h / 12h) were placeholder conservative
    # rates. Corrected to Phase F+G spec cadences per Cowork audit:
    #   multi-account: every 30 min (shared-IP detection)
    #   bot-timing:    hourly (intra-hand delta std-dev; x67-1)
    #   chip-dump:     every 30 min (giver→receiver pair pattern; x69)
    #   collusion-scan: every 30 min (4-pattern incl. TIMING_CORRELATION; x67c)
    ('/api/cron/bbj-detect',                       dict(minute='*/5')),       # every 5 min — promptly detect BBJ hits
    ('/api/cron/tournament-bounty-detect',         dict(minute='*/10')),      # every 10 min during MTT runs
    ('/api/cron/player-stats-refresh',             dict(minute=15)),          # hourly @ :15 — leaderboard refresh
    ('/api/cron/rakeback-period-settle',           dict(day_of_week='mon', hour=10, minute=30)),
    ('/api/cron/anti-cheat-multi-account',         dict(minute='*/30')),      # every 30 min — shared-IP detection (R67)
    ('/api/cron/anti-cheat-bot-timing',            dict(minute=0)),           # hourly — intra-hand delta std-dev (x67-1)
    ('/api/cron/anti-cheat-chip-dump',             dict(minute='*/30')),      # every 30 min — giver→receiver pair pattern (x69)

    # ══ YT PIPELINE — auto-recovery for failed transcode jobs (2026-05-12) ═════
    # Re-queues video_transcode_jobs that failed with cookie-auth or transient
    # patterns so the worker retries them with the current POT+player_skip
    # stack (PR #523). Most cookie-auth failures from earlier weeks will now
    # succeed because the pipeline no longer depends on Google login.
    # Safe: caps at 200 jobs/fire, skips jobs <1h old, skips attempts>=5.
    ('/api/cron/yt-pipeline-recovery',            dict(minute='*/15')),       # every 15 min — keeps worker queue topped up continuously (cap=1000, auto-marks permanent failures)

    # ══ INTERNAL — Phase 2A monitoring/alerting (closes plan line 285 gate) ═══
    # No HTTP egress; runs in-process. SMS-alerts via Twilio on workers outage.
    ('_internal/workers-healthcheck',             dict(minute='*/5')),      # every 5 min
    ('_internal/heartbeat',                       dict(minute='*/15')),     # every 15 min
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
    '/api/cron/video-library-reels':    ['--sync-captions'],
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
    '/api/cron/video-library-reels':    '/cron/video-library-reels',
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
    # ─── 2B.2(j) — tour-schedule-scraper (handler 40) ──────────────────────
    # Workers repo has src/routes/tour-schedule-scraper.ts (325 LOC) wired in
    # via app.get('/cron/tour-schedule-scraper') AND POST. The disk-based
    # registry/sources JSONs are replaced with Supabase tables
    # tour_schedule_registry + tour_schedule_sources (migration applied
    # 2026-04-26 in 20260426_tour_scraper_tables.sql). Imports
    # tourPdfExtractor + tourHtmlExtractor + scraperAlerts from workers libs.
    # Schedule: every 3 days at 04:00 UTC (low-traffic window), so first
    # production fire after this commit will be the validation.
    '/api/cron/tour-schedule-scraper':         '/cron/tour-schedule-scraper',
    # ─── 2B.2(k) — horse engine port complete (handlers 41-52, batch close) ─
    # Workers repo HEAD 02cd35a — 8 commits ported HorseScheduler, ClipLibrary,
    # HumanVoiceEngine, HorseSocialEngine (full), HorseMessengerEngine
    # (~4,330 LOC TS) plus 3 new handler routes:
    #   - horses-social-all → src/routes/horses-social-all.ts
    #   - horses-stories → src/routes/horses-stories.ts
    #   - horse-batch/:N → src/routes/horse-by-index.ts (single handler, 10 batches)
    # Phase 2B.2 closes to 100% with this flip (44 of 44 plan-listed paths
    # served by workers code). Schedule: 2-hour cycles (social-all),
    # 15-minute (stories), every 2.5h staggered (horse-batch). First
    # production fires after deploy will be the validation window.
    '/api/cron/horses-social-all':             '/cron/horses-social-all',
    '/api/cron/horses-stories':                '/cron/horses-stories',
    '/api/cron/horse-batch/0':                 '/cron/horse-batch/0',
    '/api/cron/horse-batch/1':                 '/cron/horse-batch/1',
    '/api/cron/horse-batch/2':                 '/cron/horse-batch/2',
    '/api/cron/horse-batch/3':                 '/cron/horse-batch/3',
    '/api/cron/horse-batch/4':                 '/cron/horse-batch/4',
    '/api/cron/horse-batch/5':                 '/cron/horse-batch/5',
    '/api/cron/horse-batch/6':                 '/cron/horse-batch/6',
    '/api/cron/horse-batch/7':                 '/cron/horse-batch/7',
    '/api/cron/horse-batch/8':                 '/cron/horse-batch/8',
    '/api/cron/horse-batch/9':                 '/cron/horse-batch/9',
    # ─── 2B.3 Option B — generate-trivia-questions (handler 53) ─────────────
    # Workers repo has src/routes/generate-trivia-questions.ts (TS port of the
    # 560 LOC monolith handler) + src/lib/triviaValidator.ts (218 LOC port of
    # 5-layer QA gate). Scheduled daily at 04:30 UTC. Closes the last monolith
    # cron exception — pages/api/cron/ is now empty.
    '/api/cron/generate-trivia-questions':     '/cron/generate-trivia-questions',
    '/api/cron/trivia-pool-monitor':           '/cron/trivia-pool-monitor',
    '/api/cron/trivia-quality-audit':          '/cron/trivia-quality-audit',
    '/api/cron/trivia-embed-backfill':         '/cron/trivia-embed-backfill',
    '/api/cron/trivia-theme-backfill':         '/cron/trivia-theme-backfill',
    '/api/cron/trivia-player-retag':           '/cron/trivia-player-retag',
    '/api/cron/trivia-regression-tests':       '/cron/trivia-regression-tests',
    '/api/cron/deploy-error-poll':             '/cron/deploy-error-poll',
    # ─── WAVE 5 — Club Arena platform crons (Round 23, 2026-04-29) ──────────
    # Workers repo has src/routes/{bbj-detect,tournament-bounty-detect,
    # player-stats-refresh,rakeback-period-settle,anti-cheat-*}.ts. All 7
    # were route-registered in workers index.ts but never scheduled by
    # Open Claw — manual curl worked, auto-fire path was dead. Wired in
    # both ALL_CRONS (above) AND here so secondary-role dispatcher routes
    # them to the workers VM via WORKERS_BASE_URL instead of Vercel.
    '/api/cron/bbj-detect':                    '/cron/bbj-detect',
    '/api/cron/tournament-bounty-detect':      '/cron/tournament-bounty-detect',
    '/api/cron/player-stats-refresh':          '/cron/player-stats-refresh',
    '/api/cron/rakeback-period-settle':        '/cron/rakeback-period-settle',
    '/api/cron/anti-cheat-multi-account':      '/cron/anti-cheat-multi-account',
    '/api/cron/anti-cheat-bot-timing':         '/cron/anti-cheat-bot-timing',
    '/api/cron/anti-cheat-chip-dump':          '/cron/anti-cheat-chip-dump',
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


def _send_sms(body: str):
    """Best-effort Twilio SMS alert. Returns True/False."""
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM and ADMIN_PHONE):
        log.warning(f'[alert] Twilio not configured, would have sent: {body[:120]}')
        return False
    try:
        resp = requests.post(
            f'https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json',
            auth=(TWILIO_SID, TWILIO_TOKEN),
            data={'From': TWILIO_FROM, 'To': ADMIN_PHONE, 'Body': body[:1500]},
            timeout=15,
        )
        if 200 <= resp.status_code < 300:
            log.info(f'[alert] Twilio SMS sent: {body[:80]}')
            return True
        log.error(f'[alert] Twilio HTTP {resp.status_code}: {resp.text[:200]}')
    except Exception as e:
        log.error(f'[alert] Twilio exception {type(e).__name__}: {e}')
    return False


def _workers_healthcheck_job():
    """Internal cron — pings workers /health, alerts after 2 consec failures."""
    state = _workers_health_state
    try:
        r = requests.get(WORKERS_HEALTH_URL, timeout=8)
        ok = r.status_code == 200 and '"status":"ok"' in r.text
    except Exception as e:
        ok = False
        log.warning(f'[healthcheck] workers ping failed: {type(e).__name__}: {e}')

    if ok:
        if state['alert_sent']:
            _send_sms(f'✅ workers RECOVERED at {WORKERS_HEALTH_URL}')
        state['consec_fail'] = 0
        state['alert_sent'] = False
        return

    state['consec_fail'] += 1
    log.warning(f'[healthcheck] workers DOWN (consec={state["consec_fail"]})')
    if state['consec_fail'] >= 2 and not state['alert_sent']:
        _send_sms(
            f'🚨 SMARTER.POKER WORKERS DOWN ~10min — {WORKERS_HEALTH_URL} not responding. '
            f'Affects {len(WORKERS_PREFERRED)} cron routes. Check '
            f'`docker ps` on workers VM (Hetzner id 127930016, IP from Keychain).'
        )
        state['alert_sent'] = True


def _heartbeat_job():
    """Internal cron — logs ALIVE so journalctl scrapers can detect liveness."""
    routed = len(WORKERS_PREFERRED)
    total  = len(ALL_CRONS)
    log.info(f'[heartbeat] dispatcher ALIVE — {routed}/{total} routes flipped to workers')


# Internal jobs — fire by name, no HTTP path. Distinguished by underscore prefix.
INTERNAL_JOBS = {
    '_internal/workers-healthcheck': _workers_healthcheck_job,
    '_internal/heartbeat':           _heartbeat_job,
}


def make_job(path):
    """Return a closure that fires the given cron path.

    Precedence:
      1. internal helper (if path in INTERNAL_JOBS — runs in-process)
      2. workers HTTP (if path in WORKERS_PREFERRED AND WORKERS_BASE_URL set)
      3. local script (if path in SCRIPT_JOBS, typically primary/Mac only)
      4. Vercel HTTP (the default — smarter.poker/api/cron/...)
    """
    if path in INTERNAL_JOBS:
        fn = INTERNAL_JOBS[path]
        def _job():
            try:
                fn()
            except Exception as e:
                log.error(f'❌ internal {path}: {type(e).__name__}: {e}')
    elif path == '/api/cron/cardplayer-scraper':
        def _job():
            script_path = str(Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / 'scripts' / 'scrape-cardplayer.py')
            cmd = [sys.executable, script_path]
            log.info(f'▶ Script job {path} → {" ".join(cmd)}')
            t0 = time.time()
            try:
                result = subprocess.run(cmd, capture_output=False, timeout=120)
                elapsed = round(time.time() - t0, 1)
                if result.returncode == 0:
                    log.info(f'✅ {path} script exited 0 [{elapsed}s]')
                else:
                    log.warning(f'⚠️ {path} script exited {result.returncode} [{elapsed}s]')
            except Exception as e:
                log.error(f'❌ {path} script error: {e}')
    elif _workers_dispatch(path):
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
    if role == 'secondary' and path == '/api/cron/cardplayer-scraper':
        return True
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
    log.info('OpenClaw Cron Dispatcher v1.8 starting up')
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
