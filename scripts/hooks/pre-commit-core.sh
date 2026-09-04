#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# PRE-COMMIT HOOK: Combined Safety Gate
# ═══════════════════════════════════════════════════════════════════════════════
#
# CHECK A: public/hub/club-arena/ is DELETED and may not come back
#   Blocks any commit that touches public/hub/club-arena/, with no escape
#   hatch. Rewritten 2026-09-04 - it used to allow the commit when
#   ARENA_BUILD=1 or a merge was in progress, and told the reader to run
#   scripts/sync-club-arena.sh - deleted from main on 2026-09-02.
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

# ─── CHECK A: public/hub/club-arena/ is deleted and may not come back ────────
#
# Rewritten 2026-09-04. This guard used to exist to stop HAND-EDITED build
# output, so it let the build script through (ARENA_BUILD=1) and let a merge
# through (MERGE_HEAD). Both exemptions are now holes, because the directory
# itself is gone: Club Arena publishes to its own origin
# (ca-static.smarter.poker) and this repo carries one rewrite,
# /hub/club-arena/:path* -> that origin.
#
# NEXT.JS SERVES public/ BEFORE A REWRITE. So a file re-vendored here does not
# duplicate the live bundle, it SHADOWS it: production keeps serving whatever
# was last committed while publish-club-arena.yml rsyncs into the void, and
# nothing reports a problem. That is why there is no escape hatch any more -
# there is no legitimate commit that puts a file back in this directory, and a
# merge that wants to is a merge of a branch older than the deletion.
#
# If you are here because a merge is bringing 1,700 files back: resolve it by
# DELETING them (`git rm -r --cached public/hub/club-arena`), not by bypassing
# this check.
# ─────────────────────────────────────────────────────────────────────────────
ARENA_PATH="public/hub/club-arena/"

ARENA_STAGED=$(git diff --cached --name-only | grep -c "^${ARENA_PATH}" || true)

if [ "$ARENA_STAGED" -gt 0 ]; then
    echo ""
    echo "=============================================================="
    echo "  BLOCKED: public/hub/club-arena/ is deleted and stays deleted"
    echo "=============================================================="
    echo ""
    echo "  $ARENA_STAGED staged file(s) under $ARENA_PATH"
    echo ""
    echo "  Club Arena has not published through this repo since"
    echo "  2026-09-02. It builds in its own repo and rsyncs to"
    echo "  ca-static.smarter.poker; this repo carries ONE rewrite."
    echo ""
    echo "  Next.js serves public/ BEFORE that rewrite, so committing"
    echo "  these files would not duplicate the live bundle - it would"
    echo "  SHADOW it. Production would freeze on this copy while the"
    echo "  real publisher kept publishing where nobody looks."
    echo ""
    echo "  There is no override. To deploy Club Arena, push a branch"
    echo "  in the Club Arena repo and stop; everything after that is"
    echo "  automatic. Confirm with:"
    echo "    curl -s https://smarter.poker/hub/club-arena/build-info.json"
    echo ""
    echo "  If a MERGE is reintroducing them, delete them instead:"
    echo "    git rm -r --cached public/hub/club-arena"
    echo ""
    echo "  Blocked files (first 10):"
    git diff --cached --name-only | grep "^${ARENA_PATH}" | head -10
    echo ""
    exit 1
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
# commander-shared/src/lib/supabaseServerClient.js added to the allowlist
# 2026-08-31: it IS the sanctioned server-side wrapper this check points
# people toward (its patched getUser is the safe alternative), and a comment
# inside it naming supabase.auth.getUser(token) made ANY edit to it
# uncommittable — the exact --no-verify-inducing shape the 2026-08-05 and
# 2026-08-25 notes below warn about.
AUTH_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$' | grep -v 'public/hub/club-arena/assets/' | grep -v 'authUtils' | grep -v 'AvatarContext' | grep -v 'safeSupabase' | grep -v 'eslint-plugin' | grep -v 'commander-shared/src/lib/supabaseServerClient')

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
        # THE OAUTH CALLBACK IS WHERE A RAW SESSION READ BELONGS (2026-08-25).
        # pages/auth/callback.js is the one browser file whose entire job is to
        # resolve the session that has JUST been created by
        # exchangeCodeForSession / verifyOtp. authUtils' getAuthUser returns
        # what is already hydrated - which is exactly what is not true here.
        # The 5x400ms getSession retry exists to absorb the cookie-set /
        # hydration race, and swapping it out would break OAuth sign-in to
        # satisfy a lint. getSession is allowed HERE ONLY; getUser stays
        # blocked, and no other browser file changes.
        #
        # Why this had to be narrowed: the blanket rule made ANY edit to the
        # OAuth callback permanently uncommittable - including a fix TO the
        # OAuth callback. That is the exact shape this check's own 2026-08-05
        # note warns about for pages/api: it pushes people to --no-verify,
        # which drops checks A and B (conflict markers) as collateral.
        pages/auth/callback.js)
            if printf '%s' "$CONTENT" | grep -q 'supabase\.auth\.getUser'; then
                echo "🚫 BLOCKED: $file contains supabase.auth.getUser()"
                echo "   Use: import { getAuthUser } from '@/lib/authUtils'"
                DANGEROUS=1
            fi
            ;;
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
