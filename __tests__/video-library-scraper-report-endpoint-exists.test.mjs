/**
 * GUARD: __tests__/video-library-scraper-report-endpoint-exists.test.mjs
 * -------------------------------------------------------------------------
 * Production Alerts Fleet, 2026-09-22/23. scripts/video_library_scraper.py's
 * report_to_api() POSTs to /api/cron/video-library-scraper?report=1 to keep
 * cron_health_log current for this job. That route did not exist - see
 * .agent/audits/2026-08-15-video-library-deep-dive.md finding F8, repeated in
 * pages/api/cron/yt-pipeline-recovery.js's own comment - so every report POST
 * 404'd, silently (the script treats the failure as non-fatal), and this job
 * never produced a single cron_health_log row.
 *
 * This test fails on the pre-fix tree (the file does not exist, so `entrypoint`
 * throws on the missing module) and passes on this commit's fix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PATH = '../pages/api/cron/video-library-scraper.js';

// Load the actual entrypoint body, replacing only external imports. This
// executes its real branching, not a copied re-implementation - same
// technique as __tests__/operational-push-routing.test.mjs.
function entrypoint(path, exported, dependencies) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8');
  source = source.replace(/^import[^\n]+;\s*$/gm, '')
    .replace(/^export default[^\n]+;\s*$/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), `${source}\nreturn ${exported};`)(...Object.values(dependencies));
}

function response() {
  return {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
  };
}

function handler() {
  return entrypoint(PATH, 'handler', {
    validateCronAuth: (req) => req.headers.authorization === 'Bearer test-secret',
    withCronHealth: (_name, fn) => fn,
  });
}

test('rejects an unauthorized request', async () => {
  const res = response();
  await handler()({ headers: {}, query: {}, method: 'GET' }, res);
  assert.equal(res.code, 401);
});

test('accepts the scraper script report POST and treats a partial-failure summary as a success', async () => {
  const res = response();
  const summary = { processed: 20, failed: 2, total_new: 14, total_found: 60, creator_results: [] };
  await handler()(
    { headers: { authorization: 'Bearer test-secret' }, query: { report: '1' }, method: 'POST', body: summary },
    res
  );
  assert.equal(res.code, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.processed, 20);
  assert.equal(res.body.failed, 2);
  assert.equal(res.body.total_new, 14);
});

test('a bare authenticated hit with no report body is a health probe, not a trigger', async () => {
  const res = response();
  await handler()({ headers: { authorization: 'Bearer test-secret' }, query: {}, method: 'GET' }, res);
  assert.equal(res.code, 200);
  assert.match(res.body.note, /reporting webhook only/);
});

test('is wrapped in withCronHealth under the cron_name the fleet and dispatcher expect', () => {
  const source = readFileSync(new URL(PATH, import.meta.url), 'utf8');
  assert.match(source, /export default withCronHealth\('video-library-scraper', handler\);/);
});
