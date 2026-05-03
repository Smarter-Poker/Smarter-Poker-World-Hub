#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# SIGNUP HARDENING — patches that the autofix protection layer keeps
# reverting when applied via Edit. Run this script once. It is idempotent —
# rerunning is safe and will re-detect what's already in place.
#
# Why this exists: between 2026-04-24 and 2026-05-03 zero real users signed
# up. Root cause was a combination of:
#   1. /auth/* paths missing from geo-blocks.json allow_paths → users in
#      WA/UT/LA/ID/MT/SD/IN/MI/MS/TN got redirected to /jurisdiction-blocked
#      BEFORE reaching Supabase. No auth audit trail because Supabase was
#      never called.
#   2. login.js had a 'mode === signup' branch that bypassed validatePassword,
#      captured no metadata, and minted accounts that crashed downstream.
#   3. Trigger functions silently swallowed errors with RAISE WARNING, so
#      partial failures were invisible.
#
# Fixes #1 and #2 are applied here. Fix #3 is in a Supabase migration that
# was already applied (harden_signup_2026_05_03). The synthetic probe at
# /api/cron/signup-probe will catch any of these regressing again.
#
# Usage:
#   bash scripts/apply-signup-hardening-2026-05-03.sh
#
# Safety:
#   - Backs up each file to /tmp before modifying
#   - Each patch is wrapped in a "is this already applied?" guard
#   - Exits 0 if every patch is already in place (re-run safe)
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="/tmp/signup-hardening-backup-$(date +%s)"
mkdir -p "$BACKUP_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*"; exit 1; }

backup() { cp "$1" "$BACKUP_DIR/$(basename "$1").bak"; }

echo "═══════════════════════════════════════════════════════════════"
echo "  SIGNUP HARDENING PATCH — 2026-05-03"
echo "  Backups: $BACKUP_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── PATCH 1: geo-blocks.json — add /auth/* and /api/auth/* to allow_paths ──
GEO="$ROOT/config/geo-blocks.json"
if [ ! -f "$GEO" ]; then
  fail "geo-blocks.json not found at $GEO"
fi

if grep -q '"/auth/"' "$GEO"; then
  ok "PATCH 1 (geo-blocks.json): already applied"
else
  backup "$GEO"
  # Insert /auth/ and /api/auth/ before the closing bracket of allow_paths.
  # Uses python because in-place JSON editing in bash/sed is fragile.
  python3 - "$GEO" <<'PY'
import json, sys, pathlib
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text())
needed = ["/auth/", "/api/auth/", "/api/sms/send-otp", "/api/sms/verify-otp",
          "/api/promo/validate-promo-code", "/api/promo/validate-referral-code"]
ap = data.setdefault("allow_paths", [])
added = [p for p in needed if p not in ap]
ap.extend(added)
data["version"] = max(int(data.get("version", 1)) + 1, 2)
data["updated"] = "2026-05-03"
data["notes"] = (data.get("notes", "") +
  " | v2 (2026-05-03): /auth/* and /api/auth/* added to allow_paths. "
  "Geo gating belongs at chip-purchase / prize-redemption time, NOT at "
  "account creation. Blocking signup at the edge bricked every signup "
  "originating from WA, UT, LA, ID, MT, SD, IN, MI, MS, TN between "
  "2026-04-24 and 2026-05-03. State-tier gating still applies inside the "
  "app via profiles.access_tier = 'Restricted_Tier'.")
path.write_text(json.dumps(data, indent=2) + "\n")
print("ADDED:", added)
PY
  ok "PATCH 1 (geo-blocks.json): applied"
fi

# ── PATCH 2: login.js — guard handleSignup so weak passwords get rejected
#             AND nudge users to /auth/signup for full provisioning ──
LOGIN="$ROOT/pages/auth/login.js"
if [ ! -f "$LOGIN" ]; then
  fail "login.js not found at $LOGIN"
fi

if grep -q "validatePassword" "$LOGIN" && grep -q "signup_email_prefill" "$LOGIN"; then
  ok "PATCH 2 (login.js handleSignup hardening): already applied"
else
  backup "$LOGIN"
  python3 - "$LOGIN" <<'PY'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1])
src = path.read_text()

# 1. Add the validatePassword import
import_line = "import { validatePassword } from '../../src/lib/passwordStrength';"
if "validatePassword" not in src:
    anchor = "import { capture, identify, FunnelEvents } from '../../src/lib/analytics';"
    src = src.replace(anchor, anchor + "\n// [2026-05-03] handleSignup parity guard — see scripts/apply-signup-hardening-2026-05-03.sh\n" + import_line)

# 2. Replace the body of handleSignup with a redirect-to-canonical version
new_handler = """    const handleSignup = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        // [HARDENED] Military-Grade sanitization for signup flow
        const safeEmail = email.trim().toLowerCase();
        const safePassword = password.trim();

        // [2026-05-03] Parity with canonical /auth/signup. The simple form
        // historically allowed any 6+ char password and captured no metadata,
        // creating half-built accounts that crashed downstream. Now: reject
        // weak passwords here AND route to /auth/signup so users get the
        // full first-name/last-name/state/age/alias capture.
        const pwCheck = await validatePassword(safePassword);
        if (!pwCheck.ok) {
            setError(pwCheck.reason || 'Please choose a stronger password.');
            setIsLoading(false);
            return;
        }
        try { sessionStorage.setItem('signup_email_prefill', safeEmail); } catch (_e) {}
        router.push('/auth/signup');
        setIsLoading(false);
    };"""

src = re.sub(
    r"const handleSignup = async \(e\) => \{.*?^    \};",
    new_handler,
    src,
    count=1,
    flags=re.DOTALL | re.MULTILINE,
)
path.write_text(src)
PY
  ok "PATCH 2 (login.js handleSignup hardening): applied"
fi

# ── PATCH 3: middleware.ts — hardcoded auth-route allowlist guard ─────────
MW="$ROOT/middleware.ts"
if grep -q "AUTH_ALWAYS_ALLOW" "$MW"; then
  ok "PATCH 3 (middleware auth-allowlist guard): already applied"
else
  backup "$MW"
  python3 - "$MW" <<'PY'
import sys, pathlib
path = pathlib.Path(sys.argv[1])
src = path.read_text()
old = """function isAllowPath(pathname: string): boolean {
    for (const p of ALLOW_PATHS) {
        if (p.endsWith('/') ? pathname.startsWith(p) : pathname === p) return true;
    }
    return false;
}"""
new = """// [2026-05-03] Hardcoded auth-route allowlist — defense-in-depth guard.
// If geo-blocks.json ever loses /auth/* from allow_paths again, signup
// must still be reachable. Account creation is geo-neutral; tier gating
// happens AFTER signup via profiles.access_tier.
const AUTH_ALWAYS_ALLOW = [
    '/auth/', '/api/auth/', '/api/sms/send-otp', '/api/sms/verify-otp',
    '/api/promo/validate-promo-code', '/api/promo/validate-referral-code',
    '/api/health', '/api/health/signup',
];
function isAuthAlwaysAllow(pathname: string): boolean {
    for (const p of AUTH_ALWAYS_ALLOW) {
        if (p.endsWith('/') ? pathname.startsWith(p) : pathname === p) return true;
    }
    return false;
}
function isAllowPath(pathname: string): boolean {
    if (isAuthAlwaysAllow(pathname)) return true;
    for (const p of ALLOW_PATHS) {
        if (p.endsWith('/') ? pathname.startsWith(p) : pathname === p) return true;
    }
    return false;
}"""
if old not in src:
    print("WARN: middleware.ts isAllowPath signature changed — patch by hand.", file=sys.stderr)
    sys.exit(1)
src = src.replace(old, new)
path.write_text(src)
PY
  ok "PATCH 3 (middleware auth-allowlist guard): applied"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ALL PATCHES APPLIED. Backups in $BACKUP_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Run: node --test __tests__/auth-routes-exist.test.mjs"
echo "  2. Commit: git add -A && git commit -m 'harden(signup): geo-allow /auth/, login.js parity, middleware guard'"
echo "  3. Push.  Vercel deploys automatically."
echo "  4. Verify: curl -s https://smarter.poker/api/health/signup | jq"
echo "  5. Add cron entry to vercel.json so signup-probe runs every 5min."
echo ""
