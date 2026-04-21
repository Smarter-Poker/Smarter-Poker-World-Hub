#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# PRE-COMMIT HOOK: Combined Safety Gate
# ═══════════════════════════════════════════════════════════════════════════════
#
# CHECK A: Club Arena Build Enforcement
#   Blocks any commit that touches public/hub/club-arena/ UNLESS it was
#   triggered by scripts/build-club-arena.sh.
#
# CHECK B: Dangerous Supabase Auth Pattern Detection
#   Blocks commits containing supabase.auth.getUser() or getSession()
#   (must use authUtils.ts safe wrappers instead).
#
# TO BYPASS (emergency only):
#   git commit --no-verify -m "message"
# ═══════════════════════════════════════════════════════════════════════════════

# ─── CHECK A: Club Arena Build Enforcement ───────────────────────────────────
ARENA_PATH="public/hub/club-arena/"

ARENA_STAGED=$(git diff --cached --name-only | grep "^${ARENA_PATH}" | wc -l | tr -d ' ')

if [ "$ARENA_STAGED" -gt 0 ]; then
    if [ "${ARENA_BUILD:-0}" = "1" ]; then
        echo "[pre-commit] ✓ Club Arena build script authorized — $ARENA_STAGED files committed"
    else
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║  🚫  CLUB ARENA DIRECT COMMIT BLOCKED                       ║"
        echo "╠══════════════════════════════════════════════════════════════╣"
        echo "║                                                              ║"
        echo "║  You are trying to commit $ARENA_STAGED files in:                   ║"
        echo "║    public/hub/club-arena/                                    ║"
        echo "║                                                              ║"
        echo "║  Direct commits to this directory are FORBIDDEN.            ║"
        echo "║  They cause phantom pending changes (the 792-commit bug).   ║"
        echo "║                                                              ║"
        echo "║  THE ONLY AUTHORIZED WAY TO DEPLOY CLUB ARENA:             ║"
        echo "║                                                              ║"
        echo "║    bash scripts/build-club-arena.sh \"your message\"          ║"
        echo "║                                                              ║"
        echo "║  That script builds → cleans → copies → commits → pushes   ║"
        echo "║  atomically, preventing all stale artifact accumulation.    ║"
        echo "║                                                              ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        echo "Blocked files (first 10):"
        git diff --cached --name-only | grep "^${ARENA_PATH}" | head -10
        echo ""
        exit 1
    fi
fi

# ─── CHECK B: Dangerous Supabase Auth Patterns ──────────────────────────────
echo "🔍 Scanning for dangerous Supabase auth patterns..."

FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$' | grep -v 'public/hub/club-arena/assets/' | grep -v 'authUtils' | grep -v 'AvatarContext' | grep -v 'safeSupabase' | grep -v 'eslint-plugin')

if [ -z "$FILES" ]; then
    echo "✅ No relevant files to check"
    exit 0
fi

DANGEROUS=0
for file in $FILES; do
    if git show ":$file" 2>/dev/null | grep -q 'supabase\.auth\.getUser'; then
        echo "🚫 BLOCKED: $file contains supabase.auth.getUser()"
        echo "   Use: import { getAuthUser } from '@/lib/authUtils'"
        DANGEROUS=1
    fi
    if git show ":$file" 2>/dev/null | grep -q 'supabase\.auth\.getSession'; then
        echo "🚫 BLOCKED: $file contains supabase.auth.getSession()"
        echo "   Use: import { getAuthUser } from '@/lib/authUtils'"
        DANGEROUS=1
    fi
done

if [ $DANGEROUS -eq 1 ]; then
    echo ""
    echo "❌ Commit blocked! Remove dangerous Supabase auth calls."
    echo "   See: src/lib/authUtils.ts for safe alternatives"
    exit 1
fi

echo "✅ No dangerous auth patterns found"
exit 0
