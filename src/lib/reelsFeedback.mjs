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
      || reel?.channel_name
      || reel?.author_id
      || reel?.profiles?.id
      || reel?.profiles?.username
      || '',
  ).trim().toLowerCase();
}

export function applyReelFeedbackState(state, action, reel) {
  const normalized = normalizeReelFeedbackAction(action);
  const next = {
    hiddenReelIds: new Set(state?.hiddenReelIds || []),
    watchedReelIds: new Set(state?.watchedReelIds || []),
    hiddenSourceKeys: new Set(state?.hiddenSourceKeys || []),
  };
  if (!normalized || !reel?.id) return next;
  if (normalized === 'already-watched') next.watchedReelIds.add(reel.id);
  if (normalized === 'not-interested' || normalized === 'wrong-category') next.hiddenReelIds.add(reel.id);
  if (normalized === 'hide-source') {
    const source = reelSourceKey(reel);
    if (source) next.hiddenSourceKeys.add(source);
  }
  return next;
}

export function reelMatchesFeedback(reel, state) {
  if (!reel?.id) return false;
  if (state?.hiddenReelIds?.has?.(reel.id)) return true;
  const source = reelSourceKey(reel);
  return Boolean(source && state?.hiddenSourceKeys?.has?.(source));
}
