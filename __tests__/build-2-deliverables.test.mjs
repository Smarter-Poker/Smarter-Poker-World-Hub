/**
 * BUILD 2 — DELIVERABLES SANITY TESTS
 * ─────────────────────────────────────────────────────────────────────────
 * Verifies all the new files added in the 2026-05-03 second-build pass:
 *   1. .github/workflows/preview-signup-gate.yml
 *   2. .github/workflows/sentinel-tripwire.yml
 *   3. playwright.preview.config.ts
 *   4. e2e/signup-real.spec.ts
 *   5. pages/auth/quick.js
 *   6. pages/api/auth/quick-signup.js
 *   7. pages/api/cron/trigger-audit.js
 *   8. pages/api/cron/signup-probe-restricted.js
 *   9. src/lib/auth/sdk.js
 *  10. .github/pull_request_template.md (extended)
 *
 * If any of these files is missing or has the wrong shape, future agents
 * (or autofix bots) will get loud failures instead of silent regressions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const sizeOf = (rel) => fs.statSync(path.join(REPO, rel)).size;

// CHECK 8 already executes this file. Required checks must stay on local
// compute even when repository variables are missing or changed.
for (const [workflow, jobs] of Object.entries({
    'build-safety-gate': 3,
    'no-conflict-markers': 1,
    'undefined-identifier-guard': 1,
    'audit-marker-guard': 1,
    'supabase-invariants': 3,
})) {
    test(`required workflow ${workflow} is confined to local ARM64 runners`, () => {
        const src = read(`.github/workflows/${workflow}.yml`);
        const selectors = [...src.matchAll(/^ +runs-on:[ \t]*(.+)$/gm)];
        assert.equal(selectors.length, jobs, `${workflow}: preserve every existing job`);
        for (const [, selector] of selectors) {
            assert.equal(selector.trim(), '[self-hosted, smarter-local-linux-arm64]',
                `${workflow}: no hosted fallback or variable-controlled runner selection`);
        }
    });
}

test('preview-signup-gate workflow exists and is non-trivial', () => {
    const p = '.github/workflows/preview-signup-gate.yml';
    assert.ok(exists(p), `${p} missing — preview-deploy gate disabled`);
    const src = read(p);
    assert.ok(src.includes('deployment_status'), 'must trigger on deployment_status');
    assert.ok(src.includes('signup-real.spec.ts'), 'must run the real e2e spec');
    assert.ok(src.includes('/api/health/signup'), 'must hit health probe');
});

test('sentinel-tripwire workflow watches all auth-critical paths', () => {
    const p = '.github/workflows/sentinel-tripwire.yml';
    assert.ok(exists(p));
    const src = read(p);
    for (const watched of [
        'pages/auth/**',
        'pages/api/auth/**',
        'middleware.ts',
        'config/geo-blocks.json',
    ]) {
        assert.ok(src.includes(watched), `tripwire must watch ${watched}`);
    }
});

test('playwright.preview.config.ts uses PREVIEW_URL', () => {
    const p = 'playwright.preview.config.ts';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    // env.PREVIEW_URL OR process.env.PREVIEW_URL (may use either)
    assert.ok(/PREVIEW_URL/.test(src), `must reference PREVIEW_URL env var. Source begins: ${src.slice(0, 200)}`);
    assert.ok(/signup-real/.test(src), `must run the signup-real spec. Source: ${src.slice(0, 300)}`);
});

test('e2e/signup-real.spec.ts exercises geo-block + health + real signup', () => {
    const src = read('e2e/signup-real.spec.ts');
    assert.match(src, /jurisdiction-blocked/, 'must check geo-block did not redirect');
    assert.match(src, /\/api\/health\/signup/, 'must check health endpoint');
    assert.match(src, /probe\.smarter\.poker/, 'must use the probe domain for cleanup');
});

test('/auth/quick page is independent of main auth bundle', () => {
    const src = read('pages/auth/quick.js');
    // Strip comments before checking — we explicitly mention analytics/HIBP
    // in comments to document what we're avoiding.
    const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // /* block */
        .replace(/^\s*\/\/.*$/gm, '')       // // line
        .replace(/^\s*\*.*$/gm, '');        //  * doc-comment continuation
    assert.doesNotMatch(code, /from\s+['"][^'"]*passwordStrength/, 'quick MUST NOT import HIBP/passwordStrength check');
    assert.doesNotMatch(code, /from\s+['"][^'"]*analytics/, 'quick MUST NOT import analytics module');
    assert.doesNotMatch(code, /from\s+['"][^'"]*\/stores\//, 'quick MUST NOT import Zustand stores');
    assert.doesNotMatch(code, /from\s+['"][^'"]*lib\/supabase/, 'quick MUST NOT import the main supabase client (uses raw fetch via API route)');
    assert.match(src, /\/api\/auth\/quick-signup/, 'must POST to its own endpoint');
});

test('/api/auth/quick-signup is rate-limited and validates input', () => {
    const src = read('pages/api/auth/quick-signup.js');
    assert.match(src, /applyRateLimit/, 'must rate-limit');
    assert.match(src, /password.*length\s*<\s*10/, 'must enforce min password length');
    assert.match(src, /enumeration/i, 'must defend against account enumeration');
});

test('/api/cron/trigger-audit calls signup_audit_check RPC', () => {
    const src = read('pages/api/cron/trigger-audit.js');
    assert.match(src, /signup_audit_check/);
    assert.match(src, /validateCronAuth/);
    assert.match(src, /probe_heartbeats/);
});

test('/api/cron/signup-probe-restricted checks all auth paths × restricted states', () => {
    const src = read('pages/api/cron/signup-probe-restricted.js');
    assert.match(src, /jurisdiction-blocked/);
    for (const state of ['WA', 'UT', 'LA', 'ID', 'MT', 'SD', 'IN', 'MI', 'MS', 'TN']) {
        assert.ok(src.includes(`'${state}'`), `must include state ${state}`);
    }
});

test('src/lib/auth/sdk.js signupUser() normalizes errors', () => {
    const src = read('src/lib/auth/sdk.js');
    assert.match(src, /export\s+(async\s+)?function\s+signupUser/);
    assert.match(src, /enumeration_avoided/);
    assert.match(src, /weak_password/);
    assert.match(src, /rate_limit/);
});

test('PR template includes auth-critical checklist', () => {
    const src = read('.github/pull_request_template.md');
    assert.match(src, /Auth-Critical Path Checklist/);
    assert.match(src, /signup-hardening/);
    assert.match(src, /docs\/SIGNUP_RUNBOOK\.md/);
});
