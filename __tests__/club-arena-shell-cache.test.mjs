import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
