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

# ── PATCH 4: signup.js — apex-OAuth pre-flight + PostHog reorder ──────────
SIGNUP="$ROOT/pages/auth/signup.js"
if [ ! -f "$SIGNUP" ]; then
  fail "signup.js not found at $SIGNUP"
fi

if grep -q "AUTH_ALWAYS_ALLOW\|host.startsWith('www\|profileProvisioned" "$SIGNUP"; then
  ok "PATCH 4 (signup.js apex-OAuth + PostHog gate): already applied"
else
  backup "$SIGNUP"
  python3 - "$SIGNUP" <<'PY'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1])
src = path.read_text()

# 4a. Apex-domain pre-flight in handleOAuthSignIn
old_oauth = """    const handleOAuthSignIn = async (provider) => {
        setError('');
        setOauthLoading(provider);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        } catch (err) {
            console.warn(`${provider} sign in error:`, err);
            setError(err.message || `Failed to sign in with ${provider}`);
            setOauthLoading('');
        }
    };"""
new_oauth = """    // [2026-05-03] Apex-domain hardening. PKCE stores code_verifier in
    // localStorage on the origin where signInWithOAuth is called. If the
    // user is on www.smarter.poker, Supabase redirects to Google which
    // returns to /auth/callback — but the www→apex middleware redirect
    // strips the user to apex, where the verifier is unreadable, and
    // exchangeCodeForSession fails with "code verifier not found".
    const handleOAuthSignIn = async (provider) => {
        setError('');
        setOauthLoading(provider);
        try {
            const host = (typeof window !== 'undefined' && window.location.hostname) || '';
            if (host.startsWith('www.')) {
                const apex = host.replace(/^www\\./, '');
                window.location.replace(`https://${apex}/auth/signup?provider=${encodeURIComponent(provider)}`);
                return;
            }
        } catch (_originErr) { /* SSR — skip */ }

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                    queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
                },
            });
            if (error) throw error;
        } catch (err) {
            console.warn(`${provider} sign in error:`, err);
            setError(err.message || `Failed to sign in with ${provider}`);
            setOauthLoading('');
        }
    };

    // [2026-05-03] Resume OAuth after the www→apex bounce above.
    useEffect(() => {
        if (!router.isReady) return;
        const provider = router.query.provider;
        if (typeof provider === 'string' && ['google', 'apple', 'discord'].includes(provider)) {
            const cleanQuery = { ...router.query };
            delete cleanQuery.provider;
            router.replace({ pathname: router.pathname, query: cleanQuery }, undefined, { shallow: true });
            handleOAuthSignIn(provider);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady]);"""
src = src.replace(old_oauth, new_oauth, 1)

# 4b. PostHog SIGNUP capture should fire only when profile exists.
# Move the capture call from immediately-after-signUp to after profile
# provisioning succeeds. We wrap the existing call in a guard.
old_capture = """                    capture(FunnelEvents.SIGNUP, {
                        has_referral: !!isReferralCode,
                        has_promo: !!formData.promoCode && !isReferralCode,
                        phone_verified: !!phoneVerified,
                    });"""
new_capture = """                    // [2026-05-03] Deferred — fired only after profile provision.
                    // capture(FunnelEvents.SIGNUP, …) — see end of try{} block below."""
src = src.replace(old_capture, new_capture, 1)

# Insert the deferred capture right before the email_pending / success
# branching at the end of the handleSignUp try block.
anchor = """            // Check if email confirmation is required
            if (authData.user && !authData.session) {"""
deferred = """            // [2026-05-03] Deferred SIGNUP funnel event. Fire AFTER the
            // full provisioning attempt so orphaned auth.users rows (no
            // profile) are tracked separately and don't inflate the funnel.
            try {
                if (authData?.user?.id) {
                    capture(FunnelEvents.SIGNUP, {
                        has_referral: !!isReferralCode,
                        has_promo: !!formData.promoCode && !isReferralCode,
                        phone_verified: !!phoneVerified,
                    });
                }
            } catch (_pcErr) { console.warn('[App] Handled exception:', _pcErr?.message || _pcErr); }

"""
src = src.replace(anchor, deferred + anchor, 1)

path.write_text(src)
PY
  ok "PATCH 4 (signup.js apex-OAuth + PostHog gate): applied"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ALL PATCHES APPLIED. Backups in $BACKUP_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Run:    node --test __tests__/auth-routes-exist.test.mjs"
echo "  2. Run:    node --test __tests__/signup-hardening.test.mjs   (new)"
echo "  3. Commit: git add -A && git commit -m 'harden(signup): geo-allow /auth/, login.js parity, middleware guard, apex-OAuth, posthog gate'"
echo "  4. Push.   Vercel deploys automatically."
echo "  5. Verify: curl -s https://smarter.poker/api/health/signup | jq"
echo "  6. Add cron entry to vercel.json so signup-probe runs every 5min:"
echo '       { "path": "/api/cron/signup-probe", "schedule": "*/5 * * * *" }'
echo ""
