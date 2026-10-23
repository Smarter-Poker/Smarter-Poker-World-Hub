/**
 * GSC & Organic Growth Series 5 — Phase 8 Tests
 * Verifies:
 *   1. Real-time IndexNow ping helper (src/lib/seo/indexNowPing.mjs) exports
 *      buildIndexNowPayload, pingIndexNow, and getIndexNowKey
 *   2. buildIndexNowPayload normalizes relative and absolute URLs, deduplicates
 *      entries, and attaches the verified 32-hex key from public/<key>.txt
 *   3. pingIndexNow supports dryRun mode and returns the verified payload
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndexNowPayload,
  pingIndexNow,
  getIndexNowKey,
  INDEXNOW_ENDPOINTS,
} from '../src/lib/seo/indexNowPing.mjs';

test('getIndexNowKey returns the verified 32-hex key from public/<key>.txt', () => {
  const key = getIndexNowKey();
  assert.ok(key, 'IndexNow key must be present');
  assert.match(key, /^[a-f0-9]{32}$/);
});

test('buildIndexNowPayload normalizes relative and absolute URLs and deduplicates entries', () => {
  const payload = buildIndexNowPayload([
    '/tools/poker-odds-calculator',
    'https://smarter.poker/tools/preflop-ranges',
    '/tools/poker-odds-calculator',
  ]);
  assert.equal(payload.host, 'smarter.poker');
  assert.match(payload.key, /^[a-f0-9]{32}$/);
  assert.equal(payload.keyLocation, `https://smarter.poker/${payload.key}.txt`);
  assert.deepEqual(payload.urlList, [
    'https://smarter.poker/tools/poker-odds-calculator',
    'https://smarter.poker/tools/preflop-ranges',
  ]);
});

test('pingIndexNow executes dryRun submission cleanly across INDEXNOW_ENDPOINTS', async () => {
  assert.ok(Array.isArray(INDEXNOW_ENDPOINTS) && INDEXNOW_ENDPOINTS.length >= 3);
  const res = await pingIndexNow(['/feed.xml', '/tools/preflop-ranges'], { dryRun: true });
  assert.equal(res.ok, true);
  assert.equal(res.dryRun, true);
  assert.equal(res.count, 2);
  assert.deepEqual(res.payload.urlList, [
    'https://smarter.poker/feed.xml',
    'https://smarter.poker/tools/preflop-ranges',
  ]);
});
