#!/usr/bin/env python3
"""
Scraper Watchdog v2.0 — Auto-Restart Daemon Watchdog (Python)
=============================================================
Replaces the bash version that macOS Sequoia blocks via provenance.

Runs every 5 minutes via launchd. Checks health contracts for every active PNM
data pipeline: the truth-gated estimator, PokerAtlas catalog daemon, daily
tournament daemon, continuously running series daemon, and periodic tour
scraper. Fresh failure heartbeats are rejected just like stale heartbeats. The
owner-disabled Bravo live scraper is deliberately outside this watchdog.
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Config
LOG_FILE = Path.home() / '.smarter-poker' / 'logs' / 'scraper-watchdog.log'
PROJECT_ROOT = Path(
    os.environ.get('SMARTER_POKER_SCRAPER_ROOT')
    or Path(__file__).resolve().parent.parent
).expanduser().resolve()
ESTIMATOR_HEARTBEAT = PROJECT_ROOT / 'data' / 'bravo-logs' / 'simulator-heartbeat.json'
PA_HEARTBEAT = PROJECT_ROOT / 'data' / 'pokeratlas-logs' / 'heartbeat.json'
DAILY_HEARTBEAT = PROJECT_ROOT / 'data' / 'tournament-logs' / 'heartbeat.json'
TOUR_HEARTBEAT = PROJECT_ROOT / 'data' / 'tour-logs' / 'heartbeat.json'

ESTIMATOR_PLIST = 'com.smarter-poker.bravo-simulator'
PA_PLIST = 'com.smarter-poker.pokeratlas-daemon'
DAILY_PLIST = 'com.smarter-poker.tournament-schedule-daemon'
SERIES_PLIST = 'com.smarter-poker.series-scraper'
TOUR_PLIST = 'com.smarter-poker.tour-scraper'
PLIST_DIR = Path.home() / 'Library' / 'LaunchAgents'

# These launchd writers are intentionally retired or owner-disabled. The daily
# tournament daemon is the sole venue_daily_tournaments writer; keeping older
# completeness/charity/PokerAtlas jobs loaded caused overlapping batches,
# unverified persistence claims, and browser contention. Bravo live remains
# owner-disabled until its source can be observed honestly again.
DISALLOWED_WRITER_PLISTS = (
    'com.smarter-poker.bravo-daemon',
    'com.smarter-poker.charity-scraper',
    'com.smarter-poker.completeness-scraper',
    'com.smarter-poker.pokeratlas-tournaments-daemon',
)

MAX_HEARTBEAT_AGE = 1800  # 30 minutes in seconds
TOUR_MAX_HEARTBEAT_AGE = 4 * 86400  # plist runs every 72h; allow one day margin
RESTARTED_JOBS = set()

# Ensure log directory exists
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)


def log(msg):
    """Log with timestamp."""
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    try:
        with open(LOG_FILE, 'a') as f:
            f.write(line + '\n')
    except Exception:
        pass


def rotate_log():
    """Rotate log if > 5MB."""
    try:
        if LOG_FILE.exists() and LOG_FILE.stat().st_size > 5 * 1024 * 1024:
            old = LOG_FILE.with_suffix('.log.old')
            LOG_FILE.rename(old)
            log('Log rotated')
    except Exception:
        pass


def notify(msg):
    """macOS notification (disabled)."""
    pass


def launch_target(plist_label):
    return f'gui/{os.getuid()}/{plist_label}'


def job_loaded(plist_label):
    try:
        result = subprocess.run(
            ['launchctl', 'print', launch_target(plist_label)],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def job_pid(plist_label):
    try:
        result = subprocess.run(
            ['launchctl', 'list', plist_label],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return None
        match = re.search(r'"PID"\s*=\s*(\d+)', result.stdout)
        return int(match.group(1)) if match else None
    except Exception:
        return None


def wait_for_job_pid(plist_label, timeout_seconds=10):
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        pid = job_pid(plist_label)
        if pid:
            return pid
        time.sleep(0.5)
    return None


def launchctl_restart(plist_label):
    """Restart a daemon and claim success only after launchd reports a PID."""
    plist_file = PLIST_DIR / f'{plist_label}.plist'
    try:
        subprocess.run(
            ['launchctl', 'stop', plist_label],
            capture_output=True, text=True, timeout=10,
        )
        time.sleep(2)
        started = subprocess.run(
            ['launchctl', 'start', plist_label],
            capture_output=True, text=True, timeout=10,
        )
        pid = wait_for_job_pid(plist_label)
        if started.returncode != 0 or not pid:
            # A loaded launchd job can legitimately have no PID while its
            # ThrottleInterval/minimum-runtime backoff is active. Booting it
            # out in that state races launchd cleanup and can leave the job in
            # a permanent "operation already in progress" loop. Preserve the
            # loaded job and let launchd perform its scheduled spawn.
            if job_loaded(plist_label):
                log(
                    f'  {plist_label} remains loaded without an immediate PID; '
                    'respecting launchd throttle/backoff'
                )
                return False
            subprocess.run(
                ['launchctl', 'bootout', launch_target(plist_label)],
                capture_output=True, text=True, timeout=10,
            )
            if not plist_file.exists():
                log(f'  launchctl restart failed: plist not found: {plist_file}')
                return False
            loaded = subprocess.run(
                ['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(plist_file)],
                capture_output=True, text=True, timeout=10,
            )
            if loaded.returncode != 0:
                detail = (loaded.stderr or loaded.stdout or '').strip()[:240]
                log(f'  launchctl bootstrap failed ({loaded.returncode}): {detail}')
                return False
            pid = wait_for_job_pid(plist_label)
        if not pid:
            log('  launchctl restart failed: no daemon PID appeared')
            return False
        RESTARTED_JOBS.add(plist_label)
        log(f'  Verified launchd PID {pid} for {plist_label}')
        return True
    except Exception as e:
        log(f'  launchctl restart failed: {e}')
        return False


def launchctl_load(plist_label):
    """Load a daemon plist if not loaded."""
    plist_file = PLIST_DIR / f'{plist_label}.plist'
    if plist_file.exists():
        try:
            result = subprocess.run(
                ['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(plist_file)],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or '').strip()[:240]
                log(f'  Failed to load plist ({result.returncode}): {detail}')
                return False
            pid = wait_for_job_pid(plist_label)
            if not pid:
                log(f'  Loaded plist but no PID appeared: {plist_label}')
                return False
            RESTARTED_JOBS.add(plist_label)
            log(f'  Loaded plist with verified PID {pid}: {plist_label}')
            return True
        except Exception as e:
            log(f'  Failed to load plist: {e}')
    else:
        log(f'  Plist file not found: {plist_file}')
    return False


def disable_disallowed_writer(plist_label):
    """Boot out a retired duplicate writer and verify that it stayed out."""

    if not job_loaded(plist_label):
        return True
    try:
        result = subprocess.run(
            ['launchctl', 'bootout', launch_target(plist_label)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0 or job_loaded(plist_label):
            detail = (result.stderr or result.stdout or '').strip()[:240]
            log(f'  DISALLOWED writer still loaded: {plist_label}: {detail}')
            return False
        log(f'  Booted out disallowed duplicate writer: {plist_label}')
        return True
    except Exception as e:
        log(f'  Failed to boot out disallowed writer {plist_label}: {e}')
        return False


def heartbeat_contract_reason(data, healthy_statuses):
    """Return an empty string only for a semantically healthy heartbeat."""
    if not isinstance(data, dict):
        return 'heartbeat payload is not an object'
    status = str(data.get('status') or '').strip().lower()
    if status not in set(healthy_statuses or ()):
        return f'nonhealthy status={status or "missing"}'
    if data.get('metrics_insert_failed') is True:
        return 'metrics_insert_failed=true'
    run_status = str(data.get('run_status') or '').strip().lower()
    if run_status and run_status not in {
        'success', 'valid_empty', 'progress', 'maintenance',
    }:
        return f'nonhealthy run_status={run_status}'
    # A fresh file is not healthy when its own current-cycle counters report a
    # source, parser, persistence, or rejection failure. This applies while a
    # cycle is running too: otherwise an indefinitely refreshed "running"
    # heartbeat can mask a scraper that has already lost part of the batch.
    failure_counters = (
        'errors', 'records_rejected', 'source_errors', 'venue_exceptions',
        'history_insert_failed', 'parse_alerts', 'write_failures',
    )
    try:
        for counter in failure_counters:
            value = data.get(counter)
            if value is True:
                return f'{counter}=true'
            if value not in (None, False, '') and int(value) > 0:
                return f'{counter}={int(value)}'
    except (TypeError, ValueError):
        return 'invalid failure counter'
    return ''


def heartbeat_pass_is_still_running(data, plist_label):
    """Return true only for an explicitly in-progress launchd-owned pass.

    A current pass can discover a source error before it finishes. The watchdog
    must report that pass as unhealthy, but killing the exact PID while it is
    writing final registry/audit state creates a restart loop. Only an explicit
    ``run_status=progress`` heartbeat owned by the current launchd PID receives
    this narrow grace period. Final partial/failed heartbeats are never exempt.
    """
    if not isinstance(data, dict):
        return False
    if str(data.get('run_status') or '').strip().lower() != 'progress':
        return False
    try:
        heartbeat_pid = int(data.get('pid') or 0)
    except (TypeError, ValueError):
        return False
    if heartbeat_pid <= 0:
        return False
    return job_pid(plist_label) == heartbeat_pid


def check_heartbeat(name, heartbeat_file, plist_label, *, healthy_statuses,
                    max_age=MAX_HEARTBEAT_AGE, restart_on_nonhealthy=True):
    """Check heartbeat freshness and semantic status, restarting on failure."""
    if not heartbeat_file.exists():
        log(f'  {name}: No heartbeat file; checking launchd state')
        pid = job_pid(plist_label)
        if pid:
            log(f'  {name}: launchd PID {pid} is initializing without a heartbeat')
            return True
        elif not job_loaded(plist_label):
            log(f'  {name}: NOT loaded in launchd; attempting to load')
            return launchctl_load(plist_label)
        else:
            log(f'  {name}: loaded without a PID; attempting verified restart')
            return launchctl_restart(plist_label)

    # Check heartbeat age
    now = time.time()
    file_mod = heartbeat_file.stat().st_mtime
    age = now - file_mod
    age_min = int(age / 60)

    if age > max_age:
        log(f'  {name}: STALE heartbeat ({age_min}min old > {max_age}s threshold)')
        log(f'  {name}: Auto-restarting daemon...')
        if launchctl_restart(plist_label):
            log(f'  {name}: Restart verified')
            notify(f'{name}: Auto-restarted (heartbeat was {age_min}min stale)')
            return True
        else:
            log(f'  {name}: Restart FAILED; manual intervention required')
            return False
    try:
        with open(heartbeat_file) as f:
            data = json.load(f)
    except Exception as exc:
        log(f'  {name}: unreadable fresh heartbeat: {exc}; restarting')
        launchctl_restart(plist_label)
        return False

    reason = heartbeat_contract_reason(data, healthy_statuses)
    if reason:
        if heartbeat_pass_is_still_running(data, plist_label):
            log(
                f'  {name}: NONHEALTHY in-progress heartbeat ({reason}); '
                'allowing the current PID to finish and reporting this check failed'
            )
            return False
        if not restart_on_nonhealthy:
            # Source-aware producers own their retry/backoff cadence. Replaying
            # a completed partial national pass every five minutes creates a
            # deterministic restart loop, consumes browser capacity, and can
            # prevent a periodic job from ever reaching its next scheduled
            # window. Keep the health check failed and visible, but reserve
            # process restarts for stale, unreadable, missing, or dead workers.
            log(
                f'  {name}: NONHEALTHY fresh heartbeat ({reason}); '
                'preserving producer backoff and reporting this check failed'
            )
            return False
        # A restart request is remediation, not proof of recovery. Keep this
        # watchdog invocation failed until a later run sees a healthy heartbeat.
        log(f'  {name}: NONHEALTHY fresh heartbeat ({reason}); restarting')
        launchctl_restart(plist_label)
        return False

    status = str(data.get('status') or '').strip().lower()
    log(f'  {name}: OK (heartbeat {age_min}min ago, status={status})')
    return True


def check_pid_alive(name, heartbeat_file, plist_label):
    """Check if daemon PID from heartbeat is actually running."""
    if plist_label in RESTARTED_JOBS:
        return True
    if not heartbeat_file.exists():
        return True

    try:
        with open(heartbeat_file) as f:
            data = json.load(f)
            pid = data.get('pid', 0)
    except Exception:
        return False

    if not isinstance(pid, int) or pid <= 0:
        replacement_pid = job_pid(plist_label)
        if replacement_pid:
            log(f'  {name}: launchd PID {replacement_pid} is running; heartbeat PID is pending')
            return True
        if not job_loaded(plist_label):
            log(f'  {name}: heartbeat has no PID and job is absent; loading')
            return launchctl_load(plist_label)
        log(f'  {name}: heartbeat has no PID and loaded job is idle; restarting')
        return launchctl_restart(plist_label)

    if pid > 0:
        try:
            os.kill(pid, 0)  # Signal 0 = check if alive
        except ProcessLookupError:
            replacement_pid = job_pid(plist_label)
            if replacement_pid and replacement_pid != pid:
                log(f'  {name}: replacement launchd PID {replacement_pid} is initializing')
                return True
            log(f'  {name}: PID {pid} from heartbeat is NOT running; restarting')
            if launchctl_restart(plist_label):
                log(f'  {name}: Restart verified for dead PID')
                notify(f'{name}: Restarted (PID {pid} was dead)')
                return True
            return False
        except PermissionError:
            return True  # Process exists but we don't have permission (shouldn't happen)
    return True


def check_required_process(name, plist_label):
    """Verify a continuously running job that has no heartbeat contract."""
    pid = job_pid(plist_label)
    if pid:
        log(f'  {name}: OK (launchd PID {pid})')
        return True
    if not job_loaded(plist_label):
        log(f'  {name}: not loaded; attempting verified load')
        return launchctl_load(plist_label)
    log(f'  {name}: loaded without a PID; attempting verified restart')
    return launchctl_restart(plist_label)


def check_periodic_tour_job():
    """Validate the 72-hour tour job without treating normal idle as dead."""
    healthy = check_heartbeat(
        'Tour schedules', TOUR_HEARTBEAT, TOUR_PLIST,
        healthy_statuses={'running', 'idle'},
        max_age=TOUR_MAX_HEARTBEAT_AGE,
        restart_on_nonhealthy=False,
    )
    if not healthy:
        return False
    try:
        with open(TOUR_HEARTBEAT) as handle:
            status = str(json.load(handle).get('status') or '').lower()
    except Exception:
        return False
    if status == 'running':
        return check_pid_alive('Tour schedules', TOUR_HEARTBEAT, TOUR_PLIST)
    if not job_loaded(TOUR_PLIST):
        log('  Tour schedules: successful idle heartbeat exists but plist is not loaded')
        launchctl_load(TOUR_PLIST)
        return False
    return True


def main():
    rotate_log()
    log('Scraper watchdog check starting...')

    healthy = True
    for plist_label in DISALLOWED_WRITER_PLISTS:
        healthy = disable_disallowed_writer(plist_label) and healthy

    healthy = check_heartbeat(
        'Historical estimator', ESTIMATOR_HEARTBEAT, ESTIMATOR_PLIST,
        healthy_statuses={'building_model', 'running', 'idle'},
    ) and healthy
    healthy = check_pid_alive(
        'Historical estimator', ESTIMATOR_HEARTBEAT, ESTIMATOR_PLIST
    ) and healthy

    healthy = check_heartbeat(
        'PokerAtlas', PA_HEARTBEAT, PA_PLIST,
        healthy_statuses={'starting', 'running', 'ok', 'idle'},
        restart_on_nonhealthy=False,
    ) and healthy
    healthy = check_pid_alive('PokerAtlas', PA_HEARTBEAT, PA_PLIST) and healthy

    healthy = check_heartbeat(
        'Daily tournaments', DAILY_HEARTBEAT, DAILY_PLIST,
        healthy_statuses={'running', 'ok'},
        restart_on_nonhealthy=False,
    ) and healthy
    healthy = check_pid_alive(
        'Daily tournaments', DAILY_HEARTBEAT, DAILY_PLIST,
    ) and healthy

    healthy = check_required_process('Poker series', SERIES_PLIST) and healthy
    healthy = check_periodic_tour_job() and healthy

    log(f"Watchdog check complete: {'healthy' if healthy else 'FAILED'}.")
    return 0 if healthy else 1


if __name__ == '__main__':
    sys.exit(main())
