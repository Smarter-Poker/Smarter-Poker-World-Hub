#!/usr/bin/env bash
# run.sh <repoDir> <port> <outDir> <group...>
#
# For each group: start a fresh `next dev --webpack -p PORT` in repoDir, wait
# for /api/health, render, then kill that server. A fresh server per group
# keeps dev-mode memory bounded on long runs.
#
# A group is "states:<only>" or "shoot:<only>" (<only> = comma-separated
# name filters, may be empty for everything), e.g.
#   run.sh ~/wh-main 3401 /tmp/shots/before shoot: states:club-shop,cart
# A bare group with no prefix is treated as states:<group>.
#
# Env: WIDTHS (default 393,1280), CHROME_PATH (browser override),
#      HEALTH_TRIES (default 100, 3s apart).
set -uo pipefail

if [ $# -lt 4 ]; then
  sed -n '2,15p' "$0"; exit 1
fi
REPO=$(cd "$1" && pwd); PORT=$2; OUT=$3; shift 3
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
WIDTHS=${WIDTHS:-393,1280}
LOG=/tmp/render-marketplace-dev-$PORT.log
SERVER_PID=""

stop_server() {
  if [ -n "$SERVER_PID" ]; then
    # Kill the whole process group started by setsid (next spawns workers).
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null
    for _ in $(seq 1 10); do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 1; done
    kill -KILL -- "-$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}
trap stop_server EXIT INT TERM

port_busy() { curl -s -o /dev/null --max-time 3 "http://localhost:$PORT/" ; }

status=0
for group in "$@"; do
  case "$group" in
    shoot:*) script=shoot.mjs; only=${group#shoot:} ;;
    states:*) script=states.mjs; only=${group#states:} ;;
    *) script=states.mjs; only=$group ;;
  esac

  if port_busy; then
    echo "Port $PORT is already serving; refusing to render against a server this script did not start." >&2
    exit 1
  fi

  echo "== $script ${only:-<all>} (repo $REPO, port $PORT)"
  (cd "$REPO" && exec setsid env NODE_OPTIONS=--max-old-space-size=4096 \
      node node_modules/next/dist/bin/next dev --webpack -p "$PORT" >"$LOG" 2>&1) &
  SERVER_PID=$!

  ready=0
  for _ in $(seq 1 "${HEALTH_TRIES:-100}"); do
    if curl -s -o /dev/null --max-time 5 "http://localhost:$PORT/api/health"; then ready=1; break; fi
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 3
  done
  if [ "$ready" != 1 ]; then
    echo "Dev server did not become healthy; last log lines:" >&2; tail -20 "$LOG" >&2
    stop_server; status=1; continue
  fi

  args=(--base "http://localhost:$PORT" --out "$OUT" --widths "$WIDTHS")
  [ -n "$only" ] && args+=(--only "$only")
  (cd "$REPO" && timeout 900 node "$HERE/$script" "${args[@]}") || status=1
  stop_server
done
exit $status
