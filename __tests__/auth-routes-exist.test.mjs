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
];

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
