#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Vercel Ignored Build Step
# Exit 0  = SKIP this build (nothing important changed)
# Exit 1  = BUILD this (real code changed)
#
# Configure in Vercel → hub-vanguard → Settings → Build and Deployment
# → Ignored Build Step → set to: bash scripts/vercel-ignore.sh
# ─────────────────────────────────────────────────────────────────────────────

# Always build production deployments triggered manually
if [ "$VERCEL_ENV" = "production" ] && [ "$VERCEL_GIT_COMMIT_REF" = "" ]; then
  echo "✅ Manual production deploy — building"
  exit 1
fi

# Get changed files since the last commit
CHANGED=$(git diff HEAD^ HEAD --name-only 2>/dev/null)

if [ -z "$CHANGED" ]; then
  echo "⚠️  Could not determine changed files — building to be safe"
  exit 1
fi

echo "Changed files:"
echo "$CHANGED"

# ── Skip build if ONLY these paths changed ───────────────────────────────────
# These are documentation, agent config, planning files, legacy backups,
# public/hub/club-arena static assets (pre-built SPA, not Next.js source),
# and other non-source paths that don't affect the Next.js build output.

IMPORTANT=$(echo "$CHANGED" | grep -vE \
  '^(\.agent/|\.agents/|\.planning/|\.hive-mind/|\.memory/|\.swarm/|\.claude/|\.ocr/|\.claude-flow/|docs/|_legacy_|tmp/|logs/|data/|scripts/bravo|scripts/create-bravo|scripts/scraper|playwright|playwright-report|test-results|__tests__|tests/|e2e/|build_log\.txt|debug_html\.txt|lint-errors\.json|.*\.md$|.*\.docx$|.*\.txt$|.*\.log$|public/hub/club-arena/)' \
)

if [ -z "$IMPORTANT" ]; then
  echo "🚫 Only non-source files changed — skipping build"
  echo "Skipped paths:"
  echo "$CHANGED"
  exit 0
fi

echo "✅ Source code changed — building:"
echo "$IMPORTANT"
exit 1
