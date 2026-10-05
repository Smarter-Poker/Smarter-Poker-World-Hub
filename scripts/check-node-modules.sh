#!/usr/bin/env bash
# THE SHARED node_modules IS ONE INSTALL BEHIND EVERY WORKTREE.
#
# scripts/agent-workspace.sh clones node_modules from the main clone into every
# new worktree. When the main clone's copy is gutted, every new tree inherits
# the gutting: on 2026-09-08 the World Hub clone held ONE package (typescript),
# so three worktrees claimed that day came up with no `next`, no `tsc`, and a
# pre-push hook that died on check-title-case.mjs with ERR_MODULE_NOT_FOUND.
# The usual cause is git-safe-push.sh's `git clean -fdX` (node_modules is
# gitignored) followed by an install that did not finish.
#
# This probe resolves what the hooks and the build actually need and, if the
# shared install is gutted, repairs it rather than reporting it. `npm ci` in the
# main clone installs exactly the lockfile. It is run with the browser
# downloads skipped: puppeteer's download is blocked on this Mac and takes the
# whole install down with it (AGENT-PLAYBOOK, "npm ci rolls back").
#
#     bash scripts/check-node-modules.sh           # probe, repair if broken
#     bash scripts/check-node-modules.sh --check   # probe only, exit 1 if broken
#
# Club Arena carries the same script with its own package list.
set -euo pipefail

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1
# Read-only on every Mac, including direct calls from an older provisioner.
MAC_HOST=0
if [ "$(uname -s)" = Darwin ]; then
  MAC_HOST=1
  CHECK_ONLY=1
fi

ROOT=$(git rev-parse --path-format=absolute --git-common-dir); ROOT=${ROOT%/.git}
NM="$ROOT/node_modules"

# The packages the hooks, the type check and the build import. A package whose
# directory exists but whose package.json does not is the exact shape npm
# leaves behind; a node_modules with a handful of entries is the shape a
# rolled-back install leaves behind.
NEEDED="typescript next @babel/core @supabase/supabase-js eslint"
broken() {
  local nm="$1" p
  [ -d "$nm" ] || { echo "absent"; return; }
  for p in $NEEDED; do
    [ -f "$nm/$p/package.json" ] || { echo "missing $p"; return; }
  done
  [ -x "$nm/.bin/tsc" ] || { echo "missing .bin/tsc"; return; }
  local n; n=$(ls "$nm" | wc -l | tr -d ' ')
  [ "$n" -ge 100 ] || { echo "only $n entries"; return; }
  echo ""
}

WHY=$(broken "$NM")
if [ -z "$WHY" ]; then
  exit 0
fi

echo ""
echo "  ─────────────────────────────────────────────────────────────────────"
echo "  THE SHARED node_modules IS GUTTED ($WHY)."
echo ""
echo "    $NM"
echo ""
echo "  Every new worktree clones this directory, so every new tree comes up"
if [ "$MAC_HOST" = 1 ]; then
  echo "  broken, not just yours. Install and verify the exact lockfile in CI."
else
  echo "  broken, not just yours. Add dependencies in $ROOT and install THERE."
fi
echo "  ─────────────────────────────────────────────────────────────────────"
echo ""

if [ "$CHECK_ONLY" = "1" ]; then exit 1; fi

echo "  repairing with npm ci in the main clone (a few minutes)..."
( cd "$ROOT" && PUPPETEER_SKIP_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm ci --no-audit --no-fund --silent ) || { echo "  npm ci FAILED - run it by hand in $ROOT with the two SKIP variables"; exit 1; }
WHY=$(broken "$NM")
[ -z "$WHY" ] || { echo "  still broken: $WHY"; exit 1; }
echo "  repaired. New worktrees will clone a working copy again."
