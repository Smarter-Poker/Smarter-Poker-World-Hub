import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AUDIT_SESSION_ENV_KEYS,
  AUDIT_SESSION_ERROR_CODES,
  AUDIT_SESSION_MODE,
  AUDIT_SESSION_OUTCOMES,
  auditSessionMaterialLeaks,
  ensureFreshAuditSession,
  parseAuditCredentialEnv,
  readAuditSessionAuthStatePath,
  redactAuditSessionMaterial,
  renderAuditCredentialEnv,
} from '../src/lib/training/trainingAuditSessionRefresh.mjs';
import {
  readAttestationConfig,
  runProductionDeliveryAttestation,
} from '../scripts/training-phase6-production-delivery-attestation.mjs';

const AUDIT_USER = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
const OTHER_USER = '7f3a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b';
const SUPABASE_URL = 'https://phase6-test-project.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_FAKEPHASE6KEY0000000000000000';
const OLD_REFRESH = 'FAKE-REFRESH-TOKEN-OLD-0123456789abcdef';
const NEW_REFRESH = 'FAKE-REFRESH-TOKEN-NEW-fedcba9876543210';
const DEPLOYMENT_URL = 'https://hub-vanguard-abc123-smarter-poker.vercel.app';
const DEPLOYMENT_ID = 'dpl_phase6auditsession';
const BUILD = 'b'.repeat(40);
const WRITE_ACK = 'I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS';
const NOW_MS = Date.UTC(2026, 8, 22, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const nowMs = () => NOW_MS;

function fakeJwt(payload, signature = 'FAKESIGNATURE0123456789') {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    signature,
  ].join('.');
}

function oldAccessToken(exp, sub = AUDIT_USER) {
  return fakeJwt({ sub, iat: NOW_S - HOUR, exp, role: 'authenticated' }, 'FAKEOLDSIGNATURE00000001');
}

function newAccessToken(exp = NOW_S + 7 * DAY, sub = AUDIT_USER) {
  return fakeJwt({ sub, iat: NOW_S, exp, role: 'authenticated' }, 'FAKENEWSIGNATURE00000002');
}

function storageState(session) {
  return {
    cookies: [],
    origins: [
      {
        origin: 'https://smarter.poker',
        localStorage: [{ name: 'smarter-poker-auth', value: JSON.stringify(session) }],
      },
    ],
  };
}

async function makePrivateDir(t) {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-audit-session-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function seedStore(t, {
  exp = NOW_S - 60,
  accessToken = null,
  startedAtEpoch = NOW_S - 10 * DAY,
  validUntil = undefined,
  includeSupabase = true,
  envText = null,
  authStateText = null,
  expectedUser = AUDIT_USER,
  directory = null,
} = {}) {
  const dir = directory || (await makePrivateDir(t));
  const envPath = join(dir, '.env');
  const authStatePath = join(dir, 'audit-auth.json');
  const access = accessToken || oldAccessToken(exp);
  const session = {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: OLD_REFRESH,
    user: { id: AUDIT_USER, aud: 'authenticated' },
  };
  const values = new Map([
    [AUDIT_SESSION_ENV_KEYS.accessToken, access],
    [AUDIT_SESSION_ENV_KEYS.refreshToken, OLD_REFRESH],
    [AUDIT_SESSION_ENV_KEYS.expectedAuditUserId, expectedUser],
    [AUDIT_SESSION_ENV_KEYS.authState, authStatePath],
  ]);
  if (startedAtEpoch !== null) {
    values.set(AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch, String(startedAtEpoch));
  }
  if (validUntil !== undefined) values.set(AUDIT_SESSION_ENV_KEYS.sessionValidUntil, validUntil);
  if (includeSupabase) {
    values.set(AUDIT_SESSION_ENV_KEYS.supabaseUrl, SUPABASE_URL);
    values.set(AUDIT_SESSION_ENV_KEYS.supabasePublishableKey, PUBLISHABLE_KEY);
  }
  await writeFile(envPath, envText ?? renderAuditCredentialEnv(values), { mode: 0o600 });
  await writeFile(
    authStatePath,
    authStateText ?? `${JSON.stringify(storageState(session), null, 2)}\n`,
    { mode: 0o600 },
  );
  return { dir, envPath, authStatePath, accessToken: access, secrets: [access, OLD_REFRESH, PUBLISHABLE_KEY] };
}

function tokenResponse({ sub = AUDIT_USER, userId = AUDIT_USER, exp = NOW_S + 7 * DAY } = {}) {
  return {
    access_token: newAccessToken(exp, sub),
    token_type: 'bearer',
    expires_in: exp - NOW_S,
    expires_at: exp,
    refresh_token: NEW_REFRESH,
    user: { id: userId, aud: 'authenticated' },
  };
}

function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, async text() { return text; }, async json() { return JSON.parse(text); } };
}

function fakeFetch(handler) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return { calls, fetchFn };
}

// Mirrors the forbidden-field list in the attestation's evidence scanner
// (assertEvidenceContainsNoSecrets): a custody record with such a key would
// fail the public-evidence closeout even though its value is harmless.
const FORBIDDEN_EVIDENCE_FIELD_WORDS = [
  'accesstoken', 'refreshtoken', 'servicerolekey', 'gradingreceipt', 'authorization', 'cookie',
  'password', 'secret', 'credential', 'privatekey', 'apikey', 'token', 'servicerole', 'bearer', 'jwt',
];

function assertEvidenceSafeFieldNames(value, path = 'auditSession') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertEvidenceSafeFieldNames(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    assert.equal(
      FORBIDDEN_EVIDENCE_FIELD_WORDS.some((word) => normalized.includes(word)),
      false,
      `${path}.${key} would be rejected by the evidence secret scanner`,
    );
    assertEvidenceSafeFieldNames(item, `${path}.${key}`);
  }
}

function tokenCalls(calls) {
  return calls.filter(({ url }) => url.includes('/auth/v1/token'));
}

async function snapshot(paths) {
  return Promise.all(paths.map((path) => readFile(path, 'utf8')));
}

async function noTemporaryFiles(dir) {
  const entries = await readdir(dir);
  assert.deepEqual(entries.filter((name) => name.endsWith('.tmp')), [], 'temporary files were left behind');
  assert.deepEqual(entries.filter((name) => name.endsWith('.refresh.lock')), [], 'the refresh lock was not released');
}

function baseOptions(store, fetchFn, extra = {}) {
  return {
    credentialEnvPath: store.envPath,
    authStatePath: store.authStatePath,
    expectedAuditUserId: AUDIT_USER,
    fetchFn,
    nowMs,
    sleep: async () => undefined,
    repositoryRoot: '/nonexistent/repository/root',
    ...extra,
  };
}

async function expectRefusal(promise, code, secrets) {
  const error = await promise.then(
    () => assert.fail('expected the audit session custody step to fail closed'),
    (thrown) => thrown,
  );
  assert.equal(error.name, 'TrainingAuditSessionError');
  assert.equal(error.code, code, error.message);
  assert.deepEqual(auditSessionMaterialLeaks(error.message, secrets), [], error.message);
  assert.deepEqual(auditSessionMaterialLeaks(error.stack || '', secrets), []);
  if (error.auditSession) {
    assert.deepEqual(auditSessionMaterialLeaks(error.auditSession, secrets), []);
    assertEvidenceSafeFieldNames(error.auditSession);
  }
  return error;
}

// Requirement 1: expired or near-expiry -> exactly one refresh; fresh -> zero.
test('an expired access token triggers exactly one refresh that rotates both credential files in the shared format', async (t) => {
  const store = await seedStore(t, { exp: NOW_S - 60 });
  const { calls, fetchFn } = fakeFetch(() => jsonResponse(200, tokenResponse()));
  const result = await ensureFreshAuditSession(baseOptions(store, fetchFn));
  assert.equal(result.outcome, AUDIT_SESSION_OUTCOMES.refreshed);
  assert.equal(result.refreshCalls, 1);
  assert.equal(result.persisted, true);
  assert.equal(tokenCalls(calls).length, 1);
  const [call] = tokenCalls(calls);
  assert.equal(call.url, `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.apikey, PUBLISHABLE_KEY);
  assert.deepEqual(JSON.parse(call.init.body), { refresh_token: OLD_REFRESH });
  assert.equal(call.init.redirect, 'error');
  assert.ok(call.init.signal instanceof AbortSignal);

  const values = parseAuditCredentialEnv(await readFile(store.envPath, 'utf8'));
  const refreshedAccess = values.get(AUDIT_SESSION_ENV_KEYS.accessToken);
  assert.notEqual(refreshedAccess, store.accessToken);
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.refreshToken), NEW_REFRESH);
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.sessionMode), AUDIT_SESSION_MODE);
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch), String(NOW_S - 10 * DAY));
  assert.equal(
    values.get(AUDIT_SESSION_ENV_KEYS.sessionValidUntil),
    new Date((NOW_S - 10 * DAY) * 1000 + 90 * DAY * 1000).toISOString(),
  );
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.supabaseUrl), SUPABASE_URL);
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.supabasePublishableKey), PUBLISHABLE_KEY);
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.envFile), store.envPath);
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.authState), store.authStatePath);
  assert.match(await readFile(store.envPath, 'utf8'), /^TRAINING_PHASE6_AUDIT_ACCESS_TOKEN='[^'\n]+'\n/);

  const state = JSON.parse(await readFile(store.authStatePath, 'utf8'));
  const stored = JSON.parse(state.origins[0].localStorage[0].value);
  assert.equal(state.origins[0].origin, 'https://smarter.poker');
  assert.equal(state.origins[0].localStorage[0].name, 'smarter-poker-auth');
  assert.equal(stored.access_token, refreshedAccess);
  assert.equal(stored.refresh_token, NEW_REFRESH);
  assert.equal(stored.user.id, AUDIT_USER);
  assert.equal(stored.expires_at, NOW_S + 7 * DAY);
  assert.equal(result.sessionExpiresAt, new Date((NOW_S + 7 * DAY) * 1000).toISOString());
  assert.equal(result.previousSessionExpiresAt, new Date((NOW_S - 60) * 1000).toISOString());
  assertEvidenceSafeFieldNames(result);
  assert.deepEqual(auditSessionMaterialLeaks(result, [...store.secrets, refreshedAccess, NEW_REFRESH]), []);
  await noTemporaryFiles(store.dir);
});

test('a near-expiry access token (inside the 24-hour threshold) triggers exactly one refresh', async (t) => {
  const store = await seedStore(t, { exp: NOW_S + HOUR });
  const { calls, fetchFn } = fakeFetch(() => jsonResponse(200, tokenResponse()));
  const result = await ensureFreshAuditSession(baseOptions(store, fetchFn));
  assert.equal(result.outcome, AUDIT_SESSION_OUTCOMES.refreshed);
  assert.equal(tokenCalls(calls).length, 1);
  assert.equal(result.secondsRemainingAtStart, HOUR);
  assert.equal(result.thresholdSeconds, DAY);
});

test('a fresh access token makes zero refresh calls and leaves both files byte-identical', async (t) => {
  const store = await seedStore(t, { exp: NOW_S + 2 * DAY });
  const before = await snapshot([store.envPath, store.authStatePath]);
  const { calls, fetchFn } = fakeFetch(() => assert.fail('no refresh call expected'));
  const result = await ensureFreshAuditSession(baseOptions(store, fetchFn));
  assert.equal(result.outcome, AUDIT_SESSION_OUTCOMES.fresh);
  assert.equal(result.refreshCalls, 0);
  assert.equal(result.refreshAttempted, false);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  assert.deepEqual(auditSessionMaterialLeaks(result, store.secrets), []);
});

// Requirement 2: identity mismatch after refresh -> fail closed, nothing persisted.
test('a refreshed session for another user fails closed and persists nothing', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  for (const response of [
    tokenResponse({ sub: OTHER_USER }),
    tokenResponse({ userId: OTHER_USER }),
  ]) {
    const { calls, fetchFn } = fakeFetch(() => jsonResponse(200, response));
    const error = await expectRefusal(
      ensureFreshAuditSession(baseOptions(store, fetchFn)),
      AUDIT_SESSION_ERROR_CODES.identityMismatch,
      [...store.secrets, response.access_token, NEW_REFRESH],
    );
    assert.equal(error.outcome, AUDIT_SESSION_OUTCOMES.failed);
    assert.equal(error.auditSession.outcome, AUDIT_SESSION_OUTCOMES.failed);
    assert.equal(error.auditSession.persisted, false);
    assert.equal(tokenCalls(calls).length, 1);
    assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
    await noTemporaryFiles(store.dir);
  }
});

test('a credential env naming another audit account or auth-state path is refused before any refresh', async (t) => {
  const mismatched = await seedStore(t, { expectedUser: OTHER_USER });
  const { calls, fetchFn } = fakeFetch(() => assert.fail('no refresh call expected'));
  await expectRefusal(
    ensureFreshAuditSession(baseOptions(mismatched, fetchFn)),
    AUDIT_SESSION_ERROR_CODES.identityMismatch,
    mismatched.secrets,
  );
  const store = await seedStore(t);
  await expectRefusal(
    ensureFreshAuditSession(baseOptions(store, fetchFn, { authStatePath: join(store.dir, 'other.json') })),
    AUDIT_SESSION_ERROR_CODES.refused,
    store.secrets,
  );
  assert.equal(calls.length, 0);
});

// Requirement 3: malformed state or token response -> fail closed, redacted.
test('a malformed credential env or auth state fails closed without echoing token material', async (t) => {
  const leakedJwt = oldAccessToken(NOW_S - 60);
  const { calls, fetchFn } = fakeFetch(() => assert.fail('no refresh call expected'));
  const badEnv = await seedStore(t, {
    envText: `TRAINING_PHASE6_AUDIT_ACCESS_TOKEN='${leakedJwt}'\nthis line has no separator ${OLD_REFRESH}\n`,
  });
  const envError = await expectRefusal(
    ensureFreshAuditSession(baseOptions(badEnv, fetchFn)),
    AUDIT_SESSION_ERROR_CODES.malformedState,
    [leakedJwt, OLD_REFRESH],
  );
  assert.match(envError.message, /malformed line/);

  const badState = await seedStore(t, {
    authStateText: `{"origins": [{"origin": "https://smarter.poker", "localStorage": [{"name": "smarter-poker-auth", "value": "${leakedJwt}"`,
  });
  const stateError = await expectRefusal(
    ensureFreshAuditSession(baseOptions(badState, fetchFn)),
    AUDIT_SESSION_ERROR_CODES.malformedState,
    [leakedJwt, OLD_REFRESH],
  );
  assert.match(stateError.message, /auth state is not valid JSON/);

  const missingPair = await seedStore(t, {
    authStateText: `${JSON.stringify(storageState({ access_token: leakedJwt, user: { id: AUDIT_USER } }))}\n`,
  });
  await expectRefusal(
    ensureFreshAuditSession(baseOptions(missingPair, fetchFn)),
    AUDIT_SESSION_ERROR_CODES.malformedState,
    [leakedJwt],
  );

  const disagreeing = await seedStore(t, {
    authStateText: `${JSON.stringify(storageState({
      access_token: leakedJwt,
      refresh_token: 'FAKE-REFRESH-TOKEN-STALE-0000000000',
      user: { id: AUDIT_USER },
    }))}\n`,
  });
  const disagreeError = await expectRefusal(
    ensureFreshAuditSession(baseOptions(disagreeing, fetchFn)),
    AUDIT_SESSION_ERROR_CODES.refused,
    [leakedJwt, OLD_REFRESH, 'FAKE-REFRESH-TOKEN-STALE-0000000000'],
  );
  assert.match(disagreeError.message, /credential env and auth state disagree/);
  assert.equal(calls.length, 0);
});

test('a malformed or rejected token response fails closed with a redacted error and persists nothing', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const leakedJwt = newAccessToken();
  const cases = [
    {
      response: jsonResponse(200, `<html>${leakedJwt} ${NEW_REFRESH}</html>`),
      code: AUDIT_SESSION_ERROR_CODES.malformedResponse,
    },
    {
      response: jsonResponse(200, { access_token: leakedJwt, user: { id: AUDIT_USER } }),
      code: AUDIT_SESSION_ERROR_CODES.malformedResponse,
    },
    {
      response: jsonResponse(200, { ...tokenResponse(), access_token: 'not-a-jwt' }),
      code: AUDIT_SESSION_ERROR_CODES.malformedResponse,
    },
    {
      response: jsonResponse(200, tokenResponse({ exp: NOW_S - 1 })),
      code: AUDIT_SESSION_ERROR_CODES.malformedResponse,
    },
    {
      response: jsonResponse(400, {
        code: 400,
        error_code: 'refresh_token_not_found',
        msg: `Invalid Refresh Token ${OLD_REFRESH} ${leakedJwt}`,
      }),
      code: AUDIT_SESSION_ERROR_CODES.refreshRejected,
      messagePattern: /HTTP 400 \(refresh_token_not_found\)/,
    },
  ];
  for (const { response, code, messagePattern } of cases) {
    const { calls, fetchFn } = fakeFetch(() => response);
    const error = await expectRefusal(
      ensureFreshAuditSession(baseOptions(store, fetchFn)),
      code,
      [...store.secrets, leakedJwt, NEW_REFRESH],
    );
    if (messagePattern) assert.match(error.message, messagePattern);
    assert.equal(error.outcome, AUDIT_SESSION_OUTCOMES.failed);
    assert.equal(error.auditSession.refreshCalls, 1);
    assert.equal(error.auditSession.persisted, false);
    assert.equal(tokenCalls(calls).length, 1);
    assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
    await noTemporaryFiles(store.dir);
  }
});

// Requirement 4: atomic persistence, mode 0600, private directory.
test('persistence is temp + fsync + rename in the same directory with mode 0600 and a private directory', async (t) => {
  const store = await seedStore(t);
  const { fetchFn } = fakeFetch(() => jsonResponse(200, tokenResponse()));
  await ensureFreshAuditSession(baseOptions(store, fetchFn));
  assert.equal((await stat(store.envPath)).mode & 0o777, 0o600);
  assert.equal((await stat(store.authStatePath)).mode & 0o777, 0o600);
  await noTemporaryFiles(store.dir);
  const source = await readFile(
    new URL('../src/lib/training/trainingAuditSessionRefresh.mjs', import.meta.url),
    'utf8',
  );
  const writer = source.slice(
    source.indexOf('export function writePrivateAuditFileAtomic'),
    source.indexOf('function readStoredSession'),
  );
  assert.match(writer, /openSync\(temporary, 'wx', 0o600\)/);
  assert.match(writer, /fsyncSync\(descriptor\)/);
  assert.match(writer, /renameSync\(temporary, path\)/);
  assert.match(writer, /const temporary = `\$\{path\}\./, 'the temp file must be a sibling of its target');

  const worldReadable = await seedStore(t, { directory: await makePrivateDir(t) });
  await chmod(worldReadable.dir, 0o755);
  const { calls, fetchFn: refusedFetch } = fakeFetch(() => assert.fail('no refresh call expected'));
  const error = await expectRefusal(
    ensureFreshAuditSession(baseOptions(worldReadable, refusedFetch)),
    AUDIT_SESSION_ERROR_CODES.refused,
    worldReadable.secrets,
  );
  assert.match(error.message, /directory must not be group\/world accessible/);
  await chmod(worldReadable.dir, 0o700);

  const looseFile = await seedStore(t);
  await chmod(looseFile.envPath, 0o640);
  const fileError = await expectRefusal(
    ensureFreshAuditSession(baseOptions(looseFile, refusedFetch)),
    AUDIT_SESSION_ERROR_CODES.refused,
    looseFile.secrets,
  );
  assert.match(fileError.message, /must not be group\/world accessible/);

  const inRepository = await seedStore(t);
  const repoError = await expectRefusal(
    ensureFreshAuditSession(baseOptions(inRepository, refusedFetch, { repositoryRoot: inRepository.dir })),
    AUDIT_SESSION_ERROR_CODES.refused,
    inRepository.secrets,
  );
  assert.match(repoError.message, /must live outside the repository/);
  assert.equal(calls.length, 0);
});

// Requirement 5: exclusive lock, bounded retry, no double rotation.
test('a live lock holder makes the second caller wait a bounded number of times and then fail closed without rotating', async (t) => {
  const store = await seedStore(t);
  const lockPath = `${store.envPath}.refresh.lock`;
  await writeFile(lockPath, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date(NOW_MS).toISOString() })}\n`, { mode: 0o600 });
  const before = await snapshot([store.envPath, store.authStatePath]);
  const sleeps = [];
  const { calls, fetchFn } = fakeFetch(() => assert.fail('no refresh call expected'));
  const error = await expectRefusal(
    ensureFreshAuditSession(baseOptions(store, fetchFn, {
      sleep: async (delayMs) => { sleeps.push(delayMs); },
      lockAttempts: 3,
      lockRetryDelayMs: 2_000,
    })),
    AUDIT_SESSION_ERROR_CODES.lockHeld,
    store.secrets,
  );
  assert.deepEqual(sleeps, [2_000, 2_000], 'retry is bounded to the configured attempts');
  assert.equal(error.auditSession.lock.attempts, 3);
  assert.equal(error.auditSession.refreshCalls, 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  assert.equal((await stat(lockPath)).isFile(), true, 'a live lock is never deleted');
  await rm(lockPath);
});

test('a second caller reuses the session the lock holder persisted instead of rotating again', async (t) => {
  const store = await seedStore(t);
  const lockPath = `${store.envPath}.refresh.lock`;
  await writeFile(lockPath, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date(NOW_MS).toISOString() })}\n`, { mode: 0o600 });
  const { calls, fetchFn } = fakeFetch(() => assert.fail('no refresh call expected'));
  const refreshed = tokenResponse();
  let waits = 0;
  const result = await ensureFreshAuditSession(baseOptions(store, fetchFn, {
    sleep: async () => {
      waits += 1;
      if (waits === 1) {
        // The holder is between its two atomic writes: env rotated, auth
        // state not yet. The waiter must keep waiting, not fail closed.
        const values = parseAuditCredentialEnv(await readFile(store.envPath, 'utf8'));
        values.set(AUDIT_SESSION_ENV_KEYS.accessToken, refreshed.access_token);
        values.set(AUDIT_SESSION_ENV_KEYS.refreshToken, refreshed.refresh_token);
        await writeFile(store.envPath, renderAuditCredentialEnv(values), { mode: 0o600 });
        return;
      }
      await writeFile(store.authStatePath, `${JSON.stringify(storageState(refreshed))}\n`, { mode: 0o600 });
      await rm(lockPath);
    },
  }));
  assert.equal(waits, 2);
  assert.equal(result.outcome, AUDIT_SESSION_OUTCOMES.reusedPersisted);
  assert.equal(result.lock.attempts, 2);
  assert.equal(result.refreshCalls, 0);
  assert.equal(calls.length, 0);
  assertEvidenceSafeFieldNames(result);
});

test('a lock whose owning process is gone is removed once and the refresh proceeds exactly once', async (t) => {
  const store = await seedStore(t);
  const lockPath = `${store.envPath}.refresh.lock`;
  await writeFile(lockPath, `${JSON.stringify({ pid: 4_000_000, acquiredAt: '2026-09-01T00:00:00.000Z' })}\n`, { mode: 0o600 });
  const { calls, fetchFn } = fakeFetch(() => jsonResponse(200, tokenResponse()));
  const result = await ensureFreshAuditSession(baseOptions(store, fetchFn, {
    isProcessAlive: (pid) => pid !== 4_000_000,
  }));
  assert.equal(result.outcome, AUDIT_SESSION_OUTCOMES.refreshed);
  assert.equal(result.lock.staleLockRemoved, true);
  assert.equal(tokenCalls(calls).length, 1);
  await noTemporaryFiles(store.dir);
});

test('two concurrent invocations rotate exactly once between them', async (t) => {
  const store = await seedStore(t);
  let releaseFirst;
  const firstDone = new Promise((resolveDone) => { releaseFirst = resolveDone; });
  const { calls, fetchFn } = fakeFetch(async () => {
    await new Promise((resolveTick) => setTimeout(resolveTick, 5));
    return jsonResponse(200, tokenResponse());
  });
  const first = ensureFreshAuditSession(baseOptions(store, fetchFn)).finally(() => releaseFirst());
  const second = ensureFreshAuditSession(baseOptions(store, fetchFn, {
    sleep: async () => { await firstDone; },
  }));
  const results = await Promise.all([first, second]);
  assert.deepEqual(
    results.map(({ outcome }) => outcome).sort(),
    [AUDIT_SESSION_OUTCOMES.refreshed, AUDIT_SESSION_OUTCOMES.reusedPersisted],
  );
  assert.equal(tokenCalls(calls).length, 1, 'never double-rotates');
  await noTemporaryFiles(store.dir);
});

// Requirement 6: unknown outcome after timeout -> no retry, authoritative unknown, old state intact.
test('a refresh timeout is reported as an authoritative unknown outcome with no blind retry and the old state intact', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const honoursAbort = fakeFetch((_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  }));
  const ignoresAbort = fakeFetch(() => new Promise(() => undefined));
  for (const transport of [honoursAbort, ignoresAbort]) {
    const error = await expectRefusal(
      ensureFreshAuditSession(baseOptions(store, transport.fetchFn, { timeoutMs: 40 })),
      AUDIT_SESSION_ERROR_CODES.outcomeUnknown,
      store.secrets,
    );
    assert.equal(error.outcome, AUDIT_SESSION_OUTCOMES.unknown);
    assert.equal(error.auditSession.outcome, AUDIT_SESSION_OUTCOMES.unknown);
    assert.equal(error.auditSession.refreshCalls, 1);
    assert.equal(error.auditSession.persisted, false);
    assert.match(error.message, /outcome is unknown/);
    assert.match(error.operatorAction, /Do not retry blindly/);
    assert.equal(transport.calls.length, 1, 'a timed-out refresh is never retried');
    assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
    await noTemporaryFiles(store.dir);
  }
  const transportFailure = fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
  const error = await expectRefusal(
    ensureFreshAuditSession(baseOptions(store, transportFailure.fetchFn)),
    AUDIT_SESSION_ERROR_CODES.outcomeUnknown,
    store.secrets,
  );
  assert.equal(error.auditSession.outcome, AUDIT_SESSION_OUTCOMES.unknown);
  assert.equal(transportFailure.calls.length, 1);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
});

// Requirement 9: 90-day session window passed -> fail closed, no refresh attempt.
test('a session past its 90-day window is refused before any refresh, even when the access token is expired', async (t) => {
  const store = await seedStore(t, { exp: NOW_S - 60, startedAtEpoch: NOW_S - 91 * DAY });
  const before = await snapshot([store.envPath, store.authStatePath]);
  const { calls, fetchFn } = fakeFetch(() => assert.fail('no refresh call expected'));
  const error = await expectRefusal(
    ensureFreshAuditSession(baseOptions(store, fetchFn)),
    AUDIT_SESSION_ERROR_CODES.windowEnded,
    store.secrets,
  );
  assert.equal(error.auditSession.refreshAttempted, false);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);

  const tampered = await seedStore(t, { validUntil: '2099-01-01T00:00:00.000Z' });
  await expectRefusal(
    ensureFreshAuditSession(baseOptions(tampered, fetchFn)),
    AUDIT_SESSION_ERROR_CODES.refused,
    tampered.secrets,
  );
  assert.equal(calls.length, 0);

  const fromIssuedAt = await seedStore(t, { startedAtEpoch: null, exp: NOW_S - 60 });
  const { calls: firstRunCalls, fetchFn: firstRunFetch } = fakeFetch(() => jsonResponse(200, tokenResponse()));
  const result = await ensureFreshAuditSession(baseOptions(fromIssuedAt, firstRunFetch));
  assert.equal(result.outcome, AUDIT_SESSION_OUTCOMES.refreshed);
  assert.equal(result.sessionStartedAt, new Date((NOW_S - HOUR) * 1000).toISOString());
  assert.equal(firstRunCalls.length, 1);
  const values = parseAuditCredentialEnv(await readFile(fromIssuedAt.envPath, 'utf8'));
  assert.equal(values.get(AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch), String(NOW_S - HOUR));
});

// No refresh source configured: preserve the plain auth-state flow, but never start with a dead token.
test('without a credential env the attestation proceeds on a usable token and refuses an expired or nearly expired one', async (t) => {
  const dir = await makePrivateDir(t);
  const usable = join(dir, 'usable.json');
  await writeFile(usable, JSON.stringify(storageState({
    access_token: oldAccessToken(NOW_S + 2 * HOUR),
    refresh_token: OLD_REFRESH,
    user: { id: AUDIT_USER },
  })));
  const { calls, fetchFn } = fakeFetch(() => assert.fail('no refresh call expected'));
  const result = await ensureFreshAuditSession({
    authStatePath: usable,
    expectedAuditUserId: AUDIT_USER,
    fetchFn,
    nowMs,
  });
  assert.equal(result.outcome, AUDIT_SESSION_OUTCOMES.fresh);
  assert.equal(result.refreshConfigured, false);
  assert.equal(result.refreshCalls, 0);
  assertEvidenceSafeFieldNames(result);

  const expired = join(dir, 'expired.json');
  const expiredToken = oldAccessToken(NOW_S - 1);
  await writeFile(expired, JSON.stringify(storageState({
    access_token: expiredToken,
    refresh_token: OLD_REFRESH,
    user: { id: AUDIT_USER },
  })));
  const error = await expectRefusal(
    ensureFreshAuditSession({ authStatePath: expired, expectedAuditUserId: AUDIT_USER, fetchFn, nowMs }),
    AUDIT_SESSION_ERROR_CODES.expiredWithoutRefreshSource,
    [expiredToken, OLD_REFRESH],
  );
  assert.match(error.operatorAction, /TRAINING_PHASE6_AUDIT_ENV_FILE/);

  const nearlyExpired = join(dir, 'nearly.json');
  await writeFile(nearlyExpired, JSON.stringify(storageState({
    access_token: oldAccessToken(NOW_S + 5 * 60),
    refresh_token: OLD_REFRESH,
    user: { id: AUDIT_USER },
  })));
  await expectRefusal(
    ensureFreshAuditSession({ authStatePath: nearlyExpired, expectedAuditUserId: AUDIT_USER, fetchFn, nowMs }),
    AUDIT_SESSION_ERROR_CODES.expiredWithoutRefreshSource,
    [OLD_REFRESH],
  );

  const otherUser = join(dir, 'other.json');
  await writeFile(otherUser, JSON.stringify(storageState({
    access_token: oldAccessToken(NOW_S + 2 * HOUR, OTHER_USER),
    refresh_token: OLD_REFRESH,
    user: { id: OTHER_USER },
  })));
  await expectRefusal(
    ensureFreshAuditSession({ authStatePath: otherUser, expectedAuditUserId: AUDIT_USER, fetchFn, nowMs }),
    AUDIT_SESSION_ERROR_CODES.identityMismatch,
    [OLD_REFRESH],
  );
  assert.equal(calls.length, 0);
});

// Requirement 8: redaction helpers.
test('redaction strips seeded secrets, JWTs and prefixed API keys from any text', () => {
  const jwt = newAccessToken();
  const text = `Authorization: Bearer ${jwt} apikey=${PUBLISHABLE_KEY} refresh=${OLD_REFRESH}`;
  const redacted = redactAuditSessionMaterial(text, [OLD_REFRESH, PUBLISHABLE_KEY, jwt]);
  assert.deepEqual(auditSessionMaterialLeaks(redacted, [OLD_REFRESH, PUBLISHABLE_KEY, jwt]), []);
  assert.match(redacted, /\[REDACTED_AUDIT_SESSION_SECRET\]/);
  const patternOnly = redactAuditSessionMaterial(text);
  assert.equal(patternOnly.includes(jwt), false);
  assert.equal(patternOnly.includes(PUBLISHABLE_KEY), false);
  assert.deepEqual(auditSessionMaterialLeaks(text, [OLD_REFRESH]).sort(), [
    'authorization-header', 'jwt', 'prefixed-api-key', 'seeded-secret',
  ]);
  assert.deepEqual(auditSessionMaterialLeaks({ note: 'clean', auditUserId: AUDIT_USER }, [OLD_REFRESH]), []);
});

test('the credential env format round-trips exactly as the out-of-Git refresher writes it', () => {
  const values = new Map([
    ['TRAINING_PHASE6_AUDIT_ACCESS_TOKEN', 'a.b.c'],
    ['TRAINING_PHASE6_AUDIT_REFRESH_TOKEN', 'r-token'],
    ['TRAINING_PHASE6_AUDIT_SESSION_MODE', AUDIT_SESSION_MODE],
  ]);
  const rendered = renderAuditCredentialEnv(values);
  assert.equal(
    rendered,
    "TRAINING_PHASE6_AUDIT_ACCESS_TOKEN='a.b.c'\nTRAINING_PHASE6_AUDIT_REFRESH_TOKEN='r-token'\nTRAINING_PHASE6_AUDIT_SESSION_MODE='ROTATING_REFRESH_90_DAY'\n",
  );
  assert.deepEqual([...parseAuditCredentialEnv(rendered)], [...values]);
  assert.deepEqual([...parseAuditCredentialEnv("# comment\n\nKEY=unquoted\n")], [['KEY', 'unquoted']]);
  assert.throws(() => parseAuditCredentialEnv("lower=1\n"), /invalid key/);
  assert.throws(() => parseAuditCredentialEnv("KEY='it''s'\n"), /cannot be represented safely/);
});

// Requirement 7 and 10: the attestation's first API request uses the refreshed token; evidence stays 0600 and out of the repo.
function fakeBrowser(recorder, { evaluate } = {}) {
  const page = {
    on() {},
    async goto(url) {
      return { status: () => 200, url: () => url };
    },
    url() {
      return `${DEPLOYMENT_URL}/hub/training?revision=phase6-delivery-attestation`;
    },
    async evaluate(_fn, args) {
      recorder.requests.push(args.requestPath);
      if (evaluate) return evaluate(args);
      if (args.requestPath.startsWith('/api/training/get-sessions')) {
        return { status: 200, payload: { success: true }, responseBytes: 16 };
      }
      return { status: 599, payload: { code: 'TEST_STOP_AFTER_FIRST_REQUEST' }, responseBytes: 0 };
    },
  };
  const context = {
    async newPage() { return page; },
    async unrouteAll() {},
    async close() { recorder.contextClosed = true; },
  };
  return {
    async launch() {
      return {
        async newContext(options) {
          recorder.storageState = options.storageState;
          return context;
        },
        async close() { recorder.browserClosed = true; },
      };
    },
  };
}

function healthResponse() {
  return jsonResponse(200, {
    status: 'ok',
    commitSha: BUILD,
    version: BUILD,
    deploymentUrl: new URL(DEPLOYMENT_URL).hostname,
    deploymentId: DEPLOYMENT_ID,
    checks: { db: { status: 'ok' }, trainingGradingReceipt: { status: 'ok' } },
  });
}

function attestationConfig(store, evidenceDir, extra = {}) {
  return {
    baseUrl: DEPLOYMENT_URL,
    expectedBuild: BUILD,
    expectedAuditUserId: AUDIT_USER,
    authState: store.authStatePath,
    auditCredentialEnv: store.envPath,
    output: join(evidenceDir, 'phase6-public.json'),
    writeAcknowledgement: WRITE_ACK,
    ...extra,
  };
}

test('the attestation refreshes once at startup and its first API request carries the refreshed token', async (t) => {
  const store = await seedStore(t, { exp: NOW_S + HOUR });
  const evidenceDir = await makePrivateDir(t);
  const refreshed = tokenResponse();
  const { calls, fetchFn } = fakeFetch((url) => {
    if (url.includes('/auth/v1/token')) return jsonResponse(200, refreshed);
    if (url.includes('/api/health')) return healthResponse();
    return assert.fail(`unexpected transport call ${url}`);
  });
  const recorder = { requests: [] };
  const config = attestationConfig(store, evidenceDir);
  await assert.rejects(
    runProductionDeliveryAttestation(config, {
      chromium: fakeBrowser(recorder),
      fetchFn,
      nowMs,
      now: () => new Date(NOW_MS),
      sleep: async () => undefined,
    }),
    /fresh full attempt returned HTTP 599/,
  );
  assert.equal(tokenCalls(calls).length, 1, 'exactly one refresh at startup');
  assert.equal(calls[0].url.includes('/auth/v1/token'), true, 'the refresh precedes every other request');
  assert.equal(recorder.requests[0].startsWith('/api/training/get-sessions'), true);
  const browserSession = JSON.parse(recorder.storageState.origins[0].localStorage[0].value);
  assert.equal(recorder.storageState.origins[0].origin, DEPLOYMENT_URL);
  assert.equal(browserSession.access_token, refreshed.access_token, 'the browser context carries the refreshed token');
  assert.equal(browserSession.refresh_token, NEW_REFRESH);
  assert.equal(recorder.contextClosed, true);
  assert.equal(recorder.browserClosed, true);

  const evidence = JSON.parse(await readFile(config.output, 'utf8'));
  assert.equal(evidence.status, 'failed_closed');
  assert.equal(evidence.auditSession.outcome, AUDIT_SESSION_OUTCOMES.refreshed);
  assert.equal(evidence.auditSession.refreshCalls, 1);
  assert.equal(evidence.auditSession.persisted, true);
  assertEvidenceSafeFieldNames(evidence.auditSession);
  assertEvidenceSafeFieldNames(evidence.failure, 'failure');
  assert.equal(evidence.auditSession.auditUserId, AUDIT_USER);
  assert.equal(evidence.auditUserId, AUDIT_USER);
  assert.equal((await stat(config.output)).mode & 0o777, 0o600, 'evidence stays mode 0600');
  assert.equal(config.output.startsWith(evidenceDir), true, 'evidence stays outside the repository');
  assert.deepEqual(
    auditSessionMaterialLeaks(await readFile(config.output, 'utf8'), [...store.secrets, refreshed.access_token, NEW_REFRESH]),
    [],
    'evidence JSON never carries token material',
  );
  await noTemporaryFiles(evidenceDir);
  assert.deepEqual((await readdir(evidenceDir)).filter((name) => name.endsWith('.lock')), []);
});

test('the attestation makes zero refresh calls on a fresh token and records the custody outcome', async (t) => {
  const store = await seedStore(t, { exp: NOW_S + 3 * DAY });
  const evidenceDir = await makePrivateDir(t);
  const { calls, fetchFn } = fakeFetch((url) => {
    if (url.includes('/api/health')) return healthResponse();
    return assert.fail(`unexpected transport call ${url}`);
  });
  const recorder = { requests: [] };
  const config = attestationConfig(store, evidenceDir);
  await assert.rejects(
    runProductionDeliveryAttestation(config, {
      chromium: fakeBrowser(recorder),
      fetchFn,
      nowMs,
      now: () => new Date(NOW_MS),
      sleep: async () => undefined,
    }),
    /fresh full attempt returned HTTP 599/,
  );
  assert.equal(tokenCalls(calls).length, 0);
  const browserSession = JSON.parse(recorder.storageState.origins[0].localStorage[0].value);
  assert.equal(browserSession.access_token, store.accessToken);
  const evidence = JSON.parse(await readFile(config.output, 'utf8'));
  assert.equal(evidence.auditSession.outcome, AUDIT_SESSION_OUTCOMES.fresh);
  assert.equal(evidence.auditSession.refreshCalls, 0);
  assert.deepEqual(auditSessionMaterialLeaks(await readFile(config.output, 'utf8'), store.secrets), []);
});

test('a startup refresh with an unknown outcome fails the attestation closed before any API request and records it', async (t) => {
  const store = await seedStore(t, { exp: NOW_S - 60 });
  const evidenceDir = await makePrivateDir(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const { calls, fetchFn } = fakeFetch((url, init) => {
    if (url.includes('/auth/v1/token')) {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    }
    return assert.fail(`unexpected transport call ${url}`);
  });
  const recorder = { requests: [] };
  const config = attestationConfig(store, evidenceDir);
  const chromium = {
    async launch() { assert.fail('the browser must not launch after an unknown refresh outcome'); },
  };
  // The transport never answers; the module's own bounded timer (shortened
  // here from the production 20 seconds) establishes the unknown outcome.
  const error = await runProductionDeliveryAttestation(config, {
    chromium,
    fetchFn,
    nowMs,
    now: () => new Date(NOW_MS),
    sleep: async () => undefined,
    auditSessionTimeoutMs: 40,
  }).then(
    () => assert.fail('expected the attestation to fail closed'),
    (thrown) => thrown,
  );
  assert.equal(error.code, AUDIT_SESSION_ERROR_CODES.outcomeUnknown, error.message);
  assert.equal(calls.length, 1, 'no API request and no retry after an unknown outcome');
  assert.deepEqual(recorder.requests, []);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before, 'old state intact');
  const evidence = JSON.parse(await readFile(config.output, 'utf8'));
  assert.equal(evidence.status, 'failed_closed');
  assert.equal(evidence.auditSession.outcome, AUDIT_SESSION_OUTCOMES.unknown);
  assert.equal(evidence.auditSession.refreshCalls, 1);
  assert.equal(evidence.failure.code, AUDIT_SESSION_ERROR_CODES.outcomeUnknown);
  assert.match(evidence.failure.operatorAction, /Do not retry blindly/);
  assert.deepEqual(auditSessionMaterialLeaks(await readFile(config.output, 'utf8'), store.secrets), []);
  assert.equal((await stat(config.output)).mode & 0o777, 0o600);
});

test('readAttestationConfig takes the auth-state path from the credential env when none is given explicitly', async (t) => {
  const store = await seedStore(t);
  const env = {
    TRAINING_PHASE6_DELIVERY_BASE_URL: DEPLOYMENT_URL,
    TRAINING_PHASE6_DELIVERY_EXPECTED_BUILD: BUILD,
    TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID: AUDIT_USER,
    TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_WRITES: WRITE_ACK,
    TRAINING_PHASE6_DELIVERY_EVIDENCE: join(store.dir, 'evidence.json'),
    TRAINING_PHASE6_AUDIT_ENV_FILE: store.envPath,
  };
  const config = readAttestationConfig(env);
  assert.equal(config.authState, store.authStatePath);
  assert.equal(config.auditCredentialEnv, store.envPath);
  assert.equal(readAuditSessionAuthStatePath(store.envPath), store.authStatePath);
  assert.throws(
    () => readAttestationConfig({ ...env, TRAINING_PHASE6_AUDIT_ENV_FILE: 'relative/.env' }),
    /must be an absolute path/,
  );
  const explicit = readAttestationConfig({ ...env, TRAINING_PHASE6_DELIVERY_AUTH_STATE: store.authStatePath });
  assert.equal(explicit.authState, store.authStatePath);
  assert.deepEqual(auditSessionMaterialLeaks(config, store.secrets), []);
});
