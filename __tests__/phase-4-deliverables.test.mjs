/**
 * PHASE 4 — DELIVERABLES SANITY TESTS
 * ─────────────────────────────────────────────────────────────────────────
 * Asserts:
 *   1. /api/cron/auth-integrity-audit exists, calls audit + heal RPCs
 *   2. /api/cron/login-probe exists, exercises createUser + signIn + getUser
 *   3. /api/cron/recovery-probe exists, exercises resetPasswordForEmail + signInWithOtp
 *   4. /admin/auth-health dashboard reads auth_health_view
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('/api/cron/auth-integrity-audit calls audit + heal RPCs', () => {
    const p = 'pages/api/cron/auth-integrity-audit.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /audit_auth_integrity/, 'must call audit_auth_integrity RPC');
    assert.match(src, /heal_auth_integrity/, 'must support heal mode via heal_auth_integrity RPC');
    assert.match(src, /real_orphans/, 'must distinguish real vs system orphans');
    assert.match(src, /probe_heartbeats/, 'must heartbeat');
});

test('/api/cron/login-probe exercises createUser + signInWithPassword + getUser', () => {
    const p = 'pages/api/cron/login-probe.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /admin\.createUser|admin\.auth\.admin\.createUser/, 'must create probe user');
    assert.match(src, /signInWithPassword/, 'must sign in via password (the actual flow)');
    assert.match(src, /getUser|getuser/, 'must verify session JWT works');
    assert.match(src, /deleteUser/, 'must clean up');
    assert.match(src, /probe\.smarter\.poker/, 'must use probe domain for safe cleanup');
});

test('/api/cron/recovery-probe exercises resetPasswordForEmail AND signInWithOtp', () => {
    const p = 'pages/api/cron/recovery-probe.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /resetPasswordForEmail/, 'must test password reset request');
    assert.match(src, /signInWithOtp/, 'must test magic link request');
    assert.match(src, /password_reset.*flows|flows.*password_reset/s, 'must report status per flow');
    assert.match(src, /deleteUser/, 'must clean up probe users');
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
