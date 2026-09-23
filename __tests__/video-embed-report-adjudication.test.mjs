import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const ROUTE = read('../pages/api/youtube/report-embed-failure.js');
const YOUTUBE_MANAGER = read('../src/hooks/useYouTubeErrorManager.js');
const VERIFIER = read('../scripts/video_library_to_reels.py');
const MIGRATION = read('../supabase/migrations/20260906235959_video_reels_integrity_foundation.sql');

const VIDEO_ID = 'M7lc1UVf-VE';
const USER = Object.freeze({ id: '11111111-1111-4111-8111-111111111111' });
const LAST_SEEN_AT = '2026-09-20T10:00:00.123456+00:00';
const EXPECTED_OEMBED_URL =
  'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DM7lc1UVf-VE&format=json';
const PENDING_ROW = Object.freeze({
  video_id: VIDEO_ID, hit_count: 1, verification_status: 'pending', resolved: true,
});
const CONFIRMED_ROW = Object.freeze({
  video_id: VIDEO_ID, hit_count: 1, verification_status: 'confirmed', resolved: false,
});

const plain = value => JSON.parse(JSON.stringify(value));

function mockResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = plain(value); return this; },
  };
}

function oembedResponse(status) {
  let cancelled = 0;
  return {
    status,
    ok: status >= 200 && status < 300,
    body: { async cancel() { cancelled += 1; } },
    async json() { throw new Error('the route must never read the oEmbed body'); },
    async text() { throw new Error('the route must never read the oEmbed body'); },
    cancelledCount: () => cancelled,
  };
}

function loadRoute({
  user = USER,
  rateLimited = false,
  assetRow = { id: 'asset-1' },
  reelRow = null,
  reportRow = PENDING_ROW,
  reportError = null,
  failureRow = { verification_status: 'pending', resolved: true, last_seen_at: LAST_SEEN_AT },
  anchorError = null,
  verdictRow = CONFIRMED_ROW,
  verdictError = null,
  fetchImpl = async () => oembedResponse(200),
  fireTimers = false,
} = {}) {
  const transformed = ROUTE
    .replace(/^import(?:[\s\S]*?)from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export default async function handler', 'async function handler');
  assert.doesNotMatch(transformed, /^\s*import\s/m, 'every import must be replaced by an injected seam');

  const calls = {
    order: [], fetch: [], rpc: [], tables: [], logs: [], timers: [], cleared: [], clients: 0,
  };
  const supabase = {
    from(table) {
      const state = { table, filters: [] };
      const query = {
        select(columns) { state.columns = columns; return query; },
        eq(column, value) { state.filters.push(['eq', column, value]); return query; },
        in(column, values) { state.filters.push(['in', column, [...values]]); return query; },
        or(expression) { state.filters.push(['or', expression]); return query; },
        limit() { return query; },
        async maybeSingle() {
          calls.tables.push(state);
          calls.order.push(`read:${table}`);
          if (table === 'video_library_videos') return { data: assetRow, error: null };
          if (table === 'social_reels') return { data: reelRow, error: null };
          if (table === 'youtube_embed_failures') {
            return anchorError
              ? { data: null, error: anchorError }
              : { data: failureRow, error: null };
          }
          throw new Error(`unexpected table ${table}`);
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args: plain(args) });
      calls.order.push(`rpc:${name}`);
      if (name === 'record_youtube_embed_failure_report') {
        return reportError ? { data: null, error: reportError } : { data: [reportRow], error: null };
      }
      if (name === 'record_youtube_embed_failure_verdict') {
        return verdictError ? { data: null, error: verdictError } : { data: [verdictRow], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };

  const log = level => (...parts) => calls.logs.push({ level, text: parts.map(String).join(' ') });
  const context = {
    AbortController,
    URL,
    clearTimeout(handle) { calls.cleared.push(handle); },
    setTimeout(callback, ms) {
      calls.timers.push(ms);
      if (fireTimers) setImmediate(callback);
      return calls.timers.length;
    },
    console: { error: log('error'), warn: log('warn'), info: log('info'), log: log('log') },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
      },
    },
    createClient(url, key) {
      assert.equal(key, 'service-role-test', 'the verdict must be written with the service-role client');
      calls.clients += 1;
      return supabase;
    },
    applyRateLimit(req, res) {
      if (!rateLimited) return true;
      res.status(429).json({ error: 'Too many requests' });
      return false;
    },
    LIMITS: { write: {} },
    async getServerUserWithFallback() {
      return user ? { user, error: null } : { user: null, error: 'No token' };
    },
    async fetch(url, options) {
      calls.fetch.push({ url: String(url), options });
      calls.order.push('fetch:oembed');
      return fetchImpl(url, options);
    },
  };
  context.globalThis = context;
  vm.runInNewContext(`${transformed}\nglobalThis.__handler = handler;`, context);

  async function report(body = { videoId: VIDEO_ID, errorCode: 150, surface: 'Reels' }, method = 'POST') {
    const res = mockResponse();
    await context.__handler({ method, body, headers: { authorization: 'Bearer token' } }, res);
    return res;
  }
  const verdictCalls = () => calls.rpc.filter(call => call.name === 'record_youtube_embed_failure_verdict');
  return { calls, report, verdictCalls };
}

test('a definitive oEmbed answer records exactly one mirrored negative verdict', async () => {
  for (const [status, verdict] of [[401, 'private'], [403, 'restricted'], [404, 'unavailable'], [410, 'unavailable']]) {
    const upstream = oembedResponse(status);
    const harness = loadRoute({ fetchImpl: async () => upstream });
    const res = await harness.report({ videoId: ` ${VIDEO_ID} `, errorCode: '101', surface: 'Reels' });

    assert.equal(res.statusCode, 202, `oEmbed ${status}`);
    assert.deepEqual(res.body, { ok: true, status: 'confirmed', adjudicated: true });
    assert.equal(harness.calls.fetch.length, 1);
    assert.equal(harness.calls.fetch[0].url, EXPECTED_OEMBED_URL);
    assert.equal(harness.calls.fetch[0].options.method, 'GET');
    assert.equal(harness.calls.fetch[0].options.redirect, 'manual', 'redirects to other hosts must never be followed');
    assert.ok(harness.calls.fetch[0].options.signal instanceof AbortSignal);
    assert.deepEqual(harness.calls.timers, [4000], 'the outbound check needs one hard 4 s timeout');
    assert.deepEqual(harness.calls.cleared, [1], 'the timeout must be cleared on completion');
    assert.equal(upstream.cancelledCount(), 1, 'the unused body must be released');

    assert.deepEqual(harness.verdictCalls(), [{
      name: 'record_youtube_embed_failure_verdict',
      args: {
        p_video_id: VIDEO_ID,
        p_verdict: verdict,
        p_error_code: 101,
        p_surface: 'player_report_oembed',
        p_verification_started_at: LAST_SEEN_AT,
      },
    }]);
    assert.deepEqual(harness.calls.order, [
      'read:video_library_videos',
      'read:social_reels',
      'rpc:record_youtube_embed_failure_report',
      'read:youtube_embed_failures',
      'fetch:oembed',
      'rpc:record_youtube_embed_failure_verdict',
    ], 'report first, anchor captured before the oEmbed request, verdict last');
    const anchorRead = harness.calls.tables.find(state => state.table === 'youtube_embed_failures');
    assert.deepEqual(anchorRead.filters, [['eq', 'video_id', VIDEO_ID]]);
    assert.equal(harness.calls.clients, 1);
  }
});

test('non-definitive oEmbed answers never adjudicate and the report still succeeds', async () => {
  for (const status of [200, 204, 301, 302, 400, 402, 408, 429, 500, 502, 503]) {
    const harness = loadRoute({ fetchImpl: async () => oembedResponse(status) });
    const res = await harness.report();
    assert.equal(res.statusCode, 202, `oEmbed ${status}`);
    assert.deepEqual(res.body, { ok: true, status: 'pending', adjudicated: false });
    assert.equal(harness.calls.fetch.length, 1);
    assert.equal(harness.verdictCalls().length, 0, `oEmbed ${status} must not write a verdict`);
    assert.deepEqual(harness.calls.cleared, [1]);
  }
});

test('a malformed upstream response object never adjudicates', async () => {
  for (const upstream of [undefined, null, {}, { status: '401 Unauthorized' }, { status: NaN }]) {
    const harness = loadRoute({ fetchImpl: async () => upstream });
    const res = await harness.report();
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.adjudicated, false);
    assert.equal(harness.verdictCalls().length, 0);
  }
});

test('an oEmbed timeout aborts the request, is logged, and leaves the report pending', async () => {
  let observedSignal = null;
  const harness = loadRoute({
    fireTimers: true,
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      observedSignal = options.signal;
      options.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
      });
    }),
  });
  const res = await harness.report();
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { ok: true, status: 'pending', adjudicated: false });
  assert.deepEqual(harness.calls.timers, [4000]);
  assert.equal(observedSignal.aborted, true);
  assert.equal(harness.verdictCalls().length, 0);
  assert.ok(
    harness.calls.logs.some(entry => entry.level === 'error' && /Adjudication failed/.test(entry.text) && /AbortError/.test(entry.text)),
    'a timeout must be logged, not swallowed',
  );
  assert.deepEqual(harness.calls.cleared, [1]);
});

test('an oEmbed network error is logged and leaves the report pending', async () => {
  const harness = loadRoute({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  const res = await harness.report();
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { ok: true, status: 'pending', adjudicated: false });
  assert.equal(harness.verdictCalls().length, 0);
  assert.ok(harness.calls.logs.some(entry => entry.level === 'error' && /fetch failed/.test(entry.text)));
});

test('an already confirmed block makes no outbound call and writes no verdict', async () => {
  const fromReport = loadRoute({ reportRow: CONFIRMED_ROW, fetchImpl: async () => oembedResponse(404) });
  const res = await fromReport.report();
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { ok: true, status: 'confirmed', adjudicated: false });
  assert.equal(fromReport.calls.fetch.length, 0);
  assert.equal(fromReport.verdictCalls().length, 0);
  assert.ok(!fromReport.calls.order.includes('read:youtube_embed_failures'));

  // A verifier may confirm the row between the report and the anchor read.
  const fromAnchor = loadRoute({
    failureRow: { verification_status: 'confirmed', resolved: false, last_seen_at: LAST_SEEN_AT },
    fetchImpl: async () => oembedResponse(404),
  });
  const raced = await fromAnchor.report();
  assert.equal(raced.statusCode, 202);
  assert.equal(raced.body.adjudicated, false);
  assert.equal(fromAnchor.calls.fetch.length, 0);
  assert.equal(fromAnchor.verdictCalls().length, 0);
});

test('invalid input is rejected before any client, database or outbound work', async () => {
  const invalidBodies = [
    { videoId: 'not-eleven!!', errorCode: 150 },
    { videoId: 'M7lc1UVf-VE&format=xml', errorCode: 150 },
    { videoId: 'M7lc1UVf-V/', errorCode: 150 },
    { videoId: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', errorCode: 150 },
    { videoId: VIDEO_ID, errorCode: 2 },
    { videoId: VIDEO_ID, errorCode: 5 },
    { videoId: VIDEO_ID },
    {},
  ];
  for (const body of invalidBodies) {
    const harness = loadRoute({ fetchImpl: async () => oembedResponse(404) });
    const res = await harness.report(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(harness.calls.fetch.length, 0);
    assert.equal(harness.calls.rpc.length, 0);
    assert.equal(harness.calls.clients, 0);
  }

  const wrongMethod = loadRoute({ fetchImpl: async () => oembedResponse(404) });
  assert.equal((await wrongMethod.report(undefined, 'GET')).statusCode, 405);
  assert.equal(wrongMethod.calls.fetch.length, 0);

  const limited = loadRoute({ rateLimited: true, fetchImpl: async () => oembedResponse(404) });
  assert.equal((await limited.report()).statusCode, 429);
  assert.equal(limited.calls.fetch.length, 0);
  assert.equal(limited.calls.rpc.length, 0);
});

test('unauthenticated, ineligible and unrecorded reports keep their behaviour and never reach YouTube', async () => {
  const anonymous = loadRoute({ user: null, fetchImpl: async () => oembedResponse(404) });
  const denied = await anonymous.report();
  assert.equal(denied.statusCode, 401);
  assert.deepEqual(denied.body, { error: 'No token' });
  assert.equal(anonymous.calls.fetch.length, 0);
  assert.equal(anonymous.calls.rpc.length, 0);

  const outsider = loadRoute({ assetRow: null, reelRow: null, fetchImpl: async () => oembedResponse(404) });
  assert.equal((await outsider.report()).statusCode, 404);
  assert.equal(outsider.calls.fetch.length, 0);
  assert.equal(outsider.calls.rpc.length, 0);

  const unrecorded = loadRoute({
    reportError: { message: 'down', code: '57P01' },
    fetchImpl: async () => oembedResponse(404),
  });
  assert.equal((await unrecorded.report()).statusCode, 503);
  assert.equal(unrecorded.calls.fetch.length, 0);
  assert.equal(unrecorded.verdictCalls().length, 0);
});

test('adjudication failures never fail the stored report and are always logged', async () => {
  const verdictDown = loadRoute({
    verdictError: { message: 'permission denied', code: '42501' },
    fetchImpl: async () => oembedResponse(404),
  });
  const first = await verdictDown.report();
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.body, { ok: true, status: 'pending', adjudicated: false });
  assert.equal(verdictDown.verdictCalls().length, 1, 'one bounded attempt, no retry');
  assert.ok(verdictDown.calls.logs.some(entry => entry.level === 'error' && /Verdict RPC error/.test(entry.text) && /42501/.test(entry.text)));

  const anchorDown = loadRoute({
    anchorError: { message: 'timeout', code: '57014' },
    fetchImpl: async () => oembedResponse(404),
  });
  const second = await anchorDown.report();
  assert.equal(second.statusCode, 202);
  assert.equal(second.body.adjudicated, false);
  assert.equal(anchorDown.calls.fetch.length, 0, 'no anchor means no outbound call and no verdict');
  assert.equal(anchorDown.verdictCalls().length, 0);
  assert.ok(anchorDown.calls.logs.some(entry => entry.level === 'error' && /anchor read failed/.test(entry.text)));

  for (const lastSeenAt of [null, '', 'now()', '2026-09-20', 1758362400000]) {
    const noAnchor = loadRoute({
      failureRow: { verification_status: 'pending', resolved: true, last_seen_at: lastSeenAt },
      fetchImpl: async () => oembedResponse(404),
    });
    const res = await noAnchor.report();
    assert.equal(res.statusCode, 202);
    assert.equal(noAnchor.calls.fetch.length, 0);
    assert.equal(noAnchor.verdictCalls().length, 0);
    assert.ok(noAnchor.calls.logs.some(entry => entry.level === 'error' && /anchor missing/.test(entry.text)));
  }
});

test('a verdict superseded by a newer report is not claimed as a quarantine', async () => {
  const harness = loadRoute({ verdictRow: PENDING_ROW, fetchImpl: async () => oembedResponse(404) });
  const res = await harness.report();
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { ok: true, status: 'pending', adjudicated: false });
  assert.ok(harness.calls.logs.some(entry => /superseded/.test(entry.text)));

  // The superseding report may re-check immediately.
  await harness.report();
  assert.equal(harness.calls.fetch.length, 2);
});

test('repeated reports for one video cannot amplify outbound oEmbed traffic', async () => {
  const harness = loadRoute({ fetchImpl: async () => oembedResponse(200) });
  for (let index = 0; index < 5; index += 1) {
    const res = await harness.report({ videoId: VIDEO_ID, errorCode: 150, surface: `Surface ${index}` });
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.adjudicated, false);
  }
  assert.equal(harness.calls.fetch.length, 1, 'one outbound check per video per cooldown window');
  assert.equal(
    harness.calls.rpc.filter(call => call.name === 'record_youtube_embed_failure_report').length,
    5,
    'every accepted report is still recorded',
  );

  const concurrent = loadRoute({ fetchImpl: async () => oembedResponse(200) });
  await Promise.all([concurrent.report(), concurrent.report(), concurrent.report()]);
  assert.equal(concurrent.calls.fetch.length, 1, 'concurrent reports share one outbound check');

  const other = await harness.report({ videoId: 'dQw4w9WgXcQ', errorCode: 100, surface: 'Reels' });
  assert.equal(other.statusCode, 202);
  assert.equal(harness.calls.fetch.length, 2, 'the bound is per video');
  assert.match(ROUTE, /MAX_TRACKED_ADJUDICATIONS/);
  assert.match(ROUTE, /recentAdjudicationAttempts\.size >= MAX_TRACKED_ADJUDICATIONS\) return false/);
});

test('the route never sends a verified verdict for any upstream status', async () => {
  const definitive = new Map([[401, 'private'], [403, 'restricted'], [404, 'unavailable'], [410, 'unavailable']]);
  for (let status = 100; status <= 599; status += 1) {
    const harness = loadRoute({ fetchImpl: async () => oembedResponse(status) });
    await harness.report();
    const verdicts = harness.verdictCalls().map(call => call.args.p_verdict);
    assert.deepEqual(verdicts, definitive.has(status) ? [definitive.get(status)] : [], `status ${status}`);
  }
  const verdictMap = ROUTE.match(/const OEMBED_STATUS_VERDICTS = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1];
  assert.ok(verdictMap);
  assert.doesNotMatch(verdictMap, /verified|error/);
  assert.doesNotMatch(ROUTE, /p_verdict:\s*['"]/, 'the verdict must only come from the definitive status map');
  assert.doesNotMatch(ROUTE, /['"]verified['"]/);
});

test('the status mapping mirrors the Python verifier and the installed verdict RPC', () => {
  const classifier = VERIFIER.match(/def _classify_http_error\(prefix, error\):\n([\s\S]*?)\n\n\ndef /)?.[1];
  assert.ok(classifier, 'the verifier classifier must remain discoverable');
  assert.match(classifier, /error\.code == 401:\s*\n\s*return _availability\('private'/);
  assert.match(classifier, /error\.code == 403:\s*\n\s*return _availability\('restricted'/);
  assert.match(classifier, /error\.code in \(404, 410\):\s*\n\s*return _availability\('unavailable'/);
  assert.match(ROUTE, /401: 'private',\s*403: 'restricted',\s*404: 'unavailable',\s*410: 'unavailable',/);

  assert.match(
    MIGRATION,
    /CREATE OR REPLACE FUNCTION public\.record_youtube_embed_failure_verdict\(\s*p_video_id text,\s*p_verdict text,\s*p_error_code integer DEFAULT NULL,\s*p_surface text DEFAULT 'verification_worker',\s*p_verification_started_at timestamptz DEFAULT NULL\s*\)/,
  );
  assert.match(MIGRATION, /v_verdict IN \('unavailable', 'private', 'restricted', 'embed_disabled'\) THEN\s*v_verification_status := 'confirmed';\s*v_resolved := false;/);
  assert.match(MIGRATION, /v_existing\.last_seen_at > p_verification_started_at/);
  assert.match(
    MIGRATION,
    /REVOKE ALL ON FUNCTION public\.record_youtube_embed_failure_verdict\(text, text, integer, text, timestamptz\)\s*FROM PUBLIC, anon, authenticated;\s*GRANT EXECUTE ON FUNCTION public\.record_youtube_embed_failure_verdict\(text, text, integer, text, timestamptz\)\s*TO service_role;/,
  );
  assert.match(MIGRATION, /GRANT SELECT, INSERT, UPDATE, DELETE\s*ON TABLE public\.youtube_embed_failures TO service_role;/);
});

test('the player hook tolerates the additive response field', () => {
  const start = YOUTUBE_MANAGER.indexOf('const FAILURE_REPORT_CODES');
  const end = YOUTUBE_MANAGER.indexOf('// ── Main Hook', start);
  assert.ok(start >= 0 && end > start);
  const reporter = YOUTUBE_MANAGER.slice(start, end);
  assert.match(reporter, /response\.ok && response\.status === 202/);
  assert.doesNotMatch(reporter, /response\.(json|text)\(/, 'the reporter decides on status only');
});
