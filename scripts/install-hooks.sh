#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# INSTALL GIT HOOKS
# ═══════════════════════════════════════════════════════════════════════════
# Run this script once after cloning the repo to install the pre-push
# safety gate that prevents catastrophic deployment failures.
#
# Usage: bash scripts/install-hooks.sh
# ═══════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo ""
echo "Installing Smarter.Poker git hooks..."
echo ""

# Ensure .git/hooks directory exists
if [ ! -d "$HOOKS_DIR" ]; then
    echo "ERROR: .git/hooks directory not found at $HOOKS_DIR"
    echo "Are you running this from the project root?"
    exit 1
fi

# Copy pre-push hook
cp "$SCRIPT_DIR/pre-push-hook.sh" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

echo "✓ Pre-push safety gate installed at .git/hooks/pre-push"
echo ""
echo "The following checks will run before every push:"
echo "  1. Unused hook imports (prevents SSG ReferenceErrors)"
echo "  2. Module-scope browser APIs without window guards"
echo "  3. .single() calls (must use .maybeSingle())"
echo "  4. Raw @supabase/supabase-js imports in API routes"
echo "  5. Basic syntax validation"
echo ""
echo "To bypass in an emergency: git push --no-verify"
echo ""
