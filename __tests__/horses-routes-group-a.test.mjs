/**
 * Phase 1, route group A: the seven /horses routes rebuilt onto
 * src/lib/horses/operatorRoute.js.
 *
 *   club-arena-admin, stable-admin, mint, economy-stats, anti-abuse,
 *   grinder-stats, analytics
 *
 * Two kinds of test here.
 *
 * (a) CONTRACT tests read each route as TEXT and assert the properties that
 *     are only visible in the source: the wrapper is used, the anon-key
 *     fallback is gone, no route keeps its own ADMIN_ROLES list or its own
 *     auth, every mutating route audits, and the house rules (no `.single(`,
 *     no em dash, no emoji) hold.
 *
 * (b) HANDLER tests import the route module and call its exported `handle`
 *     with a fake `db`, so the real validation, paging and shaping code runs
 *     with no Supabase, no network and no node_modules.
 *
 * Every route is structured as:
 *     export const spec = {...};
 *     export async function handle(ctx) {...}
 *     export default withOperatorRoute(spec, handle);
 * precisely so (b) is possible.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROUTE_DIR = path.join(HERE, '..', 'pages', 'api', 'horses');

const ROUTES = [
  'club-arena-admin.js',
  'stable-admin.js',
  'mint.js',
  'economy-stats.js',
  'anti-abuse.js',
  'grinder-stats.js',
  'analytics.js',
];

/** The routes that write something and therefore must file an audit row. */
const MUTATING = ['club-arena-admin.js', 'stable-admin.js', 'mint.js'];

const source = (file) => fs.readFileSync(path.join(ROUTE_DIR, file), 'utf8');

// Surrogate pairs cover the pictographic planes; the BMP ranges below catch
// the dingbats, arrows-with-colour and misc-symbols that the SWC compiler
// chokes on. CLAUDE.md section 3 rule 7.
// Written entirely as escapes so this file is itself pure ASCII and cannot
// trip the same scanner it implements.
const EMOJI_RE = new RegExp(
  '[' +
    '\\u{1F000}-\\u{1FAFF}' +
    '\\u{1F1E6}-\\u{1F1FF}' +
    '\\u2190-\\u21FF' +
    '\\u2300-\\u27BF' +
    '\\u2B00-\\u2BFF' +
    '\\uFE0F' +
    ']',
  'u'
);
const EM_DASH = '\u2014';

// ---------------------------------------------------------------- contracts

test('every route is built on withOperatorRoute and exports spec + handle', () => {
  for (const file of ROUTES) {
    const text = source(file);
    assert.match(text, /withOperatorRoute\(/, `${file} must use withOperatorRoute`);
    assert.match(text, /export const spec\s*=/, `${file} must export spec`);
    assert.match(text, /export async function handle\(/, `${file} must export handle`);
    assert.match(text, /export default withOperatorRoute\(spec, handle\);/, `${file} default export`);
  }
});

test('no route keeps an anon-key fallback, an ADMIN_ROLES list or its own auth', () => {
  for (const file of ROUTES) {
    const text = source(file);
    assert.doesNotMatch(text, /NEXT_PUBLIC_SUPABASE_ANON_KEY/, `${file} still has the anon-key fallback`);
    assert.doesNotMatch(text, /ADMIN_ROLES/, `${file} still carries its own role list`);
    assert.doesNotMatch(
      text,
      /import\s*\{[^}]*getServerUserWithFallback/,
      `${file} must not verify tokens itself`
    );
    assert.doesNotMatch(text, /function getSupabase\s*\(/, `${file} must not build its own client`);
    assert.doesNotMatch(text, /applyRateLimit\(/, `${file} must let the wrapper rate limit`);
    assert.doesNotMatch(text, /auth\.getUser\(/, `${file} must not call GoTrue per request`);
  }
});

test('every mutating route files an audit row through auditOperatorAction', () => {
  for (const file of MUTATING) {
    const text = source(file);
    assert.match(text, /auditOperatorAction\(/, `${file} must audit its mutations`);
  }
  // And the audit action names are the Phase 1 vocabulary.
  const stable = source('stable-admin.js');
  for (const action of [
    'horse.create',
    'horse.update',
    'horse.set_active',
    'horse.bulk_active',
    'horse.delete',
    'horse.bulk_delete',
    'ticket.set_status',
    'settings.save',
  ]) {
    assert.ok(stable.includes(`'${action}'`), `stable-admin must audit ${action}`);
  }
  assert.ok(source('club-arena-admin.js').includes("'club.set_status'"));
  const mint = source('mint.js');
  assert.ok(mint.includes("'mint.issue'") && mint.includes("'mint.retire'"));
});

test('mint parses money with money2dp and carries a durable limit', () => {
  const text = source('mint.js');
  assert.match(text, /money2dp/, 'mint must use money2dp, not a float comparison');
  assert.doesNotMatch(text, /Math\.round\(amount \* 100\) !== amount \* 100/, 'float bug is gone');
  assert.match(text, /durable:/, 'mint must declare a durable rate limit');
  assert.match(text, /windowSeconds:\s*60/);
  assert.match(text, /max:\s*20/);
  // The money route must never hand a database sentence to the browser.
  assert.doesNotMatch(text, /err\?\.message \|\|/, 'mint must not echo err.message');
  assert.ok(text.includes('fn_ca_mint') && text.includes('fn_ca_burn') && text.includes('fn_ca_mint_overview'));
});

test('stable-admin accepts 500 ids per bulk call and caches its actor list', () => {
  const text = source('stable-admin.js');
  assert.match(text, /const MAX_BULK = 500;/);
  assert.match(text, /ACTOR_CACHE_TTL_MS = 60_000/);
  assert.match(text, /ACTOR_SCAN_ROWS = 5000/);
  assert.match(text, /\.order\('id', \{ ascending: true \}\)\s*\.limit\(1\)/);
});

test('club-arena-admin serves tickets, drops the dead is_bot read and pages', () => {
  const text = source('club-arena-admin.js');
  assert.match(text, /sectionTickets/);
  assert.match(text, /live_help_tickets/);
  assert.doesNotMatch(text, /is_bot/, 'the dead is_bot column read must be gone');
  assert.match(text, /pagedResult|runPaged/);
  // sectionUser collects failures like every other section now.
  assert.match(text, /async function sectionUser\(db, userId, page\)[\s\S]*?c\.check\('profile'/);
});

test('grinder-stats reads player_stats for the page only and refuses club actions', () => {
  const text = source('grinder-stats.js');
  assert.match(text, /IN_CHUNK = 200/);
  assert.match(text, /new ApiError\(501, 'Not Built Yet', 'not_built'\)/);
  assert.doesNotMatch(text, /PLAYER_STATS_CAP/, 'the whole-table player_stats pull must be gone');
});

test('anti-abuse masks raw_email and analytics validates days', () => {
  const abuse = source('anti-abuse.js');
  assert.match(abuse, /maskEmail/);
  assert.doesNotMatch(abuse, /email: a\.raw_email/, 'raw_email must not ship unmasked');
  const analytics = source('analytics.js');
  assert.match(analytics, /int\(query\.days, \{ min: 1, max: 365/);
});

test('house rules: no .single(, no em dash, no emoji, no raw hex leakage', () => {
  for (const file of ROUTES) {
    const text = source(file);
    assert.doesNotMatch(text, /\.single\(/, `${file} must use .maybeSingle()`);
    assert.equal(text.includes(EM_DASH), false, `${file} contains an em dash`);
    const emoji = text.match(EMOJI_RE);
    assert.equal(emoji, null, `${file} contains emoji: ${emoji && JSON.stringify(emoji[0])}`);
  }
});

test('every route imports only pure shared libs at module scope', async () => {
  // If any route reached for supabaseServerClient, serverAuth, sentryWrap or
  // the content engine at module scope, these imports would throw here:
  // node_modules is not installed in this environment.
  for (const file of ROUTES) {
    const mod = await import(path.join(ROUTE_DIR, file));
    assert.equal(typeof mod.default, 'function', `${file} default export must be a handler`);
    assert.equal(typeof mod.handle, 'function');
    assert.ok(mod.spec && Array.isArray(mod.spec.methods));
  }
});

// ---------------------------------------------------------------- fake db

/**
 * A chainable PostgREST-shaped stub. Every filter method returns the chain;
 * `range()` and the terminal `then` resolve to whatever the table script says.
 *
 *   const db = fakeDb({
 *     live_help_tickets: { rows: [...], count: 3 },
 *     profiles: { rows: [...] },
 *   });
 *
 * Calls are recorded on db.calls so a test can assert what was asked for.
 */
function fakeDb(tables = {}, rpcs = {}) {
  const calls = [];
  function chainFor(table) {
    const script = tables[table] || { rows: [], count: 0 };
    const record = { table, filters: [], range: null, select: null };
    calls.push(record);
    const result = () => ({
      data: typeof script.rows === 'function' ? script.rows(record) : script.rows || [],
      count: script.count ?? null,
      error: script.error || null,
    });
    const chain = {
      select(cols) {
        record.select = cols;
        return chain;
      },
      eq(col, val) {
        record.filters.push(['eq', col, val]);
        return chain;
      },
      neq(col, val) {
        record.filters.push(['neq', col, val]);
        return chain;
      },
      gt(col, val) {
        record.filters.push(['gt', col, val]);
        return chain;
      },
      gte(col, val) {
        record.filters.push(['gte', col, val]);
        return chain;
      },
      lte(col, val) {
        record.filters.push(['lte', col, val]);
        return chain;
      },
      lt(col, val) {
        record.filters.push(['lt', col, val]);
        return chain;
      },
      in(col, vals) {
        record.filters.push(['in', col, vals]);
        return chain;
      },
      is(col, val) {
        record.filters.push(['is', col, val]);
        return chain;
      },
      not(col, op, val) {
        record.filters.push(['not', col, op, val]);
        return chain;
      },
      or(expr) {
        record.filters.push(['or', expr]);
        return chain;
      },
      like(col, expr) {
        record.filters.push(['like', col, expr]);
        return chain;
      },
      order(col, opts) {
        record.filters.push(['order', col, opts]);
        return chain;
      },
      limit(n) {
        record.filters.push(['limit', n]);
        return chain;
      },
      insert(rows) {
        record.insert = rows;
        return chain;
      },
      update(row) {
        record.update = row;
        return chain;
      },
      delete() {
        record.delete = true;
        return chain;
      },
      range(from, to) {
        // PostgREST returns the builder here, not a result: `.range()` is a
        // filter like any other and the query is only sent when awaited.
        record.range = [from, to];
        return chain;
      },
      async maybeSingle() {
        const r = result();
        return { data: (r.data || [])[0] ?? null, error: r.error };
      },
      then(resolve, reject) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    calls,
    from: chainFor,
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      const scripted = rpcs[name];
      if (typeof scripted === 'function') return scripted(args);
      return scripted || { data: null, error: null };
    },
  };
}

const fakeReq = (extra = {}) => ({
  method: 'GET',
  headers: { 'user-agent': 'node-test', 'x-real-ip': '10.0.0.1' },
  socket: { remoteAddress: '127.0.0.1' },
  ...extra,
});

const fakeOp = (db) => ({
  db,
  user: { id: '11111111-1111-1111-1111-111111111111', email: 'op@example.com' },
  role: 'admin',
  permissions: ['money.write', 'money.read', 'clubs.read', 'clubs.write'],
  requestId: 'req-test',
});

// ---------------------------------------------------------------- mint

const { handle: mintHandle, spec: mintSpec } = await import(path.join(ROUTE_DIR, 'mint.js'));

function mintBody(over = {}) {
  return {
    action: 'mint',
    asset: 'chips',
    target: 'club',
    targetId: '22222222-2222-2222-2222-222222222222',
    amount: '100.00',
    reason: 'Seeding the new club treasury for launch',
    opId: 'op-1234',
    ...over,
  };
}

async function mintPost(body, { rpcs } = {}) {
  const db = fakeDb(
    {},
    rpcs || {
      fn_ca_mint: async () => ({
        data: { ok: true, balance_before: 0, balance_after: 100, supply_after: 100, ledger_id: 'l1' },
        error: null,
      }),
      fn_ca_burn: async () => ({ data: { ok: true }, error: null }),
      fn_log_admin_action: async () => ({ data: true, error: null }),
    }
  );
  const req = fakeReq({ method: 'POST' });
  return { db, payload: await mintHandle({ req, op: fakeOp(db), db, body, query: {}, method: 'POST' }) };
}

test('mint: the target-pairing law is enforced before the RPC', async () => {
  await assert.rejects(mintPost(mintBody({ asset: 'chips', target: 'player' })), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /Never To An Individual/);
    return true;
  });
  await assert.rejects(mintPost(mintBody({ asset: 'diamonds', target: 'club' })), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /Never To A Club Or Union/);
    return true;
  });
});

test('mint: two-decimal amounts that the old float check refused are accepted', async () => {
  for (const amount of ['0.07', '0.29', '1.15', '100']) {
    const { payload } = await mintPost(mintBody({ amount }));
    assert.equal(payload.result.ok, true, `amount ${amount} must be accepted`);
  }
  await assert.rejects(mintPost(mintBody({ amount: '1.005' })), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /Two Decimals/);
    return true;
  });
  await assert.rejects(mintPost(mintBody({ amount: '-5' })), (err) => err.status === 400);
  await assert.rejects(mintPost(mintBody({ amount: 'abc' })), (err) => err.status === 400);
});

test('mint: diamonds must be whole, amounts respect the per-operation cap', async () => {
  const diamonds = { asset: 'diamonds', target: 'player' };
  await assert.rejects(mintPost(mintBody({ ...diamonds, amount: '5.50' })), (err) => {
    assert.match(err.message, /Whole Numbers/);
    return true;
  });
  await assert.rejects(mintPost(mintBody({ ...diamonds, amount: '10000001' })), (err) => {
    assert.match(err.message, /Single-Operation Cap/);
    return true;
  });
  await assert.rejects(mintPost(mintBody({ amount: '1000000001' })), (err) =>
    /Single-Operation Cap/.test(err.message)
  );
});

test('mint: id, reason and idempotency key are all required', async () => {
  await assert.rejects(mintPost(mintBody({ targetId: 'not-a-uuid' })), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /Valid Destination/);
    return true;
  });
  await assert.rejects(mintPost(mintBody({ reason: 'too short' })), (err) => {
    assert.match(err.message, /Ten Characters/);
    return true;
  });
  await assert.rejects(mintPost(mintBody({ opId: '' })), (err) => {
    assert.match(err.message, /Idempotency Key/);
    return true;
  });
  await assert.rejects(mintPost(mintBody({ action: 'melt' })), (err) => /Mint Or Burn/.test(err.message));
});

test('mint: a refusal is mapped, an unknown refusal is a 409, and no database text escapes', async () => {
  await assert.rejects(
    mintPost(mintBody(), {
      rpcs: { fn_ca_mint: async () => ({ data: { ok: false, reason: 'club_not_found' }, error: null }) },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'club_not_found');
      assert.equal(err.message, 'No Club With That Id.');
      return true;
    }
  );

  await assert.rejects(
    mintPost(mintBody(), {
      rpcs: { fn_ca_mint: async () => ({ data: { ok: false, reason: 'brand_new_guard' }, error: null }) },
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'brand_new_guard');
      assert.equal(err.message, 'Mint Refused');
      return true;
    }
  );

  const quiet = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      mintPost(mintBody(), {
        rpcs: {
          fn_ca_mint: async () => ({
            data: null,
            error: { message: 'relation "public.ca_mint_ledger" does not exist' },
          }),
        },
      }),
      (err) => {
        assert.equal(err.status, 503);
        assert.doesNotMatch(err.message, /ca_mint_ledger/);
        return true;
      }
    );
  } finally {
    console.error = quiet;
  }
});

test('mint: a successful issuance audits mint.issue with a before/after snapshot', async () => {
  const audits = [];
  const db = fakeDb(
    {},
    {
      fn_ca_mint: async () => ({
        data: { ok: true, balance_before: 10, balance_after: 110, supply_after: 500 },
        error: null,
      }),
      fn_log_admin_action: async (args) => {
        audits.push(args);
        return { data: true, error: null };
      },
    }
  );
  const req = fakeReq({ method: 'POST' });
  const payload = await mintHandle({
    req,
    op: fakeOp(db),
    db,
    body: mintBody(),
    query: {},
    method: 'POST',
  });
  assert.equal(payload.result.ok, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].p_action, 'mint.issue');
  assert.equal(audits[0].p_target_type, 'club');
  assert.deepEqual(audits[0].p_before_state, { balance_before: 10, supply_before: null });
  assert.equal(audits[0].p_after_state.balance_after, 110);
  assert.equal(audits[0].p_details.amount, 100);
});

test('mint: the ledger section pages and keeps the legacy `entries` field', async () => {
  const rows = [{ id: 'a' }, { id: 'b' }];
  const db = fakeDb({ ca_mint_ledger: { rows, count: 57 } });
  const payload = await mintHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'ledger', limit: '2', offset: '4', asset: 'chips' },
    method: 'GET',
  });
  assert.deepEqual(payload.rows, rows);
  assert.deepEqual(payload.entries, rows);
  assert.equal(payload.total, 57);
  assert.equal(payload.limit, 2);
  assert.equal(payload.offset, 4);
  assert.equal(payload.hasMore, true);
  const ledgerCall = db.calls.find((c) => c.table === 'ca_mint_ledger');
  assert.deepEqual(ledgerCall.range, [4, 5]);
  assert.ok(ledgerCall.select.includes("count") === false); // count is an option, not a column
  assert.ok(ledgerCall.filters.some(([op, col, val]) => op === 'eq' && col === 'asset' && val === 'chips'));
});

test('mint: an unknown section is a 400 and the spec asks for the money permissions', async () => {
  const db = fakeDb();
  await assert.rejects(
    mintHandle({ req: fakeReq(), op: fakeOp(db), db, body: {}, query: { section: 'nope' }, method: 'GET' }),
    (err) => err.status === 400 && err.message === 'Unknown Section'
  );
  assert.equal(mintSpec.permission.GET, 'money.read');
  assert.equal(mintSpec.permission.POST, 'money.write');
  assert.deepEqual(mintSpec.durable.POST, { max: 20, windowSeconds: 60 });
});

// ---------------------------------------------------------------- club arena

const { handle: caHandle } = await import(path.join(ROUTE_DIR, 'club-arena-admin.js'));

test('club-arena-admin: tickets page, filter, search and join the reporter', async () => {
  const tickets = [
    { id: 't1', subject: 'Cannot sit', description: 'seat', status: 'open', user_id: 'u-1' },
    { id: 't2', subject: 'Chips missing', description: 'wallet', status: 'open', user_id: 'u-2' },
  ];
  const db = fakeDb({
    live_help_tickets: { rows: tickets, count: 12 },
    profiles: {
      rows: [
        { id: 'u-1', username: 'dan', display_name: 'Dan', avatar_url: 'a.png' },
        { id: 'u-3', username: 'other', display_name: 'Other' },
      ],
    },
  });

  const payload = await caHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'tickets', limit: '2', offset: '2', status: 'open', q: 'chips' },
    method: 'GET',
  });

  assert.equal(payload.total, 12);
  assert.equal(payload.limit, 2);
  assert.equal(payload.offset, 2);
  assert.equal(payload.hasMore, true);
  assert.equal(payload.rows.length, 2);
  assert.deepEqual(payload.tickets, payload.rows);
  assert.deepEqual(payload.rows[0].reporter, {
    id: 'u-1',
    username: 'dan',
    display_name: 'Dan',
    avatar_url: 'a.png',
  });
  // A reporter with no profile row is null, not an invented name.
  assert.equal(payload.rows[1].reporter, null);
  assert.equal(payload.status, 'open');
  assert.equal(payload.q, 'chips');

  const ticketCall = db.calls.find((c) => c.table === 'live_help_tickets');
  assert.deepEqual(ticketCall.range, [2, 3]);
  assert.ok(ticketCall.filters.some(([op, col, val]) => op === 'eq' && col === 'status' && val === 'open'));
  assert.ok(ticketCall.filters.some(([op, expr]) => op === 'or' && /subject\.ilike/.test(expr)));
  assert.ok(
    ticketCall.filters.some(([op, col, opts]) => op === 'order' && col === 'created_at' && opts.ascending === false)
  );
});

test('club-arena-admin: ticket status is validated and defaults to all', async () => {
  const db = fakeDb({ live_help_tickets: { rows: [], count: 0 }, profiles: { rows: [] } });
  const payload = await caHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'tickets', status: 'made_up' },
    method: 'GET',
  });
  assert.equal(payload.status, 'all');
  const ticketCall = db.calls.find((c) => c.table === 'live_help_tickets');
  assert.equal(ticketCall.filters.some(([op, col]) => op === 'eq' && col === 'status'), false);
  assert.equal(payload.limit, 50);
});

test('club-arena-admin: ids are validated and unknown sections refused', async () => {
  const db = fakeDb();
  const call = (query) => caHandle({ req: fakeReq(), op: fakeOp(db), db, body: {}, query, method: 'GET' });
  await assert.rejects(call({ section: 'club', clubId: 'x' }), (e) => e.status === 400);
  await assert.rejects(call({ section: 'user', userId: 'x' }), (e) => e.status === 400);
  await assert.rejects(call({ section: 'wat' }), (e) => e.status === 400 && e.message === 'Unknown Section');
});

test('club-arena-admin: set_club_status audits club.set_status with before and after', async () => {
  const audits = [];
  const db = fakeDb(
    { clubs: { rows: [{ id: 'c1', name: 'Shark', status: 'active' }] } },
    {
      fn_log_admin_action: async (args) => {
        audits.push(args);
        return { data: true, error: null };
      },
    }
  );
  const payload = await caHandle({
    req: fakeReq({ method: 'POST' }),
    op: fakeOp(db),
    db,
    body: {
      action: 'set_club_status',
      clubId: '33333333-3333-3333-3333-333333333333',
      status: 'suspended',
    },
    query: {},
    method: 'POST',
  });
  assert.equal(payload.club.id, 'c1');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].p_action, 'club.set_status');
  assert.equal(audits[0].p_before_state.status, 'active');
  assert.equal(audits[0].p_details.status, 'suspended');

  await assert.rejects(
    caHandle({
      req: fakeReq({ method: 'POST' }),
      op: fakeOp(db),
      db,
      body: { action: 'set_club_status', clubId: 'nope', status: 'suspended' },
      query: {},
      method: 'POST',
    }),
    (e) => e.status === 400
  );
  await assert.rejects(
    caHandle({
      req: fakeReq({ method: 'POST' }),
      op: fakeOp(db),
      db,
      body: {
        action: 'set_club_status',
        clubId: '33333333-3333-3333-3333-333333333333',
        status: 'deleted',
      },
      query: {},
      method: 'POST',
    }),
    (e) => e.status === 400 && /Status Must Be One Of/.test(e.message)
  );
});

// ---------------------------------------------------------------- stable

const { handle: stableHandle, _resetActorCacheForTests } = await import(
  path.join(ROUTE_DIR, 'stable-admin.js')
);

test('stable-admin: every id is validated and the bulk ceiling is 500', async () => {
  const db = fakeDb();
  const op = { ...fakeOp(db), permissions: ['content.write', 'audit.read', 'support.write'] };
  const call = (body) => stableHandle({ req: fakeReq({ method: 'POST' }), op, db, body });

  await assert.rejects(call({ action: 'set_active', id: 'x', is_active: true }), (e) => e.status === 400);
  await assert.rejects(call({ action: 'delete_horse', id: 7 }), (e) => e.status === 400);
  await assert.rejects(call({ action: 'update_horse', id: 'x', horse: { name: 'a' } }), (e) => e.status === 400);
  await assert.rejects(call({ action: 'nope' }), (e) => e.message === 'Unknown Action');

  const tooMany = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  await assert.rejects(call({ action: 'bulk_delete', ids: tooMany }), (e) =>
    /At Most 500 Horses At A Time/.test(e.message)
  );
  await assert.rejects(call({ action: 'bulk_active', ids: ['nope'], is_active: true }), (e) => e.status === 400);
});

test('stable-admin: audit_log filters, pages and returns cached actors', async () => {
  _resetActorCacheForTests();
  const db = fakeDb({
    admin_audit_log: {
      rows: [{ id: 1, admin_user_id: 'a-1', action: 'horse.create', details: {}, before_state: null, after_state: {} }],
      count: 3,
    },
    profiles: { rows: [{ id: 'a-1', username: 'dan', display_name: 'Dan', role: 'god' }] },
  });
  const op = { ...fakeOp(db), permissions: ['content.write', 'audit.read'] };
  const payload = await stableHandle({
    req: fakeReq({ method: 'POST' }),
    op,
    db,
    body: {
      action: 'audit_log',
      limit: 10,
      offset: 10,
      targetId: 'horse-9',
      from: '2026-01-01',
      to: '2026-02-01',
      actionPrefix: 'horse.',
    },
  });

  assert.equal(payload.total, 3);
  assert.equal(payload.limit, 10);
  assert.equal(payload.offset, 10);
  assert.equal(payload.page, 1);
  assert.deepEqual(payload.rows, payload.entries);
  assert.equal(payload.entries[0].admin_name, 'dan');
  assert.ok('details' in payload.entries[0] && 'before_state' in payload.entries[0]);
  assert.deepEqual(payload.actors[0], {
    id: 'a-1',
    username: 'dan',
    display_name: 'Dan',
    name: 'dan',
    role: 'god',
  });

  const logCall = db.calls.find((c) => c.table === 'admin_audit_log');
  assert.deepEqual(logCall.range, [10, 19]);
  assert.ok(logCall.filters.some(([o, col, v]) => o === 'eq' && col === 'target_id' && v === 'horse-9'));
  assert.ok(logCall.filters.some(([o, col]) => o === 'gte' && col === 'created_at'));
  assert.ok(logCall.filters.some(([o, col]) => o === 'lte' && col === 'created_at'));
  assert.ok(logCall.filters.some(([o, col, v]) => o === 'like' && col === 'action' && v === 'horse.%'));

  // Second call inside the 60s window must not rescan for actors.
  const before = db.calls.filter((c) => c.table === 'admin_audit_log').length;
  await stableHandle({ req: fakeReq({ method: 'POST' }), op, db, body: { action: 'audit_log' } });
  const after = db.calls.filter((c) => c.table === 'admin_audit_log').length;
  assert.equal(after - before, 1, 'the actor scan must be cached, so only the page query runs again');
  _resetActorCacheForTests();
});

test('stable-admin: audit_log and set_ticket_status ask for their own permission', async () => {
  const db = fakeDb();
  const contentOnly = { ...fakeOp(db), permissions: ['content.write'] };
  await assert.rejects(
    stableHandle({ req: fakeReq({ method: 'POST' }), op: contentOnly, db, body: { action: 'audit_log' } }),
    (e) => e.status === 403 && /audit\.read/.test(e.message)
  );
  await assert.rejects(
    stableHandle({
      req: fakeReq({ method: 'POST' }),
      op: contentOnly,
      db,
      body: { action: 'set_ticket_status', id: '44444444-4444-4444-4444-444444444444', status: 'resolved' },
    }),
    (e) => e.status === 403 && /support\.write/.test(e.message)
  );
});

test('stable-admin: a zero-row write is a 404, not a silent success', async () => {
  const db = fakeDb({ content_authors: { rows: [] } });
  const op = { ...fakeOp(db), permissions: ['content.write'] };
  await assert.rejects(
    stableHandle({
      req: fakeReq({ method: 'POST' }),
      op,
      db,
      body: { action: 'set_active', id: '55555555-5555-5555-5555-555555555555', is_active: false },
    }),
    (e) => e.status === 404
  );
});

// ---------------------------------------------------------------- grinder

const { handle: grinderHandle } = await import(path.join(ROUTE_DIR, 'grinder-stats.js'));

test('grinder-stats: the roster pages and player_stats is read for the page only', async () => {
  const personas = [
    { id: 'h1', name: 'Ace', profile_id: 'p1', is_active: true },
    { id: 'h2', name: 'Bee', profile_id: 'p2', is_active: true },
  ];
  const db = fakeDb({
    content_authors: { rows: personas, count: 900 },
    tables: { rows: [], count: 40 },
    table_seats: { rows: [{ table_id: 't1', user_id: 'p1' }] },
    player_stats: {
      rows: [
        { user_id: 'p1', hands_played: 10, total_winnings: 30, total_losses: 12 },
        { user_id: 'p1', hands_played: 5, total_winnings: 2, total_losses: 0 },
      ],
    },
  });

  const payload = await grinderHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { limit: '2', offset: '0' },
    method: 'GET',
  });

  assert.equal(payload.roster.total, 900);
  assert.equal(payload.roster.hasMore, true);
  assert.equal(payload.roster.rows.length, 2);
  assert.deepEqual(payload.stats.roster, payload.roster.rows);
  assert.equal(payload.stats.roster[0].hands, 15);
  assert.equal(payload.stats.roster[0].profit, 20);
  assert.equal(payload.stats.roster[0].status, 'playing');
  assert.equal(payload.stats.roster[1].status, 'idle');
  assert.equal(payload.stats.currentlyPlaying, 1);
  assert.equal(payload.stats.totalsScope, 'current page');

  const statsCall = db.calls.find((c) => c.table === 'player_stats');
  assert.ok(statsCall, 'player_stats must be read');
  const inFilter = statsCall.filters.find(([o]) => o === 'in');
  assert.deepEqual(inFilter[2], ['p1', 'p2'], 'player_stats is scoped to the page of horse profiles');
});

test('grinder-stats: club actions return 501 not_built, unknown actions 400', async () => {
  const db = fakeDb();
  for (const action of ['add_to_club', 'start', 'stop']) {
    await assert.rejects(
      grinderHandle({ req: fakeReq({ method: 'POST' }), op: fakeOp(db), db, body: { action }, query: {}, method: 'POST' }),
      (e) => {
        assert.equal(e.status, 501);
        assert.equal(e.code, 'not_built');
        assert.equal(e.message, 'Not Built Yet');
        return true;
      }
    );
  }
  await assert.rejects(
    grinderHandle({
      req: fakeReq({ method: 'POST' }),
      op: fakeOp(db),
      db,
      body: { action: 'launch_everything' },
      query: {},
      method: 'POST',
    }),
    (e) => e.status === 400
  );
});

// ---------------------------------------------------------------- anti-abuse

const { handle: abuseHandle, maskEmail } = await import(path.join(ROUTE_DIR, 'anti-abuse.js'));

test('anti-abuse: raw_email is masked in the alerts feed', async () => {
  assert.equal(maskEmail('daniel@bekavactrading.com'), 'd***@bekavactrading.com');
  assert.equal(maskEmail('a@b.co'), 'a***@b.co');
  assert.equal(maskEmail('not-an-address'), null);
  assert.equal(maskEmail(null), null);

  const db = fakeDb({
    signup_abuse_log: {
      rows: [
        {
          id: 1,
          raw_email: 'burner@mailinator.com',
          ip_address: '1.2.3.4',
          abuse_flags: [{ reason: 'disposable domain' }],
          last_signup_at: new Date().toISOString(),
          deleted_account_count: 2,
        },
      ],
      count: 1,
    },
  });
  const payload = await abuseHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'alerts' },
    method: 'GET',
  });
  assert.equal(payload.alerts[0].email, 'b***@mailinator.com');
  assert.equal(payload.alerts[0].emailMasked, true);
  assert.doesNotMatch(JSON.stringify(payload), /burner@mailinator\.com/);
});

test('anti-abuse: an unknown section is a 400', async () => {
  const db = fakeDb();
  await assert.rejects(
    abuseHandle({ req: fakeReq(), op: fakeOp(db), db, body: {}, query: { section: 'bogus' }, method: 'GET' }),
    (e) => e.status === 400 && /Unknown Section/.test(e.message)
  );
});

// ---------------------------------------------------------------- analytics

const { handle: analyticsHandle, spec: analyticsSpec } = await import(path.join(ROUTE_DIR, 'analytics.js'));

test('analytics: days and type are validated before anything is loaded', async () => {
  const db = fakeDb();
  const call = (query) => analyticsHandle({ req: fakeReq(), op: fakeOp(db), db, body: {}, query, method: 'GET' });
  await assert.rejects(call({ type: 'summary', days: 'abc' }), (e) => e.status === 400);
  await assert.rejects(call({ type: 'summary', days: '0' }), (e) => e.status === 400);
  await assert.rejects(call({ type: 'summary', days: '366' }), (e) => e.status === 400);
  await assert.rejects(call({ type: 'made-up' }), (e) => e.status === 400 && /Invalid Type/.test(e.message));
  assert.equal(analyticsSpec.permission, 'console.read');
});
