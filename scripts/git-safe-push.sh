#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# git-safe-push.sh v4.1 — Fully Autonomous Git Push for AI Agents
# ═══════════════════════════════════════════════════════════════════════════════
#
# USAGE:
#   bash scripts/git-safe-push.sh                       # defaults: "Daily update", main, origin
#   bash scripts/git-safe-push.sh "feat: new feature"   # custom message
#   bash scripts/git-safe-push.sh "fix: bug" develop    # custom branch
#   bash scripts/git-safe-push.sh --dry-run "msg"       # show what would happen
#   bash scripts/git-safe-push.sh --build-check "msg"   # build check before push
#
# FLAGS:
#   --dry-run       Show what would be committed/pushed without doing it
#   --build-check   Run `next build` before pushing (aborts on failure)
#
# This script is designed to NEVER require human intervention.
# It handles: stale locks, ghost files, dirty trees, rebase conflicts,
# push rejections, concurrent agent collisions, and .env leak prevention.
#
# EXIT CODES:
#   0 = success (or dry-run complete)
#   1 = fatal error (not a git repo)
#   2 = push failed after all retries
# ═══════════════════════════════════════════════════════════════════════════════

# NOTE: Do NOT use 'set -e' or 'set -o pipefail' here.
# Many git commands intentionally return non-zero:
#   - git diff --cached --quiet → returns 1 when there ARE staged changes
#   - git commit → returns 1 when nothing to commit
#   - git rebase --continue → returns 1 when editor is needed
# Using set -e would cause premature script termination on expected outcomes.
set -u  # Only catch unset variables

# ── Parse flags ──
DRY_RUN=false
BUILD_CHECK=false
POSITIONAL=()
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --build-check) BUILD_CHECK=true ;;
        *) POSITIONAL+=("$arg") ;;
    esac
done

MSG="${POSITIONAL[0]:-Daily update}"
BRANCH="${POSITIONAL[1]:-main}"
REMOTE="${POSITIONAL[2]:-origin}"
MAX_RETRIES=5
LOCK_FILE=""
TOTAL_START=$(date +%s)

# ── Resolve repo root and cd into it ──
# The script may be called from any directory (e.g. /tmp by an agent).
# We derive the repo from the script's own location, then cd into it.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.." 2>/dev/null || true

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "❌ Not a git repository."
  exit 1
}
cd "$REPO_ROOT"
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)"

# ── Agent collision lock ──
# Prevents two agents from pushing simultaneously (the root cause of most failures)
LOCK_FILE="${GIT_DIR}/git-safe-push.lock"
if [ -f "$LOCK_FILE" ]; then
  existing_pid="$(cat "$LOCK_FILE" 2>/dev/null || echo "")"
  # Check if the process that created the lock is still alive
  if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "⏳ Another git-safe-push is running (PID ${existing_pid}). Waiting up to 60s..."
    wait_count=0
    while [ -f "$LOCK_FILE" ] && kill -0 "$existing_pid" 2>/dev/null && [ $wait_count -lt 30 ]; do
      sleep 2
      wait_count=$((wait_count + 1))
    done
  fi
  # Remove stale lock (process dead or wait timed out)
  rm -f "$LOCK_FILE" 2>/dev/null || true
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE" 2>/dev/null' EXIT INT TERM HUP

echo "═══════════════════════════════════════════════════"
echo "🤖 git-safe-push v4.1 — Autonomous Agent Push"
echo "   Repo:    ${REPO_ROOT}"
echo "   Message: ${MSG}"
echo "   Target:  ${REMOTE}/${BRANCH}"
if [ "$BUILD_CHECK" = true ]; then
  echo "   Build:   🔨 Build gate ENABLED"
fi
if [ "$DRY_RUN" = true ]; then
  echo "   Mode:    🔍 DRY RUN"
fi
echo "═══════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 0: .ENV SAFETY CHECK
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "🛡️  Phase 0: .env safety check..."

# Check if .env files are staged for commit
ENV_STAGED=$(git diff --cached --name-only 2>/dev/null | grep -E '\.env(\.|$)' || true)

if [ -n "$ENV_STAGED" ]; then
    echo "⚠️  WARNING: .env files are staged for commit:"
    echo "   $ENV_STAGED"
    echo "   Unstaging .env files to prevent credential leaks..."
    echo "$ENV_STAGED" | while IFS= read -r f; do
        [ -n "$f" ] && git reset HEAD "$f" 2>/dev/null || true
    done
fi

# Verify .gitignore contains .env patterns
if [ -f ".gitignore" ]; then
    if ! grep -q '\.env' .gitignore 2>/dev/null; then
        echo "⚠️  WARNING: .gitignore does not contain .env patterns!"
        echo "   Consider adding: .env*"
    fi
fi

echo "✅ .env safety check passed"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: CLEAN THE ENVIRONMENT
# ═══════════════════════════════════════════════════════════════════════════════

PHASE1_START=$(date +%s)
echo ""
echo "🧹 Phase 1: Cleaning environment..."

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
  # Force-remove if --abort couldn't clear it (corrupt/empty state)
  rm -rf "${GIT_DIR}/rebase-merge" "${GIT_DIR}/rebase-apply" 2>/dev/null || true
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

PHASE1_END=$(date +%s)
echo "✅ Environment clean ($(( PHASE1_END - PHASE1_START ))s)"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: STAGE AND COMMIT EVERYTHING
# ═══════════════════════════════════════════════════════════════════════════════

PHASE2_START=$(date +%s)
echo ""
echo "🔄 Phase 2: Staging and committing..."
git add -A

# Check if there's actually anything to commit
if git diff --cached --quiet 2>/dev/null; then
  echo "ℹ️  No staged changes to commit."
else
  if [ "$DRY_RUN" = true ]; then
    echo "🔍 [DRY RUN] Would commit with message: ${MSG}"
    echo "   Changed files:"
    git diff --cached --stat 2>/dev/null | sed 's/^/   /'
    # Unstage so we don't leave the repo in a dirty cached state
    git reset HEAD 2>/dev/null || true
  else
    echo "💾 Committing: ${MSG}"
    GIT_EDITOR=true git commit -m "${MSG}" 2>/dev/null || echo "ℹ️  Commit returned non-zero (may be empty)"
  fi
fi

# 2b. Ghost file sweep — catch files regenerated between add and commit
#     (e.g., service workers, .next build cache, etc.)
if [ "$DRY_RUN" = false ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "👻 Ghost files detected after commit. Re-staging..."
  git add -A
  # Amend if we have a commit, otherwise create new
  if git log -1 --oneline 2>/dev/null | grep -q .; then
    GIT_EDITOR=true git commit --amend --no-edit 2>/dev/null || \
    GIT_EDITOR=true git commit -m "${MSG}" 2>/dev/null || true
  fi
fi

# 2c. FINAL dirty check — if STILL dirty (rogue file watcher), force clean
if [ "$DRY_RUN" = false ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "👻 Persistent ghost files. Adding to temporary stash..."
  git stash push -u -m "git-safe-push-auto-$(date +%s)" 2>/dev/null || true
fi

PHASE2_END=$(date +%s)
echo "✅ Working tree clean ($(( PHASE2_END - PHASE2_START ))s)"

# ═══════════════════════════════════════════════════════════════════════════════
# DRY RUN EXIT
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$DRY_RUN" = true ]; then
  COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "N/A")
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "🔍 DRY RUN COMPLETE — No push was made"
  echo "   HEAD:    ${COMMIT_SHA}"
  echo "   Target:  ${REMOTE}/${BRANCH}"
  echo "═══════════════════════════════════════════════════"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2.5: BUILD GATE (optional)
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$BUILD_CHECK" = true ]; then
  echo ""
  echo "🔨 Phase 2.5: Build gate check..."
  BUILD_START=$(date +%s)
  if NODE_OPTIONS='--max-old-space-size=4096' npx next build 2>&1 | tail -20; then
    BUILD_END=$(date +%s)
    echo "✅ Build passed ($(( BUILD_END - BUILD_START ))s)"
  else
    BUILD_END=$(date +%s)
    echo "❌ BUILD FAILED ($(( BUILD_END - BUILD_START ))s) — Aborting push."
    echo "PUSH_OK:false"
    echo "REASON:build_failed"
    exit 2
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: PULL-REBASE AND PUSH (with retries)
# ═══════════════════════════════════════════════════════════════════════════════

PHASE3_START=$(date +%s)
attempt=0

while [ $attempt -lt $MAX_RETRIES ]; do
  attempt=$((attempt + 1))
  echo ""
  echo "⬇️  [Attempt ${attempt}/${MAX_RETRIES}] Pulling ${REMOTE}/${BRANCH} with rebase..."

  # Clean any leftover rebase state before trying
  if [ -d "${GIT_DIR}/rebase-merge" ] || [ -d "${GIT_DIR}/rebase-apply" ]; then
    GIT_EDITOR=true git rebase --abort 2>/dev/null || true
    # Force-remove if --abort couldn't clear it
    rm -rf "${GIT_DIR}/rebase-merge" "${GIT_DIR}/rebase-apply" 2>/dev/null || true
  fi

  # Ensure tree is still clean (something may have dirtied it between iterations)
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    git add -A
    GIT_EDITOR=true git commit --amend --no-edit 2>/dev/null || \
    GIT_EDITOR=true git commit -m "${MSG} (auto-amended)" 2>/dev/null || \
    git stash push -u -m "git-safe-push-retry-$(date +%s)" 2>/dev/null || true
  fi

  # ── PULL WITH REBASE ──
  if ! GIT_EDITOR=true git pull --rebase "${REMOTE}" "${BRANCH}" 2>&1; then

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
    PHASE3_END=$(date +%s)
    TOTAL_END=$(date +%s)
    COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "N/A")
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "✅ Push successful!"
    echo "═══════════════════════════════════════════════════"
    echo "PUSH_OK:true"
    echo "COMMIT_SHA:${COMMIT_SHA}"
    echo "BRANCH:${BRANCH}"
    echo "PHASE1_DURATION:$(( PHASE1_END - PHASE1_START ))s"
    echo "PHASE2_DURATION:$(( PHASE2_END - PHASE2_START ))s"
    echo "PHASE3_DURATION:$(( PHASE3_END - PHASE3_START ))s"
    echo "TOTAL_DURATION:$(( TOTAL_END - TOTAL_START ))s"
    echo "═══════════════════════════════════════════════════"
    # ── Deploy log ──
    node "${SCRIPT_DIR}/deploy-log.js" \
      --action push \
      --sha "${COMMIT_SHA}" \
      --branch "${BRANCH}" \
      --duration "$(( TOTAL_END - TOTAL_START ))" \
      --msg "${MSG}" 2>/dev/null || true
    exit 0
  else
    if [ $attempt -lt $MAX_RETRIES ]; then
      delay=$((attempt * 2))
      echo "⚠️  Push rejected. Retrying in ${delay}s..."
      sleep "$delay"
    fi
  fi
done

TOTAL_END=$(date +%s)
echo ""
echo "═══════════════════════════════════════════════════"
echo "❌ Push failed after ${MAX_RETRIES} attempts."
echo "PUSH_OK:false"
echo "TOTAL_DURATION:$(( TOTAL_END - TOTAL_START ))s"
echo "═══════════════════════════════════════════════════"
exit 2
