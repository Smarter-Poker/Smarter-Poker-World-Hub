// LAW: a reported API error names the route that raised it.
//
// 2026-11-26: Vercel's only runtime error group on hub-vanguard (97 events in
// 24 h, "Marketplace health degraded: printful") logged route 'unknown',
// although the cron passed { route: '/api/cron/marketplace-health' }.
// reportApiError() read only req.url, so all 73 call sites that pass a
// diagnostics context instead of the request were logged without a route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reportApiError } from '../vendor/commander-shared/src/lib/apiErrorHandler.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function capture(fn) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try { fn(); } finally { console.error = original; }
  return calls;
}

test('a diagnostics context names its route', () => {
  const [[tag, entry]] = capture(() => reportApiError(
    new Error('Marketplace health degraded: printful'),
    { route: '/api/cron/marketplace-health', failedDependencies: 'printful', confirmed: true },
  ));
  assert.equal(tag, '[API Error]');
  assert.equal(entry.route, '/api/cron/marketplace-health');
  assert.equal(entry.message, 'Marketplace health degraded: printful');
  // Only the summary is logged, never the rest of the context.
  assert.deepEqual(Object.keys(entry).sort(), ['message', 'method', 'name', 'route']);
});

test('a request still logs its path without the query string', () => {
  const [[, entry]] = capture(() => reportApiError(new Error('x'), { url: '/api/a?token=secret', method: 'POST' }));
  assert.equal(entry.route, '/api/a');
  assert.equal(entry.method, 'POST');
});

test('an absent or malformed route stays unknown', () => {
  for (const ctx of [undefined, null, {}, { route: 42 }, { route: 'not-a-path' }]) {
    const [[, entry]] = capture(() => reportApiError(new Error('x'), ctx));
    assert.equal(entry.route, 'unknown');
  }
  const [[, long]] = capture(() => reportApiError(new Error('x'), { route: `/${'a'.repeat(500)}?q=1` }));
  assert.ok(long.route.length <= 200 && !long.route.includes('?'));
});

test('the context call shape this law protects is in use', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(?:[cm]?js|ts)$/.test(name)) files.push(full);
    }
  };
  walk(join(ROOT, 'pages', 'api'));
  const contextCalls = files.filter((f) => /reportApiError\([^,()]+,\s*\{\s*\n?\s*route:\s*['"`]\//.test(readFileSync(f, 'utf8')));
  assert.ok(contextCalls.length >= 10, `expected context-form callers, found ${contextCalls.length}`);
});
