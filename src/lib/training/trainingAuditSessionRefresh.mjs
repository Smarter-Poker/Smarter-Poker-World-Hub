// Bounded audit-session custody for the Phase 6 production delivery
// attestation.
//
// The attestation authenticates as one designated audit account whose Supabase
// access JWT lives at most one week while its rotating refresh token keeps the
// session usable for a 90-day window. The out-of-Git refresher
// (`refresh-session.mjs` beside the mode-0600 credential env) rotates that
// pair deliberately. This module performs the same rotation exactly once, at
// attestation startup, when and only when the saved access token is expired or
// near expiry, so the tracked attestation never starts a production run with a
// token that cannot outlive it.
//
// Interoperability contract with the external refresher (same bytes on disk):
//   - credential env: `KEY='value'` lines, keys in AUDIT_SESSION_ENV_KEYS;
//   - auth state: Playwright storage state whose `https://smarter.poker`
//     origin carries one `smarter-poker-auth` localStorage item holding the
//     JSON session (`access_token`, `refresh_token`, `user`, ...);
//   - exclusive lock: `<credential env>.refresh.lock`, O_EXCL, `{pid, acquiredAt}`;
//   - refresh threshold 24 hours, 90-day window from the session start epoch,
//     mode `ROTATING_REFRESH_90_DAY`, atomic temp + fsync + rename, mode 0600.
//
// There is no watcher, timer or retry loop here: one bounded execution with
// an authoritative outcome. A refresh whose outcome cannot be established is
// reported as `unknown`, never retried blindly, and leaves the old state intact.

import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUDIT_SESSION_MODE = 'ROTATING_REFRESH_90_DAY';
export const AUDIT_SESSION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const AUDIT_SESSION_REFRESH_THRESHOLD_SECONDS = 24 * 60 * 60;
export const AUDIT_SESSION_MINIMUM_RUN_MARGIN_SECONDS = 20 * 60;
export const AUDIT_SESSION_REFRESH_TIMEOUT_MS = 20_000;
export const AUDIT_SESSION_LOCK_ATTEMPTS = 3;
export const AUDIT_SESSION_LOCK_RETRY_DELAY_MS = 2_000;
export const AUDIT_SESSION_TRUSTED_ORIGIN = 'https://smarter.poker';
export const AUDIT_SESSION_STORAGE_KEY = 'smarter-poker-auth';
export const AUDIT_SESSION_LOCK_SUFFIX = '.refresh.lock';

export const AUDIT_SESSION_ENV_KEYS = Object.freeze({
  accessToken: 'TRAINING_PHASE6_AUDIT_ACCESS_TOKEN',
  refreshToken: 'TRAINING_PHASE6_AUDIT_REFRESH_TOKEN',
  expectedAuditUserId: 'TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID',
  authState: 'TRAINING_PHASE6_DELIVERY_AUTH_STATE',
  sessionStartedAtEpoch: 'TRAINING_PHASE6_AUDIT_SESSION_STARTED_AT_EPOCH',
  sessionValidUntil: 'TRAINING_PHASE6_AUDIT_SESSION_VALID_UNTIL',
  sessionMode: 'TRAINING_PHASE6_AUDIT_SESSION_MODE',
  supabaseUrl: 'TRAINING_PHASE6_SUPABASE_URL',
  supabasePublishableKey: 'TRAINING_PHASE6_SUPABASE_PUBLISHABLE_KEY',
  envFile: 'TRAINING_PHASE6_AUDIT_ENV_FILE',
});

export const AUDIT_SESSION_OUTCOMES = Object.freeze({
  fresh: 'fresh',
  refreshed: 'refreshed',
  reusedPersisted: 'reused_persisted',
  refused: 'refused',
  failed: 'failed',
  unknown: 'unknown',
});

export const AUDIT_SESSION_ERROR_CODES = Object.freeze({
  refused: 'TRAINING_PHASE6_AUDIT_SESSION_REFUSED',
  windowEnded: 'TRAINING_PHASE6_AUDIT_SESSION_WINDOW_ENDED',
  identityMismatch: 'TRAINING_PHASE6_AUDIT_SESSION_IDENTITY_MISMATCH',
  malformedState: 'TRAINING_PHASE6_AUDIT_SESSION_STATE_MALFORMED',
  malformedResponse: 'TRAINING_PHASE6_AUDIT_SESSION_RESPONSE_MALFORMED',
  refreshRejected: 'TRAINING_PHASE6_AUDIT_SESSION_REFRESH_REJECTED',
  lockHeld: 'TRAINING_PHASE6_AUDIT_SESSION_REFRESH_LOCK_HELD',
  outcomeUnknown: 'TRAINING_PHASE6_AUDIT_SESSION_REFRESH_OUTCOME_UNKNOWN',
  expiredWithoutRefreshSource: 'TRAINING_PHASE6_AUDIT_SESSION_EXPIRED_WITHOUT_REFRESH_SOURCE',
  failed: 'TRAINING_PHASE6_AUDIT_SESSION_FAILED',
});

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRIVATE_MODE_MASK = 0o077;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const JWT_MATERIAL_SOURCE = 'eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}';
const PREFIXED_KEY_SOURCE = '\\b(?:sb_(?:secret|publishable)_|sbp_)[A-Za-z0-9_-]{8,}';
const ERROR_CODE_RE = /^[a-z0-9_]{1,64}$/;
const REDACTED_SECRET = '[REDACTED_AUDIT_SESSION_SECRET]';

export class TrainingAuditSessionError extends Error {
  constructor(code, message, { outcome, auditSession = null, operatorAction = null } = {}) {
    super(message);
    this.name = 'TrainingAuditSessionError';
    this.code = code;
    this.outcome = outcome;
    this.auditSession = auditSession;
    this.operatorAction = operatorAction;
  }
}

export function redactAuditSessionMaterial(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) {
      text = text.split(secret).join(REDACTED_SECRET);
    }
  }
  return text
    .replace(new RegExp(JWT_MATERIAL_SOURCE, 'g'), '[REDACTED_JWT]')
    .replace(new RegExp(PREFIXED_KEY_SOURCE, 'g'), '[REDACTED_API_KEY]');
}

export function auditSessionMaterialLeaks(value, secrets = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  const leaks = [];
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8 && text.includes(secret)) {
      leaks.push('seeded-secret');
    }
  }
  if (new RegExp(JWT_MATERIAL_SOURCE).test(text)) leaks.push('jwt');
  if (new RegExp(PREFIXED_KEY_SOURCE).test(text)) leaks.push('prefixed-api-key');
  if (/authorization"?\s*[:=]\s*"?bearer\s+(?!\[REDACTED)\S{8,}/i.test(text)) {
    leaks.push('authorization-header');
  }
  return leaks;
}

function fail(code, message, extra = {}) {
  return new TrainingAuditSessionError(code, message, extra);
}

function isoAt(ms) {
  return new Date(ms).toISOString();
}

export function parseAuditCredentialEnv(text) {
  const values = new Map();
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw fail(AUDIT_SESSION_ERROR_CODES.malformedState, 'credential env contains a malformed line', {
        outcome: AUDIT_SESSION_OUTCOMES.refused,
      });
    }
    const key = line.slice(0, separator);
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw fail(AUDIT_SESSION_ERROR_CODES.malformedState, 'credential env contains an invalid key', {
        outcome: AUDIT_SESSION_OUTCOMES.refused,
      });
    }
    let value = line.slice(separator + 1);
    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    if (value.includes("'")) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.malformedState,
        `credential env key ${key} cannot be represented safely`,
        { outcome: AUDIT_SESSION_OUTCOMES.refused },
      );
    }
    values.set(key, value);
  }
  return values;
}

export function renderAuditCredentialEnv(values) {
  return `${[...values.entries()].map(([key, value]) => `${key}='${value}'`).join('\n')}\n`;
}

export function decodeAuditAccessToken(token, label = 'access token') {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw fail(AUDIT_SESSION_ERROR_CODES.malformedState, `${label} is not a JWT`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw fail(AUDIT_SESSION_ERROR_CODES.malformedState, `${label} payload is not a JSON object`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  const exp = Number(payload.exp);
  if (!Number.isSafeInteger(exp) || exp <= 0) {
    throw fail(AUDIT_SESSION_ERROR_CODES.malformedState, `${label} has no integer exp claim`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  return payload;
}

export function evaluateAuditAccessToken(token, { nowMs = Date.now(), thresholdSeconds } = {}) {
  const payload = decodeAuditAccessToken(token, 'saved access token');
  const nowSeconds = Math.floor(nowMs / 1000);
  const secondsRemaining = Number(payload.exp) - nowSeconds;
  return {
    subject: typeof payload.sub === 'string' ? payload.sub : null,
    issuedAt: Number.isSafeInteger(Number(payload.iat)) ? Number(payload.iat) : null,
    expiresAt: isoAt(Number(payload.exp) * 1000),
    secondsRemaining,
    expired: secondsRemaining <= 0,
    needsRefresh: secondsRemaining <= Number(thresholdSeconds),
  };
}

export function auditSessionWindow({ startedAtEpoch, configuredValidUntil, issuedAt, nowMs }) {
  const startedAt = Number(
    startedAtEpoch === undefined || startedAtEpoch === null || startedAtEpoch === ''
      ? issuedAt
      : startedAtEpoch,
  );
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0) {
    throw fail(AUDIT_SESSION_ERROR_CODES.malformedState, 'audit session start epoch is invalid', {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  const validUntil = isoAt(startedAt * 1000 + AUDIT_SESSION_WINDOW_MS);
  if (configuredValidUntil && configuredValidUntil !== validUntil) {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.refused,
      'audit session validity window was changed; it must equal the session start plus 90 days',
      { outcome: AUDIT_SESSION_OUTCOMES.refused },
    );
  }
  return {
    startedAtEpoch: startedAt,
    startedAt: isoAt(startedAt * 1000),
    validUntil,
    ended: nowMs >= Date.parse(validUntil),
  };
}

function isInsideRepository(path, repositoryRoot) {
  if (!repositoryRoot) return false;
  const relativePath = relative(resolve(repositoryRoot), path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

export function assertPrivateAuditFile(path, label, { repositoryRoot = REPOSITORY_ROOT } = {}) {
  if (!isAbsolute(String(path || ''))) {
    throw fail(AUDIT_SESSION_ERROR_CODES.refused, `${label} path must be absolute`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  if (isInsideRepository(path, repositoryRoot)) {
    throw fail(AUDIT_SESSION_ERROR_CODES.refused, `${label} must live outside the repository`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw fail(AUDIT_SESSION_ERROR_CODES.refused, `${label} is missing or unreadable`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  if (!stats.isFile()) {
    throw fail(AUDIT_SESSION_ERROR_CODES.refused, `${label} must be a regular file`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  if ((stats.mode & PRIVATE_MODE_MASK) !== 0) {
    throw fail(AUDIT_SESSION_ERROR_CODES.refused, `${label} must not be group/world accessible`, {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  const directory = statSync(dirname(path));
  if (!directory.isDirectory() || (directory.mode & PRIVATE_MODE_MASK) !== 0) {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.refused,
      `${label} directory must not be group/world accessible`,
      { outcome: AUDIT_SESSION_OUTCOMES.refused },
    );
  }
  return stats;
}

export function writePrivateAuditFileAtomic(path, contents) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function readStoredSession(authStatePath) {
  let state;
  try {
    state = JSON.parse(readFileSync(authStatePath, 'utf8'));
  } catch {
    throw fail(AUDIT_SESSION_ERROR_CODES.malformedState, 'auth state is not valid JSON', {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  const origin = Array.isArray(state?.origins)
    ? state.origins.find((entry) => entry?.origin === AUDIT_SESSION_TRUSTED_ORIGIN)
    : null;
  const item = Array.isArray(origin?.localStorage)
    ? origin.localStorage.find((entry) => entry?.name === AUDIT_SESSION_STORAGE_KEY)
    : null;
  if (!item || typeof item.value !== 'string') {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.malformedState,
      'auth state is missing the trusted-origin smarter-poker-auth session',
      { outcome: AUDIT_SESSION_OUTCOMES.refused },
    );
  }
  let session;
  try {
    session = JSON.parse(item.value);
  } catch {
    session = null;
  }
  if (
    !session
    || typeof session !== 'object'
    || typeof session.access_token !== 'string'
    || typeof session.refresh_token !== 'string'
    || session.access_token.length === 0
    || session.refresh_token.length === 0
  ) {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.malformedState,
      'auth state session is missing its access/refresh token pair',
      { outcome: AUDIT_SESSION_OUTCOMES.refused },
    );
  }
  return { state, item, session };
}

export function readAuditSessionAuthStatePath(credentialEnvPath) {
  const values = parseAuditCredentialEnv(readFileSync(resolve(String(credentialEnvPath)), 'utf8'));
  const authState = values.get(AUDIT_SESSION_ENV_KEYS.authState);
  return authState ? resolve(authState) : null;
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function defaultSleep(delayMs) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs));
}

function tryAcquireLock(lockPath) {
  let descriptor;
  try {
    descriptor = openSync(lockPath, 'wx', 0o600);
    writeFileSync(
      descriptor,
      `${JSON.stringify({
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
        owner: 'training-phase6-production-delivery-attestation',
      })}\n`,
    );
    fsyncSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error?.code === 'EEXIST') return null;
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(descriptor);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  };
}

function lockHolderIsGone(lockPath, isProcessAlive) {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8'));
    const pid = Number(parsed?.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    return !isProcessAlive(pid);
  } catch {
    return false;
  }
}

function sanitizedErrorCode(text) {
  try {
    const parsed = JSON.parse(text);
    const candidate = parsed?.error_code ?? parsed?.error ?? parsed?.code;
    return typeof candidate === 'string' && ERROR_CODE_RE.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function requestRefreshedSession({
  fetchFn,
  supabaseUrl,
  publishableKey,
  refreshToken,
  timeoutMs,
}) {
  if (typeof fetchFn !== 'function') {
    throw fail(AUDIT_SESSION_ERROR_CODES.refused, 'audit session refresh requires a fetch transport', {
      outcome: AUDIT_SESSION_OUTCOMES.refused,
    });
  }
  const endpoint = new URL('/auth/v1/token', supabaseUrl);
  endpoint.searchParams.set('grant_type', 'refresh_token');
  const controller = new AbortController();
  const timeoutSentinel = Symbol('audit-session-refresh-timeout');
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutSentinel);
    }, timeoutMs);
  });
  timeout.catch(() => undefined);
  try {
    const response = await Promise.race([
      fetchFn(endpoint.toString(), {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${publishableKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'cache-control': 'no-cache',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }),
      timeout,
    ]);
    const text = await Promise.race([response.text(), timeout]);
    return { status: Number(response.status), text: String(text ?? '') };
  } catch (error) {
    const timedOut = error === timeoutSentinel || error?.name === 'AbortError';
    throw fail(
      AUDIT_SESSION_ERROR_CODES.outcomeUnknown,
      timedOut
        ? `audit session refresh outcome is unknown: no response within ${timeoutMs} ms`
        : 'audit session refresh outcome is unknown: the transport failed before a response was read',
      {
        outcome: AUDIT_SESSION_OUTCOMES.unknown,
        operatorAction:
          'Do not retry blindly: the refresh token may already have rotated server-side. '
          + 'Inspect the credential store, then run the out-of-Git refresher once, deliberately, '
          + 'or re-establish the audit session before starting the attestation again.',
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

function validateSupabaseUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:' || url.username || url.password) {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.refused,
      'audit session refresh requires an absolute HTTPS Supabase URL without credentials',
      { outcome: AUDIT_SESSION_OUTCOMES.refused },
    );
  }
  return url.origin;
}

export async function ensureFreshAuditSession(options = {}) {
  const {
    credentialEnvPath = null,
    authStatePath,
    expectedAuditUserId,
    fetchFn = globalThis.fetch,
    nowMs = () => Date.now(),
    sleep = defaultSleep,
    thresholdSeconds = AUDIT_SESSION_REFRESH_THRESHOLD_SECONDS,
    minimumRunMarginSeconds = AUDIT_SESSION_MINIMUM_RUN_MARGIN_SECONDS,
    timeoutMs = AUDIT_SESSION_REFRESH_TIMEOUT_MS,
    lockAttempts = AUDIT_SESSION_LOCK_ATTEMPTS,
    lockRetryDelayMs = AUDIT_SESSION_LOCK_RETRY_DELAY_MS,
    repositoryRoot = REPOSITORY_ROOT,
    isProcessAlive = defaultIsProcessAlive,
    supabaseUrl: providedSupabaseUrl = null,
    supabasePublishableKey: providedPublishableKey = null,
  } = options;
  const secrets = new Set();
  const remember = (value) => {
    if (typeof value === 'string' && value.length >= 8) secrets.add(value);
  };
  try {
    return await ensureFreshAuditSessionUnredacted({
      credentialEnvPath,
      authStatePath,
      expectedAuditUserId,
      fetchFn,
      nowMs,
      sleep,
      thresholdSeconds,
      minimumRunMarginSeconds,
      timeoutMs,
      lockAttempts,
      lockRetryDelayMs,
      repositoryRoot,
      isProcessAlive,
      providedSupabaseUrl,
      providedPublishableKey,
      remember,
    });
  } catch (error) {
    const known = error instanceof TrainingAuditSessionError;
    const redacted = new TrainingAuditSessionError(
      known ? error.code : AUDIT_SESSION_ERROR_CODES.failed,
      redactAuditSessionMaterial(error?.message || String(error), [...secrets]),
      {
        outcome: known && error.outcome ? error.outcome : AUDIT_SESSION_OUTCOMES.failed,
        auditSession: known ? error.auditSession : null,
        operatorAction: known ? error.operatorAction : null,
      },
    );
    throw redacted;
  }
}

async function ensureFreshAuditSessionUnredacted({
  credentialEnvPath,
  authStatePath,
  expectedAuditUserId,
  fetchFn,
  nowMs,
  sleep,
  thresholdSeconds,
  minimumRunMarginSeconds,
  timeoutMs,
  lockAttempts,
  lockRetryDelayMs,
  repositoryRoot,
  isProcessAlive,
  providedSupabaseUrl,
  providedPublishableKey,
  remember,
}) {
  if (!UUID_V4_RE.test(String(expectedAuditUserId ?? ''))) {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.refused,
      'designated audit account must be a canonical lowercase UUID v4',
      { outcome: AUDIT_SESSION_OUTCOMES.refused },
    );
  }
  const resolvedAuthState = resolve(String(authStatePath ?? ''));
  const startedAtMs = nowMs();
  // Record field names must never contain token/credential/secret-like words:
  // the attestation's evidence scanner rejects such keys regardless of value.
  const base = {
    schemaVersion: 1,
    auditUserId: expectedAuditUserId,
    authStatePath: resolvedAuthState,
    custodyEnvPath: credentialEnvPath ? resolve(String(credentialEnvPath)) : null,
    refreshConfigured: Boolean(credentialEnvPath),
    checkedAt: isoAt(startedAtMs),
  };

  const identityOrThrow = (session, evaluation, label) => {
    if (evaluation.subject !== expectedAuditUserId || session?.user?.id !== expectedAuditUserId) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.identityMismatch,
        `${label} does not belong to the designated audit account`,
        { outcome: AUDIT_SESSION_OUTCOMES.refused },
      );
    }
  };

  if (!credentialEnvPath) {
    if (!existsSync(resolvedAuthState)) {
      throw fail(AUDIT_SESSION_ERROR_CODES.refused, 'auth state is missing', {
        outcome: AUDIT_SESSION_OUTCOMES.refused,
      });
    }
    const { session } = readStoredSession(resolvedAuthState);
    remember(session.access_token);
    remember(session.refresh_token);
    const evaluation = evaluateAuditAccessToken(session.access_token, {
      nowMs: startedAtMs,
      thresholdSeconds: minimumRunMarginSeconds,
    });
    identityOrThrow(session, evaluation, 'saved access token');
    if (evaluation.needsRefresh) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.expiredWithoutRefreshSource,
        `saved access token ${evaluation.expired ? 'expired' : 'expires'} at ${evaluation.expiresAt}, `
          + `inside the ${minimumRunMarginSeconds}-second run margin, and no refresh source is configured`,
        {
          outcome: AUDIT_SESSION_OUTCOMES.refused,
          operatorAction:
            `Set ${AUDIT_SESSION_ENV_KEYS.envFile} to the mode-0600 Phase 6 credential env so the `
            + 'attestation can perform its one bounded startup refresh, or re-establish the audit session.',
        },
      );
    }
    return {
      ...base,
      outcome: AUDIT_SESSION_OUTCOMES.fresh,
      refreshAttempted: false,
      refreshCalls: 0,
      persisted: false,
      sessionExpiresAt: evaluation.expiresAt,
      secondsRemainingAtStart: evaluation.secondsRemaining,
      thresholdSeconds: minimumRunMarginSeconds,
      sessionMode: null,
      sessionStartedAt: null,
      sessionValidUntil: null,
      lock: null,
    };
  }

  const envPath = resolve(String(credentialEnvPath));
  assertPrivateAuditFile(envPath, 'Phase 6 credential env', { repositoryRoot });

  const loadState = (nowValue) => {
    const values = parseAuditCredentialEnv(readFileSync(envPath, 'utf8'));
    const accessToken = values.get(AUDIT_SESSION_ENV_KEYS.accessToken);
    const refreshToken = values.get(AUDIT_SESSION_ENV_KEYS.refreshToken);
    remember(accessToken);
    remember(refreshToken);
    const supabaseUrlValue = values.get(AUDIT_SESSION_ENV_KEYS.supabaseUrl) || providedSupabaseUrl;
    const publishableKey =
      values.get(AUDIT_SESSION_ENV_KEYS.supabasePublishableKey) || providedPublishableKey;
    remember(publishableKey);
    if (!accessToken || !refreshToken) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.malformedState,
        'credential env is missing the audit session token pair',
        { outcome: AUDIT_SESSION_OUTCOMES.refused },
      );
    }
    const envAuditUser = values.get(AUDIT_SESSION_ENV_KEYS.expectedAuditUserId);
    if (envAuditUser !== expectedAuditUserId) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.identityMismatch,
        'credential env names a different audit account than the attestation',
        { outcome: AUDIT_SESSION_OUTCOMES.refused },
      );
    }
    const envAuthState = values.get(AUDIT_SESSION_ENV_KEYS.authState);
    if (!envAuthState || resolve(envAuthState) !== resolvedAuthState) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.refused,
        'credential env names a different auth-state file than the attestation',
        { outcome: AUDIT_SESSION_OUTCOMES.refused },
      );
    }
    if (!supabaseUrlValue || !publishableKey) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.refused,
        'credential env is missing the Supabase URL or publishable key',
        { outcome: AUDIT_SESSION_OUTCOMES.refused },
      );
    }
    const supabaseUrl = validateSupabaseUrl(supabaseUrlValue);
    assertPrivateAuditFile(resolvedAuthState, 'Phase 6 auth state', { repositoryRoot });
    const stored = readStoredSession(resolvedAuthState);
    remember(stored.session.access_token);
    remember(stored.session.refresh_token);
    if (
      stored.session.access_token !== accessToken
      || stored.session.refresh_token !== refreshToken
    ) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.refused,
        'credential env and auth state disagree about the session token pair; '
          + 'a previous refresh may have been interrupted between its two writes',
        {
          outcome: AUDIT_SESSION_OUTCOMES.refused,
          operatorAction: 'Reconcile the credential store deliberately before starting the attestation.',
        },
      );
    }
    const evaluation = evaluateAuditAccessToken(accessToken, { nowMs: nowValue, thresholdSeconds });
    identityOrThrow(stored.session, evaluation, 'saved access token');
    const window = auditSessionWindow({
      startedAtEpoch: values.get(AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch),
      configuredValidUntil: values.get(AUDIT_SESSION_ENV_KEYS.sessionValidUntil),
      issuedAt: evaluation.issuedAt,
      nowMs: nowValue,
    });
    return {
      values,
      accessToken,
      refreshToken,
      supabaseUrl,
      publishableKey,
      stored,
      evaluation,
      window,
    };
  };

  const describe = (loaded, extra) => ({
    ...base,
    sessionExpiresAt: loaded.evaluation.expiresAt,
    secondsRemainingAtStart: loaded.evaluation.secondsRemaining,
    thresholdSeconds,
    sessionMode: loaded.values.get(AUDIT_SESSION_ENV_KEYS.sessionMode) || null,
    sessionStartedAt: loaded.window.startedAt,
    sessionValidUntil: loaded.window.validUntil,
    ...extra,
  });

  let loaded = loadState(startedAtMs);
  if (loaded.window.ended) {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.windowEnded,
      `the 90-day audit session window ended at ${loaded.window.validUntil}; no refresh was attempted`,
      {
        outcome: AUDIT_SESSION_OUTCOMES.refused,
        operatorAction: 'Re-establish the audit session with a fresh sign-in before attesting.',
        auditSession: describe(loaded, {
          outcome: AUDIT_SESSION_OUTCOMES.refused,
          refreshAttempted: false,
          refreshCalls: 0,
          persisted: false,
          lock: null,
        }),
      },
    );
  }
  if (!loaded.evaluation.needsRefresh) {
    return describe(loaded, {
      outcome: AUDIT_SESSION_OUTCOMES.fresh,
      refreshAttempted: false,
      refreshCalls: 0,
      persisted: false,
      lock: null,
    });
  }

  const lockPath = `${envPath}${AUDIT_SESSION_LOCK_SUFFIX}`;
  let release = null;
  let staleLockRemoved = false;
  let attemptsUsed = 0;
  for (let attempt = 1; attempt <= lockAttempts && !release; attempt += 1) {
    attemptsUsed = attempt;
    release = tryAcquireLock(lockPath);
    if (release) break;
    if (!staleLockRemoved && lockHolderIsGone(lockPath, isProcessAlive)) {
      try {
        unlinkSync(lockPath);
      } catch {
        /* another caller removed it first */
      }
      staleLockRemoved = true;
      continue;
    }
    if (attempt < lockAttempts) {
      await sleep(lockRetryDelayMs);
      try {
        loaded = loadState(nowMs());
      } catch (error) {
        if (!(error instanceof TrainingAuditSessionError)) throw error;
        // The holder may be between its two atomic writes; the state it is
        // producing is judged once the lock is free, within the same bound.
        continue;
      }
      if (!loaded.evaluation.needsRefresh) {
        return describe(loaded, {
          outcome: AUDIT_SESSION_OUTCOMES.reusedPersisted,
          refreshAttempted: false,
          refreshCalls: 0,
          persisted: false,
          lock: { path: lockPath, attempts: attempt, staleLockRemoved },
        });
      }
    }
  }
  if (!release) {
    throw fail(
      AUDIT_SESSION_ERROR_CODES.lockHeld,
      `another audit session refresh holds ${lockPath}; refusing to rotate concurrently`,
      {
        outcome: AUDIT_SESSION_OUTCOMES.refused,
        operatorAction:
          'Wait for the other refresh to finish or inspect the lock file; never delete a live lock.',
        auditSession: describe(loaded, {
          outcome: AUDIT_SESSION_OUTCOMES.refused,
          refreshAttempted: false,
          refreshCalls: 0,
          persisted: false,
          lock: { path: lockPath, attempts: attemptsUsed, staleLockRemoved },
        }),
      },
    );
  }

  const lock = { path: lockPath, attempts: attemptsUsed, staleLockRemoved };
  try {
    loaded = loadState(nowMs());
    if (!loaded.evaluation.needsRefresh) {
      return describe(loaded, {
        outcome: AUDIT_SESSION_OUTCOMES.reusedPersisted,
        refreshAttempted: false,
        refreshCalls: 0,
        persisted: false,
        lock,
      });
    }
    const unknownRecord = describe(loaded, {
      outcome: AUDIT_SESSION_OUTCOMES.unknown,
      refreshAttempted: true,
      refreshCalls: 1,
      persisted: false,
      lock,
    });
    let response;
    try {
      response = await requestRefreshedSession({
        fetchFn,
        supabaseUrl: loaded.supabaseUrl,
        publishableKey: loaded.publishableKey,
        refreshToken: loaded.refreshToken,
        timeoutMs,
      });
    } catch (error) {
      if (error instanceof TrainingAuditSessionError) error.auditSession = unknownRecord;
      throw error;
    }
    const failedRecord = { ...unknownRecord, outcome: AUDIT_SESSION_OUTCOMES.failed };
    if (response.status !== 200) {
      const code = sanitizedErrorCode(response.text);
      throw fail(
        AUDIT_SESSION_ERROR_CODES.refreshRejected,
        `audit session refresh was rejected with HTTP ${response.status}${code ? ` (${code})` : ''}; `
          + 'nothing was persisted',
        {
          outcome: AUDIT_SESSION_OUTCOMES.failed,
          auditSession: failedRecord,
          operatorAction: 'Re-establish the audit session with a fresh sign-in before attesting.',
        },
      );
    }
    let payload;
    try {
      payload = JSON.parse(response.text);
    } catch {
      payload = null;
    }
    if (
      !payload
      || typeof payload !== 'object'
      || typeof payload.access_token !== 'string'
      || typeof payload.refresh_token !== 'string'
      || payload.refresh_token.length === 0
      || !payload.user
      || typeof payload.user !== 'object'
    ) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.malformedResponse,
        'audit session refresh returned a malformed token response; nothing was persisted',
        { outcome: AUDIT_SESSION_OUTCOMES.failed, auditSession: failedRecord },
      );
    }
    remember(payload.access_token);
    remember(payload.refresh_token);
    let refreshedPayload;
    try {
      refreshedPayload = decodeAuditAccessToken(payload.access_token, 'refreshed access token');
    } catch (error) {
      throw fail(AUDIT_SESSION_ERROR_CODES.malformedResponse, `${error.message}; nothing was persisted`, {
        outcome: AUDIT_SESSION_OUTCOMES.failed,
        auditSession: failedRecord,
      });
    }
    const refreshedNowSeconds = Math.floor(nowMs() / 1000);
    if (
      refreshedPayload.sub !== expectedAuditUserId
      || payload.user.id !== expectedAuditUserId
    ) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.identityMismatch,
        'refreshed session does not belong to the designated audit account; nothing was persisted',
        { outcome: AUDIT_SESSION_OUTCOMES.failed, auditSession: failedRecord },
      );
    }
    if (Number(refreshedPayload.exp) <= refreshedNowSeconds) {
      throw fail(
        AUDIT_SESSION_ERROR_CODES.malformedResponse,
        'refreshed access token is already expired; nothing was persisted',
        { outcome: AUDIT_SESSION_OUTCOMES.failed, auditSession: failedRecord },
      );
    }
    const expiresIn = Number.isFinite(Number(payload.expires_in))
      ? Number(payload.expires_in)
      : Number(refreshedPayload.exp) - refreshedNowSeconds;
    const session = {
      access_token: payload.access_token,
      token_type: typeof payload.token_type === 'string' ? payload.token_type : 'bearer',
      expires_in: expiresIn,
      expires_at: Number.isFinite(Number(payload.expires_at))
        ? Number(payload.expires_at)
        : refreshedNowSeconds + expiresIn,
      refresh_token: payload.refresh_token,
      user: payload.user,
    };

    const values = new Map(loaded.values);
    values.set(AUDIT_SESSION_ENV_KEYS.accessToken, session.access_token);
    values.set(AUDIT_SESSION_ENV_KEYS.refreshToken, session.refresh_token);
    values.set(AUDIT_SESSION_ENV_KEYS.sessionStartedAtEpoch, String(loaded.window.startedAtEpoch));
    values.set(AUDIT_SESSION_ENV_KEYS.sessionValidUntil, loaded.window.validUntil);
    values.set(AUDIT_SESSION_ENV_KEYS.sessionMode, AUDIT_SESSION_MODE);
    values.set(AUDIT_SESSION_ENV_KEYS.supabaseUrl, loaded.supabaseUrl);
    values.set(AUDIT_SESSION_ENV_KEYS.supabasePublishableKey, loaded.publishableKey);
    values.set(AUDIT_SESSION_ENV_KEYS.envFile, envPath);
    const nextState = loaded.stored.state;
    loaded.stored.item.value = JSON.stringify(session);
    writePrivateAuditFileAtomic(envPath, renderAuditCredentialEnv(values));
    writePrivateAuditFileAtomic(resolvedAuthState, `${JSON.stringify(nextState, null, 2)}\n`);
    assertPrivateAuditFile(envPath, 'Phase 6 credential env', { repositoryRoot });
    assertPrivateAuditFile(resolvedAuthState, 'Phase 6 auth state', { repositoryRoot });

    return {
      ...base,
      outcome: AUDIT_SESSION_OUTCOMES.refreshed,
      refreshAttempted: true,
      refreshCalls: 1,
      persisted: true,
      sessionExpiresAt: isoAt(Number(refreshedPayload.exp) * 1000),
      previousSessionExpiresAt: loaded.evaluation.expiresAt,
      secondsRemainingAtStart: loaded.evaluation.secondsRemaining,
      thresholdSeconds,
      sessionMode: AUDIT_SESSION_MODE,
      sessionStartedAt: loaded.window.startedAt,
      sessionValidUntil: loaded.window.validUntil,
      lock,
    };
  } finally {
    release();
  }
}
