const LEGACY_WATCHED_REELS_KEY = 'smarter-reels-watched';
const LEGACY_NOT_INTERESTED_REELS_KEY = 'reels-not-interested';
const WATCHED_REELS_KEY = 'smarter-reels-watched:v2';
const NOT_INTERESTED_REELS_KEY = 'reels-not-interested:v2';
const MAX_WATCHED_REELS = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeWatchedReelIds(value) {
  if (!Array.isArray(value)) return [];
  const newestFirst = [];
  const seen = new Set();
  for (let index = value.length - 1; index >= 0 && newestFirst.length < MAX_WATCHED_REELS; index -= 1) {
    const id = typeof value[index] === 'string' ? value[index].trim() : '';
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    newestFirst.push(id);
  }
  return newestFirst.reverse();
}

function ownerStorageKey(baseKey, ownerId) {
  const owner = typeof ownerId === 'string' && ownerId.trim()
    ? ownerId.trim()
    : 'anonymous';
  return `${baseKey}:${encodeURIComponent(owner)}`;
}

function retireLegacyGlobalKeys() {
  try {
    globalThis.localStorage?.removeItem(LEGACY_WATCHED_REELS_KEY);
    globalThis.localStorage?.removeItem(LEGACY_NOT_INTERESTED_REELS_KEY);
  } catch (error) {
    console.warn('[Reels] Legacy global history could not be retired:', error?.message || error);
  }
}

export function loadWatchedReelIds(ownerId = null) {
  try {
    retireLegacyGlobalKeys();
    const raw = globalThis.localStorage?.getItem(ownerStorageKey(WATCHED_REELS_KEY, ownerId));
    if (!raw) return [];
    return normalizeWatchedReelIds(JSON.parse(raw));
  } catch (error) {
    console.warn('[Reels] Ignoring invalid watched-history storage:', error?.message || error);
    return [];
  }
}

export function persistWatchedReelIds(ids, ownerId = null) {
  const normalized = normalizeWatchedReelIds(ids);
  try {
    retireLegacyGlobalKeys();
    globalThis.localStorage?.setItem(ownerStorageKey(WATCHED_REELS_KEY, ownerId), JSON.stringify(normalized));
  } catch (error) {
    console.warn('[Reels] Watched-history storage unavailable:', error?.message || error);
  }
  return normalized;
}

export function loadNotInterestedReelIds(ownerId = null) {
  try {
    retireLegacyGlobalKeys();
    const raw = globalThis.localStorage?.getItem(ownerStorageKey(NOT_INTERESTED_REELS_KEY, ownerId));
    return new Set(raw ? normalizeWatchedReelIds(JSON.parse(raw)) : []);
  } catch (error) {
    console.warn('[Reels] Ignoring invalid not-interested storage:', error?.message || error);
    return new Set();
  }
}

export function persistNotInterestedReelIds(ids, ownerId = null) {
  const normalized = normalizeWatchedReelIds(ids instanceof Set ? [...ids] : ids);
  try {
    retireLegacyGlobalKeys();
    globalThis.localStorage?.setItem(ownerStorageKey(NOT_INTERESTED_REELS_KEY, ownerId), JSON.stringify(normalized));
  } catch (error) {
    console.warn('[Reels] Not-interested storage unavailable:', error?.message || error);
  }
  return new Set(normalized);
}

export function safeSetReelsLocalStorage(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[Reels] Local storage write unavailable:', error?.message || error);
    return false;
  }
}

export function readReelsSessionFlag(key, expectedValue = '1') {
  try {
    return globalThis.sessionStorage?.getItem(key) === expectedValue;
  } catch (error) {
    console.warn('[Reels] Session storage read unavailable:', error?.message || error);
    return false;
  }
}

export function safeSetReelsSessionStorage(key, value) {
  try {
    globalThis.sessionStorage?.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[Reels] Session storage write unavailable:', error?.message || error);
    return false;
  }
}
