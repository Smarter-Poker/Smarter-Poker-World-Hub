#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# FORCE REDEPLOY — Vercel Build Cache Purge
# ═══════════════════════════════════════════════════════════════════════════
# Use this after fixing build issues to force a clean deployment.
# Clears the Vercel build cache and triggers a fresh build.
#
# Usage: bash scripts/force-redeploy.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  VERCEL FORCE REDEPLOY — CACHE PURGE"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Quick syntax pre-check on recently changed files
echo "Step 1: Pre-flight syntax check..."
ERRORS=0
CHANGED_FILES=$(git diff --name-only HEAD~3..HEAD 2>/dev/null | grep -E '\.js$' | grep -v node_modules | grep -v .next || true)

for file in $CHANGED_FILES; do
    [ -f "$file" ] || continue
    grep -q 'assert {' "$file" 2>/dev/null && continue
    if ! node -c "$file" 2>/dev/null; then
        echo "  ❌ SYNTAX ERROR: $file"
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "  ⛔ $ERRORS syntax error(s) found. Fix them before redeploying."
    exit 1
fi
echo "  ✅ All files pass syntax check"
echo ""

# Step 2: Ensure local is pushed
echo "Step 2: Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "  ⚠ Uncommitted changes detected. Commit and push first."
    exit 1
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "  ⚠ Local HEAD differs from origin/main. Push first."
    exit 1
fi
echo "  ✅ Local and remote are in sync"
echo ""

# Step 3: Trigger force redeploy
echo "Step 3: Ensuring correct Vercel project link..."
mkdir -p .vercel
cat > .vercel/project.json << 'EOF'
{"projectId":"prj_op66GkZyZcygXQKm76iyycfVFAQx","orgId":"team_SVD8r7AOPH065G3usBxVvrBc","projectName":"hub-vanguard"}
EOF

echo "Step 4: Triggering force redeploy (clears build cache)..."
npx -y vercel --force --prod 2>&1 | tail -20

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ Force redeploy triggered. Monitor with:"
echo "     node scripts/check-deploy-status.js --watch"
echo "═══════════════════════════════════════════════════════"
echo ""
