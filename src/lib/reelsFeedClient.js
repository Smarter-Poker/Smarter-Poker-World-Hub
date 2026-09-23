const RETIRED_CACHE_PREFIX = 'sp:reels:poker:';
// Shared availability-freshness contract (7 days, 5 minutes future skew). The
// source of truth is VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS and
// VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS in src/lib/videoLibraryAvailability.js,
// which mirror the installed SQL predicates. These stay literals because tests
// load this module through a data: URL, so it must remain import-free.
// __tests__/video-library-freshness-contract.test.mjs pins them to the shared
// exports; change all of them together or not at all.
const VERIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const LEGACY_TRANSITION_MAX_REMAINING_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TRUSTED_TRANSITION_RECORDS = 1_000;
const POKER_TOPICS = new Set(['poker', 'cash', 'tournament']);
const NATIVE_RIGHTS = new Set(['owned', 'licensed', 'user_authorized']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const YOUTUBE_NOCOOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
// This map is populated only while parsing a successful live API response. It
// is intentionally not serializable: localStorage/cache payloads cannot mint
// transition authority, while shallow UI clones can retain it by exact row ID
// and immutable evidence fields.
const trustedLegacyTransitionById = new Map();

function configuredStorageOrigin() {
  try {
    const parsed = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.port
      || (parsed.pathname && parsed.pathname !== '/')
      || parsed.search
      || parsed.hash
    ) return null;
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

const SUPABASE_STORAGE_ORIGIN = configuredStorageOrigin();

function safeStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function canonicalReelKey(reel) {
  if (!reel || typeof reel !== 'object') return null;
  if (typeof reel.canonical_asset_key === 'string' && reel.canonical_asset_key.trim()) {
    return reel.canonical_asset_key.trim();
  }
  if (typeof reel.youtube_video_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(reel.youtube_video_id)) {
    return `youtube:${reel.youtube_video_id}`;
  }
  if (typeof reel.video_url === 'string' && reel.video_url.trim()) {
    return `url:${reel.video_url.trim()}`;
  }
  return reel.id ? `reel:${reel.id}` : null;
}

function youtubeIdFromUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
    const host = parsed.hostname.toLowerCase();
    let candidate = null;
    if (host === 'youtu.be') {
      candidate = parsed.pathname.split('/').filter(Boolean)[0];
    } else if (YOUTUBE_HOSTS.has(host)) {
      if (parsed.pathname === '/watch') candidate = parsed.searchParams.get('v');
      else if (/^\/(?:embed|shorts|live)\//.test(parsed.pathname)) {
        candidate = parsed.pathname.split('/').filter(Boolean)[1];
      }
    } else if (
      YOUTUBE_NOCOOKIE_HOSTS.has(host)
    ) {
      if (/^\/embed\//.test(parsed.pathname)) {
        candidate = parsed.pathname.split('/').filter(Boolean)[1];
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(candidate || '') ? candidate : null;
  } catch {
    return null;
  }
}

function reelYouTubeId(reel) {
  const stored = String(reel?.youtube_video_id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(stored)) return stored;
  const canonical = String(reel?.canonical_asset_key || '');
  const canonicalMatch = canonical.match(/^youtube:([A-Za-z0-9_-]{11})$/);
  if (canonicalMatch) return canonicalMatch[1];
  return youtubeIdFromUrl(reel?.video_url);
}

function boundedLegacyTransitionExpiry(reel, nowMs = Date.now()) {
  if (reel?.legacy_transition_eligible !== true) return null;
  const expiresAt = Date.parse(reel?.legacy_transition_expires_at || '');
  if (
    !Number.isFinite(expiresAt)
    || expiresAt <= nowMs
    || expiresAt - nowMs > LEGACY_TRANSITION_MAX_REMAINING_MS + MAX_FUTURE_SKEW_MS
  ) return null;
  return expiresAt;
}

function transitionEvidenceKey(reel) {
  const id = String(reel?.id || '');
  return id && id.length <= 128 ? id : null;
}

function rememberServerTransitionEvidence(rows, nowMs = Date.now()) {
  for (const [id, evidence] of trustedLegacyTransitionById) {
    if (evidence.expiresAt <= nowMs) trustedLegacyTransitionById.delete(id);
  }
  for (const reel of Array.isArray(rows) ? rows : []) {
    const id = transitionEvidenceKey(reel);
    const expiresAt = boundedLegacyTransitionExpiry(reel, nowMs);
    const youtubeId = reelYouTubeId(reel);
    if (!id || !expiresAt || !youtubeId) continue;
    trustedLegacyTransitionById.delete(id);
    trustedLegacyTransitionById.set(id, {
      expiresAt,
      expiresText: reel.legacy_transition_expires_at,
      youtubeId,
      canonicalAssetKey: reel.canonical_asset_key,
      videoUrl: reel.video_url,
    });
  }
  while (trustedLegacyTransitionById.size > MAX_TRUSTED_TRANSITION_RECORDS) {
    trustedLegacyTransitionById.delete(trustedLegacyTransitionById.keys().next().value);
  }
}

function hasTrustedLegacyTransition(reel, nowMs = Date.now()) {
  const id = transitionEvidenceKey(reel);
  const evidence = id ? trustedLegacyTransitionById.get(id) : null;
  if (!evidence || evidence.expiresAt <= nowMs) {
    if (id && evidence) trustedLegacyTransitionById.delete(id);
    return false;
  }
  return reel?.legacy_transition_eligible === true
    && reel.legacy_transition_expires_at === evidence.expiresText
    && reelYouTubeId(reel) === evidence.youtubeId
    && reel.canonical_asset_key === evidence.canonicalAssetKey
    && reel.video_url === evidence.videoUrl
    && boundedLegacyTransitionExpiry(reel, nowMs) === evidence.expiresAt;
}

function isTrustedNativeUrl(value, authorId) {
  const author = String(authorId || '').trim();
  if (!UUID_RE.test(author)) return false;
  try {
    const parsed = new URL(value);
    if (!(parsed.protocol === 'https:'
      && SUPABASE_STORAGE_ORIGIN
      && parsed.origin.toLowerCase() === SUPABASE_STORAGE_ORIGIN
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && !parsed.search
      && !parsed.hash
      && parsed.pathname.startsWith('/storage/v1/object/public/'))) return false;
    const objectRef = decodeURIComponent(
      parsed.pathname.slice('/storage/v1/object/public/'.length)
    );
    const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `^(?:social-media/(?:reels|videos)|stories/stories|live-recordings)/${escapedAuthor}/[^/]+$`,
    ).test(objectRef);
  } catch {
    return false;
  }
}

/**
 * Defense-in-depth for stale caches and mid-flight responses. The server is
 * authoritative, but a pre-migration browser cache must never re-introduce a
 * slot/sports/blocked/non-ready row after the API contract changes.
 */
export function isPlayablePokerReel(reel) {
  if (!reel || typeof reel !== 'object') return false;
  if (!reel.id || typeof reel.video_url !== 'string' || !reel.video_url.trim()) return false;
  if (!POKER_TOPICS.has(reel.topic)) return false;
  if (reel.media_status !== 'ready') return false;
  if (['blocked', 'restricted'].includes(reel.rights_status)) return false;
  if (!['youtube_embed', 'native'].includes(reel.playback_type)) return false;
  const youtubeId = reelYouTubeId(reel);
  const trustedLegacyTransition = youtubeId ? hasTrustedLegacyTransition(reel) : false;
  if (youtubeId) {
    const assetCheckedAt = Date.parse(reel.availability_checked_at || '');
    const verdictCheckedAt = Date.parse(reel.last_verified_at || '');
    const assetAge = Date.now() - assetCheckedAt;
    const verdictAge = Date.now() - verdictCheckedAt;
    const freshAsset = reel.availability_status === 'verified'
      && reel.embeddable === true
      && Number.isFinite(assetCheckedAt)
      && assetAge <= VERIFICATION_MAX_AGE_MS
      && assetAge >= -MAX_FUTURE_SKEW_MS;
    const freshVerifier = reel.verification_status === 'resolved'
      && Number.isFinite(verdictCheckedAt)
      && verdictAge <= VERIFICATION_MAX_AGE_MS
      && verdictAge >= -MAX_FUTURE_SKEW_MS;
    if (!freshAsset && !freshVerifier && !trustedLegacyTransition) return false;
  }
  if (reel.playback_type === 'youtube_embed') {
    const urlYouTubeId = reelYouTubeId({ video_url: reel.video_url });
    if (
      !youtubeId
      || urlYouTubeId !== youtubeId
      || !['embed_only', 'owned', 'licensed'].includes(reel.rights_status)
    ) return false;
  } else {
    if (!NATIVE_RIGHTS.has(reel.rights_status) || !isTrustedNativeUrl(reel.video_url, reel.author_id)) {
      return false;
    }
    // Owned/licensed native renditions intentionally retain their source
    // YouTube identity; user uploads cannot claim that provenance.
    if (youtubeId && !['owned', 'licensed'].includes(reel.rights_status)) return false;
    if (!youtubeId && !String(reel.canonical_asset_key || '').startsWith('native:')) return false;
  }
  if (
    youtubeId
    && reel.canonical_asset_key
    && reel.canonical_asset_key !== `youtube:${youtubeId}`
  ) return false;
  const managedLibrary = reel.origin_type === 'video_library'
    || reel.source_type === 'video_library'
    || Boolean(reel.source_asset_id)
    || String(reel.publication_key || '').startsWith('video-library:');
  if (
    managedLibrary
    && !trustedLegacyTransition
    && (reel.availability_status !== 'verified' || reel.embeddable !== true)
  ) return false;
  return Boolean(canonicalReelKey(reel));
}

export function sanitizePokerReels(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(reel => {
    if (!isPlayablePokerReel(reel)) return false;
    const key = canonicalReelKey(reel);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergePokerReels(current, incoming) {
  return sanitizePokerReels([...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]);
}

/**
 * Phase 1 deliberately does not hydrate public Reel eligibility from browser
 * storage: takedowns and rights changes must take effect on the next request.
 * Delete every key from the retired cache family when this module loads so a
 * six-month-old client cannot revive it through a legacy bundle or consume
 * storage indefinitely.
 */
export function retirePokerReelsCache() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const retiredKeys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(RETIRED_CACHE_PREFIX)) retiredKeys.push(key);
    }
    retiredKeys.forEach(key => storage.removeItem(key));
  } catch {
    // Security/quota exceptions leave the cache inert because it is never read.
  }
}

retirePokerReelsCache();

export async function fetchPokerReels({
  limit = 60,
  cursor = null,
  id = null,
  sort = 'recent',
  signal,
  scope = 'default',
  accessToken = null,
} = {}) {
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (cursor) params.set('cursor', cursor);
  if (id) params.set('id', id);
  if (scope === 'library-viewer' || scope === 'library') params.set('scope', 'library');
  if (scope === 'following') params.set('scope', 'following');

  const response = await fetch(`/api/reels/feed?${params.toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const error = new Error(payload?.error || `Reels request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  rememberServerTransitionEvidence(payload.data);
  const rows = sanitizePokerReels(payload.data);
  return { ...payload, data: rows };
}
