/**
 * GET /api/profile/hand-stats: the route behind the "At The Tables" card.
 *
 * The handler is loaded through the social-poker-card harness (real source,
 * transpiled, every import replaced by a fake this file controls), so each
 * case below exercises the route's own code: the uuid gate, the rate limit
 * call, the profile lookup, the RPC, the cache header and the error shapes.
 * No network, no database, no flag.
 *
 * Run: node --test __tests__/profile-hand-stats-api.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadSurface } from './social-poker-card-harness.mjs';
import { stripComments } from '../scripts/ci/lib/rpc-calls.mjs';

const ROUTE = 'pages/api/profile/hand-stats.js';
const SOURCE = readFileSync(join(ROOT, ROUTE), 'utf8');
// The header explains what the route does NOT do; the law is asserted on code.
const CODE = stripComments(SOURCE);
const LIMITS = { read: { max: 60, windowMs: 60_000, scope: 'read' } };
const USER = '0b3d4c0e-6f3a-4c2a-9c2e-1f9a7f0a1234';
const RAW_STATS = {
  hands30d: 4321,
  sessions30d: 37,
  daysActive30d: 12,
  biggestPotWon30d: 283467.5,
  handsThisMonth: 1200,
  lastPlayed: '2026-09-29',
  computedAt: '2026-09-30T17:00:00+00:00',
};

function load({ profile = { id: USER }, profileError = null, rpc = { data: RAW_STATS, error: null }, limited = false } = {}) {
  const calls = { tables: [], rpc: [], rateLimit: [], reports: [] };
  const supabase = {
    from(table) {
      calls.tables.push(table);
      return {
        select: (columns) => ({
          eq: (column, value) => ({
            maybeSingle: async () => {
              calls.profileQuery = { columns, column, value };
              return { data: profileError ? null : profile, error: profileError };
            },
          }),
        }),
      };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (rpc instanceof Error) throw rpc;
      return rpc;
    },
  };
  const { module } = loadSurface(ROUTE, {
    mocks: {
      'src/lib/supabaseServerClient.js': { createClient: () => supabase },
      'src/lib/apiRateLimit.js': {
        LIMITS,
        applyRateLimit: (req, res, opts) => {
          calls.rateLimit.push(opts);
          if (limited) {
            res.setHeader('Retry-After', '60');
            res.status(429).json({ success: false, error: 'Too many requests' });
            return false;
          }
          return true;
        },
      },
      'src/lib/apiErrorHandler.js': { reportApiError: (error) => calls.reports.push(error?.message) },
    },
  });
  return { handler: module.default, module, calls };
}

function request(query, method = 'GET') {
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

test('a missing or malformed user_id is a 400 before anything is read', async () => {
  for (const query of [{}, { user_id: 'not-a-uuid' }, { user_id: ['x'] }, { user_id: `${USER}; drop` }]) {
    const { handler, calls } = load();
    const { req, res } = request(query);
    await handler(req, res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
    assert.equal(res.body.success, false);
    assert.deepEqual(calls.tables, [], 'no profile read for a bad id');
    assert.deepEqual(calls.rpc, [], 'no RPC for a bad id');
  }
});

test('the read rate limit is applied with LIMITS.read and a limited caller gets nothing else', async () => {
  const open = load();
  await open.handler(...Object.values(request({ user_id: USER })));
  assert.deepEqual(open.calls.rateLimit, [LIMITS.read]);

  const limited = load({ limited: true });
  const { req, res } = request({ user_id: USER });
  await limited.handler(req, res);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(limited.calls.tables, []);
  assert.deepEqual(limited.calls.rpc, []);
});

test('a real profile answers 200 with normalized stats and a five minute public cache', async () => {
  const { handler, calls } = load();
  const { req, res } = request({ user_id: USER.toUpperCase() });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=300');
  assert.deepEqual(calls.tables, ['profiles']);
  assert.deepEqual(calls.profileQuery, { columns: 'id', column: 'id', value: USER.toUpperCase() });
  assert.deepEqual(calls.rpc, [{ name: 'fn_profile_hand_stats', args: { p_user_id: USER.toUpperCase() } }]);
  assert.deepEqual(res.body, { success: true, stats: RAW_STATS });
});

test('an unknown profile is a 404 and the RPC is never called', async () => {
  const { handler, calls } = load({ profile: null });
  const { req, res } = request({ user_id: USER });
  await handler(req, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, error: 'Profile not found' });
  assert.deepEqual(calls.rpc, []);
  assert.notEqual(res.headers['cache-control'], 'public, max-age=300');
});

test('a failing RPC is a 503 that is never cached, and a throwing one is reported', async () => {
  const failed = load({ rpc: { data: null, error: { message: 'permission denied for function' } } });
  let { req, res } = request({ user_id: USER });
  await failed.handler(req, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { success: false, error: 'Stats temporarily unavailable' });
  assert.equal(res.headers['cache-control'], 'no-store');

  const thrown = load({ rpc: new Error('socket hang up') });
  ({ req, res } = request({ user_id: USER }));
  await thrown.handler(req, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { success: false, error: 'Stats temporarily unavailable' });
  assert.deepEqual(thrown.calls.reports, ['socket hang up']);

  const profileDown = load({ profileError: { message: 'timeout' } });
  ({ req, res } = request({ user_id: USER }));
  await profileDown.handler(req, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(profileDown.calls.rpc, []);
});

test('only GET is served', async () => {
  const { handler, calls } = load();
  const { req, res } = request({ user_id: USER }, 'POST');
  await handler(req, res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(calls.rateLimit, []);
  assert.deepEqual(calls.rpc, []);
});

test('normalizeHandStats gives the card every key, typed, whatever the RPC returned', () => {
  const { module } = load();
  const { normalizeHandStats } = module;
  assert.deepEqual(normalizeHandStats(null), {
    hands30d: 0, sessions30d: 0, daysActive30d: 0, biggestPotWon30d: 0, handsThisMonth: 0, lastPlayed: null, computedAt: null,
  });
  assert.deepEqual(normalizeHandStats({ hands30d: '12', sessions30d: -3, biggestPotWon30d: '99.5', lastPlayed: '', computedAt: 7 }), {
    hands30d: 12, sessions30d: 0, daysActive30d: 0, biggestPotWon30d: 99.5, handsThisMonth: 0, lastPlayed: null, computedAt: null,
  });
  assert.deepEqual(normalizeHandStats(RAW_STATS), RAW_STATS);
});

test('the route is the same path for every profile: no auth, no viewer, no horse test', () => {
  assert.doesNotMatch(CODE, /is_horse|origin_type|scheduler|getServerUser|authorization/i);
  assert.match(SOURCE, /applyRateLimit\(req, res, LIMITS\.read\)/);
  assert.match(SOURCE, /\.rpc\(HAND_STATS_RPC, \{ p_user_id: userId \}\)/);
  assert.match(SOURCE, /export const HAND_STATS_RPC = 'fn_profile_hand_stats'/);
  assert.match(SOURCE, /export const HAND_STATS_CACHE_CONTROL = 'public, max-age=300'/);
  assert.doesNotMatch(SOURCE, /[–—]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});
