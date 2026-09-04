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
const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

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


// ═══════════════════════════════════════════════════════════════════════════
// Added 2026-09-04 after a full audit. Every test above this line passed while
// the World Hub browser was reporting NOTHING: the two widest capture sites
// read `window.Sentry`, a global @sentry/nextjs v10 does not define and which
// nothing in this repo assigns, and `beforeSend` discarded every
// ReferenceError. The suite was named "sentry-coverage" and asserted the
// presence of seven signup-flow files. Its green check is why the state looked
// healthy for as long as it did.
//
// These assert the failure modes that actually happened.
// ═══════════════════════════════════════════════════════════════════════════

test('no capture site depends on a `window.Sentry` global that does not exist', () => {
  // @sentry/nextjs v8+ does NOT attach itself to window. A capture guarded on
  // window.Sentry is not a fallback - it is an unconditional no-op. Import the
  // SDK instead; the bundler resolves it and the call actually fires.
  const offenders = [];
  const roots = ['src', 'pages'];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      // A capture/metric CALL through the dead global. Mentioning it in a
      // comment (to explain why it is dead) is fine.
      const re = /window\.(?:__SENTRY__|Sentry)\s*(?:\?\.)?\s*\.?\s*(?:captureException|captureMessage|captureEvent|metrics)/g;
      for (const line of src.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        if (re.test(line)) offenders.push(`${path.relative(REPO_ROOT, full)}: ${trimmed.slice(0, 90)}`);
        re.lastIndex = 0;
      }
    }
  };
  for (const r of roots) walk(path.join(REPO_ROOT, r));
  assert.deepEqual(
    offenders, [],
    'These capture through `window.Sentry` / `window.__SENTRY__`, which are never defined, ' +
    'so they report nothing:\n  ' + offenders.join('\n  '),
  );
});

test('beforeSend does not discard every ReferenceError', () => {
  // The blanket `msg.includes('is not defined')` and
  // /^ReferenceError: \w+ is not defined$/ dropped the entire ReferenceError
  // class - which is exactly what minified bundles throw. Filtering the six
  // KNOWN stale-chunk identifiers by name is correct; filtering the class is
  // throwing away the bugs along with the noise.
  const cfg = fs.readFileSync(path.join(REPO_ROOT, 'sentry.client.config.js'), 'utf8');
  const live = cfg.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');

  assert.ok(
    !/includes\(\s*['"]is not defined['"]\s*\)/.test(live),
    "beforeSend must not drop every message containing 'is not defined' - that is the whole " +
    'ReferenceError class. Filter the known stale-chunk identifiers by name instead.',
  );
  assert.ok(
    !/\/\^ReferenceError: *\\w\+ is not defined\$\//.test(live),
    'ignoreErrors must not carry a blanket ReferenceError regex.',
  );
  assert.ok(
    !/includes\(\s*['"]aborted['"]\s*\)/.test(live),
    "A bare includes('aborted') also matches real failures like 'payment aborted'. " +
    'AbortError is already matched by name.',
  );
});

test('both error boundaries import the SDK and report through it', () => {
  for (const f of [
    'src/components/ui/PageErrorBoundary.jsx',
    'src/components/ui/HubErrorBoundary.jsx',
  ]) {
    const src = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
    assert.match(src, /from ['"]@sentry\/nextjs['"]/, `${f} must import the SDK directly`);
    assert.match(src, /Sentry\.captureException/, `${f} must actually capture`);
  }
});

test('the global error catcher reports uncaught errors and unhandled rejections', () => {
  // This is the broadest client capture surface in the app: everything React
  // error boundaries structurally cannot see - event handlers, async code,
  // promise rejections. It reported nothing at all until 2026-09-04.
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'src/components/ui/GlobalErrorCatcher.jsx'), 'utf8');
  assert.match(src, /from ['"]@sentry\/nextjs['"]/, 'must import the SDK, not read a global');
  const captures = src.match(/Sentry\.captureException/g) || [];
  assert.ok(
    captures.length >= 2,
    `expected both the uncaught-error and unhandled-rejection paths to capture; found ${captures.length}`,
  );
});
