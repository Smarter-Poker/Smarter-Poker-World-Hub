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
# CA source directory. This script used to hardcode ~/Documents/club-arena, the
# PRE-RENAME clone. When that directory still exists and is stale, every run
# publishes an old bundle stamped with the CURRENT origin/main sha — so the
# source repo looks correct while production serves something else. That has
# silently reverted shipped work more than once (2026-08-19: the Player Stats
# rebuild was overwritten twice this way, and an earlier LeaderboardPage sync
# hit the same trap). Prefer the canonical repo; the legacy path is only a
# fallback, and it announces itself.
CA_SRC="${CA_SRC_OVERRIDE:-}"
if [ -z "$CA_SRC" ]; then
  if [ -d "$HOME/Documents/Smarter-Poker-Club-Arena/.git" ]; then
    CA_SRC="$HOME/Documents/Smarter-Poker-Club-Arena"
  else
    CA_SRC="$HOME/Documents/club-arena"
  fi
fi
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
log "  building from: $CA_SRC"
case "$CA_SRC" in
  */club-arena) warn "using the PRE-RENAME clone — verify it tracks the same remote" ;;
esac

# STALE-SOURCE GUARD. The failure this prevents: a local tree behind origin/main
# gets built, and the resulting bundle is committed with a message naming the
# CURRENT sha — so the commit claims to ship code that is not in it, CI's correct
# build is overwritten, and the regression is invisible in the source repo.
# Override with ALLOW_STALE_CA=1 only if you know why.
if [ -d "$CA_SRC/.git" ]; then
  if git -C "$CA_SRC" fetch origin main --quiet 2>/dev/null; then
    CA_HEAD="$(git -C "$CA_SRC" rev-parse HEAD)"
    CA_REMOTE="$(git -C "$CA_SRC" rev-parse origin/main)"
    if [ "$CA_HEAD" != "$CA_REMOTE" ]; then
      if [ "${ALLOW_STALE_CA:-0}" = "1" ]; then
        warn "CA HEAD ${CA_HEAD:0:9} != origin/main ${CA_REMOTE:0:9} (ALLOW_STALE_CA=1)"
      else
        die "CA source is not at origin/main.
    HEAD:        $CA_HEAD
    origin/main: $CA_REMOTE
  Publishing from here would ship a bundle that does not match the sha this
  commit will claim, overwriting whatever CI built. Fix with:
    cd $CA_SRC && git pull --ff-only
  or re-run with ALLOW_STALE_CA=1 if the difference is deliberate."
      fi
    else
      ok "CA source is at origin/main (${CA_HEAD:0:9})"
    fi
    # Uncommitted source changes silently end up in the published bundle.
    if ! git -C "$CA_SRC" diff --quiet -- src 2>/dev/null; then
      warn "uncommitted changes under $CA_SRC/src — they WILL ship in this bundle"
    fi
  else
    warn "could not fetch origin/main in $CA_SRC — skipping the stale-source check"
  fi
fi

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

# ─── Build-time public config ───────────────────────────────────────────────
# 2026-08-20 OUTAGE: this script built with bare `npx vite build`, so it
# depended on whichever .env happened to exist in CA_SRC. The canonical
# checkout has no .env at all, so the build emitted a bundle with
# VITE_SUPABASE_URL undefined; the only publish check was "index.html exists",
# it passed, and smarter.poker served a BLANK PAGE to every visitor ("Uncaught
# supabaseUrl is required"). CI never had this bug because
# .github/workflows/build-for-world-hub.yml passes these explicitly. Same
# values, same place in the pipeline — the local path is no longer the weak one.
# These are the PUBLIC anon/publishable values that ship inside the bundle; the
# service-role key is never referenced here.
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://kuklfnapbkmacvwxktbh.supabase.co}"
export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-sb_publishable__41LpJpzrfrb3hSUpEaYCA_tF53bBJx}"
export VITE_ENGINE_URL="${VITE_ENGINE_URL:-https://engine.smarter.poker}"
export VITE_ANTIGRAVITY_ENABLED="${VITE_ANTIGRAVITY_ENABLED:-true}"
export VITE_APP_ENV="${VITE_APP_ENV:-production}"

NODE_ENV=production \
  SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}" \
  SENTRY_ORG="${SENTRY_ORG:-smarter-software-inc}" \
  SENTRY_PROJECT="${SENTRY_PROJECT:-javascript-react}" \
  npx vite build --outDir "$DIST_TMP" --emptyOutDir 2>&1 | tail -8

[ -f "$DIST_TMP/index.html" ] || die "Build produced no index.html"

# ─── Publish gate: does the artefact actually WORK? ─────────────────────────
# "index.html exists" is not evidence of a usable app. Assert the config the
# app cannot boot without is really inside the bundle we are about to ship.
# This check, and not the one above, is what would have caught the outage.
ENTRY_JS="$(grep -o 'assets/index-[^"]*\.js' "$DIST_TMP/index.html" | head -1)"
[ -n "$ENTRY_JS" ] || die "Build produced no entry chunk reference in index.html"
[ -f "$DIST_TMP/$ENTRY_JS" ] || die "index.html references $ENTRY_JS but it is not in the build"
if ! grep -qF "$VITE_SUPABASE_URL" "$DIST_TMP/$ENTRY_JS"; then
  die "Entry chunk has no Supabase URL baked in — this bundle would render a BLANK PAGE. Refusing to publish. (Build ran without VITE_SUPABASE_URL; check CA_SRC=$CA_SRC.)"
fi
if ! grep -qF "$VITE_SUPABASE_ANON_KEY" "$DIST_TMP/$ENTRY_JS"; then
  die "Entry chunk has no Supabase anon key baked in — refusing to publish."
fi
ok "Publish gate: Supabase config present in $ENTRY_JS"

# BUILD PROVENANCE. Stamp the CA commit this bundle was actually built from into
# the bundle itself. Without it there is no way to tell a good publish from one
# built off a stale tree except by grepping minified chunks for a string you
# happen to know — which is how three bad syncs on 2026-08-19 were caught, after
# the fact. With it:
#     curl -s https://smarter.poker/hub/club-arena/build-info.json
# answers "which commit is actually live" directly, and CI can assert it.
BUILD_SHA="$(git -C "$CA_SRC" rev-parse HEAD 2>/dev/null || echo unknown)"
cat > "$DIST_TMP/build-info.json" <<JSON
{
  "ca_sha": "$BUILD_SHA",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "built_by": "sync-club-arena.sh",
  "source": "$CA_SRC"
}
JSON
ok "stamped build-info.json (ca_sha ${BUILD_SHA:0:9})"
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

# Dan 2026-08-19 [P0 — broken "+" button]: this used to `rm -rf $DEST/assets`
# before copying, which DELETES the hashed chunks that every already-open
# session is still running against. The moment a deploy landed, any player with
# the app open got "Failed to fetch dynamically imported module ..." the next
# time they hit a lazy route (Dan hit it on the lobby "+"). Their HTML is
# cached, so reloading served the same dead references.
#
# Assets are CONTENT-HASHED, so new builds never collide with old files: we can
# simply overlay the new ones and leave the previous generation in place. Open
# sessions keep working; new sessions get the new index.html. Stale files are
# pruned on a delay below, well after any reasonable session has ended.
cp "$DIST_TMP/index.html" "$DEST/index.html"
mkdir -p "$DEST/assets"
cp -R "$DIST_TMP/assets/." "$DEST/assets/"

# Prune assets that are no longer referenced AND older than the grace window,
# so the directory cannot grow without bound. 3 days ≫ any live session.
ASSET_GRACE_DAYS=3
if [ -d "$DEST/assets" ]; then
  PRUNED=$(find "$DEST/assets" -type f -mtime +$ASSET_GRACE_DAYS -print -delete 2>/dev/null | wc -l | tr -d ' ')
  [ "$PRUNED" -gt 0 ] && log "  pruned $PRUNED asset(s) older than ${ASSET_GRACE_DAYS}d"
fi

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
