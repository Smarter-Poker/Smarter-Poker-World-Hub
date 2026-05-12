#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# INSTALL GIT HOOKS
# ═══════════════════════════════════════════════════════════════════════════
# Installs the pre-push safety gate and pre-commit combined hook.
# Run automatically via `npm install` (postinstall script) or manually:
#   bash scripts/install-hooks.sh
# ═══════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

# Ensure .git/hooks directory exists
if [ ! -d "$HOOKS_DIR" ]; then
    echo "ERROR: .git/hooks directory not found at $HOOKS_DIR"
    echo "Are you running this from the project root?"
    exit 1
fi

# Disable husky's core.hooksPath override so our native hooks are used
git config --unset core.hooksPath 2>/dev/null || true

# Copy pre-push hook (syntax validation + corruption detection)
if [ -f "$SCRIPT_DIR/pre-push-hook.sh" ]; then
    cp "$SCRIPT_DIR/pre-push-hook.sh" "$HOOKS_DIR/pre-push"
    chmod +x "$HOOKS_DIR/pre-push"
    echo "✓ Pre-push safety gate installed (CHECK 1-12)"
fi

# Copy pre-commit hook (Club Arena + Supabase auth)
if [ -f "$SCRIPT_DIR/pre-commit-hook.sh" ]; then
    cp "$SCRIPT_DIR/pre-commit-hook.sh" "$HOOKS_DIR/pre-commit"
    chmod +x "$HOOKS_DIR/pre-commit"
    echo "✓ Pre-commit combined hook installed (Arena + Auth)"
fi

echo ""
echo "Pre-push checks:"
echo "  1. Unused hook imports        5. Babel/node-c JSX-aware syntax"
echo "  2. SSG-unsafe browser APIs    6. Auth route canonicalization"
echo "  3. No .single() calls         7. Unauth'd API fetch calls"
echo "  4. No raw Supabase imports    8. Broken import resolution"
echo "  9. Catch-block corruption     10. TypeScript new-error gate"
echo "  11. Vercel/Next.js config     12. JSX comment expression guard"
echo ""
echo "Pre-commit checks:"
echo "  A. Club Arena build enforcement"
echo "  B. ★ Merge/stash conflict marker detection (prevents Vercel 'Module parse failed')"
echo "  C. Dangerous Supabase auth pattern detection"
echo ""
echo "To bypass in an emergency: git push --no-verify"
echo ""
