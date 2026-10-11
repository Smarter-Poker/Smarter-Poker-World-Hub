import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = new URL('../', import.meta.url);
const OP = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const OWNER = '11111111-1111-4111-8111-111111111111';
function compile(path, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL(path, ROOT), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => { if (deps[name]) return deps[name]; throw new Error(`Unexpected dependency ${name}`); }, module, module.exports);
  return module.exports;
}
const discovery = compile('src/components/poker-near-me/discoveryController.js');
const contracts = compile('src/lib/poker-near-me/playerPlanning.js', { '../../components/poker-near-me/discoveryController.js': discovery });
const server = compile('src/lib/poker-near-me/playerPlanningServer.js');
const search = { schemaVersion: 1, query: 'Vegas NLH', filters: { state: 'NV', game: 'NLH', stakes: '1/2', date: 'tonight', type: 'venues' }, location: { city: 'Las Vegas', state: 'NV' } };
const trip = { schemaVersion: 1, origin: 'Las Vegas, NV', destination: 'Reno, NV', waypoints: [], corridorMi: 50, dateRange: { start: '', end: '' }, venueIds: [1826] };
function fixture({ error = null, noUser = false, rateLimited = false, receiptOverride, throwRpc = false } = {}) {
  const calls = [];
  const receipt = receiptOverride || { operation_id: OP, action: 'create', plan: { id: ID, kind: 'search', name: 'Vegas', document: search, revision: 1 } };
  const client = {
    async rpc(name, args) { calls.push({ name, args }); if (throwRpc) throw new Error('Transport interrupted'); return { data: receipt, error }; },
    from(table) {
      const q = { select(fields) { calls.push({ table, fields }); return q; }, eq(key, value) { calls.push({ key, value }); return q; }, order() { return q; }, limit(value) { calls.push({ limit: value }); return Promise.resolve({ data: [receipt.plan], error }); }, async maybeSingle() { return { data: { poker_near_me_preferences: { geofenceAlerts: false } }, error }; } }; return q;
    },
  };
  const contribution = {
    contributionPrivate(res) { res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Authorization, Cookie'); },
    async contributionSession(_req, res) { if (noUser) { res.status(401).json({ success: false }); return null; } return { client, service: client, user: { id: OWNER } }; },
    contributionBody(req) { if (typeof req.body === 'string') return JSON.parse(req.body); return req.body; },
  };
  const deps = { '../../../src/lib/apiRateLimit': { applyRateLimit: (_req, res) => { if (rateLimited) res.status(429).json({ success: false }); return !rateLimited; }, LIMITS: {} }, '../../../src/lib/poker-near-me/venueContributionsServer': contribution, '../../../src/lib/poker-near-me/playerPlanning': contracts, '../../../src/lib/poker-near-me/playerPlanningServer': server };
  const routes = Object.fromEntries(['player-plans', 'player-preferences'].map(name => [name, compile(`pages/api/poker/${name}.js`, deps).default]));
  return { calls, async run(route, method = 'POST', body = {}, query = {}) { const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; await routes[route]({ method, body, query }, res); return res; } };
}
const request = { operation_id: OP, action: 'create', id: ID, kind: 'search', name: 'Vegas', document: search };
test('plan creation uses participant RPC with bounded structured document and no caller actor', async () => {
  const f = fixture(); const res = await f.run('player-plans', 'POST', request);
  assert.equal(res.statusCode, 201); assert.equal(res.headers['Cache-Control'], 'private, no-store'); assert.equal(res.headers.Vary, 'Authorization, Cookie');
  assert.equal(f.calls[0].name, 'pnm_mutate_player_plan'); assert.equal(f.calls[0].args.p_request_id, OP); assert.deepEqual(f.calls[0].args.p_payload.document, search); assert.equal(f.calls[0].args.p_payload.user_id, undefined);
});
test('plan list explicitly binds verified owner and maintains finite caps', async () => {
  const f = fixture(); const res = await f.run('player-plans', 'GET', {}, { kind: 'trip', user_id: 'stranger' });
  assert.equal(res.statusCode, 200); assert.ok(f.calls.some(call => call.key === 'user_id' && call.value === OWNER)); assert.ok(f.calls.some(call => call.limit === 70)); assert.ok(f.calls.some(call => call.key === 'kind' && call.value === 'trip'));
});
test('no authentication or rate admission never calls persistence', async () => {
  for (const [options, status] of [[{ noUser: true }, 401], [{ rateLimited: true }, 429]]) { const f = fixture(options); assert.equal((await f.run('player-plans', 'POST', request)).statusCode, status); assert.equal(f.calls.length, 0); }
});
test('original UUID recovery reads only its own receipt and does not repeat a write', async () => {
  const f = fixture(); assert.equal((await f.run('player-plans', 'GET', {}, { operation_id: OP })).statusCode, 200); assert.equal(f.calls[0].name, 'pnm_player_plan_operation'); assert.deepEqual(f.calls[0].args, { p_request_id: OP });
});
test('business CAS refusals map PT409 promptly and uncertain transport keeps request identity', async () => {
  const conflict = fixture({ error: { code: 'PT409', message: 'Plan changed' } }); assert.equal((await conflict.run('player-plans', 'POST', request)).statusCode, 409);
  for (const options of [{ throwRpc: true }, { receiptOverride: { operation_id: ID } }]) { const f = fixture(options); const res = await f.run('player-plans', 'POST', request); assert.equal(res.statusCode, 503); assert.equal(res.body.outcome, 'unknown'); assert.equal(res.body.operation_id, OP); }
});
test('invalid plans never reach owning persistence', async () => {
  for (const body of [{ ...request, user_id: OWNER }, { ...request, id: 'invalid' }, { ...request, document: { ...search, url: 'https://evil.example' } }, { ...request, action: 'update', expected_revision: 0 }, { ...request, name: 'x'.repeat(81) }, { ...request, kind: 'trip', document: { ...trip, dateRange: { start: '2026-02-30', end: '2026-03-01' } } }]) { const f = fixture(); assert.equal((await f.run('player-plans', 'POST', body)).statusCode, 400); assert.equal(f.calls.length, 0); }
});
test('preferences PATCH validates then atomically merges with the original UUID', async () => {
  const f = fixture({ receiptOverride: { operation_id: OP, action: 'preferences', preferences: { locationEnabled: false } } });
  const res = await f.run('player-preferences', 'PATCH', { operation_id: OP, patch: { locationEnabled: false } }); assert.equal(res.statusCode, 200); assert.deepEqual(f.calls[0], { name: 'pnm_patch_preferences', args: { p_request_id: OP, p_patch: { locationEnabled: false } } });
  const read = fixture(); await read.run('player-preferences', 'GET', {}, { user_id: 'stranger' }); assert.ok(read.calls.some(call => call.key === 'id' && call.value === OWNER));
});
test('preference unknown keys, unsafe coordinates, invalid strings and toggles fail closed', async () => {
  for (const patch of [{ role: 'admin' }, { geofenceAlerts: 'true' }, { lastLocation: { lat: 91, lng: 1 } }, { lastLocation: { lat: 1, lng: 1, address: 'Private' } }, { locationEnabledAt: 'wrong' }, { locationEnabledAt: '2026-02-30T12:00:00Z' }, { locationEnabledAt: '2026-10-11T24:00:00Z' }, { locationEnabledAt: '2026-10-11T12:00:00' }, {}]) { const f = fixture(); assert.equal((await f.run('player-preferences', 'PATCH', { operation_id: OP, patch })).statusCode, 400); assert.equal(f.calls.length, 0); }
});
test('private preference reads refuse unsigned callers and ignore supplied stranger identity', async () => {
  const unsigned = fixture({ noUser: true });
  assert.equal((await unsigned.run('player-preferences', 'GET')).statusCode, 401);
  assert.deepEqual(unsigned.calls, []);
  const owner = fixture();
  const response = await owner.run('player-preferences', 'GET', { user_id: ID }, { user_id: ID, id: ID });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Vary, 'Authorization, Cookie');
  assert.deepEqual(owner.calls, [{ table: 'profiles', fields: 'poker_near_me_preferences' }, { key: 'id', value: OWNER }]);
  assert.deepEqual(response.body.preferences, { geofenceAlerts: false });
});
test('saved search preserves the exact structured filter/location document in the actual consumer parameter', () => {
  const url = new URL(contracts.buildSavedSearchUrl(search), 'https://smarter.poker');
  assert.equal(url.pathname, '/hub/poker-near-me/lobby'); assert.equal(url.searchParams.get('q'), search.query); assert.deepEqual(JSON.parse(url.searchParams.get('pnm_planning')), search);
});
test('trip public share excludes every private typed location and carries only bounded public references and dates', () => {
  const privateTrip = { ...trip, origin: '123 Private Street', destination: 'Invitation Secret', waypoints: ['My Home Address'], seriesIds: [5001066] };
  const url = contracts.buildSafeTripShareUrl(privateTrip);
  assert.doesNotMatch(url, /Private|Invitation|Home|origin|destination|via|token/); assert.match(url, /planVenues=1826/); assert.match(url, /planSeries=5001066/);
  assert.throws(() => contracts.buildSafeTripShareUrl({ ...trip, venueIds: [] }));
});

function preferenceFixture({ patchResult = null, patchError = null, receipt = null, storageError = false, clearError = false, user = OWNER } = {}) {
  const calls = []; const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem(key, value) { if (storageError) throw new Error('Storage unavailable'); values.set(key, value); }, removeItem(key) { if (clearError) throw new Error('Clear unavailable'); values.delete(key); } };
  let resolvePatch;
  const deps = {
    '../lib/supabase': { supabase: {} }, '../lib/ownProfile': { readOwnProfile: async () => ({ data: {}, error: null }) }, '../lib/authUtils': { getAuthUser: () => ({ id: user }) },
    '../lib/poker-near-me/playerPlanning': contracts,
    './pokerNearMePlayerPlanning': { newPlanningOperationId: () => OP, async patchPlayerPreferences(request, _fetcher, expectedUserId) { calls.push({ request, expectedUserId }); if (patchError) throw patchError; if (patchResult === 'defer') return new Promise(resolve => { resolvePatch = resolve; }); return patchResult || { operation_id: OP, action: 'preferences', preferences: request.patch }; }, async checkPlanningOperation(id) { calls.push({ read: id }); return receipt; } },
  };
  const prior = globalThis.sessionStorage;
  globalThis.sessionStorage = storage;
  const service = compile('src/services/pokerNearMePreferences.js', deps);
  return { service, calls, values, storage, resolve() { resolvePatch({ operation_id: OP, action: 'preferences', preferences: { geofenceAlerts: false } }); }, close() { if (prior === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = prior; } };
}
test('preference writer refuses a simultaneous write before overwriting the first durable operation', async () => {
  const f = preferenceFixture({ patchResult: 'defer' });
  try { const first = f.service.updatePokerNearMePreferences(OWNER, { geofenceAlerts: false }); await assert.rejects(f.service.updatePokerNearMePreferences(OWNER, { locationEnabled: false }), /already being saved/); assert.equal(f.calls.length, 1); assert.equal(JSON.parse(f.values.get(`pnm-preference-pending:${OWNER}`)).operation_id, OP); f.resolve(); await first; assert.equal(f.values.size, 0); } finally { f.close(); }
});
test('preference storage failure and account mismatch send no write', async () => {
  for (const opts of [{ storageError: true }, { user: ID }]) { const f = preferenceFixture(opts); try { await assert.rejects(f.service.updatePokerNearMePreferences(OWNER, { geofenceAlerts: false })); assert.equal(f.calls.length, 0); } finally { f.close(); } }
});
test('unknown preferences retain UUID and explicit recovery reads first then reuses the same UUID', async () => {
  const f = preferenceFixture({ patchError: new Error('Network closed') });
  try { await assert.rejects(f.service.updatePokerNearMePreferences(OWNER, { geofenceAlerts: false }), error => error.operation_id === OP && error.outcome === 'unknown'); assert.equal(f.service.readPendingPreference(OWNER).operation_id, OP); await assert.rejects(f.service.retryPendingPreference(OWNER)); assert.deepEqual(f.calls.map(call => call.read ? 'read' : 'write'), ['write', 'read', 'write']); assert.equal(f.calls[2].request.operation_id, OP); } finally { f.close(); }
});
test('local receipt cleanup failure never relabels a confirmed preference write as unknown', async () => {
  const f = preferenceFixture({ clearError: true }); try { const result = await f.service.updatePokerNearMePreferences(OWNER, { geofenceAlerts: false }); assert.equal(result.geofenceAlerts, false); assert.equal(f.calls.length, 1); assert.equal(f.service.readPendingPreference(OWNER).operation_id, OP); } finally { f.close(); }
});
test('a confirmed but uncleared preference receipt blocks the next write instead of overwriting its identity', async () => {
  const f = preferenceFixture({ clearError: true, receipt: { operation_id: OP, action: 'preferences', preferences: { geofenceAlerts: false } } });
  try {
    await f.service.updatePokerNearMePreferences(OWNER, { geofenceAlerts: false });
    await assert.rejects(f.service.updatePokerNearMePreferences(OWNER, { locationEnabled: false }), error => error.outcome === 'confirmed' && error.operation_id === OP && error.confirmedRefusal);
    assert.deepEqual(f.calls.map(call => call.read ? 'read' : 'write'), ['write', 'read']);
    assert.equal(f.service.readPendingPreference(OWNER).patch.geofenceAlerts, false);
  } finally { f.close(); }
});
test('client account changes before send or after acknowledgment never mutate/display the wrong account', async () => {
  let user = OWNER; let fetchCalls = 0;
  const client = compile('src/services/pokerNearMePlayerPlanning.js', { '../lib/authUtils': { getAuthUser: () => ({ id: user }), getFreshAccessToken: async () => 'isolated-not-a-real-token' } });
  user = ID;
  await assert.rejects(client.mutatePlayerPlan(request, async () => { fetchCalls++; }, OWNER)); assert.equal(fetchCalls, 0);
  user = OWNER;
  await assert.rejects(client.mutatePlayerPlan(request, async () => { fetchCalls++; user = ID; return { ok: true, json: async () => ({ success: true, operation_id: OP, action: 'create', plan: { id: ID } }) }; }, OWNER), /account changed/);
  assert.equal(fetchCalls, 1);
});
test('venue game preferences never claim an unimplemented background sender or a missing persisted row', async () => {
  for (const mode of ['new', 'existing', 'lookup-error', 'missing']) {
    let writes = 0;
    const client = { from() { let inserting = false; const q = { select() { return q; }, eq() { return q; }, insert() { inserting = true; writes++; return q; }, async maybeSingle() { return { data: mode === 'existing' || (inserting && mode !== 'missing') ? { id: ID } : null, error: mode === 'lookup-error' ? { message: 'Lookup unavailable' } : null }; } }; return q; } };
    const route = compile('pages/api/poker/venue-alerts.js', { '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: { id: OWNER }, error: null }) }, '../../../src/lib/supabaseServerClient': { createClient: () => client }, '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {} }, '../../../src/lib/apiErrorHandler': { reportApiError() {} } }).default;
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await route({ method: 'POST', headers: { authorization: 'Bearer isolated-not-a-real-session' }, body: { venue_name: 'Venue', game_type: 'NLH' } }, res);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    if (['new', 'existing'].includes(mode)) { assert.equal(res.statusCode, mode === 'new' ? 201 : 200); assert.equal(res.body.delivery_status, 'preference_only'); assert.match(res.body.message, /Background Game-Start Delivery Is Not Available/); }
    else { assert.equal(res.statusCode, 500); assert.equal(res.body.delivery_status, undefined); }
    assert.equal(writes, ['new', 'missing'].includes(mode) ? 1 : 0);
  }
});
test('trip validation preserves private planning values but refuses extra URL or invitation credentials', () => {
  assert.deepEqual(contracts.validateTripDocument(trip), { ...trip, seriesIds: [] });
  assert.throws(() => contracts.validateTripDocument({ ...trip, invitation_token: 'private' }));
  assert.throws(() => contracts.validateSearchDocument({ ...search, location: { ...search.location, lat: 1 } }));
});
