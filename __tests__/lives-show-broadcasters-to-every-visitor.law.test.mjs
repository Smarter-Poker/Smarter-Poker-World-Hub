// Signed-out visitors see /hub/lives, with broadcaster names (2026-10-20).
//
// /hub/lives embedded `broadcaster:profiles!broadcaster_id(...)` in its
// live_streams and scheduled_lives reads. anon may SELECT only bio and
// player_tags on public.profiles, so for a signed-out visitor every one of
// those reads failed with 42501, the page ignored the error, and it showed
// "No Lives Yet" over 11 posted recordings. The fix keeps the profiles grants
// exactly as they are: the rows are read on their own, and the display-safe
// identity comes from GET /api/live/broadcasters, which serves only
// id, username, display_name and avatar_url, and only for broadcasters of
// streams a visitor can already see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadSurface } from './social-poker-card-harness.mjs';
import { stripComments } from '../scripts/ci/lib/rpc-calls.mjs';

const ROUTE = 'pages/api/live/broadcasters.js';
const ROUTE_SOURCE = readFileSync(join(ROOT, ROUTE), 'utf8');
const LIVES = stripComments(readFileSync(join(ROOT, 'pages/hub/lives.js'), 'utf8'));
const HELPER = 'src/lib/liveBroadcasters.js';
const LIMITS = { read: { max: 60, windowMs: 60_000 } };

const STREAMER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLANNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BANNED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const PROFILES = {
  [STREAMER]: { id: STREAMER, username: 'river_rat', display_name: 'River Rat', avatar_url: '/a.png', status: 'active', email: 'private@example.test', full_name: 'Private Name', diamonds: 5 },
  [PLANNER]: { id: PLANNER, username: 'planner', display_name: null, avatar_url: null, status: null, phone: '555' },
  [STRANGER]: { id: STRANGER, username: 'stranger', display_name: 'Stranger', avatar_url: '/s.png', status: 'active' },
  [BANNED]: { id: BANNED, username: 'gone', display_name: 'Gone', avatar_url: '/g.png', status: 'Banned' },
};

function fakeDb({ failTable = null } = {}) {
  const calls = [];
  const rowsFor = (table, filters) => {
    const ids = filters.find((f) => f[0] === 'in')?.[2] || [];
    if (table === 'profiles') return ids.map((id) => PROFILES[id]).filter(Boolean);
    if (table === 'live_streams') {
      const status = filters.find((f) => f[0] === 'eq' && f[1] === 'status')?.[2];
      const owners = status === 'live' ? [STREAMER] : [STREAMER, BANNED];
      return owners.filter((id) => ids.includes(id)).map((id) => ({ broadcaster_id: id }));
    }
    if (table === 'scheduled_lives') return [PLANNER].filter((id) => ids.includes(id)).map((id) => ({ broadcaster_id: id }));
    return [];
  };
  return {
    calls,
    from(table) {
      const filters = [];
      const call = { table, filters };
      calls.push(call);
      const chain = {
        select(columns) { call.columns = columns; return chain; },
        in(column, values) { filters.push(['in', column, values]); return chain; },
        eq(column, value) { filters.push(['eq', column, value]); return chain; },
        not(column, op, value) { filters.push(['not', column, op, value]); return chain; },
        gte(column, value) { filters.push(['gte', column, value]); return chain; },
        then(resolve, reject) {
          const result = failTable === table
            ? { data: null, error: { code: '42501', message: 'permission denied' } }
            : { data: rowsFor(table, filters), error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

function load(options = {}) {
  const db = fakeDb(options);
  const reports = [];
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  try {
    const { module } = loadSurface(ROUTE, {
      mocks: {
        'src/lib/supabaseServerClient.js': { createClient: () => db },
        'src/lib/apiRateLimit.js': { LIMITS, applyRateLimit: () => true },
        'src/lib/apiErrorHandler.js': { reportApiError: (error) => reports.push(error?.message) },
      },
    });
    return { module, handler: module.default, db, reports };
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
}

function request(query = {}, method = 'GET') {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  return { req: { method, query, headers: {} }, res };
}

test('the route serves only display-safe fields, and only for public broadcasters', async () => {
  const { handler, db } = load();
  const { req, res } = request({ ids: [STREAMER, PLANNER, STRANGER, BANNED].join(',').toUpperCase() });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body.broadcasters).sort(), [PLANNER, STREAMER].sort());
  assert.deepEqual(res.body.broadcasters[STREAMER], { id: STREAMER, username: 'river_rat', display_name: 'River Rat', avatar_url: '/a.png' });
  assert.deepEqual(Object.keys(res.body.broadcasters[PLANNER]), ['id', 'username', 'display_name', 'avatar_url']);
  // The stranger has no public stream, so the profile read never asked for them.
  const profileRead = db.calls.find((call) => call.table === 'profiles');
  const asked = profileRead.filters.find((f) => f[0] === 'in')[2];
  assert.equal(asked.includes(STRANGER), false);
  assert.equal(res.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=300');
});

test('bad input is refused before any read, and a failed read is a 503, never an empty success', async () => {
  for (const ids of [undefined, '', 'not-a-uuid', [STREAMER, PLANNER], Array.from({ length: 61 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',')]) {
    const { handler, db } = load();
    const { req, res } = request({ ids });
    await handler(req, res);
    assert.equal(res.statusCode, 400, String(ids).slice(0, 40));
    assert.equal(db.calls.length, 0);
  }
  for (const failTable of ['live_streams', 'scheduled_lives', 'profiles']) {
    const { handler, reports } = load({ failTable });
    const { req, res } = request({ ids: STREAMER });
    await handler(req, res);
    assert.equal(res.statusCode, 503, failTable);
    assert.equal(res.body.success, false);
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
    assert.equal(reports.length, 1);
  }
  const { handler } = load();
  const { req, res } = request({ ids: STREAMER }, 'POST');
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});

test('the route uses the service role server-side and never returns a raw profile row', () => {
  const code = stripComments(ROUTE_SOURCE);
  assert.match(code, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(code, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(code, /broadcasterSnapshot\(row\)/);
  assert.doesNotMatch(code, /select\(\s*['"]\*['"]/);
  assert.doesNotMatch(ROUTE_SOURCE, /[–—]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('/hub/lives never embeds profiles in a read anon makes, and says so when a read fails', () => {
  assert.doesNotMatch(LIVES, /profiles!broadcaster_id|profiles:broadcaster_id|broadcaster:profiles/);
  assert.match(LIVES, /attachBroadcasters\(/);
  assert.match(LIVES, /if \(liveResult\.error \|\| recordedResult\.error\)/);
  assert.match(LIVES, /setFetchError\(/);
  assert.match(LIVES, /streams\.length === 0 && !fetchError/);
  assert.match(LIVES, /Lives Could Not Load/);
});

test('a failed name lookup keeps every stream and marks the lookup failed', async () => {
  const { module } = loadSurface(HELPER, {});
  const rows = [{ id: 's1', broadcaster_id: STREAMER }, { id: 's2', broadcaster_id: PLANNER }];
  const ok = await module.attachBroadcasters(rows, {
    fetchImpl: async (url) => {
      assert.match(url, /^\/api\/live\/broadcasters\?ids=/);
      return { ok: true, status: 200, json: async () => ({ success: true, broadcasters: { [STREAMER]: { id: STREAMER, username: 'river_rat' } } }) };
    },
  });
  assert.equal(ok.failed, false);
  assert.equal(ok.rows[0].broadcaster.username, 'river_rat');
  assert.equal(ok.rows[1].broadcaster, null);

  const down = await module.attachBroadcasters(rows, {
    field: 'profiles',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ success: false, error: 'Broadcasters temporarily unavailable' }) }),
  });
  assert.equal(down.failed, true);
  assert.deepEqual(down.rows.map((row) => row.id), ['s1', 's2']);
  assert.equal(down.rows[0].profiles, null);
});
