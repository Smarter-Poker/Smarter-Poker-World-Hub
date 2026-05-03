/**
 * SIGNUP HARDENING — STATIC GUARD TESTS
 * ─────────────────────────────────────────────────────────────────────────
 * Catches regressions in the 2026-05-03 signup-failure investigation.
 * Run via the same `node --test` invocation in build-safety-gate.yml.
 *
 *   1. /auth/* and /api/auth/* MUST be reachable from every region:
 *      either present in geo-blocks.json allow_paths OR in middleware.ts
 *      AUTH_ALWAYS_ALLOW. Both is best.
 *   2. /api/health/signup must exist and query signup_health_view.
 *   3. /api/cron/signup-probe must exist and exercise full signup flow.
 *   4. login.js handleSignup must call validatePassword OR redirect to
 *      /auth/signup OR be removed entirely.
 *   5. signup.js handleOAuthSignIn must address www→apex PKCE-verifier
 *      scope, or comment why not.
 *
 * If any check fails, signup is at risk of regressing into the
 * silent-failure mode that bricked it from 2026-04-24 to 2026-05-03.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('geo-block JSON OR middleware.ts allow /auth/ and /api/auth/', () => {
    const json = JSON.parse(read('config/geo-blocks.json'));
    const mw = read('middleware.ts');
    const inJson = (p) => (json.allow_paths || []).some((a) => a === p || a.startsWith(p));
    const inMw = (p) => mw.includes(`'${p}'`) || mw.includes(`"${p}"`);
    for (const p of ['/auth/', '/api/auth/']) {
        assert.ok(
            inJson(p) || inMw(p),
            `${p} is missing from BOTH geo-blocks.json allow_paths AND middleware.ts AUTH_ALWAYS_ALLOW. ` +
            `Users in restricted regions will be redirected to /jurisdiction-blocked before they can sign up.`,
        );
    }
});

test('/api/health/signup endpoint exists and is non-trivial', () => {
    const p = path.join(REPO_ROOT, 'pages/api/health/signup.js');
    assert.ok(fs.existsSync(p), '/api/health/signup is missing — the probe has nothing to talk to.');
    assert.ok(fs.statSync(p).size > 500, '/api/health/signup is suspiciously small — likely truncated.');
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /signup_health_view/, 'health endpoint must query signup_health_view');
});

test('/api/cron/signup-probe endpoint exists and exercises full signup flow', () => {
    const p = path.join(REPO_ROOT, 'pages/api/cron/signup-probe.js');
    assert.ok(fs.existsSync(p), '/api/cron/signup-probe is missing — the synthetic probe is the early-warning system.');
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /supabase\.auth\.signUp|anon\.auth\.signUp/, 'probe must call signUp');
    assert.match(src, /admin\.auth\.admin\.deleteUser/, 'probe must clean up its test user');
    assert.match(src, /profiles|user_diamonds|wallets/, 'probe must verify downstream trigger rows');
});

test('login.js handleSignup is hardened (validatePassword OR redirect to /auth/signup)', () => {
    const src = read('pages/auth/login.js');
    const m = src.match(/const handleSignup = async[^{]*\{([\s\S]*?)^\s{4}\};/m);
    if (!m) return; // handler removed — acceptable
    const body = m[1];
    const hasValidate = /validatePassword/.test(body);
    const redirectsToCanonical = /router\.push\(['"]\/auth\/signup['"]/.test(body);
    assert.ok(
        hasValidate || redirectsToCanonical,
        'login.js handleSignup must either call validatePassword (parity with /auth/signup) or router.push(/auth/signup). ' +
        'The bare signUp({email,password}) path creates accounts without metadata that crash downstream.',
    );
});

test('signup.js handleOAuthSignIn handles www → apex pre-flight', () => {
    const src = read('pages/auth/signup.js');
    const m = src.match(/handleOAuthSignIn[\s\S]*?(?=\n\s{4}\/\/|^\s{4}const )/m);
    assert.ok(m, 'handleOAuthSignIn not found');
    const handler = m[0];
    const handlesWww = /www\./.test(handler) && /location\.(replace|href|hostname)/.test(handler);
    const documented = /apex|PKCE|verifier/i.test(handler);
    assert.ok(
        handlesWww || documented,
        'handleOAuthSignIn must address www→apex PKCE-verifier scope, or comment why not.',
    );
});
