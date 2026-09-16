/**
 * SENTRY COVERAGE — verifies signup is actually being watched
 * ─────────────────────────────────────────────────────────────────────────
 * After the 2026-05-03 audit revealed:
 *   - withSentryConfig auto-instrumentation is disabled (OOM workaround)
 *   - User-facing auth pages don't explicitly call Sentry
 *   - signup_errors table has no Sentry forwarding
 *
 * These tests assert the bridge layer that compensates:
 *   - signupUser SDK explicitly captures via Sentry
 *   - /api/cron/sentry-signup-bridge exists and forwards signup_errors
 *   - /api/auth/log-client-error endpoint exists for client→server bridge
 *   - Sentry config files are present and read SENTRY_DSN
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('Sentry config files exist for all 3 runtimes', () => {
    assert.ok(exists('sentry.client.config.js'), 'client config missing');
    assert.ok(exists('sentry.server.config.js'), 'server config missing');
    assert.ok(exists('sentry.edge.config.js'), 'edge config missing');
});

test('Sentry server config initializes with DSN guard', () => {
    const src = read('sentry.server.config.js');
    assert.match(src, /Sentry\.init\s*\(/, 'must call Sentry.init');
    assert.match(src, /SENTRY_DSN/, 'must reference SENTRY_DSN env var');
    assert.match(src, /beforeSend/, 'must scrub sensitive data');
});

test('signupUser SDK captures errors via Sentry with auth.flow tag', () => {
    const src = read('src/lib/auth/sdk.js');
    assert.match(src, /@sentry\/nextjs/, 'must import @sentry/nextjs');
    assert.match(src, /sentryCaptureSignupFailure/, 'must define capture helper');
    assert.match(src, /['"]auth\.flow['"]/, 'must set auth.flow tag');
    assert.match(src, /['"]auth\.error_code['"]/, 'must set auth.error_code tag');
    // Defensive: try/catch around Sentry so signup never breaks if Sentry breaks
    assert.match(src, /try\s*{[\s\S]*Sentry\.withScope/, 'Sentry call must be in try block');
});

test('/api/cron/sentry-signup-bridge exists + forwards to Sentry', () => {
    const p = 'pages/api/cron/sentry-signup-bridge.js';
    assert.ok(exists(p), `${p} missing — DB-to-Sentry bridge disabled`);
    const src = read(p);
    assert.match(src, /signup_errors/, 'must read from signup_errors');
    assert.match(src, /forwarded_to_sentry/, 'must mark rows as forwarded');
    assert.match(src, /captureMessage/, 'must call Sentry.captureMessage');
    assert.match(src, /['"]auth\.flow['"]/, 'must tag as auth.flow');
    assert.match(src, /setFingerprint/, 'must group like errors via fingerprint');
});

test('/api/auth/log-client-error exists + has rate limiting + flow allowlist', () => {
    const p = 'pages/api/auth/log-client-error.js';
    assert.ok(exists(p), `${p} missing — client→server Sentry bridge disabled`);
    const src = read(p);
    assert.match(src, /applyRateLimit/, 'must rate-limit (anti-abuse)');
    assert.match(src, /ALLOWED_FLOWS/, 'must allowlist flow values');
    assert.match(src, /captureException/, 'must call Sentry.captureException');
    assert.match(src, /\.slice\(/, 'must truncate inputs (anti-payload-bomb)');
});

test('Sentry capture in SDK is wrapped in try/catch (never breaks signup)', () => {
    const src = read('src/lib/auth/sdk.js');
    // Find the sentryCaptureSignupFailure function and ensure its body
    // has try/catch around the Sentry calls
    const fn = src.match(/function sentryCaptureSignupFailure[^{]*\{([\s\S]*?)^\}/m);
    assert.ok(fn, 'sentryCaptureSignupFailure function not found');
    assert.match(fn[1], /try\s*\{/, 'must have try block');
    assert.match(fn[1], /catch\s*\(/, 'must have catch — never let Sentry break signup');
});

test('Sentry config in SDK falls back to no-op shim if package missing', () => {
    const src = read('src/lib/auth/sdk.js');
    assert.match(src, /try\s*\{[\s\S]*?require\(['"]@sentry\/nextjs['"]\)/, 'must require Sentry in try block');
    assert.match(src, /captureException:\s*\(\)\s*=>\s*null/, 'must have no-op fallback for captureException');
});
