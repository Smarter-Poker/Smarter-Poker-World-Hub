#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# FULL IMPORT SCANNER
# ═══════════════════════════════════════════════════════════════
# Scans ALL .js/.jsx/.ts/.tsx files in the project for broken
# relative imports. Unlike CHECK 8 in the pre-push gate (which
# only checks changed files), this scans the entire codebase.
#
# Usage:  bash scripts/full-import-scan.sh
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  FULL IMPORT SCANNER"
echo "═══════════════════════════════════════════════════════"
echo ""

BROKEN=0
SCANNED=0

ALL_FILES=$(find pages src -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/.next/*" \
    ! -path "*/dist/*" 2>/dev/null)

TOTAL=$(echo "$ALL_FILES" | wc -l | tr -d ' ')
echo "Scanning $TOTAL files for broken imports..."
echo ""

for file in $ALL_FILES; do
    [ -f "$file" ] || continue
    SCANNED=$((SCANNED + 1))
    FILE_DIR=$(dirname "$file")

    # Extract all relative import paths
    IMPORT_PATHS=$(grep -oE "(from|require\()\s*['\"](\./|\.\./)[^'\"]+['\"]" "$file" 2>/dev/null \
        | grep -oE "['\"](\./|\.\./)[^'\"]+['\"]" | tr -d "'\"")

    for imp in $IMPORT_PATHS; do
        RESOLVED="$FILE_DIR/$imp"

        FOUND=0
        for ext in "" ".js" ".jsx" ".ts" ".tsx" "/index.js" "/index.ts" "/index.jsx" "/index.tsx"; do
            if [ -f "${RESOLVED}${ext}" ]; then
                FOUND=1
                break
            fi
        done

        if [ $FOUND -eq 0 ]; then
            echo -e "${RED}  ✗ BROKEN: ${file}${NC}"
            echo "    Cannot resolve: ${imp}"
            BROKEN=$((BROKEN + 1))
        fi
    done

    # Progress indicator every 200 files
    if [ $((SCANNED % 200)) -eq 0 ]; then
        echo -e "${YELLOW}  ... scanned ${SCANNED}/${TOTAL} files${NC}"
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════"
if [ $BROKEN -eq 0 ]; then
    echo -e "${GREEN}  ✓ All imports resolve correctly (${SCANNED} files scanned)${NC}"
else
    echo -e "${RED}  ✗ ${BROKEN} broken import(s) found across ${SCANNED} files${NC}"
fi
echo "═══════════════════════════════════════════════════════"
echo ""

exit $BROKEN
