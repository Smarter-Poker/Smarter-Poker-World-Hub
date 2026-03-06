#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# git-safe-push.sh — Fully Autonomous Git Push for AI Agents
# ═══════════════════════════════════════════════════════════════════════════════
#
# USAGE:
#   bash scripts/git-safe-push.sh                     # defaults: "Daily update", main, origin
#   bash scripts/git-safe-push.sh "feat: new feature" # custom message
#   bash scripts/git-safe-push.sh "fix: bug" develop  # custom branch
#
# This script is designed to NEVER require human intervention.
# It handles: stale locks, ghost files, dirty trees, rebase conflicts,
# push rejections, and concurrent agent collisions.
#
# EXIT CODES:
#   0 = success
#   1 = fatal error (not a git repo)
#   2 = push failed after all retries
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

MSG="${1:-Daily update}"
BRANCH="${2:-main}"
REMOTE="${3:-origin}"
MAX_RETRIES=5

# ── Resolve repo root ──
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "❌ Not a git repository."
  exit 1
}
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)"

echo "═══════════════════════════════════════════════════"
echo "🤖 git-safe-push v3.0 — Autonomous Agent Push"
echo "   Repo:    ${REPO_ROOT}"
echo "   Message: ${MSG}"
echo "   Target:  ${REMOTE}/${BRANCH}"
echo "═══════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: CLEAN THE ENVIRONMENT
# ═══════════════════════════════════════════════════════════════════════════════

# 1a. Remove stale lock files from crashed git processes
for lock in "${GIT_DIR}/HEAD.lock" "${GIT_DIR}/index.lock"; do
  if [ -f "$lock" ]; then
    echo "🔓 Removing stale lock: ${lock}"
    rm -f "$lock"
  fi
done
# Also clean ref locks
find "${GIT_DIR}/refs" -name "*.lock" -type f -delete 2>/dev/null || true

# 1b. Remove vim swap files
find "${GIT_DIR}" -name ".*.swp" -type f -delete 2>/dev/null || true

# 1c. Abort any leftover rebase from a previous crash
if [ -d "${GIT_DIR}/rebase-merge" ] || [ -d "${GIT_DIR}/rebase-apply" ]; then
  echo "🧹 Aborting stale rebase..."
  GIT_EDITOR=true git rebase --abort 2>/dev/null || true
fi

# 1d. Abort any leftover merge
if [ -f "${GIT_DIR}/MERGE_HEAD" ]; then
  echo "🧹 Aborting stale merge..."
  git merge --abort 2>/dev/null || true
fi

# 1e. Abort any leftover cherry-pick
if [ -f "${GIT_DIR}/CHERRY_PICK_HEAD" ]; then
  echo "🧹 Aborting stale cherry-pick..."
  git cherry-pick --abort 2>/dev/null || true
fi

echo "✅ Environment clean"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: STAGE AND COMMIT EVERYTHING
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "🔄 Staging all changes..."
git add -A

# Check if there's actually anything to commit
if git diff --cached --quiet 2>/dev/null; then
  echo "ℹ️  No staged changes to commit."
else
  echo "💾 Committing: ${MSG}"
  GIT_EDITOR=true git commit -m "${MSG}" 2>/dev/null || echo "ℹ️  Commit returned non-zero (may be empty)"
fi

# 2b. Ghost file sweep — catch files regenerated between add and commit
#     (e.g., service workers, .next build cache, etc.)
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "👻 Ghost files detected after commit. Re-staging..."
  git add -A
  # Amend if we have a commit, otherwise create new
  if git log -1 --oneline 2>/dev/null | grep -q .; then
    GIT_EDITOR=true git commit --amend --no-edit 2>/dev/null || \
    GIT_EDITOR=true git commit -m "${MSG}" 2>/dev/null || true
  fi
fi

# 2c. FINAL dirty check — if STILL dirty (rogue file watcher), force clean
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "👻 Persistent ghost files. Adding to temporary stash..."
  git stash push -u -m "git-safe-push-auto-$(date +%s)" 2>/dev/null || true
fi

echo "✅ Working tree clean"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: PULL-REBASE AND PUSH (with retries)
# ═══════════════════════════════════════════════════════════════════════════════

attempt=0

while [ $attempt -lt $MAX_RETRIES ]; do
  attempt=$((attempt + 1))
  echo ""
  echo "⬇️  [Attempt ${attempt}/${MAX_RETRIES}] Pulling ${REMOTE}/${BRANCH} with rebase..."

  # Clean any leftover rebase state before trying
  if [ -d "${GIT_DIR}/rebase-merge" ] || [ -d "${GIT_DIR}/rebase-apply" ]; then
    GIT_EDITOR=true git rebase --abort 2>/dev/null || true
  fi

  # Ensure tree is still clean (something may have dirtied it between iterations)
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    git add -A
    GIT_EDITOR=true git commit --amend --no-edit 2>/dev/null || \
    GIT_EDITOR=true git commit -m "${MSG} (auto-amended)" 2>/dev/null || \
    git stash push -u -m "git-safe-push-retry-$(date +%s)" 2>/dev/null || true
  fi

  # ── PULL WITH REBASE ──
  pull_ok=true
  if ! GIT_EDITOR=true git pull --rebase "${REMOTE}" "${BRANCH}" 2>&1; then
    pull_ok=false

    # ── AUTO-RESOLVE CONFLICTS ──
    echo "⚠️  Conflicts during rebase. Auto-resolving (accept theirs)..."
    inner=0
    max_inner=50

    while [ $inner -lt $max_inner ]; do
      inner=$((inner + 1))

      conflicted="$(git diff --name-only --diff-filter=U 2>/dev/null || true)"

      if [ -z "$conflicted" ]; then
        # No conflicts — continue or finish rebase
        if [ -d "${GIT_DIR}/rebase-merge" ] || [ -d "${GIT_DIR}/rebase-apply" ]; then
          GIT_EDITOR=true git rebase --continue 2>/dev/null || break
        else
          pull_ok=true
          break
        fi
      else
        echo "  [Step ${inner}] Resolving: $(echo "$conflicted" | tr '\n' ' ')"
        echo "$conflicted" | while IFS= read -r f; do
          if [ -n "$f" ]; then
            if [ -f "$f" ]; then
              git checkout --theirs "$f" 2>/dev/null && git add "$f" 2>/dev/null
            else
              git rm "$f" 2>/dev/null || git add "$f" 2>/dev/null
            fi
          fi
        done

        if ! GIT_EDITOR=true git rebase --continue 2>/dev/null; then
          remaining="$(git diff --name-only --diff-filter=U 2>/dev/null || true)"
          if [ -z "$remaining" ]; then
            if [ -d "${GIT_DIR}/rebase-merge" ] || [ -d "${GIT_DIR}/rebase-apply" ]; then
              continue
            fi
            pull_ok=true
            break
          fi
        fi
      fi
    done

    if [ $inner -ge $max_inner ]; then
      echo "⚠️  Hit conflict resolution limit. Aborting rebase."
      GIT_EDITOR=true git rebase --abort 2>/dev/null || true
    fi
  fi

  # ── Pop any auto-stash ──
  if git stash list 2>/dev/null | grep -q "git-safe-push"; then
    echo "📦 Restoring stashed changes..."
    git stash pop 2>/dev/null || true
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
      git add -A
      GIT_EDITOR=true git commit --amend --no-edit 2>/dev/null || \
      GIT_EDITOR=true git commit -m "${MSG} (stash restore)" 2>/dev/null || true
    fi
  fi

  # ── PUSH ──
  echo "🚀 Pushing to ${REMOTE}/${BRANCH}..."
  if git push "${REMOTE}" "${BRANCH}" 2>&1; then
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "✅ Push successful!"
    echo "═══════════════════════════════════════════════════"
    exit 0
  else
    if [ $attempt -lt $MAX_RETRIES ]; then
      delay=$((attempt * 2))
      echo "⚠️  Push rejected. Retrying in ${delay}s..."
      sleep "$delay"
    fi
  fi
done

echo ""
echo "═══════════════════════════════════════════════════"
echo "❌ Push failed after ${MAX_RETRIES} attempts."
echo "═══════════════════════════════════════════════════"
exit 2
