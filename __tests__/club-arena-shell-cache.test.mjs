import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const shells = config.headers.filter((rule) =>
  rule.source === '/hub/club-arena' || rule.source.startsWith('/hub/club-arena/:path('));

test('both Club Arena shell routes bound healthy staleness and retain outage protection', () => {
  assert.equal(shells.length, 2);
  for (const rule of shells) {
    const value = rule.headers.find((header) => header.key.toLowerCase() === 'cache-control')?.value;
    assert.ok(value, rule.source);
    const policy = Object.fromEntries(value.split(',').map((item) => item.trim().split('=')));
    assert.equal(policy['max-age'], '0', rule.source);
    assert.equal(policy['s-maxage'], '60', rule.source);
    assert.equal(policy['stale-while-revalidate'], '60', rule.source);
    assert.equal(policy['stale-if-error'], '86400', rule.source);
  }
});

test('the shared immutable asset policy remains present', () => {
  assert.ok(config.headers.some((rule) => rule.source.includes('/assets/') &&
    rule.headers.some((header) => header.key.toLowerCase() === 'cache-control' &&
      header.value.includes('immutable'))));
});

test('Club Arena asset responses retain the origin status-dependent cache policy', async () => {
  const { pathToRegexp } = require('next/dist/compiled/path-to-regexp');
  // Execute the real header factory without starting the unrelated PWA build
  // plugin (which requires a webpack build environment).
  const exports = { exports: {} };
  runInNewContext(readFileSync(new URL('../next.config.js', import.meta.url), 'utf8'), {
    module: exports,
    require: (name) => name === '@ducanh2912/next-pwa'
      ? { default: () => (config) => config }
      : createRequire(new URL('../next.config.js', import.meta.url))(name),
    __dirname: fileURLToPath(new URL('..', import.meta.url)),
    process, console,
  });
  const nextConfig = exports.exports;
  const nextHeaders = await nextConfig.headers();
  const cacheRules = (rules, path) => rules.filter((rule) =>
    pathToRegexp(rule.source).test(path) &&
    rule.headers.some((header) => header.key.toLowerCase() === 'cache-control'));
  for (const path of [
    '/hub/club-arena/assets/sessionPurchaseRequest-DNrAoZb9-v6.js',
    '/hub/club-arena/assets/missing.js',
    '/hub/club-arena/assets/nested/missing.css',
  ]) {
    // The origin sends immutable for a successful hashed asset and no-store
    // for an error. A status-blind proxy override poisons both 404s and 502s.
    assert.deepEqual(cacheRules(config.headers, path), [], `Vercel overrides ${path}`);
    assert.equal(cacheRules(nextHeaders, path).length, 0, `Next overrides ${path}`);
  }
  for (const path of ['/hub/assets/chart.js', '/hub/marketplace/assets/chart.js', '/hub/other/nested/assets/chart.js',
    '/hub/club-arena-tools/assets/chart.js']) {
    assert.ok(cacheRules(config.headers, path).some((rule) =>
      rule.headers.some((header) => header.value.includes('immutable'))), path);
  }
});
