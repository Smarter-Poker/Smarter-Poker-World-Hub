#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# VERCEL IGNORED BUILD STEP — hub-vanguard
# ═══════════════════════════════════════════════════════════════════════════════
#
# Exit 0 = SKIP this build (only noise — docs, agent files, Python scrapers)
# Exit 1 = BUILD this (real source, pages, API routes, arena deploys)
#
# Setup in Vercel:
#   hub-vanguard → Settings → Build and Deployment → Ignored Build Step
#   Command: bash scripts/vercel-ignore.sh
#
# DESIGN INTENT:
#   - Club Arena deploys via build-club-arena.sh are ALWAYS immediate.
#     public/hub/club-arena/ changes are treated as real deployments.
#   - Pure noise commits (docs, agent memory, Python scrapers, test files)
#     are skipped — these don't affect what users see on smarter.poker.
#   - The daily GitHub Actions safety-net (club-arena-scheduled-deploy.yml)
#     fires at 2PM CT only if somehow no deploy happened that day.
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

# ── SKIP LIST: pure noise that never affects what users see ──────────────────
#
# NEVER SKIPPED (always builds):
#   pages/                 → Next.js pages
#   src/                   → Source components/hooks/lib
#   styles/                → Global CSS
#   public/hub/club-arena/ → Club Arena SPA (intentional deploys via build-club-arena.sh)
#   next.config.js         → Build configuration
#   vercel.json            → Vercel routing/headers/crons
#   middleware.ts           → Edge middleware
#   package.json           → Dependency changes
#   tailwind.config.js     → CSS config
#   tsconfig.json          → TypeScript config
#   scripts/vercel-ignore.sh → This file itself
#
# ALWAYS SKIPPED (pure noise, no user-visible impact):
#   .agent/, .agents/      → AI agent configs, workflows, skills, memory
#   .planning/             → GSD planning docs
#   .hive-mind/, .swarm/   → Multi-agent orchestration state
#   .memory/               → Claude memory files
#   .ocr/, .claude-flow/   → Code review / workflow state
#   .cursorrules           → Editor config
#   docs/                  → Documentation
#   _legacy_*/             → Archived legacy code
#   tmp/, logs/            → Temp files and logs
#   data/                  → Scraped data files
#   skills/, templates/    → Agent skill files
#   output/                → Build/scraper output
#   playwright*/           → E2E test infrastructure
#   test-results/          → Test output
#   __tests__/, tests/, e2e/ → Test suites (run in CI, not prod)
#   scripts/bravo*         → Bravo Poker Python scrapers (run on Hetzner)
#   scripts/create-bravo*  → Same
#   scripts/scraper*       → Same
#   *.md                   → Markdown documentation
#   *.docx                 → Word documents
#   *.log                  → Log files
#   *.py                   → Python scripts (not deployed to Vercel)
#   lint-errors.json       → ESLint artifact
#   tsconfig.tsbuildinfo   → TypeScript incremental cache
#   build_log.txt          → Build log
#   debug_html.txt         → Debug output
#   .buildstamp            → Daily deploy timestamp (managed by GitHub Actions)
#
SKIP_PATTERN='^(\.agent/|\.agents/|\.planning/|\.hive-mind/|\.memory/|\.swarm/|\.claude/|\.ocr/|\.claude-flow/|\.cursorrules|\.editorconfig|docs/|_legacy_|tmp/|logs/|data/|skills/|templates/|output/|playwright|playwright-report|test-results|__tests__|tests/|e2e/|scripts/bravo|scripts/create-bravo|scripts/scraper|build_log\.txt|debug_html\.txt|lint-errors\.json|tsconfig\.tsbuildinfo|\.buildstamp|.*\.md$|.*\.docx$|.*\.log$|.*\.py$)'

# ── Check if any REAL files changed ──────────────────────────────────────────
IMPORTANT=$(echo "$CHANGED" | grep -vE "$SKIP_PATTERN" || true)

if [ -z "$IMPORTANT" ]; then
  echo "🚫 SKIPPING BUILD — only noise files changed (docs, agents, scrapers):"
  echo "$CHANGED"
  echo "═══════════════════════════════════════════════════════"
  exit 0
fi

echo "✅ BUILDING — real source files changed:"
echo "$IMPORTANT"
echo "═══════════════════════════════════════════════════════"
exit 1
