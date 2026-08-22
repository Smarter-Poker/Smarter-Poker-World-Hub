#!/bin/sh
# transpilePackages guard — @smarter-poker/commander-shared ships raw JSX.
# Lived only in the tracked .husky/pre-commit, which nothing ran, so the
# guard for deploys 4xJcGVy2N / DWyP5RYRT has never once fired. Split out
# here so it runs alongside the checks that were really executing.
set -u
# 🛡️ transpilePackages GUARD — @smarter-poker/commander-shared ships raw JSX.
# If removed from next.config.js, the Vercel build crashes with:
#   "Module parse failed: Unexpected token" on any .jsx in node_modules.
# See failed deploys 4xJcGVy2N / DWyP5RYRT (April 2026). DO NOT REMOVE.
ALL_STAGED=$(git diff --cached --name-only --diff-filter=ACM || true)
if echo "$ALL_STAGED" | grep -q 'next.config'; then
  STAGED_CONFIG=$(git show ":next.config.js" 2>/dev/null || git show ":next.config.mjs" 2>/dev/null || true)
  if [ -n "$STAGED_CONFIG" ]; then
    if ! echo "$STAGED_CONFIG" | grep -q '@smarter-poker/commander-shared'; then
      echo "🚫 BLOCKED: next.config.js is missing @smarter-poker/commander-shared"
      echo "   in transpilePackages — build will crash. See deploy 4xJcGVy2N."
      exit 1
    fi
  fi
fi

exit 0
exit 0
