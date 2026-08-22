#!/bin/sh
# CLUB ARENA BUNDLE GATE (pre-push).
#
# Split out of .husky/pre-push so it runs INDEPENDENTLY of the JS/TS safety
# gate. In the version this replaces it could not: that hook exits 0 early
# with "No JS/TS files changed. Push allowed." — and a push that carries only
# `public/hub/club-arena/**` contains no JS/TS files by that filter, so the two
# checks below were skipped by exactly the pushes they exist to inspect.
#
# The incident they are here for: on 2026-08-21 a rebuild from a stale local
# checkout replaced the live Club Arena bundle with a months-old one and
# silently reverted the throwables system in production. Every other gate
# passed — the bundle was valid, in budget and lint-clean. Only its CONTENT was
# old.
set -u
ERRORS=0

# node is not guaranteed on PATH in a hook's environment (a push from an
# agent's minimal sh had no /opt/homebrew/bin, and the bare `node` failures
# below were then misreported as a STALE bundle). Resolve it explicitly.
NODE_BIN=$(command -v node 2>/dev/null || true)
[ -n "$NODE_BIN" ] || { [ -x /opt/homebrew/bin/node ] && NODE_BIN=/opt/homebrew/bin/node; }
[ -n "$NODE_BIN" ] || { [ -x /usr/local/bin/node ] && NODE_BIN=/usr/local/bin/node; }

CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null)
# For the push range, prefer the upstream; for a NEW branch fall back to the
# merge-base with origin/main — the old HEAD~5..HEAD fallback picked up five
# arbitrary commits already ON main (usually club-arena syncs), which made
# this gate fire on pushes that never touched the bundle.
if [ -z "$CHANGED_FILES" ]; then
  CHANGED_FILES=$(git diff --name-only "@{push}..HEAD" 2>/dev/null || true)
fi
if [ -z "$CHANGED_FILES" ]; then
  MB=$(git merge-base origin/main HEAD 2>/dev/null || true)
  if [ -n "$MB" ]; then
    CHANGED_FILES=$(git diff --name-only "$MB"..HEAD 2>/dev/null || true)
  else
    CHANGED_FILES=$(git diff --name-only HEAD~5..HEAD 2>/dev/null || true)
  fi
fi

# ─── CHECK 6: Club Arena orphaned assets ────────────────────────────────────
# Detects when someone rebuilt Club Arena but didn't commit the results.
# This prevents the "242 phantom pending changes" problem.
echo "CHECK 6: Club Arena asset integrity..."
ARENA_DIR="public/hub/club-arena"
ARENA_UNTRACKED=$(git ls-files --others --exclude-standard "$ARENA_DIR/" 2>/dev/null | wc -l | tr -d ' ')
ARENA_MODIFIED=$(git diff --name-only "$ARENA_DIR/" 2>/dev/null | wc -l | tr -d ' ')
ARENA_ORPHANS=$((ARENA_UNTRACKED + ARENA_MODIFIED))
if [ "$ARENA_ORPHANS" -gt 0 ]; then
  echo "  ❌ BLOCKED: $ARENA_ORPHANS unstaged Club Arena files detected!"
  echo "     $ARENA_UNTRACKED untracked, $ARENA_MODIFIED modified"
  echo ""
  echo "     Club Arena was rebuilt but changes were NOT committed."
  echo "     Run: bash scripts/build-club-arena.sh \"your commit message\""
  echo "     That script handles the full build → clean → commit → push cycle."
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo "  ✓ No orphaned Club Arena assets"
fi

# ─── CHECK 6: Club Arena throwables freshness (stale-bundle gate) ───────────
# 2026-08-21: a rebuild from a stale local checkout replaced the current
# Club Arena bundle with a months-old one, silently reverting the throwables
# system in production. Every other gate passed — the bundle was valid, in
# budget, lint-clean. Only its CONTENT was old. This runs whenever the built
# output is part of the push.
echo "CHECK 6: Club Arena throwables freshness..."
if echo "$CHANGED_FILES" | grep -q '^public/hub/club-arena/'; then
  if [ -z "$NODE_BIN" ]; then
    # Say what is actually wrong. When `node` was missing these three checks
    # all failed and the push was blocked as "STALE or INCOMPLETE" — a
    # diagnosis that sends people rebuilding a bundle that was never the
    # problem.
    echo "  ❌ BLOCKED: node not found on PATH — the bundle checks cannot run."
    echo "     Re-run with node available, e.g.:"
    echo "       PATH=\"/opt/homebrew/bin:\$PATH\" git push ..."
    ERRORS=$((ERRORS + 1))
  else
    CA_GATE_FAIL=0
    # Provenance first: "older than what is deployed" explains the rest.
    "$NODE_BIN" scripts/ci/check-ca-build-provenance.mjs || CA_GATE_FAIL=1
    "$NODE_BIN" scripts/ci/check-ca-protected-features.mjs || CA_GATE_FAIL=1
    "$NODE_BIN" scripts/ci/check-ca-throwables-freshness.mjs || CA_GATE_FAIL=1
    if [ "$CA_GATE_FAIL" -eq 0 ]; then
      echo "  ✓ Club Arena bundle is current and complete"
    else
      echo "  ❌ BLOCKED: the Club Arena bundle being pushed is STALE or INCOMPLETE"
      echo "     Sync ~/Documents/club-arena (fetch + fast-forward, or"
      echo "     scripts/git-unstick.sh — its pre-rebase hook refuses a"
      echo "     replaying 'git pull --rebase origin main' by design), then"
      echo "     rebuild — or let build-for-world-hub sync from canonical main."
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  echo "  ✓ No Club Arena build output in this push"
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $ERRORS Club Arena bundle check(s) failed."
  echo "To bypass in a genuine emergency: git push --no-verify"
  exit 1
fi
exit 0
