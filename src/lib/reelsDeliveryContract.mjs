export const REELS_FEED_MODES = Object.freeze([
  Object.freeze({ id: 'for-you', label: 'For You', category: 'for-you', sort: 'popular' }),
  Object.freeze({ id: 'following', label: 'Following', category: 'following', sort: 'recent', requiresAccount: true }),
  Object.freeze({ id: 'latest', label: 'Latest', category: 'for-you', sort: 'recent' }),
  Object.freeze({ id: 'learning', label: 'Learning', category: 'poker', sort: 'recent' }),
  Object.freeze({ id: 'shorts', label: 'Shorts', category: 'for-you', sort: 'recent' }),
]);

export const REELS_MOBILE_BUDGETS = Object.freeze({
  startupMs: 2500,
  maxMountedPlayers: 3,
  maxActiveYouTubeIframes: 1,
  maxActiveNativePlayers: 1,
  maxFeedItemsInMemory: 180,
  maxTelemetryEventsPerSession: 120,
});

const MODE_IDS = new Set(REELS_FEED_MODES.map((mode) => mode.id));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeReelsFeedMode(value, fallback = 'for-you') {
  const mode = String(value || '').trim().toLowerCase();
  return MODE_IDS.has(mode) ? mode : fallback;
}

export function reelsFeedModeForQuery(query = {}) {
  const first = (value) => Array.isArray(value) ? value[0] : value;
  const explicit = normalizeReelsFeedMode(first(query.mode), null);
  if (explicit) return explicit;
  const category = String(first(query.category) || '').toLowerCase();
  const legacy = String(first(query.feed) || '').toLowerCase();
  if (category === 'following' || legacy === 'following') return 'following';
  if (legacy === 'trending') return 'for-you';
  return category === 'poker' ? 'learning' : 'for-you';
}

export function reelsFeedModeContract(value, { signedIn = false } = {}) {
  const requested = normalizeReelsFeedMode(value);
  const mode = REELS_FEED_MODES.find((entry) => entry.id === requested) || REELS_FEED_MODES[0];
  if (mode.requiresAccount && !signedIn) return REELS_FEED_MODES[0];
  return mode;
}

export function boundedReelWindow(rows, activeIndex, radius = 1) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];
  const index = Math.max(0, Math.min(list.length - 1, Number(activeIndex) || 0));
  const safeRadius = Math.max(0, Math.min(2, Number(radius) || 0));
  return list.slice(Math.max(0, index - safeRadius), Math.min(list.length, index + safeRadius + 1));
}

export function restoreReelsPosition(raw, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!raw || typeof raw !== 'object' || !UUID_RE.test(String(raw.reelId || ''))) return 0;
  const index = list.findIndex((row) => row?.id === raw.reelId || row?.source_post_id === raw.reelId);
  return index >= 0 ? index : 0;
}

export function dataSaverEnabled({ connection, persisted } = {}) {
  if (persisted === true || persisted === '1') return true;
  if (persisted === false || persisted === '0') return false;
  return Boolean(connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType));
}

export function capReelsInMemory(rows, activeId, cap = REELS_MOBILE_BUDGETS.maxFeedItemsInMemory) {
  const list = Array.isArray(rows) ? rows : [];
  const boundedCap = Math.max(3, Math.min(REELS_MOBILE_BUDGETS.maxFeedItemsInMemory, Number(cap) || 3));
  if (list.length <= boundedCap) return list;
  const activeIndex = Math.max(0, list.findIndex((row) => row?.id === activeId));
  const before = Math.floor((boundedCap - 1) / 2);
  const start = Math.max(0, Math.min(list.length - boundedCap, activeIndex - before));
  return list.slice(start, start + boundedCap);
}
