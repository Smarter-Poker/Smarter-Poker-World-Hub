/**
 * What /hub/reels and /hub/lives hold, in a form a crawler can read.
 *
 * AEO (2026-09-22). Fetched as OAI-SearchBot with scripts stripped, /hub/reels
 * served 105 words and /hub/lives 113, and every one of them came from the
 * HubPageSummary block. Both pages load their feeds in the browser from
 * Supabase, so ChatGPT, Claude and Perplexity crawlers, which do not run
 * JavaScript, saw a description of a feed and none of the feed.
 *
 * This module is the pure half of the fix: it turns rows the ANONYMOUS
 * Supabase client returned into plain listing items and into JSON-LD. It
 * performs no I/O and imports nothing, so the law in
 * __tests__/the-feeds-say-what-they-hold.law.test.mjs can exercise it with
 * fixture rows. The fetch lives in src/lib/seo/publicFeedData.js.
 *
 * Rules it keeps:
 *   - A row is listed only if it is plainly public: a reel must be
 *     is_public and not deleted; a stream must not be a draft; a recording
 *     must be posted. RLS already applies to the anonymous client; these
 *     checks are a second lock, never a widening.
 *   - Nothing identifies a person. No author or broadcaster ids, no emails,
 *     no names (anonymous visitors cannot read profiles, so neither can this).
 *   - A row with no title or caption is skipped rather than given one.
 *   - Schema is emitted only for nodes that carry every required field.
 */

/** Most rows either page lists on the server. */
export const FEED_LISTING_LIMIT = 24;

/** The longest a server render will wait for the feed before giving up. */
export const FEED_LISTING_TIMEOUT_MS = 2000;

/** A stream still marked live after this long is treated as stale, not live. */
export const LIVE_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

const CAPTION_MAX = 220;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Resolve to the promise's value, or to `fallback` once `ms` has passed.
 * Never rejects: a rejected promise also resolves to `fallback`. The timer is
 * always cleared so a finished race leaves nothing running.
 */
export function withDeadline(promise, ms, fallback = null) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([Promise.resolve(promise).catch(() => fallback), deadline]).finally(() =>
    clearTimeout(timer)
  );
}

function cleanText(value, max = CAPTION_MAX) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function isoOrNull(value) {
  if (!value) return null;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function httpUrlOrNull(value) {
  if (typeof value !== 'string') return null;
  return /^https:\/\//i.test(value.trim()) ? value.trim() : null;
}

/** "Sep 22, 2026" in UTC. Built by hand so server and browser agree exactly. */
export function formatListingDate(iso) {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '';
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`;
}

/** "Sep 22, 2026, 18:05 UTC". */
export function formatListingDateTime(iso) {
  const day = formatListingDate(iso);
  if (!day) return '';
  const t = new Date(iso);
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
}

/**
 * Rows from social_reels → listing items. Only the columns the page needs
 * survive; the author is never carried.
 */
export function toReelListing(rows, limit = FEED_LISTING_LIMIT) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const seenVideo = new Set();
  const items = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (row.is_public !== true || row.is_deleted === true) continue;
    const id = typeof row.id === 'string' ? row.id : '';
    const caption = cleanText(row.caption);
    const createdAt = isoOrNull(row.created_at);
    if (!id || !caption || !createdAt || seen.has(id)) continue;
    // The feed de-duplicates by video as well as by id (a mirrored post can
    // clone a reel under a new id), so the listing does too.
    if (row.video_url && seenVideo.has(row.video_url)) continue;
    seen.add(id);
    if (row.video_url) seenVideo.add(row.video_url);
    items.push({
      id,
      caption,
      createdAt,
      thumbnailUrl: httpUrlOrNull(row.thumbnail_url),
      href: `/hub/reels?id=${encodeURIComponent(id)}`,
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** A category slug ("just_chatting") as a label ("Just Chatting"). */
export function categoryLabel(value) {
  const slug = cleanText(value, 40);
  if (!slug) return null;
  return slug
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function streamItem(row) {
  const id = typeof row.id === 'string' ? row.id : '';
  const title = cleanText(row.title, 140);
  if (!id || !title) return null;
  return {
    id,
    title,
    category: categoryLabel(row.category),
    thumbnailUrl: httpUrlOrNull(row.thumbnail_url),
    href: `/hub/lives?id=${encodeURIComponent(id)}`,
  };
}

/**
 * Rows from live_streams and scheduled_lives → three short lists.
 * `now` is injected so the law can pin time.
 */
export function toLivesListing(
  { live = [], recorded = [], upcoming = [] } = {},
  { now = Date.now(), limit = FEED_LISTING_LIMIT } = {}
) {
  const out = { live: [], recorded: [], upcoming: [] };

  for (const row of Array.isArray(live) ? live : []) {
    if (!row || row.status !== 'live' || row.is_draft === true) continue;
    const startedAt = isoOrNull(row.started_at);
    if (!startedAt || now - new Date(startedAt).getTime() > LIVE_STALE_AFTER_MS) continue;
    const item = streamItem(row);
    if (item) out.live.push({ ...item, startedAt });
    if (out.live.length >= limit) break;
  }

  for (const row of Array.isArray(recorded) ? recorded : []) {
    if (!row || row.status !== 'ended' || row.is_posted !== true || row.is_draft === true) continue;
    if (!row.video_url) continue;
    const startedAt = isoOrNull(row.started_at) || isoOrNull(row.created_at);
    if (!startedAt) continue;
    const item = streamItem(row);
    if (item) out.recorded.push({ ...item, startedAt, createdAt: isoOrNull(row.created_at) });
    if (out.recorded.length >= limit) break;
  }

  for (const row of Array.isArray(upcoming) ? upcoming : []) {
    if (!row) continue;
    const scheduledAt = isoOrNull(row.scheduled_at);
    const title = cleanText(row.title, 140);
    if (!scheduledAt || !title || new Date(scheduledAt).getTime() <= now) continue;
    // A scheduled live has no page of its own, so it carries no link.
    out.upcoming.push({ id: String(row.id || ''), title, scheduledAt });
    if (out.upcoming.length >= limit) break;
  }

  return out;
}

function itemList(name, nodes) {
  if (!nodes.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: nodes.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })),
  };
}

/**
 * ItemList of VideoObject for reels. A reel without a thumbnail is left out
 * of the schema (it is still listed in the HTML): VideoObject requires name,
 * thumbnailUrl and uploadDate, and an incomplete node is worse than none.
 */
export function reelsItemListSchema(items, origin = 'https://smarter.poker') {
  const nodes = (items || [])
    .filter((r) => r && r.caption && r.thumbnailUrl && r.createdAt)
    .map((r) => ({
      '@type': 'VideoObject',
      name: r.caption,
      description: r.caption,
      thumbnailUrl: r.thumbnailUrl,
      uploadDate: r.createdAt,
      url: `${origin}${r.href}`,
    }));
  return itemList('Latest Poker Reels On Smarter Poker', nodes);
}

/**
 * ItemList of VideoObject for streams that are live now (with a BroadcastEvent
 * marking them live) and for posted recordings. Upcoming streams are listed
 * in the HTML only: there is no video yet, so there is no complete node.
 */
export function livesItemListSchema(listing, origin = 'https://smarter.poker') {
  const nodes = [];
  for (const s of listing?.live || []) {
    if (!s.thumbnailUrl || !s.startedAt) continue;
    nodes.push({
      '@type': 'VideoObject',
      name: s.title,
      description: s.title,
      thumbnailUrl: s.thumbnailUrl,
      uploadDate: s.startedAt,
      url: `${origin}${s.href}`,
      publication: { '@type': 'BroadcastEvent', isLiveBroadcast: true, startDate: s.startedAt },
    });
  }
  for (const s of listing?.recorded || []) {
    const uploadDate = s.createdAt || s.startedAt;
    if (!s.thumbnailUrl || !uploadDate) continue;
    nodes.push({
      '@type': 'VideoObject',
      name: s.title,
      description: s.title,
      thumbnailUrl: s.thumbnailUrl,
      uploadDate,
      url: `${origin}${s.href}`,
    });
  }
  return itemList('Poker Live Streams On Smarter Poker', nodes);
}
