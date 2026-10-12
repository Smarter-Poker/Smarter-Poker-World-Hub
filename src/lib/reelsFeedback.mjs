export const REEL_FEEDBACK_ACTIONS = Object.freeze([
  Object.freeze({ id: 'not-interested', label: 'Not Interested', hidesReel: true }),
  Object.freeze({ id: 'already-watched', label: 'Already Watched', marksWatched: true }),
  Object.freeze({ id: 'wrong-category', label: 'Wrong Category', hidesReel: true }),
  Object.freeze({ id: 'hide-source', label: 'Hide Source', hidesSource: true }),
]);

const ACTION_IDS = new Set(REEL_FEEDBACK_ACTIONS.map((action) => action.id));

export function normalizeReelFeedbackAction(value) {
  const action = String(value || '').trim().toLowerCase();
  return ACTION_IDS.has(action) ? action : null;
}

export function reelSourceKey(reel) {
  return String(
    reel?.channel_id
      || reel?.source_id
      || reel?.channel_name
      || reel?.source_name
      || reel?.attribution_name
      || reel?.author_id
      || reel?.profiles?.id
      || reel?.profiles?.username
      || '',
  ).trim().toLowerCase();
}

export function reelAssetKey(reel) {
  return String(reel?.canonical_asset_key || (reel?.youtube_video_id ? `youtube:${reel.youtube_video_id}` : '') || reel?.id || '').trim().slice(0, 256);
}

// Only accumulated real playback counts. Seeking to the end is not completion.
export function classifyReelEngagement({ playedSeconds, duration } = {}) {
  const played = Number(playedSeconds);
  const length = Number(duration);
  if (!Number.isFinite(played) || !Number.isFinite(length) || played <= 0 || length <= 0) return null;
  if (played >= length * 0.9) return 'completed';
  if (played < Math.min(3, length * 0.2)) return 'skipped';
  return null;
}

/** Browser-only ordering of an already qualified window; never changes its cursor. */
export function rankReelsForViewer(rows, state = {}, { activeId = '', chronological = false } = {}) {
  const input = Array.isArray(rows) ? rows : [];
  // Latest and authenticated collections retain the exact authoritative order.
  if (chronological) return input.slice();
  const active = input.find((row) => row?.id === activeId);
  const seen = new Set(active ? [reelAssetKey(active)] : []);
  const tiers = [[], [], []];
  for (const row of input) {
    const asset = reelAssetKey(row);
    if (!row?.id || !asset || row === active || seen.has(asset)) continue;
    seen.add(asset);
    const watched = state.watchedReelIds?.has?.(row.id) || state.watchedAssetKeys?.has?.(asset);
    const skipped = state.skippedAssetKeys?.has?.(asset);
    tiers[skipped ? 2 : watched ? 1 : 0].push(row);
  }
  const output = active ? [active] : [];
  let previousSource = active ? reelSourceKey(active) : '';
  for (const tier of tiers) {
    const groups = new Map();
    for (const row of tier) {
      const key = reelSourceKey(row) || row.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const sources = [...groups.keys()];
    if (sources.length > 1 && sources[0] === previousSource) sources.push(sources.shift());
    while (sources.length) {
      const source = sources.shift();
      const group = groups.get(source);
      output.push(group.shift());
      if (group.length) sources.push(source);
      previousSource = source;
    }
  }
  return output;
}

export function applyReelFeedbackState(state, action, reel) {
  const normalized = normalizeReelFeedbackAction(action);
  const next = {
    hiddenReelIds: new Set(state?.hiddenReelIds || []),
    watchedReelIds: new Set(state?.watchedReelIds || []),
    hiddenSourceKeys: new Set(state?.hiddenSourceKeys || []),
    watchedAssetKeys: new Set(state?.watchedAssetKeys || []),
    skippedAssetKeys: new Set(state?.skippedAssetKeys || []),
  };
  if (!normalized || !reel?.id) return next;
  if (normalized === 'already-watched') {
    next.watchedReelIds.add(reel.id);
    next.watchedAssetKeys.add(reelAssetKey(reel));
  }
  if (normalized === 'not-interested' || normalized === 'wrong-category') next.hiddenReelIds.add(reel.id);
  if (normalized === 'hide-source') {
    const source = reelSourceKey(reel);
    if (source) next.hiddenSourceKeys.add(source);
  }
  return next;
}

export function applyReelEngagementState(state, reel, observation) {
  const next = applyReelFeedbackState(state, null, null);
  const action = classifyReelEngagement(observation);
  const asset = reelAssetKey(reel);
  if (!reel?.id || !asset || !action) return next;
  if (action === 'completed') {
    next.watchedReelIds.add(reel.id);
    next.watchedAssetKeys.add(asset);
    next.skippedAssetKeys.delete(asset);
  } else if (!next.watchedAssetKeys.has(asset)) next.skippedAssetKeys.add(asset);
  return next;
}

export function reelMatchesFeedback(reel, state) {
  if (!reel?.id) return false;
  if (state?.hiddenReelIds?.has?.(reel.id)) return true;
  const source = reelSourceKey(reel);
  return Boolean(source && state?.hiddenSourceKeys?.has?.(source));
}
