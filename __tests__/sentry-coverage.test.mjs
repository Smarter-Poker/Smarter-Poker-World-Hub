/**
 * SENTRY FREE-TIER INVARIANTS - the Hub keeps Sentry on the server, budgeted
 * ─────────────────────────────────────────────────────────────────────────
 * Rewritten 2026-09-04 for docs/SENTRY-FREE-TIER-POLICY.md. Sentry is on the
 * free Developer plan (5,000 errors a month shared by three projects). This
 * file used to assert that client, server AND edge configs existed; it now
 * asserts the opposite for two of them, and that the one that remains cannot
 * exceed its share:
 *   - no client config, no edge config, no client instrumentation file
 *   - nothing in the browser bundle reads window.Sentry or the public DSN
 *   - the server config has every sample rate at 0 and a daily budget
 *   - the budget is fail-closed and lives in Postgres (shared by lambdas)
 *   - middleware.ts reports through the Node route, not an edge SDK
 *   - the server-side auth bridges that survive still exist
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            walk(rel, out);
        } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
            out.push(rel);
        }
    }
    return out;
}

test('client and edge Sentry configs are GONE and stay gone', () => {
    assert.equal(exists('sentry.client.config.js'), false, 'sentry.client.config.js must not exist (policy section 3)');
    assert.equal(exists('sentry.edge.config.js'), false, 'sentry.edge.config.js must not exist (policy section 3)');
    assert.equal(exists('src/instrumentation-client.js'), false, 'client instrumentation must not exist');
    assert.equal(exists('src/lib/sentry.js'), false, 'src/lib/sentry.js was deleted (policy section 5)');
    assert.equal(exists('utils/logger.ts'), false, 'utils/logger.ts was deleted (policy section 5)');
    assert.equal(exists('pages/api/clawbot/sentry-triage.js'), false, 'sentry-triage was deleted (policy section 5)');
    assert.ok(exists('sentry.server.config.js'), 'server config must exist');
});

test('src/instrumentation.js loads the server config only', () => {
    const src = read('src/instrumentation.js');
    assert.match(src, /sentry\.server\.config/, 'must import the server config');
    assert.doesNotMatch(src, /sentry\.edge\.config/, 'must not import an edge config');
    assert.doesNotMatch(src, /sentry\.client\.config/, 'must not import a client config');
});

test('nothing in the browser-facing tree reads window.Sentry or NEXT_PUBLIC_SENTRY_DSN', () => {
    const offenders = [];
    for (const rel of [...walk('src'), ...walk('pages')]) {
        if (rel.startsWith('pages/api/')) continue; // server only
        const src = read(rel);
        if (/window\.Sentry\b/.test(src)) offenders.push(`${rel}: window.Sentry`);
        if (/NEXT_PUBLIC_SENTRY_DSN/.test(src)) offenders.push(`${rel}: NEXT_PUBLIC_SENTRY_DSN`);
        // A static SDK import in a component or page is a client-bundle cost with
        // nothing to send to. The remaining server-only uses are dynamic or guarded.
        if (!rel.startsWith('src/lib/') && !rel.startsWith('src/instrumentation') && /^import \* as Sentry from '@sentry\/nextjs'/m.test(src)) {
            offenders.push(`${rel}: static @sentry/nextjs import`);
        }
    }
    assert.deepEqual(offenders, [], `browser Sentry references must be gone:\n${offenders.join('\n')}`);
});

test('server config: tracing/profiling/replay are 0 and beforeSend takes a budget', () => {
    const src = read('sentry.server.config.js');
    assert.match(src, /Sentry\.init\s*\(/, 'must call Sentry.init');
    assert.match(src, /SENTRY_DSN/, 'must reference SENTRY_DSN env var');
    assert.match(src, /tracesSampleRate:\s*0\b/, 'tracesSampleRate must be 0');
    assert.match(src, /profilesSampleRate:\s*0\b/, 'profilesSampleRate must be 0');
    assert.match(src, /replaysSessionSampleRate:\s*0\b/, 'replaysSessionSampleRate must be 0');
    assert.match(src, /replaysOnErrorSampleRate:\s*0\b/, 'replaysOnErrorSampleRate must be 0');
    assert.doesNotMatch(src, /tracesSampleRate:\s*(0\.\d|1)/, 'no non-zero traces sampling');
    assert.doesNotMatch(src, /Replay|BrowserTracing|browserTracingIntegration|replayIntegration/, 'no replay or tracing integrations');
    assert.match(src, /async beforeSend/, 'beforeSend must be async (it asks the shared bucket)');
    assert.match(src, /takeBudget\(/, 'beforeSend must take a budget token');
    assert.match(src, /if \(!allowed\) return null/, 'an exhausted budget drops the event');
    assert.match(src, /delete event\.request\.headers\.authorization/, 'must still scrub auth headers');
});

test('budget module: 60/day, 3 per fingerprint, fail-closed, in Postgres', async () => {
    const src = read('src/lib/sentryBudget.js');
    assert.match(src, /export const DAILY_BUDGET = 60;/);
    assert.match(src, /export const FINGERPRINT_BUDGET = 3;/);
    assert.match(src, /fn_sentry_budget_take/, 'must use the shared Postgres bucket');
    assert.doesNotMatch(src, /instanceof (ReferenceError|TypeError)|error\.name === '(ReferenceError|TypeError)'/, 'nothing is filtered by error class');

    const mod = await import('../src/lib/sentryBudget.js');
    mod._resetForTests();

    // Fail closed: RPC error -> false
    const failing = { rpc: async () => ({ data: null, error: { message: 'down' } }) };
    const origWarn = console.warn; console.warn = () => {};
    try {
        assert.equal(await mod.takeBudget({ message: 'x' }, { client: failing }), false);
        // Fail closed: RPC throws -> false
        const thrower = { rpc: async () => { throw new Error('boom'); } };
        assert.equal(await mod.takeBudget({ message: 'x' }, { client: thrower }), false);
        // Bucket says no -> false
        const no = { rpc: async () => ({ data: { allowed: false, reason: 'daily_budget', sent: 60 }, error: null }) };
        assert.equal(await mod.takeBudget({ message: 'x' }, { client: no }), false);
        // Bucket says yes -> true, and it was asked with the policy numbers
        let args = null;
        const yes = { rpc: async (fn, a) => { args = { fn, a }; return { data: { allowed: true, reason: 'ok', sent: 1 }, error: null }; } };
        assert.equal(await mod.takeBudget({ message: 'x' }, { client: yes }), true);
        assert.equal(args.fn, 'fn_sentry_budget_take');
        assert.equal(args.a.p_daily_limit, 60);
        assert.equal(args.a.p_fingerprint_limit, 3);
        assert.equal(typeof args.a.p_fingerprint, 'string');
        assert.equal(mod.droppedCount(), 3, 'three drops were counted');
    } finally {
        console.warn = origWarn;
        mod._resetForTests();
    }
});

test('budget module: fingerprints are stable across ids and honour explicit fingerprints', async () => {
    const { fingerprintOf } = await import('../src/lib/sentryBudget.js');
    const a = fingerprintOf({ exception: { values: [{ type: 'Error', value: 'row 123 not found', stacktrace: { frames: [{ filename: 'a.js', function: 'f', in_app: true }] } }] } });
    const b = fingerprintOf({ exception: { values: [{ type: 'Error', value: 'row 456 not found', stacktrace: { frames: [{ filename: 'a.js', function: 'f', in_app: true }] } }] } });
    const c = fingerprintOf({ exception: { values: [{ type: 'Error', value: 'row 456 not found', stacktrace: { frames: [{ filename: 'b.js', function: 'g', in_app: true }] } }] } });
    assert.equal(a, b, 'numbers are normalised out of the message');
    assert.notEqual(a, c, 'a different frame is a different fingerprint');
    assert.equal(fingerprintOf({ fingerprint: ['x', 'y'] }), fingerprintOf({ fingerprint: ['x', 'y'] }));
    assert.equal(typeof fingerprintOf(null), 'string');
});

test('the budget migration exists, is one transaction, and locks anon/authenticated out', () => {
    const dir = 'supabase/migrations';
    const file = fs.readdirSync(path.join(REPO, dir)).find((f) => /sentry_event_budget\.sql$/.test(f));
    assert.ok(file, 'sentry_event_budget migration missing');
    const sql = read(path.join(dir, file));
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.match(sql, /CREATE TABLE public\.sentry_event_budget/);
    assert.match(sql, /CREATE FUNCTION public\.fn_sentry_budget_take/);
    assert.match(sql, /sent < p_daily_limit\s*\n?\s*RETURNING sent/, 'atomic UPDATE ... WHERE sent < limit RETURNING');
    assert.match(sql, /REVOKE ALL ON TABLE public\.sentry_event_budget\s+FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.fn_sentry_budget_take\(text, integer, integer\) FROM PUBLIC, anon, authenticated/);
});

test('middleware.ts: gates are wrapped and report through the Node edge-error route', () => {
    const src = read('middleware.ts');
    assert.doesNotMatch(src, /createMiddlewareClient/, 'unused import removed');
    assert.doesNotMatch(src, /@sentry\//, 'no Sentry SDK at the edge');
    assert.match(src, /reportEdgeError\(request, event, 'geo-block', err\)/);
    assert.match(src, /reportEdgeError\(request, event, 'admin-guard', err\)/);
    assert.match(src, /reportEdgeError\(request, event, 'jwt-gate', err\)/);
    assert.match(src, /\/api\/internal\/edge-error/);
    assert.match(src, /x-edge-error-secret/);
    assert.match(src, /waitUntil/, 'reporting must be handed to waitUntil, never awaited in the request path');
    assert.ok(exists('pages/api/internal/edge-error.js'), 'edge-error route missing');
    const route = read('pages/api/internal/edge-error.js');
    assert.match(route, /x-edge-error-secret/);
    assert.match(route, /ADMIN_ROUTE_SECRET/);
    assert.match(route, /reportApiError\(/);
    assert.match(route, /flushSentry\(/);
});

test('the wrapper is the gate: allowlist documented in the header and enforced in code', () => {
    const src = read('vendor/commander-shared/src/lib/sentryWrap.js');
    assert.match(src, /export const SENTRY_ROUTE_ALLOWLIST/);
    assert.match(src, /isSentryAllowlisted\(routePath\)/);
    assert.match(src, /financial_alerts/);
    for (const route of ['/api/cron/rakeback-period-settle', '/api/cron/vip-stipend', '/api/cron/vip-lapse', '/api/live/gift', '/api/live/gifts', '/api/auth/', '/api/internal/edge-error']) {
        assert.ok(src.includes(`'${route}'`), `${route} must be on the allowlist`);
    }
    assert.match(read('src/lib/sentryWrap.js'), /commander-shared\/lib\/sentryWrap/, 'src re-export intact');
});

test('the six allowlisted money/auth routes call reportApiError and flush', () => {
    for (const rel of [
        'pages/api/cron/rakeback-period-settle.js',
        'pages/api/cron/vip-stipend.js',
        'pages/api/cron/vip-lapse.js',
        'pages/api/live/gift.js',
        'pages/api/live/gifts.js',
        'pages/api/auth/commander-sso.js',
    ]) {
        const src = read(rel);
        assert.match(src, /import \{ reportApiError, flushSentry \} from/, `${rel} must import the gated reporter`);
        assert.match(src, /await reportApiError\(/, `${rel} must await reportApiError`);
        assert.match(src, /await flushSentry\(\)/, `${rel} must flush before returning`);
    }
});

test('the server-side signup bridges that survive the cut still exist', () => {
    const p = 'pages/api/cron/sentry-signup-bridge.js';
    assert.ok(exists(p), `${p} missing`);
    assert.match(read(p), /signup_errors/, 'must read from signup_errors');
    const q = 'pages/api/auth/log-client-error.js';
    assert.ok(exists(q), `${q} missing`);
    assert.match(read(q), /applyRateLimit/, 'must rate-limit (anti-abuse)');
    assert.match(read(q), /ALLOWED_FLOWS/, 'must allowlist flow values');
});
