#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# PRE-COMMIT HOOK: Combined Safety Gate
# ═══════════════════════════════════════════════════════════════════════════════
#
# CHECK A: Club Arena Build Enforcement
#   Blocks any commit that touches public/hub/club-arena/ UNLESS it was
#   triggered by scripts/build-club-arena.sh.
#
# CHECK B: Merge / Stash Conflict Marker Detection  ★ CRITICAL ★
#   Blocks commits containing <<<<<<< / ======= / >>>>>>> markers.
#   These cause "Module parse failed" Vercel build failures that are
#   extremely hard to diagnose. See April 2026 incident (7 files corrupted).
#
# CHECK C: Dangerous Supabase Auth Pattern Detection
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
    # Dan 2026-08-15 — MERGE EXEMPTION.
    #
    # This guard exists to stop hand-edited build output, and it should. But it
    # also fired on MERGE-CONFLICT RESOLUTIONS in that directory, a case the
    # sync script cannot help with: sync-club-arena.sh builds and commits, it
    # cannot resolve a merge. When origin and local each carry a different build
    # of the same hashed assets, the only way forward is to resolve and commit —
    # and this guard blocked exactly that, forcing a manual `ARENA_BUILD=1
    # git commit` to land a 308-file merge.
    #
    # A merge commit is not a hand-edit, so allow it. MERGE_HEAD exists only
    # while a merge is actually in progress, so this cannot be abused to sneak
    # a direct commit through.
    if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
        echo "[pre-commit] ✓ Merge in progress — Club Arena guard skipped ($ARENA_STAGED files)"
    elif [ "${ARENA_BUILD:-0}" = "1" ]; then
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
        echo "║    bash scripts/sync-club-arena.sh \"your message\"           ║"
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

# ─── CHECK B: Merge / Stash Conflict Marker Detection ───────────────────────
# ★ CRITICAL — This check alone prevents the April 2026 "Module parse failed"
# incident that took down Vercel deployments for hours. Conflict markers from
# git merge, git stash pop, or git rebase are syntactically invalid JS/TS and
# cause opaque SWC parser errors that are nearly impossible to trace back to
# the source file without manual grep auditing.
# ─────────────────────────────────────────────────────────────────────────────
FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx|json|css)$' | grep -v 'public/hub/club-arena/assets/' | grep -v 'node_modules/')

CONFLICT_FAIL=0
if [ -n "$FILES" ]; then
    for file in $FILES; do
        # Check for all three types of conflict markers:
        #   <<<<<<< (merge/stash start)
        #   ======= (divider — only block if exactly 7 '=' on a line by itself)
        #   >>>>>>> (merge/stash end)
        if git show ":$file" 2>/dev/null | grep -qE '^<{7} |^>{7} '; then
            echo "🚫 CONFLICT MARKER: $file"
            # Show the offending lines for quick diagnosis
            git show ":$file" 2>/dev/null | grep -nE '^<{7} |^={7}$|^>{7} ' | head -6
            CONFLICT_FAIL=1
        fi
    done
fi

if [ $CONFLICT_FAIL -eq 1 ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  🚫  GIT CONFLICT MARKERS DETECTED                         ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║                                                              ║"
    echo "║  One or more staged files contain unresolved conflict        ║"
    echo "║  markers (<<<<<<< / ======= / >>>>>>>).                     ║"
    echo "║                                                              ║"
    echo "║  These cause 'Module parse failed' errors on Vercel that     ║"
    echo "║  are extremely hard to diagnose.                             ║"
    echo "║                                                              ║"
    echo "║  FIX: Open the flagged files, resolve the conflicts, then   ║"
    echo "║  stage and commit again.                                     ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# ─── CHECK C: Dangerous Supabase Auth Patterns ──────────────────────────────
echo "🔍 Scanning for dangerous Supabase auth patterns..."

# Re-filter to just JS/TS files (excluding allowlisted utility files)
AUTH_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$' | grep -v 'public/hub/club-arena/assets/' | grep -v 'authUtils' | grep -v 'AvatarContext' | grep -v 'safeSupabase' | grep -v 'eslint-plugin')

if [ -z "$AUTH_FILES" ]; then
    echo "✅ No relevant files to check"
    exit 0
fi

# WHAT IS ACTUALLY DANGEROUS (refined 2026-08-05)
#   The hazard is the ARGUMENT-LESS client form — supabase.auth.getUser() and
#   supabase.auth.getSession() — which makes a network round-trip, hangs when
#   the session is not ready, and is what authUtils.ts exists to replace.
#
#   Verifying a bearer token server-side, supabase.auth.getUser(token), is a
#   DIFFERENT operation and is the sanctioned pattern for API routes: 38 route
#   handlers under pages/api/ already do exactly that. The blanket rule below
#   used to flag them too, so touching any of those 38 files for an unrelated
#   reason blocked the commit and pushed people toward --no-verify — which
#   disables checks A and B (conflict markers) as collateral damage.
#
#   So: inside pages/api/, only the argument-less forms are blocked. Everywhere
#   else (browser code), both forms stay blocked exactly as before.
DANGEROUS=0
for file in $AUTH_FILES; do
    CONTENT=$(git show ":$file" 2>/dev/null)

    case "$file" in
        pages/api/*)
            if printf '%s' "$CONTENT" | grep -q 'supabase\.auth\.getUser()'; then
                echo "🚫 BLOCKED: $file contains argument-less supabase.auth.getUser()"
                echo "   Server-side: verify the bearer token — supabase.auth.getUser(token)"
                echo "   or use getServerUserWithFallback from '@/lib/serverAuth'"
                DANGEROUS=1
            fi
            if printf '%s' "$CONTENT" | grep -q 'supabase\.auth\.getSession()'; then
                echo "🚫 BLOCKED: $file contains supabase.auth.getSession()"
                echo "   Server-side there is no session — read the Authorization header"
                DANGEROUS=1
            fi
            ;;
        *)
            if printf '%s' "$CONTENT" | grep -q 'supabase\.auth\.getUser'; then
                echo "🚫 BLOCKED: $file contains supabase.auth.getUser()"
                echo "   Use: import { getAuthUser } from '@/lib/authUtils'"
                DANGEROUS=1
            fi
            if printf '%s' "$CONTENT" | grep -q 'supabase\.auth\.getSession'; then
                echo "🚫 BLOCKED: $file contains supabase.auth.getSession()"
                echo "   Use: import { getAuthUser } from '@/lib/authUtils'"
                DANGEROUS=1
            fi
            ;;
    esac
done

if [ $DANGEROUS -eq 1 ]; then
    echo ""
    echo "❌ Commit blocked! Remove dangerous Supabase auth calls."
    echo "   See: src/lib/authUtils.ts for safe alternatives"
    exit 1
fi

echo "✅ All checks passed (conflict markers, auth patterns)"
exit 0
