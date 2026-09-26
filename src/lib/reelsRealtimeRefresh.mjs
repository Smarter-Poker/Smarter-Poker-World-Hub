/**
 * Realtime and revalidation policy shared by the full-screen Reel viewers
 * (/hub/reels and the social Reels overlay).
 *
 * social_reels publishes every row change, including the view, like, comment
 * and share counter bumps that each signed-in viewer's own playback produces.
 * None of those can change what is playable, so they must never reload the
 * feed or swap the mounted player for the loading console. Only a change that
 * can alter playback or eligibility schedules a refresh, and that refresh runs
 * in the background: it merges into the mounted feed without resetting the
 * active Reel, and removes the playing Reel only when it became ineligible.
 */

/** Marker passed to a viewer's loader to request a quiet background refresh. */
export const BACKGROUND_REELS_REFRESH = Object.freeze({ background: true });

/** Debounce for realtime-triggered background refreshes. */
export const REELS_BACKGROUND_REFRESH_DELAY_MS = 400;

/** Upper bound on individually verified Reels per background refresh. */
export const MAX_STALE_REEL_CHECKS = 5;

const POKER_TOPICS = new Set(['poker', 'cash', 'tournament']);
const BLOCKED_RIGHTS = new Set(['blocked', 'restricted']);
const UNAVAILABLE_STATUSES = new Set([400, 404, 410]);

// Raw social_reels columns that decide whether and how a row plays. Counter
// columns (view_count, like_count, comment_count, share_count), captions,
// thumbnails and timestamps are deliberately absent: a change to them alone
// never refreshes a viewer.
export const REEL_PLAYBACK_FIELDS = Object.freeze([
  'video_url',
  'original_youtube_url',
  'youtube_video_id',
  'playback_type',
  'source_type',
  'media_status',
  'is_public',
  'is_deleted',
  'topic',
  'rights_status',
  'origin_type',
  'author_id',
  'source_post_id',
  'source_asset_id',
  'canonical_asset_key',
  'publication_key',
  'legacy_transition_eligible',
  'legacy_transition_expires_at',
]);

function normalised(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return value;
}

function lowered(value) {
  const next = normalised(value);
  return typeof next === 'string' ? next.toLowerCase() : next;
}

function comparableUrl(value) {
  const next = normalised(value);
  if (typeof next !== 'string') return next;
  try {
    return new URL(next).toString();
  } catch {
    return next;
  }
}

function reelKey(reel) {
  return normalised(reel?.canonical_asset_key) || normalised(reel?.video_url) || null;
}

export function reelPlaybackSignature(row) {
  return JSON.stringify(REEL_PLAYBACK_FIELDS.map((field) => normalised(row?.[field])));
}

/**
 * True only when the raw row explicitly states a disqualifying value. A column
 * missing from a realtime payload is never read as a takedown.
 */
export function hasExplicitReelIneligibility(row, { allowPrivate = false } = {}) {
  if (!row || typeof row !== 'object') return false;
  if (row.is_deleted === true) return true;
  if (row.is_public === false && !allowPrivate) return true;
  if (typeof row.media_status === 'string' && row.media_status !== 'ready') return true;
  const topic = lowered(row.topic);
  if (typeof topic === 'string' && !POKER_TOPICS.has(topic)) return true;
  return BLOCKED_RIGHTS.has(lowered(row.rights_status));
}

/** A raw row that could enter a public poker Reel feed. */
export function isListableReelRow(row) {
  if (!row || typeof row !== 'object' || !row.id) return false;
  if (hasExplicitReelIneligibility(row)) return false;
  return row.is_public === true
    && row.media_status === 'ready'
    && POKER_TOPICS.has(lowered(row.topic));
}

/**
 * Compare a raw realtime row with the canonical feed row already mounted. Only
 * columns the feed passes through verbatim are compared, so the server's URL
 * canonicalisation cannot make an unchanged Reel look changed.
 */
export function rawReelPlaybackDiffers(row, reel) {
  if (!row || !reel) return false;
  const differs = (field) => field in row && normalised(row[field]) !== normalised(reel[field]);
  if (differs('author_id') || differs('source_post_id') || differs('publication_key')) return true;
  for (const field of ['source_asset_id', 'youtube_video_id']) {
    if (normalised(row[field]) !== null && normalised(row[field]) !== normalised(reel[field])) return true;
  }
  const rights = lowered(row.rights_status);
  if (rights !== null && rights !== lowered(reel.rights_status)) return true;
  const playback = normalised(row.playback_type);
  const forcedEmbed = reel.playback_type === 'youtube_embed' && reel.rights_status === 'embed_only';
  if (playback !== null && playback !== reel.playback_type && !forcedEmbed) return true;
  if (reel.playback_type === 'native' && 'video_url' in row) {
    return comparableUrl(row.video_url) !== comparableUrl(reel.video_url);
  }
  return false;
}

/**
 * Sequences a viewer's foreground loads and background refreshes over its one
 * latest-request guard. A background refresh never supersedes an unresolved
 * foreground load: it is queued and flushed once that load settles. A new
 * foreground load supersedes any in-flight request and clears the queue.
 */
export function createReelsRefreshCoordinator(guard) {
  if (!guard || typeof guard.begin !== 'function') {
    throw new TypeError('A latest-request guard is required');
  }
  let foreground = null;
  let queued = false;
  return {
    /** Returns the request, or null when a background refresh was queued. */
    begin({ background = false } = {}) {
      if (background && foreground?.isCurrent()) {
        queued = true;
        return null;
      }
      const request = guard.begin({ append: false });
      if (!background) {
        foreground = request;
        queued = false;
      }
      return request;
    },
    /**
     * Settle a request in its finally block. `current` mirrors the guard's
     * finish(); `flushQueued` asks the caller to schedule the queued refresh.
     */
    settle(request) {
      if (!request) return { current: false, flushQueued: false };
      if (foreground === request) foreground = null;
      const current = request.finish();
      const flushQueued = current && queued;
      if (flushQueued) queued = false;
      return { current, flushQueued };
    },
    isForegroundPending() {
      return Boolean(foreground?.isCurrent());
    },
  };
}

/**
 * Classifies social_reels postgres_changes events for one mounted viewer.
 * Returns { refresh, remove }:
 * - refresh: schedule a debounced background refresh.
 * - remove: drop this id from the mounted feed now (fail closed).
 * Counter-only updates return { refresh: false, remove: false }.
 */
export function createReelRealtimeChangeFilter({ maxTracked = 2000 } = {}) {
  const signatures = new Map();
  const limit = Math.max(1, Math.trunc(Number(maxTracked)) || 2000);
  const remember = (id, signature) => {
    signatures.delete(id);
    signatures.set(id, signature);
    if (signatures.size > limit) signatures.delete(signatures.keys().next().value);
  };
  const none = Object.freeze({ refresh: false, remove: false });

  return {
    classify({ eventType, row, stateReel = null } = {}) {
      const id = row?.id;
      if (!id) return none;
      if (eventType === 'DELETE') {
        signatures.delete(id);
        return { refresh: false, remove: Boolean(stateReel) };
      }
      const signature = reelPlaybackSignature(row);
      const previous = signatures.get(id);
      remember(id, signature);
      if (eventType === 'INSERT') {
        return { refresh: !stateReel && isListableReelRow(row), remove: false };
      }
      if (eventType !== 'UPDATE') return none;
      if (stateReel) {
        if (hasExplicitReelIneligibility(row, { allowPrivate: stateReel.is_public === false })) {
          return { refresh: true, remove: true };
        }
        if (previous !== undefined) return { refresh: previous !== signature, remove: false };
        return { refresh: rawReelPlaybackDiffers(row, stateReel), remove: false };
      }
      const changed = previous === undefined || previous !== signature;
      return { refresh: changed && isListableReelRow(row), remove: false };
    },
    forget(id) {
      signatures.delete(id);
    },
    reset() {
      signatures.clear();
    },
  };
}

/**
 * Merge a background refresh into the mounted feed without disturbing the
 * active Reel.
 * - Mounted Reels keep their positions; a Reel whose playback signature is
 *   unchanged keeps its object identity, so nothing re-renders for it.
 * - A mounted Reel missing from the refreshed window is dropped only when it
 *   is listed in removeIds or the window is complete (authoritative).
 * - New Reels are queued immediately after the active Reel.
 * - When the active Reel is dropped, the next surviving Reel becomes active
 *   (the previous one when it was last; the first new Reel when none remain).
 */
export function mergeBackgroundReels({
  current = [],
  incoming = [],
  activeIndex = 0,
  removeIds = [],
  replacements = [],
  windowComplete = false,
} = {}) {
  const mounted = Array.isArray(current) ? current : [];
  const freshById = new Map();
  for (const reel of Array.isArray(incoming) ? incoming : []) {
    if (reel?.id && !freshById.has(reel.id)) freshById.set(reel.id, reel);
  }
  for (const reel of Array.isArray(replacements) ? replacements : []) {
    if (reel?.id) freshById.set(reel.id, reel);
  }
  const drop = new Set(removeIds);
  const index = Number.isInteger(activeIndex) ? activeIndex : 0;
  const activeId = mounted[index]?.id ?? null;
  const mountedIds = new Set(mounted.map((reel) => reel?.id).filter(Boolean));

  const reels = [];
  let activePosition = -1;
  let keptBeforeActive = 0;
  mounted.forEach((reel, position) => {
    if (!reel?.id) return;
    const fresh = drop.has(reel.id) ? null : freshById.get(reel.id);
    if (!fresh && (drop.has(reel.id) || windowComplete)) return;
    if (position < index) keptBeforeActive += 1;
    if (position === index) activePosition = reels.length;
    const keepIdentity = !fresh || reelPlaybackSignature(fresh) === reelPlaybackSignature(reel);
    reels.push(keepIdentity ? reel : { ...reel, ...fresh });
  });

  const seenKeys = new Set(reels.map(reelKey).filter(Boolean));
  const additions = [];
  for (const reel of Array.isArray(incoming) ? incoming : []) {
    if (!reel?.id || mountedIds.has(reel.id) || drop.has(reel.id)) continue;
    const key = reelKey(reel);
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);
    mountedIds.add(reel.id);
    additions.push(reel);
  }

  // A dropped active Reel hands over to the next surviving mounted Reel; new
  // Reels queue behind whichever Reel is now active.
  const insertAt = activePosition >= 0
    ? activePosition + 1
    : Math.min(keptBeforeActive + 1, reels.length);
  reels.splice(insertAt, 0, ...additions);

  const nextActiveIndex = activePosition >= 0
    ? activePosition
    : reels.length
      ? Math.min(keptBeforeActive, reels.length - 1)
      : 0;
  const changed = reels.length !== mounted.length || reels.some((reel, position) => reel !== mounted[position]);
  return {
    reels: changed ? reels : mounted,
    activeIndex: changed ? nextActiveIndex : index,
    activeRemoved: activeId !== null && activePosition < 0,
    additions,
    changed,
  };
}

/**
 * Re-check mounted Reels a realtime event flagged but the refreshed window did
 * not return. Each id is read through the canonical feed service; a 400, 404
 * or 410 (or a response without that Reel) is a removal verdict, any other
 * failure keeps the mounted row because it is not a verdict.
 */
export async function resolveStaleReels({ ids = [], fetchDetail, isCurrent = () => true, max = MAX_STALE_REEL_CHECKS } = {}) {
  if (typeof fetchDetail !== 'function') throw new TypeError('fetchDetail is required');
  const replacements = [];
  const removeIds = [];
  const unique = [...new Set(ids)].filter(Boolean).slice(0, Math.max(0, Math.trunc(Number(max)) || 0));
  for (const id of unique) {
    try {
      const rows = await fetchDetail(id);
      const row = (Array.isArray(rows) ? rows : []).find((reel) => reel?.id === id);
      if (row) replacements.push(row);
      else removeIds.push(id);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (UNAVAILABLE_STATUSES.has(error?.status)) removeIds.push(id);
    }
    if (!isCurrent()) break;
  }
  return { replacements, removeIds, checkedIds: unique };
}
