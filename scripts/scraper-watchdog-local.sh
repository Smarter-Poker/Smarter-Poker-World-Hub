#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# scraper-watchdog-local.sh v1.0 — Auto-Restart Daemon Watchdog
# ═══════════════════════════════════════════════════════════════════════════
#
# Runs every 5 minutes via launchd (com.smarter-poker.scraper-watchdog.plist).
# Checks heartbeat files written by bravo-live-daemon.py and pokeratlas-live-daemon.py.
# If a heartbeat is stale (>30 min), auto-restarts the corresponding daemon.
#
# This is the LOCAL safety net. The Vercel cron scraper-watchdog.js handles
# cloud-side alerting (SMS/push). This script handles local auto-recovery.
# ═══════════════════════════════════════════════════════════════════════════

set -u

LOG_FILE="/Users/smarter.poker/.smarter-poker/logs/scraper-watchdog.log"
BRAVO_HEARTBEAT="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/data/bravo-logs/heartbeat.json"
PA_HEARTBEAT="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/data/pokeratlas-logs/heartbeat.json"

# The simulator is the PRIMARY source for "Cash Games Running" while the Bravo
# live scraper is intentionally not run. It models per-venue/per-game/per-hour
# activity from weeks of real observed history. Nothing was watching it, so if
# it died the cash-games surface would go dark with no auto-recovery.
SIM_HEARTBEAT="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/data/bravo-logs/simulator-heartbeat.json"

BRAVO_PLIST="com.smarter-poker.bravo-daemon"
SIM_PLIST="com.smarter-poker.bravo-simulator"
PA_PLIST="com.smarter-poker.pokeratlas-daemon"

# Max heartbeat age in seconds before auto-restart (30 minutes)
MAX_HEARTBEAT_AGE=1800

# Restart once a daemon reports this many consecutive failures, even if it is
# still writing fresh heartbeats.
MAX_CONSECUTIVE_FAILURES=3

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Log with timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Rotate log if > 5 MB
LOG_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
if [ "$LOG_SIZE" -gt 5242880 ]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
  log "Log rotated (was ${LOG_SIZE} bytes)"
fi

# macOS notification (disabled)
notify() {
  : # osascript -e "display notification \"$1\" with title \"🔧 Scraper Watchdog\" sound name \"Sosumi\"" 2>/dev/null
}

# Discord webhook alert (fires even when Mac is sleeping)
# Set DISCORD_SCRAPER_WEBHOOK in ~/.zshenv or launchd env
DISCORD_WEBHOOK="${DISCORD_SCRAPER_WEBHOOK:-}"

discord_alert() {
  local message="$1"
  if [ -n "$DISCORD_WEBHOOK" ]; then
    curl -s -H "Content-Type: application/json" \
      -d "{\"content\":\"**Scraper Watchdog** — ${message}\"}" \
      "$DISCORD_WEBHOOK" > /dev/null 2>&1
    log "  Discord alert sent: ${message}"
  fi
}

# Non-zero when any recovery attempt in this run did not take. Surfaced as the
# script's exit status so launchd/logs show a failing watchdog.
RECOVERY_FAILURES=0

# Jobs already restarted during this run. Without this, a stale-heartbeat
# restart was immediately followed by check_pid_alive reading the OLD pid out of
# the not-yet-rewritten heartbeat, declaring it dead and stopping the daemon
# that had just come up.
RESTARTED_JOBS=""

already_restarted() {
  case " ${RESTARTED_JOBS} " in
    *" $1 "*) return 0 ;;
    *)        return 1 ;;
  esac
}

plist_file_for() {
  echo "/Users/smarter.poker/Library/LaunchAgents/${1}.plist"
}

# Is the job known to launchd at all?
job_loaded() {
  launchctl list "$1" >/dev/null 2>&1
}

# PID launchd currently has for the job ("-" / missing => not running).
job_pid() {
  launchctl list "$1" 2>/dev/null \
    | awk -F' = ' '/"PID"/ { gsub(/[^0-9]/, "", $2); print $2; exit }'
}

# ─────────────────────────────────────────────────────────────────────────────
# restart_daemon <name> <plist-label> <reason>
#
# Every recovery path used to be `launchctl stop/start "$plist" 2>/dev/null`
# followed by an unconditional "Restart issued" log + Discord alert. But
# `launchctl start` FAILS when the job is not loaded — exactly the state after
# launchd throttles a crash-looping daemon, or after a reboot where the plist
# was never loaded — and that failure went to /dev/null. A permanently dead
# daemon therefore produced a reassuring alert every 5 minutes.
#
# Now: capture the status, fall back to load/bootstrap, verify a live PID, and
# only claim a restart when one actually happened.
# Returns 0 on verified restart, 1 otherwise.
# ─────────────────────────────────────────────────────────────────────────────
restart_daemon() {
  local name="$1"
  local plist="$2"
  local reason="$3"
  local plist_path
  plist_path="$(plist_file_for "$plist")"

  RESTARTED_JOBS="${RESTARTED_JOBS} ${plist}"
  log "  ${name}: restart requested — ${reason}"

  launchctl stop "$plist" >/dev/null 2>&1 || true
  sleep 2

  if ! launchctl start "$plist" >/dev/null 2>&1; then
    log "  ${name}: launchctl start failed (job not loaded or throttled) — loading plist"
    if [ -f "$plist_path" ]; then
      if ! launchctl load "$plist_path" >/dev/null 2>&1; then
        launchctl bootstrap "gui/$(id -u)" "$plist_path" >/dev/null 2>&1 || true
      fi
      sleep 2
      launchctl start "$plist" >/dev/null 2>&1 || true
    else
      log "  ${name}: RESTART FAILED — plist file not found at ${plist_path}"
      RECOVERY_FAILURES=$((RECOVERY_FAILURES + 1))
      discord_alert "${name}: RESTART FAILED — plist missing at ${plist_path} (${reason})"
      return 1
    fi
  fi

  # Verify: loaded AND holding a live PID. A job that starts and dies instantly
  # is not a recovery.
  sleep 5
  if ! job_loaded "$plist"; then
    log "  ${name}: RESTART FAILED — job still not loaded in launchd"
    RECOVERY_FAILURES=$((RECOVERY_FAILURES + 1))
    discord_alert "${name}: RESTART FAILED — job not loaded in launchd (${reason})"
    return 1
  fi

  local new_pid
  new_pid="$(job_pid "$plist")"
  if [ -z "$new_pid" ] || [ "$new_pid" -eq 0 ] 2>/dev/null; then
    log "  ${name}: RESTART FAILED — job loaded but no running PID (crash loop / throttled?)"
    RECOVERY_FAILURES=$((RECOVERY_FAILURES + 1))
    discord_alert "${name}: RESTART FAILED — no running PID after start (${reason})"
    return 1
  fi

  log "  ${name}: restart verified — running as PID ${new_pid}"
  notify "${name}: restarted (${reason})"
  discord_alert "${name}: restarted, now PID ${new_pid} (${reason})"
  return 0
}

# Check heartbeat freshness
check_heartbeat() {
  local name="$1"
  local heartbeat_file="$2"
  local plist="$3"

  # No heartbeat file = daemon never started or just started
  if [ ! -f "$heartbeat_file" ]; then
    log "  ${name}: No heartbeat file — daemon may not be running"

    # Check if the daemon process exists. `launchctl load` alone was reported as
    # success without ever checking that the job came up.
    if ! job_loaded "$plist"; then
      log "  ${name}: NOT loaded in launchd — attempting to load"
      restart_daemon "$name" "$plist" "no heartbeat file, job not loaded"
    else
      local hb_pid
      hb_pid="$(job_pid "$plist")"
      if [ -z "$hb_pid" ] || [ "$hb_pid" -eq 0 ] 2>/dev/null; then
        restart_daemon "$name" "$plist" "no heartbeat file, job loaded but not running"
      else
        log "  ${name}: loaded and running as PID ${hb_pid} — waiting for first heartbeat"
      fi
    fi
    return
  fi

  # Check heartbeat age
  local now=$(date +%s)
  local file_mod=$(stat -f%m "$heartbeat_file" 2>/dev/null || echo 0)
  local age=$((now - file_mod))

  if [ "$age" -gt "$MAX_HEARTBEAT_AGE" ]; then
    local age_min=$((age / 60))
    log "  ${name}: STALE heartbeat (${age_min}min old > ${MAX_HEARTBEAT_AGE}s threshold)"
    restart_daemon "$name" "$plist" "heartbeat was ${age_min}min stale"
  else
    local age_min=$((age / 60))
    # Read status + failure streak from the heartbeat file.
    local status=$(python3 -c "import json; print(json.load(open('$heartbeat_file')).get('status', 'unknown'))" 2>/dev/null || echo "unknown")
    local fails=$(python3 -c "import json; print(int(json.load(open('$heartbeat_file')).get('consecutive_failures', 0) or 0))" 2>/dev/null || echo 0)

    # ─────────────────────────────────────────────────────────────────────
    # A FRESH HEARTBEAT IS NOT A HEALTHY HEARTBEAT.
    # The daemons keep writing heartbeats while stuck in a connect/retry
    # loop, so freshness alone reported "OK" indefinitely. On 2026-07-26 both
    # daemons sat at status=connect_failed (7 and 5 consecutive failures) for
    # hours while this watchdog logged them healthy, because status was read
    # and then thrown away. Treat a failing status as down.
    # ─────────────────────────────────────────────────────────────────────
    case "$status" in
      running|ok|healthy|scraping|idle) : ;;
      *)
        log "  ${name}: UNHEALTHY status='${status}' (${fails} consecutive failures)"
        restart_daemon "$name" "$plist" "status=${status} after ${fails} consecutive failures"
        return
        ;;
    esac

    # Healthy status but a climbing failure streak still means it is not
    # producing data; restart before the streak becomes permanent.
    if [ "$fails" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
      log "  ${name}: ${fails} consecutive failures (>= ${MAX_CONSECUTIVE_FAILURES})"
      restart_daemon "$name" "$plist" "${fails} consecutive failures"
      return
    fi

    log "  ${name}: OK (heartbeat ${age_min}min ago, status=${status}, failures=${fails})"
  fi
}

# Check if daemon PID from heartbeat is actually running
check_pid_alive() {
  local name="$1"
  local heartbeat_file="$2"
  local plist="$3"

  if [ ! -f "$heartbeat_file" ]; then
    return
  fi

  # Already restarted this run: the heartbeat still holds the pre-restart PID.
  if already_restarted "$plist"; then
    log "  ${name}: skipping PID check — already restarted this run"
    return
  fi

  local pid=$(python3 -c "import json; print(json.load(open('$heartbeat_file')).get('pid', 0))" 2>/dev/null || echo 0)
  if [ "$pid" -gt 0 ] 2>/dev/null; then
    if ! kill -0 "$pid" 2>/dev/null; then
      log "  ${name}: PID ${pid} from heartbeat is NOT running"
      restart_daemon "$name" "$plist" "heartbeat PID ${pid} was dead"
    fi
  fi
}

# ── Main ──
log "Scraper watchdog check starting..."

check_heartbeat "Bravo" "$BRAVO_HEARTBEAT" "$BRAVO_PLIST"
check_pid_alive "Bravo" "$BRAVO_HEARTBEAT" "$BRAVO_PLIST"

check_heartbeat "PokerAtlas" "$PA_HEARTBEAT" "$PA_PLIST"
check_pid_alive "PokerAtlas" "$PA_HEARTBEAT" "$PA_PLIST"

# Simulator: primary cash-games source, so it is checked like the others.
# If it is not registered with launchd the restart is a no-op and the log line
# is the alert - that is still better than the previous silence.
check_heartbeat "BravoSimulator" "$SIM_HEARTBEAT" "$SIM_PLIST"
check_pid_alive "BravoSimulator" "$SIM_HEARTBEAT" "$SIM_PLIST"

# Cash-games freshness: the simulator can be "running" yet publishing nothing.
# venue_live_tables is rewritten every cycle, so zero active venues means the
# surface is empty even though the process looks healthy.
if [ -f "$SIM_HEARTBEAT" ]; then
  sim_venues=$(python3 -c "import json;print(int(json.load(open('$SIM_HEARTBEAT')).get('venues_active',0) or 0))" 2>/dev/null || echo 0)
  sim_tables=$(python3 -c "import json;print(int(json.load(open('$SIM_HEARTBEAT')).get('tables_running',0) or 0))" 2>/dev/null || echo 0)
  if [ "$sim_venues" -eq 0 ] || [ "$sim_tables" -eq 0 ]; then
    log "  BravoSimulator: PUBLISHING NOTHING (venues=${sim_venues}, tables=${sim_tables}) - restarting"
    launchctl stop "$SIM_PLIST" 2>/dev/null
    sleep 2
    launchctl start "$SIM_PLIST" 2>/dev/null
    discord_alert "BravoSimulator: restarted - published 0 venues/0 tables (cash games surface would be empty)"
  else
    log "  BravoSimulator: publishing ${sim_tables} tables across ${sim_venues} venues"
  fi
fi

if [ "$RECOVERY_FAILURES" -gt 0 ]; then
  log "Watchdog check complete — ${RECOVERY_FAILURES} recovery attempt(s) FAILED."
  exit 1
fi

log "Watchdog check complete."
