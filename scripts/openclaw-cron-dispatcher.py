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
import json
import hashlib
import logging
import subprocess
import requests
from collections import deque
from datetime import datetime, timezone
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

# The workers VM authenticates against ITS OWN copy of CRON_SECRET, held in
# /opt/workers/.env inside the container's compose env. It is a SEPARATE
# credential from Vercel's, on a separate host, with a separate rotation
# cadence, and treating the two as one value caused a 24-hour outage:
#
#   2026-08-31 08:59:01 UTC  last successful workers fire
#   2026-08-31 09:00:00 UTC  first `workers 401 {"error":"unauthorized"}`
#   ...and every workers-routed job 401'd continuously from then on.
#
# What happened: deploy-openclaw.yml stamped GitHub's two-week-stale
# CRON_SECRET onto /etc/openclaw.env, all 89 routes began 401ing, and the
# hand-repair that followed replaced it with VERCEL's current value. That
# restored every Vercel-routed job and permanently broke every workers-routed
# one, because the workers VM had never been rotated and still expects the
# older value. Nothing detected it: the workers healthcheck pings the
# UNAUTHENTICATED /health (200 the whole time) and the auth-drift watchdog
# only ever probed Vercel. 58 distinct jobs were dead, including every horse
# social post and story, hard-stop, ledger-reconcile and the anti-cheat sweeps.
#
# So: one env var per hop. WORKERS_CRON_SECRET is host-local (it lives in
# /opt/openclaw/.env, which deploy-openclaw.yml seeds into /etc/openclaw.env
# and never overwrites), and falls back to CRON_SECRET when unset so a box
# where the two genuinely agree needs no configuration at all.
WORKERS_CRON_SECRET = os.environ.get('WORKERS_CRON_SECRET', '').strip() or CRON_SECRET

LOG_DIR      = Path.home() / '.smarter-poker' / 'logs'
LOG_FILE     = LOG_DIR / 'openclaw-cron.log'
REQUEST_TIMEOUT = 120  # seconds — cron jobs can be slow

# PER-JOB TIMEOUTS (2026-09-03). The client timeout is not a cancel: when this
# dispatcher gives up at 120s the worker keeps running and finishes. So for a
# job that legitimately takes longer, the journal said ❌ TIMEOUT while the
# work completed - horse-batch/1..8 (once a day, ~100 horses each, 200-400s)
# logged a failure on every single run, and trivia-theme-backfill (50 Grok
# calls) on three runs out of five. A watchdog that counts those as failures
# pages about jobs that worked. Give the long ones the time they take; the
# flat 120s stays the default for everything else.
JOB_TIMEOUTS = {
    '/api/internal/login-bridge-probe': 90,   # relay: Commander's two-leg probe takes 10-30s, relay caps at 50s
    '/api/internal/pnm-integrity-refresh': 300, # exact venue queue rebuild, including polygon assessment
    '/api/cron/trivia-theme-backfill': 300,
    '/api/cron/trivia-embed-backfill': 300,
    '/api/cron/trivia-player-retag':   300,
    '/api/cron/horse-posts':           600,   # up to 80 publishes, 540s internal deadline
    '/api/cron/horses-social-all':     600,
    '/api/cron/scrape-sports-clips':   300,
    '/api/cron/scrape-poker-clips':    300,
    '/api/cron/revalidate-poker-clips': 120,
    # SCRIPT_JOBS (2026-09-04). These are subprocesses, and for a subprocess
    # the timeout IS a kill - subprocess.run() sends SIGKILL and the day's
    # ingestion stops wherever it was. The scraper walks 23 YouTube channels
    # through yt-dlp (up to 60s each) and then enriches every new video, so a
    # real run is minutes, not two. The reels bridge is fast but shares the
    # discipline: never kill a writer at 120s.
    '/api/cron/video-library-scraper':  1800,
    '/api/cron/video-library-reels':     900,
    '/api/cron/video-library-backfill': 1800,
    '/api/cron/video-library-purge':    1800,
    '/api/cron/video-library-views':    1800,
}
def job_timeout(path: str) -> int:
    return JOB_TIMEOUTS.get(path, REQUEST_TIMEOUT)

# ─── Phase 2A gate criterion: Hetzner monitoring + alerting (2026-04-25) ──────
# Plan line 285: "Dashboard/alerting on Hetzner up: at minimum a weekly log
# summary + PagerDuty/SMS if the dispatcher dies for >10 min." Implementation:
#   * Internal _workers-healthcheck cron pings http://10.0.0.3:8081/health
#     every 5 min; SMS-alerts after 2 consecutive failures (~10 min outage).
#   * Internal _heartbeat cron logs ALIVE every 15 min so journalctl shows
#     liveness; external scrape of the journal would catch a dead dispatcher.
# Twilio credentials come from the systemd EnvironmentFile and are required for
# paging. Missing credentials leave alerts pending so the next run retries.
TWILIO_SID    = os.environ.get('TWILIO_ACCOUNT_SID', '').strip()
TWILIO_TOKEN  = os.environ.get('TWILIO_AUTH_TOKEN', '').strip()
TWILIO_FROM   = os.environ.get('TWILIO_PHONE_NUMBER', '').strip()
ADMIN_PHONE   = os.environ.get('ADMIN_PHONE', '').strip()
WORKERS_HEALTH_URL = (os.environ.get('WORKERS_BASE_URL', '').strip() or 'http://10.0.0.3:8081') + '/health'

# In-memory consecutive-failure counter for the workers healthcheck.
# Resets to 0 on success. Alerts at 2 (~10 min after first failure since
# the cron runs every 5 min). After alerting, suppresses further alerts
# until success+alert-clear cycle completes (avoids SMS storm).
_workers_health_state = {'consec_fail': 0, 'alert_sent': False}

# Same shape as above, for the auth-drift watchdog (added 2026-08-17).
_auth_drift_state = {'consec_fail': 0, 'alert_sent': False}

# Public Poker Near Me directory monitor. This deliberately observes the same
# API and published snapshot a visitor receives; it never refreshes or mutates
# either source. Samples remain bounded across the dispatcher process lifetime.
_pnm_directory_health_state = {
    'consec_fail': 0,
    'alert_sent': False,
    'latencies_ms': deque(maxlen=96),
}
_CONFIG_WARNINGS = []

def _env_number(name, default, caster, minimum, maximum):
    raw = os.environ.get(name, str(default)).strip()
    try:
        value = caster(raw)
        if value < minimum or value > maximum:
            raise ValueError('out of range')
        return value
    except (TypeError, ValueError):
        _CONFIG_WARNINGS.append(f'{name}={raw!r} is invalid; using {default}')
        return default

PNM_DIRECTORY_WARN_MS = _env_number('PNM_DIRECTORY_WARN_MS', 3000, int, 100, 120000)
PNM_SNAPSHOT_WARN_DAYS = _env_number('PNM_SNAPSHOT_WARN_DAYS', 21, int, 1, 365)
PNM_SNAPSHOT_MAX_DAYS = _env_number('PNM_SNAPSHOT_MAX_DAYS', 30, int, 2, 730)
PNM_MAX_DRIFT_COUNT = _env_number('PNM_MAX_DIRECTORY_DRIFT_COUNT', 5, int, 0, 10000)
PNM_MAX_DRIFT_PERCENT = _env_number('PNM_MAX_DIRECTORY_DRIFT_PERCENT', 2.0, float, 0.0, 100.0)
if PNM_SNAPSHOT_WARN_DAYS >= PNM_SNAPSHOT_MAX_DAYS:
    _CONFIG_WARNINGS.append('PNM snapshot warning age must be below the failure age; using 21/30 days')
    PNM_SNAPSHOT_WARN_DAYS, PNM_SNAPSHOT_MAX_DAYS = 21, 30

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
for _config_warning in _CONFIG_WARNINGS:
    log.warning(f'[config] {_config_warning}')


# ─── Alert de-duplication that SURVIVES A RESTART (2026-08-31) ────────────────
#
# WHY. The three watchdogs below each carried their own in-memory
# {'consec_fail', 'alert_sent'} dict. That state is destroyed on every process
# start, so a restart re-armed every alert and the next probe re-paged for a
# condition the operator had already been told about. It is not theoretical:
# `systemctl restart openclaw` runs several times a day (deploy-openclaw.sh,
# and any agent touching /etc/openclaw.env), and on 2026-08-31 a single
# three-hour CRON_SECRET drift produced FOUR identical SMS to Dan's phone —
# 09:15, 11:55, 13:45 and 13:55 UTC — one per restart, not one per incident.
# Repeat pages for a known condition are how an operator learns to ignore the
# alert that matters.
#
# WHAT. Alert state is written to disk after every watchdog run and reloaded at
# boot, and _alert() additionally refuses to repeat the SAME alert text for the
# same monitor inside ALERT_MIN_REPEAT_S. Two independent belts: the file
# covers the ordinary restart, the cooldown covers a wiped/unwritable file.
#
# WHAT THIS MUST NEVER BECOME: a mute. A NEW failure text pages immediately, a
# recovery ALWAYS pages (it is what closes the incident), and the cooldown is a
# floor on repetition, never a ceiling on detection — the ERROR lines in the
# journal are written on every single failing run regardless.
ALERT_STATE_PATH = Path(os.environ.get('OPENCLAW_ALERT_STATE',
                                       '/var/lib/openclaw/alert-state.json'))
ALERT_MIN_REPEAT_S = _env_number('ALERT_MIN_REPEAT_S', 21600, int, 60, 604800)

_alert_persist = {}

def _alert_state_load():
    """Best-effort. A missing or corrupt file must never stop the dispatcher."""
    global _alert_persist
    global ALERT_STATE_PATH
    if not ALERT_STATE_PATH.exists() and (LOG_DIR / 'alert-state.json').exists():
        ALERT_STATE_PATH = LOG_DIR / 'alert-state.json'
    try:
        _alert_persist = json.loads(ALERT_STATE_PATH.read_text(encoding='utf-8'))
        if not isinstance(_alert_persist, dict):
            raise ValueError('alert state is not an object')
        log.info(f'[alert] restored de-dup state for {len(_alert_persist)} monitor(s) '
                 f'from {ALERT_STATE_PATH}')
    except FileNotFoundError:
        _alert_persist = {}
        log.info(f'[alert] no prior state at {ALERT_STATE_PATH}; starting clean')
    except Exception as e:
        _alert_persist = {}
        log.warning(f'[alert] state unreadable ({type(e).__name__}: {e}); '
                    'starting clean — a repeat page is possible this cycle')


def _alert_state_save():
    # The service runs as the unprivileged `openclaw` user, which cannot create
    # /var/lib/openclaw itself on a box where the bootstrap never made it — and
    # an unwritable state file silently returns us to re-paging on restart,
    # which is the whole defect. So fall back to LOG_DIR, which the unit already
    # owns, rather than giving up.
    global ALERT_STATE_PATH
    for attempt, target in enumerate((ALERT_STATE_PATH, LOG_DIR / 'alert-state.json')):
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_suffix('.tmp')
            tmp.write_text(json.dumps(_alert_persist, sort_keys=True), encoding='utf-8')
            tmp.replace(target)
            if attempt:
                log.warning(f'[alert] {ALERT_STATE_PATH} is not writable; '
                            f'de-dup state now lives at {target}')
                ALERT_STATE_PATH = target
            return
        except Exception as e:
            last = f'{type(e).__name__}: {e}'
    # Losing the file costs a duplicate page, not a missed one. Never fatal.
    log.warning(f'[alert] could not persist state anywhere: {last}')


def _alert_bind(key, state):
    """Rehydrate one watchdog's in-memory dict from the persisted copy."""
    saved = _alert_persist.get(key) or {}
    state['_key'] = key
    if isinstance(saved.get('consec_fail'), int):
        state['consec_fail'] = saved['consec_fail']
    state['alert_sent'] = bool(saved.get('alert_sent'))
    return state


def _alert_flush(state):
    key = state.get('_key')
    if not key:
        return
    entry = _alert_persist.setdefault(key, {})
    entry['consec_fail'] = state.get('consec_fail', 0)
    entry['alert_sent'] = bool(state.get('alert_sent'))
    _alert_state_save()


def _alert(state, body, recovery=False):
    """Page, unless this exact text already went out inside the cooldown.

    Returns the value the caller should store in state['alert_sent'] — True
    once the operator has been told, so a suppressed duplicate still counts as
    "already notified" and does not re-arm on the next run.
    """
    key = state.get('_key', 'unknown')
    entry = _alert_persist.setdefault(key, {})
    digest = hashlib.sha256(body.encode('utf-8')).hexdigest()[:16]
    now = time.time()

    if recovery:
        # A recovery always goes out: it is the message that closes the loop.
        sent = _send_sms(body)
        entry['last_digest'] = None
        entry['last_sent_at'] = now if sent else entry.get('last_sent_at')
        return sent

    age = now - float(entry.get('last_sent_at') or 0)
    if entry.get('last_digest') == digest and age < ALERT_MIN_REPEAT_S:
        log.warning(f'[alert] suppressed duplicate for {key} '
                    f'(same text, {int(age)}s < {ALERT_MIN_REPEAT_S}s cooldown); '
                    f'condition still failing — see the ERROR lines above')
        return True

    sent = _send_sms(body)
    if sent:
        entry['last_digest'] = digest
        entry['last_sent_at'] = now
    return sent



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
    # Union -> club weekly square-up statement (2026-08-20).
    # Delivery is the CLUB MESSENGER, not email: the statement is written into
    # conversations + messages as message_type 'invoice' with the breakdown in
    # metadata, plus a notification that the existing trigger mirrors to push.
    # Nothing here sends mail.
    # fn_union_settlement_cascade round 4 already issues and delivers from
    # inside Postgres at Mon 00:10 UTC (pg_cron job union-weekly-rakeback-close);
    # this later fire is the safety net if that did not run. Both paths are
    # idempotent - one invoice per club per period, and message_sent stops a
    # statement going out twice - so the double-up costs nothing.
    # Route lives outside pages/api/cron/ on purpose: CLAUDE.md section 11.3
    # blocks net-new files there, so this uses the /api/news/digest pattern of
    # a CRON_SECRET bearer on a normal route.
    ('/api/club-arena/union-invoice?action=send', dict(day_of_week='mon', hour=13, minute=0)),
    # Scheduled messages (2026-08-21). messenger_scheduled had been write-only
    # since it shipped: the UI queues a message and lists it, and nothing
    # anywhere ever selected a due row and sent it. fn_messenger_dispatch_
    # scheduled claims rows FOR UPDATE SKIP LOCKED so overlapping runs cannot
    # double-send, which makes the cadence safe to run often. Route lives
    # outside pages/api/cron/ for the same reason as the invoice job above.
    ('/api/messenger/dispatch-scheduled',         dict(minute='*/5')),
    # Club Commander login-bridge probe (2026-09-04). The Smarter.Poker ->
    # Commander handshake was broken for days on 2026-09-03 and nothing paged.
    # This is the probe's PRIMARY schedule (hub CLAUDE.md 10.9: never the
    # Claude scheduler; the GitHub cron in the commander repo is best-effort
    # and files the issue). The path is a HUB relay
    # (pages/api/internal/login-bridge-probe.js): it checks the same
    # CRON_SECRET bearer as every other job, then calls
    # commander.smarter.poker/api/internal/login-bridge-probe with a ticket
    # signed by SUPABASE_JWT_SECRET, which both Vercel projects hold by
    # construction. The first version pointed straight at the commander
    # rewrite and needed a CRON_SECRET COPY on the commander project; its
    # first live run 401'd on a drifted copy. Commander runs both legs
    # (structural + signed-in with its PROBE_LOGIN_* credentials), records the
    # run in cron_execution_log as /commander/internal/login-bridge-probe, and
    # sends commander.probe.login_bridge_failed to Sentry on any failure. The
    # relay returns Commander's status verbatim; two non-200s in a row page
    # (CRITICAL_JOBS).
    ('/api/internal/login-bridge-probe',            dict(minute=22)),      # hourly at :22 - off the quarter-hours
    # Club Arena table-socket probe (2026-09-06, Realtime Programme phase 6).
    # A synthetic client that does what a PLAYER does: signs in, opens a real
    # WebSocket to a table that is dealing, and waits for the first SNAPSHOT.
    #
    # It exists because on 2026-09-03 every Club Arena table said "Reconnecting
    # To The Table" for twenty-two hours while every monitor stayed green -
    # /api/health (the engine was healthy), the lobby (PostgREST checks a JWT's
    # signature, not its session) and login-probe (GoTrue was issuing tokens
    # perfectly; this platform's own cron was revoking them a moment later).
    # None of them opened a socket, which is the only thing a player does.
    #
    # Every 5 minutes, offset off the quarter-hours (login-probe) and off :22
    # (the login-bridge probe above). It is deliberately NOT paused for the
    # :55 maintenance break: the engine is genuinely away for two to three
    # minutes of every hour, and a probe that looks away for exactly that
    # window is blind to the restart handoff phase 4 exists to protect. The
    # ONE run that lands inside the break is expected to fail, which is why
    # CRITICAL_JOBS pages at THREE consecutive failures rather than two - the
    # break can eat one run, never three.
    ('/api/cron/table-socket-probe',                dict(minute='3,8,13,18,23,28,33,38,43,48,53,58')),
    # ('/api/cron/union-rakeback', ...) — RETIRED 2026-08-20. Double-payer.
    # The union 90/10 weekly rakeback is paid by the ENGINE:
    # RakebackSettlerService.runUnionWeeklyRakeback() calls
    # fn_union_weekly_rakeback_close_all every settler cycle (90% of each
    # club's own contribution basis, union keeps 10%, idempotent per
    # (union, ISO week), self-healing for missed Mondays). The workers route
    # /cron/union-rakeback instead drained 100%% of union_wallets.rake_wallet
    # and split it by commission-rate WEIGHT (50/50 for two clubs at 0.90) —
    # wrong amount, wrong allocation, and a second payer on the same wallet.
    # It only ever no-op'd because it read the dead unions.rake_wallet column;
    # the 2026-08-19 wallet-read fix armed it, so 2026-08-24 10:20 would have
    # been its first real (double) payment. Do not re-add a schedule for it —
    # same two-schedulers lesson as news-digest (CLAUDE.md section 11.4).
    ('/api/cron/scraper-watchdog',          dict(hour='*/2', minute=0)),
    ('/api/cron/venue-game-alerts',         dict(minute=0)),          # every hour
    ('/api/cron/scraper-data-cleanup',      dict(hour=3, minute=0)),
    ('/api/clawbot/orchestrator',           dict(hour=7, minute=0)),
    ('/api/cron/venue-review-prompts',      dict(hour='*/6', minute=0)),
    ('/api/cron/tour-schedule-scraper',     dict(day='*/3', hour=4, minute=0)),
    ('/api/cron/scrape-charity-schedules',  dict(day='*/3', hour=3, minute=0)),
    ('/api/cron/deploy-error-poll',         dict(minute='*/2')),       # every 2 min — autopilot build error detector
    # ── Club dashboard stats upkeep (2026-08-19) ──────────────────────────
    # Drains the club_member_daily_stats rebuild backlog and rolls
    # club_hand_daily forward. New hands are already exact via the
    # hand_history trigger; this is for HISTORY — 7,281 tables across the two
    # largest clubs were never rebuilt and the biggest holds 75,211 hands,
    # more than one statement can do inside any workable timeout. The drain is
    # time-boxed and resumable (cursor in club_stats_rebuild_log), so a run
    # that stops mid-table simply continues next time.
    ('/api/cron/club-stats-maintenance',    dict(minute='*/15')),
    # ── Player restriction housekeeping (2026-09-04, Phase 4) ─────────────
    # Two idempotent passes on ca_player_restrictions and the observation log
    # beside it: mark run-out restrictions expired, and prune observations
    # older than 30 days.
    #
    # THE EXPIRY PASS CHANGES NO BEHAVIOUR and its absence is not an outage.
    # expires_at is the clock and status is only the intent, so
    # fn_ca_player_restricted - the reader every guard calls - already treats
    # a run-out row as not binding, and fn_ca_player_restrict retires a stale
    # row itself. Nobody is ever restricted a second past their expiry. What
    # the sweep buys is an honest LIST: without it the console shows `active`
    # against somebody who is not restricted.
    #
    # THE PRUNE PASS IS THE ONE WITH A CLOCK ON IT. While
    # ca_operator_policy.restrictions_enforced is false, every entry a
    # restriction would have refused is recorded and allowed through - and the
    # fleet re-seats continuously, so one restricted horse writes a row per
    # seating attempt forever, with two indexes riding along on every insert.
    # PHASE4-CONTRACTS section 2 promised "retained by age"; this delivers it.
    #
    # HOURLY AT :20, not on the quarter hour. spin-sweep's note above records
    # what the :00/:15/:30/:45 pile-up cost it (an 8s statement timeout on a
    # 2.1s query), and :20 is also well clear of the :55 maintenance break,
    # when the platform is frozen and every table is parked.
    ('/api/cron/restriction-maintenance',   dict(minute=20)),
    # ── Spin reserve backstop (2026-08-20) ────────────────────────────────
    # fn_spin_sweep_unbooked settles any Spin that ran without booking its
    # rake + reserve movements. That failure mode throws nothing and logs
    # nothing: the game runs, the players are paid, and the ledger row simply
    # is not there. An absence raises no alert, so three live spins ran
    # unbooked after the 2026-08-20 cutover and were found only by querying
    # for the gap. The sweep is idempotent, so a schedule costs nothing; it
    # existed but only ever ran when a human typed it.
    # The handler also reports a thin or short reserve pool, which is the
    # other silent failure here — a draining pool does not error, its ladder
    # just collapses toward 2x/3x and players notice before anyone else does.
    # 30-minute lookback deliberately overlaps two runs.
    ('/api/cron/spin-sweep',                dict(minute='7,22,37,52')),  # OFF THE QUARTER-HOUR (2026-09-03): at :00/:15/:30/:45 it shared the database with every other quarter-hour job and its double-deal check (2.1s alone) hit the 8s statement timeout; 7 minutes later it has the box to itself.
    # ── Waitlist TTL sweep (2026-08-30; cadence corrected 2026-08-31) ────
    # fn_offer_open_seat applies both waitlist TTLs already, but only when a
    # seat opens AT THAT TABLE. On a table nobody leaves, nothing runs: the
    # lobby's "Waiting N" counts people who left days ago, and a player whose
    # seat offer lapsed is never told — they just stop being in the line. This
    # reaches those tables, with the same two rules and the same notification,
    # so a sweep and an offer cannot disagree.
    #
    # EVERY MINUTE, not every ten. The offer used to last three minutes and a
    # ten-minute sweep was the cheap way to announce a lapse. Dan's 2026-08-31
    # rule makes the offer a SIXTY-SECOND exclusive hold, and the sweep is now
    # what hands the seat to the next player in line (fn_sweep_stale_waitlists
    # calls fn_offer_open_seat). At */10 a queue could therefore sit still for
    # ten minutes behind a sixty-second hold nobody claimed — the seat open,
    # the next player waiting, and nothing moving. The scan is bounded to 200
    # tables and touches only rows with a live queue, so a per-minute tick on
    # an empty waitlist is one cheap RPC.
    ('/api/cron/waitlist-sweep',            dict(minute='*')),
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
    # ── Phase 4 (2026-09-06) — poker gets the renewing supply sports had ────
    # Measured over seven live days: sports drew 285 posts from a pool of
    # 8,271 scraped clips while poker drew 245 from a frozen array of 150,
    # using 114 of them in one week. The ledger then refused each for thirty
    # days, so horses fell through to sports and a POKER platform posted 53.8%
    # sports. Twice a day rather than the sports scraper's once, because the
    # poker pool starts at 113 live clips and has the further to climb; it
    # walks 25 channels per run, least-recently-scraped first.
    ('/api/cron/scrape-poker-clips',              dict(hour='5,17', minute=20)),
    # Hourly, 40 clips a run: the whole pool is re-asked well inside a week.
    # Probing the 149 hard-coded clips found 36 dead (22 gone, 14 embedding-
    # disabled) that had been postable for months, because the only validity
    # cache was a Map in process memory that died with the container.
    ('/api/cron/revalidate-poker-clips',          dict(minute=40)),
    # Both Phase 4 defects were silent for weeks and both were found by a
    # person reading rows. A queue that stops draining and a pool that stops
    # growing look exactly like a quiet week.
    ('/api/cron/content-supply-watchdog',         dict(minute=50)),
    # /api/cron/scrape-venue-info?batch=1..5 RETIRED 2026-04-25 (Phase 2B.3
    # partial cleanup). Superseded by .github/workflows/venue-scraper.yml +
    # daily_venue_scraper.py which has been the actual scraper since
    # before this dispatcher existed. The .js handler was an unused parallel
    # implementation. Handler file deleted from pages/api/cron/ in same
    # commit. No code outside this file referenced the route.
    # RETIRED 2026-09-04: /cron/venue-tournaments on workers host is retired.
    # Reasons:
    # 1. Scraping 50+ casino/venue websites from worker datacenter IPs triggers
    #    Cloudflare bot challenges and connection resets (RemoteDisconnected).
    # 2. Sequential execution exceeds HTTP keepalive limits (>100s runtime).
    # 3. Upsert targets a dropped legacy constraint and omits NOT NULL provenance columns.
    # 4. Charity schedules are handled cleanly by scrape-charity-schedules at 03:00 UTC.
    # ('/api/cron/venue-tournaments',               dict(hour=4, minute=0)),
    ('/api/cron/refresh-venue-json',              dict(hour=5, minute=0)),   # cache refresh
    ('/api/cron/news-scraper',                    dict(hour='*/2', minute=0)),
    ('/api/cron/cardplayer-scraper',              dict(hour='*/2', minute=5)),
    ('/api/cron/pokernews-videos',                dict(hour='*/3', minute=30)),
    ('/api/cron/poker-news',                      dict(hour='*/4', minute=15)),
    # Licensed Global Poker Index feed adapter. The normal /api/news path is
    # deliberate: policy forbids adding a net-new pages/api/cron route.
    ('/api/news/sync-poy',                         dict(hour=12, minute=15)),
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
    # Horses infrastructure. Fleet Content Programme phase 1 (2026-09-05,
    # workers docs/FLEET-CONTENT-PROGRAMME.md): the ten horse-batch fires
    # (100 posts/day from the 100 lowest-UUID horses) are replaced by ONE
    # hourly fleet route that asks "who is due now?" across all 1,000.
    # horses-social-all moves to hourly because its gate is now the horse's
    # awake hour, not a minute slot that only :00 fires could hit. :10 and
    # :30 keep both clear of the Club Arena :55 maintenance break and of the
    # :00 pile-up.
    ('/api/cron/horse-posts',                     dict(minute=10)),          # hourly, whole fleet
    ('/api/cron/horses-social-all',               dict(minute=30)),          # hourly, whole fleet
    ('/api/cron/horses-social-friends',           dict(hour='*/6', minute=15)),
    ('/api/cron/horses-stories',                  dict(minute='5,20,35,50')),
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
    # VIP STIPEND - repointed 2026-09-01. Was '/api/cron/vip-diamond-stipend'
    # monthly at 00:05, routed to the workers copy of a handler that had been
    # deleted from this repo on 2026-04-25. That handler paid 500 diamonds on
    # `profiles.is_vip = true AND vip_expires_at > now()` with NO payment check
    # of any kind, so it paid the 30-day signup trial, the phone-verification
    # grant, and the 1,000 horses that migration 20260311_horses_lifetime_vip
    # gave lifetime VIP for feature access. It paid 12 such accounts (6,000
    # diamonds) before this, every one with zero rows in vip_subscriptions.
    #
    # '/api/cron/vip-stipend' is the documented control: it pays only accounts
    # holding a vip_subscriptions row with a non-null stripe_subscription_id
    # and a live Stripe status. Read that file's header before changing this.
    #
    # DAILY, not monthly, and that is deliberate. The handler is idempotent per
    # user per calendar month (reference_id `vip_stipend_<user>_<YYYY-MM>` plus
    # award_diamonds_v2's own month guard), so a repeat returns 'duplicate' and
    # costs nothing. Monthly was silently fragile: misfire_grace_time is 300s,
    # and this dispatcher was down 2026-08-31 11:31 -> 2026-09-01 17:01 and
    # again 2026-06-14 -> 2026-07-18, so the 00:05 instant was missed outright
    # in both July and September. Daily also means someone who subscribes on
    # the 2nd is paid on the 2nd rather than waiting thirty days.
    ('/api/cron/vip-stipend',                     dict(hour=9, minute=0)),   # daily 09:00 UTC - idempotent per user per month  # ONLY scheduler since 2026-09-03: the vercel.json copy ('0 9 1 * *') was removed - same path, same instant on the 1st, two callers.
    ('/api/cron/collusion-scan',                  dict(minute='*/30')),       # every 30 min — 4-pattern detector incl. TIMING_CORRELATION (x67c)
    ('/api/cron/chip-supply-snapshot',            dict(minute=0)),           # hourly — M4 chip-conservation series. fn_snapshot_chip_supply existed but was never scheduled: ONE row (2026-08-08), so deltas stayed NULL and nothing ever reconciled.
    # ('/api/cron/solver-watchdog', dict(minute=20)) — RETIRED 2026-08-27.
    #
    # It ran hourly and returned HTTP 500 on 222 of its last 224 runs. Last
    # success 2026-08-18 02:12; nothing alerted on nine days of failure, which
    # is a pointed thing to be true of a watchdog.
    #
    # It never worked in its new home. The route moved to smarter-poker-workers
    # in Phase 2B, and its recording leg writes cron_health_log — a table NO
    # workers route has ever successfully written to. Every one of the fifteen
    # crons currently writing there is a World Hub monolith route under
    # pages/api/cron/. The route fails hard on that write by design ("a monitor
    # whose recording leg can fail silently is not a monitor"), so it 500s every
    # hour instead. solver_status compounds it: RLS enabled, ZERO policies, so
    # any client that is not service_role reads no machines at all.
    #
    # THE STALL IT WATCHED IS REAL AND STILL RUNNING — World Hub issue #820:
    # 6,633,013 v2 spots outstanding and no v2 solve since 2026-08-15
    # 09:57. That is recorded as an issue rather than left to a messenger that
    # cannot deliver. The solver runs on LAN machines this codebase cannot
    # reach, so the watchdog could never have fixed it either.
    #
    # To bring it back: give the workers service a client that can write
    # cron_health_log (service_role bypasses RLS; the single policy there is
    # admin-only and there is no service_role policy), add a policy to
    # solver_status, and re-add this line. Do not re-add it before that.

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
    # '/api/cron/player-stats-refresh' REMOVED 2026-09-03. It could never run:
    # the handler asks fn_refresh_player_stats for a 26-hour window, which is
    # ~130s of hand_history jsonb work against PostgREST's 8s service_role
    # statement timeout - 24 fires, 24 timeouts, every day. The stats were
    # never stale, because pg_cron job `refresh-player-stats-hourly` (jobid 76,
    # '17 * * * *', 90-minute window, advisory-locked, 24/24 succeeded, ~10s)
    # has been doing the same work INSIDE Postgres where no PostgREST timeout
    # applies. Two schedulers for one job, one of them structurally unable to
    # finish. Do not re-add it here; if the pg_cron job must move to Open Claw
    # one day, the handler must first stop asking for 26 hours in one call.
    ('/api/cron/rakeback-period-settle',           dict(day_of_week='mon', hour=10, minute=30)),
    # ── 2026-09-01 — per-job silence detector ────────────────────────────
    # The 2026-08-31 CRON_SECRET skew 401'd 62 workers-routed jobs for 25
    # hours and no guard could see it: a 401 is rejected before the
    # cron_execution_log middleware runs, so the log does not go red, it goes
    # SILENT. check-cron-liveness.mjs counts failures (there were none to
    # count) and check-cron-fleet-alive.mjs asks only whether ANY job is
    # alive. This asks the per-job question - has THIS job succeeded within
    # twice its own observed p90 cadence - and appends one engine_alerts row
    # per state change. Every 15 minutes: cheap (one view read), and well
    # inside the 45-minute floor the detector uses.
    ('/api/cron/cron-staleness-watchdog',          dict(minute='*/15')),
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

    # ══ Weekly news email digest (migrated off GitHub Actions 2026-08-13) ════
    # Was .github/workflows/news-digest.yml with `schedule: '0 14 * * 2'`, which
    # is exactly what CLAUDE.md §11 forbids — and CHECK 6c had been failing on
    # every commit to main since 2026-07-31 because of it. Nothing forced it
    # GitHub-side: the handler is a plain Vercel endpoint taking a CRON_SECRET
    # bearer, which is what this dispatcher already sends.
    #
    # Tue 14:00 UTC is identical to the cron it replaces — the scheduler is
    # constructed with timezone='UTC', so no conversion is involved and
    # subscribers keep their existing slot.
    #
    # ?days=7 matches the workflow's default look-back. dryRun is deliberately
    # NOT passed: the handler treats it as false unless present, so this is a
    # real send. (The workflow defaulted dry_run=true only to make a mis-click
    # on the manual button harmless; workflow_dispatch is kept for that.)
    ('/api/news/digest?days=7',                   dict(day_of_week='tue', hour=14, minute=0)),

    # ══ WEB PUSH (VAPID) — PepNationLab parity clone, added 2026-08-19 ═══════
    # push-dispatch drains push_outbox rows that inline delivery missed (crash
    # between outbox INSERT and send, or transient FCM/APNs failure). Inline
    # delivery in push-enqueue is the primary path; this is the durability net,
    # so */5 latency is acceptable. Handler takes the standard CRON_SECRET
    # bearer this dispatcher already sends.
    # Every minute, not every 5. This is the delivery path for anything that
    # did NOT go through notify() inline -- which is most of the product, since
    # the mirror trigger picks up all 21 direct-insert routes and the DB
    # notification triggers. At */5 a seat alert or a group announcement could
    # sit five minutes before it reached a phone. The run is cheap when idle:
    # it claims a dedup slot, finds nothing pending and exits in ~1.5s.
    ('/api/cron/push-dispatch',                   dict(minute='*')),      # every minute — outbox drain
    # push-health: daily watchdog. Zombie subscriptions (accepted-but-never-
    # displayed via last_receipt_at), staff with no active subscription, VAPID
    # config drift, and dispatch liveness (via push_dispatch_runs). Alerts
    # admins in-app through notifyAdmins(). 13:00 UTC = 8am Chicago.
    ('/api/cron/push-health',                     dict(hour=13, minute=0)), # daily 13:00 UTC — push watchdog

    # ══ INTERNAL — Phase 2A monitoring/alerting (closes plan line 285 gate) ═══
    # No HTTP egress; runs in-process. SMS-alerts via Twilio on workers outage.
    ('_internal/workers-healthcheck',             dict(minute='*/5')),      # every 5 min
    ('_internal/auth-drift-watchdog',             dict(minute='*/5')),      # every 5 min — catches a rotation that missed this host
    ('_internal/pnm-directory-health',            dict(minute=35)),         # hourly — live/snapshot parity, age, and latency
    ('/api/internal/pnm-integrity-refresh',        dict(hour=5, minute=20)), # daily — elapsed-time freshness + exact anomaly queue
    ('_internal/heartbeat',                       dict(minute='*/15')),     # every 15 min
]

# Legacy alias — kept through Wave 1 as a guardrail for any external tooling
# that still imports the old name. Safe to remove in a follow-up once
# confirmed nothing else reads it. Both names refer to the same list object.
OVERFLOW_CRONS = ALL_CRONS


# Host-portability (2026-08-29). SCRAPER_PY used to resolve only against
# Path.home()/'Documents'/... — Dan's Mac. On the Hetzner dispatcher the file was
# absent, should_skip_on_secondary() skipped all five video-library jobs every
# day, and the skip was logged as normal operation. Video ingestion therefore
# depended on a laptop process staying alive; when it stopped on 2026-04-22 the
# library froze for 129 days and nothing alerted.
#
# Resolution order: SP_SCRAPER_DIR env override, then the repo this dispatcher
# is deployed from, then the historical Mac path. The Mac keeps working
# unchanged; Hetzner now works too once the scripts are deployed alongside it.
_SCRAPER_DIR_CANDIDATES = [
    Path(os.environ['SP_SCRAPER_DIR']) if os.environ.get('SP_SCRAPER_DIR') else None,
    Path(__file__).resolve().parent,
    Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / 'scripts',
]


def _resolve_script(filename: str) -> str:
    """First existing candidate wins; fall back to the Mac path so the
    not-present branch in the job wrapper still logs a meaningful path."""
    for base in _SCRAPER_DIR_CANDIDATES:
        if base and (base / filename).exists():
            return str(base / filename)
    return str(_SCRAPER_DIR_CANDIDATES[-1] / filename)


SCRAPER_PY = _resolve_script('video_library_scraper.py')

# ─── Jobs that invoke a local Python script instead of a Vercel HTTP endpoint ─
# Maps cron path → list of args passed to `python3 SCRAPER_PY`.
# Only used as a primary-role fallback for the Mac dispatcher. On secondary
# (Hetzner), any path in WORKERS_PREFERRED below fires via HTTP instead.
# 2026-08-15: '--sync-captions' is NOT a flag of video_library_scraper.py
# (its argparse accepts only --dry-run/--source/--purge/--backfill/
# --refresh-views/--tag-backfill), so this job exited 2 every night and new
# library videos never reached social_reels. The flag belongs to
# video_library_to_reels.py, which no scheduler referenced at all.
# SCRIPT_JOB_SCRIPTS overrides the script per path; default stays SCRAPER_PY.
REELS_BRIDGE_PY = _resolve_script('video_library_to_reels.py')

SCRIPT_JOB_SCRIPTS = {
    '/api/cron/video-library-reels': REELS_BRIDGE_PY,
}

# 2026-09-04: '--sync-captions' IS a flag of video_library_to_reels.py, but it
# is the caption-only mode: it rewrites captions of reels that already exist
# and returns before the bridge runs. Scheduled that way, no new library video
# could ever reach social_reels - the last video_library reel was written
# 2026-04-22 while the library gained 185 videos on 2026-08-30. The daily job
# now runs the bridge itself, bounded to the newest 100 library videos by
# published_at (the bridge stamps created_at = now(), so an unbounded run
# after a gap would drop the whole backlog onto the feed in one burst; the
# backlog is a deliberate manual run: `video_library_to_reels.py` with no
# --limit). Caption sync is folded into the end of every bridge run.
SCRIPT_JOBS = {
    '/api/cron/video-library-scraper':  [],                   # full daily run
    '/api/cron/video-library-reels':    ['--limit', '100'],   # bridge newest 100 → social_reels, then caption sync
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
    # REMOVED: These must run locally via Python; workers HTTP routes just report status.
    #
    # EXCEPT video-library-reels, restored here 2026-09-06. It was a SCRIPT_JOB
    # not in this map, so `_should_skip_on_secondary` skipped it on the ONLY
    # host that fires - the library gained 1,573 videos between 2026-04-22 and
    # today while the reels feed gained none, and the daily job reported itself
    # as running the whole time. A 2026-09-04 pass corrected the script's flag
    # from --sync-captions to --limit 100, which was right and changed nothing,
    # because the script never executes on that host.
    #
    # The workers route now does BOTH halves - caption sync and the bridge -
    # so routing it here is what makes the fix reachable.
    '/api/cron/video-library-reels':    '/cron/video-library-reels',
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
    # '/api/cron/union-rakeback' mapping removed with its schedule (retired
    # 2026-08-20, see ALL_CRONS note) so a re-added schedule cannot silently
    # fire the wrong payer.

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
    '/api/cron/chip-supply-snapshot':          '/cron/chip-supply-snapshot',
    # '/api/cron/solver-watchdog' — retired 2026-08-27, see the schedule block above.
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
    # '/api/cron/venue-tournaments':           '/cron/venue-tournaments', # RETIRED 2026-09-04
    # '/api/cron/vip-diamond-stipend' - REMOVED 2026-09-01. Nothing schedules it
    # any more (see the VIP STIPEND note in the schedule block above), and
    # leaving the mapping would let any future re-add of that path route
    # silently back to the is_vip-based worker route that pays non-payers.
    # '/api/cron/vip-stipend' is deliberately NOT in this table: it must run on
    # Vercel, where the monolith handler and its vip_subscriptions control live.
    '/api/cron/vip-status-check':              '/cron/vip-status-check',
    '/api/clawbot/orchestrator':               '/cron/clawbot-orchestrator',
    # ─── 2B.2(h) — late add: scrape-sports-clips ───────────────────────────
    # Re-probed after fixing 30s timeout in the test harness — workers
    # responds 200 in ~40s with same payload shape as monolith
    # (channels_scraped:38, found:100). Dispatcher REQUEST_TIMEOUT=120s
    # easily covers it.
    '/api/cron/scrape-sports-clips':           '/cron/scrape-sports-clips',
    # ─── Phase 4 (2026-09-06) — poker clip supply, all three workers-side ──
    # These live in the workers repo beside the sports scraper they are
    # modelled on; there is no monolith handler for any of them.
    '/api/cron/scrape-poker-clips':            '/cron/scrape-poker-clips',
    '/api/cron/revalidate-poker-clips':        '/cron/revalidate-poker-clips',
    '/api/cron/content-supply-watchdog':       '/cron/content-supply-watchdog',
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
    # horse-batch/0..9 retired 2026-09-05 (Fleet Content Programme phase 1);
    # the workers routes remain as a hand-over shim until the next cleanup.
    '/api/cron/horse-posts':                   '/cron/horse-posts',
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
    '/api/cron/cron-staleness-watchdog':       '/cron/cron-staleness-watchdog',
    # player-stats-refresh and rakeback-period-settle were REMOVED from this
    # map on 2026-08-31: both now have real handlers in this repo
    # (pages/api/cron/), so routing them to the workers VM sends them to a
    # service that was never built. Verified live that day — Open Claw fired
    # player-stats-refresh at 11:15 UTC and the Vercel handler never saw it,
    # while every Vercel-native cron in the same minute ran normally. A path
    # belongs in this map only while its ONLY implementation is on the
    # workers VM.
    '/api/cron/anti-cheat-multi-account':      '/cron/anti-cheat-multi-account',
    '/api/cron/anti-cheat-bot-timing':         '/cron/anti-cheat-bot-timing',
    '/api/cron/anti-cheat-chip-dump':          '/cron/anti-cheat-chip-dump',
}


def _workers_dispatch(path: str) -> bool:
    """True if this firing should go to the workers VM instead of Vercel."""
    return bool(WORKERS_BASE_URL) and path in WORKERS_PREFERRED


# ─── Critical jobs: page after N consecutive failures (2026-09-04) ──────────
# A job on this list is one whose FAILURE is the incident, not a symptom of
# one. The Club Commander login-bridge probe is the first: when it fails,
# nobody can sign in to Commander, and until today that produced a ⚠️ line in
# this journal, a GitHub issue, and a Sentry event that the exhausted org
# quota drops on the floor. None of those reach a phone. The workers
# healthcheck has paged on two consecutive failures since Phase 2A; this gives
# the same treatment to any job named here, through the same _alert() path
# (de-duplicated, cooldown, state persisted across restarts).
#
# Value = consecutive non-200 responses (timeouts and exceptions count) before
# the page goes out. One recovery SMS closes the loop when the job is 200 again.
# A 401 counts: for the commander probe that is CRON_SECRET drift between the
# hub and the commander Vercel project, which is exactly a failure.
CRITICAL_JOBS = {
    '/api/internal/login-bridge-probe': 2,   # hourly; 2 = ~2h of broken sign-in, never a single blip
    '/api/internal/pnm-integrity-refresh': 2, # daily; two missed exact queue rebuilds page once
    # 2026-09-04: the video-library scraper exited 1 at 06:00 UTC on five
    # consecutive days and every run was logged "executed successfully". A
    # SCRIPT_JOB exit code is a result like any other; two bad mornings page.
    '/api/cron/video-library-scraper':  2,   # daily; 2 = two days without fresh videos
    '/api/cron/video-library-reels':    2,   # daily; 2 = two days of library videos not reaching the feed
    # 2026-09-06: a synthetic client that cannot hold a Club Arena table is the
    # 2026-09-03 outage happening again, and that one ran twenty-two hours
    # because nothing anywhere was watching this. THREE, not two: the probe
    # runs every 5 minutes and one run per hour lands inside the :55
    # maintenance break, where a failure is expected. Three in a row is 15
    # minutes of tables nobody can hold, and the break can never eat three.
    '/api/cron/table-socket-probe':     3,
}
CRITICAL_RUNBOOKS = {
    '/api/internal/login-bridge-probe': 'smarter-poker-commander/docs/runbooks/login-bridge.md',
    '/api/internal/pnm-integrity-refresh': 'World-Hub .agent/audits/2026-09-05-poker-near-me-phase-6-final-closeout.md',
    '/api/cron/video-library-scraper':  'World-Hub CLAUDE.md 11.3 + journalctl -u openclaw | grep video-library',
    '/api/cron/video-library-reels':    'World-Hub CLAUDE.md 11.3 + journalctl -u openclaw | grep video-library',
    '/api/cron/table-socket-probe':     'club-arena/docs/runbooks/tables-say-reconnecting.md',
}
_critical_state = {}


def _critical_record(path: str, ok: bool, detail: str = ''):
    """Count consecutive failures for a CRITICAL_JOBS path; page and recover."""
    threshold = CRITICAL_JOBS.get(path)
    if not threshold:
        return
    st = _critical_state.get(path)
    if st is None:
        st = _alert_bind(f'critical:{path}', {'consec_fail': 0, 'alert_sent': False})
        _critical_state[path] = st
    if ok:
        if st.get('alert_sent'):
            body = (f'✅ RECOVERED {path} - 200 again after '
                    f'{st.get("consec_fail", 0)} consecutive failure(s)')
            if _alert(st, body, recovery=True):
                st['alert_sent'] = False
        st['consec_fail'] = 0
    else:
        st['consec_fail'] = int(st.get('consec_fail', 0)) + 1
        n = st['consec_fail']
        if n >= threshold:
            body = (f'🚨 CRITICAL {path} failed {n}x in a row: {detail[:160]}. '
                    f'Runbook: {CRITICAL_RUNBOOKS.get(path, "see dispatcher journal")}')
            if st.get('alert_sent'):
                log.error(f'[critical] {path} still failing ({n} consecutive); operator already paged')
            else:
                st['alert_sent'] = _alert(st, body)
        else:
            log.warning(f'[critical] {path} failure {n}/{threshold} - will page at {threshold}')
    _alert_flush(st)


def fire_cron(path: str):
    """Make an authenticated GET request to a Vercel cron endpoint (or workers when routed)."""
    if _workers_dispatch(path):
        url = f'{WORKERS_BASE_URL}{WORKERS_PREFERRED[path]}'
        target_label = 'workers'
        secret = WORKERS_CRON_SECRET
    else:
        url = f'{BASE_URL}{path}'
        target_label = 'vercel'
        secret = CRON_SECRET
    headers = {
        'Authorization': f'Bearer {secret}',
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
        resp = requests.get(url, headers=headers, timeout=job_timeout(path))
        elapsed = round(time.time() - t0, 1)
        if resp.status_code == 200:
            log.info(f'✅ {path} → {target_label} {resp.status_code} [{elapsed}s]')
            _critical_record(path, True)
        else:
            log.warning(f'⚠️ {path} → {target_label} {resp.status_code} [{elapsed}s]: {resp.text[:200]}')
            _critical_record(path, False, f'HTTP {resp.status_code} {resp.text[:120]}')
    except requests.exceptions.Timeout:
        log.error(f'❌ {path} → {target_label} TIMEOUT after {job_timeout(path)}s')
        _critical_record(path, False, f'TIMEOUT after {job_timeout(path)}s')
    except Exception as e:
        log.error(f'❌ {path} → {target_label} {type(e).__name__}: {e}')
        _critical_record(path, False, f'{type(e).__name__}: {e}')


def fire_script(path: str, extra_args: list):
    """
    Run the video_library_scraper.py with the given extra args.
    The script itself POSTs its result back to the Vercel status webhook,
    so the audit log stays up to date even though we're running locally.
    """
    cmd = [sys.executable, SCRIPT_JOB_SCRIPTS.get(path, SCRAPER_PY)] + extra_args
    log.info(f'▶ Script job {path} → {" ".join(cmd)}')
    t0 = time.time()
    timeout = job_timeout(path)
    try:
        result = subprocess.run(
            cmd,
            capture_output=False,  # let stdout/stderr flow to our log
            timeout=timeout,
        )
        elapsed = round(time.time() - t0, 1)
        if result.returncode == 0:
            log.info(f'✅ {path} script exited 0 [{elapsed}s]')
            _critical_record(path, True)
        else:
            log.warning(f'⚠️ {path} script exited {result.returncode} [{elapsed}s]')
            _critical_record(path, False, f'exit {result.returncode} after {elapsed}s')
    except subprocess.TimeoutExpired:
        log.error(f'❌ {path} script TIMEOUT after {timeout}s (killed)')
        _critical_record(path, False, f'killed at {timeout}s')
    except Exception as e:
        log.error(f'❌ {path} script {type(e).__name__}: {e}')
        _critical_record(path, False, f'{type(e).__name__}: {e}')


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
            _alert(state, f'✅ workers RECOVERED at {WORKERS_HEALTH_URL}', recovery=True)
        state['consec_fail'] = 0
        state['alert_sent'] = False
        _alert_flush(state)
        return

    state['consec_fail'] += 1
    log.warning(f'[healthcheck] workers DOWN (consec={state["consec_fail"]})')
    if state['consec_fail'] >= 2 and not state['alert_sent']:
        state['alert_sent'] = _alert(
            state,
            f'🚨 SMARTER.POKER WORKERS DOWN ~10min — {WORKERS_HEALTH_URL} not responding. '
            f'Affects {len(WORKERS_PREFERRED)} cron routes. Check '
            f'`docker ps` on workers VM (Hetzner id 127930016, IP from Keychain).'
        )
    _alert_flush(state)


def _auth_drift_watchdog_job():
    """Internal cron — proves THIS host's secrets are still accepted.

    Added 2026-08-17 after a rotation reached 2 of 8 consumers.

    What happened: a CRON_SECRET + Supabase service-key rotation landed on
    Vercel and GitHub and reached none of the workers. Every resulting failure
    was a silent 401, so nothing surfaced it. Damage before anyone noticed:
    1,203 cron 401s and 17,944 statsapi-relay 401s in six hours, two transcode
    workers dead on a revoked legacy JWT, and every production build failing
    because Vercel's copy of CRON_SECRET had picked up stray whitespace.

    Why it lives HERE rather than in a Vercel cron route: the drift is BETWEEN
    hosts. A check running on Vercel validates Vercel's copy against itself and
    always passes. This runs on the dispatcher, against the exact env the real
    jobs use, so the moment this host's secret stops being accepted the probe
    fails. It is also an internal job, so it adds no file under
    pages/api/cron/ and does not trip CHECK 6 cron governance.

    Probes rather than compares: we never need to learn the remote value, only
    whether ours is still accepted.
    """
    state = _auth_drift_state
    failures = []
    # Track what was actually PROVEN vs merely absent. First cut of this job
    # logged a bare "OK" after silently skipping the Supabase probe, because
    # this host does not hold SUPABASE_SERVICE_ROLE_KEY (verified: only
    # CRON_SECRET is in the dispatcher's environ). A watchdog that reports OK
    # for a check it never ran is the same defect it was written to catch, so
    # every run now names its coverage.
    verified = []
    absent = []

    secret = os.environ.get('CRON_SECRET', '')
    # The exact defect that broke every build on 2026-08-16. Vercel rejects
    # header values with surrounding whitespace at build time, and its error
    # names the variable but not the host, which makes it easy to "fix" in the
    # wrong place. Catch it locally and say so plainly.
    if not secret:
        failures.append('CRON_SECRET is empty on this host')
    elif secret != secret.strip():
        failures.append('CRON_SECRET has leading/trailing whitespace')
    else:
        try:
            # MUST be a route that actually validates the secret and does no
            # work. /api/health is PUBLIC — it returns 200 with no header and
            # 200 with a garbage header, so probing it proved nothing. Every
            # other gated route performs real work on success. Hence the
            # dedicated no-side-effect boundary at /api/internal/cron-auth-probe.
            r = requests.get('https://smarter.poker/api/internal/cron-auth-probe',
                             headers={'Authorization': f'Bearer {secret}'}, timeout=10)
            if r.status_code == 401:
                failures.append('CRON_SECRET rejected by production (401) - rotation did not reach this host')
            elif r.status_code == 200 and '"secretMalformed":true' in r.text.replace(' ', ''):
                failures.append("production's own CRON_SECRET has surrounding whitespace - builds will fail")
                verified.append('CRON_SECRET')
            elif r.status_code == 404:
                absent.append('CRON_SECRET probe endpoint not deployed yet (404)')
                log.warning('[auth-drift] probe endpoint missing (404) - deploy pending?')
            else:
                verified.append('CRON_SECRET')
        except Exception as e:
            log.warning(f'[auth-drift] CRON_SECRET probe inconclusive: {type(e).__name__}: {e}')

    sb_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    sb_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL',
                            'https://kuklfnapbkmacvwxktbh.supabase.co').rstrip('/')
    if not sb_key:
        # Legitimate on the dispatcher, which routes HTTP and holds no service
        # key. Recorded explicitly so "OK" can never be mistaken for "both
        # credentials proven".
        absent.append('SUPABASE_SERVICE_ROLE_KEY (not held on this host)')
    if sb_key:
        try:
            r = requests.get(f'{sb_url}/rest/v1/rake_records?select=id&limit=1',
                             headers={'apikey': sb_key,
                                      'Authorization': f'Bearer {sb_key}'}, timeout=10)
            if r.status_code == 401:
                kind = 'legacy JWT' if sb_key.startswith('eyJ') else 'key'
                failures.append(f'SUPABASE_SERVICE_ROLE_KEY rejected (401) - this host holds a revoked {kind}')
            else:
                verified.append('SUPABASE_SERVICE_ROLE_KEY')
        except Exception as e:
            log.warning(f'[auth-drift] supabase probe inconclusive: {type(e).__name__}: {e}')

    # ── The workers hop (added 2026-09-01) ─────────────────────────────────
    #
    # This watchdog was written for exactly this failure and did not cover it.
    # It proved CRON_SECRET against Vercel and stopped, so when the dispatcher
    # was authenticated to Vercel and rejected by the workers VM it reported
    # "OK - verified: CRON_SECRET" for a full day while 58 jobs 401'd, horses
    # posted nothing and the stories row emptied. The workers healthcheck could
    # not catch it either: /health takes no Authorization header, so it stayed
    # green throughout.
    #
    # The probe needs a boundary on workers that runs auth and then does no
    # work. Every real /cron/* route does work on success, so we deliberately
    # request a path that does not exist: the Bearer middleware is mounted on
    # /cron/* ahead of routing, so a REJECTED secret answers 401 and an
    # ACCEPTED one falls through to 404. 404 is therefore the pass condition,
    # and nothing is executed either way.
    if WORKERS_BASE_URL and WORKERS_PREFERRED:
        if not WORKERS_CRON_SECRET:
            failures.append('WORKERS_CRON_SECRET is empty and CRON_SECRET is too - workers routes cannot authenticate')
        else:
            probe_headers = {'Authorization': f'Bearer {WORKERS_CRON_SECRET}'}
            if DISPATCHER_PRIVATE_IP:
                probe_headers['X-Forwarded-For'] = DISPATCHER_PRIVATE_IP
            try:
                r = requests.get(f'{WORKERS_BASE_URL}/cron/__auth_probe_no_such_route__',
                                 headers=probe_headers, timeout=10)
                if r.status_code == 401:
                    failures.append(
                        f'workers secret rejected (401) by {WORKERS_BASE_URL} - '
                        f'all {len(WORKERS_PREFERRED)} workers-routed jobs are dead')
                elif r.status_code == 404:
                    verified.append('WORKERS_CRON_SECRET')
                else:
                    # Unexpected shape. Say so rather than counting it as proof.
                    absent.append(f'workers auth probe inconclusive (HTTP {r.status_code})')
                    log.warning(f'[auth-drift] workers probe returned HTTP {r.status_code}, expected 401 or 404')
            except Exception as e:
                log.warning(f'[auth-drift] workers probe inconclusive: {type(e).__name__}: {e}')
    else:
        absent.append('WORKERS_CRON_SECRET (no workers routing configured on this host)')

    if not failures:
        if state['alert_sent']:
            _alert(state,
                   'smarter.poker auth drift RESOLVED - dispatcher secrets accepted again',
                   recovery=True)
        state['consec_fail'] = 0
        state['alert_sent'] = False
        _alert_flush(state)
        cov = 'verified: ' + (', '.join(verified) if verified else 'NOTHING')
        if absent:
            cov += ' | not checked: ' + '; '.join(absent)
        log.info(f'[auth-drift] OK - {cov}')
        # Proving nothing is not passing. If every probe was skipped the job is
        # decorative, and decorative monitoring is what let today happen.
        if not verified:
            log.error('[auth-drift] NO CREDENTIAL WAS ACTUALLY VERIFIED - this watchdog is not covering anything on this host')
        return

    state['consec_fail'] += 1
    for f in failures:
        log.error(f'[auth-drift] {f}')
    # Two strikes before paging. A single failure can be a transient network
    # blip, and a false alert at 3am trains people to ignore the real one.
    if state['consec_fail'] >= 2 and not state['alert_sent']:
        state['alert_sent'] = _alert(
            state,
            'SMARTER.POKER SECRET DRIFT - ' + '; '.join(failures) +
            '. A rotation likely did not reach this host; cron jobs and/or '
            'workers are silently 401ing.'
        )
    _alert_flush(state)


def _percentile(values, percentile):
    """Nearest-rank percentile for the small bounded latency sample."""
    ordered = sorted(values)
    if not ordered:
        return None
    index = max(0, min(len(ordered) - 1, int((percentile / 100) * len(ordered) + 0.9999) - 1))
    return ordered[index]


_PNM_VOLATILE_FIELDS = {
    'last_checked_at', 'last_scraped', 'last_scraped_at',
    'last_successful_scrape', 'last_verified_at', 'next_check_at',
    'scrape_status', 'updated_at',
}

def _pnm_canonical_material(value):
    if isinstance(value, list):
        return [_pnm_canonical_material(entry) for entry in value]
    if not isinstance(value, dict):
        return value
    return {
        key: _pnm_canonical_material(value[key])
        for key in sorted(value)
        if key not in _PNM_VOLATILE_FIELDS
    }


def _pnm_json_hash(value, sort_keys=False):
    return hashlib.sha256(json.dumps(
        value, ensure_ascii=False, separators=(',', ':'), sort_keys=sort_keys
    ).encode()).hexdigest()


def _fetch_complete_pnm_directory():
    """Collect every candidate page and reject generation changes or duplicates."""
    page_size = 1000
    offset = 0
    candidate_count = None
    revision = ''
    rows = []
    for _page in range(10000):
        url = f'{BASE_URL}/api/poker/venues?view=directory&limit={page_size}&offset={offset}'
        response = requests.get(url, headers={'Accept': 'application/json'}, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(f'directory HTTP {response.status_code}')
        payload = response.json()
        page_rows = payload.get('data') if isinstance(payload, dict) else None
        if not payload.get('success') or not isinstance(page_rows, list):
            raise RuntimeError('live directory projection is invalid')
        if payload.get('degraded') is True or payload.get('data_source') == 'static_snapshot':
            raise RuntimeError('live directory is serving degraded snapshot data')
        page_revision = str(payload.get('data_revision') or response.headers.get('X-PNM-Data-Revision') or '')
        if revision and page_revision and revision != page_revision:
            raise RuntimeError('directory revision changed during pagination')
        revision = revision or page_revision
        reported_total = payload.get('total')
        try:
            reported_total = int(reported_total)
        except (TypeError, ValueError):
            reported_total = None
        if reported_total is not None:
            if candidate_count is not None and candidate_count != reported_total:
                raise RuntimeError('directory candidate count changed during pagination')
            candidate_count = reported_total
        rows.extend(page_rows)
        offset += page_size
        if (candidate_count is not None and offset >= candidate_count) or (candidate_count is None and len(page_rows) < page_size):
            break
    else:
        raise RuntimeError('directory pagination exceeded the safety limit')
    ids = [str(row.get('id')) for row in rows if row.get('id') is not None]
    if not rows or len(ids) != len(rows) or len(set(ids)) != len(ids):
        raise RuntimeError('directory pagination returned empty, missing, or duplicate identities')
    return rows, candidate_count or len(rows), revision


def _pnm_directory_health_job():
    """Observe public directory health without changing production data.

    One hourly request compares the healthy live public projection with the
    checked-in browser snapshot. Structured logs expose latency, p50/p95,
    candidate/public counts, revision, drift, and snapshot age. Two consecutive
    hard failures page once; a successful recovery clears the alert cycle.
    """
    state = _pnm_directory_health_state
    failures = []
    warnings = []
    snapshot_url = f'{BASE_URL}/data/poker-venue-directory-snapshot.json'
    started = time.monotonic()

    try:
        live_rows, candidate_count, data_revision = _fetch_complete_pnm_directory()
        latency_ms = round((time.monotonic() - started) * 1000)
        state['latencies_ms'].append(latency_ms)

        snapshot_response = requests.get(snapshot_url, headers={'Accept': 'application/json'}, timeout=30)
        if snapshot_response.status_code != 200:
            raise RuntimeError(f'snapshot HTTP {snapshot_response.status_code}')
        snapshot = snapshot_response.json()

        snapshot_rows = snapshot.get('venues') if isinstance(snapshot, dict) else None
        metadata = snapshot.get('metadata') if isinstance(snapshot, dict) else None
        if not isinstance(snapshot_rows, list) or not snapshot_rows or not isinstance(metadata, dict):
            failures.append('published snapshot is empty or invalid')

        live_ids = {str(row.get('id')) for row in (live_rows or []) if row.get('id') is not None}
        snapshot_ids = {str(row.get('id')) for row in (snapshot_rows or []) if row.get('id') is not None}
        live_projection_hash = _pnm_json_hash(live_rows or [])
        snapshot_payload_hash = _pnm_json_hash(snapshot_rows or [])
        snapshot_projection_hash = str((metadata or {}).get('projected_sha256') or '')
        if not snapshot_projection_hash or snapshot_payload_hash != snapshot_projection_hash:
            failures.append('snapshot payload hash does not match its manifest')
        projection_changed = bool(snapshot_projection_hash and live_projection_hash != snapshot_projection_hash)
        live_material_hash = _pnm_json_hash(_pnm_canonical_material(live_rows or []), sort_keys=True)
        snapshot_material_hash = _pnm_json_hash(_pnm_canonical_material(snapshot_rows or []), sort_keys=True)
        manifest_material_hash = str((metadata or {}).get('material_sha256') or '')
        if not manifest_material_hash or snapshot_material_hash != manifest_material_hash:
            failures.append('snapshot material hash does not match its manifest')
        material_changed = live_material_hash != snapshot_material_hash
        drift_count = len(live_ids.symmetric_difference(snapshot_ids))
        denominator = max(len(live_ids), len(snapshot_ids), 1)
        drift_percent = round((drift_count / denominator) * 100, 2)

        if drift_count > PNM_MAX_DRIFT_COUNT or drift_percent > PNM_MAX_DRIFT_PERCENT:
            failures.append(f'live/snapshot ID drift {drift_count} ({drift_percent}%) exceeds budget')
        elif drift_count:
            warnings.append(f'live/snapshot ID drift is {drift_count} ({drift_percent}%)')

        generated_at = str((metadata or {}).get('generated_at') or '')
        try:
            generated = datetime.fromisoformat(generated_at.replace('Z', '+00:00'))
            snapshot_age_days = round((datetime.now(timezone.utc) - generated).total_seconds() / 86400, 2)
        except (TypeError, ValueError):
            snapshot_age_days = None
            failures.append('published snapshot has no valid generated_at timestamp')

        if snapshot_age_days is not None and snapshot_age_days < -(10 / 1440):
            failures.append('published snapshot generated_at is implausibly future-dated')
        elif snapshot_age_days is not None and snapshot_age_days > PNM_SNAPSHOT_MAX_DAYS:
            failures.append(f'published snapshot is {snapshot_age_days} days old')
        elif snapshot_age_days is not None and snapshot_age_days >= PNM_SNAPSHOT_WARN_DAYS:
            warnings.append(f'published snapshot is {snapshot_age_days} days old')

        manifest_count = int((metadata or {}).get('public_count') or 0)
        if len(snapshot_ids) != len(snapshot_rows or []):
            failures.append('published snapshot contains duplicate or missing venue IDs')
        if manifest_count != len(snapshot_rows or []):
            failures.append(f'snapshot manifest count {manifest_count} does not match {len(snapshot_rows or [])} rows')
        if not failures and material_changed:
            warnings.append('live material venue content differs from the published snapshot')
        if latency_ms > PNM_DIRECTORY_WARN_MS:
            warnings.append(f'directory latency {latency_ms}ms exceeds {PNM_DIRECTORY_WARN_MS}ms target')

        samples = list(state['latencies_ms'])
        report = {
            'candidate_count': candidate_count,
            'data_revision': data_revision[:120],
            'drift_count': drift_count,
            'drift_percent': drift_percent,
            'failures': failures,
            'latency_ms': latency_ms,
            'latency_p50_ms': _percentile(samples, 50),
            'latency_p95_ms': _percentile(samples, 95),
            'public_count': len(live_ids),
            'projection_changed': projection_changed,
            'material_changed': material_changed,
            'sample_count': len(samples),
            'snapshot_age_days': snapshot_age_days,
            'snapshot_count': len(snapshot_ids),
            'snapshot_projection_hash': snapshot_projection_hash[:12],
            'snapshot_material_hash': snapshot_material_hash[:12],
            'status': 'fail' if failures else ('warning' if warnings else 'ok'),
            'warnings': warnings,
        }
        message = '[pnm-directory-health] ' + json.dumps(report, sort_keys=True, separators=(',', ':'))
        if failures:
            log.error(message)
        elif warnings:
            log.warning(message)
        else:
            log.info(message)
    except Exception as exc:
        failures.append(f'health probe failed: {type(exc).__name__}: {str(exc)[:160]}')
        log.error('[pnm-directory-health] ' + json.dumps({
            'failures': failures,
            'status': 'fail',
        }, sort_keys=True, separators=(',', ':')))

    if not failures:
        if state['alert_sent']:
            _alert(state,
                   'Poker Near Me directory health recovered; live projection and published snapshot are healthy again.',
                   recovery=True)
        state['consec_fail'] = 0
        state['alert_sent'] = False
        _alert_flush(state)
        return

    state['consec_fail'] += 1
    if state['consec_fail'] >= 2 and not state['alert_sent']:
        state['alert_sent'] = _alert(
            state,
            'Poker Near Me directory health failed twice: ' + '; '.join(failures)[:1200]
        )
    _alert_flush(state)


def _heartbeat_job():
    """Internal cron — logs ALIVE so journalctl scrapers can detect liveness."""
    routed = len(WORKERS_PREFERRED)
    total  = len(ALL_CRONS)
    log.info(f'[heartbeat] dispatcher ALIVE — {routed}/{total} routes flipped to workers')


# Internal jobs — fire by name, no HTTP path. Distinguished by underscore prefix.
_alert_state_load()
_alert_bind('workers-health', _workers_health_state)
_alert_bind('auth-drift', _auth_drift_state)
_alert_bind('pnm-directory-health', _pnm_directory_health_state)


INTERNAL_JOBS = {
    '_internal/workers-healthcheck': _workers_healthcheck_job,
    '_internal/auth-drift-watchdog': _auth_drift_watchdog_job,
    '_internal/pnm-directory-health': _pnm_directory_health_job,
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
            # Host-portability guard (2026-08-16): SCRIPT_JOBS are Mac-primary
            # (see precedence note above). On the Hetzner dispatcher these paths
            # do not exist, and spawning them anyway produced a failing subprocess
            # every scheduled tick -- that exact noise is what flagged the
            # duplicate dispatcher on reels-transcode-worker today:
            #   can't open file '.../scrape-cardplayer.py': No such file or directory
            #   script exited 2
            # Skip cleanly instead, so the same file is safe to deploy to every
            # host and the job simply runs wherever its script actually lives.
            if not os.path.exists(script_path):
                log.info(f'{path}: script not present on this host ({script_path}) - skipping')
                return
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
    # union-rakeback retired 2026-08-20 (engine pays it; see ALL_CRONS note)
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

    skip = (
        role == 'secondary'
        and path in SCRIPT_JOBS
        and path not in WORKERS_PREFERRED
    )

    # 2026-08-29: this used to return True silently and that silence cost 129
    # days of video-library ingestion. A job that is skipped on the ONLY host
    # that runs it is indistinguishable from a job that is working, so say so
    # loudly and say why. SP_ENABLE_SCRIPT_JOBS=1 opts a secondary host in once
    # the scripts are deployed alongside it (they are host-portable as of the
    # same date); the scripts upsert into Supabase, so a brief overlap with the
    # Mac dispatcher is safe.
    if skip:
        script = SCRIPT_JOB_SCRIPTS.get(path, SCRAPER_PY)
        if os.environ.get('SP_ENABLE_SCRIPT_JOBS', '').strip() in ('1', 'true', 'yes'):
            if os.path.exists(script):
                log.info(f'{path}: SCRIPT_JOB enabled on secondary → {script}')
                return False
            log.warning(
                f'{path}: SP_ENABLE_SCRIPT_JOBS is set but {script} is missing on '
                f'this host — deploy the scripts/ directory alongside the dispatcher.'
            )
        log.warning(
            f'{path}: SKIPPED on secondary (SCRIPT_JOB, script expected at {script}). '
            f'This job runs ONLY on a primary/Mac dispatcher. If no primary is '
            f'running, this work is not happening anywhere.'
        )
    return skip


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
    # 2026-08-16: job ids must be unique per REGISTRATION, not per path.
    #
    # id was `path.replace('/', '_')`, but a path may legitimately appear more
    # than once with different triggers -- one retired path was
    # registered three times (13:00, 16:00, 17:00 UTC) as deliberate
    # safety-nets. The second one raised
    #     ConflictingIdError: 'Job identifier (api_cron_<path>)
    #                          conflicts with an existing job'
    # from inside scheduler.start(), killing the process with exit 1 before a
    # single job could fire. Combined with deploy-openclaw.sh being unrunnable
    # (hardcoded to an SSH key that was never created), this file could never
    # have deployed successfully -- which is exactly why the production box
    # drifted to an older revision missing 6 jobs.
    #
    # Suffix duplicates with an occurrence counter: the first registration
    # keeps its historical id (no churn for the ~75 single-registration jobs)
    # and repeats get a stable, deterministic '#2' / '#3'.
    _id_counts = {}
    for path, trigger_kwargs in ALL_CRONS:
        if should_skip_on_secondary(path, role):
            log.info(f'  Skipped (secondary, SCRIPT_JOB): {path}')
            skipped += 1
            continue
        effective_kwargs = apply_stagger_if_secondary(path, trigger_kwargs, role)
        trigger = CronTrigger(**effective_kwargs)
        base_id = path.replace('/', '_').lstrip('_')
        _id_counts[base_id] = _id_counts.get(base_id, 0) + 1
        job_id = base_id if _id_counts[base_id] == 1 else f'{base_id}#{_id_counts[base_id]}'
        scheduler.add_job(
            make_job(path),
            trigger=trigger,
            id=job_id,
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
