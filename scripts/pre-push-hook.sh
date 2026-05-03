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
# 5. Syntax validation: node -c for .js, Babel for .jsx/.tsx
# 6. Auth route canonicalization (/auth/login not /auth/signin)
# 7. Pages with /api/ fetch calls must import auth (getAccessToken/authedFetch)
# 8. Broken imports — all import paths resolve to existing files
# 9. Catch-block corruption — detects collapsed try/catch with orphaned code
#    (the April 21, 2026 incident: 17 failed deploys from automated refactoring)
# 10. TypeScript type checking via tsc --noEmit (only NEW errors block the push)
#
# INSTALL: Run `bash scripts/install-hooks.sh` from the project root
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

# Get files changed in the commits being pushed
CHANGED_FILES=$(git diff --name-only HEAD~5..HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null)

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

# ─── CHECK 5: Syntax validation (node -c for .js, Babel for .jsx/.tsx) ──
echo "CHECK 5: Syntax validation (node -c)..."

if command -v node &> /dev/null; then
    SYNTAX_ERRORS=0
    # Locate Babel parser from the project (always available since Next.js requires it)
    BABEL_PARSER="$(node -e "try{require.resolve('@babel/parser');console.log(require.resolve('@babel/parser'))}catch(e){console.log('')}" 2>/dev/null)"

    for file in $JS_FILES; do
        [ -f "$file" ] || continue
        # Skip files with import assertions (assert { type: 'json' }) — valid in webpack
        grep -q 'assert {' "$file" 2>/dev/null && continue

        # For .jsx and .tsx — use Babel parser if available (catches JSX errors node -c misses)
        if echo "$file" | grep -qE '\.(jsx|tsx)$'; then
            if [ -n "$BABEL_PARSER" ]; then
                PARSE_OUTPUT=$(node -e "
const fs=require('fs');
const {parse}=require('$BABEL_PARSER');
try{
  parse(fs.readFileSync('$file','utf8'),{
    sourceType:'module',
    plugins:['jsx','typescript','decorators-legacy','classProperties','optionalChaining','nullishCoalescingOperator']
  });
  process.exit(0);
}catch(e){
  console.error(e.message+' (line '+e.loc?.line+')');
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

        # For .ts — skip (TypeScript type errors need tsc, not node -c)
        echo "$file" | grep -qE '\.tsx?$' && continue

        # Plain .js — use node -c (fast, reliable)
        PARSE_OUTPUT=$(node -c "$file" 2>&1)
        if [ $? -ne 0 ]; then
            echo -e "${RED}  ✗ SYNTAX ERROR: ${file}${NC}"
            echo "    $PARSE_OUTPUT" | head -3
            echo ""
            SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
            ERRORS=$((ERRORS + 1))
        fi
    done

    if [ $SYNTAX_ERRORS -eq 0 ]; then
        echo -e "${GREEN}  ✓ All .js files pass node -c syntax check.${NC}"
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
        REMOTE_HEAD=$(git rev-parse "@{u}" 2>/dev/null || git rev-parse HEAD~1 2>/dev/null)

        # Run tsc on the CURRENT state (with our changes)
        CURRENT_ERRORS=$("$TSC_BIN" --noEmit --skipLibCheck 2>&1 | grep '^src/' | sort)
        CURRENT_COUNT=$(echo "$CURRENT_ERRORS" | grep -c 'error TS' 2>/dev/null || echo 0)

        # Run tsc on the REMOTE HEAD state (before our changes)
        if [ -n "$REMOTE_HEAD" ]; then
            BASELINE_ERRORS=$(git stash --quiet 2>/dev/null && \
                "$TSC_BIN" --noEmit --skipLibCheck 2>&1 | grep '^src/' | sort; \
                git stash pop --quiet 2>/dev/null)
            BASELINE_COUNT=$(echo "$BASELINE_ERRORS" | grep -c 'error TS' 2>/dev/null || echo 0)
        else
            BASELINE_COUNT=0
            BASELINE_ERRORS=""
        fi

        # Find errors that are NEW (in current but not in baseline)
        NEW_ERRORS=$(comm -23 \
            <(echo "$CURRENT_ERRORS" | grep 'error TS' | sort) \
            <(echo "$BASELINE_ERRORS" | grep 'error TS' | sort) 2>/dev/null)
        NEW_COUNT=$(echo "$NEW_ERRORS" | grep -c 'error TS' 2>/dev/null || echo 0)

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
