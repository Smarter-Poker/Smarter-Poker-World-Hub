#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# heal.sh — One-Command Full Environment Recovery for Smarter.Poker
# ═══════════════════════════════════════════════════════════════════════════════
#
# USAGE:
#   bash scripts/heal.sh          # Full recovery (node_modules + zombies + port)
#   bash scripts/heal.sh --quick  # Skip npm install (just kill zombies + port)
#
# Run this any time the dev environment is broken:
#   - node_modules missing or corrupted
#   - Zombie browser/playwright/verify-deploy processes
#   - Port 3000 stuck
#   - git clean accidentally wiped things
#   - npm install previously failed silently
# ═══════════════════════════════════════════════════════════════════════════════

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

QUICK=false
for arg in "$@"; do
  [ "$arg" = "--quick" ] && QUICK=true
done

echo ""
echo "══════════════════════════════════════════════════"
echo "🔧 Smarter.Poker Environment Healer"
echo "   Repo: $REPO_ROOT"
[ "$QUICK" = true ] && echo "   Mode: ⚡ Quick (skip npm install)" || echo "   Mode: 🔨 Full"
echo "══════════════════════════════════════════════════"

# ── Step 1: Kill zombie processes ──
echo ""
echo "🪓  Step 1: Killing zombie processes..."
KILLED=0
for pattern in "verify-deploy.js" "chromium" "camoufox" "playwright" "patchright" "geckodriver" "chromedriver"; do
  if pkill -9 -f "$pattern" 2>/dev/null; then
    echo "   ✅ Killed: $pattern"
    KILLED=$((KILLED + 1))
  fi
done
# Kill any stale git clean processes
if pkill -9 -f "git clean" 2>/dev/null; then
  echo "   ✅ Killed: stale git clean"
  KILLED=$((KILLED + 1))
fi
[ $KILLED -eq 0 ] && echo "   ✅ No zombie processes found" || echo "   ✅ Killed $KILLED zombie process(es)"

# ── Step 2: Free port 3000 ──
echo ""
echo "🔌  Step 2: Freeing port 3000..."
PORT_PID=$(lsof -ti :3000 2>/dev/null || echo "")
if [ -n "$PORT_PID" ]; then
  kill -9 "$PORT_PID" 2>/dev/null || true
  echo "   ✅ Port 3000 freed (killed PID $PORT_PID)"
else
  echo "   ✅ Port 3000 already free"
fi

# ── Step 3: Remove stale git locks ──
echo ""
echo "🔓  Step 3: Clearing stale git locks..."
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null || echo ".git")"
for lock in "$GIT_DIR/HEAD.lock" "$GIT_DIR/index.lock" "$GIT_DIR/config.lock"; do
  if [ -f "$lock" ]; then
    rm -f "$lock"
    echo "   ✅ Removed: $lock"
  fi
done
find "$GIT_DIR/refs" -name "*.lock" -type f -delete 2>/dev/null || true
echo "   ✅ Git lock check complete"

# ── Step 4: Remove stale .node_modules_safe ──
if [ -d ".node_modules_safe" ]; then
  echo ""
  echo "🧹  Recovering stale .node_modules_safe..."
  if [ ! -d "node_modules" ]; then
    mv .node_modules_safe node_modules
    echo "   ✅ Renamed .node_modules_safe → node_modules"
  else
    rm -rf .node_modules_safe
    echo "   ✅ Removed stale .node_modules_safe (node_modules already exists)"
  fi
fi

# ── Step 5: Restore node_modules ──
if [ "$QUICK" = false ]; then
  echo ""
  echo "📦  Step 5: Checking node_modules..."

  NEEDS_INSTALL=false
  if [ ! -d "node_modules" ]; then
    echo "   ⚠️  node_modules is MISSING — installing..."
    NEEDS_INSTALL=true
  elif [ ! -d "node_modules/next" ]; then
    echo "   ⚠️  node_modules/next is MISSING — reinstalling..."
    NEEDS_INSTALL=true
  elif [ ! -d "node_modules/react" ]; then
    echo "   ⚠️  node_modules/react is MISSING — reinstalling..."
    NEEDS_INSTALL=true
  else
    echo "   ✅ node_modules looks healthy"
  fi

  if [ "$NEEDS_INSTALL" = true ]; then
    if [ -z "${NPM_TOKEN:-}" ]; then
      echo ""
      echo "   ⚠️  WARNING: NPM_TOKEN is not set."
      echo "      @smarter-poker packages require GitHub Packages auth."
      echo "      Fix: export NPM_TOKEN=ghp_yourToken"
      echo ""
    fi
    # .npmrc already has legacy-peer-deps=true
    npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -5
    if [ -d "node_modules/next" ]; then
      echo "   ✅ node_modules restored successfully"
    else
      echo "   ❌ npm install may have failed — check output above"
    fi
  fi
fi

# ── Step 6: Abort stale git operations ──
echo ""
echo "🧹  Step 6: Clearing stale git operations..."
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
  GIT_EDITOR=true git rebase --abort 2>/dev/null || true
  rm -rf "$GIT_DIR/rebase-merge" "$GIT_DIR/rebase-apply" 2>/dev/null || true
  echo "   ✅ Aborted stale rebase"
fi
if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
  git merge --abort 2>/dev/null || true
  echo "   ✅ Aborted stale merge"
fi
if [ -f "$GIT_DIR/CHERRY_PICK_HEAD" ]; then
  git cherry-pick --abort 2>/dev/null || true
  echo "   ✅ Aborted stale cherry-pick"
fi
# Remove git-safe-push lock if left over
if [ -f "$GIT_DIR/git-safe-push.lock" ]; then
  existing_pid="$(cat "$GIT_DIR/git-safe-push.lock" 2>/dev/null || echo "")"
  if [ -z "$existing_pid" ] || ! kill -0 "$existing_pid" 2>/dev/null; then
    rm -f "$GIT_DIR/git-safe-push.lock"
    echo "   ✅ Removed stale git-safe-push.lock"
  fi
fi
echo "   ✅ Git state clean"

# ── Done ──
echo ""
echo "══════════════════════════════════════════════════"
echo "✅  Heal complete — dev server ready to start"
echo ""
echo "   Start dev server:  npm run dev"
echo "   Quick smoke test:  node scripts/playwright-test.js --url https://smarter.poker"
echo "══════════════════════════════════════════════════"
echo ""
