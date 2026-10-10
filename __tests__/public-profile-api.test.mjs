import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadSurface } from './social-poker-card-harness.mjs';
import { stripComments } from '../scripts/ci/lib/rpc-calls.mjs';

const ROUTE = 'pages/api/profile/public.js';
const SOURCE = readFileSync(join(ROOT, ROUTE), 'utf8');
const CODE = stripComments(SOURCE);
const LIMITS = { read: { max: 60, windowMs: 60_000 } };
const ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'river_player',
  display_name: 'River Player',
  bio: 'Poker player',
  avatar_url: '/avatar.png',
  arena_avatar_url: null,
  use_avatar_as_profile_pic: false,
  player_number: 42,
  level: 7,
  tier: 'silver',
  created_at: '2026-01-01T00:00:00Z',
  website: null,
  twitter: null,
  instagram: null,
  favorite_game: 'holdem',
  favorite_hand: 'AKs',
  favorite_hand_plo: null,
  home_casino: null,
  cover_photo_url: null,
  cover_photo_position: null,
  status: 'active',
  email: 'private@example.test',
  full_name: 'Private Name',
  diamonds: 999,
};

function load({ row = ROW, dbError = null, limited = false } = {}) {
  const calls = { tables: [], rateLimit: [], reports: [] };
  const supabase = {
    from(table) {
      calls.tables.push(table);
      return {
        select(columns) {
          return {
            ilike(column, value) {
              return {
                async maybeSingle() {
                  calls.query = { columns, column, value };
                  return { data: dbError ? null : row, error: dbError };
                },
              };
            },
          };
        },
      };
    },
  };
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  try {
    const { module } = loadSurface(ROUTE, {
      mocks: {
        'src/lib/supabaseServerClient.js': { createClient: () => supabase },
        'src/lib/apiRateLimit.js': {
          LIMITS,
          applyRateLimit: (_req, res, opts) => {
            calls.rateLimit.push(opts);
            if (limited) {
              res.status(429).json({ success: false, error: 'Too many requests' });
              return false;
            }
            return true;
          },
        },
        'src/lib/apiErrorHandler.js': {
          reportApiError: (error) => calls.reports.push(error?.message),
        },
      },
    });
    return { module, handler: module.default, calls };
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
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  return { req: { method, query, headers: {} }, res };
}

test('one eligible profile returns only the explicit display-safe snapshot', async () => {
  const { module, handler, calls } = load();
  const { req, res } = request({ username: ' river_player ' });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  assert.deepEqual(calls.tables, ['profiles']);
  assert.deepEqual(calls.rateLimit, [LIMITS.read]);
  assert.equal(calls.query.column, 'username');
  assert.equal(calls.query.value, 'river\\_player');
  assert.ok(calls.query.columns.includes('status'));
  assert.deepEqual(Object.keys(res.body.profile), module.PUBLIC_PROFILE_FIELDS);
  for (const forbidden of [
    'email',
    'phone',
    'full_name',
    'diamonds',
    'status',
    'settings',
    'preferences',
  ]) {
    assert.equal(Object.hasOwn(res.body.profile, forbidden), false, forbidden);
    assert.equal(module.PUBLIC_PROFILE_FIELDS.includes(forbidden), false, forbidden);
  }
});

test('invalid input and rate limits stop before the service read', async () => {
  for (const username of [
    undefined,
    '',
    ['one', 'two'],
    'x'.repeat(65),
    'bad/name',
    'bad\u0000name',
  ]) {
    const { handler, calls } = load();
    const { req, res } = request({ username });
    await handler(req, res);
    assert.equal(res.statusCode, 400, JSON.stringify(username));
    assert.deepEqual(calls.tables, []);
  }
  const limited = load({ limited: true });
  const { req, res } = request({ username: 'river_player' });
  await limited.handler(req, res);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(limited.calls.tables, []);
});

test('absent or ineligible is 404, while an unavailable owner read is 503', async () => {
  for (const row of [null, { ...ROW, status: 'deleted' }, { ...ROW, status: 'SUSPENDED' }]) {
    const { handler } = load({ row });
    const { req, res } = request({ username: 'river_player' });
    await handler(req, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, error: 'Profile not found' });
  }

  const unavailable = load({ dbError: { code: '42501', message: 'permission denied' } });
  const { req, res } = request({ username: 'river_player' });
  await unavailable.handler(req, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { success: false, error: 'Profile temporarily unavailable' });
});

test('only GET is served and every response is no-store', async () => {
  const { handler, calls } = load();
  const { req, res } = request({ username: 'river_player' }, 'POST');
  await handler(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  assert.deepEqual(calls.tables, []);
  assert.deepEqual(calls.rateLimit, []);
});

test('the route never falls back to an anon key or returns its raw service row', () => {
  assert.match(CODE, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(CODE, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(CODE, /publicProfileSnapshot\(data\)/);
  assert.doesNotMatch(CODE, /profile:\s*data/);
  assert.doesNotMatch(SOURCE, /[\u2013\u2014]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});
