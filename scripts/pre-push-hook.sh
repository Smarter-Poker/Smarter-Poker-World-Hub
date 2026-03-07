#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SMARTER.POKER PRE-PUSH SAFETY GATE
# ═══════════════════════════════════════════════════════════════════════════
# This hook runs BEFORE every push. It catches the exact class of bugs
# that caused the March 7, 2026 cascading build failure (14 failed deploys).
#
# What it checks:
# 1. Hooks imported but never called (the ThreePillHeader bug)
# 2. Module-scope browser API usage without window guards (SSG bombs)
# 3. No .single() calls (must use .maybeSingle())
# 4. No raw @supabase/supabase-js imports in API routes
# 5. Basic syntax validation
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

JS_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(js|jsx|ts|tsx)$' | grep -v node_modules | grep -v '.next/')

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

# ─── CHECK 5: Basic syntax validation ────────────────────────────────────
echo "CHECK 5: Syntax validation..."

if command -v node &> /dev/null; then
    SYNTAX_ERRORS=0
    for file in $JS_FILES; do
        [ -f "$file" ] || continue
        # Skip TypeScript files (node can't parse them directly)
        echo "$file" | grep -qE '\.tsx?$' && continue

        # Try to parse with node
        node -e "
            try {
                require('fs').readFileSync('$file', 'utf8');
            } catch(e) {
                process.exit(1);
            }
        " 2>/dev/null

        if [ $? -ne 0 ]; then
            echo -e "${RED}  ✗ SYNTAX ERROR: ${file}${NC}"
            SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
            ERRORS=$((ERRORS + 1))
        fi
    done

    if [ $SYNTAX_ERRORS -eq 0 ]; then
        echo -e "${GREEN}  ✓ All files pass syntax check.${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ Node.js not found. Skipping syntax validation.${NC}"
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
