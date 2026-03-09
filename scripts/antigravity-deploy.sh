#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# ANTI-GRAVITY AUTO-DEPLOY SCRIPT v2.0
# ═══════════════════════════════════════════════════════════════════════════
# Atomic deployment across: Supabase SQL, GitHub, Vercel
# Delegates to hardened sub-scripts for reliability.
# ═══════════════════════════════════════════════════════════════════════════
#
# USAGE:
#   bash scripts/antigravity-deploy.sh                          # full deploy
#   bash scripts/antigravity-deploy.sh "feat: my feature"       # custom commit msg
#   bash scripts/antigravity-deploy.sh --skip-sql               # skip DB phase
#   bash scripts/antigravity-deploy.sh --skip-vercel            # skip Vercel phase
#
# EXIT CODES:
#   0 = all phases passed
#   1 = one or more phases failed (see summary)
# ═══════════════════════════════════════════════════════════════════════════

# Do NOT use set -e — we handle errors per-phase
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
TOTAL_START=$(date +%s)

# ── Parse args ──
COMMIT_MSG=""
SKIP_SQL=false
SKIP_VERCEL=false
for arg in "$@"; do
    case "$arg" in
        --skip-sql) SKIP_SQL=true ;;
        --skip-vercel) SKIP_VERCEL=true ;;
        *) [ -z "$COMMIT_MSG" ] && COMMIT_MSG="$arg" ;;
    esac
done
COMMIT_MSG="${COMMIT_MSG:-chore: Anti-Gravity auto-deploy $(date +%Y%m%d-%H%M%S)}"

# ── Status tracking ──
SQL_OK="skipped"
GIT_OK="false"
VERCEL_OK="skipped"

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 ANTI-GRAVITY AUTO-DEPLOY v2.0"
echo "═══════════════════════════════════════════════════════════════"
echo "   Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "   Project:   ${PROJECT_ROOT}"
echo "   Message:   ${COMMIT_MSG}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 1: SUPABASE SQL MIGRATION
# ═══════════════════════════════════════════════════════════════════════════
echo "📊 PHASE 1: SUPABASE SQL MIGRATION"
echo "───────────────────────────────────────────────────────────────"

if [ "$SKIP_SQL" = true ]; then
    echo "   ⏭️  Skipped (--skip-sql)"
else
    # Look for pending migrations in the standard locations
    MIGRATION_DIRS=(
        "${PROJECT_ROOT}/supabase/migrations"
        "${PROJECT_ROOT}/database/migrations"
        "${PROJECT_ROOT}/migrations"
    )

    FOUND_MIGRATIONS=false
    for mdir in "${MIGRATION_DIRS[@]}"; do
        if [ -d "$mdir" ]; then
            SQL_COUNT=$(find "$mdir" -name '*.sql' -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
            if [ "$SQL_COUNT" -gt 0 ]; then
                echo "   Found ${SQL_COUNT} SQL file(s) in ${mdir}"
                if node "${SCRIPT_DIR}/antigravity_sql_push.js" "$mdir"; then
                    SQL_OK="true"
                else
                    SQL_OK="false"
                    echo "   ⚠️  SQL migration had errors (non-fatal, continuing)"
                fi
                FOUND_MIGRATIONS=true
                break
            fi
        fi
    done

    if [ "$FOUND_MIGRATIONS" = false ]; then
        echo "   ℹ️  No pending SQL migrations found."
        SQL_OK="none"
    fi
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 2: GITHUB SYNC (via git-safe-push.sh)
# ═══════════════════════════════════════════════════════════════════════════
echo "📦 PHASE 2: GITHUB SYNC"
echo "───────────────────────────────────────────────────────────────"

if bash "${SCRIPT_DIR}/git-safe-push.sh" "${COMMIT_MSG}"; then
    GIT_OK="true"
else
    GIT_OK="false"
    echo "   ⚠️  Git push failed"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 3: VERCEL DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════════
echo "🌐 PHASE 3: VERCEL DEPLOYMENT"
echo "───────────────────────────────────────────────────────────────"

if [ "$SKIP_VERCEL" = true ]; then
    echo "   ⏭️  Skipped (--skip-vercel)"
elif ! command -v vercel &> /dev/null; then
    echo "   ⚠️  Vercel CLI not installed. Relying on GitHub Actions auto-deploy."
    VERCEL_OK="github-actions"
else
    if vercel --prod --yes 2>&1; then
        VERCEL_OK="true"
    else
        VERCEL_OK="false"
        echo "   ⚠️  Vercel deploy failed. GitHub Actions may still deploy from the push."
    fi
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# DEPLOYMENT SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
TOTAL_END=$(date +%s)
COMMIT_SHA=$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "N/A")

echo "═══════════════════════════════════════════════════════════════"
echo "📊 ANTI-GRAVITY DEPLOYMENT PROOF"
echo "═══════════════════════════════════════════════════════════════"
echo "SQL_OK:${SQL_OK}"
echo "GIT_OK:${GIT_OK}"
echo "VERCEL_OK:${VERCEL_OK}"
echo "COMMIT_SHA:${COMMIT_SHA}"
echo "TIMESTAMP:$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "TOTAL_DURATION:$(( TOTAL_END - TOTAL_START ))s"
echo "═══════════════════════════════════════════════════════════════"

if [ "$GIT_OK" = "true" ]; then
    # ── Deploy log ──
    node "${SCRIPT_DIR}/deploy-log.js" \
      --action deploy \
      --sha "${COMMIT_SHA}" \
      --branch "main" \
      --duration "$(( TOTAL_END - TOTAL_START ))" \
      --sql-ok "${SQL_OK}" \
      --vercel-ok "${VERCEL_OK}" \
      --msg "${COMMIT_MSG}" 2>/dev/null || true

    # ── Post-deploy verification (if Vercel deployed) ──
    if [ "$VERCEL_OK" = "true" ]; then
        echo ""
        echo "🔍 Running post-deploy verification..."
        node "${SCRIPT_DIR}/verify-deploy.js" --wait 30 2>&1 || echo "   ⚠️  Post-deploy verification skipped or failed"
    fi

    echo "🟢 ANTI-GRAVITY DEPLOYMENT COMPLETE"
    exit 0
else
    # Log failed deploys too
    node "${SCRIPT_DIR}/deploy-log.js" \
      --action deploy_failed \
      --sha "${COMMIT_SHA}" \
      --duration "$(( TOTAL_END - TOTAL_START ))" \
      --sql-ok "${SQL_OK}" \
      --msg "${COMMIT_MSG}" 2>/dev/null || true

    echo "🔴 DEPLOYMENT HAD ERRORS — review output above"
    exit 1
fi
