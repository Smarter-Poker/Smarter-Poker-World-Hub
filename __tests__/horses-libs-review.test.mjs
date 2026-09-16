/**
 * The shared libraries the Phase 1 review found defects in, tested as code
 * rather than as text.
 *
 * Four things are proved here, each one a finding:
 *
 *   1. toCsv exports NUMBERS AS NUMBERS. The spreadsheet-formula guard was
 *      firing on the leading minus of every negative figure, so -124.5 was
 *      written '-124.5 and reached Excel as text: SUM and AVG over the money
 *      columns silently skipped exactly the rows the export exists to
 *      reconcile (contract addendum item 18).
 *   2. auditOperatorAction NEVER THROWS, including on an action name that
 *      fails ACTION_RE. buildAuditRow used to run outside the try, so a bad
 *      name turned a completed, money-moving mutation into a 500 after the
 *      chips had already moved (contract addendum item 20).
 *   3. The hg wrapper's caller-scoped client is built from the request's own
 *      bearer token, reused on the next request with the same token, and
 *      evicted oldest-first at the cap.
 *   4. stablePick is deterministic - the property the paid avatar prompt
 *      depends on.
 *
 * Nothing here touches Supabase, Sentry or the network. No node_modules is
 * required: every import resolves inside this repo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { toCsv, stampedName, num, signed } from '../src/lib/horsesAdminTokens.js';
import { auditOperatorAction, buildAuditRow, isValidAuditAction } from '../src/lib/horses/operatorAudit.js';
import { stableHash, stableIndex, stablePick } from '../src/lib/horses/hash.js';
import {
  MAX_TOKEN_CLIENTS,
  TOKEN_CLIENT_TTL_MS,
  cacheLookup,
  cacheSize,
  cacheStore,
  getUserDb,
  withHgOperatorRoute,
  _resetHgClientCacheForTests,
} from '../src/lib/horses/hgOperator.js';

// ------------------------------------------------------------------- helpers

/** A supabase-shaped double that records every rpc and insert. */
function fakeDb({ rpcError = null, insertError = null } = {}) {
  const calls = { rpc: [], inserts: [] };
  return {
    calls,
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: null, error: rpcError };
    },
    from(table) {
      return {
        async insert(row) {
          calls.inserts.push({ table, row });
          return { data: null, error: insertError };
        },
      };
    },
  };
}

function fakeReq(headers = {}) {
  return {
    method: 'GET',
    url: '/api/horses/hg-reports',
    headers: { 'user-agent': 'node-test', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    query: {},
    body: {},
  };
}

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

// ---------------------------------------------------------------------- toCsv

const COLUMNS = [
  ['name', 'Name'],
  ['net_bb', 'Net BB'],
];

test('toCsv exports numbers as numbers, negatives included', () => {
  const csv = toCsv(
    [
      { name: 'Ace', net_bb: -124.5 },
      { name: 'Bee', net_bb: 12 },
      { name: 'Cue', net_bb: 0 },
      { name: 'Dee', net_bb: -0.01 },
    ],
    COLUMNS
  );
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Name,Net BB');
  // The whole point: no leading apostrophe on any of these, so SUM works.
  assert.equal(lines[1], 'Ace,-124.5');
  assert.equal(lines[2], 'Bee,12');
  assert.equal(lines[3], 'Cue,0');
  assert.equal(lines[4], 'Dee,-0.01');
  assert.ok(!csv.includes("'-"), 'a negative number must never be quoted into text');
});

test('toCsv leaves numeric STRINGS numeric and still guards non-numeric formulas', () => {
  const csv = toCsv(
    [
      { name: 'signed', net_bb: '+123' },
      { name: 'scientific', net_bb: '1e3' },
      { name: 'leading dot', net_bb: '.5' },
      { name: 'formula', net_bb: '=cmd|calc' },
      { name: 'plus text', net_bb: '+cmd' },
      { name: 'minus text', net_bb: '-cmd' },
      { name: 'at text', net_bb: '@SUM(A1)' },
    ],
    COLUMNS
  );
  const cells = csv.split('\n').slice(1).map((line) => line.split(',').slice(1).join(','));
  assert.equal(cells[0], '+123');
  assert.equal(cells[1], '1e3');
  assert.equal(cells[2], '.5');
  // Non-numeric strings that open with a formula character are still defused.
  assert.equal(cells[3], "'=cmd|calc");
  assert.equal(cells[4], "'+cmd");
  assert.equal(cells[5], "'-cmd");
  assert.equal(cells[6], "'@SUM(A1)");
});

test('toCsv quotes commas, quotes and newlines, and empties null and undefined', () => {
  const csv = toCsv(
    [
      { name: 'Comma, Inc', net_bb: 1 },
      { name: 'He said "hi"', net_bb: 2 },
      { name: 'line\nbreak', net_bb: 3 },
      { name: null, net_bb: undefined },
      { name: { a: 1 }, net_bb: 4 },
    ],
    COLUMNS
  );
  const body = csv.split('\n').slice(1);
  assert.equal(body[0], '"Comma, Inc",1');
  assert.equal(body[1], '"He said ""hi""",2');
  // An embedded newline is quoted, so the row spans two physical lines.
  assert.equal(body[2], '"line');
  assert.equal(body[3], 'break",3');
  assert.equal(body[4], ',');
  assert.equal(body[5], '"{""a"":1}",4');
});

test('toCsv writes no BOM of its own and tolerates a missing row list', () => {
  const csv = toCsv([{ name: 'Ace', net_bb: -1 }], COLUMNS);
  assert.ok(!csv.startsWith('﻿'), 'the BOM belongs to downloadCsv, not to the CSV text');
  assert.equal(csv.charCodeAt(0), 'N'.charCodeAt(0));
  assert.equal(toCsv(null, COLUMNS), 'Name,Net BB\n');
  assert.equal(toCsv([], COLUMNS), 'Name,Net BB\n');
});

test('a formula-looking HEADER is still defused, and the display helpers are unchanged', () => {
  const csv = toCsv([{ x: 1 }], [['x', '=cmd']]);
  assert.equal(csv.split('\n')[0], "'=cmd");
  // num/signed are what the panel renders; the CSV guard must not have moved
  // them. num() returns the dash the review measured '-' against.
  assert.equal(num(undefined), '-');
  assert.equal(signed(123), '+123');
  assert.match(stampedName('horses'), /^horses-\d{4}-\d{2}-\d{2}\.csv$/);
});

// ------------------------------------------------------------- operatorAudit

test('auditOperatorAction never throws on an invalid action and still files a row', async () => {
  const db = fakeDb();
  const op = { user: { id: 'u1' }, role: 'god', db, requestId: 'req-1' };

  for (const bad of ['SetActive', '9lives.go', 'has-hyphen.go', 'a.b.c.d.e', 'nodot', '', null, undefined, 42]) {
    const result = await auditOperatorAction(op, fakeReq(), { action: bad, details: { keep: true } });
    assert.equal(result.ok, true, `an invalid action (${String(bad)}) must still be filed, not thrown`);
    assert.equal(result.row.action, 'unknown.action');
    assert.equal(result.row.details.invalid_action, String(bad));
    assert.equal(result.row.details.keep, true, 'the caller details must survive the fallback');
  }
  assert.equal(db.calls.rpc.length, 9);
  assert.ok(db.calls.rpc.every((c) => c.name === 'fn_log_admin_action'));
  // buildAuditRow itself still refuses a bad name: the fallback lives in the
  // caller, so a test or a lint of the vocabulary keeps its teeth.
  assert.throws(() => buildAuditRow(op, fakeReq(), { action: 'SetActive' }), /Invalid audit action/);
  assert.equal(isValidAuditAction('unknown.action'), true);
});

test('auditOperatorAction never throws when the request or the context is malformed', async () => {
  const db = fakeDb();
  const r1 = await auditOperatorAction({ db }, null, { action: 'a.b' });
  assert.equal(r1.ok, true);
  assert.equal(r1.row.admin_user_id, null);
  assert.equal(r1.row.actor_role, null);
  assert.equal(r1.row.ip_address, null);

  // A db whose rpc throws (not one that returns an error) is the shape that
  // used to escape into the response path.
  const exploding = {
    rpc() {
      throw new Error('connection reset');
    },
  };
  const r2 = await auditOperatorAction({ user: { id: 'u' }, db: exploding }, fakeReq(), { action: 'a.b' });
  assert.equal(r2.ok, false);
  assert.equal(r2.row.action, 'a.b');

  const r3 = await auditOperatorAction(undefined, undefined, undefined);
  assert.equal(r3.ok, false);
  assert.equal(r3.row.action, 'unknown.action');
});

test('the audit row records the CLIENT hop of x-forwarded-for, not the proxy', async () => {
  // extractClientIP (src/lib/antiAbuse.js) and execute-sql both read the first
  // hop; this used to read the last, so an operator behind two proxies was
  // filed under an infrastructure address and the two rows written for a single
  // cashout disagreed with each other.
  const op = { user: { id: 'u1' }, role: 'admin', db: fakeDb() };
  const viaProxies = buildAuditRow(op, fakeReq({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }), {
    action: 'a.b',
  });
  assert.equal(viaProxies.ip_address, '203.0.113.7');

  // x-real-ip still wins where the platform sets it: it cannot be appended to
  // by an upstream proxy.
  const withReal = buildAuditRow(
    op,
    fakeReq({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
    { action: 'a.b' }
  );
  assert.equal(withReal.ip_address, '198.51.100.4');

  // Neither header: the socket, and never a fabricated value.
  assert.equal(buildAuditRow(op, fakeReq(), { action: 'a.b' }).ip_address, '127.0.0.1');
});

// ---------------------------------------------------------------- hgOperator

const LONG_TOKEN = 'a'.repeat(64);

function hgDepsFactory() {
  const created = [];
  const createClient = (url, key, options) => {
    created.push({ url, key, options });
    return { id: created.length, url, key, options };
  };
  return { created, createClient };
}

function routeDeps(op) {
  return {
    LIMITS: { read: { max: 120 }, write: { max: 30 }, default: { max: 60 } },
    applyRateLimit: () => true,
    applyDurableRateLimit: async () => true,
    reportApiError: () => {},
    requireOperator: async () => op,
  };
}

test('getUserDb builds the caller client from the request bearer token and caches it', async () => {
  _resetHgClientCacheForTests();
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-test';
  try {
    const { created, createClient } = hgDepsFactory();
    const first = await getUserDb(LONG_TOKEN, { createClient });
    assert.equal(created.length, 1);
    assert.equal(created[0].key, 'anon-key-for-test', 'the caller client is the ANON client, never service role');
    assert.equal(
      created[0].options.global.headers.Authorization,
      `Bearer ${LONG_TOKEN}`,
      'the caller JWT must be on the client, or auth.uid() is null inside the RPCs'
    );
    assert.equal(created[0].options.auth.persistSession, false);

    const second = await getUserDb(LONG_TOKEN, { createClient });
    assert.equal(second, first, 'the same token must reuse the cached client');
    assert.equal(created.length, 1, 'a second request with the same token must not build a client');

    const other = await getUserDb('b'.repeat(64), { createClient });
    assert.notEqual(other, first);
    assert.equal(created.length, 2);
  } finally {
    if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    _resetHgClientCacheForTests();
  }
});

test('getUserDb refuses without a token and without the anon key', async () => {
  _resetHgClientCacheForTests();
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    await assert.rejects(() => getUserDb(null, {}), (err) => err.status === 401 && err.code === 'unauthorized');
    await assert.rejects(
      () => getUserDb(LONG_TOKEN, { createClient: () => ({}) }),
      (err) => err.status === 503 && err.code === 'anon_key_missing'
    );
  } finally {
    if (prevAnon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    _resetHgClientCacheForTests();
  }
});

test('the hg client cache holds at most 200 clients and evicts oldest-first', async () => {
  _resetHgClientCacheForTests();
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-test';
  try {
    const { created, createClient } = hgDepsFactory();
    for (let i = 0; i < MAX_TOKEN_CLIENTS; i += 1) {
      await getUserDb(`token-${String(i).padStart(4, '0')}-${'x'.repeat(20)}`, { createClient });
    }
    assert.equal(cacheSize(), MAX_TOKEN_CLIENTS);
    assert.equal(created.length, MAX_TOKEN_CLIENTS);

    await getUserDb(`token-overflow-${'x'.repeat(20)}`, { createClient });
    assert.equal(cacheSize(), MAX_TOKEN_CLIENTS, 'the cache must never exceed the cap');
    assert.equal(cacheLookup(`token-0000-${'x'.repeat(20)}`), null, 'the oldest token is the one evicted');
    assert.notEqual(cacheLookup(`token-0001-${'x'.repeat(20)}`), null);

    // An evicted token rebuilds rather than failing.
    await getUserDb(`token-0000-${'x'.repeat(20)}`, { createClient });
    assert.equal(created.length, MAX_TOKEN_CLIENTS + 2);
    assert.equal(cacheSize(), MAX_TOKEN_CLIENTS);

    // TTL is measured from creation and is not refreshed by a hit.
    cacheStore('ttl-token', { id: 'ttl' }, 1_000);
    assert.deepEqual(cacheLookup('ttl-token', 1_000 + TOKEN_CLIENT_TTL_MS - 1), { id: 'ttl' });
    assert.equal(cacheLookup('ttl-token', 1_000 + TOKEN_CLIENT_TTL_MS), null);
  } finally {
    if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    _resetHgClientCacheForTests();
  }
});

test('withHgOperatorRoute hands the handler a userDb built from the caller token, end to end', async () => {
  _resetHgClientCacheForTests();
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-test';
  try {
    const { created, createClient } = hgDepsFactory();
    const serviceDb = fakeDb();
    const op = {
      user: { id: 'op-1' },
      role: 'admin',
      db: serviceDb,
      permissions: ['players.read'],
      requestId: 'req-1',
    };
    const seen = [];
    const route = withHgOperatorRoute(
      { name: 'horses.hg-test', methods: ['GET'], limit: 'read', hgDeps: { createClient } },
      async (ctx) => {
        seen.push(ctx);
        return { ok: true };
      },
      routeDeps(op)
    );

    const req = fakeReq({ authorization: `Bearer ${LONG_TOKEN}` });
    const res = fakeRes();
    await route(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].callerToken, LONG_TOKEN);
    assert.equal(created.length, 1, 'exactly one caller client is built for the request');
    assert.equal(seen[0].userDb.id, 1, 'the handler gets the client the factory just built');
    assert.equal(seen[0].userDb.key, 'anon-key-for-test');
    assert.equal(seen[0].userDb.options.global.headers.Authorization, `Bearer ${LONG_TOKEN}`);
    assert.notEqual(seen[0].userDb, seen[0].db, 'userDb and the service-role db must be different clients');
    assert.equal(seen[0].db, serviceDb);

    // Second request, same token: cache hit, no new client.
    await route(fakeReq({ authorization: `Bearer ${LONG_TOKEN}` }), fakeRes());
    assert.equal(created.length, 1, 'a warm token must not rebuild the client');
    assert.equal(seen[1].userDb, seen[0].userDb);

    // No bearer token at all: 401 through the envelope, handler never runs.
    const anon = fakeRes();
    await route(fakeReq(), anon);
    assert.equal(anon.statusCode, 401);
    assert.equal(anon.body.code, 'unauthorized');
    assert.equal(seen.length, 2, 'the handler must not run without a caller token');
  } finally {
    if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    _resetHgClientCacheForTests();
  }
});

// ---------------------------------------------------------------------- hash

test('stablePick is deterministic and never returns undefined for a real list', () => {
  const styles = ['a', 'b', 'c'];
  const ids = [
    '018f5c2e-1a2b-7c3d-8e4f-0123456789ab',
    'e5a1b2c3-d4e5-4f60-8112-233445566778',
    'ffffffff-ffff-4fff-bfff-ffffffffffff',
  ];
  for (const id of ids) {
    const first = stablePick(styles, id);
    assert.ok(styles.includes(first));
    for (let i = 0; i < 50; i += 1) assert.equal(stablePick(styles, id), first);
    assert.equal(stableIndex(id, styles.length), styles.indexOf(first));
  }

  // The bug it replaces: uuid % n is NaN, so the style interpolated into a PAID
  // prompt was the literal word "undefined".
  assert.ok(Number.isNaN(Number(ids[0]) % styles.length));
  assert.notEqual(String(stablePick(styles, ids[0])), 'undefined');

  assert.equal(stablePick([], 'x'), null);
  assert.equal(stablePick(null, 'x'), null);
  assert.equal(stableIndex('x', 0), 0);
  assert.equal(stableIndex('x', 2.5), 0);
  assert.equal(stableHash(undefined), stableHash(''));
  assert.ok(stableHash('a-horse') >>> 0 === stableHash('a-horse'));

  // Different ids do not all collapse onto one style.
  const spread = new Set();
  for (let i = 0; i < 500; i += 1) spread.add(stablePick(styles, `horse-${i}`));
  assert.deepEqual([...spread].sort(), ['a', 'b', 'c']);
});
