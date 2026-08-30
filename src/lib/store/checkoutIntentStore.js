const STORAGE_KEY = 'smarter-poker-commerce-intents-v1';
const INTENT_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RECORDS = 48;

const memoryRecords = new Map();

function normalizedScope(value) {
  return String(value || 'store')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 24) || 'store';
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
  return JSON.stringify(stableValue({
    version: INTENT_VERSION,
    scope: normalizedScope(scope),
    userId: owner,
    paymentMethod: String(paymentMethod || '').trim().toLowerCase(),
    intent: intent || {},
  }));
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
  return typeof record?.identity === 'string'
    && typeof record?.requestId === 'string'
    && record.requestId.length >= 12
    && record.requestId.length <= 180
    && Number.isFinite(createdAt)
    && createdAt <= now + 5 * 60 * 1000
    && now - createdAt <= ttlMs;
}

function readRecords(storage, now, ttlMs) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (parsed?.version !== INTENT_VERSION || !Array.isArray(parsed.records)) return [];
    return parsed.records.filter((record) => validRecord(record, now, ttlMs));
  } catch (_) {
    return [];
  }
}

function writeRecords(storage, records) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: INTENT_VERSION,
      records: records
        .sort((a, b) => Number(b.lastUsedAt || b.createdAt) - Number(a.lastUsedAt || a.createdAt))
        .slice(0, MAX_RECORDS),
    }));
    return true;
  } catch (_) {
    return false;
  }
}

function createRequestId(scope, requestIdFactory) {
  if (typeof requestIdFactory === 'function') return requestIdFactory(scope);
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (cryptoApi?.randomUUID) return `${normalizedScope(scope)}-${cryptoApi.randomUUID()}`;
  return `${normalizedScope(scope)}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export function getOrCreateCommerceRequestId(options = {}) {
  const now = Number(options.now ?? Date.now());
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const identity = commerceIntentIdentity(options);
  const storage = browserStorage(options.storage);
  const records = readRecords(storage, now, ttlMs);
  const existing = records.find((record) => record.identity === identity);
  if (existing) {
    existing.lastUsedAt = now;
    writeRecords(storage, records);
    memoryRecords.set(identity, existing);
    return existing.requestId;
  }

  const inMemory = memoryRecords.get(identity);
  if (validRecord(inMemory, now, ttlMs)) return inMemory.requestId;

  const record = {
    identity,
    requestId: createRequestId(options.scope, options.requestIdFactory),
    userId: String(options.userId),
    paymentMethod: String(options.paymentMethod || '').trim().toLowerCase(),
    createdAt: now,
    lastUsedAt: now,
  };
  memoryRecords.set(identity, record);
  writeRecords(storage, [record, ...records]);
  return record.requestId;
}

export function clearCommerceRequestId(options = {}) {
  let identity;
  try {
    identity = commerceIntentIdentity(options);
  } catch (_) {
    return;
  }
  memoryRecords.delete(identity);
  const now = Number(options.now ?? Date.now());
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const storage = browserStorage(options.storage);
  const records = readRecords(storage, now, ttlMs)
    .filter((record) => record.identity !== identity);
  writeRecords(storage, records);
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
  if (!owner || !targetId) return;
  const method = paymentMethod ? String(paymentMethod).trim().toLowerCase() : null;
  const matches = record => record.userId === owner
    && record.requestId === targetId
    && (!method || record.paymentMethod === method);
  const currentTime = Number(now ?? Date.now());
  const lifetime = Number(ttlMs || DEFAULT_TTL_MS);
  const targetStorage = browserStorage(storage);
  const retained = readRecords(targetStorage, currentTime, lifetime).filter(record => !matches(record));
  for (const [identity, record] of memoryRecords.entries()) {
    if (matches(record)) memoryRecords.delete(identity);
  }
  writeRecords(targetStorage, retained);
}

export const commerceIntentStorage = {
  key: STORAGE_KEY,
  ttlMs: DEFAULT_TTL_MS,
  maxRecords: MAX_RECORDS,
};
