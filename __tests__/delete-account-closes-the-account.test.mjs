/**
 * Executes the real DELETE /api/auth/delete-account handler with every
 * external dependency stubbed (the harness of gdpr-financial-refusal.test.mjs).
 * Run: node --experimental-vm-modules --test __tests__/delete-account-closes-the-account.test.mjs
 * No Supabase SDK, credentials, network or provider is loaded.
 *
 * WHY. Until 2026-09-29 this endpoint hard-deleted rows and then the Auth user,
 * and it failed for EVERY account: 42501 on its first write (service_role holds
 * no write privilege on cashout_requests), and past that, P0403 from the
 * append-only financial journals a hard delete of profiles or auth.users
 * cascades into. Both the World Hub settings page and the Club Arena app call
 * it, and App Review 5.1.1(v) requires it to work. The database now closes the
 * account (public.fn_close_account, Club Arena migration 20260929051751) and
 * this handler soft-deletes the Auth user. These pin what made it work:
 *   - the handler changes NO table itself - its one table read is the MFA
 *     probe, and every change goes through fn_close_account in one transaction;
 *   - the Auth delete is SOFT, deleteUser(id, true) - a hard delete cascades
 *     into the journals and is refused;
 *   - a refusal closes nothing and says, in `error`, exactly what to settle,
 *     because both callers show `error` as it is.
 * And, added the same day, the person's pictures leave with them: closing had
 * cleared the links but left the files, and anyone can list social-media
 * avatars/%, so a closed account's photo stayed findable by id. The handler
 * removes the files in theirPictures() through the Storage API - the
 * person's, and nothing else - after the database answers ok and before the
 * login goes; a file it cannot remove is reported and keeps the erasure
 * request open, but does not keep the account open.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const ROUTE = 'pages/api/auth/delete-account.js';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const OTHER = '22222222-2222-4222-8222-222222222222';

// A Storage holding the person's pictures in every place the Hub keeps them,
// beside files that must stay: someone else's, and the person's own message
// attachments and bankroll records.
const THEIR_PICTURES = {
  'social-media': [`avatars/${ACTOR}/1770000000000_a1b2c3_me.jpg`, `covers/${ACTOR}/1770000000001_d4e5f6_cover.jpg`],
  'user-media': [`${ACTOR}/photos/aaaaaaaa-0000-4000-8000-000000000001.jpg`, `${ACTOR}/videos/aaaaaaaa-0000-4000-8000-000000000002.mp4`],
  avatars: [`${ACTOR}/avatar.jpg`],
  'custom-avatars': [
    `generated/likeness_${ACTOR}_1770000000002.png`,
    `generated/${ACTOR}_1770000000003.png`,
    `generated/edited_${ACTOR}_1770000000004.png`,
  ],
};
const MUST_STAY = {
  'social-media': [
    `avatars/${OTHER}/1770000000005_g7h8i9_them.jpg`,
    `avatars/${OTHER}.png`,
    `covers/${OTHER}/1770000000006_j1k2l3_cover.jpg`,
    `photos/${ACTOR}/1770000000007_m4n5o6_posted.jpg`,
  ],
  'user-media': [`${ACTOR}/messages/1770000000008.png`, `${ACTOR}/bankroll/1770000000009_p7q8r9.jpg`],
  avatars: [`${OTHER}/avatar.jpg`],
  'custom-avatars': [
    `generated/likeness_${OTHER}_1770000000010.png`,
    `generated/${OTHER}_1770000000011.png`,
    // The Storage search treats _ as a wildcard: this answers the search for
    // "<ACTOR>_" but is not named that, so it stays.
    `generated/${ACTOR}X1770000000012.png`,
  ],
};

function storageOf(...sets) {
  const store = {};
  for (const set of sets) {
    for (const [bucket, names] of Object.entries(set)) store[bucket] = [...(store[bucket] ?? []), ...names];
  }
  return store;
}

/** The Storage list semantics the handler relies on: a folder listing, the
 *  search appended to the folder as a case-insensitive prefix in which _ is
 *  a wildcard, files with an id, sub-folders without one, name order. */
function listLikeStorage(names, folder, { limit = 100, offset = 0, search = '' } = {}) {
  const base = folder ? `${folder}/` : '';
  const loose = new RegExp(
    `^${(base + search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.')}`,
    'i'
  );
  const entries = new Map();
  for (const name of names) {
    if (!loose.test(name)) continue;
    const rest = name.slice(base.length);
    const slash = rest.indexOf('/');
    if (slash >= 0) entries.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null });
    else entries.set(rest, { name: rest, id: `id:${name}` });
  }
  // Byte order, as Storage lists (COLLATE "C").
  return [...entries.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(offset, offset + limit);
}

// Every reason public.fn_close_account refuses with. When the function learns
// a new one, add it here AND to REFUSALS; until then the new reason answers 500
// "contact support" and closes nothing, which is safe but unhelpful.
const REASONS = [
  'seated', 'tournament_entry', 'pending_cashout', 'escrow', 'chip_request',
  'club_chips', 'wallet_balance', 'open_ticket', 'club_agent', 'downline',
  'club_owner', 'club_staff', 'union_owner', 'financial',
];

const plain = (value) => JSON.parse(JSON.stringify(value));

async function invoke(options = {}) {
  const calls = { rpc: [], provider: [], tables: [], logs: [], unexpected: [], storage: [], reports: [], sequence: [] };
  const store = options.store ?? storageOf(THEIR_PICTURES, MUST_STAY);
  function unexpected(message) {
    calls.unexpected.push(message);
    throw new Error(message);
  }
  const user = options.noUser ? null : { id: ACTOR };
  const authError = options.authError ? { message: 'invalid session' } : null;
  const supabase = {
    auth: {
      admin: {
        async deleteUser(...args) {
          calls.provider.push(args);
          calls.sequence.push('auth.deleteUser');
          return { error: options.providerError ? { message: 'provider refused' } : null };
        },
      },
    },
    storage: {
      from(bucket) {
        return {
          async list(folder, listOptions) {
            calls.storage.push(['list', bucket, folder, plain(listOptions ?? {})]);
            calls.sequence.push('storage');
            if (options.storageListError === bucket) return { data: null, error: { message: 'list refused' } };
            return { data: listLikeStorage(store[bucket] ?? [], folder, listOptions), error: null };
          },
          async remove(paths) {
            calls.storage.push(['remove', bucket, [...paths]]);
            calls.sequence.push('storage');
            if (options.storageRemoveError === bucket) return { data: null, error: { message: 'remove refused' } };
            store[bucket] = (store[bucket] ?? []).filter((name) => !paths.includes(name));
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    from(table) {
      calls.tables.push(table);
      if (table !== 'user_mfa_factors') return unexpected(`Unexpected table: ${table}`);
      return {
        select(columns) {
          assert.equal(columns, 'enabled');
          return {
            eq(column, id) {
              assert.equal(column, 'user_id');
              assert.equal(id, ACTOR);
              return { maybeSingle: async () => ({ data: options.mfaEnabled ? { enabled: true } : null }) };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args: plain(args) });
      calls.sequence.push(`rpc.${name}`);
      if (name === 'fn_close_account') {
        if (options.rpcError) return { data: null, error: { message: 'RPC refused' } };
        return { data: options.closed ?? { ok: true, already_closed: false, request_id: REQUEST }, error: null };
      }
      if (name === 'fn_mark_gdpr_completed') {
        if (options.markerThrows) throw new Error('marker threw');
        return { data: true, error: options.markerError ? { message: 'marker refused' } : null };
      }
      return unexpected(`Unexpected RPC: ${name}`);
    },
  };
  const dependencies = {
    supabaseServerClient: { createClient: () => supabase },
    serverAuth: { getServerUserWithFallback: async () => ({ user, error: authError }) },
    apiRateLimit: { rateLimit: () => (options.rateDenied ? { ok: false, retryAfter: 60 } : { ok: true }) },
    mfaGate: {
      requireRecentMfa: async () =>
        options.mfaDenied ? { ok: false, status: 403, requiresStepUp: true, maxAgeSec: 300 } : { ok: true },
    },
    apiErrorHandler: {
      reportApiError: (error) => {
        if (!options.expectReport) return unexpected(`Unexpected handler error: ${error.message}`);
        calls.reports.push(error.message);
      },
    },
  };
  const log = (level) => (...args) => calls.logs.push([level, ...args]);
  const context = vm.createContext({
    process: { env: Object.freeze({}) },
    console: { info: log('info'), warn: log('warn'), error: log('error') },
    fetch: () => unexpected('Network is prohibited'),
  });
  const module = new vm.SourceTextModule(await readFile(new URL(ROUTE, ROOT), 'utf8'), {
    context,
    identifier: ROUTE,
    importModuleDynamically: (specifier) => unexpected(`Unexpected dynamic import: ${specifier}`),
  });
  await module.link((specifier) => {
    const name = specifier.split('/').at(-1);
    if (!specifier.match(/^\.\.\//) || !dependencies[name]) return unexpected(`Unexpected import: ${specifier}`);
    const exports = dependencies[name];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const req = {
    method: options.method ?? 'DELETE',
    headers: options.noAuthorization ? {} : { authorization: 'Bearer local-test-token' },
    body: { confirm: true },
  };
  const res = {
    statusCode: 200, headersSent: false, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = plain(value); this.headersSent = true; return this; },
  };
  await module.namespace.default(req, res);
  assert.deepEqual(calls.unexpected, [], 'No unstubbed dependency or unexpected handler failure');
  return { calls, res, store, refusals: module.namespace.REFUSALS, theirPictures: module.namespace.theirPictures };
}

function assertNothingClosed(calls) {
  assert.equal(calls.provider.length, 0, 'A refusal must not touch the Auth user');
  assert.deepEqual(calls.storage, [], 'A refusal must not touch a picture');
  assert.equal(calls.rpc.filter((c) => c.name === 'fn_mark_gdpr_completed').length, 0);
}

test('closes the account: one RPC, a SOFT Auth delete, the erasure marked complete', async () => {
  const { calls, res } = await invoke();
  assert.deepEqual(calls.rpc, [
    { name: 'fn_close_account', args: { p_user_id: ACTOR } },
    { name: 'fn_mark_gdpr_completed', args: { p_request_id: REQUEST } },
  ]);
  assert.deepEqual(calls.provider, [[ACTOR, true]], 'deleteUser(id, true): a hard delete cascades into the journals');
  assert.deepEqual(calls.tables, ['user_mfa_factors'], 'The handler reads the MFA probe and changes no table itself');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('a retry after the database already closed it finishes the Auth step', async () => {
  const { calls, res } = await invoke({ closed: { ok: true, already_closed: true, request_id: REQUEST } });
  assert.deepEqual(calls.provider, [[ACTOR, true]]);
  assert.deepEqual(calls.rpc.map((c) => c.name), ['fn_close_account', 'fn_mark_gdpr_completed']);
  assert.equal(res.statusCode, 200);
});

test('every reason the database refuses with has its own instruction', async () => {
  const { refusals } = await invoke();
  assert.deepEqual(Object.keys(refusals).sort(), [...REASONS].sort());
  for (const reason of REASONS) {
    assert.match(refusals[reason], /then close your account\.$/, `${reason} tells the player what to do first`);
  }
});

for (const reason of REASONS) {
  test(`refusal "${reason}": 400, the instruction in error, nothing closed`, async () => {
    const { calls, res, refusals } = await invoke({ closed: { ok: false, reason } });
    assertNothingClosed(calls);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.reason, reason);
    assert.equal(res.body.error, refusals[reason]);
  });
}

test('a financial refusal carries its blockers for support', async () => {
  const blockers = ['pending rakeback payout 44444444-4444-4444-8444-444444444444'];
  const { calls, res } = await invoke({ closed: { ok: false, reason: 'financial', blockers } });
  assertNothingClosed(calls);
  assert.deepEqual(res.body.blockers, blockers);
});

for (const reason of ['something_new', 'constructor', undefined]) {
  test(`an unknown refusal (${String(reason)}) answers 500 and closes nothing`, async () => {
    const { calls, res } = await invoke({ closed: { ok: false, reason } });
    assertNothingClosed(calls);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
  });
}

test('an RPC failure answers 500, says nothing changed, and touches no login', async () => {
  const { calls, res } = await invoke({ rpcError: true });
  assertNothingClosed(calls);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /Nothing was changed/);
});

test('an Auth failure after the scrub says so and leaves the request open', async () => {
  const { calls, res } = await invoke({ providerError: true });
  assert.deepEqual(calls.provider, [[ACTOR, true]]);
  assert.equal(calls.rpc.filter((c) => c.name === 'fn_mark_gdpr_completed').length, 0);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.dataRemoved, true);
  assert.equal(res.body.loginRemoved, false);
});

for (const [name, options] of [['refuses', { markerError: true }], ['throws', { markerThrows: true }]]) {
  test(`the account is closed even when marking the request ${name}`, async () => {
    const { res, calls } = await invoke(options);
    assert.equal(res.statusCode, 200);
    assert.ok(calls.logs.some(([level]) => level === 'warn'));
  });
}

for (const [name, options, statusCode] of [
  ['method', { method: 'POST' }, 405],
  ['missing bearer', { noAuthorization: true }, 401],
  ['invalid session', { authError: true }, 401],
  ['missing user', { noUser: true }, 401],
  ['rate limit', { rateDenied: true }, 429],
  ['stale second factor', { mfaEnabled: true, mfaDenied: true }, 403],
]) {
  test(`${name} gate stops before anything is closed`, async () => {
    const { calls, res } = await invoke(options);
    assert.equal(calls.rpc.length, 0);
    assert.equal(calls.provider.length, 0);
    assert.equal(res.statusCode, statusCode);
  });
}

test('a fresh second factor lets the close through', async () => {
  const { calls, res } = await invoke({ mfaEnabled: true });
  assert.deepEqual(calls.provider, [[ACTOR, true]]);
  assert.equal(res.statusCode, 200);
});

const sorted = (set) => Object.fromEntries(Object.entries(set).map(([bucket, names]) => [bucket, [...names].sort()]));

test("the person's pictures are removed, and nothing else", async () => {
  const { store, res } = await invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.picturesRemoved, true);
  assert.deepEqual(sorted(store), sorted(MUST_STAY), 'every picture of theirs is gone; every other file is where it was');
});

test('pictures go after the database says ok and before the login goes', async () => {
  const { calls } = await invoke();
  const first = (step) => calls.sequence.indexOf(step);
  const last = (step) => calls.sequence.lastIndexOf(step);
  assert.ok(first('rpc.fn_close_account') < first('storage'), 'nothing is removed before the database has closed the account');
  assert.ok(last('storage') < first('auth.deleteUser'), 'the pictures are gone before the login is');
  assert.ok(first('auth.deleteUser') < first('rpc.fn_mark_gdpr_completed'));
});

test('theirPictures names only places keyed by the person', async () => {
  const { theirPictures } = await invoke();
  const places = theirPictures(ACTOR);
  assert.ok(places.length >= 8);
  for (const place of places) {
    assert.ok(`${place.folder}/${place.prefix ?? ''}`.includes(ACTOR), `${place.bucket}:${place.folder} is not keyed by the person`);
  }
});

test('a retry after the database already closed it removes the pictures too', async () => {
  const { store, calls } = await invoke({ closed: { ok: true, already_closed: true, request_id: REQUEST } });
  assert.deepEqual(sorted(store), sorted(MUST_STAY));
  assert.deepEqual(calls.provider, [[ACTOR, true]]);
});

test('more than a page of pictures in one place: all of them go', async () => {
  const covers = Array.from({ length: 237 }, (_, i) => `covers/${ACTOR}/${String(i).padStart(4, '0')}_cover.jpg`);
  const { store, res } = await invoke({ store: storageOf(MUST_STAY, { 'social-media': covers }) });
  assert.equal(res.body.picturesRemoved, true);
  assert.deepEqual(sorted(store), sorted(MUST_STAY));
});

test('a page of files that must stay does not hide the pictures after it', async () => {
  // 150 of someone else's likenesses answer the loose search first (a wildcard
  // match sorts before them), then the person's own: the kept ones move the
  // page on instead of ending the search.
  const decoys = Array.from({ length: 150 }, (_, i) => `generated/${ACTOR}-${String(i).padStart(4, '0')}.png`);
  const own = Array.from({ length: 3 }, (_, i) => `generated/${ACTOR}_${i}.png`);
  const { store } = await invoke({ store: { 'custom-avatars': [...decoys, ...own] } });
  assert.deepEqual([...store['custom-avatars']].sort(), [...decoys].sort());
});

for (const [name, option] of [['listed', 'storageListError'], ['removed', 'storageRemoveError']]) {
  test(`a picture that cannot be ${name} is reported and keeps the request open, not the account`, async () => {
    const { calls, res } = await invoke({ [option]: 'social-media', expectReport: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.picturesRemoved, false);
    assert.deepEqual(calls.provider, [[ACTOR, true]], 'the login still goes');
    assert.equal(calls.rpc.filter((c) => c.name === 'fn_mark_gdpr_completed').length, 0, 'the request stays anonymized for support');
    assert.equal(calls.reports.length, 1);
    assert.ok(calls.logs.some(([level, message]) => level === 'error' && /pictures not all removed/.test(message)));
  });
}

