/**
 * Phase 1, route group B of the /horses operator console.
 *
 * Two kinds of test here:
 *
 *   1. CONTRACT tests, which read the route files as text. They exist because
 *      the regressions this phase fixes are structural: an anon-key fallback
 *      that silently answers every query with zero rows, a role literal copied
 *      into twelve files, a mutating route with no audit row, and 600 lines of
 *      fleet-seeding code that must not come back. A unit test cannot see a
 *      line being pasted back in; a grep can.
 *
 *   2. UNIT tests with real code and fake I/O: the string hash, the hg client
 *      cache, and the admin-reviews / horse-launch handlers driven by a fake
 *      database.
 *
 * Nothing here touches Supabase, retired error provider or the network.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { stableHash, stableIndex, stablePick } from '../src/lib/horses/hash.js';
import {
  MAX_TOKEN_CLIENTS,
  TOKEN_CLIENT_TTL_MS,
  cacheLookup,
  cacheSize,
  cacheStore,
  bearerTokenOf,
  _resetHgClientCacheForTests,
} from '../src/lib/horses/hgOperator.js';
import { handle as reviewsHandle, spec as reviewsSpec } from '../pages/api/horses/admin-reviews.js';
import { handle as launchHandle, spec as launchSpec } from '../pages/api/club-arena/horse-launch.js';
import { handle as reportsHandle } from '../pages/api/horses/hg-reports.js';
import { handle as appealsHandle } from '../pages/api/horses/hg-appeals.js';
import { handle as onboardingHandle, spec as onboardingSpec } from '../pages/api/horses/hg-onboarding-status.js';
import { handle as pipelineHandle, PIPELINE_TYPES } from '../pages/api/horses/trigger-pipeline.js';
import { PERMISSIONS } from '../src/lib/horses/permissions.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

/** The /horses routes this agent owns, plus the club-arena fleet route. */
const WRAPPED_ROUTES = [
  'pages/api/horses/admin-reviews.js',
  'pages/api/horses/generate-avatars.js',
  'pages/api/horses/hg-reports.js',
  'pages/api/horses/hg-appeals.js',
  'pages/api/horses/hg-gdpr-erase.js',
  'pages/api/horses/hg-onboarding-status.js',
  'pages/api/horses/merch-catalog-admin.js',
  'pages/api/horses/trigger-pipeline.js',
  'pages/api/club-arena/horse-launch.js',
];

/** Every route above except the one that only ever answers 501. */
const MUTATING_ROUTES = WRAPPED_ROUTES.filter((p) => !p.endsWith('trigger-pipeline.js'));

/** Reachable from the console, outside /horses, previously audited in three
 *  different shapes or not at all. */
const OUTSIDE_ROUTES = [
  'pages/api/club-arena/approve-cashout.js',
  'pages/api/club-arena/anti-cheat.js',
  'pages/api/club-arena/union-application.js',
  'pages/api/promo/admin-promo-codes.js',
  'pages/api/admin/execute-sql.js',
];

const NEW_LIBS = ['src/lib/horses/hash.js', 'src/lib/horses/hgOperator.js'];

// Built from the code point so this file can assert against it without
// containing one, and so it stays clean under its own rule.
const EM_DASH = String.fromCharCode(0x2014);
// Pictographs, dingbats, variation selectors and regional indicators. Box
// drawing (U+2500) and arrows (U+2190) are deliberately NOT matched: they are
// not emoji, and they are all over this codebase's comment banners.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

// ------------------------------------------------------------------ contracts

test('every assigned route is built on the operator wrapper and exports spec + handle', async () => {
  for (const path of WRAPPED_ROUTES) {
    const src = await read(path);
    const usesWrapper = /withOperatorRoute|withHgOperatorRoute/.test(src);
    assert.ok(usesWrapper, `${path} must be built on the operator route wrapper`);
    assert.match(src, /export const spec = \{/, `${path} must export spec`);
    assert.match(src, /export (async function|function) handle/, `${path} must export handle`);
    assert.match(src, /export default \w*\(?/, `${path} must have a default export`);
  }
});

test('no assigned route falls back to the anon key or reimplements the role literal', async () => {
  for (const path of WRAPPED_ROUTES) {
    const src = await read(path);
    assert.doesNotMatch(
      src,
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
      `${path} must not reach for the anon key; the wrapper refuses to run without the service role`
    );
    assert.doesNotMatch(src, /ADMIN_ROLES/, `${path} must ask for a permission, never a role list`);
    assert.doesNotMatch(
      src,
      /\['admin',\s*'superadmin',\s*'god'\]/,
      `${path} must not inline the legacy role literal`
    );
  }
});

test('every mutating assigned route writes an audit row through the shared helper', async () => {
  for (const path of MUTATING_ROUTES) {
    const src = await read(path);
    assert.match(src, /auditOperatorAction/, `${path} mutates and must audit`);
    assert.doesNotMatch(src, /logAdminAction/, `${path} must not keep the old audit shape`);
  }
});

test('the five routes outside /horses now audit through the shared helper', async () => {
  for (const path of OUTSIDE_ROUTES) {
    const src = await read(path);
    assert.match(src, /auditOperatorAction/, `${path} must audit its mutations`);
    assert.doesNotMatch(src, /logAdminAction/, `${path} must not keep the old audit shape`);
  }
});

test('the outside routes carry the audit action names the console filters on', async () => {
  const expected = {
    'pages/api/club-arena/approve-cashout.js': ['cashout.approve', 'cashout.cancel'],
    // kick_player, not kick_session: the target of that row is a player id.
    'pages/api/club-arena/anti-cheat.js': ['anticheat.review_flag', 'anticheat.kick_player'],
    'pages/api/club-arena/union-application.js': ['union.review_application', 'union.review_leave_request'],
    // activate / deactivate, not one 'toggle' covering both directions: the
    // Audit tab filters on the action name, so the name has to say which way it
    // went.
    'pages/api/promo/admin-promo-codes.js': ['promo.create', 'promo.update', 'promo.activate', 'promo.deactivate'],
    'pages/api/admin/execute-sql.js': ['sql.commit'],
  };
  for (const [path, actions] of Object.entries(expected)) {
    const src = await read(path);
    for (const action of actions) {
      assert.ok(src.includes(`'${action}'`), `${path} must file ${action}`);
    }
  }
});

/**
 * execute-sql cannot be imported here: it opens a `pg` Pool and its handler is
 * a single 300-line function with no seam. These assertions are therefore made
 * against the source, but against its STRUCTURE rather than its whitespace: a
 * count of writers, the guard each one sits under, and the value passed as the
 * actor role. The previous version of this test matched the exact newlines
 * between `if (mutating && !dryRun) {` and `await auditOperatorAction(`, which
 * a formatter or one inserted comment would have broken while behaviour stayed
 * identical, and which said nothing about the duplicate row three lines above.
 */
test('execute-sql writes exactly one audit row per committed mutation, with the real role', async () => {
  const src = await read('pages/api/admin/execute-sql.js');

  // One helper call, under the committed-mutation guard.
  assert.equal(
    (src.match(/auditOperatorAction\(/g) || []).length,
    1,
    'exactly one auditOperatorAction call: a second is a second admin_audit_log row'
  );
  const guards = src.match(/if \(mutating && !dryRun\)/g) || [];
  assert.equal(guards.length, 1, 'only the audit call may be gated on committed-mutation');

  // The direct-connection duplicate is gone. Nothing may INSERT into
  // admin_audit_log on the pg client any more.
  assert.doesNotMatch(src, /INSERT INTO public\.admin_audit_log/i, 'the duplicate direct insert must be gone');
  // The names may survive in the comment explaining the removal; what must be
  // gone is any code that files them.
  assert.doesNotMatch(src, /'admin\.sql_mutation_committed'/, 'the second action namespace must be gone');
  assert.doesNotMatch(src, /'admin\.sql_mutation_failed'/);
  assert.doesNotMatch(src, /success \? 'admin\.sql_mutation/);
  assert.ok(src.includes("'sql.commit'"), 'the committed mutation files sql.commit');

  // The full SQL text still lands somewhere on the direct connection.
  assert.match(src, /INSERT INTO public\.execution_audit_logs/i);

  // The actor role is the one the auth check read, never a literal.
  assert.match(src, /let sessionRole = null;/);
  assert.match(src, /sessionRole = profile\.role;/);
  assert.match(src, /role: sessionUserId \? sessionRole : 'service_role'/);
  assert.doesNotMatch(src, /role: sessionUserId \? 'admin'/, 'the actor role must not be fabricated');

  // The audit client is service-role only; getSupabase() falls back to anon,
  // under which operatorAudit's insert fallback is refused by RLS.
  assert.match(src, /db: getAuditDb\(\)/);
  assert.match(src, /function getAuditDb\(\)/);
  assert.doesNotMatch(src, /db: getSupabase\(\),/, 'the audit client must not be the anon-capable one');

  // Dry runs and reads keep the older RPC path, and it stays browser-only.
  assert.match(src, /if \(sessionUserId && !\(mutating && !dryRun\)\) \{/);
  assert.match(src, /'admin\.sql_dry_run'/);
  assert.match(src, /'admin\.sql_executed'/);
});

test('the audit-wiring routes pass a real role, never a hardcoded admin literal', async () => {
  for (const path of [
    'pages/api/club-arena/approve-cashout.js',
    'pages/api/club-arena/anti-cheat.js',
    'pages/api/club-arena/union-application.js',
  ]) {
    const src = await read(path);
    assert.doesNotMatch(src, /role: 'admin'/, `${path} must not hardcode the actor role`);
    assert.doesNotMatch(
      src,
      /role: \w+\?\.role \|\| 'admin'/,
      `${path} must not fabricate an admin role for a caller whose profiles.role is null`
    );
  }
  const union = await read('pages/api/club-arena/union-application.js');
  assert.match(union, /const actorRole = await fetchProfileRole\(user\.id\);/);
  assert.match(union, /role: actorRole,/);
  assert.match(union, /union_authority:/, 'the authority that allowed the act belongs in the row');
});

test('horse-launch no longer contains any fleet-seeding machinery', async () => {
  const src = await read('pages/api/club-arena/horse-launch.js');
  for (const banned of [
    'createCashTables',
    'registerHorses',
    'seatHorseAtTable',
    'mass_fund_horses',
    'atomic_table_buyin',
    'CASH_TABLES',
    'SNG_CONFIGS',
    'SPIN_CONFIGS',
    'tournament_players',
  ]) {
    assert.ok(!src.includes(banned), `horse-launch must not contain ${banned}`);
  }
  assert.match(src, /retired/, 'horse-launch must say the buttons are retired');
  assert.match(src, /HorseFleetManager/, 'horse-launch must name the engine service that owns seeding');
  assert.match(src, /server\/src\/services\/HorseFleetManager\.ts/);
  assert.match(src, /#2704/, 'horse-launch must name the PR that moved seeding to the engine');
  assert.match(src, /117/, 'horse-launch must record what the old launcher did per press');
  assert.match(src, /Fleet Command Center/, 'horse-launch must name what replaces it in Phase 3');
  assert.match(src, /fleet\.launch_refused/, 'a refused press must leave a trail');
  // 600 lines of unreachable launcher is what was deleted; keep it small.
  assert.ok(src.split('\n').length < 200, 'horse-launch must stay a snapshot plus a refusal');
});

test('trigger-pipeline answers 501 not_built through the wrapper and keeps the CRON_SECRET note', async () => {
  const src = await read('pages/api/horses/trigger-pipeline.js');
  assert.match(src, /new ApiError\(501, 'Not Built Yet', 'not_built'\)/);
  assert.match(src, /CRON_SECRET/);
  assert.match(src, /Host header/i);
});

test('generate-avatars compares the cron secret in constant time and guards the remote image', async () => {
  const src = await read('pages/api/horses/generate-avatars.js');
  assert.match(src, /timingSafeEqual/);
  assert.doesNotMatch(src, /adminSecret === envSecret/);
  assert.doesNotMatch(src, /SUPABASE_KEY/, 'the unused SUPABASE_KEY constant must be gone');
  assert.doesNotMatch(src, /^const grok = getGrokClient\(\);$/m, 'no module-scope grok client');
  assert.match(src, /IMAGE_FETCH_TIMEOUT_MS = 15000/);
  assert.match(src, /AbortSignal\.timeout\(IMAGE_FETCH_TIMEOUT_MS\)/);
  assert.match(src, /5 \* 1024 \* 1024/);
  assert.match(src, /startsWith\('image\/'\)/);
  assert.match(src, /const MAX_BATCH = 5;/);
  assert.match(src, /stablePick/, 'the style must be picked from a string hash, not id % n');
  assert.match(src, /role: 'cron'/);
});

/**
 * generate-avatars imports src/lib/grokClient, which is outside this snapshot,
 * so its handler cannot be imported the way admin-reviews' and horse-launch's
 * are. These two properties are the ones the review found broken, and both are
 * visible in the source.
 */
test('generate-avatars turns a roster read failure into a 503, never a zero-generated success', async () => {
  const src = await read('pages/api/horses/generate-avatars.js');
  assert.match(
    src,
    /throw new ApiError\(503, 'Roster Read Failed', 'roster_unavailable'\)/,
    'a failed roster read must be an error, not "No Horses Were Eligible"'
  );
  assert.doesNotMatch(src, /results: \[\], error: null/, 'the fake success payload must be gone');
  assert.doesNotMatch(src, /error: null,?\s*\}/, 'the meaningless error:null key must be gone');
  // The success path that really does mean "nothing to do" still says so.
  assert.match(src, /message: 'All Horses Have Avatars'/);
});

test('generate-avatars attributes a call that carries BOTH a JWT and the cron secret to the operator', async () => {
  const src = await read('pages/api/horses/generate-avatars.js');
  assert.match(src, /const hasBearer = /);
  assert.match(
    src,
    /if \(!hasBearer && isCronCall\(req\)\) return runCronBatch\(/,
    'the cron path may only be taken when there is no operator JWT to attribute the run to'
  );
});

test('admin-reviews validates ids and ratings, searches server side and keeps the unban path', async () => {
  const src = await read('pages/api/horses/admin-reviews.js');
  assert.match(src, /review_text\.ilike/);
  assert.match(src, /reviewer_name\.ilike/);
  assert.match(src, /searchTerm/);
  assert.match(src, /'review\.delete'/);
  assert.match(src, /'review\.flag'/);
  assert.match(src, /'review\.unflag'/);
  assert.match(src, /'review\.restore_reviewer'/);
  assert.match(src, /restore_reviewer/);
  assert.match(src, /AbortSignal\.timeout\(5000\)/, 'the push hop must be bounded');
  assert.match(src, /deletedRows\.length === 0/, 'zero-row delete detection must survive');
  assert.match(src, /updatedRows\.length === 0/, 'zero-row update detection must survive');
});

test('the hg routes share one preamble and keep their RPC names and jsonb unwrapping', async () => {
  const hg = ['hg-reports', 'hg-appeals', 'hg-gdpr-erase', 'hg-onboarding-status'];
  for (const name of hg) {
    const src = await read(`pages/api/horses/${name}.js`);
    assert.match(src, /withHgOperatorRoute/, `${name} must use the shared hg wrapper`);
    assert.doesNotMatch(src, /function getUserSB/, `${name} must not rebuild the caller client`);
    assert.doesNotMatch(src, /createClient\(/, `${name} must not construct a client of its own`);
  }
  const reports = await read('pages/api/horses/hg-reports.js');
  for (const rpc of ['list_home_content_reports', 'get_home_content_report_detail', 'resolve_home_content_report']) {
    assert.ok(reports.includes(rpc), `hg-reports must keep ${rpc}`);
  }
  assert.match(reports, /data\?\.\[key\] \?\? \[\]/, 'the jsonb envelope must still be unwrapped');
  assert.match(reports, /total/);

  const appeals = await read('pages/api/horses/hg-appeals.js');
  for (const rpc of ['list_home_ban_appeals_admin', 'review_home_ban_appeal']) {
    assert.ok(appeals.includes(rpc), `hg-appeals must keep ${rpc}`);
  }
  assert.match(appeals, /\n\s+total,/, 'the appeals list must return a total');

  const gdpr = await read('pages/api/horses/hg-gdpr-erase.js');
  assert.ok(gdpr.includes('fn_anonymize_hg_user_content'));
  assert.match(gdpr, /durable: \{ max: 5, windowSeconds: 600 \}/);

  const onboarding = await read('pages/api/horses/hg-onboarding-status.js');
  assert.ok(onboarding.includes('fn_get_home_games_onboarding_status_admin'));
  assert.match(onboarding, /'support\.lookup_onboarding'/, 'a support lookup must be audited');
});

test('merch-catalog-admin keeps every validation and widens the uuid check to v7', async () => {
  const src = await read('pages/api/horses/merch-catalog-admin.js');
  assert.doesNotMatch(src, /\[1-5\]\[0-9a-f\]\{3\}/, 'the v1-v5-only uuid regex must be gone');
  assert.match(src, /uuid\(rawId\)/);
  assert.match(src, /resolvePrintfulMapping/);
  assert.match(src, /isPrintfulReady/);
  assert.match(src, /is_active: false/, 'archive must stay a soft delete');
  assert.doesNotMatch(src, /from\(table\)\.delete\(/);
  for (const guard of ['CatalogInputError', 'itemPayload', 'variantPayload', 'mergeMetadata', 'syncHasVariants']) {
    assert.ok(src.includes(guard), `merch-catalog-admin must keep ${guard}`);
  }
});

test('no file this group owns contains an em dash or an emoji', async () => {
  for (const path of [
    ...WRAPPED_ROUTES,
    ...OUTSIDE_ROUTES,
    ...NEW_LIBS,
    'src/lib/horses/operatorAudit.js',
    'src/lib/horsesAdminTokens.js',
    '__tests__/horses-routes-group-b.test.mjs',
    '__tests__/horses-libs-review.test.mjs',
  ]) {
    const src = await read(path);
    assert.ok(!src.includes(EM_DASH), `${path} contains an em dash`);
    const emoji = src.match(EMOJI_RE);
    assert.equal(emoji, null, `${path} contains an emoji: ${emoji && emoji[0]}`);
  }
});

// ----------------------------------------------------------------- hash unit

test('stableHash is deterministic, unsigned and spreads uuids over a small list', () => {
  const id = '018f5c2e-1a2b-7c3d-8e4f-0123456789ab';
  assert.equal(stableHash(id), stableHash(id));
  assert.notEqual(stableHash(id), stableHash(id.replace('ab', 'ac')));
  assert.ok(Number.isInteger(stableHash(id)) && stableHash(id) >= 0);
  assert.equal(stableHash(''), 2166136261);
  assert.equal(stableHash(null), stableHash(''));

  // The bug this replaces: `uuid % 3` is NaN, so the style was `undefined`.
  assert.ok(Number.isNaN(Number(id) % 3));
  const styles = ['a', 'b', 'c'];
  assert.ok(styles.includes(stablePick(styles, id)));
  assert.equal(stablePick(styles, id), stablePick(styles, id));
  assert.equal(stablePick([], id), null);
  assert.equal(stableIndex(id, 0), 0);

  // Every index of a three-way list is reachable across a realistic roster.
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(stableIndex(`horse-${i}-uuid`, 3));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

// ------------------------------------------------------------ hg cache unit

test('the hg caller-client cache evicts the oldest entry at the cap', () => {
  _resetHgClientCacheForTests();
  for (let i = 0; i < MAX_TOKEN_CLIENTS; i += 1) cacheStore(`token-${i}`, { id: i });
  assert.equal(cacheSize(), MAX_TOKEN_CLIENTS);
  assert.deepEqual(cacheLookup('token-0'), { id: 0 });

  cacheStore('token-overflow', { id: 'overflow' });
  assert.equal(cacheSize(), MAX_TOKEN_CLIENTS, 'the cache must never grow past the cap');
  assert.equal(cacheLookup('token-0'), null, 'the oldest token must have been evicted');
  assert.deepEqual(cacheLookup('token-overflow'), { id: 'overflow' });
  assert.deepEqual(cacheLookup(`token-${MAX_TOKEN_CLIENTS - 1}`), { id: MAX_TOKEN_CLIENTS - 1 });
  _resetHgClientCacheForTests();
});

test('a cached hg client expires after the ttl and re-storing a token does not grow the cache', () => {
  _resetHgClientCacheForTests();
  const t0 = 1_000_000;
  cacheStore('tok', { id: 1 }, t0);
  assert.deepEqual(cacheLookup('tok', t0 + TOKEN_CLIENT_TTL_MS - 1), { id: 1 });
  assert.equal(cacheLookup('tok', t0 + TOKEN_CLIENT_TTL_MS), null, 'an expired client must not be reused');
  assert.equal(cacheSize(), 0, 'an expired entry is dropped on lookup');

  cacheStore('tok', { id: 2 }, t0);
  cacheStore('tok', { id: 3 }, t0);
  assert.equal(cacheSize(), 1);
  assert.deepEqual(cacheLookup('tok', t0), { id: 3 });
  _resetHgClientCacheForTests();
});

test('bearerTokenOf refuses anything that is not a plausible bearer token', () => {
  assert.equal(bearerTokenOf({ headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }), 'x'.repeat(40));
  assert.equal(bearerTokenOf({ headers: { authorization: 'Bearer short' } }), null);
  assert.equal(bearerTokenOf({ headers: { authorization: 'x'.repeat(40) } }), null);
  assert.equal(bearerTokenOf({}), null);
});

// ------------------------------------------------------- handler unit: fakes

function fakeReq({ headers = {} } = {}) {
  return {
    method: 'POST',
    headers: { 'user-agent': 'node-test', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function fakeOp(db, { permissions = Object.values(PERMISSIONS) } = {}) {
  return { user: { id: 'op-1' }, role: 'admin', db, permissions, requestId: 'req-1' };
}

/**
 * A recording query builder. Every terminal (`.range`, `.maybeSingle`, an await
 * on the chain itself) resolves whatever `results[table]` says, and the calls
 * are kept so a test can assert on the filters that were built.
 */
function fakeDb(results = {}) {
  const calls = { tables: [], filters: [], rpc: [], ilikes: [] };
  const db = {
    calls,
    from(table) {
      const state = { table, ors: [], eqs: [], op: 'select' };
      calls.tables.push(state);
      const resolve = () => {
        const r = results[table];
        const value = typeof r === 'function' ? r(state) : r;
        return Promise.resolve(value || { data: [], count: 0, error: null });
      };
      const chain = {
        select(cols, opts) {
          state.cols = cols;
          state.opts = opts;
          return chain;
        },
        eq(col, val) {
          state.eqs.push([col, val]);
          return chain;
        },
        in(col, val) {
          state.in = [col, val];
          return chain;
        },
        gt(col, val) {
          state.gt = [col, val];
          return chain;
        },
        gte(col, val) {
          state.gte = [col, val];
          return chain;
        },
        neq(col, val) {
          state.neq = [col, val];
          return chain;
        },
        is(col, val) {
          state.is = [col, val];
          return chain;
        },
        ilike(col, pattern) {
          state.ilike = [col, pattern];
          calls.ilikes.push([table, col, pattern]);
          return chain;
        },
        not(...args) {
          state.not = args;
          return chain;
        },
        or(filter) {
          state.ors.push(filter);
          calls.filters.push(filter);
          return chain;
        },
        order(...args) {
          state.orders = (state.orders || []).concat([args]);
          return chain;
        },
        limit(n) {
          state.limit = n;
          return chain;
        },
        range(a, b) {
          state.range = [a, b];
          return resolve();
        },
        delete() {
          state.op = 'delete';
          return chain;
        },
        update(payload) {
          state.op = 'update';
          state.payload = payload;
          return chain;
        },
        maybeSingle() {
          state.single = true;
          return resolve();
        },
        then(onOk, onErr) {
          return resolve().then(onOk, onErr);
        },
      };
      return chain;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: null, error: null };
    },
    storage: {
      from() {
        return {
          async upload() {
            return { data: {}, error: null };
          },
          getPublicUrl() {
            return { data: { publicUrl: 'https://example.test/a.png' } };
          },
        };
      },
    },
  };
  return db;
}

// ------------------------------------------------- handler unit: admin-reviews

test('admin-reviews spec gates reads on players.read and writes on moderation.write', () => {
  assert.equal(reviewsSpec.permission.GET, PERMISSIONS.PLAYERS_READ);
  assert.equal(reviewsSpec.permission.DELETE, PERMISSIONS.MODERATION_WRITE);
  assert.equal(reviewsSpec.permission.PATCH, PERMISSIONS.MODERATION_WRITE);
  assert.deepEqual(reviewsSpec.methods, ['GET', 'DELETE', 'PATCH']);
});

test('admin-reviews DELETE 400s on a malformed review id instead of letting Postgres 500', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => reviewsHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'DELETE', query: { review_id: 'not-a-uuid' }, body: {} }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'invalid_review_id');
      return true;
    }
  );
  assert.equal(db.calls.tables.length, 0, 'a bad id must never reach the database');
});

test('admin-reviews PATCH 400s on a malformed review id and on an unknown action', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => reviewsHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'PATCH', query: {}, body: { action: 'flag', review_id: 'nope' } }),
    (err) => err.status === 400 && err.code === 'invalid_review_id'
  );
  await assert.rejects(
    () => reviewsHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'PATCH', query: {}, body: { action: 'nuke' } }),
    (err) => err.status === 400 && err.code === 'invalid_action'
  );
});

test('admin-reviews GET 400s on a rating that is not 1..5 rather than passing NaN to PostgREST', async () => {
  const db = fakeDb();
  for (const rating of ['abc', '0', '6', '2.5']) {
    await assert.rejects(
      () => reviewsHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'GET', query: { rating }, body: {} }),
      (err) => {
        assert.equal(err.status, 400, `rating=${rating} must be a 400`);
        assert.equal(err.code, 'invalid_rating');
        return true;
      }
    );
  }
  assert.equal(db.calls.tables.length, 0);
});

test('admin-reviews GET searches server side with ilike over the text and the reviewer name', async () => {
  const rows = [{ id: 'r1', venue_id: 7, rating: 5, review_text: 'great room', reviewer_name: 'dan' }];
  const db = fakeDb({
    venue_reviews: (state) => {
      if (state.range) return { data: rows, count: 1, error: null };
      if (state.not) return { data: [{ rating: 5 }], count: null, error: null };
      return { data: null, count: 3, error: null };
    },
    venues: { data: [{ id: 7, name: 'The Card Room', city: 'Reno', state: 'NV' }], error: null },
  });

  const out = await reviewsHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    method: 'GET',
    // The search term carries PostgREST filter grammar; it must be stripped.
    query: { q: "dan'),or(role.eq.god", rating: '5', flagged: 'true', limit: '25', offset: '0' },
    body: {},
  });

  assert.equal(db.calls.filters.length, 1, 'exactly one .or() search filter must be built');
  const filter = db.calls.filters[0];
  assert.match(filter, /review_text\.ilike\.%/, 'the review text column must be searched with ilike');
  assert.match(filter, /reviewer_name\.ilike\.%/, 'the reviewer name column must be searched with ilike');
  assert.doesNotMatch(filter, /role\.eq\.god/, 'filter grammar must be stripped from the term');
  assert.equal(out.query.q, 'dan or role eq god');

  // Paged shape plus the legacy field names the console already reads.
  assert.deepEqual(out.rows, out.reviews);
  assert.equal(out.rows[0].venue_name, 'The Card Room - Reno, NV');
  assert.equal(out.total, 1);
  assert.equal(out.limit, 25);
  assert.equal(out.offset, 0);
  assert.equal(out.hasMore, false);
  assert.equal(out.stats.filtered_total, 1);
  assert.equal(out.stats.total, 3);
  assert.deepEqual(out.page, { offset: 0, limit: 25, returned: 1 });
});

test('admin-reviews GET resolves matching usernames to ids and folds them into the search', async () => {
  // Contract item 3 says the search covers the reviewer USERNAME, and the
  // console tells the operator so. venue_reviews only carries the denormalised
  // reviewer_name, so profiles.username has to be resolved to ids first.
  const db = fakeDb({
    profiles: {
      data: [
        { id: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab' },
        { id: 'E5A1B2C3-D4E5-4F60-8112-233445566778' },
      ],
      error: null,
    },
    venue_reviews: (state) => {
      if (state.range) return { data: [], count: 0, error: null };
      if (state.not) return { data: [], count: null, error: null };
      return { data: null, count: 0, error: null };
    },
  });

  await reviewsHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'GET', query: { q: 'dan' }, body: {} });

  assert.deepEqual(db.calls.ilikes, [['profiles', 'username', '%dan%']]);
  assert.equal(db.calls.filters.length, 1);
  const filter = db.calls.filters[0];
  assert.match(filter, /review_text\.ilike\.%dan%/);
  assert.match(filter, /reviewer_name\.ilike\.%dan%/);
  assert.match(
    filter,
    /user_id\.in\.\(018f5c2e-1a2b-7c3d-8e4f-0123456789ab,e5a1b2c3-d4e5-4f60-8112-233445566778\)/,
    'ids are lower-cased through uuid() so nothing unvalidated reaches the filter'
  );
});

test('admin-reviews GET still lists when the username lookup fails', async () => {
  const db = fakeDb({
    profiles: { data: null, error: { message: 'permission denied for table profiles' } },
    venue_reviews: (state) => {
      if (state.range) return { data: [], count: 0, error: null };
      if (state.not) return { data: [], count: null, error: null };
      return { data: null, count: 0, error: null };
    },
  });
  const out = await reviewsHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    method: 'GET',
    query: { q: 'dan' },
    body: {},
  });
  assert.equal(out.total, 0);
  const filter = db.calls.filters[0];
  assert.doesNotMatch(filter, /user_id\.in/, 'a failed lookup narrows the search, it does not break it');
  assert.match(filter, /review_text\.ilike\.%dan%/);
});

test('admin-reviews GET builds no search filter when q is absent or blank', async () => {
  const db = fakeDb({
    venue_reviews: (state) => {
      if (state.range) return { data: [], count: 0, error: null };
      if (state.not) return { data: [], count: null, error: null };
      return { data: null, count: 0, error: null };
    },
  });
  await reviewsHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'GET', query: { q: '   ' }, body: {} });
  assert.equal(db.calls.filters.length, 0);
});

// -------------------------------------------------- handler unit: horse-launch

test('horse-launch status is a read-only snapshot and asks only for fleet.read', async () => {
  assert.equal(launchSpec.permission, PERMISSIONS.FLEET_READ);
  assert.deepEqual(launchSpec.methods, ['POST']);

  const db = fakeDb({
    profiles: { count: 1200, error: null },
    tables: { count: 89, error: null },
    tournaments: { count: 12, error: null },
  });
  const out = await launchHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'POST', query: {}, body: { action: 'status' } });

  assert.equal(out.action, 'status');
  assert.equal(out.totalHorses, 1200);
  assert.equal(out.activeTables, 89);
  assert.equal(out.activeTournaments, 12);
  assert.equal(out.seedingOwner, 'engine.HorseFleetManager');
  assert.deepEqual(out.failedSources, []);
  assert.equal(db.calls.rpc.length, 0, 'status must not call an RPC');
  for (const state of db.calls.tables) {
    assert.equal(state.op, 'select', 'status must never write');
  }
});

test('horse-launch status returns the new names AND the legacy aliases the panel reads', async () => {
  // Contract addendum item 13. Without the aliases every tile on the Grinder
  // fleet panel renders '-' beside a hint claiming the figure came straight
  // from this route.
  const db = fakeDb({
    profiles: (state) => ({ count: state.eqs.some(([c, v]) => c === 'horse_status' && v === 'seated') ? 340 : 1200, error: null }),
    tables: { count: 89, error: null },
    tournaments: { count: 12, error: null },
  });
  const out = await launchHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    method: 'POST',
    query: {},
    body: { action: 'status' },
    requestId: 'req-1',
  });

  assert.equal(out.totalHorses, 1200);
  assert.equal(out.seatedHorses, 340);
  assert.equal(out.activeTables, 89);
  assert.equal(out.activeTournaments, 12);
  assert.equal(out.cashTables, out.activeTables, 'legacy alias cashTables');
  assert.equal(out.horsesSeated, out.seatedHorses, 'legacy alias horsesSeated');
  assert.equal(out.tournaments, out.activeTournaments, 'legacy alias tournaments');
  assert.equal(out.timestamp, out.checkedAt, 'legacy alias timestamp');
  assert.match(out.checkedAt, /^\d{4}-\d{2}-\d{2}T/, 'Status Read At needs a real timestamp');
});

test('horse-launch status names a failed source generically and carries the request id', async () => {
  // Contract addendum item 16: no raw database text in the response.
  const db = fakeDb({
    profiles: { count: 1200, error: null },
    tables: { count: null, error: { message: 'relation "tables" does not exist' } },
    tournaments: { count: 12, error: null },
  });
  const out = await launchHandle({
    req: fakeReq(),
    op: fakeOp(db),
    db,
    method: 'POST',
    query: {},
    body: { action: 'status' },
    requestId: 'req-42',
  });
  assert.equal(out.activeTables, null, 'a failed count is null, never 0');
  assert.equal(out.cashTables, null);
  assert.deepEqual(out.failedSources, [{ source: 'tables', error: 'tables read failed', requestId: 'req-42' }]);
  assert.ok(!JSON.stringify(out).includes('does not exist'), 'database text must never reach the browser');
});

test('horse-launch POST is rate limited at the write tier', () => {
  // A POST that writes an audit row on every refusal must not sit in the
  // 120/min read bucket: a stale cached client in a retry loop would fill
  // admin_audit_log with fleet.launch_refused rows.
  assert.equal(launchSpec.limit, 'write');
});

test('horse-launch launch_all is 410 retired, and the refusal is audited', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => launchHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'POST', query: {}, body: { action: 'launch_all' } }),
    (err) => {
      assert.equal(err.status, 410);
      assert.equal(err.code, 'retired');
      assert.match(err.message, /HorseFleetManager/);
      assert.match(err.message, /Retired In Phase 1/);
      return true;
    }
  );
  assert.equal(db.calls.rpc.length, 1, 'a refused press must leave an audit row');
  assert.equal(db.calls.rpc[0].name, 'fn_log_admin_action');
  assert.equal(db.calls.rpc[0].args.p_action, 'fleet.launch_refused');
  assert.equal(db.calls.rpc[0].args.p_details.requested_action, 'launch_all');
  assert.equal(db.calls.tables.length, 0, 'nothing may be created, funded or seated');
});

test('horse-launch shutdown is 410 retired too, and neither action is reachable without fleet.write', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => launchHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'POST', query: {}, body: { action: 'shutdown' } }),
    (err) => err.status === 410 && err.code === 'retired'
  );
  assert.equal(db.calls.rpc[0].args.p_details.requested_action, 'shutdown');

  const readOnly = fakeDb();
  const readOnlyOp = fakeOp(readOnly, { permissions: [PERMISSIONS.FLEET_READ] });
  await assert.rejects(
    () => launchHandle({ req: fakeReq(), op: readOnlyOp, db: readOnly, method: 'POST', query: {}, body: { action: 'launch_all' } }),
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'permission_denied');
      return true;
    }
  );
  assert.equal(readOnly.calls.rpc.length, 0, 'a caller without fleet.write never reaches the refusal audit');
});

test('horse-launch 400s on an unknown action', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => launchHandle({ req: fakeReq(), op: fakeOp(db), db, method: 'POST', query: {}, body: { action: 'seed_everything' } }),
    (err) => err.status === 400 && err.code === 'invalid_action'
  );
});

// ------------------------------------------------- handler unit: hg pagination

/** A caller-scoped client double: the hg routes run every RPC on this. */
function fakeUserDb(responder) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const r = typeof responder === 'function' ? responder(name, args) : responder;
      return r || { data: null, error: null };
    },
  };
}

const hgOp = { user: { id: 'op-1' }, role: 'admin', requestId: 'req-1' };

test('hg-reports returns total null and hasMore true when the RPC gives no count', async () => {
  // Contract addendum item 15. The fabricated total (offset + rows.length) made
  // page one of a full queue read "Showing 1-50 Of 50" and disabled Next, so
  // every report past row 50 was unreachable - on the DEFAULT tab.
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}` }));
  const userDb = fakeUserDb({ data: { success: true, reports: rows }, error: null });
  const out = await reportsHandle({
    method: 'GET',
    op: hgOp,
    userDb,
    query: { limit: '50', offset: '0' },
  });
  assert.equal(out.total, null, 'an unknown total must be null, never invented');
  assert.equal(out.hasMore, true, 'a full page means there may be more');
  assert.equal(out.rows.length, 50);
  assert.deepEqual(out.reports, out.rows, 'the legacy key is still there');
  assert.equal(out.limit, 50);
  assert.equal(out.offset, 0);
});

test('hg-reports reports hasMore false on a short page and uses a real count when given one', async () => {
  const short = fakeUserDb({ data: { reports: [{ id: 'r1' }, { id: 'r2' }] }, error: null });
  const outShort = await reportsHandle({ method: 'GET', op: hgOp, userDb: short, query: { limit: '50' } });
  assert.equal(outShort.total, null);
  assert.equal(outShort.hasMore, false);

  const counted = fakeUserDb({ data: { total: 137, reports: [{ id: 'r1' }] }, error: null });
  const outCounted = await reportsHandle({
    method: 'GET',
    op: hgOp,
    userDb: counted,
    query: { limit: '50', offset: '100' },
  });
  assert.equal(outCounted.total, 137);
  assert.equal(outCounted.hasMore, true, '100 + 1 < 137');

  const last = fakeUserDb({ data: { total: 101, reports: [{ id: 'r1' }] }, error: null });
  const outLast = await reportsHandle({
    method: 'GET',
    op: hgOp,
    userDb: last,
    query: { limit: '50', offset: '100' },
  });
  assert.equal(outLast.hasMore, false, '100 + 1 is not less than 101');
});

test('hg-reports treats an empty ?id= as a list request, not a malformed detail request', async () => {
  const userDb = fakeUserDb({ data: [{ id: 'r1' }], error: null });
  const out = await reportsHandle({ method: 'GET', op: hgOp, userDb, query: { id: '' } });
  assert.equal(userDb.calls[0].name, 'list_home_content_reports');
  assert.equal(out.rows.length, 1);

  const detail = fakeUserDb({ data: { id: 'r1' }, error: null });
  const outDetail = await reportsHandle({
    method: 'GET',
    op: hgOp,
    userDb: detail,
    query: { id: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab' },
  });
  assert.equal(detail.calls[0].name, 'get_home_content_report_detail');
  assert.deepEqual(outDetail.report, { id: 'r1' });

  const bad = fakeUserDb({ data: null, error: null });
  await assert.rejects(
    () => reportsHandle({ method: 'GET', op: hgOp, userDb: bad, query: { id: 'not-a-uuid' } }),
    (err) => err.status === 400 && err.code === 'invalid_report_id'
  );
});

test('hg-appeals returns total null and hasMore from the page size', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: `a${i}` }));
  const userDb = fakeUserDb({ data: rows, error: null });
  const out = await appealsHandle({
    method: 'GET',
    op: hgOp,
    userDb,
    query: { limit: '25', offset: '50' },
  });
  assert.equal(out.total, null);
  assert.equal(out.hasMore, true);
  assert.deepEqual(out.appeals, out.rows, 'the legacy appeals key is still there');
  assert.equal(userDb.calls[0].name, 'list_home_ban_appeals_admin');
  assert.equal(userDb.calls[0].args.p_offset, 50);
  assert.equal(userDb.calls[0].args.p_caller_user_id, 'op-1');

  const counted = fakeUserDb({ data: { total: 4, appeals: [{ id: 'a1' }] }, error: null });
  const outCounted = await appealsHandle({ method: 'GET', op: hgOp, userDb: counted, query: {} });
  assert.equal(outCounted.total, 4);
  assert.equal(outCounted.hasMore, true);
});

test('hg-appeals PATCH audits the decision on the service-role client, not the caller client', async () => {
  const db = fakeDb();
  const userDb = fakeUserDb({ data: { unbanned: true }, error: null });
  const out = await appealsHandle({
    req: fakeReq(),
    method: 'PATCH',
    op: { ...hgOp, db },
    db,
    userDb,
    query: {},
    body: {
      appeal_id: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab',
      decision: 'approved',
      reviewer_note: '  looks right  ',
    },
  });
  assert.equal(out.decision, 'approved');
  assert.equal(userDb.calls[0].name, 'review_home_ban_appeal');
  assert.equal(userDb.calls[0].args.p_reviewer_note, 'looks right');
  assert.equal(userDb.calls.length, 1, 'the audit row must not go through the caller client');
  assert.equal(db.calls.rpc.length, 1);
  assert.equal(db.calls.rpc[0].args.p_action, 'hg.appeal_reviewed');
  assert.equal(db.calls.rpc[0].args.p_details.decision, 'approved');

  await assert.rejects(
    () =>
      appealsHandle({
        req: fakeReq(),
        method: 'PATCH',
        op: { ...hgOp, db },
        db,
        userDb: fakeUserDb({ data: null, error: null }),
        query: {},
        body: { appeal_id: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab', decision: 'maybe' },
      }),
    (err) => err.status === 400 && err.code === 'invalid_decision'
  );
});

// ------------------------------------ handler unit: onboarding and pipeline

test('hg-onboarding-status keeps its audit row and pays for it with the write rate bucket', async () => {
  assert.equal(onboardingSpec.limit, 'write', 'an audited GET must not sit in the 120/min read bucket');

  const db = fakeDb();
  const userDb = fakeUserDb({ data: { step: 'complete' }, error: null });
  const out = await onboardingHandle({
    req: fakeReq(),
    op: { ...hgOp, db },
    db,
    userDb,
    query: { userId: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab' },
  });
  assert.deepEqual(out.status, { step: 'complete' });
  assert.equal(db.calls.rpc.length, 1, 'a support lookup of another player is audited');
  assert.equal(db.calls.rpc[0].args.p_action, 'support.lookup_onboarding');
  // PII posture: the row records that something was found, never what.
  assert.deepEqual(db.calls.rpc[0].args.p_details, { found: true });
});

test('trigger-pipeline validates the requested type before answering 501', async () => {
  assert.deepEqual(PIPELINE_TYPES, ['test', 'cycle', 'daily', 'publish']);

  for (const type of PIPELINE_TYPES) {
    await assert.rejects(
      () => pipelineHandle({ body: { type } }),
      (err) => {
        assert.equal(err.status, 501);
        assert.equal(err.code, 'not_built');
        return true;
      },
      `a valid type (${type}) must still answer 501 not_built`
    );
  }

  // A typo used to get the same 501 as a correct call, so the caller learned
  // nothing about what it had sent.
  for (const bad of ['daily_stories', '', 'TEST', 42, {}]) {
    await assert.rejects(
      () => pipelineHandle({ body: { type: bad } }),
      (err) => {
        assert.equal(err.status, 400, `type=${String(bad)} must be a 400`);
        assert.equal(err.code, 'invalid_pipeline_type');
        assert.match(err.message, /test, cycle, daily, publish/);
        return true;
      }
    );
  }

  // No body at all is the console's own call shape and stays a 501.
  await assert.rejects(() => pipelineHandle({}), (err) => err.status === 501);
  await assert.rejects(() => pipelineHandle(), (err) => err.status === 501);
});
