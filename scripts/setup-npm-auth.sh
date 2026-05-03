#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-npm-auth.sh — Configure GitHub Packages auth for local development
# ═══════════════════════════════════════════════════════════════════════════
#
# WHAT THIS DOES:
#   The private package @smarter-poker/commander-shared is hosted on GitHub
#   Packages (npm.pkg.github.com). The .npmrc in this repo wires up the
#   registry and reads the auth token from NPM_TOKEN env var.
#
#   Without this, `npm install` fails with:
#     npm error 401 Unauthorized - GET https://npm.pkg.github.com/@smarter-poker/commander-shared
#
#   This also means git-safe-push.sh's local build gate cannot run
#   (it wipes node_modules then tries to reinstall).
#
# HOW TO USE:
#   1. Create a GitHub Personal Access Token at:
#      https://github.com/settings/tokens/new
#      Scopes required: read:packages
#
#   2. Run this script:
#      bash scripts/setup-npm-auth.sh ghp_yourTokenHere
#
#   OR set NPM_TOKEN in your shell profile and this script will detect it:
#      export NPM_TOKEN=ghp_yourTokenHere
#      bash scripts/setup-npm-auth.sh
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════"
echo "  GitHub Packages Auth Setup"
echo "  @smarter-poker/commander-shared"
echo "═══════════════════════════════════════════════════"
echo ""

# Check for token — arg or env
TOKEN="${1:-${NPM_TOKEN:-}}"

if [ -z "$TOKEN" ]; then
  echo -e "${RED}  ✗ No token provided.${NC}"
  echo ""
  echo "  Usage: bash scripts/setup-npm-auth.sh ghp_yourTokenHere"
  echo ""
  echo "  Create a token at: https://github.com/settings/tokens/new"
  echo "  Required scope: read:packages"
  echo ""
  exit 1
fi

# Validate token looks like a GitHub PAT
if ! echo "$TOKEN" | grep -qE "^ghp_[a-zA-Z0-9]{36,}$"; then
  echo -e "${YELLOW}  ⚠ Token doesn't look like a GitHub PAT (expected ghp_...).${NC}"
  echo "  Proceeding anyway, but verify it's a valid GitHub token."
  echo ""
fi

# Write to shell profile
PROFILE_FILE=""
if [ -f "$HOME/.zshrc" ]; then
  PROFILE_FILE="$HOME/.zshrc"
elif [ -f "$HOME/.bash_profile" ]; then
  PROFILE_FILE="$HOME/.bash_profile"
elif [ -f "$HOME/.bashrc" ]; then
  PROFILE_FILE="$HOME/.bashrc"
fi

# Check if already set in profile
if [ -n "$PROFILE_FILE" ] && grep -q "NPM_TOKEN" "$PROFILE_FILE" 2>/dev/null; then
  echo -e "${YELLOW}  ⚠ NPM_TOKEN already exists in $PROFILE_FILE.${NC}"
  echo "  Updating with new value..."
  # Remove old line and add new one
  grep -v "NPM_TOKEN" "$PROFILE_FILE" > "${PROFILE_FILE}.tmp" && mv "${PROFILE_FILE}.tmp" "$PROFILE_FILE"
fi

# Write to profile
if [ -n "$PROFILE_FILE" ]; then
  echo "" >> "$PROFILE_FILE"
  echo "# GitHub Packages auth for @smarter-poker private packages" >> "$PROFILE_FILE"
  echo "export NPM_TOKEN=${TOKEN}" >> "$PROFILE_FILE"
  echo -e "${GREEN}  ✓ NPM_TOKEN written to ${PROFILE_FILE}${NC}"
fi

# Also export for current session
export NPM_TOKEN="$TOKEN"

# Test the auth by trying to resolve the package metadata
echo ""
echo "  Testing auth against npm.pkg.github.com..."
AUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "https://npm.pkg.github.com/@smarter-poker/commander-shared" 2>/dev/null)

if [ "$AUTH_TEST" = "200" ]; then
  echo -e "${GREEN}  ✓ Auth works — 200 OK from GitHub Packages${NC}"
  echo -e "${GREEN}  ✓ 'npm install' will now succeed locally${NC}"
elif [ "$AUTH_TEST" = "401" ]; then
  echo -e "${RED}  ✗ Auth failed — 401 Unauthorized${NC}"
  echo "    Token may be invalid, expired, or missing read:packages scope"
  echo "    Create a new token at: https://github.com/settings/tokens/new"
  exit 1
elif [ "$AUTH_TEST" = "404" ]; then
  echo -e "${RED}  ✗ Package not found — 404${NC}"
  echo "    Token may not have access to the Smarter-Poker org packages"
  exit 1
else
  echo -e "${YELLOW}  ⚠ Unexpected HTTP ${AUTH_TEST} — verify manually${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo -e "${GREEN}  Setup complete!${NC}"
echo ""
echo "  Next steps:"
echo "  1. Reload your shell: source ${PROFILE_FILE:-~/.zshrc}"
echo "  2. Run: npm install"
echo "  3. Run: npm run build"
echo "═══════════════════════════════════════════════════"
echo ""
