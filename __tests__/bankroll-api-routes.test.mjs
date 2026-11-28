// Bankroll Manager API routes (wave 2, 2026-11-27): one front door for
// method, token and identity, validated inputs, no internal messages in a
// response, per-player answers never publicly cached, and every client caller
// sending the player's token.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as apiGuard from '../src/lib/bankroll/apiGuard.mjs';
import * as ledgerReport from '../src/lib/bankroll/ledgerReport.mjs';
import * as taxMath from '../src/lib/bankroll/taxMath.mjs';
import * as projectionMath from '../src/lib/bankroll/projectionMath.mjs';
import { loadGeofenceVenues } from '../src/lib/bankroll/geofenceVenues.mjs';

const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const {
  clientDay, exportRequest, geofenceVisitRequest, guardBankrollRequest, ledgerDay,
  nearbyPoint, pdfExportRequest, requestErrorMessage, taxReportRequest,
} = apiGuard;

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    send(b) { this.body = b; this.headersSent = true; return this; },
  };
}

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const TOKEN = 'Bearer ' + 'x'.repeat(40);

// ---------------------------------------------------------------- pure rules

test('ledgerDay accepts only real calendar days', () => {
  assert.equal(ledgerDay('2026-02-28'), '2026-02-28');
  assert.equal(ledgerDay('2028-02-29'), '2028-02-29');
  for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '2026-01-01T00:00:00Z', '', null, ['2026-01-01'], 20260101]) {
    assert.equal(ledgerDay(bad), null, String(bad));
  }
  assert.equal(clientDay('2026-11-27', new Date('2026-11-28T03:00:00Z')), '2026-11-27', 'the player day wins over UTC');
  assert.equal(clientDay('junk', new Date('2026-11-28T03:00:00Z')), '2026-11-28');
});

test('export, pdf and tax inputs are checked before they reach a query', () => {
  assert.deepEqual(exportRequest(undefined), { format: 'csv', start: null, end: null, today: undefined });
  assert.equal(exportRequest({ format: 'xml' }).error, 'Format must be csv or json');
  assert.ok(exportRequest({ dateRange: { start: '2026-99-01' } }).error);
  assert.ok(exportRequest({ dateRange: { start: '2026-05-01', end: '2026-04-01' } }).error);
  assert.deepEqual(exportRequest({ format: 'json', dateRange: { start: '2026-01-01' }, today: '2026-11-27' }),
    { format: 'json', start: '2026-01-01', end: null, today: '2026-11-27' });

  assert.equal(pdfExportRequest({ category: 'all' }).category, null);
  assert.equal(pdfExportRequest({ category: 'poker_mtt' }).category, 'poker_mtt');
  assert.equal(pdfExportRequest({ category: 'constructor' }).error, 'Unknown category');
  assert.ok(pdfExportRequest({ startDate: ['2026-01-01', '2026-02-01'] }).error, 'a repeated parameter is refused');

  const now = new Date('2026-06-01T12:00:00Z');
  assert.deepEqual(taxReportRequest({ year: '2025', format: 'json', today: '2026-06-01' }, now), { year: 2025, format: 'json', today: '2026-06-01' });
  assert.equal(taxReportRequest({ year: '2025abc' }, now).error, 'Invalid tax year');
  assert.equal(taxReportRequest({ year: '1999' }, now).error, 'Invalid tax year');
  assert.equal(taxReportRequest({ year: '2025', format: 'docx' }, now).error, 'Format must be pdf or json');
  assert.equal(taxReportRequest({ today: '2027-01-01' }, new Date('2026-12-31T23:00:00Z')).year, 2027,
    'no year means the player\'s own year, not the server clock');
});

test('geofence inputs: a uuid venue, a bounded name, a coarse position', () => {
  assert.ok(geofenceVisitRequest({ venueId: 42 }).error, 'directory ids are integers; the column is uuid');
  assert.deepEqual(geofenceVisitRequest({ venueId: USER.id, venueName: '  ' }), { venueId: USER.id, venueName: 'Poker Venue' });
  assert.equal(geofenceVisitRequest({ venueId: USER.id, venueName: 'x'.repeat(500) }).venueName.length, 120);
  assert.equal(nearbyPoint({}), null);
  assert.deepEqual(nearbyPoint({ lat: '36.11472', lng: '-115.17281' }), { lat: 36.11, lng: -115.17 });
  assert.ok(nearbyPoint({ lat: '91', lng: '0' }).error);
  assert.ok(nearbyPoint({ lat: 'abc', lng: '0' }).error);
});

test('every refusal has its own words on the screen', () => {
  assert.equal(requestErrorMessage(401, 'x', { signIn: 'Sign in' }), 'Sign in');
  assert.match(requestErrorMessage(403, 'x'), /Bankroll Pro/);
  assert.match(requestErrorMessage(429, 'x'), /Wait A Minute/);
  assert.match(requestErrorMessage(503, 'x'), /Unavailable/);
  assert.equal(requestErrorMessage(500, 'Export Failed'), 'Export Failed');
});

// ---------------------------------------------------------------- the guard

test('the guard answers method, token and identity in that order', async () => {
  let calls = 0;
  const verify = async () => { calls += 1; return { user: USER, error: null }; };

  let res = mockRes();
  assert.equal(await guardBankrollRequest({ method: 'GET', headers: { authorization: TOKEN } }, res, { methods: ['POST'], verify }), null);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.equal(calls, 0, 'a wrong method never reaches token verification');

  res = mockRes();
  assert.equal(await guardBankrollRequest({ method: 'POST', headers: {} }, res, { methods: ['POST'], verify }), null);
  assert.equal(res.statusCode, 401);
  res = mockRes();
  await guardBankrollRequest({ method: 'POST', headers: { authorization: 'Bearer ' } }, res, { methods: ['POST'], verify });
  assert.equal(res.statusCode, 401);
  assert.equal(calls, 0);

  res = mockRes();
  assert.deepEqual(await guardBankrollRequest({ method: 'POST', headers: { authorization: TOKEN } }, res, { methods: ['POST'], verify }), USER);
  assert.equal(res.body, undefined, 'a verified request is not answered by the guard');

  res = mockRes();
  await guardBankrollRequest({ method: 'POST', headers: { authorization: TOKEN } }, res,
    { methods: ['POST'], verify: async () => ({ user: null, error: 'SESSION_CHECK_UNAVAILABLE', status: 503 }) });
  assert.equal(res.statusCode, 503, 'an outage is not "sign in again"');

  res = mockRes();
  await guardBankrollRequest({ method: 'POST', headers: { authorization: TOKEN } }, res,
    { methods: ['POST'], verify: async () => ({ user: null, error: 'SESSION_REVOKED', status: 401 }) });
  assert.equal(res.statusCode, 401);

  res = mockRes();
  await guardBankrollRequest({ method: 'POST', headers: { authorization: TOKEN } }, res,
    { methods: ['POST'], verify: async () => { throw new Error('jwks fetch failed at 10.0.0.1'); } });
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /jwks|10\.0\.0\.1/, 'no internal message leaves the route');
});

// ---------------------------------------------------------------- the routes, run

/** A query builder that records every call and answers by table. */
function fakeDb(answer) {
  const log = [];
  const client = {
    log,
    from(table) {
      const calls = [];
      log.push({ table, calls });
      const builder = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve, reject) => Promise.resolve(answer(table, calls)).then(resolve, reject);
          }
          return (...args) => { calls.push([prop, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
  return client;
}

function loadRoute(path, { db, access = true, user = USER, extra = {} }) {
  let babel;
  try { babel = require('@babel/core'); } catch { return null; }
  const { code: compiled } = babel.transformSync(read(path), {
    filename: path.split('/').pop(), babelrc: false, configFile: false, presets: [require.resolve('next/babel')],
  });
  const imports = {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async (req) => (req.headers.authorization === TOKEN ? { user, error: null } : { user: null, error: 'Invalid Token' }) },
    '../../../src/lib/apiSupabase': { getServiceSupabase: () => db },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {}, read: {}, ai: {} } },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/gates/serverFeatureGate': { checkServerFeatureAccess: async () => ({ hasAccess: access }) },
    '../../../src/lib/bankroll/apiGuard.mjs': apiGuard,
    '../../../src/lib/bankroll/ledgerReport.mjs': ledgerReport,
    '../../../src/lib/bankroll/taxMath.mjs': taxMath,
    '../../../src/lib/bankroll/projectionMath.mjs': projectionMath,
    ...extra,
  };
  const exportsObj = {};
  runInNewContext(compiled, {
    exports: exportsObj,
    require: (p) => (Object.hasOwn(imports, p) ? imports[p] : require(p)),
    process: { env: {} }, console: { warn() {}, log() {}, debug() {} }, Buffer, URL, Date, Math, Promise,
  });
  return exportsObj.default;
}

const call = async (handler, req) => {
  const res = mockRes();
  await handler({ headers: {}, query: {}, ...req }, res);
  return res;
};

test('export: 405 before auth, 401 without a token, 400 on a bad date, every row read', async (t) => {
  const rows = [
    { id: 'a', entry_date: '2026-03-02', category: 'poker_cash', gross_in: 100, gross_out: 250, created_at: 'x' },
    { id: 'b', entry_date: '2026-03-01', category: 'deposit', gross_in: 0, gross_out: 1000, created_at: 'x' },
  ];
  const db = fakeDb(() => ({ data: rows, error: null }));
  const handler = loadRoute('pages/api/bankroll/export.js', { db });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');

  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN } })).statusCode, 405);
  assert.equal((await call(handler, { method: 'POST', body: {} })).statusCode, 401);
  const bad = await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { dateRange: { start: 'yesterday' } } });
  assert.equal(bad.statusCode, 400);
  assert.equal(db.log.length, 0, 'a bad date never reaches the database');

  const ok = await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { format: 'csv', today: '2026-11-27', dateRange: { start: '2026-01-01' } } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.filename, 'bankroll_export_2026-11-27.csv');
  assert.equal(ok.body.summary.netPL, 150, 'a deposit is not profit');
  assert.equal(ok.body.summary.deposits, 1000);
  const ledger = db.log.find((q) => q.table === 'bankroll_ledger').calls;
  assert.deepEqual(ledger.find((c) => c[0] === 'eq' && c[1] === 'user_id'), ['eq', 'user_id', USER.id], 'identity is the JWT');
  assert.ok(ledger.some((c) => c[0] === 'eq' && c[1] === 'is_revision' && c[2] === false));
  assert.ok(ledger.some((c) => c[0] === 'gte' && c[2] === '2026-01-01'));
  assert.ok(ledger.some((c) => c[0] === 'range'), 'paged past the PostgREST cap');
  assert.equal(ok.headers['cache-control'], 'private, no-store');

  const denied = loadRoute('pages/api/bankroll/export.js', { db, access: false });
  assert.equal((await call(denied, { method: 'POST', headers: { authorization: TOKEN }, body: {} })).statusCode, 403);
});

test('tax report: strict year, failed reads are errors, not zeros', async (t) => {
  let failTrips = false;
  const db = fakeDb((table) => {
    if (table === 'bankroll_ledger') return { data: [{ id: 'a', entry_date: '2025-01-01', category: 'poker_mtt', gross_in: 100, gross_out: 6000, created_at: 'x' }], error: null };
    if (table === 'bankroll_trips') return failTrips ? { data: null, error: { message: 'relation "bankroll_trips" permission denied' } } : { data: [{ id: 't' }], error: null };
    if (table === 'w2g_forms') return { data: [{ upload_date: '2025-02-01', gross_amount: '6000', withholding_amount: null, federal_withheld: null, state_withheld: null }], error: null };
    return { data: [], error: null };
  });
  const handler = loadRoute('pages/api/bankroll/tax-report.js', { db });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');

  assert.equal((await call(handler, { method: 'POST', headers: { authorization: TOKEN } })).statusCode, 405);
  assert.equal((await call(handler, { method: 'GET', query: { year: '2025' } })).statusCode, 401);
  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { year: '2025abc' } })).statusCode, 400);

  const ok = await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { year: '2025', format: 'json', today: '2025-06-01' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.summary.totalTrips, 1);
  assert.equal(ok.body.w2gEvents.length, 1, 'a $5,900 net tournament win is W-2G reportable');
  assert.equal(ok.body.uploadedW2gForms[0].withheld, null, 'a missing figure stays null');

  failTrips = true;
  const failed = await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { year: '2025', format: 'json' } });
  assert.equal(failed.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(failed.body), /permission|relation/, 'the database message stays on the server');
});

test('projection: POST only, validated, gaming sessions only', async (t) => {
  const db = fakeDb(() => ({ data: Array.from({ length: 6 }, (_, i) => ({ category: 'poker_cash', gross_in: 100, gross_out: i % 2 ? 300 : 0, entry_date: '2026-01-0' + (i + 1) })), error: null }));
  const handler = loadRoute('pages/api/bankroll/projection.js', { db });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');
  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN } })).statusCode, 405);
  assert.equal((await call(handler, { method: 'POST', body: {} })).statusCode, 401);
  assert.equal((await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { sessionsPerWeek: 3, projectionDays: 45 } })).statusCode, 400);
  const ok = await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { sessionsPerWeek: 3, projectionDays: 30, currentBankroll: 1000 } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.success, true);
});

test('linked venues: private, token-only, directory coordinates, nearby by position', async (t) => {
  const db = fakeDb((table) => {
    if (table === 'bankroll_locations') return { data: [
      { id: 'loc1', name: 'My Room', venue_type: null, latitude: null, longitude: null, poker_venue_id: 7, poker_venues: { latitude: '36.1', longitude: '-115.1', venue_type: 'casino' } },
      { id: 'loc2', name: 'No Position', latitude: null, longitude: null, poker_venue_id: 8, poker_venues: null },
    ], error: null };
    return { data: [{ id: 7, name: 'Dup', latitude: 36.1, longitude: -115.1 }, { id: 9, name: 'Near', venue_type: 'card_room', latitude: 36.2, longitude: -115.2 }], error: null };
  });
  const handler = loadRoute('pages/api/bankroll/linked-venues.js', { db });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');

  const anon = await call(handler, { method: 'GET', query: { userId: USER.id } });
  assert.equal(anon.statusCode, 401, 'a userId in the query names nobody');
  assert.equal(anon.headers['cache-control'], 'private, no-store');
  assert.equal((await call(handler, { method: 'POST', headers: { authorization: TOKEN } })).statusCode, 405);
  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { lat: 'x', lng: '1' } })).statusCode, 400);

  const ok = await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { lat: '36.11', lng: '-115.17', userId: 'someone-else' } });
  assert.equal(ok.statusCode, 200);
  assert.doesNotMatch(String(ok.headers['cache-control']), /public|s-maxage/);
  assert.deepEqual(JSON.parse(JSON.stringify(ok.body.venues.map((v) => [v.id, v.linked, v.latitude]))), [[7, true, 36.1], [9, false, 36.2]]);
  assert.equal(ok.body.venues[0].venue_type, 'casino');
  const loc = db.log.find((q) => q.table === 'bankroll_locations').calls;
  assert.deepEqual(loc.find((c) => c[0] === 'eq'), ['eq', 'user_id', USER.id]);
  const nearby = db.log.find((q) => q.table === 'poker_venues').calls;
  assert.ok(nearby.some((c) => c[0] === 'gte' && c[1] === 'latitude'), 'nearby venues are bounded by position');
});

test('geofence visit: uuid venue, no crash on an empty insert, failed check is an error', async (t) => {
  let insertRow = { id: 'visit-1' };
  const db = fakeDb((table, calls) => {
    if (calls.some((c) => c[0] === 'insert')) return { data: insertRow, error: null };
    return { data: [], error: null };
  });
  const handler = loadRoute('pages/api/bankroll/geofence-visit.js', { db });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');
  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN } })).statusCode, 405);
  assert.equal((await call(handler, { method: 'POST', body: { venueId: USER.id } })).statusCode, 401);
  assert.equal((await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { venueId: 12 } })).statusCode, 400);
  const ok = await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { venueId: USER.id, venueName: 'Room' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.visitId, 'visit-1');
  insertRow = null;
  const empty = await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { venueId: USER.id } });
  assert.equal(empty.statusCode, 500);
  assert.equal(empty.body.error, 'Failed to record visit');
});

test('readers: POST only, token first, no internal detail in a failure', async (t) => {
  const db = fakeDb(() => ({ data: [], error: null }));
  const boom = { parseReceiptText: () => { throw new Error('secret stack at /var/task/x.js'); } };
  const handler = loadRoute('pages/api/bankroll/scan-receipt.js', { db, extra: { '../../../src/lib/bankroll/receiptParser.mjs': boom } });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');
  assert.equal((await call(handler, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(handler, { method: 'POST', body: { text: 'x' } })).statusCode, 401);
  const failed = await call(handler, { method: 'POST', headers: { authorization: TOKEN }, body: { text: 'BELLAGIO' } });
  assert.equal(failed.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(failed.body), /secret|var\/task/);
});

// ---------------------------------------------------------------- the callers

test('the geofence asks for venues only with a token and an already granted location', async () => {
  const fetched = [];
  const fetcher = async (url, init) => { fetched.push({ url, init }); return { ok: true, json: async () => ({ success: true, venues: [{ id: 1 }] }) }; };
  const geolocation = { getCurrentPosition: (ok) => ok({ coords: { latitude: 41.87811, longitude: -87.62980 } }) };

  const prompt = await loadGeofenceVenues({ getToken: async () => 't', fetcher, nav: { geolocation, permissions: { query: async () => ({ state: 'prompt' }) } } });
  assert.equal(prompt.reason, 'not-granted', 'never raises the location prompt on page load');
  const noApi = await loadGeofenceVenues({ getToken: async () => 't', fetcher, nav: { geolocation } });
  assert.equal(noApi.reason, 'not-granted');
  const signedOut = await loadGeofenceVenues({ getToken: async () => null, fetcher, nav: { geolocation, permissions: { query: async () => ({ state: 'granted' }) } } });
  assert.equal(signedOut.reason, 'signed-out');
  assert.equal(fetched.length, 0);

  const ok = await loadGeofenceVenues({ getToken: async () => 'tok', fetcher, nav: { geolocation, permissions: { query: async () => ({ state: 'granted' }) } } });
  assert.deepEqual(ok.venues, [{ id: 1 }]);
  assert.equal(fetched[0].url, '/api/bankroll/linked-venues?lat=41.88&lng=-87.63');
  assert.equal(fetched[0].init.headers.Authorization, 'Bearer tok');

  const refused = await loadGeofenceVenues({ getToken: async () => 'tok', fetcher: async () => ({ ok: false, status: 401 }), nav: { geolocation, permissions: { query: async () => ({ state: 'granted' }) } } });
  assert.equal(refused.reason, 'refused-401');
});

test('callers send the token and never name the player in a URL', () => {
  const page = code('pages/hub/bankroll-manager.js');
  assert.doesNotMatch(page, /linked-venues\?userId/);
  assert.match(page, /loadGeofenceVenues\(\{ getToken: getFreshAccessToken \}\)/);
  assert.match(code('src/lib/geofencePush.js'), /Authorization: `Bearer \$\{token\}`/);
  const tax = code('src/components/bankroll/TaxReportPanel.jsx');
  assert.match(tax, /format=json&today=\$\{localDay\(\)\}/);
  assert.match(tax, /requestErrorMessage\(res\.status/);
  assert.match(code('src/lib/bankroll/exportDownload.mjs'), /requestErrorMessage\(response\.status/);
  assert.match(code('src/components/bankroll/DealerVault.jsx'), /refusal\.status = res\.status/);
  assert.match(code('src/components/bankroll/toke/DealerReference.jsx'), /response\.json\(\)\.catch/);
});

test('every bankroll route uses the guard, keeps answers private and leaks nothing', () => {
  const routes = fs.readdirSync(new URL('../pages/api/bankroll/', import.meta.url)).filter((f) => f.endsWith('.js'));
  assert.ok(routes.length >= 8);
  for (const f of routes) {
    const src = code('pages/api/bankroll/' + f);
    assert.match(src, /guardBankrollRequest\(req, res, \{/, `${f} must use the shared guard`);
    assert.doesNotMatch(src, /s-maxage|public,/, `${f} answers are per player`);
    assert.doesNotMatch(src, /detail:\s*String\(/, `${f} must not return an internal message`);
    assert.doesNotMatch(src, /req\.(query|body)\??\.userId/, `${f} takes identity from the JWT only`);
    assert.doesNotMatch(src, /\.single\(\)/);
    assert.doesNotMatch(src, /@supabase\/supabase-js/);
    assert.match(src, /applyRateLimit\(req, res, /, `${f} must be rate limited`);
  }
  const dealer = code('pages/api/jarvis/dealer-reference.js');
  assert.match(dealer, /applyRateLimit\(req, res, LIMITS\.ai\)/, 'a billed model call uses the AI limit');
  assert.match(dealer, /Array\.isArray\(body\.history\)/);
});

test('dealer reference bounds the history it forwards to the model', async (t) => {
  let babel;
  try { babel = require('@babel/core'); } catch { return t.skip('@babel/core is not installed here; CI runs this'); }
  const { code: compiled } = babel.transformSync(read('pages/api/jarvis/dealer-reference.js'), {
    filename: 'dealer-reference.js', babelrc: false, configFile: false, presets: [require.resolve('next/babel')],
  });
  const sent = [];
  const imports = {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: USER }) },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { ai: {} } },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/grokClient': { getGrokClient: () => ({ chat: { completions: { async create(p) { sent.push(p); return { choices: [{ message: { content: 'Answer.' } }] }; } } } }) },
  };
  const api = {};
  runInNewContext(compiled, { exports: api, require: (p) => (Object.hasOwn(imports, p) ? imports[p] : require(p)), process: { env: {} }, console });
  const res = mockRes();
  await api.default({ method: 'POST', headers: { authorization: TOKEN }, body: { query: 'Button?', history: 'not-an-array' } }, res);
  assert.equal(res.statusCode, 200, 'a bad history is ignored, not a 500');
  const res2 = mockRes();
  const history = Array.from({ length: 9 }, (_, i) => ({ question: 'q' + i, answer: 'a'.repeat(5000) })).concat([{ question: 7 }]);
  await api.default({ method: 'POST', headers: { authorization: TOKEN }, body: { query: 'Button?', history } }, res2);
  const messages = sent.at(-1).messages;
  assert.equal(messages.length, 1 + 8 + 1, 'system, four exchanges, the question');
  assert.ok(messages.every((m) => m.content.length <= 2000 || m.role === 'system'));
});

test('pdf export: GET only, token first, bad dates and categories refused before any read', async (t) => {
  const db = fakeDb(() => ({ data: [], error: null }));
  const handler = loadRoute('pages/api/bankroll/export-pdf.js', { db });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');
  const post = await call(handler, { method: 'POST', headers: { authorization: TOKEN } });
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.allow, 'GET');
  assert.equal((await call(handler, { method: 'GET' })).statusCode, 401);
  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { startDate: '2026-02-31' } })).statusCode, 400);
  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { category: 'x' } })).statusCode, 400);
  assert.equal(db.log.length, 0);
  const denied = loadRoute('pages/api/bankroll/export-pdf.js', { db, access: false });
  assert.equal((await call(denied, { method: 'GET', headers: { authorization: TOKEN } })).statusCode, 403);
});
