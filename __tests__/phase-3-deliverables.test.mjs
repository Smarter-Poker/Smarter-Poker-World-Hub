/**
 * PHASE 3 — DELIVERABLES SANITY TESTS
 * ─────────────────────────────────────────────────────────────────────────
 * Asserts existence + shape of all Phase 3 artifacts:
 *   1. CODEOWNERS extended with auth-critical paths
 *   2. /admin/signup-health dashboard
 *   3. docs/SIGNUP_RUNBOOK.md
 *   4. /api/cron/email-deliverability-check
 *   5. scripts/chaos-signup-drill.sh
 *   6. /api/cron/archive-signup-errors
 *   7. signup_errors_archive table + archive_signup_errors RPC (verified
 *      in the e2e SQL test, not here)
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('CODEOWNERS lists every auth-critical path', () => {
    const src = read('.github/CODEOWNERS');
    for (const p of [
        '/pages/auth/',
        '/pages/api/auth/',
        '/middleware.ts',
        '/config/geo-blocks.json',
        '/src/lib/supabase.ts',
        '/__tests__/auth-routes-exist.test.mjs',
        '/pages/api/cron/signup-probe.js',
        '/docs/SIGNUP_RUNBOOK.md',
    ]) {
        assert.ok(src.includes(p), `CODEOWNERS missing ${p}`);
    }
    assert.match(src, /AUTH-CRITICAL PATHS/, 'must have explicit section header');
});

test('/admin/signup-health dashboard exists with auth gate + reads health view', () => {
    const p = 'pages/admin/signup-health.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /getServerSideProps/, 'must SSR');
    assert.match(src, /ADMIN_ROUTE_SECRET|x-admin-secret|is_admin/i, 'must have an admin gate');
    assert.match(src, /signup_health_view/, 'must read signup_health_view');
    assert.match(src, /probe_heartbeats/, 'must read probe_heartbeats');
    assert.match(src, /signup_errors/, 'must read signup_errors');
});

test('SIGNUP_RUNBOOK.md covers every alert type we have', () => {
    const p = 'docs/SIGNUP_RUNBOOK.md';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    for (const alert of [
        'signup_probe_failed',
        'signup_probe_stalled',
        'trigger_audit_failed',
        'signup_conversion_drop',
        'email_deliverability_failed',
        'total signup outage',
    ]) {
        assert.ok(src.toLowerCase().includes(alert.toLowerCase()), `runbook missing entry for ${alert}`);
    }
    assert.match(src, /\/admin\/signup-health/, 'runbook must point at the dashboard');
    assert.match(src, /\/auth\/quick/, 'runbook must mention the backup signup page');
});

test('/api/cron/email-deliverability-check checks SPF + DKIM + Resend domain', () => {
    const p = 'pages/api/cron/email-deliverability-check.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /Resend/, 'must check Resend domain');
    assert.match(src, /SPF/, 'must check SPF');
    assert.match(src, /DKIM/, 'must check DKIM');
    assert.match(src, /probe_heartbeats/, 'must heartbeat');

    // The SPF check must look for Resend on send.<domain>, NOT on the root.
    // Resend sends via Amazon SES and uses send.<domain> as the Return-Path,
    // which is what SPF actually validates. The original check demanded
    // include:spf.resend.com on the ROOT, so it failed every day
    // (2026-08-15/16/17 in probe_heartbeats) against DNS that was correct -
    // a daily 503 and retired error provider alert on the very channel meant to warn that
    // signup mail has broken. Worse, satisfying it would have meant adding
    // include:amazonses.com to the root, authorising all of Amazon SES to
    // send as @smarter.poker. Pinned so nobody "fixes" it back.
    assert.match(
        src,
        /name=send\.\$\{DOMAIN\}/,
        'SPF check must query send.<DOMAIN> - Resend puts its SPF on the Return-Path subdomain, not the root',
    );
    assert.match(
        src,
        /include:amazonses/i,
        'SPF check must accept include:amazonses.com - that is what Resend actually provisions',
    );
});

test('scripts/chaos-signup-drill.sh exists, executable, exercises all known failure modes', () => {
    const p = 'scripts/chaos-signup-drill.sh';
    assert.ok(exists(p), `${p} missing`);
    const stat = fs.statSync(path.join(REPO, p));
    assert.ok(stat.mode & 0o100, 'must be executable');
    const src = read(p);
    for (const drill of [
        'callback.js deleted',
        'signup.js truncated',
        'removed from BOTH',
        'reverted to bare signUp',
        'signup-probe.js deleted',
        'hardening test deleted',
    ]) {
        assert.ok(src.includes(drill), `chaos drill missing scenario: ${drill}`);
    }
});

test('/api/cron/archive-signup-errors calls archive_signup_errors RPC', () => {
    const p = 'pages/api/cron/archive-signup-errors.js';
    assert.ok(exists(p), `${p} missing`);
    const src = read(p);
    assert.match(src, /archive_signup_errors/, 'must call the archival RPC');
    assert.match(src, /older_than_days/, 'must pass retention parameter');
    assert.match(src, /validateCronAuth/, 'must auth via cron secret');
});


for (const baseline of ['failed', 'empty', 'skipped']) {
    test(`signup chaos drill refuses the ${baseline} clean baseline before injecting faults`, () => {
        const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'signup-drill-baseline-'));
        try {
            fs.mkdirSync(path.join(fixture, 'scripts'));
            fs.mkdirSync(path.join(fixture, 'bin'));
            fs.writeFileSync(path.join(fixture, 'scripts/chaos-signup-drill.sh'), read('scripts/chaos-signup-drill.sh'));
            // No application is copied or changed. Only the real shell control
            // flow runs; the test runner reports a controlled broken baseline.
            fs.writeFileSync(path.join(fixture, 'bin/rsync'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
            fs.writeFileSync(path.join(fixture, 'bin/node'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CHAOS_TEST_CALLS"
printf '# tests ${baseline === 'empty' ? 0 : 1}\\n# pass 0\\n# fail ${baseline === 'failed' ? 1 : 0}\\n'
exit ${baseline === 'failed' ? 1 : 0}
`, { mode: 0o755 });
            const calls = path.join(fixture, 'calls.txt');
            const result = spawnSync('bash', [path.join(fixture, 'scripts/chaos-signup-drill.sh')], {
                encoding: 'utf8', timeout: 10000,
                env: { ...process.env, PATH: `${path.join(fixture, 'bin')}:${process.env.PATH}`, CHAOS_TEST_CALLS: calls },
            });
            assert.equal(result.error, undefined);
            assert.equal(result.status, 1, result.stdout + result.stderr);
            assert.match(result.stdout, /BASELINE FAILED/);
            assert.doesNotMatch(result.stdout, /DETECTED|DRILL 1:/);
            const commands = fs.readFileSync(calls, 'utf8').trim().split('\n');
            assert.equal(commands.length, 1, 'must stop before any injected-fault execution');
            assert.match(commands[0], /--experimental-vm-modules --test --test-reporter=tap/);
        } finally {
            fs.rmSync(fixture, { recursive: true, force: true });
        }
    });
}
