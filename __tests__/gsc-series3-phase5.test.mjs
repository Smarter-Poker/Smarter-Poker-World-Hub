import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIndexNowKey,
  submitToIndexNow,
  submitToGoogleIndexing,
  notifyEventIndexing,
  INDEXNOW_ENDPOINTS,
  SITE_ORIGIN,
} from '../src/lib/seo/indexingService.mjs';

test('Phase 5: notifyEventIndexing formats tournament and series URLs properly', async () => {
  const res = await notifyEventIndexing({
    seriesId: 'wsop-2026',
    venueId: 'bellagio-101',
    eventType: 'weekend',
    dryRun: true,
  });

  assert.ok(res);
  assert.equal(res.urls.length, 3);
  assert.ok(res.urls.includes('/hub/series/wsop-2026'));
  assert.ok(res.urls.includes('/hub/venues/bellagio-101'));
  assert.ok(res.urls.includes('/hub/tournaments/this-weekend'));
  assert.equal(res.indexNow.ok, true);
  assert.equal(res.indexNow.dryRun, true);
  assert.equal(res.google.length, 3);
  assert.equal(res.google[0].dryRun, true);
});

test('Phase 5: notifyEventIndexing with eventType="daily" includes /hub/daily-tournaments', async () => {
  const res = await notifyEventIndexing({
    eventType: 'daily',
    dryRun: true,
  });

  assert.ok(res);
  assert.deepEqual(res.urls, ['/hub/daily-tournaments']);
  assert.equal(res.indexNow.count, 1);
  assert.equal(res.indexNow.payload.urlList[0], 'https://smarter.poker/hub/daily-tournaments');
});

test('Phase 5: submit-indexing webhook handles tournament_updated and event_type flags', async () => {
  const handler = (await import('../pages/api/seo/submit-indexing.js')).default;
  let statusResult = 200;
  let jsonResult = null;

  const req = {
    method: 'POST',
    headers: {},
    body: {
      tournament_updated: true,
      event_type: 'calendar',
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
  assert.equal(jsonResult.submitted_count, 3);
  assert.ok(jsonResult.urls.includes('https://smarter.poker/hub/daily-tournaments'));
  assert.ok(jsonResult.urls.includes('https://smarter.poker/hub/tournaments/this-weekend'));
  assert.ok(jsonResult.urls.includes('https://smarter.poker/hub/events-calendar'));
});
