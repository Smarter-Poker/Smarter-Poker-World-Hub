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

test('a club inside a union is the UNION LEAD\'s to control, not the club owner\'s', () => {
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

test('the seed must be a whole positive number of chips', () => {
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
