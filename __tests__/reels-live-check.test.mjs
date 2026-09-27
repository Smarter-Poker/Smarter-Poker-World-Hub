import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APP_ORIGIN,
  SUP07_ALIASES,
  crawlAccountCollection,
  crawlCanonicalFeed,
  isBrowserReadOnlyRequest,
  isNarrowUnknownNativeReel,
  validateCollectionPage,
  validateFeedPage,
  validateReceipt,
} from '../scripts/ci/reels-live-check.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const POST = '22222222-2222-4222-8222-222222222222';
const OFFICIAL_VIDEO_LIBRARY_AUTHOR = '00000000-0000-0000-0000-000000000001';

function uuid(index) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function nativeRow(index, overrides = {}) {
  return {
    id: uuid(index),
    author_id: OWNER,
    caption: `Reel ${index}`,
    title: `Reel ${index}`,
    video_url: `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${OWNER}/${index}.mp4`,
    source_type: 'native',
    source_post_id: null,
    source_story_id: null,
    youtube_video_id: null,
    media_status: 'ready',
    origin_type: 'horse',
    playback_type: 'native',
    topic: 'poker',
    rights_status: 'owned',
    source_asset_id: null,
    canonical_asset_key: `native:test-${index}`,
    publication_key: null,
    native_processing_requested: false,
    legacy_transition_eligible: false,
    is_public: true,
    ...overrides,
  };
}

function youtubeRow(index = 1, overrides = {}) {
  const checkedAt = new Date().toISOString();
  return nativeRow(index, {
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    source_type: 'youtube',
    youtube_video_id: 'dQw4w9WgXcQ',
    origin_type: 'video_library',
    playback_type: 'youtube_embed',
    topic: 'sports',
    rights_status: 'embed_only',
    source_asset_id: '33333333-3333-4333-8333-333333333333',
    canonical_asset_key: 'youtube:dQw4w9WgXcQ',
    publication_key: 'video-library:33333333-3333-4333-8333-333333333333',
    source_name: 'Verified Source',
    source_attribution_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    availability_status: 'verified',
    embeddable: true,
    availability_checked_at: checkedAt,
    verification_status: 'resolved',
    last_verified_at: checkedAt,
    ...overrides,
  });
}

function page(data, {
  category = 'for-you',
  hasMore = false,
  cursor = null,
  partial = false,
} = {}) {
  return {
    success: true,
    category,
    data,
    has_more: hasMore,
    next_cursor: cursor,
    partial,
    pagination: {
      limit: data.length,
      hasMore,
      nextCursor: cursor,
    },
  };
}

function collectionPage(data, options = {}) {
  const payload = page(data, options);
  delete payload.category;
  return payload;
}

test('live Reel validation rejects partial, duplicate, stale, legacy, and restricted payloads', () => {
  assert.equal(isBrowserReadOnlyRequest('GET', `${APP_ORIGIN}/api/reels/feed`), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(isBrowserReadOnlyRequest(method, `${APP_ORIGIN}/api/reels/feed`), false);
  }

  const row = youtubeRow();
  validateFeedPage(page([row], { category: 'sports' }), 'sports');
  validateFeedPage(
    page([youtubeRow(2, { author_id: OFFICIAL_VIDEO_LIBRARY_AUTHOR })], { category: 'sports' }),
    'sports',
  );
  assert.throws(
    () => validateFeedPage(page([row], { category: 'sports', partial: true }), 'sports'),
    /partial page/,
  );
  assert.throws(
    () => validateFeedPage(page([row], { category: 'sports', hasMore: true, cursor: 'next' }), 'sports'),
    /shorter than the requested limit/,
  );
  assert.throws(
    () => validateFeedPage(page([row, row], { category: 'sports' }), 'sports'),
    /repeated a Reel id/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, legacy_transition_eligible: true }], { category: 'sports' }), 'sports'),
    /Legacy-transition Reel/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, is_public: false }], { category: 'sports' }), 'sports'),
    /Non-public Reel/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, caption: 'Members-only subscribers' }], { category: 'sports' }), 'sports'),
    /subscription-only text/,
  );
  for (const restrictedCopy of [
    'Membership is required',
    'Available to this channel’s members',
    'This video is private',
    'Video unavailable',
    'This video was removed',
    'Not available in your country',
    'Embedding is disabled',
    'Confirm that you are not a bot',
  ]) {
    assert.throws(
      () => validateFeedPage(page([{ ...row, title: restrictedCopy }], { category: 'sports' }), 'sports'),
      /subscription-only text/,
    );
  }
  assert.throws(
    () => validateFeedPage(page([{ ...row, availability_status: 'unavailable' }], { category: 'sports' }), 'sports'),
    /Unavailable Reel/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, author_id: 'not-a-uuid' }], { category: 'sports' }), 'sports'),
    /author identity/,
  );
  assert.throws(
    () => validateFeedPage(page([{
      ...row,
      availability_checked_at: new Date(Date.now() - (8 * 24 * 60 * 60 * 1000)).toISOString(),
      verification_status: null,
      last_verified_at: null,
    }], { category: 'sports' }), 'sports'),
    /fresh positive availability proof/,
  );
});

test('unknown topic is accepted only for the exact storage-proven native social-post shape', () => {
  const row = nativeRow(40, {
    topic: 'unknown',
    origin_type: 'social_post',
    source_type: 'native',
    playback_type: 'native',
    rights_status: 'user_authorized',
    source_post_id: POST,
    canonical_asset_key: 'native:unknown-proof',
  });
  assert.equal(isNarrowUnknownNativeReel(row), true);
  validateFeedPage(page([row]), 'for-you');
  for (const hostile of [
    { publication_key: 'forged' },
    { source_asset_id: uuid(900) },
    { native_processing_requested: true },
    { source_post_id: 'not-a-uuid' },
    { origin_type: 'legacy' },
    { rights_status: 'unknown' },
  ]) {
    assert.throws(
      () => validateFeedPage(page([{ ...row, ...hostile }]), 'for-you'),
      /category topic contract/,
    );
  }
  assert.throws(
    () => validateFeedPage(page([row], { category: 'following' }), 'following'),
    /category topic contract/,
  );
});

test('complete canonical crawler reaches a terminal page above two thousand without duplicates', async () => {
  const rows = Array.from({ length: 2_001 }, (_, index) => nativeRow(index + 1));
  const pages = [];
  for (let offset = 0; offset < rows.length; offset += 120) {
    const data = rows.slice(offset, offset + 120);
    const hasMore = offset + data.length < rows.length;
    pages.push(page(data, {
      hasMore,
      cursor: hasMore ? `cursor-${offset + data.length}` : null,
    }));
  }
  let requested = 0;
  const result = await crawlCanonicalFeed(async () => pages[requested++]);
  assert.equal(result.rows.length, 2_001);
  assert.equal(result.pageCount, 17);
  assert.equal(result.mix.topics.poker, 2_001);
  assert.equal(result.mix.origins.horse, 2_001);

  const repeatedCursor = [
    page([nativeRow(3_001)], { hasMore: true, cursor: 'same' }),
    page([nativeRow(3_002)], { hasMore: true, cursor: 'same' }),
  ];
  let cursorPage = 0;
  await assert.rejects(
    crawlCanonicalFeed(async () => repeatedCursor[cursorPage++], {
      requestedLimit: 1,
      minimumExclusive: 0,
      maxPages: 3,
    }),
    /repeated a cursor/,
  );
});

test('all eleven SUP-07 aliases stay pinned to four canonical winners and source posts', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260927144041_recover_historical_user_reels.sql', import.meta.url), 'utf8');
  assert.equal(SUP07_ALIASES.length, 11);
  assert.equal(new Set(SUP07_ALIASES.map(alias => alias.reference)).size, 11);
  assert.equal(new Set(SUP07_ALIASES.map(alias => alias.winner)).size, 4);
  assert.equal(new Set(SUP07_ALIASES.map(alias => alias.post)).size, 4);
  assert.equal(new Set(SUP07_ALIASES.map(alias => alias.key)).size, 4);
  for (const alias of SUP07_ALIASES) {
    assert.match(migration, new RegExp(alias.reference));
    assert.match(migration, new RegExp(alias.winner));
    assert.match(migration, new RegExp(alias.post));
    assert.match(migration, new RegExp(alias.key));
  }
});

test('My and Saved crawlers remain owner-bound, canonical, complete, and read-only', async () => {
  const myFirst = nativeRow(4_001, { author_id: OWNER, is_public: false });
  const mySecond = nativeRow(4_002, { author_id: OWNER });
  const minePages = [
    collectionPage([myFirst], { hasMore: true, cursor: 'mine-next' }),
    collectionPage([mySecond]),
  ];
  let minePage = 0;
  const mine = await crawlAccountCollection(async () => minePages[minePage++], {
    collection: 'mine',
    ownerId: OWNER,
    requestedLimit: 1,
  });
  assert.equal(mine.receipt.records, 2);
  assert.equal(mine.receipt.ownerBound, true);

  const canonical = nativeRow(5_001);
  const savedItem = {
    id: uuid(5_101),
    user_id: OWNER,
    reel_id: canonical.id,
    saved_target_id: canonical.id,
    saved_target_ids: [canonical.id],
    saved_at: new Date().toISOString(),
    reel: canonical,
  };
  validateCollectionPage(collectionPage([savedItem]), 'saved', OWNER);
  assert.throws(
    () => validateCollectionPage(collectionPage([{ ...savedItem, user_id: uuid(5_102) }]), 'saved', OWNER),
    /escaped the designated account/,
  );
  assert.throws(
    () => validateCollectionPage(collectionPage([{ ...savedItem, reel_id: uuid(5_103) }]), 'saved', OWNER),
    /canonical winner/,
  );
});

test('workflow retains and independently asserts the complete sanitized receipt', () => {
  const workflow = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  const job = workflow.split('\n  reels-live:\n')[1];
  assert.ok(job, 'reels-live workflow job is missing');
  assert.match(job, /timeout-minutes:\s*30/);
  assert.match(job, /node scripts\/ci\/reels-live-check\.mjs --check-receipt test-results\/reels-live\/result\.json/);
  assert.match(job, /name:\s*reels-live-receipt[\s\S]*?if-no-files-found:\s*error/);

  const collection = {
    pages: 1,
    records: 0,
    uniqueReels: 0,
    uniqueAssets: 0,
    partialPages: 0,
    duplicateIds: 0,
    duplicateAssets: 0,
    ownerBound: true,
    cacheControl: 'private-no-store',
  };
  const receipt = {
    status: 'passed',
    expectedSha: 'a'.repeat(40),
    deploymentId: 'deployment-proof',
    productionIdentity: {
      before: { commitSha: 'a'.repeat(40), deploymentId: 'deployment-proof' },
      after: { commitSha: 'a'.repeat(40), deploymentId: 'deployment-proof' },
    },
    canonicalCrawl: {
      reels: 2_001,
      uniqueIds: 2_001,
      uniqueAssets: 2_001,
      partialPages: 0,
      restrictedTextMatches: 0,
      library: 1,
      horse: 1,
      socialPost: 1,
      unknownNative: 1,
      mix: { topics: { poker: 1, slots: 1, sports: 1 } },
    },
    aliases: { checked: 11, groups: 4 },
    accountCollections: { mine: collection, saved: collection },
    coverage: {
      healthStable: true,
      publicMobile: {
        loserAliasRenderedCanonicalWinner: true,
        staleStorageRetired: true,
        midFlightDropRetainedPlayer: true,
        retryRecoveredSports: true,
      },
      signedInMobile: {
        followingAuthorized: true,
        ordinaryArticleReaderPreserved: true,
        myReels: { synchronized: true, state: 'empty' },
        savedReels: { synchronized: true, state: 'empty' },
      },
    },
  };
  assert.equal(validateReceipt(receipt), receipt);
  assert.throws(() => validateReceipt({ ...receipt, canonicalCrawl: { ...receipt.canonicalCrawl, reels: 2_000 } }), /more than 2,000/);
  assert.throws(() => validateReceipt({ ...receipt, aliases: { checked: 10, groups: 4 } }), /every SUP-07/);
  assert.throws(
    () => validateReceipt({
      ...receipt,
      productionIdentity: {
        ...receipt.productionIdentity,
        after: { ...receipt.productionIdentity.after, deploymentId: 'replacement-deployment' },
      },
    }),
    /Production deployment changed/,
  );
  assert.throws(
    () => validateReceipt({
      ...receipt,
      productionIdentity: {
        ...receipt.productionIdentity,
        after: { ...receipt.productionIdentity.after, commitSha: 'b'.repeat(40) },
      },
    }),
    /after production revision differs/,
  );
});
