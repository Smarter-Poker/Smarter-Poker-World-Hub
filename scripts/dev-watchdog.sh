#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# dev-watchdog.sh — Auto-restart Dev Server on Crash
# ═══════════════════════════════════════════════════════════════════════════
#
# USAGE:
#   bash scripts/dev-watchdog.sh            # start with auto-restart
#   bash scripts/dev-watchdog.sh --once     # start once, no restart
#
# This script monitors the Next.js dev server and automatically restarts
# it if it crashes. It also nukes .next/cache before each restart to
# prevent corrupted cache from causing repeated crashes.
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
ONCE=false
for arg in "$@"; do
    case "$arg" in
        --once) ONCE=true ;;
    esac
done

cd "${PROJECT_ROOT}" || exit 1

cleanup() {
    echo ""
    echo "🛑 Watchdog shutting down..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    exit 0
}
trap cleanup INT TERM HUP

start_server() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "🐕 Dev Watchdog — Starting server (attempt $((RESTART_COUNT + 1))/$MAX_RESTARTS)"
    echo "═══════════════════════════════════════════════════"

    # Kill any zombie processes on port 3000
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 1

    # Nuke stale cache (prevents corrupted .pack.gz crashes)
    rm -rf .next/cache node_modules/.cache 2>/dev/null

    # Start the dev server
    NODE_OPTIONS='--max-old-space-size=8192' npx next dev -p 3000 2>&1 &
    SERVER_PID=$!

    echo "   PID: ${SERVER_PID}"
    echo "   Port: 3000"
    echo ""

    # Wait for the server process to exit
    wait $SERVER_PID
    EXIT_CODE=$?

    return $EXIT_CODE
}

while true; do
    start_server
    EXIT_CODE=$?
    RESTART_COUNT=$((RESTART_COUNT + 1))

    if [ "$ONCE" = true ]; then
        echo "Server exited (code ${EXIT_CODE}). --once mode, not restarting."
        exit $EXIT_CODE
    fi

    if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
        echo "🔴 Max restarts (${MAX_RESTARTS}) reached. Stopping watchdog."
        echo "   Run 'npm run nuke:dev' to do a full clean restart."
        exit 1
    fi

    echo ""
    echo "⚠️  Server crashed (exit code ${EXIT_CODE}). Restarting in ${RESTART_DELAY}s... (${RESTART_COUNT}/${MAX_RESTARTS})"
    sleep $RESTART_DELAY
done
