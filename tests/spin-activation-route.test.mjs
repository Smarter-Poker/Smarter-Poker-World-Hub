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
  assert.match(code, /if \(club\.union_id\)/);
  assert.match(code, /from\('union_admins'\)/);
  assert.match(code, /admin\?\.role !== 'union_lead'/);
});

test('a standalone club is its own owner', () => {
  assert.match(code, /club\.owner_id !== user\.id/);
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
