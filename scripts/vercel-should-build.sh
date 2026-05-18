#!/bin/bash
# Vercel Ignored Build Step — scripts/vercel-should-build.sh
# Exit 0 = SKIP build | Exit 1 = PROCEED with build
#
# Skips the build when only non-code files changed (docs, tests, CI configs,
# markdown, references). Any change to app code, config files, or package
# dependencies triggers a full build.
#
# Added 2026-05-18 to reduce $207/mo Vercel build cost.
# The 952-page Next.js app was rebuilding on every single push to main.

CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null)

if [ -z "$CHANGED" ]; then
  echo "[should-build] Cannot determine diff — building to be safe"
  exit 1
fi

echo "[should-build] Changed files:"
echo "$CHANGED"
echo ""

# Find any file that falls OUTSIDE the skip list — those require a rebuild
NEEDS_BUILD=$(echo "$CHANGED" | grep -vE "^(docs/|references/|__tests__/|playwright/|e2e/|tests/|\.github/)|(README|CHANGELOG|CONTRIBUTING|\.md)$" | head -1)

if [ -n "$NEEDS_BUILD" ]; then
  echo "[should-build] App code changed (e.g. $NEEDS_BUILD) — proceeding with build"
  exit 1
fi

echo "[should-build] Only docs/tests changed — skipping build (saves ~\$8-12 in Vercel build costs)"
exit 0
