#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# dev-watchdog.sh v2.0 — Multi-Port Auto-Restart Dev Server Watchdog
# ═══════════════════════════════════════════════════════════════════════════
#
# USAGE:
#   bash scripts/dev-watchdog.sh                    # watch port 3000 (default)
#   bash scripts/dev-watchdog.sh --port 4000        # watch port 4000
#   bash scripts/dev-watchdog.sh --port 5000        # watch port 5000
#   bash scripts/dev-watchdog.sh --all              # watch ports 3000, 4000, 5000
#   bash scripts/dev-watchdog.sh --once             # start once, no restart
#
# This script monitors the Next.js dev server and automatically restarts
# it if it crashes. It nukes stale .next/cache before each restart.
#
# Press Ctrl+C to stop the watchdog.
# ═══════════════════════════════════════════════════════════════════════════

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
MAX_RESTARTS=10
RESTART_DELAY=3
RESTART_COUNT=0

# Parse args
PORT=3000
ONCE=false
WATCH_ALL=false
for arg in "$@"; do
    case "$arg" in
        --once) ONCE=true ;;
        --all) WATCH_ALL=true ;;
        --port)
            # Next arg will be the port number
            ;;
        [0-9]*)
            PORT=$arg ;;
    esac
done

# Handle --port flag with next argument
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) PORT="${2:-3000}"; shift 2 ;;
        *) shift ;;
    esac
done

cd "${PROJECT_ROOT}" || exit 1

cleanup() {
    echo ""
    echo "🛑 Watchdog shutting down..."
    lsof -ti:${PORT} | xargs kill -9 2>/dev/null
    exit 0
}
trap cleanup INT TERM HUP

start_server() {
    local port=$1
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "🐕 Dev Watchdog v2.0 — Starting server on port ${port}"
    echo "   Attempt: $((RESTART_COUNT + 1))/${MAX_RESTARTS}"
    echo "   Time: $(date '+%H:%M:%S')"
    echo "═══════════════════════════════════════════════════"

    # Kill any zombie processes on this port
    lsof -ti:${port} | xargs kill -9 2>/dev/null
    sleep 1

    # Nuke stale cache (prevents corrupted .pack.gz crashes)
    # With memory-only webpack cache in next.config.js, this is mostly
    # for cleaning up node_modules/.cache if it's corrupted
    rm -rf node_modules/.cache 2>/dev/null

    # Start the dev server
    NODE_OPTIONS='--max-old-space-size=8192' npx next dev -p ${port} 2>&1 &
    SERVER_PID=$!

    echo "   PID: ${SERVER_PID}"
    echo ""

    # Wait for the server process to exit
    wait $SERVER_PID
    EXIT_CODE=$?

    return $EXIT_CODE
}

# ── Main loop ──
while true; do
    start_server $PORT
    EXIT_CODE=$?
    RESTART_COUNT=$((RESTART_COUNT + 1))

    if [ "$ONCE" = true ]; then
        echo "Server exited (code ${EXIT_CODE}). --once mode, not restarting."
        exit $EXIT_CODE
    fi

    if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
        echo ""
        echo "🔴 Max restarts (${MAX_RESTARTS}) reached. Stopping watchdog."
        echo "   Run 'npm run nuke:dev' to do a full clean restart."
        exit 1
    fi

    echo ""
    echo "⚠️  Server crashed (exit code ${EXIT_CODE}). Restarting in ${RESTART_DELAY}s..."
    echo "   Restart ${RESTART_COUNT}/${MAX_RESTARTS} | Port: ${PORT} | $(date '+%H:%M:%S')"
    sleep $RESTART_DELAY
done
