export const REEL_PUBLICATION_KIND = 'poker_reel';
export const UPLOAD_OBJECT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const LEGACY_UPLOAD_INTENT_STORAGE_KEY = 'sp-bg-upload-intent';
export const UPLOAD_INTENT_QUARANTINE_PREFIX = 'sp-bg-upload-intent-quarantine';

const MAX_QUARANTINED_UPLOAD_BYTES = 32 * 1024;

const UPLOAD_OWNER_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_FOLDER_RE = /^[a-z0-9_-]{1,40}$/i;

export function uploadIntentStorageKey(userId) {
  if (!UPLOAD_OWNER_RE.test(String(userId || ''))) {
    throw new Error('A valid upload owner id is required');
  }
  return `${LEGACY_UPLOAD_INTENT_STORAGE_KEY}:${userId}`;
}

export function uploadIntentQuarantineKey(userId) {
  if (!UPLOAD_OWNER_RE.test(String(userId || ''))) {
    throw new Error('A valid upload owner id is required');
  }
  return `${UPLOAD_INTENT_QUARANTINE_PREFIX}:${userId}`;
}

export function writeUploadIntentForUser(storage, data, { now = Date.now() } = {}) {
  const key = uploadIntentStorageKey(data?.userId);
  const serialized = JSON.stringify({ ...data, timestamp: now });
  storage.setItem(key, serialized);

  // A matching record written by the pre-owner-scoped client is redundant.
  // A foreign or malformed legacy record remains untouched for its owner or
  // support; it must never be silently destroyed during an account switch.
  const legacyRaw = storage.getItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY);
  if (legacyRaw) {
    try {
      if (JSON.parse(legacyRaw)?.userId === data.userId) {
        storage.removeItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY);
      }
    } catch (_) { /* preserve malformed legacy evidence */ }
  }
  return serialized;
}

export function readUploadIntentForUser(storage, userId) {
  const scopedKey = uploadIntentStorageKey(userId);
  let raw = storage.getItem(scopedKey);
  if (!raw) {
    const legacyRaw = storage.getItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const legacyIntent = JSON.parse(legacyRaw);
        if (legacyIntent?.userId === userId) {
          storage.setItem(scopedKey, legacyRaw);
          storage.removeItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY);
          raw = legacyRaw;
        }
      } catch (_) {
        // Hostile legacy data is isolated. The current user is not blocked and
        // the bytes remain available for support instead of being erased.
      }
    }
  }
  return raw ? JSON.parse(raw) : null;
}

export function clearUploadIntentForUser(storage, userId) {
  const scopedKey = uploadIntentStorageKey(userId);
  storage.removeItem(scopedKey);
  const legacyRaw = storage.getItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY);
  if (!legacyRaw) return;
  try {
    if (JSON.parse(legacyRaw)?.userId === userId) {
      storage.removeItem(LEGACY_UPLOAD_INTENT_STORAGE_KEY);
    }
  } catch (_) { /* never erase unparseable recovery evidence implicitly */ }
}

/**
 * Move one invalid active record out of the upload-critical key before it is
 * cleared. The one-record-per-owner quarantine is deliberately bounded so
 * hostile sessionStorage cannot grow without limit or keep blocking uploads.
 */
export function quarantineUploadIntentForUser(
  storage,
  userId,
  { reason = 'invalid-recovery-record', now = Date.now() } = {},
) {
  // Lazily migrate a matching legacy record first. Cross-user and malformed
  // legacy bytes remain isolated exactly as readUploadIntentForUser promises.
  readUploadIntentForUser(storage, userId);
  const activeKey = uploadIntentStorageKey(userId);
  const raw = storage.getItem(activeKey);
  if (!raw) return false;
  const boundedRaw = raw.slice(0, MAX_QUARANTINED_UPLOAD_BYTES);
  storage.setItem(uploadIntentQuarantineKey(userId), JSON.stringify({
    version: 1,
    userId,
    reason: String(reason || 'invalid-recovery-record').slice(0, 200),
    quarantinedAt: now,
    raw: boundedRaw,
    truncated: raw.length > boundedRaw.length,
  }));
  // Never remove the blocking key unless the evidence copy succeeded.
  clearUploadIntentForUser(storage, userId);
  return true;
}

function configuredStorageHost(supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl || '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
    return parsed.hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

export function isOwnedUploadObject(identity, { supabaseUrl } = {}) {
  const {
    publicUrl,
    storagePath,
    bucket,
    userId,
    folder,
  } = identity || {};
  if (
    !UPLOAD_OWNER_RE.test(String(userId || ''))
    || !UPLOAD_FOLDER_RE.test(String(folder || ''))
    || bucket !== 'social-media'
    || typeof storagePath !== 'string'
    || !storagePath.startsWith(`${folder}/${userId}/`)
    || storagePath.slice(`${folder}/${userId}/`.length).includes('/')
  ) return false;
  try {
    const parsed = new URL(publicUrl);
    const expectedHost = configuredStorageHost(supabaseUrl);
    if (
      !expectedHost
      || parsed.protocol !== 'https:'
      || parsed.hostname.toLowerCase() !== expectedHost
      || parsed.port
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) return false;
    return decodeURIComponent(parsed.pathname)
      === `/storage/v1/object/public/${bucket}/${storagePath}`;
  } catch (_) {
    return false;
  }
}

export function validateUploadRecoveryCandidate(
  intent,
  {
    userId,
    supabaseUrl,
    now = Date.now(),
    maxAgeMs = UPLOAD_OBJECT_MAX_AGE_MS,
  } = {},
) {
  if (
    !intent
    || intent.publicationKind !== REEL_PUBLICATION_KIND
    || intent.storageCandidate !== true
  ) return { valid: false, error: 'Upload recovery is not a Poker Reel candidate' };
  if (intent.userId !== userId) {
    return { valid: false, error: 'Upload recovery belongs to another user' };
  }
  const candidateCreatedAt = Number(intent.candidateCreatedAt || intent.timestamp);
  if (
    !Number.isFinite(candidateCreatedAt)
    || candidateCreatedAt <= 0
    || now - candidateCreatedAt > maxAgeMs
    || candidateCreatedAt - now > 5 * 60 * 1000
  ) {
    return { valid: false, error: 'Upload recovery evidence has an invalid timestamp' };
  }
  if (!isOwnedUploadObject(intent, { supabaseUrl })) {
    return { valid: false, error: 'Upload recovery object identity is invalid' };
  }
  return { valid: true, candidateCreatedAt };
}

export async function probeUploadRecoveryCandidate(
  intent,
  {
    userId,
    supabaseUrl,
    fetchImpl = globalThis.fetch,
    now = Date.now(),
    maxAgeMs = UPLOAD_OBJECT_MAX_AGE_MS,
  } = {},
) {
  if (!intent) return { status: 'empty', intent: null };
  const validation = validateUploadRecoveryCandidate(intent, {
    userId,
    supabaseUrl,
    now,
    maxAgeMs,
  });
  if (!validation.valid) return { status: 'invalid', intent, error: validation.error };
  if (intent.storageCommitted) return { status: 'committed', intent };
  if (typeof fetchImpl !== 'function') {
    return { status: 'indeterminate', intent, error: 'Storage recovery probe is unavailable' };
  }

  try {
    const response = await fetchImpl(intent.publicUrl, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (response?.ok) return { status: 'committed', intent };
    if ([404, 410].includes(response?.status)) return { status: 'missing', intent };
    return {
      status: 'indeterminate',
      intent,
      error: `Storage recovery probe returned ${response?.status || 'no status'}`,
    };
  } catch (error) {
    return {
      status: 'indeterminate',
      intent,
      error: error?.message || 'Storage recovery probe failed',
    };
  }
}
