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
CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null)
[ -n "$CHANGED_FILES" ] || CHANGED_FILES=$(git diff --name-only "@{push}..HEAD" 2>/dev/null || git diff --name-only HEAD~5..HEAD 2>/dev/null || true)

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
  CA_GATE_FAIL=0
  # Provenance first: "older than what is deployed" explains the rest.
  node scripts/ci/check-ca-build-provenance.mjs || CA_GATE_FAIL=1
  node scripts/ci/check-ca-protected-features.mjs || CA_GATE_FAIL=1
  node scripts/ci/check-ca-throwables-freshness.mjs || CA_GATE_FAIL=1
  if [ "$CA_GATE_FAIL" -eq 0 ]; then
    echo "  ✓ Club Arena bundle is current and complete"
  else
    echo "  ❌ BLOCKED: the Club Arena bundle being pushed is STALE or INCOMPLETE"
    echo "     In ~/Documents/club-arena run: git pull --rebase origin main"
    echo "     then rebuild — or let build-for-world-hub sync from canonical main."
    ERRORS=$((ERRORS + 1))
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
