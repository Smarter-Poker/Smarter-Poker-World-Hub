/**
 * PHASE 4 — DELIVERABLES SANITY TESTS
 * ─────────────────────────────────────────────────────────────────────────
 * Asserts:
 *   1. /api/cron/auth-integrity-audit exists, calls audit + heal RPCs
 *   2. /api/cron/login-probe exists, signs in as the permanent probe user
 *   3. /api/cron/recovery-probe exists, exercises resetPasswordForEmail + signInWithOtp
 *   4. /admin/auth-health dashboard reads auth_health_view
 *
 * Items 2 and 3 also assert MAU safety: the probes must NOT create or delete
 * users per run. See the block comment above those tests for why that costs
 * real money.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/**
 * Strip comments before asserting that a call is ABSENT.
 *
 * These probe files document the behaviour they deliberately removed, e.g.
 * signup-probe.js says "The previous version called
 * admin.auth.admin.createUser() on every invocation". A naive negative
 * assertion would match that sentence and fail on the very comment explaining
 * why the code is correct.
 *
 * Two things this must NOT do, both found by writing it wrong first:
 *   - Delete the whole line. `^[^\n]*?\/\/.*$` looks right but removes the code
 *     preceding a trailing comment, which silently ate
 *     `shouldCreateUser: false, // user already exists` and failed the very
 *     assertion that line satisfies.
 *   - Truncate at the `//` in a URL. Hence the (^|[^:]) guard, so `https://`
 *     inside a string literal survives.
 */
const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('/api/cron/auth-integrity-audit calls audit + heal RPCs', () => {
    const p = 'pages/api/cron/auth-integrity-audit.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /audit_auth_integrity/, 'must call audit_auth_integrity RPC');
    assert.match(src, /heal_auth_integrity/, 'must support heal mode via heal_auth_integrity RPC');
    assert.match(src, /real_orphans/, 'must distinguish real vs system orphans');
    assert.match(src, /probe_heartbeats/, 'must heartbeat');
});

// ─── MAU SAFETY ────────────────────────────────────────────────────────────
// These two tests used to require createUser/deleteUser, matching the probes'
// original design: create a throwaway user every run, then delete it.
//
// That design was removed on 2026-05-18 because it was expensive. Supabase
// bills Monthly Active Users, and both a createUser and a unique
// signInWithPassword register as one. Run on a cron, the three auth probes
// were manufacturing roughly 8,640 + 5,760 + 2,880 synthetic MAU per month
// against a real invoice. They now reuse PERMANENT probe accounts driven by
// PROBE_LOGIN_EMAIL / PROBE_RECOVERY_EMAIL / PROBE_SIGNUP_USER_ID and never
// write to auth.users at all.
//
// The tests were never updated, so they kept asserting the deleted
// architecture and failed on every run — which is what left CHECK 8 red.
//
// Rather than delete the assertions, they are inverted: the ABSENCE of
// per-run user creation is now the property being protected. Reintroducing
// createUser here would silently restore a recurring bill, and that is
// exactly the kind of regression a guard should catch.
// ───────────────────────────────────────────────────────────────────────────

test('/api/cron/login-probe signs in as a permanent probe user and stays MAU-safe', () => {
    const p = 'pages/api/cron/login-probe.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    const code = stripComments(src);
    assert.match(src, /signInWithPassword/, 'must sign in via password (the actual flow)');
    assert.match(src, /getUser|getuser/, 'must verify the session JWT works');
    assert.match(src, /probe\.smarter\.poker/, 'must use the probe domain');
    assert.doesNotMatch(
        code, /admin\.auth\.admin\.createUser\s*\(|admin\.createUser\s*\(/,
        'MAU-safety regression: login-probe must NOT create a user per run — reuse the permanent probe account (PROBE_LOGIN_EMAIL).',
    );
    assert.doesNotMatch(
        code, /admin\.auth\.admin\.deleteUser\s*\(/,
        'MAU-safety regression: login-probe must NOT delete users — the probe account is permanent by design.',
    );
});

test('/api/cron/recovery-probe exercises resetPasswordForEmail AND signInWithOtp, MAU-safely', () => {
    const p = 'pages/api/cron/recovery-probe.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    const code = stripComments(src);
    assert.match(src, /resetPasswordForEmail/, 'must test password reset request');
    assert.match(src, /signInWithOtp/, 'must test magic link request');
    assert.match(src, /password_reset.*flows|flows.*password_reset/s, 'must report status per flow');
    assert.match(
        code, /shouldCreateUser\s*:\s*false/,
        'MAU-safety: signInWithOtp must pass shouldCreateUser:false, or the magic-link probe silently creates a new billable user each run.',
    );
    assert.doesNotMatch(
        code, /admin\.auth\.admin\.(createUser|deleteUser)\s*\(/,
        'MAU-safety regression: recovery-probe must NOT create or delete users — it reuses PROBE_RECOVERY_EMAIL.',
    );
});

test('/admin/auth-health dashboard reads auth_health_view', () => {
    const p = 'pages/admin/auth-health.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /auth_health_view/, 'must read auth_health_view');
    assert.match(src, /probe_heartbeats/, 'must show heartbeats');
    assert.match(src, /signup|login|recovery|integrity|email/i, 'must reference all auth flows');
    assert.match(src, /is_admin|ADMIN_ROUTE_SECRET/, 'must have admin gate');
});

test('Phase 4 cron handlers all use validateCronAuth', () => {
    for (const p of [
        'pages/api/cron/auth-integrity-audit.js',
        'pages/api/cron/login-probe.js',
        'pages/api/cron/recovery-probe.js',
    ]) {
        const src = read(p);
        assert.match(src, /validateCronAuth/, `${p} must validate cron secret`);
    }
});
