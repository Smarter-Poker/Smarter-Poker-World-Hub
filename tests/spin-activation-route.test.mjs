/**
 * THE OWNER'S SPIN SWITCH, AND WHO IS ALLOWED TO FLIP IT
 *
 * Dan, 2026-08-23: "SPINS SHOULD BE 'ACTIVATED' IN THE OWNERS MENU, AND WHEN
 * THEY ARE, THEY NEED TO DECIDE HOW MUCH THEY ARE 'SEEDING' INTO THE WALLET."
 *
 * fn_spin_activate moves real money and is REVOKEd from anon and authenticated,
 * so a browser cannot call it. The database can check that the seed is large
 * enough and that the wallet can afford it. It cannot check whether the person
 * asking is the owner. That is this route's entire job.
 *
 * THE AUTHORISATION TRAP THIS GUARDS
 * fn_spin_reserve_owner resolves COALESCE(clubs.union_id, club_id): a club
 * inside a union does NOT have its own pool, its union does. So checking club
 * ownership alone would let any one club in a union seed, drain, or switch off
 * the UNION's Spin wallet. The route must route a union-owned pool to the
 * union lead, and only treat the club owner as the owner when the club stands
 * alone.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const route = readFileSync(
  path.join(process.cwd(), 'pages/api/club-arena/spin-activation.js'),
  'utf8'
);
const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the route exists and only accepts POST', () => {
  assert.ok(route.length > 0);
  assert.match(code, /req\.method !== 'POST'/);
  assert.match(code, /405/);
});

test('it authenticates before doing anything', () => {
  assert.match(code, /supabaseAdmin\.auth\.getUser\(token\)/);
  assert.match(code, /Not authenticated/);
});

test("a club inside a union is the UNION LEAD's to control, not the club owner's", () => {
  // The trap: club.owner_id alone would let one club spend the union's money.
  // Changed 2026-08-23: the branch is now taken on `ownerIsUnion`, which is
  // true both when the club sits in a union AND when the id passed IS a union.
  assert.match(code, /if \(ownerIsUnion\)/);
  assert.match(code, /from\('union_admins'\)/);
  assert.match(code, /admin\?\.role !== 'union_lead'/);
});

test('a standalone club is its own owner', () => {
  // Changed 2026-08-23: this was an early `return { error: 403 }` on
  // `club.owner_id !== user.id`. It now resolves to canManage instead, so a
  // non-owner can still READ the wallet while every money action stays behind
  // the gate below. Same rule, one place, and the panel gets told the answer
  // rather than guessing it.
  assert.match(code, /canManage: club\.owner_id === user\.id \|\| isPlatformAdmin/);
  assert.match(code, /ownerKind: 'club'/);
});

test('the ownership check runs before every action, not per action', () => {
  const auth = code.indexOf('const auth = await authorise(token, clubId)');
  const activate = code.indexOf("action === 'activate'");
  const deactivate = code.indexOf("action === 'deactivate'");
  assert.ok(auth > -1 && activate > -1 && deactivate > -1);
  assert.ok(auth < activate, 'authorise must precede activate');
  assert.ok(auth < deactivate, 'authorise must precede deactivate');
});

test('the source wallet is allow-listed per owner kind', () => {
  assert.match(code, /const CLUB_WALLETS = \['chip_treasury', 'promo_balance'\]/);
  assert.match(
    code,
    /const UNION_WALLETS = \['chip_balance', 'promo_wallet', 'rake_wallet', 'spin_reserve_wallet'\]/
  );
  assert.match(code, /auth\.ownerKind === 'union' \? UNION_WALLETS : CLUB_WALLETS/);
});

test('the max stake must be a real board price point', () => {
  assert.match(code, /const BOARD_STAKES = \[1, 2, 3, 5, 10, 20, 50, 100\]/);
  assert.match(code, /BOARD_STAKES\.includes\(maxStake\)/);
});

test('the seed must be a whole non-negative number of chips', () => {
  assert.match(code, /Number\.isFinite\(seed\)/);
  assert.match(code, /Number\.isInteger\(seed\)/);
});

test('a refusal from the function is NOT reported to the owner as success', () => {
  // fn_spin_activate reports its refusals in the payload rather than throwing,
  // so `if (error)` alone would show "activated" for a refused activation.
  assert.match(code, /if \(!data\?\.ok\)/);
  assert.match(code, /400/);
});

test('the actor is recorded on the activation', () => {
  assert.match(code, /p_actor: auth\.user\.id/);
});

test('it never trusts a club id from the body as proof of anything', () => {
  // clubId only ever selects WHICH pool; permission comes from the token.
  assert.match(code, /const token = \(req\.headers\.authorization \|\| ''\)/);
  assert.ok(
    !/req\.body\.userId/.test(code),
    'identity must come from the JWT, never from the request body'
  );
});

test('reporting an error cannot replace the error', () => {
  assert.match(route, /try \{\s*reportApiError\(err, req\);\s*\} catch/);
});

test('the payload is size-capped like the other club-arena routes', () => {
  assert.match(code, /2048/);
  assert.match(code, /413/);
});

/**
 * HARDENING, 2026-08-23 — findings from the adversarial pass over the feature.
 *
 * Two holes, both about the gap between "who owns this pool" and "who is
 * allowed to spend it".
 */

test('a union id passed as clubId is treated as a UNION, not a club', () => {
  // Every union carries a clubs row with the SAME uuid. Landing on that row and
  // then testing clubs.owner_id would authorise club ownership where union
  // leadership is required - the exact hole this file exists to close. Asking
  // `unions` directly means a data change cannot open it.
  assert.match(code, /from\('unions'\)\.select\('id'\)\.eq\('id', clubId\)/);
  assert.match(code, /const ownerIsUnion = Boolean\(unionRow\) \|\| Boolean\(club\.union_id\)/);
  assert.match(code, /if \(ownerIsUnion\)/);
});

test('permission is decided by the route and handed to the panel', () => {
  // The panel used to infer it from owner_kind, which hid the off switch from
  // the union lead who may press it, and showed an activate button to a club
  // owner who may not.
  assert.match(code, /canManage: auth\.canManage/);
  assert.match(code, /canManage: true/);
  assert.match(code, /canManage: false/);
});

test('a viewer who may not manage can still READ the wallet', () => {
  // A club owner inside a union should see their union's Spin wallet on their
  // own settings page; they simply cannot change it.
  const getState = code.indexOf("action === 'get_state'");
  const gate = code.indexOf('if (!auth.canManage)');
  assert.ok(getState > -1 && gate > -1);
  assert.ok(getState < gate, 'the read must be answered before the manage gate');
});

test('every money action is behind that gate', () => {
  const gate = code.indexOf('if (!auth.canManage)');
  const activate = code.indexOf("action === 'activate'");
  const deactivate = code.indexOf("action === 'deactivate'");
  assert.ok(gate > -1);
  assert.ok(gate < activate, 'activate must be behind the manage gate');
  assert.ok(gate < deactivate, 'deactivate must be behind the manage gate');
});

// Execute the complete route, substituting only its three imported transports.
// SQL replies below are fixtures, never execution of fn_spin_activate or proof
// of wallet, coverage, ledger, lock or deployment behavior.
const buildHandler = new Function(
  'createClient',
  'applyRateLimit',
  'LIMITS',
  'reportApiError',
  route
    .replace(/^import .*;\n/gm, '')
    .replace('export default async function handler', 'async function handler') +
    '\nreturn handler;'
);
async function invoke(body = {}, options = {}) {
  const calls = [];
  const rows = {
    clubs: { id: 'club', owner_id: 'actor', union_id: null },
    unions: null,
    profiles: { role: 'player' },
    union_admins: null,
    ...options.rows,
  };
  const client = {
    auth: {
      getUser: async (token) => {
        assert.equal(token, 'token');
        return options.badAuth
          ? { error: new Error('invalid') }
          : { data: { user: { id: 'actor' } } };
      },
    },
    from(table) {
      const filters = {};
      return {
        select() {
          return this;
        },
        eq(key, value) {
          filters[key] = value;
          return this;
        },
        async maybeSingle() {
          if (table === 'clubs' || table === 'unions') assert.equal(filters.id, 'club');
          if (table === 'profiles') assert.equal(filters.id, 'actor');
          if (table === 'union_admins') {
            assert.equal(filters.user_id, 'actor');
            assert.equal(filters.union_id, rows.unions?.id || rows.clubs.union_id);
          }
          return { data: rows[table] };
        },
      };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return options.reply ?? { data: { ok: true, charged: args.p_seed_amount } };
    },
  };
  const handler = buildHandler(
    () => client,
    () => options.rateAllowed !== false,
    { write: {} },
    () => {}
  );
  const res = {
    status(n) {
      this.code = n;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await handler(
    {
      method: options.method || 'POST',
      headers: options.noToken ? {} : { authorization: 'Bearer token' },
      body: {
        action: 'activate',
        clubId: 'club',
        seedAmount: 0,
        offeredMaxStake: 5,
        sourceWallet: 'chip_treasury',
        ...body,
      },
    },
    res
  );
  return { res, calls };
}
for (const seed of [0, '0', ' 0 ', 20, '20', '2e1']) {
  test(`actual handler forwards explicit whole seed ${JSON.stringify(seed)}`, async () => {
    const reply = {
      ok: true,
      charged: Number(seed),
      required_seed: 200,
      seeded_amount: 200 + Number(seed),
    };
    const { res, calls } = await invoke(
      { seedAmount: seed, userId: 'forged' },
      { reply: { data: reply } }
    );
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, { success: true, result: reply });
    assert.deepEqual(calls, [
      {
        name: 'fn_spin_activate',
        args: {
          p_club_id: 'club',
          p_seed_amount: Number(seed),
          p_offered_max_stake: 5,
          p_source_wallet: 'chip_treasury',
          p_actor: 'actor',
        },
      },
    ]);
  });
}
for (const seed of [
  undefined,
  null,
  true,
  false,
  '',
  '  ',
  [],
  [0],
  [20],
  {},
  -1,
  '-1',
  0.5,
  '0.5',
  NaN,
  Infinity,
  -Infinity,
  'Infinity',
  'nonsense',
]) {
  test(`actual handler refuses malformed seed ${String(seed)} (${typeof seed})`, async () => {
    const { res, calls } = await invoke({ seedAmount: seed });
    assert.equal(res.code, 400);
    assert.equal(res.body.success, false);
    assert.equal(calls.length, 0);
  });
}
for (const reason of [
  'seed_below_required',
  'already_active',
  'seed_outstanding_to_another_wallet',
  'insufficient_funds_or_no_wallet',
]) {
  test(`actual handler preserves canonical ${reason} refusal at zero and positive`, async () => {
    for (const seedAmount of [0, 20]) {
      const data = {
        ok: false,
        reason,
        required_seed: 200,
        already_outstanding: 100,
        still_needed: 100,
      };
      const { res, calls } = await invoke({ seedAmount }, { reply: { data } });
      assert.equal(calls.length, 1);
      assert.equal(res.code, 400);
      assert.deepEqual(res.body, { success: false, error: reason, detail: data });
    }
  });
}
for (const data of [null, {}, { ok: false }])
  test(`actual handler refuses incomplete SQL response ${JSON.stringify(data)}`, async () => {
    const { res } = await invoke({}, { reply: { data } });
    assert.equal(res.code, 400);
    assert.equal(res.body.success, false);
  });
test('actual handler keeps transport failure distinct from activation success', async () => {
  const { res, calls } = await invoke({}, { reply: { error: new Error('uncertain transport') } });
  assert.equal(calls.length, 1);
  assert.equal(res.code, 500);
  assert.equal(res.body.error, 'uncertain transport');
});
for (const offeredMaxStake of [0, 4, -1, 1.5, null, 'bad'])
  test(`actual handler preserves board refusal ${offeredMaxStake}`, async () => {
    const { res, calls } = await invoke({ offeredMaxStake });
    assert.equal(res.code, 400);
    assert.equal(calls.length, 0);
  });
for (const offeredMaxStake of [1, 2, 3, 5, 10, 20, 50, 100, '5'])
  test(`actual handler retains board stake ${offeredMaxStake}`, async () => {
    const { res, calls } = await invoke({ offeredMaxStake });
    assert.equal(res.code, 200);
    assert.equal(calls[0].args.p_offered_max_stake, Number(offeredMaxStake));
  });
test('actual handler retains standalone and union wallet boundaries', async () => {
  for (const sourceWallet of ['chip_treasury', 'promo_balance'])
    assert.equal((await invoke({ sourceWallet })).res.code, 200);
  for (const sourceWallet of [
    'chip_balance',
    'promo_wallet',
    'rake_wallet',
    'spin_reserve_wallet',
  ]) {
    assert.equal((await invoke({ sourceWallet })).res.code, 400);
    const result = await invoke(
      { sourceWallet },
      {
        rows: {
          clubs: { id: 'club', owner_id: 'other', union_id: 'union' },
          union_admins: { role: 'union_lead' },
        },
      }
    );
    assert.equal(result.res.code, 200);
    assert.equal(result.calls[0].args.p_actor, 'actor');
  }
  for (const sourceWallet of ['chip_treasury', 'promo_balance', 'unknown', null]) {
    const { res, calls } = await invoke(
      { sourceWallet },
      {
        rows: {
          clubs: { id: 'club', owner_id: 'actor', union_id: 'union' },
          union_admins: { role: 'union_lead' },
        },
      }
    );
    assert.equal(res.code, 400);
    assert.equal(calls.length, 0);
  }
});
test('actual handler refuses other club owners, union club owners and non-lead admins', async () => {
  for (const rows of [
    { clubs: { id: 'club', owner_id: 'other', union_id: null } },
    { clubs: { id: 'club', owner_id: 'actor', union_id: 'union' } },
    {
      clubs: { id: 'club', owner_id: 'actor', union_id: 'union' },
      union_admins: { role: 'admin' },
    },
    { unions: { id: 'club' } },
  ]) {
    const { res, calls } = await invoke({}, { rows });
    assert.equal(res.code, 403);
    assert.equal(calls.length, 0);
  }
});
test('actual handler permits union-id lead and existing platform admin roles', async () => {
  for (const rows of [
    { unions: { id: 'club' }, union_admins: { role: 'union_lead' } },
    { unions: { id: 'club' }, profiles: { role: 'admin' } },
    { unions: { id: 'club' }, profiles: { role: 'superadmin' } },
  ])
    assert.equal((await invoke({ sourceWallet: 'chip_balance' }, { rows })).res.code, 200);
});
test('actual handler keeps authentication, method, rate and payload gates', async () => {
  for (const [options, code] of [
    [{ noToken: true }, 401],
    [{ badAuth: true }, 401],
    [{ method: 'GET' }, 405],
    [{ rateAllowed: false }, undefined],
    [{ rows: { clubs: null } }, 404],
  ]) {
    const result = await invoke({}, options);
    assert.equal(result.res.code, code);
    assert.equal(result.calls.length, 0);
  }
  for (const [body, code] of [
    [{ clubId: null }, 400],
    [{ padding: 'x'.repeat(2100) }, 413],
    [{ action: 'unknown' }, 400],
  ]) {
    const result = await invoke(body);
    assert.equal(result.res.code, code);
    assert.equal(result.calls.length, 0);
  }
});
test('actual handler preserves state read and deactivate behavior', async () => {
  const result = await invoke(
    { action: 'get_state' },
    { rows: { clubs: { id: 'club', owner_id: 'other', union_id: null } } }
  );
  assert.equal(result.res.code, 200);
  assert.equal(result.res.body.canManage, false);
  assert.equal(result.calls[0].name, 'fn_spin_owner_state');
  const stopped = await invoke({ action: 'deactivate' });
  assert.equal(stopped.res.code, 200);
  assert.equal(stopped.calls[0].name, 'fn_spin_deactivate');
});
