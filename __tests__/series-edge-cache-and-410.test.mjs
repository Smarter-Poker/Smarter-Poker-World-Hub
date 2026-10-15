import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchSeries,
  seriesCacheControl,
  SERIES_CACHE_ACTIVE,
  SERIES_CACHE_CONCLUDED,
} from '../src/lib/poker-near-me/seriesSeo.mjs';

const NOW = Date.parse('2026-10-15T12:00:00Z');

test('concluded series are cached for 30 days at the edge', () => {
  assert.equal(seriesCacheControl({ endDate: '2026-05-01' }, NOW), SERIES_CACHE_CONCLUDED);
  assert.match(SERIES_CACHE_CONCLUDED, /s-maxage=2592000/);
});

test('active, upcoming, just-ended and undated series keep the short window', () => {
  assert.equal(seriesCacheControl({ endDate: '2026-10-20' }, NOW), SERIES_CACHE_ACTIVE);
  assert.equal(seriesCacheControl({ endDate: '2026-10-14' }, NOW), SERIES_CACHE_ACTIVE);
  assert.equal(seriesCacheControl({ endDate: null }, NOW), SERIES_CACHE_ACTIVE);
  assert.equal(seriesCacheControl({ endDate: 'garbage' }, NOW), SERIES_CACHE_ACTIVE);
  assert.equal(seriesCacheControl(null, NOW), SERIES_CACHE_ACTIVE);
});

function withFetch(status, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ status, json: async () => ({ success: false }) });
  return fn().finally(() => { globalThis.fetch = real; });
}

test('fetchSeries maps API 410 to gone, 404 to not-found, 500 to unavailable', async () => {
  assert.equal((await withFetch(410, () => fetchSeries('5000001', 'http://x'))).status, 'gone');
  assert.equal((await withFetch(404, () => fetchSeries('5000001', 'http://x'))).status, 'not-found');
  assert.equal((await withFetch(500, () => fetchSeries('5000001', 'http://x'))).status, 'unavailable');
});
