// Poker Near Me /more request flood (2026-11-28).
//
// A signed-in phone session on /hub/poker-near-me/more overflowed the
// browser's request buffer within minutes, with dozens of
// /api/poker/checkins?venue_id=... calls. These tests render the actual
// components and handler with a fetch spy and prove that each fixed source
// fires once per mount or per real input change, never per re-render.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function compiled(path, dependencies) {
  const text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(text, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected import ${name} in ${path}`);
  }, mod, mod.exports);
  return mod.exports;
}

const Shell = ({ children }) => React.createElement('div', null, children);
const consoleStub = { PokerNearMePanelShell: Shell, PokerNearMeConsoleIcon: () => null };
function haversineMiles(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

function fetchSpy(handler = () => ({})) {
  const calls = [];
  const spy = async (url, options) => {
    calls.push(String(url));
    const body = handler(String(url), options);
    return { ok: true, status: 200, json: async () => body };
  };
  spy.calls = calls;
  return spy;
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

function venuesNearReno() {
  return [
    { id: 1, name: 'Room One', latitude: 39.53, longitude: -119.81 },
    { id: 2, name: 'Room Two', latitude: 39.54, longitude: -119.80 },
    { id: 'sp-9', name: 'Social Page', latitude: 39.53, longitude: -119.82, is_social_page: true },
    { id: 3, name: 'Far Room', latitude: 36.17, longitude: -115.14 },
  ];
}

test('Near Me Now sends one batched check-in request per load and none for an identical re-render', async () => {
  const previousFetch = globalThis.fetch;
  const spy = fetchSpy((url) => {
    if (url.includes('/api/poker/checkins')) {
      return { success: true, venues: { 1: { checkins: [{ id: 'c1', user_name: 'Ana', created_at: new Date().toISOString() }], count: 1 }, 2: { checkins: [], count: 0 } } };
    }
    return { success: true, venues: {}, tournaments: [], promotions: [] };
  });
  globalThis.fetch = spy;
  const feed = await compiled('src/components/poker-near-me/NearMeNowFeed.jsx', {
    './pnm-utils': { haversineMiles, timeAgo: () => 'now', getZonedNow: () => null, resolveVenueTimeZone: () => null },
    './PokerNearMeConsole': consoleStub,
  });
  const Feed = feed.default;
  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(Feed, { userLocation: { lat: 39.53, lng: -119.81 }, venues: venuesNearReno() }));
    });
    await renderer.act(flush);
    const checkins = spy.calls.filter((u) => u.includes('/api/poker/checkins'));
    assert.equal(checkins.length, 1, 'one check-in request for every nearby venue');
    assert.match(checkins[0], /venue_ids=1,2&/, 'nearest catalog venues only, nearest first; synthetic and out-of-radius ids stay out');
    assert.doesNotMatch(checkins[0], /venue_id=/);
    const since = decodeURIComponent(checkins[0].match(/since=([^&]+)/)[1]);
    assert.equal(new Date(since).getUTCSeconds(), 0, 'window start is floored to the minute so repeat loads share a URL');
    assert.equal(spy.calls.length, 4, 'live games, check-ins, tournaments and promotions: one each');
    assert.match(JSON.stringify(tree.toJSON()), /Ana checked in/);

    // The page rebuilds both props on every poll and GPS refresh.
    await renderer.act(async () => {
      tree.update(React.createElement(Feed, { userLocation: { lat: 39.53, lng: -119.81 }, venues: venuesNearReno().map((v) => ({ ...v })) }));
    });
    await renderer.act(flush);
    assert.equal(spy.calls.length, 4, 'a new array of the same venues and a new object of the same coordinates fetch nothing');

    // A real change re-runs the feed exactly once.
    await renderer.act(async () => {
      tree.update(React.createElement(Feed, { userLocation: { lat: 39.53, lng: -119.81 }, venues: [...venuesNearReno(), { id: 4, name: 'New Room', latitude: 39.535, longitude: -119.805 }] }));
    });
    await renderer.act(flush);
    assert.equal(spy.calls.length, 8, 'a new venue inside the radius re-runs each source once');
    assert.match(spy.calls.filter((u) => u.includes('/api/poker/checkins'))[1], /venue_ids=1,4,2&|venue_ids=4,1,2&|venue_ids=1,2,4&/);
  } finally {
    await renderer.act(async () => tree?.unmount());
    globalThis.fetch = previousFetch;
  }
});

test('Social Feed requests friends once after the token settles and never re-fetches for a new venue list', async () => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
  const spy = fetchSpy((url) => {
    if (url.startsWith('/api/friends')) return { success: true, data: { friends: [{ friend_id: 'f1', username: 'pal' }, { friend_id: 'f2', username: 'mate' }] } };
    if (url.includes('user_id=f1')) return { checkins: [{ id: 'x', venue_id: 1, created_at: new Date().toISOString() }] };
    return { checkins: [] };
  });
  globalThis.fetch = spy;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, location: { href: '', origin: 'https://smarter.poker' } };
  globalThis.document = { addEventListener() {}, removeEventListener() {}, body: { style: {} } };
  let resolveToken;
  const social = await compiled('src/components/poker-near-me/SocialLayer.jsx', {
    '../../lib/authUtils': { getFreshAccessToken: () => new Promise((resolve) => { resolveToken = resolve; }) },
    '../../hooks/useModalHistory': { useModalHistory: () => {} },
    '../../hooks/useScrimDismiss': { useScrimDismiss: () => ({}) },
    './PokerNearMeConsole': consoleStub,
  });
  const Social = social.default;
  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(Social, { userId: 'me', venues: venuesNearReno() }));
    });
    await renderer.act(flush);
    assert.equal(spy.calls.length, 0, 'no unauthenticated friends request while the session token is still resolving');
    await renderer.act(async () => { resolveToken('token-1'); });
    await renderer.act(flush);
    assert.deepEqual(spy.calls.filter((u) => u.startsWith('/api/friends')), ['/api/friends?action=list']);
    assert.equal(spy.calls.filter((u) => u.includes('/api/poker/checkins?user_id=')).length, 2, 'one check-in read per friend');
    assert.match(JSON.stringify(tree.toJSON()), /Room One/);

    await renderer.act(async () => {
      tree.update(React.createElement(Social, { userId: 'me', venues: venuesNearReno().map((v) => (v.id === 1 ? { ...v, name: 'Room One Renamed' } : { ...v })) }));
    });
    await renderer.act(flush);
    assert.equal(spy.calls.length, 3, 'a new venue list relabels groups without a single request');
    assert.match(JSON.stringify(tree.toJSON()), /Room One Renamed/);
  } finally {
    await renderer.act(async () => tree?.unmount());
    Object.assign(globalThis, previous);
  }
});

test('Best Time To Go refetches on a live_tables announcement at most once per five minutes', async () => {
  const previousFetch = globalThis.fetch;
  const spy = fetchSpy(() => ({ heatmap: [] }));
  globalThis.fetch = spy;
  const handlers = [];
  const eventBus = { on: (type, fn) => { handlers.push(fn); return () => handlers.splice(handlers.indexOf(fn), 1); } };
  const heat = await compiled('src/components/poker-near-me/PeakActivityHeatmap.jsx', {
    '../../engine/EventBus': { eventBus, EventType: { DATA_MUTATED: 'DATA_MUTATED' } },
    './PokerNearMeConsole': consoleStub,
  });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  let tree;
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(heat.default)); });
    await renderer.act(flush);
    assert.equal(spy.calls.length, 1);
    for (let i = 0; i < 10; i++) {
      now += 30 * 1000;
      await renderer.act(async () => handlers.forEach((fn) => fn({ payload: { entity: 'live_tables' } })));
    }
    await renderer.act(flush);
    assert.equal(spy.calls.length, 2, 'ten announcements over five minutes cost one refetch');
    await renderer.act(async () => handlers.forEach((fn) => fn({ payload: { entity: 'social' } })));
    assert.equal(spy.calls.length, 2, 'other entities never refetch');
    assert.equal(heat.HEATMAP_REFRESH_FLOOR_MS, 5 * 60 * 1000);
  } finally {
    Date.now = realNow;
    await renderer.act(async () => tree?.unmount());
    globalThis.fetch = previousFetch;
    assert.equal(handlers.length, 0, 'the bus listener is removed on unmount');
  }
});

test('the map directory merge keeps its identity when a fetch changes nothing', async () => {
  const { mergeLiveVenuesIntoMapDirectory } = await import('../src/components/poker-near-me/discoveryController.js');
  const directory = [
    { id: 1, name: 'Room One', games_offered: ['NLH'] },
    { id: 2, name: 'Room Two', games_offered: ['PLO'] },
  ];
  const fetched = () => [
    { id: 1, name: 'Room One', games_offered: ['NLH'] },
    { id: 'sp-7', name: 'Social', is_social_page: true, latitude: 1, longitude: 2 },
    { id: 'hg-1', name: 'Home', is_home_group: true, latitude: 3, longitude: 4 },
  ];
  const first = mergeLiveVenuesIntoMapDirectory(directory, fetched());
  assert.notEqual(first, directory);
  assert.equal(first.length, 4);
  assert.equal(first[0], directory[0], 'an unchanged catalog venue keeps its object');
  const second = mergeLiveVenuesIntoMapDirectory(first, fetched());
  assert.equal(second, first, 'the same fetch again returns the same array');
  const changed = mergeLiveVenuesIntoMapDirectory(second, [{ id: 2, name: 'Room Two', games_offered: ['PLO', 'NLH'] }]);
  assert.notEqual(changed, second);
  assert.deepEqual(changed.map((v) => v.id), [1, 2], 'synthetic entries absent from the fetch are dropped');
  assert.deepEqual(changed[1].games_offered, ['PLO', 'NLH']);
  assert.equal(changed[0], second[0]);
});

test('concurrent reads of one feed share a single request', async () => {
  const { fetchShared, sharedGetInFlightCount } = await import('../src/lib/poker-near-me/sharedGet.js');
  let sent = 0;
  let release;
  const impl = async () => { sent++; await new Promise((resolve) => { release = resolve; }); return { ok: true, status: 200, json: async () => ({ venues: [1] }) }; };
  const a = fetchShared('/api/poker/live-tables', impl);
  const b = fetchShared('/api/poker/live-tables', impl);
  assert.equal(a, b);
  assert.equal(sharedGetInFlightCount(), 1);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(sent, 1);
  assert.deepEqual(await ra.json(), { venues: [1] });
  assert.deepEqual(await rb.json(), { venues: [1] });
  assert.equal(sharedGetInFlightCount(), 0, 'nothing is cached after the request settles');
  const c = fetchShared('/api/poker/live-tables', async () => { sent++; return { ok: false, status: 503, json: async () => ({}) }; });
  assert.equal((await c).ok, false);
  assert.equal(sent, 2);
});

// ─── /api/poker/checkins batched mode ───
async function loadCheckinsHandler(rowsFor) {
  const queries = [];
  const db = {
    from(table) {
      const q = { table, filters: [], orders: [] };
      queries.push(q);
      const builder = {
        select(cols, opts) { q.select = cols; q.selectOpts = opts; return builder; },
        in(col, values) { q.filters.push(['in', col, values]); return builder; },
        eq(col, value) { q.filters.push(['eq', col, value]); return builder; },
        gte(col, value) { q.filters.push(['gte', col, value]); return builder; },
        order(col, opts) { q.orders.push([col, opts]); return builder; },
        range(from, to) { q.range = [from, to]; return Promise.resolve({ data: rowsFor(q), error: null }); },
        limit(n) { q.limit = n; return Promise.resolve({ data: rowsFor(q), error: null, count: rowsFor(q).length }); },
      };
      return builder;
    },
  };
  const mod = await compiled('pages/api/poker/checkins.js', {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: null, error: 'none' }) },
    '../../../src/lib/supabaseServerClient': { createClient: () => db },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {} },
    '../../../src/lib/cors': { applyCors: () => true },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/inBatches.mjs': await import('../src/lib/inBatches.mjs'),
  });
  return { mod, queries };
}

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: null, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.headersSent = true; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}

test('batched check-ins answer every listed venue in one query with the single-venue rules', async () => {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < 130; i++) rows.push({ id: `a${i}`, venue_id: '5', user_name: 'A', created_at: new Date(now - i * 1000).toISOString() });
  rows.push({ id: 'b1', venue_id: '7', user_name: 'B', created_at: new Date(now - 5000).toISOString() });
  const { mod, queries } = await loadCheckinsHandler((q) => {
    if (!q.range) return rows.filter((r) => r.venue_id === '5').slice(0, 100);
    const ids = q.filters.find((f) => f[0] === 'in')[2];
    return rows.filter((r) => ids.includes(r.venue_id)).slice(q.range[0], q.range[1] + 1);
  });
  const handler = mod.default;

  const res = mockRes();
  await handler({ method: 'GET', query: { venue_ids: '5,7,9,5', since: new Date(now - 2 * 3600 * 1000).toISOString() }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(queries.length, 1, 'one database read for three venues');
  assert.deepEqual(queries[0].filters[0], ['in', 'venue_id', ['5', '7', '9']], 'ids are deduped and compared as strings');
  const gte = queries[0].filters.find((f) => f[0] === 'gte')[2];
  assert.ok(Math.abs(Date.parse(gte) - (now - 2 * 3600 * 1000)) < 2000, 'since narrows the window');
  assert.deepEqual(Object.keys(res.body.venues), ['5', '7', '9']);
  assert.equal(res.body.venues['5'].checkins.length, 100, 'the single-venue 100-row ceiling holds per venue');
  assert.equal(res.body.venues['5'].count, 100);
  assert.equal(res.body.venues['7'].checkins[0].id, 'b1');
  assert.deepEqual(res.body.venues['9'], { checkins: [], count: 0 }, 'a venue with no rows still answers');

  const old = mockRes();
  await handler({ method: 'GET', query: { venue_ids: '5', since: '2000-01-01T00:00:00Z' }, headers: {} }, old);
  const oldGte = queries.at(-1).filters.find((f) => f[0] === 'gte')[2];
  assert.ok(now - Date.parse(oldGte) <= 24 * 3600 * 1000 + 2000, 'since can never widen past 24 hours');

  for (const bad of ['', 'abc', '1,-2', '0', '1,2.5']) {
    const r = mockRes();
    await handler({ method: 'GET', query: { venue_ids: bad }, headers: {} }, r);
    assert.equal(r.statusCode, 400, `refuses venue_ids=${bad}`);
  }
  const tooMany = mockRes();
  await handler({ method: 'GET', query: { venue_ids: Array.from({ length: mod.VENUE_IDS_MAX + 1 }, (_, i) => i + 1).join(',') }, headers: {} }, tooMany);
  assert.equal(tooMany.statusCode, 400, 'an over-long list is refused, never silently truncated');

  const single = mockRes();
  await handler({ method: 'GET', query: { venue_id: '5' }, headers: {} }, single);
  assert.equal(single.statusCode, 200);
  assert.equal(single.body.checkins.length, 100, 'the single-venue branch still answers its old shape');
  assert.equal(single.body.count, 100);
});

test('the Discovery Tools no longer fan out one check-in request per venue', async () => {
  const feed = await readFile(new URL('../src/components/poker-near-me/NearMeNowFeed.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(feed, /checkins\?venue_id=\$\{/);
  const live = await readFile(new URL('../src/components/poker-near-me/LiveGamesFeed.jsx', import.meta.url), 'utf8');
  assert.match(live, /LIVE_REALTIME_FLOOR_MS = 60 \* 1000/);
  assert.match(live, /if \(debounceTimerRef\.current\) return;/, 'a realtime burst throttles; it never pushes a pending refetch back');
  const planning = await readFile(new URL('../src/components/poker-near-me/PlayerPlanningPanel.jsx', import.meta.url), 'utf8');
  assert.match(planning, /event\.key !== 'smarter-poker-auth'/, 'only an account switch reloads private plans');
});
