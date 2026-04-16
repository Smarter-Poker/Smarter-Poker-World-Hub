#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# CLUB ARENA ATOMIC BUILD & DEPLOY
# ═══════════════════════════════════════════════════════════════════════════════
# This script is the ONLY authorized way to deploy Club Arena changes.
# It builds → cleans → copies → commits → pushes in ONE atomic operation.
#
# WHY THIS EXISTS:
#   Club Arena is a Vite SPA. Every build generates NEW content-hashed filenames
#   (e.g., AchievementsPage-Cn7nZJFR-v6.js). Without this script, old files
#   accumulate as "phantom pending changes" in git (the 242-file nightmare).
#
# USAGE:
#   bash scripts/build-club-arena.sh "description of changes"
#
# RULES:
#   - NEVER manually add/commit files in public/hub/club-arena/
#   - NEVER gitignore public/hub/club-arena/ — Vercel needs these files
#   - ALWAYS use this script after Club Arena source changes
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Ensure Node/NPM are in PATH ────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Fallback path if nvm not used directly
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ─── Configuration ──────────────────────────────────────────────────────────
CLUB_ARENA_SRC="$HOME/Documents/club-arena"
WORLD_HUB="$HOME/Documents/Smarter-Poker-World-Hub"
ARENA_DEST="$WORLD_HUB/public/hub/club-arena"
DIST_DIR="/tmp/club-arena-dist-$$"
COMMIT_MSG="${1:-"feat(club-arena): rebuild and deploy latest changes"}"

# ─── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${CYAN}[ARENA]${NC} $1"; }
ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
fail()  { echo -e "${RED}  ✗ FATAL:${NC} $1"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  CLUB ARENA — ATOMIC BUILD & DEPLOY"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── STEP 0: Pre-flight checks ─────────────────────────────────────────────
log "Pre-flight checks..."

[ -d "$CLUB_ARENA_SRC" ] || fail "Club Arena source not found at $CLUB_ARENA_SRC"
[ -f "$CLUB_ARENA_SRC/package.json" ] || fail "No package.json in $CLUB_ARENA_SRC"
[ -d "$WORLD_HUB/.git" ] || fail "World Hub is not a git repo"

# Abort if World Hub has an in-progress rebase/merge
if [ -d "$WORLD_HUB/.git/rebase-merge" ] || [ -d "$WORLD_HUB/.git/rebase-apply" ]; then
  fail "World Hub has an in-progress rebase. Resolve it first: cd $WORLD_HUB && git rebase --abort"
fi
if [ -f "$WORLD_HUB/.git/MERGE_HEAD" ]; then
  fail "World Hub has an in-progress merge. Resolve it first."
fi

ok "Source repo found"
ok "World Hub is clean git state"

# ─── STEP 1: Build Club Arena ──────────────────────────────────────────────
log "Building Club Arena from source..."

cd "$CLUB_ARENA_SRC"

# Clean previous dist
rm -rf "$DIST_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  warn "node_modules missing — running npm install"
  npm install --silent
fi

# Build to temp directory (isolates from any stale state)
npx vite build --outDir "$DIST_DIR" --emptyOutDir 2>&1 | tail -5

[ -f "$DIST_DIR/index.html" ] || fail "Build produced no index.html — aborting"
ASSET_COUNT=$(ls "$DIST_DIR/assets/" 2>/dev/null | wc -l | tr -d ' ')
[ "$ASSET_COUNT" -gt 0 ] || fail "Build produced 0 assets — aborting"

ok "Build complete: $ASSET_COUNT asset files"

# ─── STEP 2: Count what we're replacing ─────────────────────────────────────
log "Preparing deployment to World Hub..."

cd "$WORLD_HUB"

OLD_ASSET_COUNT=$(ls "$ARENA_DEST/assets/" 2>/dev/null | wc -l | tr -d ' ')
OLD_TRACKED=$(git ls-files "$ARENA_DEST/" | wc -l | tr -d ' ')

log "  Old: $OLD_ASSET_COUNT assets on disk, $OLD_TRACKED tracked in git"
log "  New: $ASSET_COUNT assets from fresh build"

# ─── STEP 3: Atomic swap — delete old, copy new ────────────────────────────
log "Atomic swap: wiping old assets, copying new build..."

# Wipe the entire assets directory (removes ALL old Vite-hashed files)
rm -rf "$ARENA_DEST/assets"

# Copy fresh build output
cp "$DIST_DIR/index.html" "$ARENA_DEST/index.html"
cp -r "$DIST_DIR/assets" "$ARENA_DEST/assets"

# Copy any other top-level build artifacts (manifest, etc.)
for f in "$DIST_DIR"/*; do
  fname=$(basename "$f")
  if [ "$fname" != "index.html" ] && [ "$fname" != "assets" ]; then
    cp -r "$f" "$ARENA_DEST/$fname"
  fi
done

ok "Assets swapped"

# ─── STEP 4: Stage ALL changes (adds + deletions) ──────────────────────────
log "Staging all Club Arena changes in git..."

# git add -A stages new files AND detects deleted files
git add -A "$ARENA_DEST/"

STAGED_COUNT=$(git diff --cached --name-only "$ARENA_DEST/" | wc -l | tr -d ' ')

if [ "$STAGED_COUNT" -eq 0 ]; then
  warn "No changes detected — build output is identical to what's already committed"
  rm -rf "$DIST_DIR"
  echo ""
  echo "Nothing to deploy. Exiting."
  exit 0
fi

ok "Staged $STAGED_COUNT file changes"

# Show summary of what changed
ADDED=$(git diff --cached --diff-filter=A --name-only "$ARENA_DEST/" | wc -l | tr -d ' ')
DELETED=$(git diff --cached --diff-filter=D --name-only "$ARENA_DEST/" | wc -l | tr -d ' ')
MODIFIED=$(git diff --cached --diff-filter=M --name-only "$ARENA_DEST/" | wc -l | tr -d ' ')
log "  +$ADDED added, ~$MODIFIED modified, -$DELETED deleted"

# ─── STEP 5: Commit ────────────────────────────────────────────────────────
log "Committing..."

export ARENA_BUILD=1
git commit -m "$COMMIT_MSG" 2>&1 | tail -3

ok "Committed"

# ─── STEP 6: Push ──────────────────────────────────────────────────────────
log "Pushing to origin/main..."

git push origin main 2>&1 | tail -5

ok "Pushed to remote"

# ─── Cleanup ────────────────────────────────────────────────────────────────
rm -rf "$DIST_DIR"

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}CLUB ARENA DEPLOYED SUCCESSFULLY${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Assets: $ASSET_COUNT files"
echo "  Commit: $COMMIT_MSG"
echo ""

# ─── STEP 7: Verify clean state ────────────────────────────────────────────
REMAINING=$(git status --short "$ARENA_DEST/" | wc -l | tr -d ' ')
if [ "$REMAINING" -gt 0 ]; then
  warn "WARNING: $REMAINING arena files still showing as changed after push!"
  git status --short "$ARENA_DEST/" | head -5
else
  ok "Working tree clean — zero pending changes"
fi

echo ""
