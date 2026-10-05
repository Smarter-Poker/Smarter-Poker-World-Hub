/**
 * PAGE PREFERENCES MERGE BEFORE THEY SAVE, AND A FAILED SAVE IS NOT A SAVE
 *
 * The update_page_preferences RPC REPLACES the whole jsonb column on profiles.
 * Every page calls its service with a one-key patch ({ autoSave: false }), so a
 * service that forwards the patch as-is stores ONLY that key and erases every
 * sibling preference. For as long as the RPC raised "Profile not found" on
 * every call nothing was stored and nobody could see it; the moment the RPC
 * works, a pass-through service becomes a wipe.
 *
 * Two rules, pinned by running each service against a fake client:
 *   1. read the stored value, merge the patch over it, send the full object;
 *      never send a partial object when the stored value could not be read;
 *   2. a failed save rejects. Poker Near Me used to catch the error and return
 *      the optimistic value, so the page looked saved when nothing was stored.
 *
 * Also pinned: no service sends a column the RPC does not accept.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const TMP = mkdtempSync(join(tmpdir(), 'page-prefs-'));

const ACCEPTED_COLUMNS = [
  'bankroll_preferences',
  'news_preferences',
  'memory_games_preferences',
  'video_library_preferences',
  'poker_near_me_preferences',
];

const USER = '00000000-0000-4000-8000-000000000001';

/**
 * Load a service with its two imports swapped for a fake client. The service
 * source itself runs unmodified below the import lines.
 */
async function loadService(file, fake) {
  let src = read(file);
  const key = `__fake_${Math.random().toString(36).slice(2)}`;
  globalThis[key] = fake;
  src = src.replace(
    /import \{ supabase \} from '\.\.\/lib\/supabase';/,
    `const supabase = globalThis['${key}'].supabase;`
  );
  src = src.replace(
    /import \{ readOwnProfile \} from '\.\.\/lib\/ownProfile';/,
    `const readOwnProfile = (...a) => globalThis['${key}'].readOwnProfile(...a);`
  );
  assert.doesNotMatch(src, /^import /m, `${file} gained an import this harness does not stub`);
  const out = join(TMP, `${key}.mjs`);
  writeFileSync(out, src);
  return import(pathToFileURL(out).href);
}

/** A fake client holding one stored column value. */
function fakeClient({ column, stored, readError = null, rpcError = null }) {
  const calls = { rpc: [], reads: 0 };
  const row = stored === undefined ? null : { id: USER, [column]: stored };
  const supabase = {
    from(table) {
      assert.equal(table, 'profiles');
      const q = {
        select() { return q; },
        eq() { return q; },
        async maybeSingle() {
          calls.reads += 1;
          return readError ? { data: null, error: readError } : { data: row, error: null };
        },
      };
      return q;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return rpcError ? { data: null, error: rpcError } : { data: args.p_preferences, error: null };
    },
  };
  const readOwnProfile = async () => {
    calls.reads += 1;
    return readError ? { data: null, error: readError } : { data: row, error: null };
  };
  return { supabase, readOwnProfile, calls };
}

const SERVICES = [
  {
    file: 'src/services/bankrollPreferences.js',
    fn: 'updateBankrollPreferences',
    column: 'bankroll_preferences',
    stored: { autoSave: true, notifications: false, currency: 'USD' },
    patch: { autoSave: false },
  },
  {
    file: 'src/services/memoryGamesPreferences.js',
    fn: 'updateMemoryGamesPreferences',
    column: 'memory_games_preferences',
    stored: { soundEffects: false, showTimer: false, visualHints: true },
    patch: { soundEffects: true },
  },
  {
    file: 'src/services/newsPreferences.js',
    fn: 'updateNewsPreferences',
    column: 'news_preferences',
    stored: { pushNotifications: true, mutedSources: ['a', 'b'] },
    patch: { emailDigest: true },
  },
  {
    file: 'src/services/pokerNearMePreferences.js',
    fn: 'updatePokerNearMePreferences',
    column: 'poker_near_me_preferences',
    stored: { geofenceAlerts: false, lastLocationCity: 'Austin' },
    patch: { showNewcomerFriendly: false },
  },
];

for (const svc of SERVICES) {
  test(`${svc.fn} merges the patch over the stored value before saving`, async () => {
    const fake = fakeClient({ column: svc.column, stored: svc.stored });
    const mod = await loadService(svc.file, fake);
    const result = await mod[svc.fn](USER, svc.patch);

    assert.equal(fake.calls.rpc.length, 1, 'exactly one save');
    const { name, args } = fake.calls.rpc[0];
    assert.equal(name, 'update_page_preferences');
    assert.equal(args.p_user_id, USER);
    assert.equal(args.p_column_name, svc.column);
    for (const [k, v] of Object.entries(svc.stored)) {
      if (k in svc.patch) continue;
      assert.deepEqual(args.p_preferences[k], v,
        `${svc.fn} dropped stored key "${k}" - the RPC replaces the column, so the patch must be merged over what is stored`);
    }
    for (const [k, v] of Object.entries(svc.patch)) {
      assert.deepEqual(args.p_preferences[k], v, `patch key "${k}" must win`);
    }
    assert.deepEqual(result, args.p_preferences, 'resolves with the object that was written');
  });

  test(`${svc.fn} refuses to save when the stored value cannot be read`, async () => {
    const fake = fakeClient({ column: svc.column, stored: svc.stored, readError: { code: '57014', message: 'timeout' } });
    const mod = await loadService(svc.file, fake);
    await assert.rejects(() => mod[svc.fn](USER, svc.patch),
      `${svc.fn} must reject: a partial object written over an unknown value wipes it`);
    assert.equal(fake.calls.rpc.length, 0, 'no partial object may be sent');
  });

  test(`${svc.fn} surfaces a failed save to its caller`, async () => {
    const rpcError = { code: 'P0001', message: 'Profile not found' };
    const fake = fakeClient({ column: svc.column, stored: svc.stored, rpcError });
    const mod = await loadService(svc.file, fake);
    await assert.rejects(() => mod[svc.fn](USER, svc.patch), (err) => {
      assert.equal(err, rpcError);
      return true;
    }, `${svc.fn} must reject on a failed save, never return the optimistic value`);
  });
}

test('Poker Near Me does not disguise any save error as a pending migration', async () => {
  // The old code returned the optimistic value for any error whose message
  // contained the word "column"; that is a failed save reported as a success.
  const rpcError = { code: '42703', message: 'column "x" does not exist' };
  const fake = fakeClient({ column: 'poker_near_me_preferences', stored: {}, rpcError });
  const mod = await loadService('src/services/pokerNearMePreferences.js', fake);
  await assert.rejects(() => mod.updatePokerNearMePreferences(USER, { geofenceAlerts: false }));
});

test('every Poker Near Me call site handles a rejected save', () => {
  for (const file of ['pages/hub/poker-near-me/lobby.js', 'pages/hub/poker-near-me/[pnmTab].js']) {
    const src = read(file);
    const re = /updatePokerNearMePreferences\(userId/g;
    let m;
    let seen = 0;
    while ((m = re.exec(src)) !== null) {
      seen += 1;
      // Walk to the end of this call expression.
      let i = src.indexOf('(', m.index);
      let depth = 0;
      for (; i < src.length; i += 1) {
        if (src[i] === '(') depth += 1;
        else if (src[i] === ')') { depth -= 1; if (depth === 0) break; }
      }
      const after = src.slice(i + 1, i + 40);
      const before = src.slice(Math.max(0, m.index - 80), m.index);
      const chained = /^\s*\.catch\(/.test(after);
      const awaitedInTry = /try \{\s*await $/.test(before);
      assert.ok(chained || awaitedInTry,
        `${file}: a call at offset ${m.index} neither chains .catch nor awaits inside try - ` +
          'the service now rejects on a failed save and this would be an unhandled rejection');
    }
    assert.ok(seen > 0, `${file} should still call updatePokerNearMePreferences`);
  }
});

test('no caller sends update_page_preferences a column it does not accept', () => {
  const offenders = [];
  let callers = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        walk(rel);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) continue;
      const src = read(rel);
      const re = /rpc\(\s*'update_page_preferences'\s*,\s*\{([\s\S]*?)\}\s*\)/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        callers += 1;
        const col = /p_column_name:\s*'([^']+)'/.exec(m[1]);
        if (!col) offenders.push(`${rel}: p_column_name is not a literal`);
        else if (!ACCEPTED_COLUMNS.includes(col[1])) offenders.push(`${rel}: ${col[1]}`);
      }
    }
  };
  walk('src');
  walk('pages');
  assert.ok(callers >= 4, 'sanity: the four page-preference services call the RPC');
  assert.deepEqual(offenders, [],
    `update_page_preferences accepts only ${ACCEPTED_COLUMNS.join(', ')} (diamond_arena_preferences is removed)`);
});

// 2026-10-05 audit: three profiles store bankroll_preferences = {} and three
// store poker_near_me_preferences = {}. The getters returned that {} as-is, so
// every default read as undefined: Bankroll Settings showed Auto-Save and
// Notifications unchecked (and flipped the inputs to uncontrolled), and the
// Poker Near Me lobby read geofence alerts as off while the menu showed on.
// A first save of one key stores only that key, so the same happens after any
// first toggle. Reads must merge the stored value OVER the defaults.
const READ_DEFAULTS = [
  {
    file: 'src/services/bankrollPreferences.js',
    fn: 'getBankrollPreferences',
    column: 'bankroll_preferences',
    defaults: { autoSave: true, notifications: true, currencyEUR: false },
  },
  {
    file: 'src/services/pokerNearMePreferences.js',
    fn: 'getPokerNearMePreferences',
    column: 'poker_near_me_preferences',
    defaults: { geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true },
  },
  {
    file: 'src/services/memoryGamesPreferences.js',
    fn: 'getMemoryGamesPreferences',
    column: 'memory_games_preferences',
    defaults: { soundEffects: true, keyboardShortcuts: true, showTimer: true, visualHints: false },
  },
  {
    file: 'src/services/newsPreferences.js',
    fn: 'getNewsPreferences',
    column: 'news_preferences',
    defaults: { pushNotifications: false, emailDigest: false },
  },
];

for (const svc of READ_DEFAULTS) {
  test(`${svc.fn} reads a stored {} as the defaults`, async () => {
    const fake = fakeClient({ column: svc.column, stored: {} });
    const mod = await loadService(svc.file, fake);
    assert.deepEqual(await mod[svc.fn](USER), svc.defaults);
  });

  test(`${svc.fn} keeps stored keys and fills only the missing ones`, async () => {
    const [firstKey, firstValue] = Object.entries(svc.defaults)[0];
    const fake = fakeClient({ column: svc.column, stored: { [firstKey]: !firstValue, extra: 'kept' } });
    const mod = await loadService(svc.file, fake);
    const got = await mod[svc.fn](USER);
    assert.equal(got[firstKey], !firstValue, 'a stored key wins over its default');
    assert.equal(got.extra, 'kept');
    for (const [k, v] of Object.entries(svc.defaults)) {
      if (k === firstKey) continue;
      assert.equal(got[k], v, `missing key "${k}" must read as its default`);
    }
  });
}
