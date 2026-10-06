import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { derivePreferenceSyncState } from '../src/lib/trivia/progressAccount.mjs';

const ROOT = process.cwd();
const USER = '00000000-0000-4000-8000-000000000001';
const MIGRATION = readFileSync(join(
  ROOT,
  'supabase/migrations/20261005233500_trivia_preferences_atomic_cas.sql',
), 'utf8');

const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const SETTINGS_PAGE = read('pages/hub/trivia/settings.js');

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

async function loadService(fake) {
  let source = read('src/services/triviaPreferences.js');
  const key = `__trivia_cas_${Math.random().toString(36).slice(2)}`;
  globalThis[key] = fake;
  source = source.replace(
    /import \{ supabase \} from '\.\.\/lib\/supabase';/,
    `const supabase = globalThis['${key}'].supabase;`,
  );
  source = source.replace(
    /import \{ derivePreferenceSyncState \} from '\.\.\/lib\/trivia\/progressAccount\.mjs';/,
    `const derivePreferenceSyncState = (...args) => globalThis['${key}'].derivePreferenceSyncState(...args);`,
  );
  assert.doesNotMatch(source, /^import /m, 'service harness must stub every import');
  const encoded = Buffer.from(source).toString('base64');
  return import(`data:text/javascript;base64,${encoded}#${key}`);
}

function createCasAuthority({ preferences, revision, beforeFirstCas = null, responseOverride = null }) {
  const state = {
    preferences: structuredClone(preferences),
    revision,
    updatedAt: '2026-10-05T23:34:00.000Z',
  };
  const calls = { reads: 0, rpc: [] };
  let beforeCas = beforeFirstCas;

  const response = ({ success, conflict, changed }) => ({
    contract: 'trivia-preferences-cas/1',
    version: 1,
    success,
    conflict,
    changed,
    revision: state.revision,
    preferences: structuredClone(state.preferences),
    updatedAt: state.updatedAt,
  });

  return {
    state,
    calls,
    derivePreferenceSyncState,
    supabase: {
      from(table) {
        assert.equal(table, 'profiles');
        const query = {
          select(columns) {
            assert.equal(columns, 'trivia_preferences, trivia_preferences_revision');
            return query;
          },
          eq(column, value) {
            assert.equal(column, 'id');
            assert.equal(value, USER);
            return query;
          },
          async maybeSingle() {
            calls.reads += 1;
            return {
              data: {
                trivia_preferences: structuredClone(state.preferences),
                trivia_preferences_revision: state.revision,
              },
              error: null,
            };
          },
        };
        return query;
      },
      async rpc(name, args) {
        assert.equal(name, 'update_trivia_preferences_cas');
        assert.deepEqual(Object.keys(args).sort(), ['p_expected_revision', 'p_preferences']);
        calls.rpc.push({ name, args: structuredClone(args) });
        if (beforeCas) {
          const mutate = beforeCas;
          beforeCas = null;
          mutate(state);
        }
        if (responseOverride) return { data: responseOverride, error: null };
        if (JSON.stringify(args.p_preferences) === JSON.stringify(state.preferences)) {
          return { data: response({ success: true, conflict: false, changed: false }), error: null };
        }
        if (args.p_expected_revision !== state.revision) {
          return { data: response({ success: false, conflict: true, changed: false }), error: null };
        }
        state.preferences = structuredClone(args.p_preferences);
        state.revision += 1;
        state.updatedAt = '2026-10-05T23:35:00.000Z';
        return { data: response({ success: true, conflict: false, changed: true }), error: null };
      },
    },
  };
}

async function withBrowserService(authority, run) {
  const priorWindow = globalThis.window;
  const priorStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.window = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
  try {
    const service = await loadService(authority);
    return await run(service);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorStorageDescriptor === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', priorStorageDescriptor);
  }
}

test('migration owns revision, locks the row, fences browser writes, and returns cloud conflict state', () => {
  assert.match(MIGRATION, /ADD COLUMN trivia_preferences_revision bigint NOT NULL DEFAULT 0/);
  assert.match(MIGRATION, /CHECK \(trivia_preferences_revision >= 0\) NOT VALID/);
  assert.match(MIGRATION, /VALIDATE CONSTRAINT profiles_trivia_preferences_revision_nonnegative/);
  assert.match(MIGRATION, /BEFORE UPDATE OF trivia_preferences, trivia_preferences_revision/);
  assert.match(MIGRATION, /OLD\.trivia_preferences_revision \+ 1/);
  assert.match(MIGRATION, /REVOKE UPDATE \(trivia_preferences, trivia_preferences_revision\)[\s\S]*FROM authenticated, anon/);
  assert.match(MIGRATION, /CREATE FUNCTION public\.update_trivia_preferences_cas\([\s\S]*p_expected_revision bigint[\s\S]*p_preferences jsonb/);
  assert.match(MIGRATION, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(MIGRATION, /WHERE p\.id = v_user_id\s+FOR UPDATE/);
  assert.match(MIGRATION, /v_revision <> p_expected_revision/);
  assert.match(MIGRATION, /'success', false,[\s\S]*'conflict', true,[\s\S]*'preferences', v_current - '_sync'/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.update_trivia_preferences_cas\(bigint, jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.update_trivia_preferences_cas\(bigint, jsonb\)\s+TO authenticated/);

  const generic = /CREATE OR REPLACE FUNCTION public\.update_page_preferences\([\s\S]*?REVOKE ALL ON FUNCTION public\.update_page_preferences/.exec(MIGRATION)?.[0] || '';
  assert.ok(generic, 'migration must preserve the general preference writer');
  assert.doesNotMatch(generic, /'trivia_preferences'/, 'generic writer cannot bypass Trivia CAS');
  assert.match(MIGRATION, /ROLLBACK \(Tier 3; apply only as a NEW forward migration\)/);
});

test('a failed later cloud save rolls back only that edit and retains an earlier device copy', () => {
  assert.match(SETTINGS_PAGE, /const previousSyncStatus = syncStatus/);
  assert.match(SETTINGS_PAGE, /\['pending', 'stale'\]\.includes\(previousSyncStatus\)/);
  assert.match(SETTINGS_PAGE, /pending: preservePendingDeviceCopy/);
  assert.match(SETTINGS_PAGE, /setSyncStatus\(preservePendingDeviceCopy \? 'pending' : 'error'\)/);
  assert.match(SETTINGS_PAGE, /Earlier Device Copy Still Awaits Sync/);
});

test('service merges unknown cloud keys and submits only expected revision plus the full document', async () => {
  const authority = createCasAuthority({
    preferences: {
      soundEffects: false,
      timerEnabled: true,
      customFutureKey: 'kept',
    },
    revision: 4,
  });

  await withBrowserService(authority, async (service) => {
    service.saveTriviaPreferencesLocally(USER, authority.state.preferences, {
      pending: false,
      baseRevision: 4,
    });
    const saved = await service.updateTriviaPreferences(USER, { soundEffects: true });
    assert.equal(authority.calls.rpc.length, 1);
    assert.equal(authority.calls.rpc[0].args.p_expected_revision, 4);
    assert.equal(authority.calls.rpc[0].args.p_preferences.customFutureKey, 'kept');
    assert.equal(authority.calls.rpc[0].args.p_preferences.soundEffects, true);
    assert.equal('_sync' in authority.calls.rpc[0].args.p_preferences, false);
    assert.equal(authority.state.revision, 5);
    assert.equal(saved._sync.revision, 5);
  });
});

test('an unchanged cloud read keeps one stable sync record across storage-driven reloads', async () => {
  const authority = createCasAuthority({
    preferences: { soundEffects: true, timerEnabled: false },
    revision: 6,
  });

  await withBrowserService(authority, async (service) => {
    const first = await service.getTriviaPreferencesState(USER);
    assert.equal(first.status, 'cloud');
    const key = `sp-trivia-prefs-${USER}:sync`;
    const firstRecord = localStorage.getItem(key);
    assert.ok(JSON.parse(firstRecord).updatedAt, 'the initial synchronized record has a timestamp');

    const second = await service.getTriviaPreferencesState(USER);
    assert.equal(second.status, 'cloud');
    assert.equal(localStorage.getItem(key), firstRecord,
      'a storage-driven reload writes identical bytes and cannot trigger a second tab');
    assert.equal(authority.calls.reads, 2, 'the regression exercises two real cloud reads');
  });
});

test('an update committed after the read but before the write returns an authoritative conflict', async () => {
  const authority = createCasAuthority({
    preferences: { soundEffects: true, timerEnabled: true },
    revision: 7,
    beforeFirstCas(state) {
      state.preferences = { ...state.preferences, timerEnabled: false, remoteOnly: 'preserved' };
      state.revision = 8;
      state.updatedAt = '2026-10-05T23:35:30.000Z';
    },
  });

  await withBrowserService(authority, async (service) => {
    service.saveTriviaPreferencesLocally(USER, authority.state.preferences, {
      pending: false,
      baseRevision: 7,
    });
    await assert.rejects(
      () => service.updateTriviaPreferences(USER, { soundEffects: false }),
      (error) => {
        assert.equal(error.code, 'trivia_preferences_conflict');
        assert.equal(error.revision, 8);
        assert.equal(error.cloudPreferences.timerEnabled, false);
        assert.equal(error.cloudPreferences.remoteOnly, 'preserved');
        return true;
      },
    );
    assert.equal(authority.state.preferences.soundEffects, true, 'losing CAS never overwrites cloud');
  });
});

test('offline pending edits remain pending on drift and explicit device resolution uses a fresh CAS', async () => {
  const authority = createCasAuthority({
    preferences: { soundEffects: true, timerEnabled: false, customFutureKey: 'cloud' },
    revision: 3,
  });

  await withBrowserService(authority, async (service) => {
    service.saveTriviaPreferencesLocally(USER, { soundEffects: false, timerEnabled: true }, {
      pending: true,
      baseRevision: 2,
    });
    const conflict = await service.getTriviaPreferencesState(USER);
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.revision, 3);
    assert.equal(authority.calls.rpc.length, 0, 'reading a conflict cannot write');

    const resolved = await service.resolveTriviaPreferencesConflict(USER, 'device');
    assert.equal(authority.calls.rpc.length, 1);
    assert.equal(authority.calls.rpc[0].args.p_expected_revision, 3);
    assert.equal(authority.state.revision, 4);
    assert.equal(authority.state.preferences.soundEffects, false);
    assert.equal(authority.state.preferences.customFutureKey, 'cloud');
    assert.equal(resolved.status, 'cloud');
    assert.equal(resolved.revision, 4);
  });
});

test('malformed authority success is rejected and cannot clear pending local state', async () => {
  const authority = createCasAuthority({
    preferences: { soundEffects: true },
    revision: 2,
    responseOverride: { success: true, revision: 3, preferences: { soundEffects: false } },
  });

  await withBrowserService(authority, async (service) => {
    service.saveTriviaPreferencesLocally(USER, { soundEffects: false }, {
      pending: true,
      baseRevision: 2,
    });
    await assert.rejects(
      () => service.syncPendingTriviaPreferences(USER),
      (error) => error.code === 'trivia_preferences_contract_invalid',
    );
    const cached = JSON.parse(localStorage.getItem(`sp-trivia-prefs-${USER}:sync`));
    assert.equal(cached.pending, true);
    assert.equal(cached.baseRevision, 2);
  });
});
