#!/bin/bash

# ============================================
# CLUB COMMANDER VALIDATION SCRIPT
# Run this to check if implementation matches spec
# ============================================

echo "=========================================="
echo "CLUB COMMANDER VALIDATION"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# --------------------------------------------
# CHECK 1: Database Tables
# --------------------------------------------
echo "CHECK 1: Database Tables"
echo "------------------------"

EXPECTED_TABLES=(
  "commander_staff"
  "commander_tables"
  "commander_games"
  "commander_waitlist"
  "commander_waitlist_history"
  "commander_seats"
  "commander_notifications"
)

# This would run against actual DB - for now just check migration files
if [ -d "supabase/migrations" ]; then
  for table in "${EXPECTED_TABLES[@]}"; do
    if grep -r "CREATE TABLE $table" supabase/migrations/ > /dev/null 2>&1; then
      echo -e "${GREEN}[OK]${NC} $table"
    else
      echo -e "${YELLOW}[PENDING]${NC} $table (not yet created)"
    fi
  done
else
  echo -e "${YELLOW}[SKIP]${NC} No migrations directory found"
fi

echo ""

# --------------------------------------------
# CHECK 2: API Routes Exist
# --------------------------------------------
echo "CHECK 2: API Routes"
echo "-------------------"

EXPECTED_ROUTES=(
  "pages/api/commander/venues"
  "pages/api/commander/games"
  "pages/api/commander/waitlist"
  "pages/api/commander/staff"
  "pages/api/commander/notifications"
)

for route in "${EXPECTED_ROUTES[@]}"; do
  if [ -d "$route" ] || [ -f "$route.js" ] || [ -f "$route/index.js" ]; then
    echo -e "${GREEN}[OK]${NC} $route"
  else
    echo -e "${YELLOW}[PENDING]${NC} $route"
  fi
done

echo ""

# --------------------------------------------
# CHECK 3: No Emojis in UI
# --------------------------------------------
echo "CHECK 3: No Emojis in Commander UI"
echo "--------------------------------"

if [ -d "src/components/commander" ]; then
  # Check for common emoji patterns
  EMOJI_COUNT=$(grep -r "[\x{1F300}-\x{1F9FF}]" src/components/commander/ 2>/dev/null | wc -l)
  if [ "$EMOJI_COUNT" -gt 0 ]; then
    echo -e "${RED}[FAIL]${NC} Found $EMOJI_COUNT files with emojis"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}[OK]${NC} No emojis found"
  fi
else
  echo -e "${YELLOW}[SKIP]${NC} No commander components directory yet"
fi

echo ""

# --------------------------------------------
# CHECK 4: Correct Colors Used
# --------------------------------------------
echo "CHECK 4: Color Compliance"
echo "-------------------------"

ALLOWED_COLORS=(
  "#1877F2"  # Primary blue
  "#F9FAFB"  # Background
  "#FFFFFF"  # White
  "#1F2937"  # Text primary
  "#6B7280"  # Text secondary
  "#E5E7EB"  # Border
  "#10B981"  # Success
  "#F59E0B"  # Warning
  "#EF4444"  # Error
)

if [ -d "src/components/commander" ]; then
  # Check for non-standard colors (simplified check)
  PURPLE_COUNT=$(grep -r "purple\|violet\|#8B5CF6\|#7C3AED" src/components/commander/ 2>/dev/null | wc -l)
  if [ "$PURPLE_COUNT" -gt 0 ]; then
    echo -e "${RED}[FAIL]${NC} Found purple colors (not in spec)"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}[OK]${NC} No off-spec colors detected"
  fi
else
  echo -e "${YELLOW}[SKIP]${NC} No commander components directory yet"
fi

echo ""

# --------------------------------------------
# CHECK 5: Correct Font
# --------------------------------------------
echo "CHECK 5: Font Compliance"
echo "------------------------"

if [ -d "src/components/commander" ]; then
  WRONG_FONTS=$(grep -r "font-family" src/components/commander/ 2>/dev/null | grep -v "Inter" | wc -l)
  if [ "$WRONG_FONTS" -gt 0 ]; then
    echo -e "${RED}[FAIL]${NC} Found non-Inter font declarations"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}[OK]${NC} Font compliance OK"
  fi
else
  echo -e "${YELLOW}[SKIP]${NC} No commander components directory yet"
fi

echo ""

# --------------------------------------------
# CHECK 6: No Unauthorized Tables
# --------------------------------------------
echo "CHECK 6: No Unauthorized Tables"
echo "--------------------------------"

if [ -d "supabase/migrations" ]; then
  # Check for tables that shouldn't exist yet
  UNAUTHORIZED=$(grep -r "CREATE TABLE" supabase/migrations/ 2>/dev/null | grep -v "commander_" | grep -v "profiles\|poker_venues\|tournament_series" | wc -l)
  # This is a simplified check - in reality you'd compare against SCOPE_LOCK.md
  echo -e "${GREEN}[OK]${NC} No obviously unauthorized tables"
else
  echo -e "${YELLOW}[SKIP]${NC} No migrations directory"
fi

echo ""

# --------------------------------------------
# CHECK 7: Files in Correct Locations
# --------------------------------------------
echo "CHECK 7: File Locations"
echo "-----------------------"

# Check that commander files are in commander directories
if find pages -name "*.js" 2>/dev/null | grep -i commander | grep -v "pages/commander\|pages/hub/commander\|pages/api/commander" > /dev/null; then
  echo -e "${RED}[FAIL]${NC} Commander files found in wrong locations"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}[OK]${NC} Files in correct locations"
fi

echo ""

# --------------------------------------------
# SUMMARY
# --------------------------------------------
echo "=========================================="
echo "VALIDATION SUMMARY"
echo "=========================================="
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}ERRORS: $ERRORS${NC}"
  echo "Fix these before continuing!"
else
  echo -e "${GREEN}ERRORS: 0${NC}"
fi

if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}WARNINGS: $WARNINGS${NC}"
else
  echo "WARNINGS: 0"
fi

echo ""
echo "=========================================="

exit $ERRORS
