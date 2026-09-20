const STORAGE_KEY = 'smarter-poker-commerce-intents-v1';
const INTENT_VERSION = 1;
// Stripe Checkout sessions can remain payable for up to 24 hours. Keep the
// browser's recovery identity longer than the provider session so a late retry
// cannot silently mint a second charge path while the first one is still open.
const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_RECORDS = 48;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{11,127}$/;

function normalizedScope(value) {
  return (
    String(value || 'store')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .slice(0, 80) || 'store'
  );
}

function stableValue(value, seen = new WeakSet()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry, seen));
  if (typeof value !== 'object') return null;
  if (seen.has(value)) throw new TypeError('Commerce intent cannot contain cycles');
  seen.add(value);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (typeof entry === 'undefined' || typeof entry === 'function') continue;
    result[key] = stableValue(entry, seen);
  }
  seen.delete(value);
  return result;
}

export function commerceIntentIdentity({ scope, userId, paymentMethod, intent }) {
  const owner = String(userId || '').trim();
  if (!owner) throw new TypeError('A userId is required for a commerce intent');
  return JSON.stringify(
    stableValue({
      version: INTENT_VERSION,
      scope: normalizedScope(scope),
      userId: owner,
      paymentMethod: String(paymentMethod || '')
        .trim()
        .toLowerCase(),
      intent: intent || {},
    })
  );
}

export function commerceIntentSlotIdentity({ scope, userId, paymentMethod }) {
  const owner = String(userId || '').trim();
  if (!owner) throw new TypeError('A userId is required for a commerce intent');
  return JSON.stringify(
    stableValue({
      version: INTENT_VERSION,
      scope: normalizedScope(scope),
      userId: owner,
      paymentMethod: String(paymentMethod || '')
        .trim()
        .toLowerCase(),
    })
  );
}

function parsedCommerceIntentIdentity(identity) {
  if (typeof identity !== 'string') return null;
  try {
    const parsed = JSON.parse(identity);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      parsed.version !== INTENT_VERSION ||
      typeof parsed.scope !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.paymentMethod !== 'string' ||
      !Object.prototype.hasOwnProperty.call(parsed, 'intent') ||
      commerceIntentIdentity(parsed) !== identity
    )
      return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function recordSlotIdentity(record) {
  const parsed = parsedCommerceIntentIdentity(record?.identity);
  if (!parsed) return null;
  return commerceIntentSlotIdentity(parsed);
}

function browserStorage(storage) {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

function validRecord(record, now, ttlMs) {
  const createdAt = Number(record?.createdAt);
  const parsedIdentity = parsedCommerceIntentIdentity(record?.identity);
  return (
    Boolean(parsedIdentity) &&
    typeof record?.requestId === 'string' &&
    REQUEST_ID_PATTERN.test(record.requestId) &&
    record.userId === parsedIdentity.userId &&
    record.paymentMethod === parsedIdentity.paymentMethod &&
    Number.isFinite(createdAt) &&
    createdAt <= now + 5 * 60 * 1000 &&
    now - createdAt <= ttlMs
  );
}

function readRecordEnvelope(storage, now, ttlMs) {
  if (!storage) return { readable: false, records: [] };
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored == null || stored === '') return { readable: true, records: [] };
    const parsed = JSON.parse(stored);
    if (parsed?.version !== INTENT_VERSION || !Array.isArray(parsed.records)) {
      return { readable: false, records: [] };
    }
    const records = [];
    const identities = new Set();
    const slots = new Set();
    const requestIds = new Set();
    for (const record of parsed.records) {
      const createdAt = Number(record?.createdAt);
      if (Number.isFinite(createdAt) && now - createdAt > ttlMs) continue;
      if (!validRecord(record, now, ttlMs)) return { readable: false, records: [] };
      const slot = recordSlotIdentity(record);
      if (
        !slot ||
        identities.has(record.identity) ||
        slots.has(slot) ||
        requestIds.has(record.requestId)
      )
        return { readable: false, records: [] };
      identities.add(record.identity);
      slots.add(slot);
      requestIds.add(record.requestId);
      records.push(record);
    }
    return { readable: true, records };
  } catch (_) {
    return { readable: false, records: [] };
  }
}

function writeRecords(storage, records) {
  if (!storage) return false;
  if (!Array.isArray(records) || records.length > MAX_RECORDS) return false;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: INTENT_VERSION,
        records: [...records].sort(
          (a, b) => Number(b.lastUsedAt || b.createdAt) - Number(a.lastUsedAt || a.createdAt)
        ),
      })
    );
    return true;
  } catch (_) {
    return false;
  }
}

function createRequestId(scope, requestIdFactory) {
  if (typeof requestIdFactory === 'function') return requestIdFactory(scope);
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  const requestPrefix = normalizedScope(scope).slice(0, 24);
  if (cryptoApi?.randomUUID) return `${requestPrefix}-${cryptoApi.randomUUID()}`;
  return `${requestPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function persistenceUnavailableError() {
  const error = new Error(
    'Secure Purchase Recovery Is Unavailable In This Browser. Enable Local Storage And Try Again.'
  );
  error.code = 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE';
  return error;
}

function unresolvedIntentError() {
  const error = new Error(
    'A Previous Secure Checkout For This Purchase Is Still Recoverable. Resume Or Verify It Before Changing The Purchase.'
  );
  error.code = 'COMMERCE_INTENT_UNRESOLVED';
  return error;
}

function commerceIntentCapacityError() {
  const error = new Error(
    'Secure Purchase Recovery Is Full. Finish Or Verify An Earlier Checkout Before Starting Another.'
  );
  error.code = 'COMMERCE_INTENT_CAPACITY_REACHED';
  return error;
}

function persistAndVerifyRecord(storage, records, record, now, ttlMs) {
  if (!writeRecords(storage, records)) return false;
  const readback = readRecordEnvelope(storage, now, ttlMs);
  if (!readback.readable) return false;
  const matching = readback.records.filter((candidate) => candidate.identity === record.identity);
  const slot = recordSlotIdentity(record);
  const slotMatches = readback.records.filter(
    (candidate) => recordSlotIdentity(candidate) === slot
  );
  return (
    matching.length === 1 &&
    slotMatches.length === 1 &&
    matching[0].requestId === record.requestId &&
    Number(matching[0].createdAt) === Number(record.createdAt)
  );
}

/**
 * Read the protected request bound to one commerce slot without creating,
 * rotating, clearing, or refreshing it. The request identifier is returned
 * only when the caller supplies terms that exactly reproduce the stored
 * identity. A slot-only read can confirm that recovery is protected when the
 * current catalog no longer supplies terms, without exposing stale prices for
 * the client to replay.
 */
export function inspectCommerceRequestRecovery(options = {}) {
  const now = Number(options.now ?? Date.now());
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const slot = commerceIntentSlotIdentity(options);
  const storage = browserStorage(options.storage);
  const envelope = readRecordEnvelope(storage, now, ttlMs);
  if (!envelope.readable) throw persistenceUnavailableError();
  const existing = envelope.records.find((record) => recordSlotIdentity(record) === slot);
  if (!existing) return Object.freeze({ status: 'empty', requestId: null });
  if (!Object.prototype.hasOwnProperty.call(options, 'intent')) {
    return Object.freeze({ status: 'terms-unavailable', requestId: null });
  }
  const identity = commerceIntentIdentity(options);
  if (existing.identity !== identity) {
    return Object.freeze({ status: 'terms-changed', requestId: null });
  }
  return Object.freeze({ status: 'recoverable', requestId: existing.requestId });
}

/**
 * List protected recovery slots for one exact account and payment rail without
 * mutating or refreshing them. This lets a storefront disclose a protected
 * request even when the current catalog no longer contains its item. The
 * request identifier stays private; the caller receives only the stored scope
 * and immutable intent terms needed to route the member to recovery help.
 */
export function listCommerceRequestRecoverySlots(options = {}) {
  const owner = String(options.userId || '').trim();
  const method = String(options.paymentMethod || '')
    .trim()
    .toLowerCase();
  if (!owner || !method) {
    throw new TypeError('A userId and paymentMethod are required for commerce recovery');
  }
  const now = Number(options.now ?? Date.now());
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const storage = browserStorage(options.storage);
  const envelope = readRecordEnvelope(storage, now, ttlMs);
  if (!envelope.readable) throw persistenceUnavailableError();
  const prefix = options.scopePrefix ? normalizedScope(options.scopePrefix) : '';
  const slots = [];
  for (const record of envelope.records) {
    if (record.userId !== owner || record.paymentMethod !== method) continue;
    const parsed = parsedCommerceIntentIdentity(record.identity);
    if (!parsed || (prefix && !parsed.scope.startsWith(prefix))) continue;
    slots.push(
      Object.freeze({
        scope: parsed.scope,
        intent: Object.freeze(stableValue(parsed.intent)),
      })
    );
  }
  return Object.freeze(slots);
}

export function getOrCreateCommerceRequestId(options = {}) {
  const now = Number(options.now ?? Date.now());
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const identity = commerceIntentIdentity(options);
  const slot = commerceIntentSlotIdentity(options);
  const storage = browserStorage(options.storage);
  const envelope = readRecordEnvelope(storage, now, ttlMs);
  if (!envelope.readable) throw persistenceUnavailableError();
  const records = envelope.records;
  const existing = records.find((record) => record.identity === identity);
  if (existing) {
    existing.lastUsedAt = now;
    if (!persistAndVerifyRecord(storage, records, existing, now, ttlMs)) {
      throw persistenceUnavailableError();
    }
    return existing.requestId;
  }
  if (records.some((record) => recordSlotIdentity(record) === slot)) {
    throw unresolvedIntentError();
  }
  if (records.length >= MAX_RECORDS) throw commerceIntentCapacityError();

  const record = {
    identity,
    requestId: createRequestId(options.scope, options.requestIdFactory),
    userId: String(options.userId).trim(),
    paymentMethod: String(options.paymentMethod || '')
      .trim()
      .toLowerCase(),
    createdAt: now,
    lastUsedAt: now,
  };
  if (!validRecord(record, now, ttlMs)) {
    throw new TypeError('The commerce request identifier is invalid');
  }
  if (records.some((candidate) => candidate.requestId === record.requestId)) {
    throw new TypeError('The commerce request identifier is already in use');
  }
  if (!persistAndVerifyRecord(storage, [record, ...records], record, now, ttlMs)) {
    throw persistenceUnavailableError();
  }
  return record.requestId;
}

/**
 * Atomically retire a definitively refused attempt and persist its replacement.
 * A clear-then-create sequence has a crash window and can also return the old
 * key when the clear write fails. One verified storage write keeps the exact
 * intent continuously bound to one recoverable request identity.
 */
export function replaceCommerceRequestId(options = {}) {
  const now = Number(options.now ?? Date.now());
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const identity = commerceIntentIdentity(options);
  const slot = commerceIntentSlotIdentity(options);
  const expectedRequestId = String(options.expectedRequestId || '').trim();
  if (!REQUEST_ID_PATTERN.test(expectedRequestId)) throw unresolvedIntentError();
  const storage = browserStorage(options.storage);
  const envelope = readRecordEnvelope(storage, now, ttlMs);
  if (!envelope.readable) throw persistenceUnavailableError();

  const slotRecords = envelope.records.filter(
    (candidate) => recordSlotIdentity(candidate) === slot
  );
  const previous = slotRecords.find((candidate) => candidate.identity === identity);
  if (!previous || slotRecords.length !== 1 || previous.requestId !== expectedRequestId)
    throw unresolvedIntentError();
  const replacementRequestId = createRequestId(options.scope, options.requestIdFactory);
  if (previous?.requestId === replacementRequestId) {
    throw new TypeError('The replacement commerce request identifier must be new');
  }
  const record = {
    identity,
    requestId: replacementRequestId,
    userId: String(options.userId).trim(),
    paymentMethod: String(options.paymentMethod || '')
      .trim()
      .toLowerCase(),
    createdAt: now,
    lastUsedAt: now,
  };
  if (!validRecord(record, now, ttlMs)) {
    throw new TypeError('The commerce request identifier is invalid');
  }
  const retained = envelope.records.filter((candidate) => candidate.identity !== identity);
  if (retained.some((candidate) => candidate.requestId === record.requestId)) {
    throw new TypeError('The commerce request identifier is already in use');
  }
  if (!persistAndVerifyRecord(storage, [record, ...retained], record, now, ttlMs)) {
    throw persistenceUnavailableError();
  }
  return record.requestId;
}

export function clearCommerceRequestId(options = {}) {
  let identity;
  try {
    identity = commerceIntentIdentity(options);
  } catch (_) {
    return false;
  }
  const expectedRequestId = String(options.expectedRequestId || '').trim();
  if (!REQUEST_ID_PATTERN.test(expectedRequestId)) return false;
  const now = Number(options.now ?? Date.now());
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const storage = browserStorage(options.storage);
  const envelope = readRecordEnvelope(storage, now, ttlMs);
  if (!envelope.readable) return false;
  const matching = envelope.records.filter((record) => record.identity === identity);
  if (matching.length > 1 || (matching.length === 1 && matching[0].requestId !== expectedRequestId))
    return false;
  const records = envelope.records.filter(
    (record) => record.identity !== identity || record.requestId !== expectedRequestId
  );
  if (!writeRecords(storage, records)) return false;
  const readback = readRecordEnvelope(storage, now, ttlMs);
  if (!readback.readable || readback.records.some((record) => record.identity === identity)) {
    return false;
  }
  return true;
}

export function clearCommerceRequestById({
  userId,
  paymentMethod,
  requestId,
  storage,
  now,
  ttlMs,
} = {}) {
  const owner = String(userId || '').trim();
  const targetId = String(requestId || '').trim();
  if (!owner || !REQUEST_ID_PATTERN.test(targetId)) return false;
  const method = paymentMethod ? String(paymentMethod).trim().toLowerCase() : null;
  const matches = (record) =>
    record.userId === owner &&
    record.requestId === targetId &&
    (!method || record.paymentMethod === method);
  const currentTime = Number(now ?? Date.now());
  const lifetime = Number(ttlMs || DEFAULT_TTL_MS);
  const targetStorage = browserStorage(storage);
  const envelope = readRecordEnvelope(targetStorage, currentTime, lifetime);
  if (!envelope.readable) return false;
  const retained = envelope.records.filter((record) => !matches(record));
  if (!writeRecords(targetStorage, retained)) return false;
  const readback = readRecordEnvelope(targetStorage, currentTime, lifetime);
  if (!readback.readable || readback.records.some(matches)) return false;
  return true;
}

export const commerceIntentStorage = {
  key: STORAGE_KEY,
  ttlMs: DEFAULT_TTL_MS,
  maxRecords: MAX_RECORDS,
};
