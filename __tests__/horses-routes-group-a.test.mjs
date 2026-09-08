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
  assert.match(text, /shapeList|runPaged/);
  // sectionUser collects failures like every other section now.
  assert.match(text, /async function sectionUser\(db, userId, query, c\)[\s\S]*?c\.check\('profile'/);
  // Review addendum item 10: the original caps are back, and visible.
  assert.match(text, /clubs: \{ defaultLimit: 200/);
  assert.match(text, /unions: \{ defaultLimit: 100/);
  assert.match(text, /members: \{ defaultLimit: 300/);
  assert.match(text, /agents: \{ defaultLimit: 200/);
  assert.match(text, /tables: \{ defaultLimit: 200/);
  // Item 10 again: no exact count on the million-row ledgers.
  assert.doesNotMatch(
    text,
    /chip_transactions'\)\s*\n?\s*\.select\([^)]*count: 'exact'/,
    'chip_transactions must not be counted exactly'
  );
});

test('grinder-stats reads the fleet in chunks and refuses club actions', () => {
  const text = source('grinder-stats.js');
  assert.match(text, /IN_CHUNK/, 'the shared 200-id chunk size must be used');
  assert.match(text, /readByIds/);
  assert.match(text, /new ApiError\(501, 'Not Built Yet', 'not_built'\)/);
  assert.doesNotMatch(text, /PLAYER_STATS_CAP/, 'the whole-table player_stats pull must be gone');
  // Review addendum item 12.
  assert.match(text, /max: 500/, 'the roster page ceiling is 500');
  assert.match(text, /totalsScope: 'fleet'/);
  assert.doesNotMatch(text, /totalsScope: 'current page'/, 'the totals are fleet-wide now');
});

test('anti-abuse masks raw_email everywhere and analytics validates days', () => {
  const abuse = source('anti-abuse.js');
  assert.match(abuse, /maskEmail/);
  assert.match(abuse, /maskLogRow/, 'the log rows must be masked too, not just the alerts');
  assert.doesNotMatch(abuse, /email: a\.raw_email/, 'raw_email must not ship unmasked');
  // Contract line 5 / addendum item 16: no database sentence in failedSources.
  assert.doesNotMatch(abuse, /error: \w+Err(or)?\.message/, 'failedSources must not carry db text');
  const analytics = source('analytics.js');
  assert.match(analytics, /int\(rawDays, \{ min: 1, max: 365/);
  assert.match(analytics, /analytics_unavailable/);
});

test('no route ships raw database text in failedSources', () => {
  for (const file of ROUTES) {
    const text = source(file);
    assert.doesNotMatch(
      text,
      /failed(Sources)?\.push\([^)]*\.message/,
      `${file} must not push a database message into failedSources`
    );
    assert.doesNotMatch(
      text,
      /\$\{r\.error\.message\}/,
      `${file} must not interpolate a database message into a response`
    );
  }
});

test('every Supabase error is mapped, never thrown raw', () => {
  for (const file of ROUTES) {
    const text = source(file);
    assert.doesNotMatch(
      text,
      /if \(error\) throw error;/,
      `${file} must map its database errors through mapDbError`
    );
    assert.doesNotMatch(text, /if \(readErr\) throw readErr;/, `${file} must map readErr too`);
  }
  const stable = source('stable-admin.js');
  assert.match(stable, /mapDbError\(/);
  assert.match(stable, /BULK_IN_CHUNK/, 'bulk writes must chunk their .in() lists');
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
 * A chainable PostgREST-shaped stub that RECORDS every filter and range AND
 * APPLIES them to the seeded rows.
 *
 *   const db = fakeDb({
 *     live_help_tickets: { rows: [...], count: 12 },
 *     profiles: { rows: [...] },
 *   });
 *
 * Applying the filters is the point. A stub that returns the seeded rows
 * whatever it was asked cannot see the two failure classes this route group
 * keeps producing: a filter on the WRONG COLUMN (cashout_requests has
 * player_id, not user_id) and an OFF-BY-ONE RANGE (`.range(offset, offset +
 * limit)` returns limit + 1 rows). Here a wrong column filters everything out
 * and a wrong range returns the wrong slice, so the assertion fails.
 *
 * Supported: eq/neq/gt/gte/lt/lte/in/is/not(col,'is',null)/like, order, limit,
 * range, insert/update/delete, maybeSingle, and rpc. `or()` is recorded but not
 * evaluated - PostgREST's filter grammar is a parser, not a predicate, and a
 * half-implemented one would be worse than an honest passthrough.
 *
 * `count` comes from the script when the test names one (so a test can say
 * "there are 900 of these behind the page"), otherwise from the number of rows
 * that survived the filters - and only when the route actually asked for a
 * count, exactly as PostgREST behaves.
 *
 * Every call is recorded on db.calls: { table, select, countMode, filters,
 * range, insert, update, delete }.
 */
function matchesFilter(row, filter) {
  const [op, col, val, val2] = filter;
  switch (op) {
    case 'eq':
      return row[col] === val;
    case 'neq':
      return row[col] !== val;
    case 'gt':
      return row[col] > val;
    case 'gte':
      return row[col] >= val;
    case 'lt':
      return row[col] < val;
    case 'lte':
      return row[col] <= val;
    case 'in':
      return Array.isArray(val) && val.includes(row[col]);
    case 'is':
      return val === null ? row[col] === null || row[col] === undefined : row[col] === val;
    case 'not':
      // .not(col, 'is', null) -> the column must be present.
      if (val === 'is' && val2 === null) return row[col] !== null && row[col] !== undefined;
      return true;
    case 'like': {
      const pattern = String(val)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
      return new RegExp(`^${pattern}$`).test(String(row[col] ?? ''));
    }
    default:
      // order / limit / or: handled elsewhere or deliberately not evaluated.
      return true;
  }
}

/**
 * Project the seeded row onto the columns the route actually selected, so a
 * test can assert that a query asked for `id, name, alias` and NOT for the
 * 2,000 character bio next to them. Keys the seed does not carry are left out
 * rather than added as undefined; `*` and embeds are passed through whole.
 */
function projectRow(row, select) {
  if (!select || typeof select !== 'string' || select.includes('*') || select.includes('(')) return row;
  const cols = select
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (!cols.length) return row;
  const out = {};
  for (const col of cols) if (Object.prototype.hasOwnProperty.call(row, col)) out[col] = row[col];
  return out;
}

function applyScript(rows, record) {
  let out = rows.filter((r) => record.filters.every((f) => matchesFilter(r, f)));

  const orderFilter = [...record.filters].reverse().find(([o]) => o === 'order');
  if (orderFilter) {
    const [, col, opts] = orderFilter;
    const dir = opts && opts.ascending === false ? -1 : 1;
    out = [...out].sort((a, b) => {
      const x = a[col];
      const y = b[col];
      if (x === y) return 0;
      return (x > y ? 1 : -1) * dir;
    });
  }

  const filteredTotal = out.length;

  const limitFilter = record.filters.find(([o]) => o === 'limit');
  if (limitFilter) out = out.slice(0, limitFilter[1]);

  if (record.range) {
    const [from, to] = record.range;
    out = out.slice(from, to + 1);
  }

  return { rows: out.map((r) => projectRow(r, record.select)), filteredTotal };
}

function fakeDb(tables = {}, rpcs = {}) {
  const calls = [];
  function chainFor(table) {
    const script = tables[table] || { rows: [], count: undefined };
    const record = { table, filters: [], range: null, select: null, countMode: null, head: false };
    calls.push(record);

    const result = () => {
      if (script.error) return { data: null, count: null, error: script.error };
      const seeded = typeof script.rows === 'function' ? script.rows(record) : script.rows || [];
      const { rows, filteredTotal } = applyScript(seeded, record);
      const count = record.countMode
        ? typeof script.count === 'number'
          ? script.count
          : filteredTotal
        : null;
      return { data: record.head ? [] : rows, count, error: null };
    };

    const push = (...f) => {
      record.filters.push(f);
      return chain;
    };

    const chain = {
      select(cols, opts) {
        record.select = cols;
        record.countMode = opts?.count || null;
        record.head = Boolean(opts?.head);
        return chain;
      },
      eq: (c, v) => push('eq', c, v),
      neq: (c, v) => push('neq', c, v),
      gt: (c, v) => push('gt', c, v),
      gte: (c, v) => push('gte', c, v),
      lte: (c, v) => push('lte', c, v),
      lt: (c, v) => push('lt', c, v),
      in: (c, v) => push('in', c, v),
      is: (c, v) => push('is', c, v),
      not: (c, o, v) => push('not', c, o, v),
      or: (expr) => push('or', expr),
      like: (c, expr) => push('like', c, expr),
      order: (c, opts) => push('order', c, opts),
      limit: (n) => push('limit', n),
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
    /** Every id list this db was handed, in call order. */
    inLists: () =>
      calls.flatMap((c) => (c.filters || []).filter(([o]) => o === 'in').map(([, , vals]) => vals)),
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      const scripted = rpcs[name];
      if (typeof scripted === 'function') return scripted(args);
      return scripted || { data: null, error: null };
    },
  };
}

/** n rows built from an index, for tests that need a real page to slice. */
const seq = (n, build) => Array.from({ length: n }, (_, i) => build(i));

/** Every uuid a bulk test needs, distinct and valid. */
const uuidAt = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

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

  // An unrecognised refusal carries its CODE in the message: the console shows
  // err.message and nothing else, and a bare "Mint Refused" tells the operator
  // the money did not move while refusing to say why.
  await assert.rejects(
    mintPost(mintBody(), {
      rpcs: { fn_ca_mint: async () => ({ data: { ok: false, reason: 'brand_new_guard' }, error: null }) },
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'brand_new_guard');
      assert.equal(err.message, 'Mint Refused: brand_new_guard');
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
  // 57 real rows, so the range actually has something to slice and an
  // off-by-one would show up as the wrong ids.
  const rows = seq(57, (i) => ({ id: `l${i}`, asset: 'chips', created_at: 57 - i }));
  const db = fakeDb({ ca_mint_ledger: { rows, count: 57 } });
  const payload = await mintHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'ledger', limit: '2', offset: '4', asset: 'chips' },
    method: 'GET',
  });
  assert.equal(payload.rows.length, 2, 'a limit of 2 must return exactly 2 rows');
  assert.deepEqual(
    payload.rows.map((r) => r.id),
    ['l4', 'l5'],
    'offset 4 must start at the fifth row, not the fourth or the sixth'
  );
  assert.deepEqual(payload.entries, payload.rows);
  assert.equal(payload.total, 57);
  assert.equal(payload.limit, 2);
  assert.equal(payload.offset, 4);
  assert.equal(payload.hasMore, true);
  assert.equal(payload.truncated, true);
  const ledgerCall = db.calls.find((c) => c.table === 'ca_mint_ledger');
  assert.deepEqual(ledgerCall.range, [4, 5]);
  assert.ok(ledgerCall.select.includes('count') === false); // count is an option, not a column
  assert.ok(ledgerCall.filters.some(([op, col, val]) => op === 'eq' && col === 'asset' && val === 'chips'));
});

test('mint: the destination picker keeps its 500 cap and reads wallets for the page', async () => {
  const clubs = seq(600, (i) => ({ id: `c${i}`, name: `Club ${String(i).padStart(3, '0')}` }));
  const unions = seq(3, (i) => ({ id: `u${i}`, name: `Union ${i}` }));
  const db = fakeDb({
    clubs: { rows: clubs, count: 600 },
    unions: { rows: unions, count: 3 },
    union_wallets: { rows: [{ union_id: 'u1', chip_balance: 250 }] },
  });
  const payload = await mintHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'targets' },
    method: 'GET',
  });
  assert.equal(payload.clubs.length, 500, 'the default is the contract cap of 500');
  assert.equal(payload.pages.clubs.total, 600);
  assert.equal(payload.truncated, true, 'a picker missing 100 clubs must say so');
  assert.equal(payload.unions.find((u) => u.id === 'u1').balance, 250);
  // The wallet read is scoped to the unions on the page, not a flat limit.
  const walletCall = db.calls.find((c) => c.table === 'union_wallets');
  const walletIn = walletCall.filters.find(([o]) => o === 'in');
  assert.deepEqual(walletIn[2], ['u0', 'u1', 'u2']);
});

test('mint: player search does not count, and says total is unknown', async () => {
  const players = seq(30, (i) => ({ id: `p${i}`, username: `dan${i}`, player_number: i, diamonds: i }));
  const db = fakeDb({ profiles: { rows: players, count: 30 } });
  const payload = await mintHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'player_search', q: 'dan' },
    method: 'GET',
  });
  const call = db.calls.find((c) => c.table === 'profiles');
  assert.equal(call.countMode, null, 'a leading-wildcard search must not ask for a count');
  assert.equal(payload.total, null, 'total is null, never a number the route cannot stand behind');
  assert.equal(payload.hasMore, true);
  assert.equal(payload.players.length, 25);
  assert.deepEqual(payload.rows, payload.players);
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
  // Twelve open tickets behind a two-row page, so offset 2 has to land on the
  // third and fourth or the assertion fails.
  const tickets = seq(12, (i) => ({
    id: `t${i}`,
    subject: `Chips missing ${i}`,
    description: 'wallet',
    status: 'open',
    created_at: 12 - i,
    user_id: i === 2 ? 'u-1' : `u-none-${i}`,
  }));
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
  assert.equal(payload.truncated, true);
  assert.equal(payload.rows.length, 2);
  assert.deepEqual(
    payload.rows.map((r) => r.id),
    ['t2', 't3'],
    'offset 2 limit 2 must be the third and fourth rows'
  );
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

test('club-arena-admin: the overview lists keep their original caps', async () => {
  const clubs = seq(260, (i) => ({ id: `c${i}`, name: `Club ${i}`, created_at: 300 - i, owner_id: null }));
  const unions = seq(140, (i) => ({ id: `u${i}`, name: `Union ${i}`, created_at: 300 - i }));
  const cashouts = seq(130, (i) => ({
    id: `x${i}`,
    club_id: 'c0',
    player_id: 'p0',
    amount: 1,
    status: 'pending',
    created_at: 200 - i,
  }));
  const db = fakeDb({
    clubs: { rows: clubs, count: 260 },
    unions: { rows: unions, count: 140 },
    cashout_requests: { rows: cashouts, count: 130 },
    chip_transactions: { rows: [], count: 0 },
    club_members: { rows: [], count: 0 },
    tables: { rows: [], count: 0 },
    profiles: { rows: [] },
  });

  const payload = await caHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'overview' },
    method: 'GET',
  });

  // The caps the review found shrunk to 50, restored: clubs 200, unions 100,
  // cashouts 100.
  assert.equal(payload.clubs.length, 200, 'clubs default is 200, not the console-wide 50');
  assert.equal(payload.unions.length, 100, 'unions default is 100');
  assert.equal(payload.pendingCashouts.length, 100, 'cashouts default is 100');
  assert.equal(payload.pages.clubs.total, 260);
  assert.equal(payload.pages.clubs.truncated, true, 'a capped list must announce itself');
  assert.equal(payload.pages.unions.limit, 100);
  assert.equal(payload.pages.transactions.countMode, 'planned');

  // And each list can be moved on its own.
  const db2 = fakeDb({
    clubs: { rows: clubs, count: 260 },
    unions: { rows: unions, count: 140 },
    cashout_requests: { rows: cashouts, count: 130 },
    chip_transactions: { rows: [], count: 0 },
    club_members: { rows: [], count: 0 },
    tables: { rows: [], count: 0 },
    profiles: { rows: [] },
  });
  const paged = await caHandle({
    req: fakeReq(),
    op: fakeOp(db2),
    db: db2,
    query: { section: 'overview', clubsLimit: '10', clubsOffset: '200' },
    body: {},
    method: 'GET',
  });
  assert.equal(paged.clubs.length, 10);
  assert.equal(paged.clubs[0].id, 'c200', 'clubsOffset moves the clubs list alone');
  assert.equal(paged.unions.length, 100, 'and leaves the unions list where it was');
});

test('club-arena-admin: section=club sums chips over ALL members, not the page', async () => {
  const clubId = '33333333-3333-3333-3333-333333333333';
  // 700 members at 10 chips each. The page is 300; the money figure is 7000.
  const members = seq(700, (i) => ({
    club_id: clubId,
    user_id: `m${i}`,
    chip_balance: 10,
    created_at: 700 - i,
  }));
  const db = fakeDb({
    club_members: { rows: members, count: 700 },
    agents: { rows: [], count: 0 },
    tables: { rows: [], count: 0 },
    cashout_requests: { rows: [], count: 0 },
    chip_transactions: { rows: [], count: 0 },
    profiles: { rows: [] },
  });

  const payload = await caHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'club', clubId },
    method: 'GET',
  });

  assert.equal(payload.members.length, 300, 'the members default is back to 300');
  assert.equal(payload.memberCount, 700);
  assert.equal(payload.memberChipTotal, 7000, 'Chips On Books is every member, not the page');
  assert.equal(payload.memberChipTotalScope, 'all members');
  assert.equal(payload.memberChipTotalTruncated, false);
  assert.equal(payload.pages.members.total, 700);
  assert.equal(payload.pages.members.truncated, true);

  // The chip sum is read in pages, and every profile lookup is chunked at 200.
  const memberReads = db.calls.filter((c) => c.table === 'club_members');
  assert.ok(memberReads.length > 1, 'the sum is a separate read from the page');
  for (const list of db.inLists()) {
    assert.ok(list.length <= 200, `an .in() received ${list.length} ids; the ceiling is 200`);
  }

  // And the members list pages on its own.
  const db2 = fakeDb({
    club_members: { rows: members, count: 700 },
    agents: { rows: [], count: 0 },
    tables: { rows: [], count: 0 },
    cashout_requests: { rows: [], count: 0 },
    chip_transactions: { rows: [], count: 0 },
    profiles: { rows: [] },
  });
  const second = await caHandle({
    req: fakeReq(),
    op: fakeOp(db2),
    db: db2,
    body: {},
    query: { section: 'club', clubId, membersLimit: '50', membersOffset: '300' },
    method: 'GET',
  });
  assert.equal(second.members.length, 50);
  assert.equal(second.members[0].user_id, 'm300');
  assert.equal(second.memberChipTotal, 7000, 'the money figure does not move when you page');
});

test('club-arena-admin: user_search does not count and reports an unknown total', async () => {
  const profiles = seq(80, (i) => ({ id: `p${i}`, display_name: `Dan ${i}`, created_at: 80 - i }));
  const db = fakeDb({ profiles: { rows: profiles, count: 80 } });
  const payload = await caHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { section: 'user_search', q: 'dan' },
    method: 'GET',
  });
  const call = db.calls.find((c) => c.table === 'profiles');
  assert.equal(call.countMode, null, 'no exact count behind a leading-wildcard ilike');
  assert.equal(payload.total, null);
  assert.equal(payload.hasMore, true);
  assert.equal(payload.results.length, 50);
  assert.deepEqual(payload.users, payload.results);
});

test('club-arena-admin: failedSources names the source and never the database', async () => {
  const db = fakeDb({
    clubs: { error: { message: 'relation "public.clubs" does not exist', code: '42P01' } },
    unions: { rows: [], count: 0 },
    cashout_requests: { rows: [], count: 0 },
    chip_transactions: { rows: [], count: 0 },
    club_members: { rows: [], count: 0 },
    tables: { rows: [], count: 0 },
    profiles: { rows: [] },
  });
  const quiet = console.error;
  console.error = () => {};
  let payload;
  try {
    payload = await caHandle({
      req: fakeReq(),
      op: fakeOp(db),
      db,
      body: {},
      query: { section: 'overview' },
      method: 'GET',
      requestId: 'req-abc',
    });
  } finally {
    console.error = quiet;
  }
  assert.ok(Array.isArray(payload.failedSources) && payload.failedSources.length);
  for (const entry of payload.failedSources) {
    assert.match(entry, /read failed$/);
    assert.doesNotMatch(entry, /relation|does not exist|42P01/, 'no database text may escape');
  }
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
    {
      clubs: {
        rows: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Shark', status: 'active' }],
      },
    },
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
  assert.equal(payload.club.id, '33333333-3333-3333-3333-333333333333');
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
  const rows = seq(30, (i) => ({
    id: i,
    admin_user_id: 'a-1',
    action: 'horse.create',
    target_id: 'horse-9',
    created_at: '2026-01-15',
    details: {},
    before_state: null,
    after_state: {},
  }));
  const db = fakeDb({
    admin_audit_log: { rows, count: 30 },
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

  assert.equal(payload.total, 30);
  assert.equal(payload.limit, 10);
  assert.equal(payload.offset, 10);
  assert.equal(payload.page, 1);
  assert.equal(payload.entries.length, 10);
  assert.equal(payload.entries[0].id, 10, 'offset 10 must start at the eleventh row');
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

test('stable-admin: audit_log accepts actionPrefixes and ORs them, keeping legacy rows visible', async () => {
  _resetActorCacheForTests();
  const rows = [
    { id: 1, action: 'settings.save', admin_user_id: null },
    { id: 2, action: 'content_settings.updated', admin_user_id: null },
    { id: 3, action: 'horse.create', admin_user_id: null },
  ];
  const db = fakeDb({ admin_audit_log: { rows, count: 3 }, profiles: { rows: [] } });
  const op = { ...fakeOp(db), permissions: ['audit.read'] };
  const payload = await stableHandle({
    req: fakeReq({ method: 'POST' }),
    op,
    db,
    body: { action: 'audit_log', actionPrefixes: ['settings.', 'content_settings'] },
  });

  const logCall = db.calls.find((c) => c.table === 'admin_audit_log' && c.countMode);
  const orFilter = logCall.filters.find(([o]) => o === 'or');
  assert.ok(orFilter, 'two prefixes must become one .or() of like filters');
  assert.match(orFilter[1], /action\.like\.settings\.\*/);
  assert.match(orFilter[1], /action\.like\.content_settings\*/);
  assert.equal(
    logCall.filters.some(([o]) => o === 'like'),
    false,
    'a multi-prefix filter must not also apply a single like'
  );
  assert.deepEqual(payload.actionPrefixes, ['settings.', 'content_settings']);

  // The underscore is KEPT. Stripping it, as the first version did, turned the
  // Engine Settings filter into `contentsettings%` and it matched nothing.
  const db2 = fakeDb({ admin_audit_log: { rows, count: 3 }, profiles: { rows: [] } });
  await stableHandle({
    req: fakeReq({ method: 'POST' }),
    op: { ...fakeOp(db2), permissions: ['audit.read'] },
    db: db2,
    body: { action: 'audit_log', actionPrefix: 'content_settings' },
  });
  const call2 = db2.calls.find((c) => c.table === 'admin_audit_log' && c.countMode);
  assert.ok(
    call2.filters.some(([o, col, v]) => o === 'like' && col === 'action' && v === 'content_settings%'),
    'the underscore must survive or the Engine Settings filter matches nothing'
  );

  // A wildcard an operator smuggles in is stripped, not honoured.
  const db3 = fakeDb({ admin_audit_log: { rows, count: 3 }, profiles: { rows: [] } });
  await stableHandle({
    req: fakeReq({ method: 'POST' }),
    op: { ...fakeOp(db3), permissions: ['audit.read'] },
    db: db3,
    body: { action: 'audit_log', actionPrefixes: ['%%%', 'horse.'] },
  });
  const call3 = db3.calls.find((c) => c.table === 'admin_audit_log' && c.countMode);
  assert.ok(call3.filters.some(([o, col, v]) => o === 'like' && col === 'action' && v === 'horse.%'));
  _resetActorCacheForTests();
});

test('stable-admin: a malformed offset is a 400, not a silent page one', async () => {
  _resetActorCacheForTests();
  const db = fakeDb({ admin_audit_log: { rows: [], count: 0 }, profiles: { rows: [] } });
  const op = { ...fakeOp(db), permissions: ['audit.read'] };
  await assert.rejects(
    stableHandle({
      req: fakeReq({ method: 'POST' }),
      op,
      db,
      body: { action: 'audit_log', offset: 'abc', page: 4, limit: 10 },
    }),
    (e) => e.status === 400 && /Offset Must Be/.test(e.message)
  );
  // With no offset at all, `page` is honoured.
  const payload = await stableHandle({
    req: fakeReq({ method: 'POST' }),
    op,
    db,
    body: { action: 'audit_log', page: 4, limit: 10 },
  });
  assert.equal(payload.offset, 40);
  _resetActorCacheForTests();
});

test('stable-admin: a bulk write never sends more than 200 ids in one .in()', async () => {
  const ids = seq(500, (i) => uuidAt(i));
  const rows = ids.map((id) => ({ id, name: `H${id.slice(-3)}`, alias: `a${id.slice(-3)}`, is_active: false }));
  const audits = [];
  const db = fakeDb(
    { content_authors: { rows } },
    {
      fn_log_admin_action: async (args) => {
        audits.push(args);
        return { data: true, error: null };
      },
    }
  );
  const op = { ...fakeOp(db), permissions: ['content.write'] };

  const payload = await stableHandle({
    req: fakeReq({ method: 'POST' }),
    op,
    db,
    body: { action: 'bulk_active', ids, is_active: true },
  });

  assert.equal(payload.requested, 500, 'the contract accepts 500 ids per call');
  assert.equal(payload.affected, 500, 'and every one of them is written');
  assert.equal(payload.chunks, 3, '500 ids is three chunks of at most 200');

  const lists = db.inLists();
  assert.ok(lists.length >= 3);
  for (const list of lists) {
    assert.ok(list.length <= 200, `an .in() received ${list.length} ids; the ceiling is 200`);
  }
  const updateCalls = db.calls.filter((c) => c.update);
  assert.equal(updateCalls.length, 3);
  assert.deepEqual(
    updateCalls.map((c) => c.filters.find(([o]) => o === 'in')[2].length),
    [200, 200, 100]
  );
  assert.equal(audits[0].p_details.chunkSize, 200);
});

test('stable-admin: bulk_delete audits identity only, never 500 whole rows', async () => {
  const ids = seq(210, (i) => uuidAt(i));
  const rows = ids.map((id) => ({
    id,
    name: `H${id.slice(-3)}`,
    alias: `a${id.slice(-3)}`,
    bio: 'x'.repeat(2000),
  }));
  const audits = [];
  const db = fakeDb(
    { content_authors: { rows } },
    {
      fn_log_admin_action: async (args) => {
        audits.push(args);
        return { data: true, error: null };
      },
    }
  );
  const op = { ...fakeOp(db), permissions: ['content.write'] };
  const payload = await stableHandle({
    req: fakeReq({ method: 'POST' }),
    op,
    db,
    body: { action: 'bulk_delete', ids },
  });

  assert.equal(payload.affected, 210);
  assert.equal(audits.length, 1);
  const before = audits[0].p_before_state;
  assert.equal(before.count, 210);
  assert.deepEqual(Object.keys(before.rows[0]).sort(), ['alias', 'id', 'name']);
  assert.doesNotMatch(JSON.stringify(before), /xxxxxxxxxx/, 'a 2,000 character bio must not be audited');
  for (const list of db.inLists()) assert.ok(list.length <= 200);
});

test('stable-admin: a duplicate alias is a 409 conflict, not an opaque 500', async () => {
  const db = fakeDb({
    content_authors: {
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "content_authors_alias_key"',
      },
    },
  });
  const op = { ...fakeOp(db), permissions: ['content.write'] };
  const quiet = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      stableHandle({
        req: fakeReq({ method: 'POST' }),
        op,
        db,
        body: {
          action: 'create_horse',
          horse: { name: 'Ace', location: 'Vegas', stakes: '1/2', bio: 'A grinder' },
        },
      }),
      (e) => {
        assert.equal(e.status, 409, 'a duplicate key is a conflict, not a server fault');
        assert.equal(e.code, 'duplicate');
        assert.match(e.message, /Already Exists/);
        assert.doesNotMatch(e.message, /constraint|duplicate key|content_authors/, 'no database text');
        return true;
      }
    );
  } finally {
    console.error = quiet;
  }
});

test('stable-admin: every action asks for the permission it actually needs', async () => {
  const db = fakeDb();
  const consoleOnly = { ...fakeOp(db), permissions: ['console.read'] };
  for (const [body, permission] of [
    [{ action: 'audit_log' }, 'audit.read'],
    [{ action: 'set_ticket_status', id: uuidAt(1), status: 'resolved' }, 'support.write'],
    [{ action: 'set_active', id: uuidAt(2), is_active: true }, 'content.write'],
    [{ action: 'save_settings', settings: { posts_per_day: 3 } }, 'content.write'],
  ]) {
    await assert.rejects(
      stableHandle({ req: fakeReq({ method: 'POST' }), op: consoleOnly, db, body }),
      (e) => e.status === 403 && e.message.includes(permission)
    );
  }
  // The route-level gate is the console floor, so a read-only operator reaches
  // the per-action check instead of being refused at the door.
  const { spec: stableSpec } = await import(path.join(ROUTE_DIR, 'stable-admin.js'));
  assert.equal(stableSpec.permission, 'console.read');
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

test('grinder-stats: the roster pages and the fleet figures cover the whole fleet', async () => {
  // 450 horses, a 50-row page, and performance rows for a horse that is NOT on
  // the page. The review's blocker was exactly this: the totals were the page.
  const personas = seq(450, (i) => ({
    id: `h${i}`,
    name: `Horse ${String(i).padStart(3, '0')}`,
    profile_id: `p${i}`,
    is_active: true,
  }));
  const db = fakeDb({
    content_authors: { rows: personas, count: 450 },
    tables: { rows: [], count: 40 },
    // Two seated horses, one on the page and one 400 rows past it.
    table_seats: {
      rows: [
        { table_id: 't1', user_id: 'p0' },
        { table_id: 't2', user_id: 'p400' },
      ],
    },
    player_stats: {
      rows: [
        { user_id: 'p0', hands_played: 10, total_winnings: 30, total_losses: 12 },
        { user_id: 'p0', hands_played: 5, total_winnings: 2, total_losses: 0 },
        { user_id: 'p400', hands_played: 7, total_winnings: 100, total_losses: 40 },
      ],
    },
  });

  const payload = await grinderHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { limit: '50', offset: '0' },
    method: 'GET',
    requestId: 'req-1',
  });

  assert.equal(payload.roster.total, 450);
  assert.equal(payload.roster.hasMore, true);
  assert.equal(payload.roster.truncated, true);
  assert.equal(payload.roster.rows.length, 50);
  assert.deepEqual(payload.stats.roster, payload.roster.rows);
  assert.equal(payload.stats.roster[0].hands, 15);
  assert.equal(payload.stats.roster[0].profit, 20);
  assert.equal(payload.stats.roster[0].status, 'playing');
  assert.equal(payload.stats.roster[1].status, 'idle');

  // THE POINT: both seated horses count, and both horses' hands are summed,
  // even though only one of them is on this page.
  assert.equal(payload.stats.totalsScope, 'fleet');
  assert.equal(payload.stats.currentlyPlaying, 2, 'a horse 400 rows past the page is still playing');
  assert.equal(payload.stats.totalHands, 22, '15 on the page plus 7 off it');
  assert.equal(payload.stats.totalProfit, 80);
  assert.equal(payload.stats.fleetSize, 450);
  assert.equal(payload.stats.currentlyPlayingScope, 'fleet');
  assert.match(payload.stats.derivationNote, /WHOLE-FLEET/);

  // Every .in() is chunked at 200, and the reads cover the fleet not the page.
  const statsCalls = db.calls.filter((c) => c.table === 'player_stats');
  assert.ok(statsCalls.length >= 3, '450 ids is three chunks');
  const ids = statsCalls.flatMap((c) => c.filters.find(([o]) => o === 'in')[2]);
  assert.equal(ids.length, 450, 'player_stats is read for every horse, not for the page');
  for (const list of db.inLists()) assert.ok(list.length <= 200, 'an .in() exceeded 200 ids');
});

test('grinder-stats: the roster page moves without moving the fleet figures', async () => {
  const personas = seq(450, (i) => ({
    id: `h${i}`,
    name: `Horse ${String(i).padStart(3, '0')}`,
    profile_id: `p${i}`,
    is_active: true,
  }));
  const seed = () => ({
    content_authors: { rows: personas, count: 450 },
    tables: { rows: [], count: 40 },
    table_seats: { rows: [{ table_id: 't1', user_id: 'p400' }] },
    player_stats: { rows: [{ user_id: 'p400', hands_played: 7, total_winnings: 10, total_losses: 4 }] },
  });

  const db = fakeDb(seed());
  const second = await grinderHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { limit: '50', offset: '400' },
    method: 'GET',
  });
  assert.equal(second.roster.rows.length, 50);
  assert.equal(second.roster.rows[0].horse_id, 'h400', 'offset 400 must start at the 401st horse');
  assert.equal(second.roster.rows[0].hands, 7);
  assert.equal(second.stats.totalHands, 7);
  assert.equal(second.stats.currentlyPlaying, 1);
  assert.equal(second.offset, 400);
  assert.equal(second.limit, 50);

  // The ceiling is 500, whatever the caller asks for.
  const db2 = fakeDb(seed());
  const big = await grinderHandle({
    req: fakeReq(),
    op: fakeOp(db2),
    db: db2,
    body: {},
    query: { limit: '5000' },
    method: 'GET',
  });
  assert.equal(big.limit, 500);
});

test('grinder-stats: a failed seat read nulls the seat figures instead of reporting zero', async () => {
  const personas = seq(3, (i) => ({ id: `h${i}`, name: `H${i}`, profile_id: `p${i}`, is_active: true }));
  const db = fakeDb({
    content_authors: { rows: personas, count: 3 },
    tables: { rows: [], count: 1 },
    table_seats: { error: { message: 'permission denied for table table_seats', code: '42501' } },
    player_stats: { rows: [] },
  });
  const quiet = console.error;
  console.error = () => {};
  let payload;
  try {
    payload = await grinderHandle({
      req: fakeReq(),
      op: fakeOp(db),
      db,
      body: {},
      query: {},
      method: 'GET',
      requestId: 'req-2',
    });
  } finally {
    console.error = quiet;
  }
  assert.equal(payload.stats.seatsAvailable, false);
  assert.equal(payload.stats.currentlyPlaying, null, 'a partial read must not be reported as zero');
  assert.equal(payload.stats.roster[0].tables, null);
  assert.equal(payload.stats.roster[0].status, 'unknown');
  assert.ok(payload.failedSources.includes('table_seats read failed'));
  assert.doesNotMatch(JSON.stringify(payload), /permission denied/, 'no database text may escape');
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
  assert.equal(maskEmail('dan@example.com'), 'd***@example.com');
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

  // A repeated query param arrives as an array. Validate the selected first
  // value without coupling this unit test to the live analytics service.
  await assert.rejects(
    call({ type: ['made-up', 'summary'], days: ['7'] }),
    (e) => e.status === 400 && /Invalid Type/.test(e.message)
  );
  await assert.rejects(
    call({ type: ['summary', 'errors'], days: ['0', '7'] }),
    (e) => e.status === 400 && /Days Must Be Between/.test(e.message)
  );
});

// ---------------------------------------------------------------- economy

const { handle: economyHandle } = await import(path.join(ROUTE_DIR, 'economy-stats.js'));

test('economy-stats: the two lists page independently and neither counts exactly', async () => {
  const at = (i) => new Date(Date.now() - i * 3600000).toISOString();
  const txs = seq(120, (i) => ({ id: `t${i}`, amount: -2, type: 'spent', created_at: at(i) }));
  const purchases = seq(40, (i) => ({
    id: `b${i}`,
    status: 'completed',
    price_usd: 2,
    diamonds_amount: 10,
    created_at: at(i),
  }));
  const db = fakeDb({
    diamond_transactions: { rows: txs, count: 4000000 },
    diamond_reward_catalog: { rows: [] },
    diamond_purchases: { rows: purchases, count: 40 },
    vip_subscriptions: { rows: [] },
    profiles: { rows: [], count: 10 },
    vip_points: { rows: [] },
    vip_points_ledger: { rows: [] },
  });

  const payload = await economyHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    body: {},
    query: { txLimit: '10', txOffset: '20', purchaseLimit: '5', purchaseOffset: '0' },
    method: 'GET',
  });

  assert.equal(payload.transactions.length, 10, 'txLimit drives the transaction log alone');
  assert.equal(payload.recentPurchases.length, 5, 'purchaseLimit drives the purchase list alone');
  assert.equal(payload.pages.transactions.offset, 20);
  assert.equal(payload.pages.purchases.offset, 0);
  assert.equal(payload.pages.transactions.countMode, 'planned');
  assert.equal(payload.pages.purchases.total, 40);
  assert.equal(payload.pages.purchases.hasMore, true);
  assert.equal(payload.pages.purchases.truncated, true);

  // No exact count on the multi-million-row ledger.
  const txCall = db.calls.find((c) => c.table === 'diamond_transactions' && c.countMode);
  assert.equal(txCall.countMode, 'planned');

  // Diamonds Spent has its own window and says so, instead of moving with
  // ?limit because it was summed over the transaction page.
  assert.equal(payload.stats.totalDiamondsSpentWindowLabel, 'last 30 days');
  assert.equal(payload.stats.totalDiamondsSpent, 240, 'every windowed spend row, not the ten on the page');
});

// ---------------------------------------------------------------- shared libs

const { mapDbError, classifyDbError } = await import(
  path.join(HERE, '..', 'src', 'lib', 'horses', 'dbErrors.js')
);
const { pageFor, shapeList, shapeUnknownTotal, chunk, readByIds, sourceCollector } = await import(
  path.join(HERE, '..', 'src', 'lib', 'horses', 'listShape.js')
);

test('dbErrors: every failure a caller can cause gets the status that describes it', () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(classifyDbError({ code: '23505' }), 'duplicate');
    assert.equal(
      classifyDbError({ message: 'duplicate key value violates unique constraint "x"' }),
      'duplicate'
    );
    assert.equal(classifyDbError({ code: '23503' }), 'bad_input');
    assert.equal(classifyDbError({ code: '22P02' }), 'bad_input');
    assert.equal(classifyDbError({ code: '42501' }), 'denied');
    assert.equal(classifyDbError({ code: 'PGRST116' }), 'missing');
    assert.equal(classifyDbError({ message: 'connection terminated' }), 'unavailable');

    const dup = mapDbError({ code: '23505', message: 'duplicate key value ...' }, 'That Horse');
    assert.equal(dup.status, 409);
    assert.equal(dup.code, 'duplicate');
    assert.equal(dup.message, 'That Horse Already Exists');

    assert.equal(mapDbError({ code: '23503' }, 'That Row').status, 400);
    assert.equal(mapDbError({ code: '42501' }, 'That Row').status, 403);
    assert.equal(mapDbError({ code: 'PGRST116' }, 'That Row').status, 404);

    const unknown = mapDbError({ message: 'relation "public.clubs" does not exist' }, 'The Club List');
    assert.equal(unknown.status, 503);
    assert.equal(unknown.message, 'The Club List Is Unavailable');
    assert.doesNotMatch(unknown.message, /relation|public\.clubs/, 'no database text in the message');
    assert.equal(unknown.isApiError, true);
  } finally {
    console.error = quiet;
  }
});

test('listShape: pageFor prefers the named params and falls back to the shared ones', () => {
  const opts = { defaultLimit: 300, max: 500 };
  assert.deepEqual(pageFor({}, 'members', opts), { limit: 300, offset: 0, rangeEnd: 299 });
  assert.deepEqual(pageFor({ limit: '100', offset: '50' }, 'members', opts), {
    limit: 100,
    offset: 50,
    rangeEnd: 149,
  });
  assert.deepEqual(pageFor({ limit: '100', membersLimit: '10', membersOffset: '20' }, 'members', opts), {
    limit: 10,
    offset: 20,
    rangeEnd: 29,
  });
  // One list moving does not move another.
  const query = { membersOffset: '300' };
  assert.equal(pageFor(query, 'members', opts).offset, 300);
  assert.equal(pageFor(query, 'agents', { defaultLimit: 200, max: 500 }).offset, 0);
  // The ceiling holds.
  assert.equal(pageFor({ limit: '9999' }, 'members', opts).limit, 500);
});

test('listShape: shapeList marks a capped list truncated and shapeUnknownTotal never invents one', () => {
  const page = { limit: 50, offset: 0, rangeEnd: 49 };
  const full = shapeList({ data: seq(50, (i) => ({ i })), count: 900 }, page);
  assert.equal(full.total, 900);
  assert.equal(full.hasMore, true);
  assert.equal(full.truncated, true);

  const whole = shapeList({ data: [{ i: 1 }], count: 1 }, page);
  assert.equal(whole.truncated, false);

  const unknown = shapeUnknownTotal(seq(50, (i) => ({ i })), page);
  assert.equal(unknown.total, null, 'a search total is unknown, not fabricated');
  assert.equal(unknown.hasMore, true);
  const short = shapeUnknownTotal([{ i: 1 }], page);
  assert.equal(short.hasMore, false);
  assert.equal(short.truncated, false);
});

test('listShape: readByIds chunks at 200, de-duplicates and reports a partial read', async () => {
  assert.equal(chunk(seq(500, (i) => i)).length, 3);
  const seen = [];
  const ok = await readByIds({}, [...seq(500, (i) => `id${i}`), 'id0', null], (part) => {
    seen.push(part.length);
    return { data: part.map((id) => ({ id })), error: null };
  });
  assert.deepEqual(seen, [200, 200, 100], 'the ids are de-duplicated and chunked at 200');
  assert.equal(ok.rows.length, 500);
  assert.equal(ok.partial, false);

  let call = 0;
  const bad = await readByIds({}, seq(500, (i) => `id${i}`), (part) => {
    call += 1;
    if (call === 2) return { data: null, error: { message: 'boom' } };
    return { data: part.map((id) => ({ id })), error: null };
  });
  assert.equal(bad.partial, true, 'a caller must be able to see that this is not the whole set');
  assert.equal(bad.rows.length, 200);
});

test('listShape: sourceCollector names the source and logs the database text', () => {
  const logged = [];
  const quiet = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  let c;
  try {
    c = sourceCollector({ requestId: 'req-9', route: 'horses.test' });
    assert.equal(c.check('clubs', { data: [], error: null }), true);
    assert.equal(c.check('unions', { error: { message: 'relation "unions" does not exist' } }), false);
    c.check('unions', { error: { message: 'again' } });
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(c.list(), ['unions read failed'], 'named once, generically');
  assert.ok(logged.some((line) => line.includes('req-9') && line.includes('relation "unions"')));
  assert.equal(sourceCollector({}).list(), undefined);
});
