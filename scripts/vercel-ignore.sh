#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# VERCEL IGNORED BUILD STEP — hub-vanguard
# ═══════════════════════════════════════════════════════════════════════════════
#
# Exit 0 = SKIP this build (only noise changed — docs, agents, arena artifacts)
# Exit 1 = BUILD this (real Next.js source, pages, API routes, styles changed)
#
# Setup in Vercel:
#   hub-vanguard → Settings → Build and Deployment → Ignored Build Step
#   Command: bash scripts/vercel-ignore.sh
#
# HOW THE DAILY CLUB ARENA DEPLOY WORKS:
#   This script skips builds triggered by incremental arena sync commits.
#   At 2PM CT daily, a Vercel Deploy Hook is POSTed by GitHub Actions
#   (see .github/workflows/club-arena-scheduled-deploy.yml), which bypasses
#   this ignore script entirely and forces a full fresh build with the
#   latest club-arena assets already committed to main.
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# ── Safety: always build on initial deploy (no HEAD^ to compare) ─────────────
if ! git rev-parse HEAD^ >/dev/null 2>&1; then
  echo "✅ Initial commit — building"
  exit 1
fi

# ── Get the list of changed files ────────────────────────────────────────────
CHANGED=$(git diff HEAD^ HEAD --name-only 2>/dev/null)

if [ -z "$CHANGED" ]; then
  echo "⚠️  Cannot determine changed files — building to be safe"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  VERCEL BUILD GATE — Checking changed files"
echo "═══════════════════════════════════════════════════════"
echo "Changed files in this commit:"
echo "$CHANGED"
echo ""

# ── Skip-list: paths that NEVER require a Next.js rebuild ────────────────────
#
# public/hub/club-arena/  → pre-built Vite SPA artifacts. Deployed via
#                           the daily 2PM GitHub Actions Deploy Hook, NOT
#                           on every incremental sync commit. Intentional skip.
#
# .agent/, .agents/       → AI agent configs, workflows, skills, memory
# .planning/              → GSD planning docs
# .hive-mind/, .swarm/    → Multi-agent orchestration state
# .memory/                → Claude memory files
# .ocr/, .claude-flow/    → Code review / workflow state
# docs/, _legacy_/        → Documentation and archived code
# tmp/, logs/, data/      → Temp files, logs, scraped data
# scripts/bravo*          → Python scrapers (run on Hetzner, not Vercel)
# scripts/create-bravo*   → Same
# playwright*             → E2E test files
# __tests__/, tests/, e2e/ → Test suites
# *.md, *.docx, *.txt     → Documentation files
# *.log                   → Log files
# *.py                    → Python server scripts
# lint-errors.json        → ESLint cache
# tsconfig.tsbuildinfo    → TypeScript incremental build info
#
SKIP_PATTERN='^(public/hub/club-arena/|\.agent/|\.agents/|\.planning/|\.hive-mind/|\.memory/|\.swarm/|\.claude/|\.ocr/|\.claude-flow/|\.cursorrules|\.editorconfig|docs/|_legacy_|tmp/|logs/|data/|skills/|templates/|output/|playwright|playwright-report|test-results|__tests__|tests/|e2e/|scripts/bravo|scripts/create-bravo|scripts/scraper|build_log\.txt|debug_html\.txt|lint-errors\.json|tsconfig\.tsbuildinfo|.*\.md$|.*\.docx$|.*\.txt$|.*\.log$|.*\.py$)'

# ── Check if any IMPORTANT files changed ─────────────────────────────────────
IMPORTANT=$(echo "$CHANGED" | grep -vE "$SKIP_PATTERN" || true)

if [ -z "$IMPORTANT" ]; then
  echo "🚫 SKIPPING BUILD — only non-source files changed:"
  echo "$CHANGED"
  echo ""
  echo "  Next full deploy: daily 2PM CT via GitHub Actions Deploy Hook"
  echo "═══════════════════════════════════════════════════════"
  exit 0
fi

echo "✅ BUILDING — source files changed:"
echo "$IMPORTANT"
echo "═══════════════════════════════════════════════════════"
exit 1
