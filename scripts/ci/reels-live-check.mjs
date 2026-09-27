#!/usr/bin/env node
// Finite, read-only verification of the published Reels experience. The probe
// uses the designated test account only for the account-scoped Following
// contract and never likes, follows, comments, saves, shares, uploads, or
// changes profile/account data. Its retained receipt contains counts and
// hashes only; credentials, tokens, captions, URLs, and account data are never
// written to evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const APP_ORIGIN = 'https://smarter.poker';
export const AUTH_ORIGIN = 'https://kuklfnapbkmacvwxktbh.supabase.co';
export const REEL_CATEGORIES = Object.freeze([
  'for-you',
  'poker',
  'casino-slots',
  'sports',
]);
const CATEGORY_TOPICS = Object.freeze({
  'for-you': new Set(['poker', 'cash', 'tournament', 'slots', 'sports']),
  following: new Set(['poker', 'cash', 'tournament', 'slots', 'sports']),
  poker: new Set(['poker', 'cash', 'tournament']),
  'casino-slots': new Set(['slots']),
  sports: new Set(['sports']),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSTGRES_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const PAGE_LIMIT = 20;
const COMPLETE_FEED_LIMIT = 120;
const COMPLETE_FEED_MINIMUM = 2_000;
const MAX_COMPLETE_FEED_PAGES = 50;
const COLLECTION_LIMIT = 100;
const MAX_COLLECTION_PAGES = 10;
export const SOURCE_DIVERSITY_FLOORS = Object.freeze({
  'for-you': 40,
  poker: 20,
  'casino-slots': 5,
  sports: 4,
});
const VERIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const RETIRED_CACHE_KEY = 'sp:reels:poker:v1:production-live-proof';
const ALLOWED_ORIGINS = new Set([
  'user_upload',
  'story',
  'social_post',
  'video_library',
  'horse',
  'pokernews',
  'generated',
  'legacy',
]);
const RESTRICTED_TEXT = Object.freeze([
  /\brequires?\s+(?:a\s+)?subscription\b/i,
  /\b(?:membership|subscription)\s+(?:is\s+)?required\b/i,
  /\bmembers?[-\s]+only\b/i,
  /\b(?:premium|subscriber)[-\s]+only\b/i,
  /\bavailable\s+to\s+(?:this\s+)?channel(?:['’]s)?\s+members\b/i,
  /\bage[-\s]+restricted\b/i,
  /\bconfirm\s+your\s+age\b/i,
  /\bsign\s+in\s+to\s+continue\b/i,
  /\blogin\s+required\b/i,
  /\bsubscribe\s+to\s+(?:watch|view|continue)\b/i,
  /\b(?:this\s+)?video\s+(?:(?:is|was|has\s+been)\s+)?(?:private|unavailable|removed|deleted)\b/i,
  /\b(?:not|isn['’]t)\s+available\s+in\s+(?:your|this)\s+(?:country|region)\b/i,
  /\bembedding\s+(?:is\s+)?disabled\b/i,
  /\bconfirm\s+(?:that\s+)?you(?:['’]re|\s+are)\s+not\s+a\s+bot\b/i,
]);

const SUP07_GROUPS = Object.freeze([
  Object.freeze({
    winner: 'b3258975-db9f-42d5-a581-6c305b180b8f',
    loser: '2cb727a7-aee1-4e33-975c-db31bc587aea',
    post: '7f85c90e-057f-4784-9ff6-39f16c76aa78',
    key: 'native:7726a4055b7753f1b8306349ce6419bd',
  }),
  Object.freeze({
    winner: '0ac10eae-0380-4836-be80-759ce93ee878',
    loser: '46747b18-3e80-4975-abad-09c41e091155',
    post: '5cab43ba-cb10-4043-955f-63415e755e63',
    key: 'native:5bde286bd5cdae63943270adcd7052b5',
  }),
  Object.freeze({
    winner: '8e87782d-dec1-4a54-aab9-1251df417b92',
    loser: '31dc2cba-a031-4b6c-9530-168fe080e118',
    post: '61a5aaa3-0ee7-4003-8af3-c4e64e240078',
    key: 'native:6e9a7279c927086f2807818e63db935f',
  }),
  Object.freeze({
    winner: '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f',
    loser: null,
    post: '14f549d1-8079-436f-8c4e-c42ec0432de5',
    key: 'native:504c25ca805a2d6caf36cba72ae93b92',
  }),
]);

export const SUP07_ALIASES = Object.freeze(SUP07_GROUPS.flatMap((group) => [
  { reference: group.winner, kind: 'winner', ...group },
  ...(group.loser ? [{ reference: group.loser, kind: 'loser', ...group }] : []),
  { reference: group.post, kind: 'post', ...group },
].map(Object.freeze)));

export const REQUIRED_RECEIPT_CHECKS = Object.freeze([
  'Four public categories enforce topic, readiness, rights, attribution, and canonical identity',
  'For You is crawled to a terminal cursor with more than 2,000 unique canonical Reels',
  'Every continuing page is full and every response rejects partial, duplicate, stale, legacy, or restricted content',
  'Topic, origin, source, playback, and rights mixes are retained as sanitized counts',
  'Every public category meets its accepted source-diversity floor',
  'Managed library or horse supply is visible in every public category',
  'Video Library, horse, and social-post supply are visible in the complete public feed',
  'Every horse Reel resolves to its ordinary player profile without exposing an internal horse label',
  'Every Video Library Reel is freshly verified, embeddable, and outside legacy transition',
  'All eleven SUP-07 Reel and post aliases resolve to four canonical winners',
  'Following rejects signed-out access and accepts the designated test account',
  'My Reels and Saved Reels are owner-bound, canonical, complete, private, and non-cacheable',
  'Old loser bookmark canonicalization preserves the requested alias and renders its canonical winner',
  'Retired browser cache is removed before playback',
  'Revoked and expired saved sessions fail closed into reauthentication without mounting private media',
  'A mid-flight category drop retains one mounted player and retry recovers',
  'Casino And Slots displays the responsible-gaming notice with one player',
  'Ordinary social articles still open in the protected in-app reader',
  'My Reels and Saved Reels pages synchronize with their authoritative populated or empty state',
  'Production revision stayed exact for the full verification window',
]);

function fixedFailure(error) {
  return error instanceof assert.AssertionError
    ? error.message.split('\n')[0]
    : 'Live probe could not complete; inspect the bounded workflow logs';
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function isFreshTimestamp(value, nowMs = Date.now()) {
  const observed = Date.parse(value || '');
  return Number.isFinite(observed)
    && nowMs - observed <= VERIFICATION_MAX_AGE_MS
    && observed <= nowMs + MAX_FUTURE_SKEW_MS;
}

function hasRestrictedText(row) {
  const searchable = [row?.caption, row?.title, row?.source_name, row?.source_id]
    .filter(value => typeof value === 'string')
    .join(' ');
  return RESTRICTED_TEXT.some(pattern => pattern.test(searchable));
}

export function isNarrowUnknownNativeReel(row) {
  return String(row?.topic || '').toLowerCase() === 'unknown'
    && row?.origin_type === 'social_post'
    && row?.source_type === 'native'
    && row?.playback_type === 'native'
    && row?.rights_status === 'user_authorized'
    && row?.native_processing_requested === false
    && !row?.source_asset_id
    && !row?.publication_key
    && !row?.source_story_id
    && !row?.youtube_video_id
    && UUID.test(String(row?.source_post_id || ''))
    && String(row?.canonical_asset_key || '').startsWith('native:');
}

function countBy(rows, select) {
  return rows.reduce((counts, row) => {
    const value = String(select(row) || 'unknown').trim().toLowerCase() || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function supplyReceipt(rows) {
  const sourceNames = [...new Set(rows.map(row => row.source_name || 'native'))].sort();
  return {
    topics: countBy(rows, row => row.topic),
    origins: countBy(rows, row => row.origin_type),
    sourceTypes: countBy(rows, row => row.source_type),
    playbackTypes: countBy(rows, row => row.playback_type),
    rightsStatuses: countBy(rows, row => row.rights_status),
    uniqueSources: sourceNames.length,
    sourceFingerprint: digest(sourceNames.join('|')),
  };
}

export function validateConfiguration(env) {
  for (const name of [
    'TEST_USER_EMAIL',
    'TEST_USER_PASSWORD',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'REELS_EXPECTED_SHA',
  ]) {
    assert.ok(env[name]?.trim(), `${name} is required; no credential or revision fallback is allowed`);
  }
  assert.equal(
    env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''),
    AUTH_ORIGIN,
    'Unexpected authentication origin',
  );
  assert.match(env.REELS_EXPECTED_SHA, /^[0-9a-f]{40}$/i, 'Expected deployed SHA must be a full commit');
}

export function isBrowserReadOnlyRequest(method, url) {
  const verb = String(method || '').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(verb)) return false;
  const target = new URL(url);
  return target.protocol === 'https:' || target.protocol === 'data:';
}

function isYouTubeAttribution(value, youtubeId) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] === youtubeId;
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
      && parsed.pathname === '/watch'
      && parsed.searchParams.get('v') === youtubeId;
  } catch {
    return false;
  }
}

function isTrustedNativeUrl(value, authorId) {
  if (!POSTGRES_UUID.test(String(authorId || ''))) return false;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.origin !== AUTH_ORIGIN
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.search
      || parsed.hash
      || !parsed.pathname.startsWith('/storage/v1/object/public/')
    ) return false;
    const objectRef = decodeURIComponent(parsed.pathname.slice('/storage/v1/object/public/'.length));
    const escapedAuthor = String(authorId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^(?:social-media/(?:reels|videos)|stories/stories|live-recordings)/${escapedAuthor}/[^/]+$`).test(objectRef);
  } catch {
    return false;
  }
}

export function validateReelRow(row, category, {
  nowMs = Date.now(),
  requirePublic = true,
} = {}) {
  assert.ok(row && typeof row === 'object', 'Reel row is not an object');
  assert.match(String(row.id || ''), UUID, 'Reel identity is invalid');
  assert.match(String(row.author_id || ''), POSTGRES_UUID, 'Reel author identity is invalid');
  if (requirePublic) assert.equal(row.is_public, true, 'Non-public Reel reached the public feed');
  const topic = String(row.topic || '').toLowerCase();
  const narrowUnknown = category === 'for-you' && isNarrowUnknownNativeReel(row);
  assert.ok(CATEGORY_TOPICS[category]?.has(topic) || narrowUnknown, 'Reel escaped its category topic contract');
  assert.equal(row.media_status, 'ready', 'Reel is not ready');
  assert.ok(!['blocked', 'restricted'].includes(row.rights_status), 'Blocked or restricted Reel reached the public feed');
  assert.ok(ALLOWED_ORIGINS.has(row.origin_type), 'Reel origin is not part of the canonical contract');
  assert.ok(['youtube_embed', 'native'].includes(row.playback_type), 'Reel playback type is not supported');
  assert.ok(typeof row.canonical_asset_key === 'string' && row.canonical_asset_key.trim(), 'Reel canonical identity is missing');
  assert.ok(typeof row.video_url === 'string' && row.video_url.startsWith('https://'), 'Reel playback URL is not HTTPS');
  assert.equal(hasRestrictedText(row), false, 'Restricted or subscription-only text reached the public feed');
  assert.equal(row.legacy_transition_eligible, false, 'Legacy-transition Reel reached the canonical public feed');
  if (row.origin_type === 'horse') {
    assert.ok(row.profiles && typeof row.profiles === 'object', 'Horse Reel did not resolve an ordinary player profile');
    assert.equal(row.profiles.id, row.author_id, 'Horse Reel profile disagrees with its player-author identity');
    assert.equal(
      Object.prototype.hasOwnProperty.call(row.profiles, 'is_horse'),
      false,
      'Horse Reel exposed an internal fleet label in the public profile',
    );
  }
  if (row.availability_status != null) {
    assert.equal(row.availability_status, 'verified', 'Unavailable Reel reached the public feed');
  }
  if (row.playback_type === 'youtube_embed') {
    assert.match(String(row.youtube_video_id || ''), YOUTUBE_ID, 'YouTube Reel identity is invalid');
    assert.equal(row.canonical_asset_key, `youtube:${row.youtube_video_id}`, 'YouTube canonical identity disagrees with playback identity');
    assert.ok(['embed_only', 'owned', 'licensed'].includes(row.rights_status), 'YouTube Reel lacks a supported rights contract');
    assert.ok(typeof row.source_name === 'string' && row.source_name.trim(), 'YouTube source name is missing');
    assert.ok(
      isYouTubeAttribution(row.source_attribution_url || row.source_url, row.youtube_video_id),
      'YouTube source attribution is missing or disagrees with playback identity',
    );
    const assetProof = row.availability_status === 'verified'
      && row.embeddable === true
      && isFreshTimestamp(row.availability_checked_at, nowMs);
    const verifierProof = row.verification_status === 'resolved'
      && isFreshTimestamp(row.last_verified_at, nowMs);
    assert.ok(assetProof || verifierProof, 'YouTube Reel lacks fresh positive availability proof');
  } else {
    assert.ok(['owned', 'licensed', 'user_authorized'].includes(row.rights_status), 'Native Reel lacks a supported rights contract');
    assert.ok(isTrustedNativeUrl(row.video_url, row.author_id), 'Native Reel playback is outside verified account storage');
    if (row.youtube_video_id) {
      assert.match(String(row.youtube_video_id), YOUTUBE_ID, 'Native Reel source identity is invalid');
      assert.equal(row.canonical_asset_key, `youtube:${row.youtube_video_id}`, 'Native Reel source identity disagrees with its canonical asset');
    } else {
      assert.ok(row.canonical_asset_key.startsWith('native:'), 'Native Reel canonical identity is invalid');
    }
  }
  if (row.origin_type === 'video_library') {
    assert.equal(row.availability_status, 'verified', 'Unverified library Reel reached the public feed');
    assert.equal(row.embeddable, true, 'Non-embeddable library Reel reached the public feed');
    assert.ok(isFreshTimestamp(row.availability_checked_at, nowMs), 'Stale library Reel reached the public feed');
  }
  return row;
}

function validatePagination(payload, requestedLimit) {
  assert.equal(payload.partial, false, 'Reels API returned a partial page');
  assert.equal(typeof payload.has_more, 'boolean', 'Reels API omitted continuation truth');
  assert.ok(payload.pagination && typeof payload.pagination === 'object', 'Reels API omitted pagination metadata');
  assert.equal(payload.pagination.limit, payload.data.length, 'Pagination row count disagrees with the payload');
  assert.equal(payload.pagination.hasMore, payload.has_more, 'Pagination continuation truth disagrees with the payload');
  assert.equal(payload.pagination.nextCursor ?? null, payload.next_cursor ?? null, 'Pagination cursor disagrees with the payload');
  if (payload.has_more) {
    assert.equal(payload.data.length, requestedLimit, 'Continuing Reels page was shorter than the requested limit');
    assert.ok(typeof payload.next_cursor === 'string' && payload.next_cursor.length > 0, 'Continuation cursor is missing');
  } else {
    assert.equal(payload.next_cursor ?? null, null, 'Terminal Reels page returned a continuation cursor');
  }
}

export function validateFeedPage(
  payload,
  category,
  seenIds = new Set(),
  seenKeys = new Set(),
  { requestedLimit = PAGE_LIMIT, nowMs = Date.now() } = {},
) {
  assert.equal(payload?.success, true, 'Reels feed did not return success');
  assert.equal(payload.category, category, 'Reels feed returned the wrong category');
  assert.ok(Array.isArray(payload.data), 'Reels feed data is not a list');
  assert.ok(payload.data.length <= requestedLimit, 'Reels feed exceeded the requested bound');
  validatePagination(payload, requestedLimit);
  for (const row of payload.data) {
    validateReelRow(row, category, { nowMs });
    assert.ok(!seenIds.has(row.id), 'Reels continuation repeated a Reel id');
    assert.ok(!seenKeys.has(row.canonical_asset_key), 'Reels continuation repeated a canonical asset');
    seenIds.add(row.id);
    seenKeys.add(row.canonical_asset_key);
  }
  return payload.data;
}

export async function crawlCanonicalFeed(readPage, {
  category = 'for-you',
  requestedLimit = COMPLETE_FEED_LIMIT,
  minimumExclusive = COMPLETE_FEED_MINIMUM,
  maxPages = MAX_COMPLETE_FEED_PAGES,
  requireTerminal = true,
  nowMs = Date.now(),
} = {}) {
  assert.equal(typeof readPage, 'function', 'Canonical feed crawler requires a page reader');
  const seenIds = new Set();
  const seenKeys = new Set();
  const seenCursors = new Set();
  const rows = [];
  let cursor = null;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const payload = await readPage(cursor);
    const pageRows = validateFeedPage(payload, category, seenIds, seenKeys, { requestedLimit, nowMs });
    if (pageNumber > 1) assert.ok(pageRows.length > 0, 'Reels continuation returned an empty page');
    rows.push(...pageRows);
    if (!payload.has_more) {
      assert.ok(rows.length > minimumExclusive, `Canonical Reels crawl did not exceed ${minimumExclusive} unique Reels`);
      return {
        rows,
        cursorCount: seenCursors.size,
        pageCount: pageNumber,
        terminal: true,
        mix: supplyReceipt(rows),
      };
    }
    assert.ok(!seenCursors.has(payload.next_cursor), 'Reels continuation repeated a cursor');
    assert.notEqual(payload.next_cursor, cursor, 'Reels continuation did not advance');
    seenCursors.add(payload.next_cursor);
    cursor = payload.next_cursor;
    if (!requireTerminal && pageNumber === maxPages) {
      assert.ok(rows.length > minimumExclusive, `Reels sample did not exceed ${minimumExclusive} unique Reels`);
      return {
        rows,
        cursorCount: seenCursors.size,
        pageCount: pageNumber,
        terminal: false,
        mix: supplyReceipt(rows),
      };
    }
  }
  assert.fail(`Canonical Reels crawl exceeded its ${maxPages}-page safety bound`);
}

export function validateCollectionPage(
  payload,
  collection,
  ownerId,
  seenIds = new Set(),
  seenKeys = new Set(),
  { requestedLimit = COLLECTION_LIMIT, nowMs = Date.now() } = {},
) {
  assert.ok(['mine', 'saved'].includes(collection), 'Unknown Reel collection');
  assert.match(String(ownerId || ''), UUID, 'Collection owner identity is invalid');
  assert.equal(payload?.success, true, `${collection} Reels did not return success`);
  assert.ok(Array.isArray(payload.data), `${collection} Reels data is not a list`);
  assert.ok(payload.data.length <= requestedLimit, `${collection} Reels exceeded the requested bound`);
  validatePagination(payload, requestedLimit);
  for (const item of payload.data) {
    const row = collection === 'saved' ? item?.reel : item;
    if (collection === 'saved') {
      assert.match(String(item?.id || ''), UUID, 'Saved Reel record identity is invalid');
      assert.equal(item.user_id, ownerId, 'Saved Reels response escaped the designated account');
      assert.match(String(item.reel_id || ''), UUID, 'Saved Reel canonical target is invalid');
      assert.equal(item.reel_id, row?.id, 'Saved Reel target did not resolve to its canonical winner');
      assert.ok(Array.isArray(item.saved_target_ids) && item.saved_target_ids.length > 0, 'Saved Reel aliases are missing');
      assert.ok(item.saved_target_ids.every(id => UUID.test(String(id))), 'Saved Reel alias identity is invalid');
      assert.equal(row?.is_public, true, 'Saved collection exposed a non-public Reel');
    } else {
      assert.equal(row?.author_id, ownerId, 'My Reels response escaped the designated account');
    }
    validateReelRow(row, 'for-you', { nowMs, requirePublic: collection === 'saved' });
    assert.ok(!seenIds.has(row.id), `${collection} Reels continuation repeated a Reel id`);
    assert.ok(!seenKeys.has(row.canonical_asset_key), `${collection} Reels continuation repeated a canonical asset`);
    seenIds.add(row.id);
    seenKeys.add(row.canonical_asset_key);
  }
  return payload.data;
}

export async function crawlAccountCollection(readPage, {
  collection,
  ownerId,
  requestedLimit = COLLECTION_LIMIT,
  maxPages = MAX_COLLECTION_PAGES,
  nowMs = Date.now(),
} = {}) {
  assert.equal(typeof readPage, 'function', 'Account collection crawler requires a page reader');
  const seenIds = new Set();
  const seenKeys = new Set();
  const seenCursors = new Set();
  const rows = [];
  let cursor = null;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const payload = await readPage(cursor);
    const pageRows = validateCollectionPage(
      payload,
      collection,
      ownerId,
      seenIds,
      seenKeys,
      { requestedLimit, nowMs },
    );
    if (pageNumber > 1) assert.ok(pageRows.length > 0, `${collection} Reels continuation returned an empty page`);
    rows.push(...pageRows);
    if (!payload.has_more) {
      return {
        rows,
        receipt: {
          pages: pageNumber,
          cursors: seenCursors.size,
          terminal: true,
          records: rows.length,
          uniqueReels: seenIds.size,
          uniqueAssets: seenKeys.size,
          partialPages: 0,
          duplicateIds: 0,
          duplicateAssets: 0,
          ownerBound: true,
          cacheControl: 'private-no-store',
          ownershipProof: rows.length > 0 ? 'row-validated' : 'authoritative-empty',
        },
      };
    }
    assert.ok(!seenCursors.has(payload.next_cursor), `${collection} Reels continuation repeated a cursor`);
    assert.notEqual(payload.next_cursor, cursor, `${collection} Reels continuation did not advance`);
    seenCursors.add(payload.next_cursor);
    cursor = payload.next_cursor;
  }
  assert.fail(`${collection} Reels crawl exceeded its ${maxPages}-page safety bound`);
}

export function selectOrdinaryArticle(posts) {
  return (Array.isArray(posts) ? posts : []).find((post) => {
    if (!['link', 'article'].includes(String(post?.contentType || '').toLowerCase())) return false;
    if (String(post?.metadata?.shared_reel_id || '').trim()) return false;
    if (post.mediaUrls != null && !Array.isArray(post.mediaUrls)) return false;

    const mediaCount = Array.isArray(post.mediaUrls) ? post.mediaUrls.length : 0;
    // PostCard renders a single-media link/article through ArticleCard, but
    // two or more media items enter its gallery branch instead. With no media,
    // the separate ArticleCard branch requires link_url and does not apply the
    // content fallback. Mirror those two render paths exactly so the probe can
    // only select a card that really opens ArticleReaderModal.
    if (mediaCount > 1) return false;
    const contentUrl = String(post.content || '').match(/https?:\/\/[^\s"'<>]+/)?.[0] || null;
    const candidate = post.link_url || (mediaCount === 1 ? contentUrl : null);
    if (!candidate) return false;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
      if (parsed.origin === APP_ORIGIN && parsed.pathname.startsWith('/hub/reels')) return false;
      const hostname = parsed.hostname.toLowerCase();
      // ArticleCard deliberately opens these domains in a new browser tab;
      // they cannot prove that the protected in-app reader still works.
      if ([
        'facebook.com',
        'fb.watch',
        'fb.com',
        'instagram.com',
        'tiktok.com',
        'twitter.com',
        'x.com',
        'threads.net',
      ].some((domain) => hostname.includes(domain))) return false;
      return !/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(hostname);
    } catch {
      return false;
    }
  }) || null;
}

export function selfTest() {
  assert.throws(() => validateConfiguration({}), /TEST_USER_EMAIL/);
  assert.equal(isBrowserReadOnlyRequest('GET', `${APP_ORIGIN}/api/reels/feed`), true);
  assert.equal(isBrowserReadOnlyRequest('POST', `${APP_ORIGIN}/api/reels/feed`), false);
  assert.equal(isBrowserReadOnlyRequest('DELETE', `${APP_ORIGIN}/api/reels/feed`), false);
  const id = '00000000-0000-4000-8000-000000000001';
  const checkedAt = new Date().toISOString();
  const row = {
    id,
    author_id: '00000000-0000-4000-8000-000000000004',
    topic: 'sports',
    media_status: 'ready',
    rights_status: 'embed_only',
    playback_type: 'youtube_embed',
    youtube_video_id: 'dQw4w9WgXcQ',
    canonical_asset_key: 'youtube:dQw4w9WgXcQ',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    source_name: 'Source',
    source_attribution_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    origin_type: 'video_library',
    is_public: true,
    availability_status: 'verified',
    embeddable: true,
    availability_checked_at: checkedAt,
    verification_status: 'resolved',
    last_verified_at: checkedAt,
    legacy_transition_eligible: false,
  };
  const page = (data, category = 'sports', overrides = {}) => ({
    success: true,
    category,
    data,
    has_more: false,
    next_cursor: null,
    partial: false,
    pagination: { limit: data.length, hasMore: false, nextCursor: null },
    ...overrides,
  });
  validateFeedPage(page([row]), 'sports');
  assert.throws(
    () => validateFeedPage(page([row], 'poker'), 'poker'),
    /category topic contract/,
  );
  assert.throws(
    () => validateFeedPage(page([row, row]), 'sports'),
    /repeated a Reel id/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, availability_status: 'restricted' }]), 'sports'),
    /Unavailable Reel/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, caption: 'Subscription required' }]), 'sports'),
    /subscription-only text/,
  );
  assert.throws(
    () => validateFeedPage(page([row], 'sports', { partial: true }), 'sports'),
    /partial page/,
  );
  const unknownNative = {
    ...row,
    id: '00000000-0000-4000-8000-000000000002',
    author_id: '00000000-0000-4000-8000-000000000004',
    topic: 'unknown',
    origin_type: 'social_post',
    source_type: 'native',
    playback_type: 'native',
    rights_status: 'user_authorized',
    native_processing_requested: false,
    source_asset_id: null,
    publication_key: null,
    source_story_id: null,
    youtube_video_id: null,
    source_post_id: '00000000-0000-4000-8000-000000000003',
    canonical_asset_key: 'native:self-test',
    video_url: 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/00000000-0000-4000-8000-000000000004/test.mp4',
    source_name: null,
    source_attribution_url: null,
    availability_status: null,
    embeddable: null,
    availability_checked_at: null,
  };
  validateFeedPage(page([unknownNative], 'for-you'), 'for-you');
  assert.throws(
    () => validateFeedPage(page([{ ...unknownNative, publication_key: 'forged' }], 'for-you'), 'for-you'),
    /category topic contract/,
  );
  assert.equal(SUP07_ALIASES.length, 11, 'SUP-07 live alias inventory drifted');
  assert.equal(selectOrdinaryArticle([{ id, contentType: 'article', mediaUrls: [], link_url: 'https://example.com/story' }])?.id, id);
  assert.equal(selectOrdinaryArticle([{
    id,
    contentType: 'link',
    mediaUrls: ['https://media.poker.org/story.jpg'],
    link_url: null,
    content: 'Read the full story at https://www.poker.org/latest-news/story',
  }])?.id, id);
  assert.equal(selectOrdinaryArticle([{
    id,
    contentType: 'link',
    mediaUrls: [],
    link_url: null,
    content: 'Content-only https://example.com/story',
  }]), null);
  assert.equal(selectOrdinaryArticle([{
    id,
    contentType: 'article',
    mediaUrls: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
    link_url: 'https://example.com/story',
  }]), null);
  assert.equal(selectOrdinaryArticle([{
    id,
    contentType: 'link',
    mediaUrls: [],
    link_url: 'https://example.com/story',
    metadata: { shared_reel_id: id },
  }]), null);
  assert.equal(selectOrdinaryArticle([{
    id,
    contentType: 'article',
    mediaUrls: [],
    link_url: 'https://www.instagram.com/p/story',
  }]), null);
  assert.equal(selectOrdinaryArticle([{ id, contentType: 'link', mediaUrls: [], link_url: `${APP_ORIGIN}/hub/reels?id=${id}` }]), null);
  console.log('Reels live verifier safety checks passed');
}

async function readJson(path, {
  token = null,
  expectedStatus = 200,
  expectedCache = /no-store/i,
  requireAuthorizationVary = false,
} = {}) {
  const response = await fetch(`${APP_ORIGIN}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  assert.equal(response.status, expectedStatus, `Unexpected HTTP status for ${new URL(path, APP_ORIGIN).pathname}`);
  assert.match(response.headers.get('cache-control') || '', expectedCache, 'Live API response is cacheable');
  if (requireAuthorizationVary) {
    assert.match(response.headers.get('vary') || '', /(?:^|,)\s*Authorization\s*(?:,|$)/i, 'Private API response omitted Authorization from Vary');
  }
  return response.json();
}

async function assertHealth(expectedSha) {
  const response = await fetch(`${APP_ORIGIN}/api/health`, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const health = await response.json();
  assert.ok(response.ok && health.status === 'ok', 'Production health is not healthy');
  assert.equal(health.commitSha, expectedSha, 'Live revision differs from expected protected revision');
  return health;
}

async function collectCategory(category) {
  const complete = category === 'for-you';
  const requestedLimit = complete ? COMPLETE_FEED_LIMIT : PAGE_LIMIT;
  const requestedPages = complete ? MAX_COMPLETE_FEED_PAGES : 3;
  const collection = await crawlCanonicalFeed(async (cursor) => {
    const params = new URLSearchParams({
      category,
      scope: 'all',
      limit: String(requestedLimit),
      sort: 'recent',
    });
    if (cursor) params.set('cursor', cursor);
    return readJson(`/api/reels/feed?${params.toString()}`);
  }, {
    category,
    requestedLimit,
    minimumExclusive: complete ? COMPLETE_FEED_MINIMUM : 0,
    maxPages: requestedPages,
    requireTerminal: complete,
  });
  const { rows } = collection;
  const managed = rows.filter((row) => ['video_library', 'horse'].includes(row.origin_type));
  const horseRows = rows.filter((row) => row.origin_type === 'horse');
  const horseAuthors = new Set(horseRows.map((row) => row.author_id));
  const sourceFloor = SOURCE_DIVERSITY_FLOORS[category];
  assert.ok(managed.length > 0, `${category} did not expose managed library or horse supply`);
  assert.ok(
    collection.mix.uniqueSources >= sourceFloor,
    `${category} exposed fewer than ${sourceFloor} independent sources`,
  );
  assert.match(collection.mix.sourceFingerprint, /^[0-9a-f]{16}$/, `${category} source fingerprint is invalid`);
  if (complete) {
    assert.ok(rows.some(row => row.origin_type === 'video_library'), 'Complete For You crawl has no Video Library supply');
    assert.ok(rows.some(row => row.origin_type === 'horse'), 'Complete For You crawl has no horse supply');
    assert.ok(rows.some(row => row.origin_type === 'social_post'), 'Complete For You crawl has no social-post supply');
    assert.ok(rows.some(row => row.topic === 'sports'), 'Complete For You crawl has no Sports supply');
    assert.ok(rows.some(row => row.topic === 'slots'), 'Complete For You crawl has no Casino And Slots supply');
    assert.ok(rows.some(row => ['poker', 'cash', 'tournament'].includes(row.topic)), 'Complete For You crawl has no Poker supply');
  }
  return {
    firstId: rows[0].id,
    rows,
    receipt: {
      pages: collection.pageCount,
      cursors: collection.cursorCount,
      terminal: collection.terminal,
      reels: rows.length,
      uniqueIds: rows.length,
      uniqueAssets: rows.length,
      partialPages: 0,
      duplicateIds: 0,
      duplicateAssets: 0,
      restrictedTextMatches: 0,
      managed: managed.length,
      library: rows.filter((row) => row.origin_type === 'video_library').length,
      horse: rows.filter((row) => row.origin_type === 'horse').length,
      socialPost: rows.filter((row) => row.origin_type === 'social_post').length,
      unknownNative: rows.filter((row) => row.topic === 'unknown').length,
      horseAuthorProfiles: {
        reels: horseRows.length,
        resolvedProfiles: horseRows.length,
        uniqueAuthors: horseAuthors.size,
        mismatches: 0,
        internalLabelsExposed: 0,
      },
      mix: collection.mix,
    },
  };
}

async function verifySup07Aliases() {
  for (const alias of SUP07_ALIASES) {
    const params = new URLSearchParams({
      category: 'for-you',
      scope: 'all',
      sort: 'recent',
      limit: '1',
      id: alias.reference,
    });
    const payload = await readJson(`/api/reels/feed?${params.toString()}`);
    const rows = validateFeedPage(payload, 'for-you', new Set(), new Set(), { requestedLimit: 1 });
    assert.equal(rows.length, 1, 'SUP-07 bookmark alias did not resolve exactly one canonical Reel');
    assert.equal(rows[0].id, alias.winner, 'SUP-07 bookmark alias resolved the wrong canonical winner');
    assert.equal(rows[0].source_post_id, alias.post, 'SUP-07 bookmark alias lost its source post');
    assert.equal(rows[0].canonical_asset_key, alias.key, 'SUP-07 bookmark alias resolved the wrong canonical asset');
  }
  return {
    checked: SUP07_ALIASES.length,
    groups: SUP07_GROUPS.length,
    winners: SUP07_GROUPS.length,
    fingerprint: digest(SUP07_ALIASES.map(alias => `${alias.reference}:${alias.winner}:${alias.key}`).join('|')),
  };
}

async function collectAccountCollection(collection, token, ownerId) {
  return crawlAccountCollection(async (cursor) => {
    const params = new URLSearchParams({ limit: String(COLLECTION_LIMIT) });
    if (cursor) params.set('cursor', cursor);
    return readJson(`/api/reels/${collection}?${params.toString()}`, {
      token,
      expectedCache: /(?=.*\bprivate\b)(?=.*\bno-store\b)/i,
      requireAuthorizationVary: true,
    });
  }, { collection, ownerId });
}

async function findOrdinaryArticle(token) {
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const payload = await readJson(`/api/social/feed?offset=${offset}&limit=50`, { token });
    const article = selectOrdinaryArticle(payload.posts);
    if (article) return article;
    if (payload.hasMore === false) break;
    const next = Number(payload.nextOffset);
    if (!Number.isFinite(next) || next <= offset) break;
    offset = next;
  }
  assert.fail('No ordinary non-Reel article was available for reader verification');
}

function createReadOnlyBrowserState() {
  return {
    blockedMutations: 0,
    blockedMutationClasses: new Set(),
    allowedMutations: 0,
    readOnlyGuardInstalled: false,
    injectedDrops: 0,
    failNextSports: false,
  };
}

function readOnlyGuardReceipt(state) {
  return {
    readOnlyGuardInstalled: state.readOnlyGuardInstalled,
    blockedMutationAttempts: state.blockedMutations,
    blockedMutationClasses: [...state.blockedMutationClasses].sort(),
    allowedMutationAttempts: state.allowedMutations,
  };
}

async function installReadOnlyNetworkGuard(context, state) {
  state.readOnlyGuardInstalled = true;
  await context.route('**/*', async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (!isBrowserReadOnlyRequest(request.method(), request.url())) {
      state.blockedMutations += 1;
      state.blockedMutationClasses.add(
        target.pathname.endsWith('/auth/v1/token')
          && target.searchParams.get('grant_type') === 'refresh_token'
          ? 'auth-refresh'
          : target.origin === APP_ORIGIN
            ? 'first-party-write'
            : 'third-party-write',
      );
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"success":false,"error":"Read Only Verification"}' });
    }
    if (
      state.failNextSports
      && target.origin === APP_ORIGIN
      && target.pathname === '/api/reels/feed'
      && target.searchParams.get('category') === 'sports'
    ) {
      state.failNextSports = false;
      state.injectedDrops += 1;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false,"error":"Injected Read Failure"}' });
    }
    return route.continue();
  });
}

async function verifyPublicBrowser(browser, bookmarkAlias, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const state = createReadOnlyBrowserState();
  await context.addInitScript(({ staleKey }) => {
    localStorage.setItem(staleKey, JSON.stringify({ version: 0, rows: [{ topic: 'sports' }] }));
    sessionStorage.setItem('social-intro-seen', 'true');
  }, { staleKey: RETIRED_CACHE_KEY });
  await installReadOnlyNetworkGuard(context, state);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', () => pageErrors.push('browser-page-error'));
  page.setDefaultTimeout(40000);
  try {
    const initialResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'for-you'
        && url.searchParams.get('id') === bookmarkAlias.reference
        && response.status() === 200;
    });
    await page.goto(`${APP_ORIGIN}/hub/reels?feed=trending&id=${bookmarkAlias.reference}`, { waitUntil: 'domcontentloaded' });
    const bookmarkResponse = await initialResponse;
    const bookmarkPayload = await bookmarkResponse.json();
    assert.equal(bookmarkPayload?.data?.[0]?.id, bookmarkAlias.winner, 'Old Reel alias did not render its canonical winner');
    assert.equal(bookmarkPayload?.data?.[0]?.canonical_asset_key, bookmarkAlias.key, 'Old Reel alias rendered the wrong canonical asset');
    await page.getByLabel(/Reels Viewer$/).waitFor();
    await page.waitForFunction(({ id }) => {
      const params = new URL(location.href).searchParams;
      return params.get('category') === 'for-you'
        && params.get('feed') === 'trending'
        && params.get('id') === id;
    }, { id: bookmarkAlias.reference });
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), RETIRED_CACHE_KEY), null, 'Retired Reel cache survived page startup');
    const players = page.locator('iframe[src*="youtube-nocookie.com/embed/"], video');
    assert.equal(await players.count(), 1, 'Published Reel page mounted more than one media player');
    await players.first().evaluate((element) => { element.dataset.liveProofPlayer = 'mounted'; });
    if (bookmarkPayload.data[0].source_attribution_url) {
      await page.getByRole('link', { name: /^View Original On / }).waitFor();
    } else {
      assert.equal(await page.getByRole('link', { name: /^View Original On / }).count(), 0, 'Native Reel rendered forged external attribution');
    }

    state.failNextSports = true;
    await page.getByRole('button', { name: 'Menu', exact: true }).click({ force: true });
    const sportsLink = page.locator('a[href="/hub/reels?category=sports"]').last();
    await sportsLink.waitFor();
    const dropped = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'sports'
        && response.status() === 503;
    });
    await sportsLink.evaluate((element) => element.click());
    await dropped;
    await page.getByRole('alert').filter({ hasText: 'New Reels Could Not Be Loaded. Showing Your Current Reel.' }).waitFor();
    assert.equal(await page.locator('[data-live-proof-player="mounted"]').count(), 1, 'Mid-flight category drop replaced the mounted player');
    assert.equal(await players.count(), 1, 'Mid-flight category drop created a second media player');
    assert.equal(state.injectedDrops, 1, 'The hostile mid-flight failure was not exercised exactly once');

    const recovered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'sports'
        && response.status() === 200;
    });
    await page.getByRole('button', { name: 'Retry Reel channel' }).click();
    await recovered;
    await page.getByLabel('Sports Reels Viewer').waitFor();
    assert.equal(await players.count(), 1, 'Recovered Sports channel mounted more than one media player');
    await page.getByRole('link', { name: /^View Original On / }).waitFor();
    assert.equal(pageErrors.length, 0, 'Published Reel page raised a browser error');
    report.coverage.publicMobile = {
      oldBookmarkCanonicalized: true,
      loserAliasRenderedCanonicalWinner: true,
      staleStorageRetired: true,
      midFlightDropRetainedPlayer: true,
      retryRecoveredSports: true,
      activePlayers: 1,
      browserErrors: pageErrors.length,
      injectedDrops: state.injectedDrops,
      ...readOnlyGuardReceipt(state),
    };
  } finally {
    await context.close();
  }
}

async function verifySlotsBrowser(browser, report) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const state = createReadOnlyBrowserState();
  await installReadOnlyNetworkGuard(context, state);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', () => pageErrors.push('browser-page-error'));
  page.setDefaultTimeout(40000);
  try {
    await page.goto(`${APP_ORIGIN}/hub/reels?category=casino-slots`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Casino And Slots Reels Viewer').waitFor();
    await page.getByLabel('Responsible Gaming Notice').waitFor();
    assert.equal(await page.locator('iframe[src*="youtube-nocookie.com/embed/"], video').count(), 1, 'Slots page mounted more than one media player');
    assert.equal(pageErrors.length, 0, 'Slots Reel page raised a browser error');
    report.coverage.slotsDesktop = {
      responsibleGamingNotice: true,
      activePlayers: 1,
      browserErrors: pageErrors.length,
      ...readOnlyGuardReceipt(state),
    };
  } finally {
    await context.close();
  }
}

async function verifyStaleAuthBrowser(browser, report) {
  const staleUserId = '00000000-0000-4000-8000-000000000099';
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const staleSession = ({ expired }) => {
    const expiresAt = expired
      ? Math.floor(Date.now() / 1_000) - 3_600
      : 4_102_444_800;
    return {
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
        aud: 'authenticated',
        exp: expiresAt,
        role: 'authenticated',
        sub: staleUserId,
      })}.invalid`,
      refresh_token: expired ? 'expired-read-only-proof' : 'revoked-read-only-proof',
      expires_in: expired ? -3_600 : 3_600,
      expires_at: expiresAt,
      token_type: 'bearer',
      user: {
        id: staleUserId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'stale-reels-proof@example.invalid',
      },
    };
  };

  const verifyCase = async ({ kind, expired }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const state = createReadOnlyBrowserState();
    const session = staleSession({ expired });
    await context.addInitScript(({ savedSession }) => {
      localStorage.setItem('smarter-poker-auth', JSON.stringify(savedSession));
      localStorage.setItem(`sp_firstrun_notif_v2_${savedSession.user.id}`, String(Date.now()));
      sessionStorage.setItem('social-intro-seen', 'true');
    }, { savedSession: session });
    await installReadOnlyNetworkGuard(context, state);
    const page = await context.newPage();
    const pageErrors = [];
    const followingStatuses = [];
    page.on('pageerror', () => pageErrors.push('browser-page-error'));
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname === '/api/reels/feed' && url.searchParams.get('category') === 'following') {
        followingStatuses.push(response.status());
      }
    });
    page.setDefaultTimeout(45000);
    try {
      await page.goto(`${APP_ORIGIN}/hub/reels?category=following`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Sign In Again For Following', { exact: true }).waitFor();
      assert.equal(
        await page.locator('iframe[src*="youtube-nocookie.com/embed/"], video').count(),
        0,
        `${kind} saved session mounted private media`,
      );
      assert.equal(pageErrors.length, 0, `${kind} saved session raised a browser error`);
      assert.equal(
        followingStatuses.some(status => status >= 200 && status < 300),
        false,
        `${kind} saved session received private Following media`,
      );
      if (expired) {
        assert.equal(
          await page.evaluate(() => localStorage.getItem('smarter-poker-auth')),
          null,
          'Expired saved session was not retired from localStorage',
        );
        assert.ok(
          state.blockedMutationClasses.has('auth-refresh'),
          'Expired saved session did not exercise the blocked refresh-token path',
        );
      } else {
        assert.ok(followingStatuses.includes(401), 'Revoked saved session did not fail closed at the API');
      }
      return {
        apiStatuses: followingStatuses,
        reauthPrompt: true,
        activePlayers: 0,
        browserErrors: pageErrors.length,
        authStorageCleared: expired,
        blockedAuthRefresh: expired,
        ...readOnlyGuardReceipt(state),
      };
    } finally {
      await context.close();
    }
  };

  report.coverage.staleAuthMobile = {
    revoked: await verifyCase({ kind: 'Revoked', expired: false }),
    expired: await verifyCase({ kind: 'Expired', expired: true }),
  };
}

async function verifySignedInBrowser(browser, session, article, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const state = createReadOnlyBrowserState();
  await context.addInitScript(({ currentSession }) => {
    localStorage.setItem('smarter-poker-auth', JSON.stringify(currentSession));
    localStorage.setItem(`sp_firstrun_notif_v2_${currentSession.user.id}`, String(Date.now()));
    sessionStorage.setItem('social-intro-seen', 'true');
  }, { currentSession: session });
  await installReadOnlyNetworkGuard(context, state);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', () => pageErrors.push('browser-page-error'));
  page.setDefaultTimeout(45000);
  try {
    const followingResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reels/feed'
        && url.searchParams.get('category') === 'following';
    });
    await page.goto(`${APP_ORIGIN}/hub/reels?category=following`, { waitUntil: 'domcontentloaded' });
    assert.equal((await followingResponse).status(), 200, 'Signed-in Following browser request was rejected');
    assert.equal(await page.getByText(/Sign In (Again )?For Following/).count(), 0, 'Signed-in Following rendered an authentication prompt');

    await page.goto(`${APP_ORIGIN}/hub/social-media?post=${article.id}`, { waitUntil: 'domcontentloaded' });
    const articleLabel = page.getByText(/Click To Read Full Article/i).first();
    await articleLabel.waitFor();
    await articleLabel.click();
    const reader = page.locator('iframe[src*="/api/proxy?url="]').first();
    await reader.waitFor();
    assert.equal(new URL(page.url()).pathname, '/hub/social-media', 'Ordinary article was rewritten into a Reel route');
    await page.locator('button[aria-label="Close"]:visible').last().click();
    await reader.waitFor({ state: 'detached' });

    const verifyCollectionPage = async ({ path, apiPath, emptyText }) => {
      const apiResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === apiPath;
      });
      await page.goto(`${APP_ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
      assert.equal((await apiResponse).status(), 200, `${path} account collection request was rejected`);
      await page.getByText('Account Synchronized', { exact: true }).waitFor();
      await page.waitForFunction(({ expectedEmptyText }) => (
        Boolean(document.querySelector('.vlc-reel-grid'))
        || document.body.innerText.includes(expectedEmptyText)
      ), { expectedEmptyText: emptyText });
      assert.equal(await page.locator('[role="alert"]:visible').count(), 0, `${path} rendered an account collection alert`);
      return {
        synchronized: true,
        state: await page.locator('.vlc-reel-grid').count() > 0 ? 'populated' : 'empty',
      };
    };
    const myReels = await verifyCollectionPage({
      path: '/hub/reels/my-reels',
      apiPath: '/api/reels/mine',
      emptyText: 'Your Channel Is Quiet. Publish Your First Reel To Start The Feed',
    });
    const savedReels = await verifyCollectionPage({
      path: '/hub/reels/saved',
      apiPath: '/api/reels/saved',
      emptyText: 'No Saved Reels Yet. Save A Reel And It Will Appear Here',
    });
    assert.equal(pageErrors.length, 0, 'Signed-in Reel surfaces raised a browser error');
    report.coverage.signedInMobile = {
      followingAuthorized: true,
      ordinaryArticleReaderPreserved: true,
      myReels,
      savedReels,
      browserErrors: pageErrors.length,
      ...readOnlyGuardReceipt(state),
    };
  } finally {
    await context.close();
  }
}

function countTotal(counts, label) {
  assert.ok(counts && typeof counts === 'object' && !Array.isArray(counts), `${label} counts are missing`);
  return Object.entries(counts).reduce((total, [key, value]) => {
    assert.ok(key.length > 0, `${label} contains an empty key`);
    assert.ok(Number.isInteger(value) && value >= 0, `${label} contains an invalid count`);
    return total + value;
  }, 0);
}

function validateCategoryReceipt(category, receipt) {
  assert.ok(receipt && typeof receipt === 'object', `Reels live receipt omitted ${category}`);
  assert.ok(Number.isInteger(receipt.pages) && receipt.pages >= 1, `${category} receipt has no page proof`);
  assert.ok(Number.isInteger(receipt.cursors) && receipt.cursors >= 0, `${category} receipt has no cursor proof`);
  assert.equal(typeof receipt.terminal, 'boolean', `${category} receipt omitted terminal-cursor state`);
  assert.equal(
    receipt.cursors,
    receipt.terminal ? receipt.pages - 1 : receipt.pages,
    `${category} cursor count disagrees with its terminal state`,
  );
  if (category === 'for-you') assert.equal(receipt.terminal, true, 'For You crawl did not reach its terminal cursor');
  assert.ok(Number.isInteger(receipt.reels) && receipt.reels > 0, `${category} receipt has no Reels`);
  assert.equal(receipt.uniqueIds, receipt.reels, `${category} receipt contains duplicate Reel identities`);
  assert.equal(receipt.uniqueAssets, receipt.reels, `${category} receipt contains duplicate canonical assets`);
  assert.equal(receipt.partialPages, 0, `${category} receipt contains partial pages`);
  assert.equal(receipt.duplicateIds, 0, `${category} receipt contains duplicate Reels`);
  assert.equal(receipt.duplicateAssets, 0, `${category} receipt contains duplicate assets`);
  assert.equal(receipt.restrictedTextMatches, 0, `${category} receipt contains restricted content markers`);
  assert.ok(receipt.managed > 0, `${category} receipt has no managed supply`);
  assert.equal(receipt.managed, receipt.library + receipt.horse, `${category} managed count is inconsistent`);

  const mix = receipt.mix;
  assert.ok(mix && typeof mix === 'object', `${category} receipt omitted its supply mix`);
  for (const [name, counts] of [
    ['topics', mix.topics],
    ['origins', mix.origins],
    ['source types', mix.sourceTypes],
    ['playback types', mix.playbackTypes],
    ['rights statuses', mix.rightsStatuses],
  ]) {
    assert.equal(countTotal(counts, `${category} ${name}`), receipt.reels, `${category} ${name} do not cover every Reel`);
  }
  const allowedTopics = CATEGORY_TOPICS[category];
  assert.ok(
    Object.keys(mix.topics).every((topic) => allowedTopics.has(topic) || (category === 'for-you' && topic === 'unknown')),
    `${category} receipt contains a topic outside its contract`,
  );
  assert.ok(
    Number.isInteger(mix.uniqueSources)
      && mix.uniqueSources >= SOURCE_DIVERSITY_FLOORS[category]
      && mix.uniqueSources <= receipt.reels,
    `${category} receipt fell below its source-diversity floor`,
  );
  assert.match(String(mix.sourceFingerprint || ''), /^[0-9a-f]{16}$/, `${category} receipt has no source fingerprint`);
  assert.equal(mix.origins.video_library || 0, receipt.library, `${category} Video Library origin count is inconsistent`);
  assert.equal(mix.origins.horse || 0, receipt.horse, `${category} horse origin count is inconsistent`);
  assert.equal(mix.origins.social_post || 0, receipt.socialPost, `${category} social-post origin count is inconsistent`);
  assert.equal(mix.topics.unknown || 0, receipt.unknownNative, `${category} unknown-native topic count is inconsistent`);

  const horseProfiles = receipt.horseAuthorProfiles;
  assert.ok(horseProfiles && typeof horseProfiles === 'object', `${category} receipt omitted horse player-profile proof`);
  assert.equal(horseProfiles.reels, receipt.horse, `${category} horse profile count disagrees with its origin count`);
  assert.equal(horseProfiles.resolvedProfiles, receipt.horse, `${category} horse Reel lacks an ordinary player profile`);
  assert.ok(
    Number.isInteger(horseProfiles.uniqueAuthors)
      && horseProfiles.uniqueAuthors >= (receipt.horse > 0 ? 1 : 0)
      && horseProfiles.uniqueAuthors <= receipt.horse,
    `${category} horse author count is invalid`,
  );
  assert.equal(horseProfiles.mismatches, 0, `${category} horse profile disagrees with its author`);
  assert.equal(horseProfiles.internalLabelsExposed, 0, `${category} exposed an internal horse label`);
}

function validateReadOnlyGuardProof(receipt, label) {
  assert.equal(receipt?.readOnlyGuardInstalled, true, `${label} omitted its read-only browser guard`);
  assert.ok(
    Number.isInteger(receipt?.blockedMutationAttempts) && receipt.blockedMutationAttempts >= 0,
    `${label} has an invalid blocked-mutation count`,
  );
  assert.ok(
    Array.isArray(receipt?.blockedMutationClasses)
      && receipt.blockedMutationClasses.every(value => ['auth-refresh', 'first-party-write', 'third-party-write'].includes(value)),
    `${label} has an invalid blocked-mutation classification`,
  );
  assert.equal(
    receipt.blockedMutationClasses.length > 0,
    receipt.blockedMutationAttempts > 0,
    `${label} mutation count and classifications disagree`,
  );
  assert.equal(receipt?.allowedMutationAttempts, 0, `${label} allowed a mutation during live verification`);
}

export function validateReceipt(report) {
  assert.equal(report?.status, 'passed', 'Reels live receipt is not passing');
  assert.equal(isFreshTimestamp(report?.observedAt), true, 'Reels live receipt observation time is missing or stale');
  assert.match(String(report.expectedSha || ''), /^[0-9a-f]{40}$/i, 'Reels live receipt has no exact protected revision');
  assert.ok(typeof report.deploymentId === 'string' && report.deploymentId.length > 0, 'Reels live receipt has no deployment identity');
  const beforeIdentity = report.productionIdentity?.before;
  const afterIdentity = report.productionIdentity?.after;
  for (const [position, identity] of [['before', beforeIdentity], ['after', afterIdentity]]) {
    assert.ok(identity && typeof identity === 'object', `Reels live receipt omitted the ${position} production identity`);
    assert.equal(identity.commitSha, report.expectedSha, `${position} production revision differs from the protected revision`);
    assert.ok(typeof identity.deploymentId === 'string' && identity.deploymentId.length > 0, `${position} production identity has no deployment id`);
  }
  assert.equal(beforeIdentity.deploymentId, afterIdentity.deploymentId, 'Production deployment changed during the Reels verification');
  assert.equal(report.deploymentId, beforeIdentity.deploymentId, 'Top-level deployment identity disagrees with the initial health proof');
  assert.match(String(report.accountFingerprint || ''), /^[0-9a-f]{16}$/, 'Reels live receipt omitted the designated-account fingerprint');
  for (const category of REEL_CATEGORIES) validateCategoryReceipt(category, report.categories?.[category]);
  assert.deepEqual(report.canonicalCrawl, report.categories['for-you'], 'Canonical crawl disagrees with the complete For You receipt');
  assert.ok(report.canonicalCrawl.reels > COMPLETE_FEED_MINIMUM, 'Reels live receipt did not prove more than 2,000 canonical Reels');
  assert.ok(report.canonicalCrawl.library > 0, 'Reels live receipt has no Video Library supply');
  assert.ok(report.canonicalCrawl.horse > 0, 'Reels live receipt has no horse supply');
  assert.ok(report.canonicalCrawl.socialPost > 0, 'Reels live receipt has no social-post supply');
  assert.ok(report.canonicalCrawl.unknownNative > 0, 'Reels live receipt did not exercise the narrow native unknown-topic exception');
  assert.ok(report.canonicalCrawl.mix?.topics?.sports > 0, 'Reels live receipt has no Sports supply');
  assert.ok(report.canonicalCrawl.mix?.topics?.slots > 0, 'Reels live receipt has no Casino And Slots supply');
  assert.ok(
    ['poker', 'cash', 'tournament'].some(topic => report.canonicalCrawl.mix?.topics?.[topic] > 0),
    'Reels live receipt has no Poker supply',
  );
  assert.equal(report.aliases?.checked, SUP07_ALIASES.length, 'Reels live receipt did not check every SUP-07 bookmark alias');
  assert.equal(report.aliases?.groups, SUP07_GROUPS.length, 'Reels live receipt did not check every SUP-07 canonical group');
  assert.equal(report.aliases?.winners, SUP07_GROUPS.length, 'Reels live receipt did not retain every SUP-07 winner');
  assert.equal(
    report.aliases?.fingerprint,
    digest(SUP07_ALIASES.map(alias => `${alias.reference}:${alias.winner}:${alias.key}`).join('|')),
    'Reels live receipt SUP-07 fingerprint differs from the maintained alias inventory',
  );
  assert.equal(report.coverage?.followingApi?.signedOutStatus, 401, 'Following did not reject signed-out API access');
  assert.equal(report.coverage?.followingApi?.signedInStatus, 200, 'Following did not accept the designated account');
  assert.ok(Number.isInteger(report.coverage?.followingApi?.reels) && report.coverage.followingApi.reels >= 0, 'Following API receipt has an invalid count');
  for (const collection of ['mine', 'saved']) {
    const receipt = report.accountCollections?.[collection];
    assert.ok(receipt, `Reels live receipt omitted the ${collection} collection`);
    assert.ok(Number.isInteger(receipt.pages) && receipt.pages >= 1, `${collection} collection receipt has no terminal page`);
    assert.ok(Number.isInteger(receipt.cursors) && receipt.cursors >= 0, `${collection} collection receipt has no cursor proof`);
    assert.equal(receipt.terminal, true, `${collection} collection crawl did not reach its terminal cursor`);
    assert.equal(receipt.cursors, receipt.pages - 1, `${collection} collection cursor count is inconsistent`);
    assert.ok(Number.isInteger(receipt.records) && receipt.records >= 0, `${collection} collection receipt has an invalid count`);
    assert.equal(receipt.uniqueReels, receipt.records, `${collection} collection receipt has duplicate Reels`);
    assert.equal(receipt.uniqueAssets, receipt.records, `${collection} collection receipt has duplicate assets`);
    assert.equal(receipt.partialPages, 0, `${collection} collection receipt contains partial pages`);
    assert.equal(receipt.duplicateIds, 0, `${collection} collection receipt contains duplicate Reels`);
    assert.equal(receipt.duplicateAssets, 0, `${collection} collection receipt contains duplicate assets`);
    assert.equal(receipt.ownerBound, true, `${collection} collection receipt is not owner-bound`);
    assert.equal(receipt.cacheControl, 'private-no-store', `${collection} collection receipt is not private and non-cacheable`);
    assert.equal(
      receipt.ownershipProof,
      receipt.records > 0 ? 'row-validated' : 'authoritative-empty',
      `${collection} collection receipt overstates its live ownership proof`,
    );
    const pageReceipt = report.coverage?.signedInMobile?.[collection === 'mine' ? 'myReels' : 'savedReels'];
    assert.equal(pageReceipt?.synchronized, true, `${collection} collection page did not synchronize`);
    assert.equal(pageReceipt?.state, receipt.records > 0 ? 'populated' : 'empty', `${collection} collection UI disagrees with the API`);
  }
  assert.equal(report.coverage?.publicMobile?.oldBookmarkCanonicalized, true, 'Old bookmark query was not canonicalized');
  assert.equal(report.coverage?.publicMobile?.loserAliasRenderedCanonicalWinner, true, 'Old loser bookmark did not render its canonical winner');
  assert.equal(report.coverage?.publicMobile?.staleStorageRetired, true, 'Hostile stale storage was not retired');
  assert.equal(report.coverage?.publicMobile?.midFlightDropRetainedPlayer, true, 'Mid-flight drop did not retain the active player');
  assert.equal(report.coverage?.publicMobile?.retryRecoveredSports, true, 'Sports retry did not recover');
  assert.equal(report.coverage?.publicMobile?.activePlayers, 1, 'Public mobile proof did not retain exactly one active player');
  assert.equal(report.coverage?.publicMobile?.browserErrors, 0, 'Public mobile verification raised a browser error');
  assert.equal(report.coverage?.publicMobile?.injectedDrops, 1, 'Public mobile verification did not exercise exactly one hostile drop');
  validateReadOnlyGuardProof(report.coverage?.publicMobile, 'Public mobile verification');
  const revokedStaleAuth = report.coverage?.staleAuthMobile?.revoked;
  assert.ok(Array.isArray(revokedStaleAuth?.apiStatuses) && revokedStaleAuth.apiStatuses.includes(401), 'Revoked stale auth did not fail closed');
  assert.equal(
    revokedStaleAuth.apiStatuses.every(status => Number.isInteger(status) && (status < 200 || status >= 300)),
    true,
    'Revoked stale auth received private Following media',
  );
  assert.equal(revokedStaleAuth?.reauthPrompt, true, 'Revoked stale auth did not render reauthentication');
  assert.equal(revokedStaleAuth?.activePlayers, 0, 'Revoked stale auth mounted private media');
  assert.equal(revokedStaleAuth?.browserErrors, 0, 'Revoked stale auth raised a browser error');
  validateReadOnlyGuardProof(revokedStaleAuth, 'Revoked stale-auth verification');
  const expiredStaleAuth = report.coverage?.staleAuthMobile?.expired;
  assert.ok(
    Array.isArray(expiredStaleAuth?.apiStatuses)
      && expiredStaleAuth.apiStatuses.every(status => Number.isInteger(status) && (status < 200 || status >= 300)),
    'Expired stale auth received private Following media',
  );
  assert.equal(expiredStaleAuth?.reauthPrompt, true, 'Expired stale auth did not render reauthentication');
  assert.equal(expiredStaleAuth?.activePlayers, 0, 'Expired stale auth mounted private media');
  assert.equal(expiredStaleAuth?.browserErrors, 0, 'Expired stale auth raised a browser error');
  assert.equal(expiredStaleAuth?.authStorageCleared, true, 'Expired stale auth was not retired from localStorage');
  assert.equal(expiredStaleAuth?.blockedAuthRefresh, true, 'Expired stale auth did not exercise a blocked refresh');
  assert.ok(expiredStaleAuth?.blockedMutationClasses?.includes('auth-refresh'), 'Expired stale auth omitted its blocked refresh evidence');
  validateReadOnlyGuardProof(expiredStaleAuth, 'Expired stale-auth verification');
  assert.equal(report.coverage?.slotsDesktop?.responsibleGamingNotice, true, 'Slots responsible-gaming notice was not verified');
  assert.equal(report.coverage?.slotsDesktop?.activePlayers, 1, 'Slots desktop proof did not mount exactly one player');
  assert.equal(report.coverage?.slotsDesktop?.browserErrors, 0, 'Slots desktop verification raised a browser error');
  validateReadOnlyGuardProof(report.coverage?.slotsDesktop, 'Slots desktop verification');
  assert.equal(report.coverage?.signedInMobile?.followingAuthorized, true, 'Following was not verified with the designated identity');
  assert.equal(report.coverage?.signedInMobile?.ordinaryArticleReaderPreserved, true, 'Ordinary article reader was not preserved');
  assert.equal(report.coverage?.signedInMobile?.browserErrors, 0, 'Signed-in mobile verification raised a browser error');
  validateReadOnlyGuardProof(report.coverage?.signedInMobile, 'Signed-in mobile verification');
  assert.equal(report.coverage?.healthStable, true, 'Production identity changed during the Reels verification');
  assert.ok(Array.isArray(report.checks), 'Reels live receipt omitted its completed-check inventory');
  assert.equal(report.checks.length, REQUIRED_RECEIPT_CHECKS.length, 'Reels live receipt check inventory is incomplete');
  assert.deepEqual(
    [...new Set(report.checks)].sort(),
    [...REQUIRED_RECEIPT_CHECKS].sort(),
    'Reels live receipt check inventory differs from the maintained contract',
  );
  return report;
}

async function checkReceipt(path) {
  assert.ok(path, 'Receipt path is required');
  const expectedSha = process.env.REELS_EXPECTED_SHA;
  assert.match(String(expectedSha || ''), /^[0-9a-f]{40}$/i, 'Standalone receipt validation requires the dispatched exact SHA');
  const report = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(report.expectedSha, expectedSha, 'Sanitized Reels receipt differs from the dispatched exact SHA');
  validateReceipt(report);
  console.log('Reels live receipt assertions passed');
}

async function run() {
  validateConfiguration(process.env);
  const evidenceDir = process.env.REELS_EVIDENCE_DIR || 'test-results/reels-live';
  await mkdir(evidenceDir, { recursive: true });
  const report = {
    observedAt: new Date().toISOString(),
    expectedSha: process.env.REELS_EXPECTED_SHA,
    status: 'running',
    categories: {},
    coverage: {},
    checks: [],
  };
  let browser;
  try {
    const health = await assertHealth(report.expectedSha);
    report.deploymentId = health.deploymentId;
    report.productionIdentity = {
      before: {
        commitSha: health.commitSha,
        deploymentId: health.deploymentId,
      },
      after: null,
    };

    const { createClient } = await import('@supabase/supabase-js');
    const auth = createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) },
    });
    const signedIn = await auth.auth.signInWithPassword({
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    });
    assert.ok(!signedIn.error && signedIn.data?.session?.access_token, 'Configured test account authentication failed; no fallback account was used');
    const session = signedIn.data.session;
    const verified = await auth.auth.getUser(session.access_token);
    assert.ok(!verified.error && verified.data?.user?.id === session.user.id, 'Authenticated test account identity could not be verified');
    assert.equal(verified.data.user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured test account');
    report.accountFingerprint = digest(session.user.id);

    const anonymousFollowing = await readJson('/api/reels/feed?category=following&limit=20', { expectedStatus: 401 });
    assert.equal(anonymousFollowing.success, false, 'Signed-out Following unexpectedly succeeded');
    const following = await readJson('/api/reels/feed?category=following&limit=20', { token: session.access_token });
    validateFeedPage(following, 'following');
    report.coverage.followingApi = { signedOutStatus: 401, signedInStatus: 200, reels: following.data.length };

    const collections = {};
    for (const category of REEL_CATEGORIES) {
      collections[category] = await collectCategory(category);
      report.categories[category] = collections[category].receipt;
    }
    report.canonicalCrawl = collections['for-you'].receipt;
    const topicSupply = new Set(REEL_CATEGORIES.flatMap((category) => collections[category].rows.map((row) => row.topic)));
    assert.ok(topicSupply.has('sports'), 'Live feed has no Sports supply');
    assert.ok(topicSupply.has('slots'), 'Live feed has no Casino And Slots supply');
    assert.ok([...topicSupply].some((topic) => ['poker', 'cash', 'tournament'].includes(topic)), 'Live feed has no Poker supply');
    const allRows = REEL_CATEGORIES.flatMap((category) => collections[category].rows);
    assert.ok(allRows.some((row) => row.origin_type === 'video_library'), 'Live feed has no managed Video Library supply');
    assert.ok(allRows.some((row) => row.origin_type === 'horse'), 'Live feed has no managed horse supply');
    report.aliases = await verifySup07Aliases();
    const [mine, saved] = await Promise.all([
      collectAccountCollection('mine', session.access_token, session.user.id),
      collectAccountCollection('saved', session.access_token, session.user.id),
    ]);
    report.accountCollections = {
      mine: mine.receipt,
      saved: saved.receipt,
    };

    const article = await findOrdinaryArticle(session.access_token);
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    await verifyPublicBrowser(browser, SUP07_ALIASES.find(alias => alias.kind === 'loser'), report);
    await verifySlotsBrowser(browser, report);
    await verifyStaleAuthBrowser(browser, report);
    await verifySignedInBrowser(browser, session, article, report);

    const finalHealth = await assertHealth(report.expectedSha);
    assert.equal(finalHealth.deploymentId, report.deploymentId, 'Production deployment changed during verification');
    report.productionIdentity.after = {
      commitSha: finalHealth.commitSha,
      deploymentId: finalHealth.deploymentId,
    };
    report.coverage.healthStable = true;
    report.checks = [...REQUIRED_RECEIPT_CHECKS];
    report.status = 'passed';
    validateReceipt(report);
    console.log(JSON.stringify(report));
  } catch (error) {
    report.status = 'failed';
    report.failure = fixedFailure(error);
    console.error(report.failure);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--check-receipt')) {
    const index = process.argv.indexOf('--check-receipt');
    await checkReceipt(process.argv[index + 1]);
  }
  else await run();
}
