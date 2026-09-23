/**
 * Durable publication hand-off for user-uploaded Poker Reels.
 *
 * Storage upload and database publication are two different network writes.
 * This module records the completed Storage object's URL before the database
 * RPC starts, then keeps that evidence until the RPC confirms both sides of
 * the post <-> Reel lineage. Retrying never uploads another object.
 *
 * There is deliberately no client-side object deletion here. No orphan-cleanup
 * worker is part of this contract, and a timed-out RPC may have committed. The
 * retry-safe publish_user_video_reel RPC is the only recovery boundary.
 */

export const USER_REEL_PUBLICATION_INTENT_VERSION = 1;
export const USER_REEL_PUBLICATION_EVENT = 'sp:user-reel-publication-intent';
export const MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS = 4;
export const USER_REEL_PUBLICATION_RPC_TIMEOUT_MS = 20_000;

const STORAGE_PREFIX = 'sp:user-reel-publication:v1:';
const QUARANTINE_PREFIX = 'sp:user-reel-publication-quarantine:v1:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUARANTINE_RECORDS = 3;
const MAX_QUARANTINE_RAW_CHARS = 16_384;
const LEASE_GRACE_MS = 10_000;
const RETRY_BACKOFF_MS = [5_000, 15_000, 60_000, 5 * 60_000];

function configuredStorageHost() {
  try {
    const parsed = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

const SUPABASE_STORAGE_HOST = configuredStorageHost();

function asErrorMessage(error) {
  if (!error) return 'Reel publication failed without an error response';
  if (typeof error === 'string') return error;
  return error.message || error.details || String(error);
}

function makeId(prefix) {
  try {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch (_) {
    // A sandboxed browser can expose crypto while denying randomUUID.
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emitIntentChange(eventTarget, detail) {
  if (!eventTarget?.dispatchEvent) return;
  try {
    if (typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent(USER_REEL_PUBLICATION_EVENT, { detail }));
      return;
    }
    if (typeof Event === 'function') {
      const event = new Event(USER_REEL_PUBLICATION_EVENT);
      Object.defineProperty(event, 'detail', { value: detail });
      eventTarget.dispatchEvent(event);
    }
  } catch (_) {
    // Persistence is the contract. UI notification is best-effort only.
  }
}

function isOwnedStorageVideoUrl(value, userId) {
  if (typeof value !== 'string' || !value || typeof userId !== 'string' || !userId) return false;
  if (!UUID_PATTERN.test(userId)) return false;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:'
      || !SUPABASE_STORAGE_HOST
      || parsed.hostname.toLowerCase() !== SUPABASE_STORAGE_HOST
      || parsed.port
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) return false;
    const path = decodeURIComponent(parsed.pathname);
    const escapedUser = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `^/storage/v1/object/public/(?:social-media/(?:reels|videos)|stories/stories)/${escapedUser}/[^/]+$`,
    ).test(path);
  } catch (_) {
    return false;
  }
}

function validateIntent(intent, expectedUserId) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    return 'saved publication intent is not an object';
  }
  if (intent.version !== USER_REEL_PUBLICATION_INTENT_VERSION) {
    return 'saved publication intent uses an unsupported version';
  }
  if (typeof intent.id !== 'string' || !intent.id) return 'saved publication intent has no id';
  if (typeof intent.userId !== 'string' || !intent.userId) {
    return 'saved publication intent has no user id';
  }
  if (expectedUserId && intent.userId !== expectedUserId) {
    return 'saved publication intent belongs to a different user';
  }
  if (!isOwnedStorageVideoUrl(intent.videoUrl, intent.userId)) {
    return 'saved publication intent does not reference an owned video object';
  }
  if (intent.caption !== null && typeof intent.caption !== 'string') {
    return 'saved publication caption is invalid';
  }
  if (intent.thumbnailUrl !== null && typeof intent.thumbnailUrl !== 'string') {
    return 'saved publication thumbnail is invalid';
  }
  for (const field of [
    'createdAt',
    'updatedAt',
    'attemptCount',
    'automaticAttemptCount',
    'nextAttemptAt',
    'leaseExpiresAt',
  ]) {
    if (!Number.isFinite(intent[field]) || intent[field] < 0) {
      return `saved publication ${field} is invalid`;
    }
  }
  return null;
}

export function userReelPublicationStorageKey(userId) {
  if (typeof userId !== 'string' || !userId) throw new Error('A user id is required');
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function userReelPublicationQuarantineKey(userId) {
  if (typeof userId !== 'string' || !userId) throw new Error('A user id is required');
  return `${QUARANTINE_PREFIX}${encodeURIComponent(userId)}`;
}

export function assertUserReelRecoveryStorage(storage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new Error('Durable browser storage is unavailable');
  }
  const key = `${STORAGE_PREFIX}probe:${makeId('probe')}`;
  try {
    storage.setItem(key, '1');
    if (storage.getItem(key) !== '1') throw new Error('browser storage did not retain the probe');
    storage.removeItem(key);
  } catch (error) {
    try {
      storage.removeItem(key);
    } catch (cleanupError) {
      console.warn(
        '[ReelRecovery] Storage probe cleanup failed:',
        asErrorMessage(cleanupError),
      );
    }
    throw new Error(`Durable Reel recovery is unavailable: ${asErrorMessage(error)}`);
  }
  return true;
}

export function assertUserReelPublicationSlot(storage, userId) {
  assertUserReelRecoveryStorage(storage);
  const existing = readUserReelPublicationIntent(storage, userId);
  if (existing.status === 'empty') return true;
  if (existing.status === 'pending') {
    throw new Error('Finish publishing your previous uploaded Reel before starting another.');
  }
  throw new Error(
    existing.error
    || 'Saved Reel recovery data needs attention before another upload can start.',
  );
}

export function createUserReelPublicationIntent({
  intentId,
  userId,
  videoUrl,
  caption = null,
  thumbnailUrl = null,
  now = Date.now(),
}) {
  const intent = {
    version: USER_REEL_PUBLICATION_INTENT_VERSION,
    id: intentId || makeId('reel'),
    userId,
    videoUrl,
    caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null,
    thumbnailUrl: typeof thumbnailUrl === 'string' && thumbnailUrl.trim() ? thumbnailUrl.trim() : null,
    topic: 'poker',
    visibility: 'public',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    automaticAttemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
    leaseId: null,
    leaseExpiresAt: 0,
  };
  const invalidReason = validateIntent(intent, userId);
  if (invalidReason) throw new Error(invalidReason);
  return intent;
}

export function readUserReelPublicationIntent(storage, userId) {
  let raw;
  try {
    raw = storage?.getItem?.(userReelPublicationStorageKey(userId));
  } catch (error) {
    return { status: 'unavailable', error: asErrorMessage(error) };
  }
  if (!raw) return { status: 'empty', intent: null };
  let intent;
  try {
    intent = JSON.parse(raw);
  } catch (_) {
    return { status: 'invalid', error: 'Saved Reel recovery data is unreadable', raw };
  }
  const invalidReason = validateIntent(intent, userId);
  if (invalidReason) return { status: 'invalid', error: invalidReason, raw };
  return { status: 'pending', intent };
}

/**
 * Explicitly preserve corrupt/obsolete active data before freeing the upload
 * slot. This is never called automatically: the recovery banner requires a
 * user action, and the bounded quarantine retains evidence for support.
 */
export function quarantineInvalidUserReelPublication(
  storage,
  userId,
  { eventTarget, now = Date.now() } = {},
) {
  const activeKey = userReelPublicationStorageKey(userId);
  const snapshot = readUserReelPublicationIntent(storage, userId);
  if (snapshot.status !== 'invalid') {
    return { status: snapshot.status, intent: snapshot.intent || null };
  }

  const quarantineKey = userReelPublicationQuarantineKey(userId);
  let previous = [];
  try {
    const saved = JSON.parse(storage.getItem(quarantineKey) || '[]');
    if (Array.isArray(saved)) previous = saved.filter((entry) => entry && typeof entry === 'object');
  } catch (_) {
    previous = [];
  }
  const raw = String(snapshot.raw || '');
  const record = {
    capturedAt: now,
    reason: snapshot.error,
    raw: raw.slice(0, MAX_QUARANTINE_RAW_CHARS),
    truncated: raw.length > MAX_QUARANTINE_RAW_CHARS,
  };
  const bounded = [...previous, record].slice(-MAX_QUARANTINE_RECORDS);
  const serialized = JSON.stringify(bounded);
  storage.setItem(quarantineKey, serialized);
  if (storage.getItem(quarantineKey) !== serialized) {
    throw new Error('Could not verify the quarantined Reel recovery evidence');
  }
  storage.removeItem(activeKey);
  emitIntentChange(eventTarget, { action: 'quarantined', userId });
  return { status: 'quarantined', quarantineKey, record };
}

export function persistUserReelPublicationIntent(storage, intent, { eventTarget } = {}) {
  const invalidReason = validateIntent(intent, intent?.userId);
  if (invalidReason) throw new Error(invalidReason);
  const existing = readUserReelPublicationIntent(storage, intent.userId);
  if (existing.status === 'pending' && existing.intent.id !== intent.id) {
    throw new Error('A new publication intent cannot replace an unresolved uploaded Reel.');
  }
  if (existing.status === 'invalid' || existing.status === 'unavailable') {
    throw new Error(existing.error || 'Saved Reel recovery data cannot be replaced safely.');
  }
  storage.setItem(userReelPublicationStorageKey(intent.userId), JSON.stringify(intent));
  emitIntentChange(eventTarget, { action: 'saved', userId: intent.userId, intentId: intent.id });
  return intent;
}

export function updateUserReelPublicationIntent(
  storage,
  userId,
  intentId,
  patch,
  { eventTarget, now = Date.now() } = {},
) {
  const snapshot = readUserReelPublicationIntent(storage, userId);
  if (snapshot.status !== 'pending' || snapshot.intent.id !== intentId) return snapshot;
  const next = {
    ...snapshot.intent,
    ...patch,
    version: snapshot.intent.version,
    id: snapshot.intent.id,
    userId: snapshot.intent.userId,
    videoUrl: snapshot.intent.videoUrl,
    createdAt: snapshot.intent.createdAt,
    updatedAt: now,
  };
  persistUserReelPublicationIntent(storage, next, { eventTarget });
  return { status: 'pending', intent: next };
}

function clearConfirmedIntent(storage, userId, intentId, eventTarget) {
  const latest = readUserReelPublicationIntent(storage, userId);
  if (latest.status !== 'pending' || latest.intent.id !== intentId) return false;
  storage.removeItem(userReelPublicationStorageKey(userId));
  emitIntentChange(eventTarget, { action: 'cleared', userId, intentId });
  return true;
}

function retryDelayFor(attemptCount) {
  return RETRY_BACKOFF_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_BACKOFF_MS.length - 1)];
}

/**
 * Publish one already-uploaded object through the retry-safe database RPC.
 * Automatic attempts are bounded; explicit user retries remain available.
 */
export async function retryUserReelPublication({
  supabase,
  storage,
  userId,
  intentId,
  attemptKind = 'manual',
  now = () => Date.now(),
  eventTarget,
  rpcTimeoutMs = USER_REEL_PUBLICATION_RPC_TIMEOUT_MS,
}) {
  const snapshot = readUserReelPublicationIntent(storage, userId);
  if (snapshot.status !== 'pending') return snapshot;
  if (intentId && snapshot.intent.id !== intentId) {
    return { status: 'superseded', intent: snapshot.intent };
  }
  if (!supabase?.rpc) {
    return { status: 'failed', intent: snapshot.intent, error: 'Reel publisher is unavailable' };
  }

  const currentTime = now();
  const automatic = attemptKind === 'automatic';
  if (
    automatic
    && snapshot.intent.automaticAttemptCount >= MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS
  ) {
    return { status: 'exhausted', intent: snapshot.intent };
  }
  if (automatic && snapshot.intent.nextAttemptAt > currentTime) {
    return { status: 'deferred', intent: snapshot.intent };
  }
  if (snapshot.intent.leaseId && snapshot.intent.leaseExpiresAt > currentTime) {
    return { status: 'busy', intent: snapshot.intent };
  }

  const leaseId = makeId('attempt');
  const attempting = {
    ...snapshot.intent,
    status: 'publishing',
    updatedAt: currentTime,
    attemptCount: snapshot.intent.attemptCount + 1,
    automaticAttemptCount:
      snapshot.intent.automaticAttemptCount + (automatic ? 1 : 0),
    leaseId,
    leaseExpiresAt: currentTime + rpcTimeoutMs + LEASE_GRACE_MS,
  };
  persistUserReelPublicationIntent(storage, attempting, { eventTarget });

  let timeoutId;
  try {
    const rpcPromise = Promise.resolve(
      supabase.rpc('publish_user_video_reel', {
        p_video_url: attempting.videoUrl,
        p_topic: 'poker',
        p_topic_confirmed: true,
        p_caption: attempting.caption,
        p_thumbnail_url: attempting.thumbnailUrl,
        p_visibility: attempting.visibility,
      }),
    );
    const response = await Promise.race([
      rpcPromise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Reel publication response timed out; retry is safe')),
          rpcTimeoutMs,
        );
      }),
    ]);
    if (response?.error) throw response.error;
    const row = Array.isArray(response?.data) ? response.data[0] : response?.data;
    if (!row?.social_post_id || !row?.social_reel_id) {
      throw new Error('Atomic Reel publication returned incomplete lineage');
    }

    clearConfirmedIntent(storage, userId, attempting.id, eventTarget);
    return {
      status: 'published',
      publication: {
        socialPostId: row.social_post_id,
        socialReelId: row.social_reel_id,
      },
    };
  } catch (error) {
    const message = asErrorMessage(error);
    const latest = readUserReelPublicationIntent(storage, userId);
    if (latest.status === 'pending' && latest.intent.id === attempting.id) {
      const failed = {
        ...latest.intent,
        status: 'pending',
        updatedAt: now(),
        nextAttemptAt: now() + retryDelayFor(attempting.attemptCount),
        lastError: message,
        leaseId: null,
        leaseExpiresAt: 0,
      };
      try {
        persistUserReelPublicationIntent(storage, failed, { eventTarget });
        return { status: 'failed', intent: failed, error: message };
      } catch (_) {
        // The pre-attempt record still exists and retains the object URL.
      }
    }
    return { status: 'failed', intent: attempting, error: message };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
