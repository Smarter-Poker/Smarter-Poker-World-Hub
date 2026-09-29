const DEFAULT_REEL_ID_CHUNK_SIZE = 100;

export function normaliseReelIds(reelsOrIds = []) {
  const seen = new Set();
  const ids = [];

  for (const value of reelsOrIds) {
    const id = String(typeof value === 'object' ? value?.id || '' : value || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function normaliseReelAuthorIds(reels = []) {
  return normaliseReelIds(
    reels.map((reel) => (typeof reel === 'object' ? reel?.author_id : null))
  );
}

export function chunkReelIds(reelIds, chunkSize = DEFAULT_REEL_ID_CHUNK_SIZE) {
  const size = Math.max(1, Math.min(500, Math.trunc(Number(chunkSize)) || DEFAULT_REEL_ID_CHUNK_SIZE));
  const ids = normaliseReelIds(reelIds);
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

/**
 * Hydrate reaction and bookmark truth only for Reels currently present in the
 * viewer. This avoids both the PostgREST default-row-cap false negatives and
 * downloading a user's entire interaction history.
 */
export async function loadReelInteractionState(client, userId, reelsOrIds, options = {}) {
  const canonicalIds = normaliseReelIds(reelsOrIds);
  const reactionChunks = chunkReelIds(canonicalIds, options.chunkSize);
  if (!client || !userId || reactionChunks.length === 0) {
    return { liked: {}, disliked: {}, saved: {}, savedTargets: {} };
  }

  const [reactionPages, canonicalSavedRows] = await Promise.all([
    Promise.all(reactionChunks.map((ids) => client
      .from('social_likes')
      .select('post_id,reaction_type')
      .eq('user_id', userId)
      .in('reaction_type', ['like', 'dislike'])
      .in('post_id', ids))),
    typeof options.loadSavedReels === 'function'
      ? options.loadSavedReels(userId, canonicalIds, { signal: options.signal })
      : Promise.resolve([]),
  ]);

  const failedPage = reactionPages.find((page) => page?.error);
  if (failedPage?.error) throw failedPage.error;

  const likedEntries = [];
  const dislikedEntries = [];
  const savedEntries = [];
  const savedTargets = new Map();
  reactionPages.forEach(({ data }) => {
    (data || []).forEach((row) => {
      if (row.reaction_type === 'like') likedEntries.push([row.post_id, true]);
      if (row.reaction_type === 'dislike') dislikedEntries.push([row.post_id, true]);
    });
  });
  const displayedIds = new Set(canonicalIds);
  (Array.isArray(canonicalSavedRows) ? canonicalSavedRows : []).forEach((row) => {
    const canonicalId = String(row?.reel?.id || row?.reel_id || '').trim();
    if (!displayedIds.has(canonicalId)) return;
    savedEntries.push([canonicalId, true]);
    const targets = Array.isArray(row?.saved_target_ids)
      ? row.saved_target_ids
      : [row?.saved_target_id || row?.reel_id];
    if (!savedTargets.has(canonicalId)) savedTargets.set(canonicalId, new Set());
    for (const target of targets.filter(Boolean)) savedTargets.get(canonicalId).add(target);
  });

  return {
    liked: Object.fromEntries(likedEntries),
    disliked: Object.fromEntries(dislikedEntries),
    saved: Object.fromEntries(savedEntries),
    savedTargets: Object.fromEntries(
      [...savedTargets].map(([canonicalId, targets]) => [canonicalId, [...targets]]),
    ),
  };
}

/** Load follow truth only for creators represented by the current Reel page. */
export async function loadReelFollowState(client, userId, authorIds, options = {}) {
  const chunks = chunkReelIds(authorIds, options.chunkSize);
  if (!client || !userId || chunks.length === 0) return {};

  const pages = await Promise.all(chunks.map((ids) => client
    .from('social_follows')
    .select('following_id')
    .eq('follower_id', userId)
    .in('following_id', ids)));
  const failedPage = pages.find((page) => page?.error);
  if (failedPage?.error) throw failedPage.error;

  return Object.fromEntries(
    pages.flatMap(({ data }) => (data || []).map((row) => [row.following_id, true]))
  );
}
