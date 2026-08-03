/**
 * AUTH ROUTES — STATIC EXISTENCE GUARD
 * ─────────────────────────────────────────────────────────────────────────
 * On 2026-05-02 every signup (Google + email) was 404'ing because
 * `pages/auth/callback.js` had been silently deleted from the repo. The
 * route is the redirect target for `signInWithOAuth` and for email-link
 * verification — without it both flows die after the redirect and the
 * Vercel logs show: GET /auth/callback | 404.
 *
 * This test runs in CI before any deploy and FAILS THE BUILD if any of
 * the listed auth-critical files are missing. It cannot be bypassed by
 * lint suppression — it's a presence check on the filesystem.
 *
 * If you genuinely need to remove one of these files, also remove it
 * from this list AND add a replacement that handles the same flow.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

const CRITICAL_AUTH_FILES = [
    'pages/auth/callback.js',
    'pages/auth/login.js',
    'pages/auth/signup.js',
    'pages/auth/forgot-password.js',
    'pages/auth/reset-password.js',
    'pages/api/auth/ensure-profile.js',
    // [2026-07-25] extended coverage — every file here has 404'd or silently
    // regressed at least once, or is a single point of failure for a flow.
    'pages/auth/signin.js',          // safety-net redirect → /auth/login
    'pages/auth/quick.js',           // emergency signup page
    'pages/auth/mfa.js',             // 2FA challenge page
    'pages/api/auth/quick-signup.js',
    'pages/api/auth/mfa/challenge.js',
    'src/lib/supabase.ts',           // the real Supabase client
    'src/lib/authUtils.ts',          // webpack-aliased target of authUtils.js
];

// Routes that the auth flows reference. If any of these strings is in the
// codebase but the corresponding file is missing, the redirect 404s.
// Each entry: { route, mustExist: 'pages/...' }
const AUTH_ROUTE_TARGETS = [
    { route: '/auth/callback',        mustExist: 'pages/auth/callback.js' },
    { route: '/auth/login',           mustExist: 'pages/auth/login.js' },
    { route: '/auth/signup',          mustExist: 'pages/auth/signup.js' },
    { route: '/auth/forgot-password', mustExist: 'pages/auth/forgot-password.js' },
    { route: '/auth/reset-password',  mustExist: 'pages/auth/reset-password.js' },
    { route: '/auth/signin',          mustExist: 'pages/auth/signin.js' },
    { route: '/auth/quick',           mustExist: 'pages/auth/quick.js' },
    { route: '/auth/mfa',             mustExist: 'pages/auth/mfa.js' },
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT-REGRESSION GUARDS
// Each entry pins a specific hard-won fix in place. If a refactor removes the
// pattern, the build fails with a message explaining WHY the pattern matters.
// These are cheap regex checks on file contents — not style policing; every
// one of them maps to a real production incident or a verified prod bug.
// ═══════════════════════════════════════════════════════════════════════════
const CONTENT_GUARDS = [
    {
        file: 'src/lib/supabase.ts',
        pattern: /NEXT_PUBLIC_SUPABASE_ANON_KEY\?\.trim\(\)/,
        why: 'Anon key must be .trim()ed — the prod Vercel env value ends with a literal \n that breaks fetch headers.',
    },
    {
        file: 'src/lib/authUtils.ts',
        // Two accepted shapes, both of which export a trimmed value:
        //   (a) trimmed inline at the export site, or
        //   (b) trimmed into RAW_SUPABASE_ANON_KEY first, then re-exported
        //       (the shape introduced by ba48e491e4's credential cleanup).
        // Still fails if the .trim() is dropped, which is the point of the guard.
        pattern: /(export const SUPABASE_ANON_KEY[\s\S]{0,400}\.trim\(\))|(RAW_SUPABASE_ANON_KEY\s*=\s*\([\s\S]{0,200}\.trim\(\)[\s\S]{0,600}export const SUPABASE_ANON_KEY\s*=\s*RAW_SUPABASE_ANON_KEY)/,
        why: 'authUtils.ts must export a TRIMMED SUPABASE_ANON_KEY — next.config.js aliases authUtils.js to this file, so callers importing the constant get undefined without this export (B-AUTH-EXPORTS-1).',
    },
    {
        file: 'pages/api/auth/quick-signup.js',
        pattern: /NEXT_PUBLIC_SUPABASE_ANON_KEY[^;]*\.trim\(\)/,
        why: 'Emergency signup endpoint 500s on every request if the anon key is not trimmed (trailing \n in prod env).',
    },
    {
        file: 'pages/auth/login.js',
        pattern: /enabled === true/,
        why: 'MFA login gate must use STRICT === true checks (loose truthiness caused random /auth/mfa redirects and got the gate disabled once already).',
    },
    {
        file: 'pages/auth/callback.js',
        pattern: /exchangeCodeForSession/,
        why: 'PKCE code exchange is how Google OAuth completes — removing it breaks every OAuth sign-in.',
    },
    {
        file: 'pages/auth/forgot-password.js',
        pattern: /\/auth\/callback\?next=/,
        why: 'Recovery emails must carry ?next=/auth/reset-password so users still reach the reset form if the email template uses {{ .ConfirmationURL }} instead of {{ .TokenHash }}.',
    },
    {
        file: 'pages/api/cron/login-probe.js',
        pattern: /oauth_chain/,
        why: 'The OAuth-chain health check is what catches a dead custom auth domain (auth.smarter.poker TLS outage, 2026-07-25) — password probes alone stay green during that failure.',
    },
    {
        file: 'pages/auth/signup.js',
        pattern: /maxLength=\{6\}/,
        why: 'Email OTP input must accept 6 digits — Supabase email tokens are 6 digits; maxLength=4 made code entry impossible (fixed 2026-07-25).',
    },
];

test('content-regression guards hold', () => {
    for (const { file, pattern, why } of CONTENT_GUARDS) {
        const full = path.join(REPO_ROOT, file);
        assert.ok(fs.existsSync(full), `${file} missing (guard: ${why})`);
        const content = fs.readFileSync(full, 'utf8');
        assert.ok(
            pattern.test(content),
            `${file} no longer matches ${pattern} — ${why}`,
        );
    }
});

test('auth-critical files exist on disk', () => {
    const missing = CRITICAL_AUTH_FILES.filter(
        (rel) => !fs.existsSync(path.join(REPO_ROOT, rel)),
    );
    assert.deepEqual(
        missing,
        [],
        `Critical auth files are missing — signup will 404.\nMissing: ${JSON.stringify(missing, null, 2)}`,
    );
});

test('auth-critical files are non-empty', () => {
    for (const rel of CRITICAL_AUTH_FILES) {
        const full = path.join(REPO_ROOT, rel);
        if (!fs.existsSync(full)) continue; // covered by previous test
        const size = fs.statSync(full).size;
        assert.ok(size > 200, `${rel} is suspiciously small (${size} bytes) — likely truncated.`);
    }
});

test('auth callback exports a default React component', () => {
    const cb = fs.readFileSync(path.join(REPO_ROOT, 'pages/auth/callback.js'), 'utf8');
    assert.match(cb, /export\s+default\s+function/, 'callback.js must export a default function (Next.js page)');
    // It must do session resolution one way or another
    assert.ok(
        /exchangeCodeForSession|verifyOtp|getSession/.test(cb),
        'callback.js must call exchangeCodeForSession, verifyOtp, or getSession — otherwise it cannot complete auth.',
    );
});

test('every redirect target referenced in auth pages has a backing file', () => {
    for (const { route, mustExist } of AUTH_ROUTE_TARGETS) {
        const target = path.join(REPO_ROOT, mustExist);
        assert.ok(
            fs.existsSync(target),
            `Auth flow redirects to ${route} but ${mustExist} does not exist.`,
        );
    }
});
