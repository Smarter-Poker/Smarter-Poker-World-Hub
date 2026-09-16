#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SMARTER.POKER PRE-PUSH SAFETY GATE
# ═══════════════════════════════════════════════════════════════════════════
# This hook runs BEFORE every push. It catches the exact class of bugs
# that caused the March 7, 2026 cascading build failure (14 failed deploys)
# and the March 17, 2026 dead-code cleanup failure (7 failed deploys).
#
# What it checks:
# 1. Hooks imported but never called (the ThreePillHeader bug)
# 2. Module-scope browser API usage without window guards (SSG bombs)
# 3. No .single() calls (must use .maybeSingle())
# 4. No raw @supabase/supabase-js imports in API routes
# 5. Syntax validation: Babel for .jsx/.tsx AND .js files containing JSX;
#    node -c for plain .js files with no JSX. NOTE: node -c is JSX-BLIND —
#    it passes broken JSX syntax silently. All Next.js .js pages use JSX
#    so Babel MUST be the parser for them.
#    (the May 12, 2026 incident: 14 failed deploys — node -c passed a .js
#    page with a broken {/* JSX comment */} + IIFE pattern that webpack rejected)
# 6. Auth route canonicalization (/auth/login not /auth/signin)
# 7. Pages with /api/ fetch calls must import auth (getAccessToken/authedFetch)
# 8. Broken imports — all import paths resolve to existing files
# 9. Catch-block corruption — detects collapsed try/catch with orphaned code
#    (the April 21, 2026 incident: 17 failed deploys from automated refactoring)
# 10. TypeScript type checking via tsc --noEmit (only NEW errors block the push)
# 11. Vercel build command sanity — vercel.json buildCommand must include --webpack
#     when Next.js >= 15 is installed (Turbopack is default and breaks our codebase).
#     Also checks next.config.js for deprecated keys (swcMinify, serverComponentsExternalPackages)
#     that cause hard build errors in Next.js 15+.
#     (the May 2026 incident: 10+ consecutive Vercel failures from Next.js 16 Turbopack upgrade)
# 12. JSX comment expression guard — catches unclosed {/* ... */ (missing closing })
#     and bare IIFE-after-comment patterns that Babel catches but node -c misses.
#     Fast grep pass that runs in <100ms before full Babel parse.
#     (the May 12, 2026 incident: the exact root cause of check 12)
#
# WIRED VIA: .husky/pre-push (core.hooksPath .husky — issue #625). The old
# copy-into-.git/hooks installer is gone; install-hooks.sh now only repairs
# hooksPath and modes.
# ═══════════════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SMARTER.POKER PRE-PUSH SAFETY GATE"
echo "═══════════════════════════════════════════════════════"
echo ""

# Get list of changed files compared to remote
REMOTE="$1"
URL="$2"

# Git supplies every proposed ref update on stdin, not a fixed number of commits.
# These checks read the checkout: never certify a different branch's files.
# BEGIN PUSH UPDATE FILE SELECTION
select_push_files() {
    checked_head=$(git rev-parse --verify HEAD) || return 1
    zero_oid=$(printf '%0*d' "${#checked_head}" 0)
    saw_update=0
    check_source=0
    full_source=0
    selected_files=''
    while read -r local_ref local_oid remote_ref remote_oid extra; do
        saw_update=1
        if [ -z "$local_ref" ] || [ -z "$remote_ref" ] || [ -n "$extra" ] || \
           [ "${#local_oid}" -ne "${#checked_head}" ] || [ "${#remote_oid}" -ne "${#checked_head}" ]; then
            echo 'BLOCKED: malformed Git pre-push update.' >&2
            return 1
        fi
        case "$local_oid$remote_oid" in *[!0-9a-f]*)
            echo 'BLOCKED: malformed Git pre-push object ID.' >&2; return 1 ;;
        esac
        [ "$local_oid" = "$zero_oid" ] && continue # Ref deletion has no new source.
        local_commit=$(git rev-parse --verify "$local_oid^{commit}" 2>/dev/null) || return 1
        if [ "$local_commit" != "$checked_head" ]; then
            echo 'BLOCKED: push each source commit from its matching checkout.' >&2
            return 1
        fi
        check_source=1
        if [ "$remote_oid" = "$zero_oid" ] || \
           ! remote_commit=$(git rev-parse --verify "$remote_oid^{commit}" 2>/dev/null); then
            full_source=1 # New ref or unavailable base: inspect all checked source.
        else
            update_files=$(git diff --name-only --no-renames "$remote_commit" "$checked_head" --) || return 1
            selected_files="$selected_files
$update_files"
        fi
    done
    [ "$saw_update" -ne 0 ] || full_source=1 # Direct invocation without Git's stdin.
    if [ "$check_source" -eq 1 ] || [ "$full_source" -eq 1 ]; then
        if ! git diff --quiet --no-ext-diff HEAD --; then
            echo 'BLOCKED: checked source differs from the committed push source.' >&2
            return 1
        fi
    fi
    if [ "$full_source" -eq 1 ]; then
        tracked_files=$(git ls-tree -r --name-only "$checked_head") || return 1
        selected_files="$selected_files
$tracked_files"
    fi
    printf '%s\n' "$selected_files" | sed '/^$/d' | LC_ALL=C sort -u
}
CHANGED_FILES=$(select_push_files) || exit 1
# END PUSH UPDATE FILE SELECTION

if [ -z "$CHANGED_FILES" ]; then
    echo -e "${GREEN}✓ No changed files detected. Push allowed.${NC}"
    exit 0
fi

JS_FILES=$(echo "$CHANGED_FILES" | grep -v 'public/hub/club-arena/assets/' | grep -E '\.(js|jsx|ts|tsx)$' | grep -v node_modules | grep -v '.next/')

if [ -z "$JS_FILES" ]; then
    echo -e "${GREEN}✓ No JS/TS files changed. Push allowed.${NC}"
    exit 0
fi

echo "Checking $(echo "$JS_FILES" | wc -l | tr -d ' ') changed file(s)..."
echo ""

# ─── CHECK 1: Imported hooks that are never called ───────────────────────
echo "CHECK 1: Unused hook imports..."

for file in $JS_FILES; do
    [ -f "$file" ] || continue

    # Find all "use" hook imports (useXxx pattern)
    HOOKS=$(grep -oE 'import\s+\{[^}]*\}' "$file" 2>/dev/null | grep -oE 'use[A-Z][a-zA-Z]+' | sort -u)

    for hook in $HOOKS; do
        # Check if the hook is actually called (hookName( or hookName< for TypeScript generics)
        CALL_COUNT=$(grep -cE "${hook}\s*[<(]" "$file" 2>/dev/null | tail -1)
        CALL_COUNT=${CALL_COUNT:-0}

        if [ "$CALL_COUNT" -eq 0 ]; then
            echo -e "${YELLOW}  ⚠ WARNING: ${file}${NC}"
            echo -e "    Hook '${hook}' is imported but NEVER CALLED."
            echo "    This can cause ReferenceErrors during SSG. Please clean up unused imports."
            echo ""
            WARNINGS=$((WARNINGS + 1))
        fi
    done
done

if [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}  ✓ All imported hooks are called.${NC}"
fi
echo ""

# ─── CHECK 2: Module-scope browser APIs without window guard ─────────────
echo "CHECK 2: SSG-unsafe browser API usage..."

for file in $JS_FILES; do
    [ -f "$file" ] || continue

    # Only check page files (pages/) and component files that might be SSG'd
    # Skip API routes — they are serverless functions, never run during SSG
    echo "$file" | grep -qE '^pages/api/' && continue
    echo "$file" | grep -qE '^(pages/|src/components/)' || continue

    # Look for createClient() at module scope (outside functions)
    UNSAFE_LINES=$(grep -n 'createClient(' "$file" 2>/dev/null | grep -v 'typeof window' | grep -v '//' | grep -v 'function\|=>\|async\|export default' | head -5)

    if [ -n "$UNSAFE_LINES" ]; then
        FIRST_FUNC_LINE=$(grep -n 'export default\|export async function\|function handler' "$file" 2>/dev/null | head -1 | cut -d: -f1)

        while IFS= read -r line; do
            LINE_NUM=$(echo "$line" | cut -d: -f1)
            if [ -n "$FIRST_FUNC_LINE" ] && [ "$LINE_NUM" -lt "$FIRST_FUNC_LINE" ]; then
                echo -e "${YELLOW}  ⚠ WARNING: ${file}:${LINE_NUM}${NC}"
                echo "    createClient() at module scope without 'typeof window' guard."
                echo "    This may crash during SSG/SSR build."
                echo ""
                WARNINGS=$((WARNINGS + 1))
            fi
        done <<< "$UNSAFE_LINES"
    fi
done

if [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}  ✓ No unguarded module-scope browser APIs found.${NC}"
fi
echo ""

# ─── CHECK 3: No .single() calls ─────────────────────────────────────────
echo "CHECK 3: No .single() in Supabase queries..."

SINGLE_HITS=""
for file in $JS_FILES; do
    [ -f "$file" ] || continue
    HITS=$(grep -n '\.single()' "$file" 2>/dev/null | grep -v 'maybeSingle' | grep -v '// .*single')
    if [ -n "$HITS" ]; then
        echo -e "${RED}  ✗ FATAL: ${file}${NC}"
        echo "$HITS" | while IFS= read -r line; do
            echo "    $line"
        done
        echo "    Fix: Replace .single() with .maybeSingle()"
        echo ""
        ERRORS=$((ERRORS + 1))
        SINGLE_HITS="found"
    fi
done

if [ -z "$SINGLE_HITS" ]; then
    echo -e "${GREEN}  ✓ No .single() calls found.${NC}"
fi
echo ""

# ─── CHECK 4: No raw @supabase/supabase-js imports in API routes ────────
echo "CHECK 4: No unpatched Supabase imports in API routes..."

RAW_IMPORT_HITS=""
for file in $JS_FILES; do
    [ -f "$file" ] || continue
    echo "$file" | grep -qE '^pages/api/' || continue

    HITS=$(grep -n "await import.*@supabase/supabase-js" "$file" 2>/dev/null)
    if [ -n "$HITS" ]; then
        echo -e "${RED}  ✗ FATAL: ${file}${NC}"
        echo "    Uses raw @supabase/supabase-js import — must use src/lib/supabaseServerClient"
        echo ""
        ERRORS=$((ERRORS + 1))
        RAW_IMPORT_HITS="found"
    fi
done

if [ -z "$RAW_IMPORT_HITS" ]; then
    echo -e "${GREEN}  ✓ All API routes use patched Supabase client.${NC}"
fi
echo ""

# ─── CHECK 6: No /auth/signin route references (canonical is /auth/login) ──
# Plus: validate that all auth-critical files exist on disk. Added 2026-05-02
# after pages/auth/callback.js was silently deleted, 404'ing every signup.
# This is a HARD BLOCK — missing auth files prevent the push.
echo "CHECK 6: Auth route canonicalization + critical file presence..."

# 6a — auth-critical file existence (hard block)
AUTH_CRITICAL_FILES="
pages/auth/callback.js
pages/auth/login.js
pages/auth/signup.js
pages/auth/forgot-password.js
pages/auth/reset-password.js
pages/api/auth/ensure-profile.js
"
MISSING_AUTH=""
for f in $AUTH_CRITICAL_FILES; do
    [ -z "$f" ] && continue
    if [ ! -f "$f" ]; then
        MISSING_AUTH="${MISSING_AUTH}\n    - $f"
    fi
done
if [ -n "$MISSING_AUTH" ]; then
    echo -e "${RED}  ✗ FATAL: Auth-critical files are missing — signup will 404 in production:${NC}"
    echo -e "$MISSING_AUTH"
    echo ""
    echo "    These files are mandatory. Restore from git history before pushing."
    echo "    See docs/runbooks/07-auth-outage.md."
    ERRORS=$((ERRORS + 1))
fi

# 6b — /auth/signin string references (warn only — next.config.js handles
# the redirect, but stale references should still migrate to /auth/login)
SIGNIN_HITS=""
for file in $JS_FILES; do
    [ -f "$file" ] || continue

    HITS=$(grep -n '/auth/signin' "$file" 2>/dev/null | grep -v '// ')
    if [ -n "$HITS" ]; then
        echo -e "${YELLOW}  ⚠ WARNING: ${file}${NC}"
        echo "$HITS" | while IFS= read -r line; do
            echo "    $line"
        done
        echo "    Fix: Use '/auth/login' (canonical sign-in route)"
        echo ""
        WARNINGS=$((WARNINGS + 1))
        SIGNIN_HITS="found"
    fi
done

if [ -z "$SIGNIN_HITS" ] && [ -z "$MISSING_AUTH" ]; then
    echo -e "${GREEN}  ✓ All auth-critical files present and routes use canonical /auth/login.${NC}"
fi
echo ""
# ─── CHECK 7: Pages with /api/ fetch calls but no auth imports ───────────
echo "CHECK 7: Unauth'd /api/ fetch calls..."

UNAUTH_HITS=""
for file in $JS_FILES; do
    [ -f "$file" ] || continue
    # Only check page files (not API routes, not components)
    echo "$file" | grep -qE '^pages/(hub|auth)/' || continue
    echo "$file" | grep -qE '^pages/api/' && continue

    # Check if file has fetch calls to /api/
    HAS_FETCH=$(grep -c "fetch('/api/\|fetch(\"/api/\|fetch(\`/api/" "$file" 2>/dev/null)
    if [ "$HAS_FETCH" -gt 0 ]; then
        # Check if file imports getAccessToken or authedFetch
        HAS_AUTH=$(grep -c "getAccessToken\|authedFetch\|Authorization.*Bearer" "$file" 2>/dev/null)
        if [ "$HAS_AUTH" -eq 0 ]; then
            echo -e "${YELLOW}  ⚠ WARNING: ${file}${NC}"
            echo "    Has ${HAS_FETCH} /api/ fetch call(s) but NO auth (getAccessToken/authedFetch) import."
            echo "    If the API requires auth, add: import { getAccessToken } from '...authUtils';"
            echo ""
            WARNINGS=$((WARNINGS + 1))
            UNAUTH_HITS="found"
        fi
    fi
done

if [ -z "$UNAUTH_HITS" ]; then
    echo -e "${GREEN}  ✓ All pages with /api/ calls have auth imports.${NC}"
fi
echo ""

# ─── CHECK 5: Syntax validation (Babel for JSX files, node -c for plain .js) ──
# CRITICAL: node -c is JSX-BLIND. It passes broken JSX syntax silently.
# ALL .js files under pages/ or components/ contain JSX and MUST use Babel.
# The May 12, 2026 incident (14 failed deploys) was caused by node -c passing
# a .js page file with broken JSX — webpack rejected it, node -c did not.
echo "CHECK 5: Syntax validation (Babel for JSX-containing .js, node -c for pure .js)..."

if command -v node &> /dev/null; then
    SYNTAX_ERRORS=0
    # Files this run could NOT verify because Babel was unavailable and the file
    # contains JSX (node -c cannot parse JSX). Counted and reported, never fatal.
    JSX_UNVERIFIED=0
    JSX_UNVERIFIED_FILES=""
    # Locate Babel parser from the project. NOT "always available": a git
    # worktree and a fresh clone both have .git but no node_modules, and this
    # resolves to empty there. See the fallback in CHECK 5 below.
    BABEL_PARSER="$(node -e "try{require.resolve('@babel/parser');console.log(require.resolve('@babel/parser'))}catch(e){console.log('')}" 2>/dev/null)"

    for file in $JS_FILES; do
        [ -f "$file" ] || continue
        # Skip files with import assertions (assert { type: 'json' }) — valid in webpack
        grep -q 'assert {' "$file" 2>/dev/null && continue

        # For .tsx — always use Babel (TypeScript JSX)
        if echo "$file" | grep -qE '\.tsx$'; then
            if [ -n "$BABEL_PARSER" ]; then
                PARSE_OUTPUT=$(PARSE_FILE="$file" node -e "
const fs=require('fs');
const {parse}=require('@babel/parser');
try{
  parse(fs.readFileSync(process.env.PARSE_FILE,'utf8'),{
    sourceType:'module',
    plugins:['jsx','typescript','decorators-legacy','classProperties','optionalChaining','nullishCoalescingOperator']
  });
  process.exit(0);
}catch(e){
  console.error(e.message+' (line '+e.loc?.line+', col '+e.loc?.column+')');
  process.exit(1);
}" 2>&1)
                if [ $? -ne 0 ]; then
                    echo -e "${RED}  ✗ TSX SYNTAX ERROR: ${file}${NC}"
                    echo "    $PARSE_OUTPUT" | head -3
                    echo ""
                    SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
                    ERRORS=$((ERRORS + 1))
                fi
            fi
            continue
        fi

        # For .jsx — always use Babel
        if echo "$file" | grep -qE '\.jsx$'; then
            if [ -n "$BABEL_PARSER" ]; then
                PARSE_OUTPUT=$(PARSE_FILE="$file" node -e "
const fs=require('fs');
const {parse}=require('@babel/parser');
try{
  parse(fs.readFileSync(process.env.PARSE_FILE,'utf8'),{
    sourceType:'module',
    plugins:['jsx','decorators-legacy','classProperties','optionalChaining','nullishCoalescingOperator']
  });
  process.exit(0);
}catch(e){
  console.error(e.message+' (line '+e.loc?.line+', col '+e.loc?.column+')');
  process.exit(1);
}" 2>&1)
                if [ $? -ne 0 ]; then
                    echo -e "${RED}  ✗ JSX SYNTAX ERROR: ${file}${NC}"
                    echo "    $PARSE_OUTPUT" | head -3
                    echo ""
                    SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
                    ERRORS=$((ERRORS + 1))
                fi
            fi
            continue
        fi

        # For plain .ts — skip (TypeScript type errors need tsc, not node -c)
        echo "$file" | grep -qE '\.ts$' && continue

        if [ -n "$BABEL_PARSER" ]; then
            # Use Babel for ALL .js files (node -c is blind to JSX and CJS/ESM mixed syntax errors)
            PARSE_OUTPUT=$(PARSE_FILE="$file" node -e "
const fs=require('fs');
const {parse}=require('@babel/parser');
try{
  parse(fs.readFileSync(process.env.PARSE_FILE,'utf8'),{
    sourceType:'module',
    plugins:['jsx','decorators-legacy','classProperties','optionalChaining','nullishCoalescingOperator']
  });
  process.exit(0);
}catch(e){
  console.error(e.message+' (line '+e.loc?.line+', col '+e.loc?.column+')');
  process.exit(1);
}" 2>&1)
            if [ $? -ne 0 ]; then
                echo -e "${RED}  ✗ SYNTAX ERROR in .js file: ${file}${NC}"
                echo "    (node -c is blind — Babel caught this; node -c would have missed it)"
                echo "    $PARSE_OUTPUT" | head -3
                echo ""
                SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
                ERRORS=$((ERRORS + 1))
            fi
        else
            # ── NO BABEL AVAILABLE ────────────────────────────────────────
            # Reached ONLY when @babel/parser did not resolve, which is any
            # checkout without node_modules: a fresh clone, CI before `npm ci`,
            # and every `git worktree` (a worktree shares .git but NOT
            # node_modules).
            #
            # node -c is JSX-BLIND. It does not merely miss broken JSX, it
            # REJECTS VALID JSX outright with "Unexpected token '<'". So the old
            # unconditional fallback turned a missing dev dependency into a hard
            # push block on perfectly good files.
            #
            # Measured 2026-08-30: a push from a worktree failed on
            # vendor/commander-shared/src/components/seo/SEOHead.js — valid,
            # unmodified, and nothing to do with the change being pushed. A gate
            # that blocks correct code is worse than no gate, because the
            # documented escape is `--no-verify`, which skips every OTHER check
            # in this file too.
            #
            # So: hand a file to node -c only when it plainly contains no JSX.
            # Anything JSX-shaped is SKIPPED and reported as unverified rather
            # than failed. The Babel path above is the real gate and still runs
            # everywhere it matters (developer machines, and CI after install).
            if grep -qE '(</[A-Za-z]|/>|<[A-Z][A-Za-z0-9]*[[:space:]/>]|<>)' "$file" 2>/dev/null; then
                JSX_UNVERIFIED=$((JSX_UNVERIFIED + 1))
                JSX_UNVERIFIED_FILES="${JSX_UNVERIFIED_FILES}
      ${file}"
            else
                PARSE_OUTPUT=$(node -c "$file" 2>&1)
                if [ $? -ne 0 ]; then
                    echo -e "${RED}  ✗ SYNTAX ERROR: ${file}${NC}"
                    echo "    $PARSE_OUTPUT" | head -3
                    echo ""
                    SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
                    ERRORS=$((ERRORS + 1))
                fi
            fi
        fi
    done

    if [ $SYNTAX_ERRORS -eq 0 ]; then
        echo -e "${GREEN}  ✓ All files pass syntax check (Babel for JSX-containing, node -c for pure .js).${NC}"
    fi

    # Say plainly when the gate could not do its job. Silence here would be the
    # worst outcome: a run that verified nothing must not look like a clean run.
    if [ "$JSX_UNVERIFIED" -gt 0 ]; then
        echo -e "${YELLOW}  ⚠ ${JSX_UNVERIFIED} JSX file(s) NOT syntax-checked — @babel/parser is not installed in this checkout.${NC}"
        echo -e "${YELLOW}    node -c cannot parse JSX, so these were skipped rather than failed.${NC}"
        echo -e "${YELLOW}    Run 'npm install' here (a git worktree has no node_modules of its own) to restore full coverage.${NC}"
        echo -e "${YELLOW}${JSX_UNVERIFIED_FILES}${NC}" | head -11
    fi
else
    echo -e "${YELLOW}  ⚠ Node.js not found. Skipping syntax validation.${NC}"
fi
echo ""

# ─── CHECK 9: Catch-block corruption patterns ────────────────────────────
# Detects the exact class of bugs introduced by automated refactoring agents
# that collapse try/catch blocks and leave orphaned code outside the catch.
# Incident: April 21, 2026 — 17 consecutive failed deploys.
echo "CHECK 9: Catch-block corruption scan..."

CATCH_CORRUPTION_HITS=""
for file in $JS_FILES; do
    [ -f "$file" ] || continue

    # Pattern 1: catch(...) { ... } = await  (orphaned assignment after collapsed catch)
    P1=$(grep -n 'catch.*console\.warn.*} = await' "$file" 2>/dev/null)
    if [ -n "$P1" ]; then
        echo -e "${RED}  ✗ CATCH CORRUPTION: ${file}${NC}"
        echo "$P1" | while IFS= read -r line; do echo "    $line"; done
        echo "    ↳ Catch block collapsed with orphaned '= await' assignment."
        echo "    ↳ This was caused by an automated refactoring agent."
        echo ""
        ERRORS=$((ERRORS + 1))
        CATCH_CORRUPTION_HITS="found"
    fi

    # Pattern 2: catch(...) { ... };\n    }  (stray semicolon + orphaned closing brace)
    P2=$(grep -n 'catch.*console\.warn.*};$' "$file" 2>/dev/null)
    if [ -n "$P2" ]; then
        echo -e "${YELLOW}  ⚠ SUSPICIOUS: ${file}${NC}"
        echo "$P2" | while IFS= read -r line; do echo "    $line"; done
        echo "    ↳ Catch block may have stray semicolon. Verify manually."
        echo ""
        WARNINGS=$((WARNINGS + 1))
    fi

    # Pattern 3: catch(...) { ... })  (orphaned closing paren after collapsed catch)
    P3=$(grep -n 'catch.*console\.warn.*})$' "$file" 2>/dev/null | grep -v '\.catch' | grep -v 'finally')
    if [ -n "$P3" ]; then
        # Filter out legitimate .catch() chains — only flag if it's a try/catch
        echo "$P3" | while IFS= read -r line; do
            LINE_CONTENT=$(echo "$line" | cut -d: -f2-)
            # If the line starts with '} catch' (not '.catch'), it's suspicious
            echo "$LINE_CONTENT" | grep -q '} catch' && {
                echo -e "${YELLOW}  ⚠ SUSPICIOUS: ${file}${NC}"
                echo "    $line"
                echo "    ↳ Catch block may have orphaned closing paren."
                echo ""
                WARNINGS=$((WARNINGS + 1))
            }
        done
    fi
done

if [ -z "$CATCH_CORRUPTION_HITS" ]; then
    echo -e "${GREEN}  ✓ No catch-block corruption patterns found.${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"

# ─── CHECK 8: Broken imports — deleted/missing files ────────────────────
echo ""
echo "CHECK 8: Broken import resolution..."

BROKEN_IMPORT_HITS=""
for file in $JS_FILES; do
    [ -f "$file" ] || continue
    FILE_DIR=$(dirname "$file")

    # Extract all relative import paths (from '../../foo' or require('../../foo'))
    IMPORT_PATHS=$(grep -oE "(from|require\()\s*['\"](\./|\.\./)[^'\"]+['\"]" "$file" 2>/dev/null | grep -oE "['\"](\./|\.\./)[^'\"]+['\"]" | tr -d "'\"")

    for imp in $IMPORT_PATHS; do
        # Resolve relative path
        RESOLVED="$FILE_DIR/$imp"

        # Check if the file exists with common extensions
        FOUND=0
        for ext in "" ".js" ".jsx" ".ts" ".tsx" "/index.js" "/index.ts" "/index.jsx" "/index.tsx"; do
            if [ -f "${RESOLVED}${ext}" ]; then
                FOUND=1
                break
            fi
        done

        if [ $FOUND -eq 0 ]; then
            echo -e "${RED}  ✗ BROKEN IMPORT: ${file}${NC}"
            echo "    Cannot resolve: ${imp}"
            echo "    Fix: Restore the file, update the import, or remove the dead import."
            echo ""
            ERRORS=$((ERRORS + 1))
            BROKEN_IMPORT_HITS="found"
        fi
    done
done

if [ -z "$BROKEN_IMPORT_HITS" ]; then
    echo -e "${GREEN}  ✓ All local imports resolve to existing files.${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"

# ─── CHECK 10: TypeScript type checking ─────────────────────────────────
# Only runs when TypeScript files are being pushed.
# Strategy: compare tsc output BEFORE and AFTER the push — only NEW errors block.
# Pre-existing type errors in unrelated files are ignored.
echo ""
echo "CHECK 10: TypeScript type checking (tsc --noEmit)..."

TS_FILES=$(echo "$JS_FILES" | grep -E '\.(ts|tsx)$')

if [ -n "$TS_FILES" ]; then
    TSC_BIN="$(dirname "$0")/../node_modules/.bin/tsc"
    [ -f "$TSC_BIN" ] || TSC_BIN="$(pwd)/node_modules/.bin/tsc"

    if [ ! -f "$TSC_BIN" ]; then
        echo -e "${YELLOW}  ⚠ tsc not found. Skipping TypeScript check.${NC}"
    else
        echo "  Running tsc --noEmit --skipLibCheck (this takes ~15s)..."

        # Get the baseline error count from the remote HEAD (pre-push state)
        # by stashing the working state and checking out the remote HEAD
        # --verify --quiet, and not a bare rev-parse. Without it, `git rev-parse
        # "@{u}"` on a branch with NO UPSTREAM prints the literal string "@{u}"
        # to stdout, writes its error to stderr and exits non-zero - so the
        # fallback appends the real SHA and REMOTE_HEAD becomes TWO LINES:
        #
        #     @{u}
        #     7f4c79e8...
        #
        # `git worktree add --detach "$DIR" "$REMOTE_HEAD"` then dies with
        # "fatal: invalid reference: @{u}", this check reports "Could not create
        # an isolated remote baseline", and the push is BLOCKED - for a branch
        # whose only sin is not having been pushed yet. Which is every new branch
        # whose first push failed for any other reason, and every push made
        # without -u. Found 2026-09-01 when it blocked exactly that.
        REMOTE_HEAD=$(git rev-parse --verify --quiet "@{u}" || git rev-parse --verify --quiet "HEAD~1")

        # Run tsc on the CURRENT state (with our changes)
        CURRENT_ERRORS=$("$TSC_BIN" --noEmit --skipLibCheck 2>&1 | grep '^src/' | sort)
        CURRENT_COUNT=$(printf '%s\n' "$CURRENT_ERRORS" | grep -c 'error TS' 2>/dev/null || true)

        # Run tsc on the REMOTE HEAD state (before our changes) in an isolated,
        # detached worktree. Never use git stash here: stashes are shared across
        # all worktrees, so popping one from a clean worktree can apply another
        # developer's unrelated work and corrupt the checkout being pushed.
        if [ -n "$REMOTE_HEAD" ]; then
            BASELINE_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/sp-ts-baseline.XXXXXX" 2>/dev/null)
            BASELINE_DIR="${BASELINE_ROOT}/worktree"

            if [ -n "$BASELINE_ROOT" ] && \
                git -c core.hooksPath=/dev/null worktree add --detach "$BASELINE_DIR" "$REMOTE_HEAD" >/dev/null 2>&1; then
                # Reuse the installed dependencies without copying or mutating them.
                ln -s "$(pwd)/node_modules" "$BASELINE_DIR/node_modules" 2>/dev/null || true
                BASELINE_ERRORS=$(cd "$BASELINE_DIR" && \
                    "$TSC_BIN" --noEmit --skipLibCheck 2>&1 | grep '^src/' | sort)
                git -c core.hooksPath=/dev/null worktree remove --force "$BASELINE_DIR" >/dev/null 2>&1 || true
                rmdir "$BASELINE_ROOT" 2>/dev/null || true
            else
                echo -e "${RED}  ✗ TYPESCRIPT: Could not create an isolated remote baseline.${NC}"
                echo "    Refusing to compare against or modify the current worktree."
                echo ""
                BASELINE_ERRORS=""
                ERRORS=$((ERRORS + 1))
                [ -n "$BASELINE_ROOT" ] && rmdir "$BASELINE_ROOT" 2>/dev/null || true
            fi

            BASELINE_COUNT=$(printf '%s\n' "$BASELINE_ERRORS" | grep -c 'error TS' 2>/dev/null || true)
        else
            BASELINE_COUNT=0
            BASELINE_ERRORS=""
        fi

        # Find errors that are NEW (in current but not in baseline). Keep this
        # POSIX-compatible because Husky may invoke hooks through /bin/sh.
        NEW_ERRORS=$(printf '%s\n' "$CURRENT_ERRORS" | grep 'error TS' | while IFS= read -r error_line; do
            if ! printf '%s\n' "$BASELINE_ERRORS" | grep -Fqx "$error_line"; then
                printf '%s\n' "$error_line"
            fi
        done)
        NEW_COUNT=$(printf '%s\n' "$NEW_ERRORS" | grep -c 'error TS' 2>/dev/null || true)

        if [ "$NEW_COUNT" -gt 0 ] 2>/dev/null && [ -n "$NEW_ERRORS" ]; then
            echo -e "${RED}  ✗ TYPESCRIPT: ${NEW_COUNT} NEW type error(s) introduced by this push:${NC}"
            echo "$NEW_ERRORS" | head -10 | while IFS= read -r line; do
                echo "    $line"
            done
            [ "$NEW_COUNT" -gt 10 ] && echo "    ... and $((NEW_COUNT - 10)) more."
            echo ""
            echo "    Fix the type errors above before pushing."
            echo "    (${CURRENT_COUNT} total errors exist; only NEW ones block the push)"
            echo ""
            ERRORS=$((ERRORS + 1))
        else
            echo -e "${GREEN}  ✓ No NEW TypeScript errors introduced (${CURRENT_COUNT} pre-existing, unchanged).${NC}"
        fi
    fi
else
    echo -e "${GREEN}  ✓ No .ts/.tsx files changed. Skipping TypeScript check.${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"

# ─── CHECK 11: Vercel build command + Next.js config sanity ─────────────
# Root cause of May 2026 incident: Next.js 16 defaulted to Turbopack, but
# vercel.json ran `next build` without --webpack. Turbopack strict export
# validation killed 246 named imports webpack silently ignored. 10+ failures.
#
# This check validates:
#   a) vercel.json buildCommand has --webpack when Next.js >= 15 is installed
#   b) next.config.js has no deprecated keys that cause hard build errors
#      (swcMinify, experimental.serverComponentsExternalPackages)
echo ""
echo "CHECK 11: Vercel build command + Next.js config sanity..."

NEXTJS_CONFIG_ERRORS=0

# 11a — vercel.json buildCommand must include --webpack for Next.js >= 15
if [ -f "vercel.json" ]; then
    # Follow the maintained guarded entry; its exported command is what runs.
    if ! BUILD_CMD=$(node --input-type=module -e '
      import { readFileSync } from "node:fs";
      const config = JSON.parse(readFileSync("vercel.json", "utf8"));
      const command = config.buildCommand === "node scripts/vercel-build.mjs"
        ? (await import("./scripts/vercel-build.mjs")).BUILD_COMMAND
        : config.buildCommand;
      if (typeof command !== "string" || !command.trim()) process.exit(1);
      console.log(command);
    ' 2>/dev/null); then
        echo -e "${RED}  ✗ FATAL: Cannot read the actual Vercel build command${NC}"
        ERRORS=$((ERRORS + 1))
        NEXTJS_CONFIG_ERRORS=$((NEXTJS_CONFIG_ERRORS + 1))
        BUILD_CMD=""
    fi
    if [ -n "$BUILD_CMD" ]; then
        NEXT_VERSION=$(node -e "try{const p=require('./node_modules/next/package.json');console.log(p.version)}catch(e){console.log('0')}" 2>/dev/null || echo "0")
        NEXT_MAJOR=$(echo "$NEXT_VERSION" | cut -d. -f1)
        if [ "$NEXT_MAJOR" -ge 15 ] 2>/dev/null; then
            if ! echo "$BUILD_CMD" | grep -q "\-\-webpack"; then
                echo -e "${RED}  ✗ FATAL: vercel.json buildCommand is missing --webpack${NC}"
                echo "    Command: $BUILD_CMD"
                echo "    Next.js $NEXT_VERSION defaults to Turbopack (since v15)."
                echo "    Our custom webpack config + named export mismatches WILL break Turbopack."
                echo "    Fix the maintained build command to retain next build --webpack."
                echo ""
                ERRORS=$((ERRORS + 1))
                NEXTJS_CONFIG_ERRORS=$((NEXTJS_CONFIG_ERRORS + 1))
            fi
        fi
    fi
fi

# 11b — next.config.js must not contain deprecated keys (hard errors in Next.js 15+)
if [ -f "next.config.js" ]; then
    # swcMinify removed in Next.js 15 — causes Unrecognized key build error
    if grep -q "swcMinify: true" next.config.js 2>/dev/null; then
        echo -e "${RED}  ✗ FATAL: next.config.js has deprecated 'swcMinify' key${NC}"
        echo "    Removed in Next.js 15+. SWC is the only minifier. Delete this line."
        echo ""
        ERRORS=$((ERRORS + 1))
        NEXTJS_CONFIG_ERRORS=$((NEXTJS_CONFIG_ERRORS + 1))
    fi

    # experimental.serverComponentsExternalPackages moved to top-level in Next.js 15
    if grep -v '^\s*//' next.config.js 2>/dev/null | grep -q "serverComponentsExternalPackages"; then
        echo -e "${RED}  ✗ FATAL: next.config.js uses 'experimental.serverComponentsExternalPackages'${NC}"
        echo "    Moved to top-level 'serverExternalPackages' in Next.js 15+."
        echo "    The experimental key is SILENTLY IGNORED — external packages won't be excluded."
        echo "    Fix: Move to 'serverExternalPackages: [...]' at the top level of nextConfig."
        echo ""
        ERRORS=$((ERRORS + 1))
        NEXTJS_CONFIG_ERRORS=$((NEXTJS_CONFIG_ERRORS + 1))
    fi
fi

if [ "$NEXTJS_CONFIG_ERRORS" -eq 0 ]; then
    echo -e "${GREEN}  ✓ Vercel build command and Next.js config look correct.${NC}"
fi

# 11c — dev scripts must also use --webpack (Next.js 16: Turbopack is default for BOTH dev and build)
if [ -f "package.json" ] && command -v node &>/dev/null; then
    NEXT_MAJOR=$(node -e "try{const p=require('./node_modules/next/package.json');console.log(p.version.split('.')[0])}catch(e){console.log('0')}" 2>/dev/null || echo "0")
    if [ "$NEXT_MAJOR" -ge 15 ] 2>/dev/null; then
        DEV_SCRIPT=$(node -e "try{const p=require('./package.json');console.log(p.scripts.dev||'')}catch(e){}" 2>/dev/null || echo "")
        if [ -n "$DEV_SCRIPT" ] && ! echo "$DEV_SCRIPT" | grep -q "\-\-webpack"; then
            echo -e "${RED}  ✗ FATAL: package.json 'dev' script is missing --webpack${NC}"
            echo "    Script: $DEV_SCRIPT"
            echo "    Next.js $NEXT_MAJOR: Turbopack is the DEFAULT for next dev too (not just next build)."
            echo "    Fix: Add '--webpack' before '-p 3000' in the dev script."
            echo ""
            ERRORS=$((ERRORS + 1))
            NEXTJS_CONFIG_ERRORS=$((NEXTJS_CONFIG_ERRORS + 1))
        fi
    fi
fi

# 11d — @next/env and eslint-config-next must match Next.js major version
if [ -f "package.json" ] && command -v node &>/dev/null; then
    NEXT_MAJOR=$(node -e "try{const p=require('./node_modules/next/package.json');console.log(p.version.split('.')[0])}catch(e){
    try{const p=require('./package.json');const v=(p.dependencies||{}).next||(p.devDependencies||{}).next||'0';console.log(v.replace(/[^0-9.]/g,'').split('.')[0])}catch(e2){console.log('0')}
    }" 2>/dev/null || echo "0")
    if [ "$NEXT_MAJOR" -ge 15 ] 2>/dev/null; then
        for pkg_name in "@next/env" "eslint-config-next"; do
            PKG_VER=$(node -e "try{const p=require('./package.json'); const d={...p.dependencies,...p.devDependencies}; const v=d['${pkg_name}']||''; const clean=v.replace(/^[^0-9]*/,''); console.log(clean.split('.')[0]||'0')}catch(e){console.log('0')}" 2>/dev/null || echo "0")
            if [ -n "$PKG_VER" ] && [ "$PKG_VER" != "0" ] && [ "$PKG_VER" != "$NEXT_MAJOR" ] 2>/dev/null; then
                echo -e "${YELLOW}  ⚠ WARNING: ${pkg_name} major version (${PKG_VER}) does not match Next.js (${NEXT_MAJOR})${NC}"
                echo "    This can cause lint failures and missing environment variable loading."
                echo "    Fix: Pin ${pkg_name} to ${NEXT_MAJOR}.x.x in package.json"
                echo ""
                WARNINGS=$((WARNINGS + 1))
            fi
        done
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════"

# ─── CHECK 12: JSX comment expression guard ──────────────────────────────
# Root cause of May 12, 2026 incident (14 failed deploys):
# A JSX block comment was written as {/* text */  (missing closing })
# followed by an IIFE and then a bare <div> sibling element.
# webpack/SWC rejected this but node -c (Check 5 fallback) passed it silently.
#
# This check is a fast grep pass that catches TWO related patterns:
#   Pattern A: {/* ... */ at end-of-line without a closing } on the same line
#              AND the next non-empty line starts with a JS expression (IIFE, var, etc.)
#   Pattern B: {/* ... */ immediately followed on the SAME line by a ( or identifier
#              — indicates the comment was never closed as a JSX expression
#
# This runs in <100ms across the entire repo and catches the bug before Babel.
echo ""
echo "CHECK 12: JSX comment expression guard (unclosed {/* */} patterns)..."

# NOTE on grep compatibility: macOS BSD grep rejects \{ in ERE (-E) as invalid.
# Use [{ ] bracket character class to match a literal { on both GNU and BSD grep.
JSX_COMMENT_ERRORS=0
for file in $JS_FILES; do
    [ -f "$file" ] || continue

    # Pattern A: Line ends with {/* ... */ (no closing }) — means the JSX expression
    # was never terminated. Matches {/* anything */ at EOL without trailing }.
    # This is the EXACT pattern from the May 12, 2026 incident (14 failed deploys).
    # Using [{ ] instead of \{ and [*] instead of \* for BSD grep compatibility.
    BAD_COMMENT_LINES=$(grep -nE '[{]/[*].*[*]/[[:space:]]*$' "$file" 2>/dev/null | grep -v '[{]/[*].*[*]/[[:space:]]*[}]')
    if [ -n "$BAD_COMMENT_LINES" ]; then
        echo -e "${RED}  ✗ UNCLOSED JSX COMMENT EXPRESSION: ${file}${NC}"
        echo "$BAD_COMMENT_LINES" | while IFS= read -r line; do
            echo "    Line $line"
        done
        echo "    ↳ Pattern: '{/* comment */' at end of line — missing closing '}'"
        echo "    ↳ JSX parser sees the next element as a bare sibling (webpack ERROR)"
        echo "    ↳ Fix: Change '{/* comment */' to '{/* comment */}' (add closing brace)"
        echo "    ↳ Then wrap the expression after it in its own {expression} block"
        echo ""
        JSX_COMMENT_ERRORS=$((JSX_COMMENT_ERRORS + 1))
        ERRORS=$((ERRORS + 1))
    fi

    # Pattern B: {/* comment */ immediately followed by (() => or (function on the SAME line
    # — the IIFE was placed inside the comment expression without being wrapped in {}.
    BAD_IIFE_LINES=$(grep -nE '[{]/[*].*[*]/[[:space:]]*[((]' "$file" 2>/dev/null | grep -E '[{]/[*].*[*]/[[:space:]]*\(\(')
    if [ -n "$BAD_IIFE_LINES" ]; then
        echo -e "${RED}  ✗ IIFE MERGED WITH JSX COMMENT: ${file}${NC}"
        echo "$BAD_IIFE_LINES" | while IFS= read -r line; do
            echo "    Line $line"
        done
        echo "    ↳ Pattern: '{/* comment */ (() =>' — IIFE is inside the comment expression"
        echo "    ↳ The IIFE result is not a valid JSX expression sibling (webpack ERROR)"
        echo "    ↳ Fix: '{/* comment */}' then '{(() => { ... })()}' as separate expressions"
        echo ""
        JSX_COMMENT_ERRORS=$((JSX_COMMENT_ERRORS + 1))
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $JSX_COMMENT_ERRORS -eq 0 ]; then
    echo -e "${GREEN}  ✓ No unclosed JSX comment expression patterns found.${NC}"
fi

# ─── VERDICT ─────────────────────────────────────────────────────────────
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}  PUSH BLOCKED: ${ERRORS} fatal error(s) found.${NC}"
    echo -e "${RED}  Fix the issues above before pushing.${NC}"
    echo ""
    echo "  To bypass in an emergency: git push --no-verify"
    echo "═══════════════════════════════════════════════════════"
    exit 1
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}  PUSH ALLOWED with ${WARNINGS} warning(s).${NC}"
    echo -e "${YELLOW}  Review the warnings above.${NC}"
else
    echo -e "${GREEN}  ALL CHECKS PASSED. Push allowed.${NC}"
fi

echo "═══════════════════════════════════════════════════════"
echo ""
exit 0
