import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AUDIT_SESSION_ENV_KEYS,
  AUDIT_SESSION_ERROR_CODES,
  AUDIT_SESSION_MODE,
  AUDIT_SESSION_OUTCOMES,
  AUDIT_SESSION_PERSIST_OUTCOMES,
  AUDIT_SESSION_PERSIST_REASONS,
  auditSessionMaterialLeaks,
  ensureFreshAuditSession,
  parseAuditCredentialEnv,
  persistBrowserSessionIfRotated,
  renderAuditCredentialEnv,
  seedAuditSessionFromStorageState,
} from '../src/lib/training/trainingAuditSessionRefresh.mjs';
import { runProductionDeliveryAttestation } from '../scripts/training-phase6-production-delivery-attestation.mjs';
import {
  parseCustodyCliArgs,
  runAuditSessionCustodyCli,
} from '../scripts/training-phase6-audit-session-custody.mjs';

const AUDIT_USER = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
const OTHER_USER = '7f3a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b';
const SUPABASE_URL = 'https://phase6-test-project.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_FAKEPHASE6KEY0000000000000000';
const DISK_REFRESH = 'FAKE-REFRESH-TOKEN-DISK-0123456789abcdef';
const ROTATED_REFRESH = 'FAKE-REFRESH-TOKEN-ROTATED-fedcba9876543210';
const SEED_REFRESH = 'FAKE-REFRESH-TOKEN-SEED-00112233445566778899';
const DEPLOYMENT_URL = 'https://hub-vanguard-abc123-smarter-poker.vercel.app';
const DEPLOYMENT_ID = 'dpl_phase6browsercustody';
const BUILD = 'c'.repeat(40);
const WRITE_ACK = 'I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS';
const NOW_MS = Date.UTC(2026, 8, 22, 15, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const nowMs = () => NOW_MS;
const NO_REPO = '/nonexistent/repository/root';

function fakeJwt(payload, signature) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    signature,
  ].join('.');
}

// The session persisted at startup: issued an hour ago, three days left.
function diskAccessToken({ iat = NOW_S - HOUR, exp = NOW_S + 3 * DAY, sub = AUDIT_USER } = {}) {
  return fakeJwt({ sub, iat, exp, role: 'authenticated' }, 'FAKEDISKSIGNATURE0000001');
}

// The session the browser's own auth client rotated during the run.
function rotatedAccessToken({ iat = NOW_S + 60, exp = NOW_S + 60 + 7 * DAY, sub = AUDIT_USER } = {}) {
  return fakeJwt({ sub, iat, exp, role: 'authenticated' }, 'FAKEROTATEDSIGNATURE0002');
}

function sessionFor(accessToken, refreshToken, { userId = AUDIT_USER, exp } = {}) {
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp ?? NOW_S + 3 * DAY,
    refresh_token: refreshToken,
    user: { id: userId, aud: 'authenticated' },
  };
}

function storageState(session, origin = 'https://smarter.poker') {
  return {
    cookies: [],
    origins: [{ origin, localStorage: [{ name: 'smarter-poker-auth', value: JSON.stringify(session) }] }],
  };
}

async function makePrivateDir(t) {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-browser-custody-'));
  await chmod(directory, 0o700);
  t.after(async () => {
    await chmod(directory, 0o700).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function seedStore(t, { accessToken = diskAccessToken(), withEnv = true, authStateSubdir = null } = {}) {
  const dir = await makePrivateDir(t);
  const envPath = join(dir, '.env');
  let authStateDir = dir;
  if (authStateSubdir) {
    authStateDir = join(dir, authStateSubdir);
    await mkdir(authStateDir, { mode: 0o700 });
    t.after(() => chmod(authStateDir, 0o700).catch(() => undefined));
  }
  const authStatePath = join(authStateDir, 'audit-auth.json');
  const session = sessionFor(accessToken, DISK_REFRESH);
  const values = new Map([
    [AUDIT_SESSION_ENV_KEYS.accessToken, accessToken],
    [AUDIT_SESSION_ENV_KEYS.refreshToken, DISK_REFRESH],
    [AUDIT_SESSION_ENV_KEYS.expectedAuditUserId, AUDIT_USER],
    [AUDIT_SESSION_ENV_KEYS.authState, authStatePath],
    [AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch, String(NOW_S - 10 * DAY)],
    [AUDIT_SESSION_ENV_KEYS.supabaseUrl, SUPABASE_URL],
    [AUDIT_SESSION_ENV_KEYS.supabasePublishableKey, PUBLISHABLE_KEY],
  ]);
  if (withEnv) await writeFile(envPath, renderAuditCredentialEnv(values), { mode: 0o600 });
  await writeFile(authStatePath, `${JSON.stringify(storageState(session), null, 2)}\n`, { mode: 0o600 });
  return {
    dir,
    authStateDir,
    envPath: withEnv ? envPath : null,
    authStatePath,
    accessToken,
    secrets: [accessToken, DISK_REFRESH, PUBLISHABLE_KEY],
  };
}

async function snapshot(paths) {
  return Promise.all(paths.filter(Boolean).map((path) => readFile(path, 'utf8')));
}

async function noTemporaryOrLockFiles(dir) {
  const entries = await readdir(dir);
  assert.deepEqual(entries.filter((name) => name.endsWith('.tmp')), [], 'temporary files were left behind');
  assert.deepEqual(entries.filter((name) => name.endsWith('.refresh.lock')), [], 'the custody lock was not released');
}

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

function assertRecordClean(record, secrets) {
  assert.deepEqual(auditSessionMaterialLeaks(record, secrets), [], JSON.stringify(record));
  assertEvidenceSafeFieldNames(record);
}

function persistOptions(store, extra = {}) {
  return {
    browserOrigin: DEPLOYMENT_URL,
    credentialEnvPath: store.envPath,
    authStatePath: store.authStatePath,
    expectedAuditUserId: AUDIT_USER,
    baselineAccessToken: store.accessToken,
    nowMs,
    sleep: async () => undefined,
    repositoryRoot: NO_REPO,
    ...extra,
  };
}

async function assertCustodyHolds(store, { accessToken, refreshToken }) {
  const env = parseAuditCredentialEnv(await readFile(store.envPath, 'utf8'));
  const state = JSON.parse(await readFile(store.authStatePath, 'utf8'));
  const session = JSON.parse(state.origins[0].localStorage[0].value);
  assert.equal(state.origins[0].origin, 'https://smarter.poker', 'custody auth state keeps the trusted origin');
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.accessToken), accessToken);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.refreshToken), refreshToken);
  assert.equal(session.access_token, accessToken, 'env and auth state agree on the access token');
  assert.equal(session.refresh_token, refreshToken, 'env and auth state agree on the refresh token');
  assert.equal((await stat(store.envPath)).mode & 0o777, 0o600);
  assert.equal((await stat(store.authStatePath)).mode & 0o777, 0o600);
  return { env, session };
}

// Requirement: a session the browser rotated is persisted to both custody files.
test('a rotated browser session is persisted atomically to both custody files in the shared format', async (t) => {
  const store = await seedStore(t);
  const rotated = rotatedAccessToken();
  const browserState = storageState(sessionFor(rotated, ROTATED_REFRESH), DEPLOYMENT_URL);
  const record = await persistBrowserSessionIfRotated(persistOptions(store, { storageState: browserState }));
  assert.equal(record.persistedRotatedSession, true, JSON.stringify(record));
  assert.equal(record.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.persisted);
  assert.equal(record.reason, null);
  assert.equal(record.previousSessionExpiresAt, new Date((NOW_S + 3 * DAY) * 1000).toISOString());
  assert.equal(record.sessionExpiresAt, new Date((NOW_S + 60 + 7 * DAY) * 1000).toISOString());
  assert.equal(record.browserOrigin, DEPLOYMENT_URL);
  assertRecordClean(record, [...store.secrets, rotated, ROTATED_REFRESH]);
  const { env } = await assertCustodyHolds(store, { accessToken: rotated, refreshToken: ROTATED_REFRESH });
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.sessionMode), AUDIT_SESSION_MODE);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch), String(NOW_S - 10 * DAY), 'the 90-day window is unchanged');
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.envFile), store.envPath);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.supabaseUrl), SUPABASE_URL);
  await noTemporaryOrLockFiles(store.dir);
});

test('a browser context is read through storageState() and an unchanged session writes nothing', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const beforeStats = await Promise.all([stat(store.envPath), stat(store.authStatePath)]);
  let reads = 0;
  const browserContext = {
    async storageState() {
      reads += 1;
      return storageState(sessionFor(store.accessToken, DISK_REFRESH), DEPLOYMENT_URL);
    },
  };
  const record = await persistBrowserSessionIfRotated(persistOptions(store, { browserContext }));
  assert.equal(reads, 1);
  assert.equal(record.persistedRotatedSession, false);
  assert.equal(record.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.unchanged);
  assert.equal(record.reason, AUDIT_SESSION_PERSIST_REASONS.unchanged);
  assertRecordClean(record, store.secrets);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before, 'files are byte-identical');
  const afterStats = await Promise.all([stat(store.envPath), stat(store.authStatePath)]);
  assert.deepEqual(afterStats.map((s) => s.mtimeMs), beforeStats.map((s) => s.mtimeMs), 'files were not rewritten');
  await noTemporaryOrLockFiles(store.dir);
});

test('a browser session for another user is refused and nothing is written', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const foreign = rotatedAccessToken({ sub: OTHER_USER });
  for (const session of [
    sessionFor(foreign, ROTATED_REFRESH, { userId: OTHER_USER }),
    sessionFor(rotatedAccessToken(), ROTATED_REFRESH, { userId: OTHER_USER }),
    sessionFor(foreign, ROTATED_REFRESH),
  ]) {
    const record = await persistBrowserSessionIfRotated(
      persistOptions(store, { storageState: storageState(session, DEPLOYMENT_URL) }),
    );
    assert.equal(record.persistedRotatedSession, false);
    assert.equal(record.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.refused);
    assert.equal(record.reason, AUDIT_SESSION_PERSIST_REASONS.identityMismatch);
    assert.equal(record.code, AUDIT_SESSION_ERROR_CODES.identityMismatch);
    assertRecordClean(record, [...store.secrets, foreign, ROTATED_REFRESH]);
  }
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  await noTemporaryOrLockFiles(store.dir);
});

test('a browser session older than the persisted or startup session is refused, as is an expired one', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const cases = [
    { label: 'older iat', token: rotatedAccessToken({ iat: NOW_S - 2 * HOUR, exp: NOW_S + 3 * DAY }) },
    { label: 'earlier exp', token: rotatedAccessToken({ iat: NOW_S - HOUR, exp: NOW_S + DAY }) },
    { label: 'same claims, different signature', token: rotatedAccessToken({ iat: NOW_S - HOUR, exp: NOW_S + 3 * DAY }) },
    { label: 'expired', token: rotatedAccessToken({ iat: NOW_S - 10 * DAY, exp: NOW_S - 60 }) },
  ];
  for (const { label, token } of cases) {
    const record = await persistBrowserSessionIfRotated(
      persistOptions(store, { storageState: storageState(sessionFor(token, ROTATED_REFRESH), DEPLOYMENT_URL) }),
    );
    assert.equal(record.persistedRotatedSession, false, label);
    assert.equal(record.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.refused, label);
    assert.equal(record.reason, AUDIT_SESSION_PERSIST_REASONS.notNewer, `${label}: ${record.reason}`);
    assertRecordClean(record, [...store.secrets, token, ROTATED_REFRESH]);
  }
  // Newer than the startup baseline but older than what is on disk now (an
  // external rotation happened during the run): never overwrite the newer pair.
  const newerOnDisk = await seedStore(t, {
    accessToken: diskAccessToken({ iat: NOW_S + 2 * HOUR, exp: NOW_S + 2 * HOUR + 7 * DAY }),
  });
  const record = await persistBrowserSessionIfRotated(
    persistOptions(newerOnDisk, {
      baselineAccessToken: store.accessToken,
      storageState: storageState(sessionFor(rotatedAccessToken(), ROTATED_REFRESH), DEPLOYMENT_URL),
    }),
  );
  assert.equal(record.persistedRotatedSession, false);
  assert.equal(record.reason, AUDIT_SESSION_PERSIST_REASONS.notNewer);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  await noTemporaryOrLockFiles(store.dir);
});

test('malformed browser storage is refused with a redacted record and nothing written', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const leakyToken = rotatedAccessToken();
  const cases = [
    { label: 'storageState throws', browserContext: { async storageState() { throw new Error(`target closed ${leakyToken}`); } }, reason: AUDIT_SESSION_PERSIST_REASONS.storageStateUnavailable },
    { label: 'no storageState function', browserContext: {}, reason: AUDIT_SESSION_PERSIST_REASONS.storageStateUnavailable },
    { label: 'not an object', storageState: 'nope', reason: AUDIT_SESSION_PERSIST_REASONS.browserSessionMalformed },
    { label: 'no origins', storageState: { cookies: [] }, reason: AUDIT_SESSION_PERSIST_REASONS.browserSessionMalformed },
    { label: 'untrusted origin only', storageState: storageState(sessionFor(leakyToken, ROTATED_REFRESH), 'https://evil.example'), reason: AUDIT_SESSION_PERSIST_REASONS.browserSessionMalformed },
    { label: 'two trusted items', storageState: { cookies: [], origins: [storageState(sessionFor(leakyToken, ROTATED_REFRESH), DEPLOYMENT_URL).origins[0], storageState(sessionFor(leakyToken, ROTATED_REFRESH)).origins[0]] }, reason: AUDIT_SESSION_PERSIST_REASONS.browserSessionMalformed },
    { label: 'value is not JSON', storageState: { cookies: [], origins: [{ origin: DEPLOYMENT_URL, localStorage: [{ name: 'smarter-poker-auth', value: `{${leakyToken}` }] }] }, reason: AUDIT_SESSION_PERSIST_REASONS.browserSessionMalformed },
    { label: 'no refresh token', storageState: storageState({ access_token: leakyToken, user: { id: AUDIT_USER } }, DEPLOYMENT_URL), reason: AUDIT_SESSION_PERSIST_REASONS.browserSessionMalformed },
    { label: 'access token is not a JWT', storageState: storageState(sessionFor('not-a-jwt-FAKEVALUE', ROTATED_REFRESH), DEPLOYMENT_URL), reason: AUDIT_SESSION_PERSIST_REASONS.browserSessionMalformed },
  ];
  for (const { label, reason, ...input } of cases) {
    const record = await persistBrowserSessionIfRotated(persistOptions(store, input));
    assert.equal(record.persistedRotatedSession, false, label);
    assert.equal(record.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.refused, label);
    assert.equal(record.reason, reason, `${label}: ${record.reason} ${record.message}`);
    assert.equal(typeof record.message, 'string', label);
    assertRecordClean(record, [...store.secrets, leakyToken, ROTATED_REFRESH]);
  }
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  await noTemporaryOrLockFiles(store.dir);
});

test('a custody lock held by a live process refuses persistence after bounded attempts and leaves files intact', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const lockPath = `${store.envPath}.refresh.lock`;
  await writeFile(lockPath, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  let sleeps = 0;
  const record = await persistBrowserSessionIfRotated(
    persistOptions(store, {
      storageState: storageState(sessionFor(rotatedAccessToken(), ROTATED_REFRESH), DEPLOYMENT_URL),
      sleep: async () => { sleeps += 1; },
      isProcessAlive: () => true,
    }),
  );
  assert.equal(record.persistedRotatedSession, false);
  assert.equal(record.reason, AUDIT_SESSION_PERSIST_REASONS.lockHeld);
  assert.equal(record.lock.attempts, 3);
  assert.equal(sleeps, 2);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  assert.equal((await readdir(store.dir)).includes('.env.refresh.lock'), true, 'a live lock is never deleted');
  assertRecordClean(record, [...store.secrets, ROTATED_REFRESH]);
});

test('a custody store whose env and auth state disagree is left alone (custody_state_invalid)', async (t) => {
  const store = await seedStore(t);
  const env = parseAuditCredentialEnv(await readFile(store.envPath, 'utf8'));
  env.set(AUDIT_SESSION_ENV_KEYS.refreshToken, 'FAKE-REFRESH-TOKEN-DIVERGED-0000000000000000');
  await writeFile(store.envPath, renderAuditCredentialEnv(env), { mode: 0o600 });
  const before = await snapshot([store.envPath, store.authStatePath]);
  const record = await persistBrowserSessionIfRotated(
    persistOptions(store, { storageState: storageState(sessionFor(rotatedAccessToken(), ROTATED_REFRESH), DEPLOYMENT_URL) }),
  );
  assert.equal(record.persistedRotatedSession, false);
  assert.equal(record.reason, AUDIT_SESSION_PERSIST_REASONS.custodyStateInvalid);
  assert.match(record.message, /disagree/);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  assertRecordClean(record, [...store.secrets, ROTATED_REFRESH, 'FAKE-REFRESH-TOKEN-DIVERGED-0000000000000000']);
});

test('without a credential env the rotated session is persisted to the auth state alone', async (t) => {
  const store = await seedStore(t, { withEnv: false });
  const rotated = rotatedAccessToken();
  const record = await persistBrowserSessionIfRotated(
    persistOptions(store, { storageState: storageState(sessionFor(rotated, ROTATED_REFRESH), DEPLOYMENT_URL) }),
  );
  assert.equal(record.persistedRotatedSession, true, JSON.stringify(record));
  const state = JSON.parse(await readFile(store.authStatePath, 'utf8'));
  const session = JSON.parse(state.origins[0].localStorage[0].value);
  assert.equal(session.access_token, rotated);
  assert.equal(session.refresh_token, ROTATED_REFRESH);
  assert.equal((await stat(store.authStatePath)).mode & 0o777, 0o600);
  await noTemporaryOrLockFiles(store.dir);
});

// Attestation wiring: the fake browser rotates the session inside the context.
function fakeBrowser(recorder, { rotate = null, storageStateError = null } = {}) {
  const page = {
    on() {},
    async goto(url) { return { status: () => 200, url: () => url }; },
    url() { return `${DEPLOYMENT_URL}/hub/training?revision=phase6-delivery-attestation`; },
    async evaluate(_fn, args) {
      recorder.requests.push(args.requestPath);
      if (args.requestPath.startsWith('/api/training/get-sessions')) {
        return { status: 200, payload: { success: true }, responseBytes: 16 };
      }
      return { status: 599, payload: { code: 'TEST_STOP_AFTER_FIRST_REQUEST' }, responseBytes: 0 };
    },
  };
  let initialState;
  const context = {
    async newPage() { return page; },
    async route() {},
    async unrouteAll() {},
    async storageState() {
      recorder.storageStateReads = (recorder.storageStateReads || 0) + 1;
      if (storageStateError) throw storageStateError;
      return rotate ? rotate(initialState) : initialState;
    },
    async close() { recorder.contextClosed = true; },
  };
  return {
    async launch() {
      return {
        async newContext(options) {
          initialState = options.storageState;
          recorder.storageState = options.storageState;
          return context;
        },
        async close() { recorder.browserClosed = true; },
      };
    },
  };
}

function healthResponse() {
  return {
    status: 200,
    async text() { return JSON.stringify(this.body); },
    async json() { return this.body; },
    body: {
      status: 'ok',
      commitSha: BUILD,
      version: BUILD,
      deploymentUrl: new URL(DEPLOYMENT_URL).hostname,
      deploymentId: DEPLOYMENT_ID,
      checks: { db: { status: 'ok' }, trainingGradingReceipt: { status: 'ok' } },
    },
  };
}

function attestationConfig(store, evidenceDir) {
  return {
    baseUrl: DEPLOYMENT_URL,
    expectedBuild: BUILD,
    expectedAuditUserId: AUDIT_USER,
    authState: store.authStatePath,
    auditCredentialEnv: store.envPath,
    output: join(evidenceDir, 'phase6-public.json'),
    writeAcknowledgement: WRITE_ACK,
  };
}

async function runFailingAttestation(store, evidenceDir, chromium) {
  const config = attestationConfig(store, evidenceDir);
  const fetchFn = async (url) => {
    if (String(url).includes('/api/health')) return healthResponse();
    return assert.fail(`unexpected transport call ${url}`);
  };
  const error = await runProductionDeliveryAttestation(config, {
    chromium,
    fetchFn,
    nowMs,
    now: () => new Date(NOW_MS),
    sleep: async () => undefined,
  }).then(() => assert.fail('the fake run stops at its first attempt request'), (thrown) => thrown);
  return { config, error, evidence: JSON.parse(await readFile(config.output, 'utf8')) };
}

test('the attestation failure path still persists the browser-rotated session and records it without token material', async (t) => {
  const store = await seedStore(t);
  const evidenceDir = await makePrivateDir(t);
  const rotated = rotatedAccessToken();
  const recorder = { requests: [] };
  const chromium = fakeBrowser(recorder, {
    rotate: (state) => storageState(sessionFor(rotated, ROTATED_REFRESH), state.origins[0].origin),
  });
  const { config, error, evidence } = await runFailingAttestation(store, evidenceDir, chromium);
  assert.match(error.message, /fresh full attempt returned HTTP 599/, 'the original failure is what is thrown');
  assert.equal(recorder.storageStateReads, 1, 'storage state is read exactly once');
  assert.equal(recorder.contextClosed, true);
  assert.equal(recorder.browserClosed, true);
  assert.equal(evidence.status, 'failed_closed');
  assert.equal(evidence.success, false);
  assert.equal(evidence.publicApiSuccess, false);
  assert.equal(evidence.auditSession.outcome, AUDIT_SESSION_OUTCOMES.fresh, 'the startup outcome is kept');
  assert.equal(evidence.auditSession.persistedRotatedSession, true);
  assert.equal(evidence.auditSession.browserCustody.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.persisted);
  assert.equal(evidence.auditSession.browserCustody.browserOrigin, DEPLOYMENT_URL);
  assertEvidenceSafeFieldNames(evidence.auditSession);
  const secrets = [...store.secrets, rotated, ROTATED_REFRESH];
  assert.deepEqual(auditSessionMaterialLeaks(await readFile(config.output, 'utf8'), secrets), [], 'evidence JSON never carries token material');
  assert.deepEqual(auditSessionMaterialLeaks(error.message, secrets), []);
  await assertCustodyHolds(store, { accessToken: rotated, refreshToken: ROTATED_REFRESH });
  assert.equal((await stat(config.output)).mode & 0o777, 0o600);
  await noTemporaryOrLockFiles(store.dir);
});

test('an unchanged browser session leaves the custody files byte-identical and is recorded as such', async (t) => {
  const store = await seedStore(t);
  const evidenceDir = await makePrivateDir(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const recorder = { requests: [] };
  const { evidence } = await runFailingAttestation(store, evidenceDir, fakeBrowser(recorder));
  assert.equal(evidence.auditSession.persistedRotatedSession, false);
  assert.equal(evidence.auditSession.browserCustody.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.unchanged);
  assert.equal(evidence.auditSession.browserCustody.reason, AUDIT_SESSION_PERSIST_REASONS.unchanged);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  assertEvidenceSafeFieldNames(evidence.auditSession);
});

test('a persistence failure is recorded with a redacted message and never upgrades the run result', async (t) => {
  const store = await seedStore(t, { authStateSubdir: 'state' });
  const evidenceDir = await makePrivateDir(t);
  const [envBefore, stateBefore] = await snapshot([store.envPath, store.authStatePath]);
  const rotated = rotatedAccessToken();
  const recorder = { requests: [] };
  const chromium = fakeBrowser(recorder, {
    rotate: (state) => storageState(sessionFor(rotated, ROTATED_REFRESH), state.origins[0].origin),
  });
  // A read-only (still private) auth-state directory makes the second of the
  // two atomic writes fail after every check passed and the env was written:
  // the interrupted-between-writes case the startup custody check refuses.
  await chmod(store.authStateDir, 0o500);
  let result;
  try {
    result = await runFailingAttestation(store, evidenceDir, chromium);
  } finally {
    await chmod(store.authStateDir, 0o700);
  }
  const { config, error, evidence } = result;
  assert.match(error.message, /fresh full attempt returned HTTP 599/, 'the original failure is what is thrown');
  assert.equal(evidence.status, 'failed_closed');
  assert.equal(evidence.success, false);
  assert.equal(evidence.publicApiSuccess, false);
  assert.equal(evidence.releaseGateReady, false);
  assert.equal(evidence.auditSession.persistedRotatedSession, false);
  assert.equal(evidence.auditSession.browserCustody.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.failed);
  assert.equal(evidence.auditSession.browserCustody.reason, AUDIT_SESSION_PERSIST_REASONS.persistFailed);
  assert.equal(evidence.auditSession.browserCustody.code, AUDIT_SESSION_ERROR_CODES.persistFailed);
  assert.match(evidence.auditSession.browserCustody.message, /persisting the rotated browser session failed/);
  const secrets = [...store.secrets, rotated, ROTATED_REFRESH];
  assert.deepEqual(auditSessionMaterialLeaks(await readFile(config.output, 'utf8'), secrets), []);
  assertEvidenceSafeFieldNames(evidence.auditSession);
  const [envAfter, stateAfter] = await snapshot([store.envPath, store.authStatePath]);
  assert.notEqual(envAfter, envBefore, 'the env (first write) was rotated');
  assert.equal(stateAfter, stateBefore, 'the auth state (second write) is untouched');
  await noTemporaryOrLockFiles(store.dir);
  await noTemporaryOrLockFiles(store.authStateDir);
  // The divergent store is refused, with the reconcile action, before the next run's first request.
  const next = await ensureFreshAuditSession({
    credentialEnvPath: store.envPath,
    authStatePath: store.authStatePath,
    expectedAuditUserId: AUDIT_USER,
    fetchFn: async () => assert.fail('no refresh call on a divergent store'),
    nowMs,
    sleep: async () => undefined,
    repositoryRoot: NO_REPO,
  }).then(() => assert.fail('expected a refusal'), (thrown) => thrown);
  assert.equal(next.code, AUDIT_SESSION_ERROR_CODES.refused);
  assert.match(next.message, /disagree about the session token pair/);
  assert.deepEqual(auditSessionMaterialLeaks(next.message, secrets), []);
});

test('a persist failure before the lock (read-only custody directory) is a refusal that leaves both files intact', async (t) => {
  const store = await seedStore(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  await chmod(store.dir, 0o500);
  let record;
  try {
    record = await persistBrowserSessionIfRotated(
      persistOptions(store, { storageState: storageState(sessionFor(rotatedAccessToken(), ROTATED_REFRESH), DEPLOYMENT_URL) }),
    );
  } finally {
    await chmod(store.dir, 0o700);
  }
  assert.equal(record.persistedRotatedSession, false);
  assert.equal(record.outcome, AUDIT_SESSION_PERSIST_OUTCOMES.refused);
  assert.equal(record.reason, AUDIT_SESSION_PERSIST_REASONS.lockHeld);
  assertRecordClean(record, [...store.secrets, ROTATED_REFRESH]);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
  await noTemporaryOrLockFiles(store.dir);
});

test('an unreadable browser storage state is recorded as a refusal and the failure path is otherwise unchanged', async (t) => {
  const store = await seedStore(t);
  const evidenceDir = await makePrivateDir(t);
  const before = await snapshot([store.envPath, store.authStatePath]);
  const recorder = { requests: [] };
  const leaky = rotatedAccessToken();
  const chromium = fakeBrowser(recorder, { storageStateError: new Error(`Target page, context or browser has been closed ${leaky}`) });
  const { config, error, evidence } = await runFailingAttestation(store, evidenceDir, chromium);
  assert.match(error.message, /fresh full attempt returned HTTP 599/);
  assert.equal(evidence.auditSession.persistedRotatedSession, false);
  assert.equal(evidence.auditSession.browserCustody.reason, AUDIT_SESSION_PERSIST_REASONS.storageStateUnavailable);
  assert.deepEqual(auditSessionMaterialLeaks(await readFile(config.output, 'utf8'), [...store.secrets, leaky]), []);
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), before);
});

// Re-seeding custody after a lost session.
function seedAccessToken({ iat = NOW_S - 120, exp = NOW_S - 120 + 7 * DAY, sub = AUDIT_USER } = {}) {
  return fakeJwt({ sub, iat, exp, role: 'authenticated' }, 'FAKESEEDSIGNATURE00000003');
}

async function writeSourceState(t, session, origin = 'https://smarter.poker') {
  const dir = await makePrivateDir(t);
  const path = join(dir, 'user.json');
  const state = storageState(session, origin);
  state.cookies = [{ name: 'unrelated', value: 'cookie-value', domain: 'smarter.poker', path: '/' }];
  state.origins.push({ origin: 'https://other.example', localStorage: [{ name: 'x', value: 'y' }] });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  return { dir, path };
}

test('seeding from a fresh storage state creates both custody files, 0600, agreeing, with a new 90-day window', async (t) => {
  const access = seedAccessToken();
  const source = await writeSourceState(t, sessionFor(access, SEED_REFRESH));
  const dir = await makePrivateDir(t);
  const store = { envPath: join(dir, '.env'), authStatePath: join(dir, 'audit-auth.json') };
  const record = await seedAuditSessionFromStorageState({
    storageStatePath: source.path,
    credentialEnvPath: store.envPath,
    authStatePath: store.authStatePath,
    expectedAuditUserId: AUDIT_USER,
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: PUBLISHABLE_KEY,
    nowMs,
    sleep: async () => undefined,
    repositoryRoot: NO_REPO,
  });
  assert.equal(record.seeded, true);
  assert.equal(record.auditUserId, AUDIT_USER);
  assert.equal(record.sourceOrigin, 'https://smarter.poker');
  assert.equal(record.sessionStartedAt, new Date((NOW_S - 120) * 1000).toISOString());
  assert.equal(record.sessionValidUntil, new Date((NOW_S - 120) * 1000 + 90 * DAY * 1000).toISOString());
  assertRecordClean(record, [access, SEED_REFRESH, PUBLISHABLE_KEY]);
  const { env } = await assertCustodyHolds(store, { accessToken: access, refreshToken: SEED_REFRESH });
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.expectedAuditUserId), AUDIT_USER);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.authState), store.authStatePath);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch), String(NOW_S - 120));
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.sessionValidUntil), record.sessionValidUntil);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.sessionMode), AUDIT_SESSION_MODE);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.supabaseUrl), SUPABASE_URL);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.supabasePublishableKey), PUBLISHABLE_KEY);
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.envFile), store.envPath);
  const state = JSON.parse(await readFile(store.authStatePath, 'utf8'));
  assert.deepEqual(state.cookies, [], 'unrelated cookies are not copied into custody');
  assert.equal(state.origins.length, 1, 'only the trusted origin is kept');
  await noTemporaryOrLockFiles(dir);
});

test('re-seeding over an existing custody store keeps its Supabase settings and refuses another account, an expired token or a foreign session', async (t) => {
  const store = await seedStore(t);
  const beforeEnv = parseAuditCredentialEnv(await readFile(store.envPath, 'utf8'));
  const access = seedAccessToken();
  const good = await writeSourceState(t, sessionFor(access, SEED_REFRESH));
  const record = await seedAuditSessionFromStorageState({
    storageStatePath: good.path,
    credentialEnvPath: store.envPath,
    nowMs,
    sleep: async () => undefined,
    repositoryRoot: NO_REPO,
  });
  assert.equal(record.seeded, true, 'audit user, auth-state path and Supabase settings come from the existing env');
  assert.equal(record.authStatePath, store.authStatePath);
  const { env } = await assertCustodyHolds(store, { accessToken: access, refreshToken: SEED_REFRESH });
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.supabaseUrl), beforeEnv.get(AUDIT_SESSION_ENV_KEYS.supabaseUrl));
  assert.equal(env.get(AUDIT_SESSION_ENV_KEYS.supabasePublishableKey), beforeEnv.get(AUDIT_SESSION_ENV_KEYS.supabasePublishableKey));

  const after = await snapshot([store.envPath, store.authStatePath]);
  const refusals = [
    { label: 'another account requested', options: { expectedAuditUserId: OTHER_USER }, code: AUDIT_SESSION_ERROR_CODES.identityMismatch },
    { label: 'foreign session', source: await writeSourceState(t, sessionFor(seedAccessToken({ sub: OTHER_USER }), SEED_REFRESH, { userId: OTHER_USER })), code: AUDIT_SESSION_ERROR_CODES.identityMismatch },
    { label: 'expired token', source: await writeSourceState(t, sessionFor(seedAccessToken({ iat: NOW_S - 8 * DAY, exp: NOW_S - 60 }), SEED_REFRESH)), code: AUDIT_SESSION_ERROR_CODES.refused },
    { label: 'untrusted origin', source: await writeSourceState(t, sessionFor(access, SEED_REFRESH), 'https://evil.example'), code: AUDIT_SESSION_ERROR_CODES.malformedState },
    { label: 'different auth-state path', options: { authStatePath: join(store.dir, 'elsewhere.json') }, code: AUDIT_SESSION_ERROR_CODES.refused },
    { label: 'relative storage-state path', options: { storageStatePath: 'relative/user.json' }, code: AUDIT_SESSION_ERROR_CODES.refused },
  ];
  for (const { label, source = good, options = {}, code } of refusals) {
    const error = await seedAuditSessionFromStorageState({
      storageStatePath: source.path,
      credentialEnvPath: store.envPath,
      nowMs,
      sleep: async () => undefined,
      repositoryRoot: NO_REPO,
      ...options,
    }).then(() => assert.fail(`${label}: expected a refusal`), (thrown) => thrown);
    assert.equal(error.name, 'TrainingAuditSessionError', label);
    assert.equal(error.code, code, `${label}: ${error.code} ${error.message}`);
    assert.deepEqual(auditSessionMaterialLeaks(error.message, [access, SEED_REFRESH, ...store.secrets]), [], label);
  }
  assert.deepEqual(await snapshot([store.envPath, store.authStatePath]), after, 'refusals write nothing');
  await noTemporaryOrLockFiles(store.dir);
});

test('the custody CLI seeds from a storage state and prints metadata only; token material on argv is refused', async (t) => {
  const access = seedAccessToken();
  const source = await writeSourceState(t, sessionFor(access, SEED_REFRESH));
  const dir = await makePrivateDir(t);
  const store = { envPath: join(dir, '.env'), authStatePath: join(dir, 'audit-auth.json') };
  const out = [];
  const err = [];
  const io = { stdout: { write: (s) => out.push(String(s)) }, stderr: { write: (s) => err.push(String(s)) }, nowMs };
  const env = {
    TRAINING_PHASE6_AUDIT_ENV_FILE: store.envPath,
    TRAINING_PHASE6_DELIVERY_AUTH_STATE: store.authStatePath,
    TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID: AUDIT_USER,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
  };
  const secrets = [access, SEED_REFRESH, PUBLISHABLE_KEY];

  assert.equal(await runAuditSessionCustodyCli(['--seed-from-storage-state', source.path, '--origin', access], env, io), 2);
  assert.match(err.at(-1), /carries token material/);
  assert.equal(await runAuditSessionCustodyCli([], env, io), 2);
  assert.match(err.at(-1), /--seed-from-storage-state is required/);
  assert.equal(await runAuditSessionCustodyCli(['--seed-from-storage-state', source.path], { ...env, TRAINING_PHASE6_AUDIT_ENV_FILE: '' }, io), 2);
  assert.match(err.at(-1), /TRAINING_PHASE6_AUDIT_ENV_FILE/);
  assert.equal(await runAuditSessionCustodyCli(['--seed-from-storage-state', source.path, '--bogus'], env, io), 2);
  assert.deepEqual(out, [], 'refusals print nothing on stdout');

  assert.equal(await runAuditSessionCustodyCli(['--seed-from-storage-state', source.path], env, io), 0);
  assert.equal(out.length, 1);
  const printed = JSON.parse(out[0]);
  assert.equal(printed.seeded, true);
  assert.equal(printed.auditUserId, AUDIT_USER);
  assert.equal(printed.custodyEnvPath, store.envPath);
  await assertCustodyHolds(store, { accessToken: access, refreshToken: SEED_REFRESH });

  // A second seed from an expired state fails with a redacted error and exit 1.
  const expired = await writeSourceState(t, sessionFor(seedAccessToken({ iat: NOW_S - 8 * DAY, exp: NOW_S - 60 }), SEED_REFRESH));
  assert.equal(await runAuditSessionCustodyCli(['--seed-from-storage-state', expired.path], env, io), 1);
  assert.match(err.at(-1), /expired at/);
  assert.deepEqual(auditSessionMaterialLeaks(out.join('') + err.join(''), secrets), [], 'no token material on stdout or stderr');
  assert.deepEqual(parseCustodyCliArgs(['--seed-from-storage-state', '/a', '--origin', 'http://127.0.0.1:3000']), {
    seedFromStorageState: '/a', envFile: null, authState: null, auditUserId: null, origins: ['http://127.0.0.1:3000'],
  });
});
