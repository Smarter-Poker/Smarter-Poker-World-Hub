import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIndexNowKey,
  submitToIndexNow,
  submitToGoogleIndexing,
  INDEXNOW_ENDPOINTS,
  SITE_ORIGIN,
} from '../src/lib/seo/indexingService.mjs';

test('getIndexNowKey correctly extracts key from public key file', () => {
  const key = getIndexNowKey();
  assert.ok(key, 'IndexNow key should exist in public/*.txt');
  assert.equal(key.length, 32, 'IndexNow key should be 32 characters hex');
  assert.match(key, /^[a-f0-9]{32}$/);
});

test('INDEXNOW_ENDPOINTS contains Bing, Yandex, Naver, and IndexNow', () => {
  assert.ok(Array.isArray(INDEXNOW_ENDPOINTS));
  assert.ok(INDEXNOW_ENDPOINTS.length >= 4);
  assert.ok(INDEXNOW_ENDPOINTS.some((ep) => ep.includes('bing.com')));
  assert.ok(INDEXNOW_ENDPOINTS.some((ep) => ep.includes('yandex.com')));
  assert.ok(INDEXNOW_ENDPOINTS.some((ep) => ep.includes('naver.com')));
  assert.ok(INDEXNOW_ENDPOINTS.some((ep) => ep.includes('api.indexnow.org')));
});

test('submitToIndexNow formats payload and performs dry run', async () => {
  const urls = [
    '/hub/series/468',
    'https://smarter.poker/hub/venues/1828',
    '/hub/series/468', // duplicate
  ];
  const res = await submitToIndexNow(urls, { dryRun: true });
  assert.equal(res.ok, true);
  assert.equal(res.count, 2, 'Should deduplicate URLs');
  assert.equal(res.dryRun, true);
  assert.equal(res.payload.host, 'smarter.poker');
  assert.deepEqual(res.payload.urlList, [
    'https://smarter.poker/hub/series/468',
    'https://smarter.poker/hub/venues/1828',
  ]);
});

test('submitToGoogleIndexing queues request or performs dry run', async () => {
  const res = await submitToGoogleIndexing('/hub/series/468', { dryRun: true });
  assert.equal(res.ok, true);
  assert.equal(res.dryRun, true);
  assert.equal(res.url, 'https://smarter.poker/hub/series/468');
  assert.equal(res.type, 'URL_UPDATED');

  // Without token it safely queues
  const queueRes = await submitToGoogleIndexing('/hub/series/468', { dryRun: false });
  assert.equal(queueRes.ok, true);
  assert.equal(queueRes.queued, true);
  assert.equal(queueRes.status, 202);
});

test('submit-indexing edge webhook handler responds accurately to POST', async () => {
  const handler = (await import('../pages/api/seo/submit-indexing.js')).default;
  let statusResult = 200;
  let jsonResult = null;

  const req = {
    method: 'POST',
    headers: {},
    body: {
      series_id: 468,
      venue_id: 1828,
      dry_run: true,
    },
  };

  const res = {
    status(code) {
      statusResult = code;
      return this;
    },
    json(data) {
      jsonResult = data;
      return this;
    },
    setHeader() {},
  };

  await handler(req, res);
  assert.equal(statusResult, 200);
  assert.equal(jsonResult.success, true);
  assert.equal(jsonResult.dry_run, true);
  assert.equal(jsonResult.submitted_count, 2);
  assert.ok(jsonResult.urls.includes('https://smarter.poker/hub/series/468'));
  assert.ok(jsonResult.urls.includes('https://smarter.poker/hub/venues/1828'));
});
