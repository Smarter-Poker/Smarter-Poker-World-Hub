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

BRAVO_PLIST="com.smarter-poker.bravo-daemon"
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
      -d "{\"content\":\"🔧 **Scraper Watchdog** — ${message}\"}" \
      "$DISCORD_WEBHOOK" > /dev/null 2>&1
    log "  Discord alert sent: ${message}"
  fi
}

# Check heartbeat freshness
check_heartbeat() {
  local name="$1"
  local heartbeat_file="$2"
  local plist="$3"

  # No heartbeat file = daemon never started or just started
  if [ ! -f "$heartbeat_file" ]; then
    log "  ${name}: No heartbeat file — daemon may not be running"

    # Check if the daemon process exists
    if ! launchctl list | grep -q "$plist"; then
      log "  ${name}: NOT loaded in launchd — attempting to load"
      local plist_file="/Users/smarter.poker/Library/LaunchAgents/${plist}.plist"
      if [ -f "$plist_file" ]; then
        launchctl load "$plist_file" 2>/dev/null
        log "  ${name}: Loaded plist"
        notify "${name} daemon loaded"
      else
        log "  ${name}: Plist file not found at ${plist_file}"
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
    log "  ${name}: Auto-restarting daemon..."

    # Unload and reload the daemon
    launchctl stop "$plist" 2>/dev/null
    sleep 2
    launchctl start "$plist" 2>/dev/null

    log "  ${name}: Restart issued (launchctl stop/start)"
    notify "${name}: Auto-restarted (heartbeat was ${age_min}min stale)"
    discord_alert "${name}: Auto-restarted (heartbeat was ${age_min}min stale)"
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
        log "  ${name}: UNHEALTHY status='${status}' (${fails} consecutive failures) — restarting"
        launchctl stop "$plist" 2>/dev/null
        sleep 2
        launchctl start "$plist" 2>/dev/null
        notify "${name}: Restarted (status=${status}, ${fails} failures)"
        discord_alert "${name}: Restarted — status=${status} after ${fails} consecutive failures"
        return
        ;;
    esac

    # Healthy status but a climbing failure streak still means it is not
    # producing data; restart before the streak becomes permanent.
    if [ "$fails" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
      log "  ${name}: ${fails} consecutive failures (>= ${MAX_CONSECUTIVE_FAILURES}) — restarting"
      launchctl stop "$plist" 2>/dev/null
      sleep 2
      launchctl start "$plist" 2>/dev/null
      notify "${name}: Restarted (${fails} consecutive failures)"
      discord_alert "${name}: Restarted — ${fails} consecutive failures"
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

  local pid=$(python3 -c "import json; print(json.load(open('$heartbeat_file')).get('pid', 0))" 2>/dev/null || echo 0)
  if [ "$pid" -gt 0 ]; then
    if ! kill -0 "$pid" 2>/dev/null; then
      log "  ${name}: PID ${pid} from heartbeat is NOT running — restarting"
      launchctl stop "$plist" 2>/dev/null
      sleep 2
      launchctl start "$plist" 2>/dev/null
      log "  ${name}: Restart issued for dead PID"
      notify "${name}: Restarted (PID ${pid} was dead)"
      discord_alert "${name}: Restarted (PID ${pid} was dead)"
    fi
  fi
}

# ── Main ──
log "Scraper watchdog check starting..."

check_heartbeat "Bravo" "$BRAVO_HEARTBEAT" "$BRAVO_PLIST"
check_pid_alive "Bravo" "$BRAVO_HEARTBEAT" "$BRAVO_PLIST"

check_heartbeat "PokerAtlas" "$PA_HEARTBEAT" "$PA_PLIST"
check_pid_alive "PokerAtlas" "$PA_HEARTBEAT" "$PA_PLIST"

log "Watchdog check complete."
