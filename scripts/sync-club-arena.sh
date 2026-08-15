#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# CLUB ARENA — CANONICAL BUILD + SYNC + PUSH (Phase U5.4)
# ═══════════════════════════════════════════════════════════════════════════════
# This is the ONE script for shipping a Club Arena frontend change.
# Replaces:
#   - WH scripts/build-club-arena.sh  (now a shim → here)
#   - CA scripts/sync-to-world-hub.sh (now a shim → here)
#
# WHAT IT DOES (atomic, one command):
#   1. Preflight: both repos clean, SENTRY_AUTH_TOKEN available for sourcemaps
#   2. Build CA with NODE_ENV=production + Sentry env → uploads sourcemaps
#   3. Wipe WH public/hub/club-arena/ (but preserve large static dirs that
#      won't be in a fresh build: cards/, images/, club-logos/, videos/)
#   4. Copy new dist index.html + assets/ + any new top-level artifacts
#   5. git add -A public/hub/club-arena/ (stages deletes of stale hashed files)
#   6. Commit with user-supplied message
#   7. Push to origin/main
#
# USAGE:
#   bash scripts/sync-club-arena.sh "feat(ca): new cashier UI"
#   bash scripts/sync-club-arena.sh           # uses default message
#
# ENVIRONMENT (read from ~/Documents/club-arena/.env if set there):
#   SENTRY_AUTH_TOKEN   Required for sourcemap upload. Missing → uploads skip
#                       (warning only, does not fail the deploy).
#   SENTRY_ORG          Default smarter-software-inc (see vite.config.ts)
#   SENTRY_PROJECT      Default javascript-react (see vite.config.ts)
#
# RULES:
#   - NEVER manually add/commit files in WH public/hub/club-arena/
#   - NEVER gitignore that dir — Vercel needs the files
#   - ALWAYS use THIS script after CA source changes
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Load nvm so npm/node are in PATH when invoked non-interactively (CI, cron)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ─── Configuration ──────────────────────────────────────────────────────────
CA_SRC="$HOME/Documents/club-arena"
WH="$HOME/Documents/Smarter-Poker-World-Hub"
DEST="$WH/public/hub/club-arena"
DIST_TMP="/tmp/club-arena-sync-$$"
COMMIT_MSG="${1:-chore(club-arena): rebuild and sync dist}"

# ─── Colors ─────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; C='\033[0;36m'; N='\033[0m'
log()  { echo -e "${C}[sync-ca]${N} $1"; }
ok()   { echo -e "${G}  ✓${N} $1"; }
warn() { echo -e "${Y}  ⚠${N} $1"; }
die()  { echo -e "${R}  ✗ FATAL:${N} $1"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  CLUB ARENA — sync-club-arena.sh (canonical deploy)"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── STEP 0: Preflight ─────────────────────────────────────────────────────
log "Preflight..."
[ -d "$CA_SRC" ] || die "CA source not found at $CA_SRC"
[ -f "$CA_SRC/package.json" ] || die "No package.json in $CA_SRC"
[ -d "$WH/.git" ] || die "WH is not a git repo"

if [ -d "$WH/.git/rebase-merge" ] || [ -d "$WH/.git/rebase-apply" ]; then
  die "WH has an in-progress rebase. Abort it first: cd $WH && git rebase --abort"
fi
[ ! -f "$WH/.git/MERGE_HEAD" ] || die "WH has an in-progress merge. Resolve first."

# Pull Sentry env from CA .env if not set externally
if [ -z "${SENTRY_AUTH_TOKEN:-}" ] && [ -f "$CA_SRC/.env" ]; then
  SENTRY_AUTH_TOKEN=$(grep -E '^SENTRY_AUTH_TOKEN=' "$CA_SRC/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo "")
fi
if [ -z "${SENTRY_ORG:-}" ] && [ -f "$CA_SRC/.env" ]; then
  SENTRY_ORG=$(grep -E '^SENTRY_ORG=' "$CA_SRC/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo "")
fi
if [ -z "${SENTRY_PROJECT:-}" ] && [ -f "$CA_SRC/.env" ]; then
  SENTRY_PROJECT=$(grep -E '^SENTRY_PROJECT=' "$CA_SRC/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo "")
fi

if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
  ok "Sentry token present — sourcemaps WILL upload"
else
  warn "SENTRY_AUTH_TOKEN not set — sourcemaps will NOT upload"
fi
ok "Preflight clean"

# ─── STEP 1: Build ─────────────────────────────────────────────────────────
log "Building CA from source..."
cd "$CA_SRC"
rm -rf "$DIST_TMP"

if [ ! -d "node_modules" ]; then
  warn "node_modules missing — npm ci"
  npm ci --silent
fi

NODE_ENV=production \
  SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}" \
  SENTRY_ORG="${SENTRY_ORG:-smarter-software-inc}" \
  SENTRY_PROJECT="${SENTRY_PROJECT:-javascript-react}" \
  npx vite build --outDir "$DIST_TMP" --emptyOutDir 2>&1 | tail -8

[ -f "$DIST_TMP/index.html" ] || die "Build produced no index.html"
ASSET_COUNT=$(ls "$DIST_TMP/assets/" 2>/dev/null | wc -l | tr -d ' ')
[ "$ASSET_COUNT" -gt 0 ] || die "Build produced 0 assets"
ok "Build complete: $ASSET_COUNT asset files"

# Strip any .map files the Sentry plugin didn't already delete (belt-and-braces)
MAP_COUNT=$(find "$DIST_TMP" -name '*.map' | wc -l | tr -d ' ')
if [ "$MAP_COUNT" -gt 0 ]; then
  find "$DIST_TMP" -name '*.map' -delete
  warn "Stripped $MAP_COUNT residual .map files (Sentry plugin didn't)"
fi

# ─── STEP 2: Swap ──────────────────────────────────────────────────────────
log "Atomic swap into WH..."
cd "$WH"

OLD_ASSETS=$(ls "$DEST/assets/" 2>/dev/null | wc -l | tr -d ' ')
log "  old: $OLD_ASSETS assets, new: $ASSET_COUNT assets"

# Wipe only the churny parts — index.html + assets/. Preserve cards/, images/,
# club-logos/, videos/ etc. which are bulky statics not in a fresh build.
rm -rf "$DEST/assets"
cp "$DIST_TMP/index.html" "$DEST/index.html"
cp -r "$DIST_TMP/assets" "$DEST/assets"

# Copy any other top-level build artifacts except big static dirs CA doesn't rebuild
for f in "$DIST_TMP"/*; do
  fname=$(basename "$f")
  case "$fname" in
    index.html|assets) ;;
    cards|images|club-logos|videos) ;; # preserved — not touched
    # Dan 2026-08-15 — NESTING BUG. This used to be a bare
    # `cp -r "$f" "$DEST/$fname"`. When $DEST/$fname already exists as a
    # directory, `cp -r src/d dest/d` copies the source INTO the existing
    # directory, producing dest/d/d. game-card-icons/ is neither wiped (only
    # assets/ is) nor preserved (only cards|images|club-logos|videos are), so
    # it survived every sync and re-nested one level deeper each run: a
    # 2026-08-15 sync staged 51 duplicate PNGs (~6 MB) at
    # game-card-icons/game-card-icons/, and the next run would have added a
    # third level. Mirror the assets/ handling — clear the destination
    # directory first so every sync writes a flat, exact copy.
    *)
      # Explicit `if` rather than `[ -d ] && rm`: this script runs under
      # `set -e`, and dist/ contains plain files (sw.js, manifest.json) as
      # well as directories, so the test legitimately fails on most entries.
      if [ -d "$f" ]; then
        rm -rf "$DEST/$fname"
      fi
      cp -r "$f" "$DEST/$fname"
      ;;
  esac
done
ok "Swapped"

# ─── STEP 3: Stage ─────────────────────────────────────────────────────────
log "Staging..."
git add -A "$DEST/"
STAGED=$(git diff --cached --name-only "$DEST/" | wc -l | tr -d ' ')
if [ "$STAGED" -eq 0 ]; then
  warn "No changes — build output identical to committed state"
  rm -rf "$DIST_TMP"
  exit 0
fi
ADD=$(git diff --cached --diff-filter=A --name-only "$DEST/" | wc -l | tr -d ' ')
DEL=$(git diff --cached --diff-filter=D --name-only "$DEST/" | wc -l | tr -d ' ')
MOD=$(git diff --cached --diff-filter=M --name-only "$DEST/" | wc -l | tr -d ' ')
ok "Staged $STAGED changes  (+$ADD ~$MOD -$DEL)"

# ─── STEP 4: Commit + push ─────────────────────────────────────────────────
log "Committing..."
export ARENA_BUILD=1
git commit -m "$COMMIT_MSG" 2>&1 | tail -3
ok "Committed"

log "Pushing..."
git push origin main 2>&1 | tail -3
ok "Pushed"

# ─── Cleanup ────────────────────────────────────────────────────────────────
rm -rf "$DIST_TMP"

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  ${G}CLUB ARENA DEPLOYED${N}"
echo "═══════════════════════════════════════════════════════"
echo "  assets: $ASSET_COUNT  |  msg: $COMMIT_MSG"
echo ""

REMAIN=$(git status --short "$DEST/" | wc -l | tr -d ' ')
if [ "$REMAIN" -gt 0 ]; then
  warn "WARNING: $REMAIN arena files still show as changed after push!"
  git status --short "$DEST/" | head -5
else
  ok "Working tree clean"
fi
echo ""
