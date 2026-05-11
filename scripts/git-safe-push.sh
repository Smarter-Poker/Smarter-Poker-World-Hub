#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# git-safe-push.sh v4.1 — Fully Autonomous Git Push for AI Agents
# ═══════════════════════════════════════════════════════════════════════════════
#
# USAGE:
#   bash scripts/git-safe-push.sh                       # builds + pushes (default)
#   bash scripts/git-safe-push.sh "feat: new feature"   # custom message
#   bash scripts/git-safe-push.sh "fix: bug" develop    # custom branch
#   bash scripts/git-safe-push.sh --dry-run "msg"       # show what would happen
#   bash scripts/git-safe-push.sh --skip-build "msg"    # skip build check (hotfixes ONLY)
#
# FLAGS:
#   --dry-run              Show what would happen without committing/pushing
#   --build-check          Run `next build` before pushing (DEFAULT — always on)
#   --skip-build           Skip the build check (for emergency hotfixes only)
#   --force-destructive    Bypass @media removal and large deletion safeguards
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

# ── Ensure PATH includes homebrew and nvm for agent environments ──
# AI agents may invoke this script from minimal shell contexts where
# /opt/homebrew/bin, nvm, and node aren't on PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null || true

# ── Parse flags ──
DRY_RUN=false
BUILD_CHECK=true  # DEFAULT ON — prevents broken imports from blocking CI for days
# v4.2: pre-push hooks are ENFORCED by default. The hooks include Check 8
# (broken-import resolution) which would have caught the Apr 16 2026 PNM
# refactor that moved [pnmTab].js two dirs deeper without updating imports.
# Use --skip-hooks only as an emergency bypass when the hooks themselves are broken.
NO_VERIFY_FLAG=""
POSITIONAL=()
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --build-check) BUILD_CHECK=true ;;  # Explicit (already default)
        --skip-build|--no-build) BUILD_CHECK=false ;;  # Opt-out for hotfixes
        --skip-hooks|--no-verify) NO_VERIFY_FLAG="--no-verify" ;;  # Emergency bypass
        --force-destructive) ;; # Handled later in Phase 0.5
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
# Kill any verify-deploy.js or child processes we spawn if the script is interrupted
_cleanup() {
  rm -f "$LOCK_FILE" 2>/dev/null
  # Kill any verify-deploy.js zombies we may have spawned
  pkill -f "verify-deploy.js" 2>/dev/null || true
  # Restore node_modules if it was mid-rename when we were killed
  if [ -d ".node_modules_safe" ] && [ ! -d "node_modules" ]; then
    mv .node_modules_safe node_modules 2>/dev/null || true
  fi
}
trap '_cleanup' EXIT INT TERM HUP

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
# PHASE 0: SECRET SCANNING & .ENV SAFETY CHECK
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "🛡️  Phase 0: Secret scanning & .env safety check..."

# ── 0a. TOKEN SCANNING GATE ──
# Scan ALL tracked files for GitHub PAT patterns BEFORE staging.
# GitHub's secret scanner auto-revokes ANY token found in commits.
# This gate prevents that from ever happening again.
echo "🔍 Scanning for GitHub PAT patterns in working tree..."

# Scan all files that git would track (respects .gitignore)
TOKEN_LEAKS=$(git ls-files 2>/dev/null | xargs grep -ln 'ghp_[A-Za-z0-9]\{20,\}' 2>/dev/null || true)
TOKEN_LEAKS2=$(git ls-files 2>/dev/null | xargs grep -ln 'github_pat_[A-Za-z0-9]\{20,\}' 2>/dev/null || true)

# Also scan untracked files that would be staged by git add -A
UNTRACKED_LEAKS=$(git ls-files --others --exclude-standard 2>/dev/null | xargs grep -ln 'ghp_[A-Za-z0-9]\{20,\}' 2>/dev/null || true)
UNTRACKED_LEAKS2=$(git ls-files --others --exclude-standard 2>/dev/null | xargs grep -ln 'github_pat_[A-Za-z0-9]\{20,\}' 2>/dev/null || true)

ALL_LEAKS="${TOKEN_LEAKS}${TOKEN_LEAKS:+$'\n'}${TOKEN_LEAKS2}${TOKEN_LEAKS2:+$'\n'}${UNTRACKED_LEAKS}${UNTRACKED_LEAKS:+$'\n'}${UNTRACKED_LEAKS2}"
ALL_LEAKS=$(echo "$ALL_LEAKS" | sed '/^$/d' | sort -u)

if [ -n "$ALL_LEAKS" ]; then
    echo ""
    echo "🚨🚨🚨 CRITICAL: GitHub PAT tokens found in files! 🚨🚨🚨"
    echo "═══════════════════════════════════════════════════"
    echo "The following files contain GitHub PAT patterns:"
    echo "$ALL_LEAKS" | while IFS= read -r f; do
        [ -n "$f" ] && echo "   ❌ $f"
    done
    echo ""
    echo "GitHub will AUTO-REVOKE your token if these are committed."
    echo "Remove the token values from these files before pushing."
    echo "═══════════════════════════════════════════════════"
    echo "PUSH_OK:false"
    echo "REASON:token_leak_detected"
    exit 2
fi
echo "✅ No GitHub PAT patterns found in trackable files"

# ── 0b. ACCOUNT ENFORCEMENT GATE ──
# ONLY the paid Smarter-Poker GitHub account is authorized for pushes.
# The commit email MUST be 254329056+Smarter-Poker@users.noreply.github.com
# (GitHub rejects pushes with admin@smarter.poker due to email privacy — GH007).
# admin@smarter.poker is the Vercel/billing identity, NOT the commit author.
REQUIRED_ACCOUNT="Smarter-Poker"
CURRENT_ACCOUNT=$(gh api /user --jq '.login' 2>/dev/null || echo "UNKNOWN")
# Fallback: if gh CLI isn't available, check if the remote URL contains the correct account
if [ "$CURRENT_ACCOUNT" = "UNKNOWN" ]; then
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if echo "$REMOTE_URL" | grep -qi "Smarter-Poker" ; then
        CURRENT_ACCOUNT="$REQUIRED_ACCOUNT"
    fi
fi

# ── 0b-email. GIT EMAIL ENFORCEMENT ──
# Ensure the commit email is the noreply alias. If an agent set it to
# admin@smarter.poker, silently fix it to prevent GH007 push rejections.
CURRENT_GIT_EMAIL=$(git config user.email 2>/dev/null || echo "")
REQUIRED_GIT_EMAIL="254329056+Smarter-Poker@users.noreply.github.com"
if [ "$CURRENT_GIT_EMAIL" != "$REQUIRED_GIT_EMAIL" ]; then
    echo "⚠️  Fixing git user.email: $CURRENT_GIT_EMAIL → $REQUIRED_GIT_EMAIL"
    git config user.email "$REQUIRED_GIT_EMAIL"
fi

if [ "$CURRENT_ACCOUNT" != "$REQUIRED_ACCOUNT" ]; then
    echo ""
    echo "🚨🚨🚨 CRITICAL: WRONG GITHUB ACCOUNT! 🚨🚨🚨"
    echo "═══════════════════════════════════════════════════"
    echo "   Current:  $CURRENT_ACCOUNT"
    echo "   Required: $REQUIRED_ACCOUNT (254329056+Smarter-Poker@users.noreply.github.com)"
    echo ""
    echo "   Run: gh auth logout -h github.com"
    echo "   Then re-authenticate with the Smarter-Poker token."
    echo "═══════════════════════════════════════════════════"
    echo "PUSH_OK:false"
    echo "REASON:wrong_github_account"
    exit 2
fi
echo "✅ Authenticated as $REQUIRED_ACCOUNT (paid account)"

# ── 0b. .ENV FILE CHECK ──
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

# ── 0c. VERCEL CRON LOCKOUT ──
# Enforce the strict ban on adding new crons to vercel.json. We are locked at max 40 legacy crons.
if [ -f "vercel.json" ]; then
    # Measure cron array, safely fallback to 0 if no crons present or jq fails
    CRON_COUNT=$(jq '.crons | length' vercel.json 2>/dev/null || echo "0")
    if [ "$CRON_COUNT" -gt 40 ]; then
        echo "❌ FATAL: VERCEL CRON LIMIT EXCEEDED ($CRON_COUNT / 40 permitted)"
        echo "   You have added a new cron to vercel.json."
        echo "   This is STRICTLY FORBIDDEN. All new scheduled jobs must use Open Claw exclusively."
        echo "   Revert your vercel.json modifications and use Open Claw."
        echo "PUSH_OK:false"
        echo "REASON:vercel_cron_lockout"
        exit 2
    fi
fi
echo "✅ Vercel cron lockout passed"

# ── 0d. DUPLICATE WORKFLOW GATE ──
# Prevent duplicate GitHub Action workflows with the same "name:" field.
# This avoids double-triggering CI pipelines that confusingly succeed/fail simultaneously.
if [ -d ".github/workflows" ]; then
    DUPLICATE_WORKFLOWS=$(grep -h "^name:" .github/workflows/*.yml 2>/dev/null | sort | uniq -d | sed 's/^name: //')
    if [ -n "$DUPLICATE_WORKFLOWS" ]; then
        echo "❌ FATAL: DUPLICATE WORKFLOW NAMES DETECTED"
        echo "   The following workflow names are used in multiple .yml files:"
        echo "$DUPLICATE_WORKFLOWS" | sed 's/^/      - /'
        echo "   This causes double CI runs. Ensure each workflow file has a unique 'name:'."
        echo "PUSH_OK:false"
        echo "REASON:duplicate_workflows"
        exit 2
    fi
fi
echo "✅ Workflow uniqueness check passed"

# ── 0e. .JS → .TS IMPORT GUARD ──
# Root cause of the May 2026 auth cascade:
# authUtils.js imported from './authUtils.ts' with explicit .ts extension.
# Webpack/Next.js CANNOT resolve explicit .ts extension imports from .js files.
# Result: every exported symbol resolves as undefined, breaking 20+ pages.
# This check blocks the push before it reaches Vercel.
TS_IMPORT_HITS=$(grep -rn "from ['\"].*\.ts['\"]" \
  --include='*.js' --include='*.jsx' \
  --exclude-dir=node_modules --exclude-dir=.next \
  pages/ src/ lib/ 2>/dev/null || true)

if [ -n "$TS_IMPORT_HITS" ]; then
    echo ""
    echo "🚨🚨🚨 BLOCKED: .js file importing from explicit .ts path! 🚨🚨🚨"
    echo "═══════════════════════════════════════════════════"
    echo "$TS_IMPORT_HITS" | head -10 | sed 's/^/   ❌ /'
    echo ""
    echo "   WHY: Webpack resolves .js before .ts for extension-free imports."
    echo "   The .js shim is always loaded. If it imports './authUtils.ts' with"
    echo "   explicit .ts extension, webpack resolves to nothing — silently"
    echo "   making all exported symbols undefined. This breaks every consumer page."
    echo ""
    echo "   FIX: Remove the .ts extension → use './authUtils' not './authUtils.ts'"
    echo "═══════════════════════════════════════════════════"
    git reset HEAD 2>/dev/null || true
    echo "PUSH_OK:false"
    echo "REASON:js_imports_ts_explicit_extension"
    exit 2
fi
echo "✅ No .js→.ts explicit extension imports found"

# ── 0f. AUTHUTILS EXPORT COVERAGE GATE ──
# Catches "Attempted import error: X is not exported from authUtils"
# before any commit reaches Vercel. Scans all consumer files.
AUTHUTILS_FILE="src/lib/authUtils.js"
[ ! -f "$AUTHUTILS_FILE" ] && AUTHUTILS_FILE="src/lib/authUtils.ts"

if [ -f "$AUTHUTILS_FILE" ]; then
    AU_EXPORTS=$(grep -oE "^export (async )?function [A-Za-z_][A-Za-z0-9_]+" "$AUTHUTILS_FILE" \
      | grep -oE "[A-Za-z_][A-Za-z0-9_]+$" | sort -u)
    AU_ERRORS=0

    while IFS= read -r f; do
        IMPORTED=$(grep -v "^[[:space:]]*//" "$f" 2>/dev/null \
          | grep -oE "import \{[^}]+\} from ['\"].*authUtils['\"]" \
          | grep -oE "\{[^}]+\}" \
          | tr -d '{}' | tr ',' '\n' \
          | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
          | grep -E "^[A-Za-z_][A-Za-z0-9_]+$" \
          | sort -u || true)
        for sym in $IMPORTED; do
            if ! echo "$AU_EXPORTS" | grep -qx "$sym"; then
                echo "   ❌ $f: imports '$sym' which is NOT exported by $AUTHUTILS_FILE"
                AU_ERRORS=$((AU_ERRORS + 1))
            fi
        done
    done < <(find pages/ src/ -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \
      | grep -v node_modules | grep -v .next | grep -v authUtils 2>/dev/null)

    if [ "$AU_ERRORS" -gt 0 ]; then
        echo ""
        echo "🚨🚨🚨 BLOCKED: $AU_ERRORS authUtils import(s) don't exist as exports! 🚨🚨🚨"
        echo "═══════════════════════════════════════════════════"
        echo "   FIX: Add the missing export(s) to $AUTHUTILS_FILE"
        echo "        or remove the broken import from the consumer file."
        echo "═══════════════════════════════════════════════════"
        git reset HEAD 2>/dev/null || true
        echo "PUSH_OK:false"
        echo "REASON:authutils_missing_exports"
        exit 2
    fi
    echo "✅ All authUtils consumer imports resolve to actual exports"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 0.5: DESTRUCTIVE CHANGE DETECTION
# Prevents AI agents from accidentally wiping mobile CSS, @media rules,
# or making massive net deletions without explicit intent.
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "🛡️  Phase 0.5: Destructive change detection..."

# Check for --force-destructive flag (allows agents to explicitly bypass)
FORCE_DESTRUCTIVE=false
for arg in "$@"; do
    [ "$arg" = "--force-destructive" ] && FORCE_DESTRUCTIVE=true
done

# Pre-stage changes temporarily so we can inspect what would be committed.
# This is required because git diff --cached is empty until git add.
git add -A 2>/dev/null || true

# ── 0.5-PROTECTED: PROTECTED FILE ZONE ENFORCEMENT ──
# Club Arena compiled output is a PROTECTED ZONE. Only agents whose commit
# message contains "club-arena" or "Club Arena" may modify these files.
# All other agents must NOT touch public/hub/club-arena/ to prevent
# accidental overwrites during rebase/merge that break the Vite SPA.
PROTECTED_ZONE_FILES=$(git diff --cached --name-only 2>/dev/null | grep '^public/hub/club-arena/' || true)
if [ -n "$PROTECTED_ZONE_FILES" ]; then
    # Check if the commit message indicates this is a Club Arena agent
    if ! echo "$MSG" | grep -qiE '(club.?arena|poker.?table|pokerbros|club.?engine)'; then
        echo ""
        echo "PROTECTED ZONE VIOLATION: public/hub/club-arena/"
        echo "================================================="
        echo "   Your commit modifies files in a PROTECTED ZONE:"
        echo "$PROTECTED_ZONE_FILES" | head -10 | sed 's/^/      /'
        echo ""
        echo "   Only Club Arena agents may modify public/hub/club-arena/."
        echo "   Your commit message does not indicate Club Arena work."
        echo ""
        echo "   To fix: unstage these files and re-commit:"
        echo "     git reset HEAD public/hub/club-arena/"
        echo "     git add -A && git commit -m \"$MSG\""
        echo ""
        echo "   Or if you ARE a Club Arena agent, include 'club-arena'"
        echo "   in your commit message."
        echo "================================================="
        # Auto-fix: unstage the protected files and continue
        echo "   AUTO-FIX: Unstaging protected files and continuing..."
        git reset HEAD public/hub/club-arena/ 2>/dev/null || true
        echo "   Protected files removed from staging area."
    else
        echo "Club Arena agent detected — protected zone access GRANTED"
    fi
fi

# ── 0.5a. VAGUE COMMIT MESSAGE GATE ──
# Block lazy/generic commit messages that hide destructive bulk changes
BLOCKED_MESSAGES="Daily update|daily update|Update files|update files|Auto commit|auto commit|WIP|wip"
if echo "$MSG" | grep -qE "^(${BLOCKED_MESSAGES})$"; then
    echo ""
    echo "🚨 BLOCKED: Vague commit message detected!"
    echo "═══════════════════════════════════════════════════"
    echo "   Message: \"${MSG}\""
    echo ""
    echo "   Generic commit messages like 'Daily update' hide destructive"
    echo "   changes. Use a descriptive message that explains WHAT changed."
    echo ""
    echo "   Examples:"
    echo "     bash git-safe-push.sh \"fix: resolve auth redirect loop\""
    echo "     bash git-safe-push.sh \"feat: add tournament leaderboards\""
    echo "     bash git-safe-push.sh \"chore: migrate Head to SEOHead across 50 pages\""
    echo "═══════════════════════════════════════════════════"
    echo "PUSH_OK:false"
    echo "REASON:vague_commit_message"
    exit 2
fi
echo "✅ Commit message is descriptive"

# ── 0.5b. LARGE NET DELETION GATE ──
# Block any single file with more than 50 lines of net deletion.
# This catches bulk wipes where an agent accidentally removes large sections.
if [ "$FORCE_DESTRUCTIVE" = false ]; then
    # Get per-file insertion/deletion stats from staged changes
    NUMSTAT=$(git diff --cached --numstat 2>/dev/null || git diff HEAD~1 --numstat 2>/dev/null || echo "")
    DESTRUCTIVE_FILES=""

    if [ -n "$NUMSTAT" ]; then
        while IFS=$'\t' read -r added deleted filepath; do
            # Skip binary files (shown as '-')
            [ "$added" = "-" ] || [ "$deleted" = "-" ] && continue
            [ -z "$filepath" ] && continue

            # Calculate net deletion
            net_deleted=$((deleted - added))
            if [ "$net_deleted" -gt 50 ]; then
                DESTRUCTIVE_FILES="${DESTRUCTIVE_FILES}\n   ❌ ${filepath}: -${net_deleted} net lines (added: +${added}, deleted: -${deleted})"
            fi
        done <<< "$NUMSTAT"
    fi

    if [ -n "$DESTRUCTIVE_FILES" ]; then
        echo ""
        echo "🚨 BLOCKED: Large net deletions detected!"
        echo "═══════════════════════════════════════════════════"
        echo "   Files with >50 net lines deleted:"
        echo -e "$DESTRUCTIVE_FILES"
        echo ""
        echo "   This threshold prevents accidental code wipes."
        echo "   If deletions are intentional, re-run with --force-destructive flag."
        echo "═══════════════════════════════════════════════════"
        # Unstage before exiting so we don't leave dirty index
        git reset HEAD 2>/dev/null || true
        echo "PUSH_OK:false"
        echo "REASON:large_net_deletion_blocked"
        exit 2
    fi
    echo "✅ No excessive deletions detected"
fi

echo "✅ Destructive change detection passed"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 0.7: AUTO-RESET LOOP DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
# Catches the failure mode learned 2026-05-06: an external agent (Antigravity
# in that case, but any IDE/automation that runs `git reset --hard origin/main`
# on a timer) silently destroys uncommitted edits AND local-only commits.
# When this script sees ≥2 `reset: moving to origin/main` entries in the last
# 50 reflog ops, it warns loudly so future agents notice before losing work.
# The check is a warning (not a block) — sometimes operators legitimately
# reset to origin during recovery, and we don't want to block those paths.
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "🔭 Phase 0.7: Reflog auto-reset loop detection..."
RESET_COUNT=$(git reflog -50 2>/dev/null | grep -c 'reset: moving to origin/' || echo 0)
if [ "$RESET_COUNT" -ge 2 ]; then
  echo "⚠️  WARNING: $RESET_COUNT 'reset: moving to origin/...' entries in last 50 reflog ops."
  echo "   This is the signature of an external auto-sync agent (Antigravity, IDE,"
  echo "   git daemon) that may be silently discarding local commits + uncommitted"
  echo "   edits. If this isn't intentional, kill that agent before further work."
  echo "   (To inspect: git reflog -20 | grep -E 'reset|pull')"
  echo "   This is a WARNING only — push will continue."
fi
echo "✅ Reflog scan complete (found $RESET_COUNT auto-reset events; ≥2 triggers warning)"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: CLEAN THE ENVIRONMENT
# ═══════════════════════════════════════════════════════════════════════════════

PHASE1_START=$(date +%s)
echo ""
echo "🧹 Phase 1: Cleaning environment & Garbage Collection..."

# 1-zero. Aggressive Garbage Collection
# Deep-purges all phantom files (dist-bug*, generated caches) while safely omitting .env overrides and node_modules.
# SAFETY: Record node_modules state BEFORE clean so we can detect+restore if git clean misfires.
NODE_MODULES_OK=false
if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" -o -f "node_modules/.modules.yaml" -o -d "node_modules/next" ]; then
  NODE_MODULES_OK=true
fi

echo "🗑️  Running absolute garbage collection (git clean -fdX) to eliminate phantom state..."
if [ "$DRY_RUN" = true ]; then
  git clean -fdXn -e "!.env*" -e "!public/hub/club-arena/assets" -e "!node_modules" -e "!node_modules/**" -e "!.husky" 2>/dev/null || true
else
  git clean -fdX -e "!.env*" -e "!public/hub/club-arena/assets" -e "!node_modules" -e "!node_modules/**" -e "!.husky" 2>/dev/null || true
fi

# INTEGRITY CHECK: If node_modules was present before clean but is now gone, auto-restore.
if [ "$NODE_MODULES_OK" = true ] && [ ! -d "node_modules" ]; then
  echo "⚠️  CRITICAL: node_modules was wiped by git clean — this should never happen."
  echo "   Auto-restoring node_modules (this will take ~30s)..."
  if [ -z "${NPM_TOKEN:-}" ]; then
    echo ""
    echo "  ⚠️  WARNING: NPM_TOKEN is not set in your environment."
    echo "     @smarter-poker/commander-shared requires GitHub Packages auth."
    echo "     Fix: bash scripts/setup-npm-auth.sh ghp_yourToken"
    echo ""
  fi
  npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline 2>&1 | tail -3
  echo "✅ node_modules restored"
elif [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules is missing — auto-restoring (this will take ~30s)..."
  if [ -z "${NPM_TOKEN:-}" ]; then
    echo ""
    echo "  ⚠️  WARNING: NPM_TOKEN is not set in your environment."
    echo "     @smarter-poker/commander-shared requires GitHub Packages auth."
    echo "     Fix: bash scripts/setup-npm-auth.sh ghp_yourToken"
    echo ""
  fi
  npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline 2>&1 | tail -3
  echo "✅ node_modules restored"
fi

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

# ── 2a. MERGE CONFLICT MARKER GATE (UNCONDITIONAL) ──
# This is the REAL safety net. Pre-commit/pre-push hooks can be bypassed
# with --no-verify/--skip-hooks. This check runs EVERY time, no exceptions.
# Matches anywhere on a line — stash pop produces indented markers inside
# JSDoc comments that the previous ^ anchored hooks missed.
# deploy-autofix.js is excluded because it legitimately references these strings.
CONFLICT_STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null \
  | grep -E '\.(js|jsx|ts|tsx|css)$' \
  | grep -v 'deploy-autofix.js' \
  | while IFS= read -r f; do
      git show ":$f" 2>/dev/null | grep -qE '(<<<<<<<|>>>>>>>)' && echo "$f"
    done || true)
if [ -n "$CONFLICT_STAGED" ]; then
    echo ""
    echo "🚨🚨🚨 BLOCKED: Merge conflict markers in staged files! 🚨🚨🚨"
    echo "═══════════════════════════════════════════════════"
    echo "$CONFLICT_STAGED" | sed 's/^/   ❌ /'
    echo ""
    echo "   These WILL break the Vercel build. Resolve all conflict markers first."
    echo "═══════════════════════════════════════════════════"
    git reset HEAD 2>/dev/null || true
    echo "PUSH_OK:false"
    echo "REASON:merge_conflict_markers"
    exit 2
fi

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
# PHASE 2.4: NPM VERSION REGISTRY VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════
# Catches `npm error notarget` / ETARGET BEFORE it hits Vercel.
# Born from the 2026-04-19 deploy-failure chain where posthog-node@^4.20.0
# and serialize-javascript@^6.1.2 (both invalid) broke 15+ consecutive prod
# deploys. Only runs if package.json was changed in this commit.

if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -q '^package\.json$'; then
  if [ -f "scripts/verify-npm-versions.js" ]; then
    echo ""
    echo "🔎 Phase 2.4: npm version registry validation..."
    if ! node scripts/verify-npm-versions.js --changed 2>&1; then
      echo ""
      echo "❌ NPM VERSION VALIDATION FAILED — Aborting push."
      echo "   Invalid version specs would cause Vercel ETARGET on deploy."
      echo "   Fix the offending specs above and re-run the push."
      echo "PUSH_OK:false"
      echo "REASON:npm_invalid_versions"
      exit 2
    fi
    echo "✅ All npm version specs resolve against the registry"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2.5: BUILD GATE (optional)
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$BUILD_CHECK" = true ]; then
  echo ""
  echo "🔨 Phase 2.5: Build gate check..."
  
  # Intelligent skip for docs/scripts changes only
  APP_FILES_CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -vE '\.(md|sh|yml|txt|csv)$|^scripts/|^\.github/' || true)
  if [ -z "$APP_FILES_CHANGED" ] && [ -n "$(git log -1 --oneline 2>/dev/null)" ]; then
    echo "⚡ Skipping build check — only documentation, scripts, or config files changed."
  else
    BUILD_START=$(date +%s)
    
    # Capture output to check for node_modules corruption
  # MUST use --webpack: Next.js 16+ defaults to Turbopack which breaks on our
  # custom webpack config and 246+ named-export mismatches (May 2026 incident).
  BUILD_OUTPUT=$(NODE_OPTIONS='--max-old-space-size=4096' npx next build --webpack 2>&1)
  BUILD_STATUS=$?
  
  if [ $BUILD_STATUS -eq 0 ]; then
    BUILD_END=$(date +%s)
    echo "$BUILD_OUTPUT" | tail -10
    echo "✅ Build passed ($(( BUILD_END - BUILD_START ))s)"
  else
    # Check if failure was due to broken node_modules
    if echo "$BUILD_OUTPUT" | grep -iqE 'MODULE_NOT_FOUND|Cannot find module|command not found'; then
      echo "⚠️  Build failed due to corrupted node_modules. Auto-healing..."
      # MUST use --legacy-peer-deps: eslint@8 conflicts with eslint-config-next@16 peer dep requirements.
      # Without this flag npm install exits non-zero and node_modules remains broken.
      rm -rf node_modules && npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline 2>/dev/null
      
      echo "🔨 Retrying build after environment heal..."
      BUILD_OUTPUT=$(NODE_OPTIONS='--max-old-space-size=4096' npx next build --webpack 2>&1)
      BUILD_STATUS=$?
      
      if [ $BUILD_STATUS -eq 0 ]; then
        BUILD_END=$(date +%s)
        echo "$BUILD_OUTPUT" | tail -10
        echo "✅ Build passed after auto-heal ($(( BUILD_END - BUILD_START ))s)"
      else
        BUILD_END=$(date +%s)
        echo "$BUILD_OUTPUT" | tail -20
        echo "❌ BUILD FAILED ($(( BUILD_END - BUILD_START ))s) — Aborting push."
        echo "PUSH_OK:false"
        echo "REASON:build_failed_after_heal"
        exit 2
      fi
    else
      BUILD_END=$(date +%s)
      echo "$BUILD_OUTPUT" | tail -20
      echo "❌ BUILD FAILED ($(( BUILD_END - BUILD_START ))s) — Aborting push."
      echo "PUSH_OK:false"
      echo "REASON:build_failed"
      exit 2
    fi
  fi
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
  # NOTE: Antigravity IDE injects its own askpass helper with a hardcoded user ID,
  # which overrides gh auth credentials. We bypass this by constructing the push URL
  # with the gh auth token directly for GitHub repos.
  echo "🚀 Pushing to ${REMOTE}/${BRANCH}..."
  PUSH_URL=$(git remote get-url "${REMOTE}" 2>/dev/null || echo "")
  GH_TOKEN=$(gh auth token 2>/dev/null || echo "")
  if [ -n "$GH_TOKEN" ] && echo "$PUSH_URL" | grep -q "github.com"; then
    # Extract owner/repo from URL
    REPO_PATH=$(echo "$PUSH_URL" | sed 's|.*github.com[:/]||' | sed 's|\.git$||')
    AUTH_URL="https://x-access-token:${GH_TOKEN}@github.com/${REPO_PATH}.git"
    if git push $NO_VERIFY_FLAG --set-upstream "$AUTH_URL" "${BRANCH}" 2>&1; then
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

    # ── Phase 4: MANDATORY Post-Deploy Verification ──
    # HARD LAW: Every push MUST verify that Vercel deployed successfully.
    # An agent that pushes and walks away is WORSE than one that writes no code.
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "🔍 Phase 4: MANDATORY Post-Deploy Verification"
    echo "═══════════════════════════════════════════════════"
    echo "   Waiting for Vercel to build and deploy..."
    echo "   GitHub integration auto-deploys on push to main."
    echo "   Will poll production until SHA matches ${COMMIT_SHA}"
    echo "═══════════════════════════════════════════════════"
    
    # Wait 60s for Vercel to pick up the commit, then poll every 15s for up to 5 min
    if node "${SCRIPT_DIR}/verify-deploy.js" --wait 60 --match-sha "${COMMIT_SHA}" --timeout 300 2>&1; then
      echo ""
      echo "═══════════════════════════════════════════════════"
      echo "✅ DEPLOYMENT VERIFIED — Production is live!"
      echo "═══════════════════════════════════════════════════"
      exit 0
    else
      echo ""
      echo "═══════════════════════════════════════════════════"
      echo "⚠️  DEPLOY VERIFICATION FAILED"
      echo "   Production may not be serving your commit yet."
      echo "   Check Vercel dashboard: https://vercel.com/smarter-poker/hub-vanguard/deployments"
      echo "   DO NOT claim your task is done until this is resolved!"
      echo "═══════════════════════════════════════════════════"
      echo "DEPLOY_VERIFIED:false"
      exit 2
    fi
   else
    if [ $attempt -lt $MAX_RETRIES ]; then
      delay=$((attempt * 2))
      echo "⚠️  Push rejected. Retrying in ${delay}s..."
      sleep "$delay"
    fi
   fi
  else
    # Fallback: no gh token or not a GitHub repo — use standard push
    if git push $NO_VERIFY_FLAG --set-upstream "${REMOTE}" "${BRANCH}" 2>&1; then
      PHASE3_END=$(date +%s)
      TOTAL_END=$(date +%s)
      COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "N/A")
      echo ""
      echo "═══════════════════════════════════════════════════"
      echo "✅ Push successful!"
      echo "═══════════════════════════════════════════════════"

      # ── Phase 4: MANDATORY Post-Deploy Verification (fallback path) ──
      echo ""
      echo "═══════════════════════════════════════════════════"
      echo "🔍 Phase 4: MANDATORY Post-Deploy Verification"
      echo "═══════════════════════════════════════════════════"
      COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "N/A")
      if node "${SCRIPT_DIR}/verify-deploy.js" --wait 60 --match-sha "${COMMIT_SHA}" --timeout 300 2>&1; then
        echo "✅ DEPLOYMENT VERIFIED — Production is live!"
        exit 0
      else
        echo "⚠️  DEPLOY VERIFICATION FAILED — check Vercel dashboard"
        echo "DEPLOY_VERIFIED:false"
        exit 2
      fi
    else
      if [ $attempt -lt $MAX_RETRIES ]; then
        delay=$((attempt * 2))
        echo "⚠️  Push rejected. Retrying in ${delay}s..."
        sleep "$delay"
      fi
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
