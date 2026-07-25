#!/usr/bin/env python3
"""
Scraper Watchdog v2.0 — Auto-Restart Daemon Watchdog (Python)
=============================================================
Replaces the bash version that macOS Sequoia blocks via provenance.

Runs every 5 minutes via launchd. Checks heartbeat files written by
bravo-live-daemon.py and pokeratlas-live-daemon.py. If a heartbeat is
stale (>30 min), auto-restarts the corresponding daemon via launchctl.
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Config
LOG_FILE = Path.home() / '.smarter-poker' / 'logs' / 'scraper-watchdog.log'
BRAVO_HEARTBEAT = Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / 'data' / 'bravo-logs' / 'heartbeat.json'
PA_HEARTBEAT = Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' / 'data' / 'pokeratlas-logs' / 'heartbeat.json'

BRAVO_PLIST = 'com.smarter-poker.bravo-daemon'
PA_PLIST = 'com.smarter-poker.pokeratlas-daemon'
PLIST_DIR = Path.home() / 'Library' / 'LaunchAgents'

MAX_HEARTBEAT_AGE = 1800  # 30 minutes in seconds

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


def launchctl_restart(plist_label):
    """Restart a daemon via launchctl stop/start."""
    try:
        subprocess.run(['launchctl', 'stop', plist_label], capture_output=True, timeout=10)
        time.sleep(2)
        subprocess.run(['launchctl', 'start', plist_label], capture_output=True, timeout=10)
        return True
    except Exception as e:
        log(f'  launchctl restart failed: {e}')
        return False


def launchctl_load(plist_label):
    """Load a daemon plist if not loaded."""
    plist_file = PLIST_DIR / f'{plist_label}.plist'
    if plist_file.exists():
        try:
            subprocess.run(['launchctl', 'load', str(plist_file)], capture_output=True, timeout=10)
            log(f'  Loaded plist: {plist_label}')
            return True
        except Exception as e:
            log(f'  Failed to load plist: {e}')
    else:
        log(f'  Plist file not found: {plist_file}')
    return False


def check_heartbeat(name, heartbeat_file, plist_label):
    """Check heartbeat freshness and restart if stale."""
    if not heartbeat_file.exists():
        log(f'  {name}: No heartbeat file — daemon may not be running')
        # Check if daemon is loaded
        result = subprocess.run(
            ['launchctl', 'list'],
            capture_output=True, text=True, timeout=5
        )
        if plist_label not in result.stdout:
            log(f'  {name}: NOT loaded in launchd — attempting to load')
            launchctl_load(plist_label)
        return

    # Check heartbeat age
    now = time.time()
    file_mod = heartbeat_file.stat().st_mtime
    age = now - file_mod
    age_min = int(age / 60)

    if age > MAX_HEARTBEAT_AGE:
        log(f'  {name}: STALE heartbeat ({age_min}min old > {MAX_HEARTBEAT_AGE}s threshold)')
        log(f'  {name}: Auto-restarting daemon...')
        if launchctl_restart(plist_label):
            log(f'  {name}: Restart issued (launchctl stop/start)')
            notify(f'{name}: Auto-restarted (heartbeat was {age_min}min stale)')
    else:
        # Read status from heartbeat
        status = 'unknown'
        try:
            with open(heartbeat_file) as f:
                data = json.load(f)
                status = data.get('status', 'unknown')
        except Exception:
            pass
        log(f'  {name}: OK (heartbeat {age_min}min ago, status={status})')


def check_pid_alive(name, heartbeat_file, plist_label):
    """Check if daemon PID from heartbeat is actually running."""
    if not heartbeat_file.exists():
        return

    try:
        with open(heartbeat_file) as f:
            data = json.load(f)
            pid = data.get('pid', 0)
    except Exception:
        return

    if pid > 0:
        try:
            os.kill(pid, 0)  # Signal 0 = check if alive
        except ProcessLookupError:
            log(f'  {name}: PID {pid} from heartbeat is NOT running — restarting')
            if launchctl_restart(plist_label):
                log(f'  {name}: Restart issued for dead PID')
                notify(f'{name}: Restarted (PID {pid} was dead)')
        except PermissionError:
            pass  # Process exists but we don't have permission (shouldn't happen)


def main():
    rotate_log()
    log('Scraper watchdog check starting...')

    check_heartbeat('Bravo', BRAVO_HEARTBEAT, BRAVO_PLIST)
    check_pid_alive('Bravo', BRAVO_HEARTBEAT, BRAVO_PLIST)

    check_heartbeat('PokerAtlas', PA_HEARTBEAT, PA_PLIST)
    check_pid_alive('PokerAtlas', PA_HEARTBEAT, PA_PLIST)

    log('Watchdog check complete.')


if __name__ == '__main__':
    main()
