import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APP_ORIGIN,
  REQUIRED_RECEIPT_CHECKS,
  SOURCE_DIVERSITY_FLOORS,
  SUP07_ALIASES,
  crawlAccountCollection,
  crawlCanonicalFeed,
  isBrowserReadOnlyRequest,
  isNarrowUnknownNativeReel,
  selectStableHostileDropReel,
  validateCollectionPage,
  validateFeedPage,
  validateReceipt,
} from '../scripts/ci/reels-live-check.mjs';

const REELS_FEED_SERVER = readFileSync(new URL('../src/lib/server/reelsFeed.js', import.meta.url), 'utf8');
const REELS_LIVE_CHECK = readFileSync(new URL('../scripts/ci/reels-live-check.mjs', import.meta.url), 'utf8');
const E2E_WORKFLOW = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
const SOCIAL_MEDIA_PAGE = readFileSync(new URL('../pages/hub/social-media/index.js', import.meta.url), 'utf8');
const ARTICLE_READER = readFileSync(new URL('../src/components/social/ArticleReaderModal.jsx', import.meta.url), 'utf8');

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
    profiles: {
      id: OWNER,
      username: 'player-author',
      full_name: 'Player Author',
      avatar_url: null,
    },
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

test('hostile-drop proof isolates route failure from native codec fallback', () => {
  const nativeAlias = nativeRow(1);
  const embed = youtubeRow(2, { topic: 'poker' });
  const staleEmbed = youtubeRow(3, {
    topic: 'poker',
    availability_checked_at: '2020-01-01T00:00:00.000Z',
    last_verified_at: '2020-01-01T00:00:00.000Z',
  });
  assert.equal(selectStableHostileDropReel([nativeAlias, embed], nativeAlias.id), embed);
  assert.equal(selectStableHostileDropReel([nativeAlias], nativeAlias.id), null);
  assert.equal(selectStableHostileDropReel([staleEmbed, embed], nativeAlias.id), embed);
  assert.equal(
    selectStableHostileDropReel([
      embed,
      { ...embed, id: uuid(3), youtube_video_id: 'not-valid' },
    ], embed.id),
    null,
  );
});

test('public mobile proof counts each media DOM node once inside the standalone Reels viewer', () => {
  assert.match(
    REELS_LIVE_CHECK,
    /const players = page\s*\.locator\('main'\)\s*\.locator\('iframe\[src\*="youtube-nocookie\.com\/embed\/"\], video'\);/,
    'nested accessible labels and global picture-in-picture must not double-count a Reel player',
  );
  assert.match(
    REELS_LIVE_CHECK,
    /page\.waitForFunction\(\(\) => \(\s*document\.querySelectorAll\('main iframe\[src\*="youtube-nocookie\.com\/embed\/"\], main video'\)\.length === 1\s*\)\);/,
    'the hostile transition must settle to exactly one viewer player before its final assertion',
  );
});

test('ordinary article live proof is scoped to the requested post and its reader dialog', () => {
  assert.match(SOCIAL_MEDIA_PAGE, /data-post-id=\{post\.id\}/);
  assert.match(ARTICLE_READER, /role="dialog"[\s\S]*aria-label="Article Reader"/);
  assert.match(REELS_LIVE_CHECK, /page\.locator\(`\[data-post-id="\$\{article\.id\}"\]`\)/);
  assert.match(REELS_LIVE_CHECK, /selectedPost\.getByText\(\/Click To Read Full Article\/i\)\.filter\(\{ visible: true \}\)/);
  assert.match(REELS_LIVE_CHECK, /page\.getByRole\('dialog', \{ name: 'Article Reader' \}\)/);
});

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

test('horse Reels resolve ordinary player profiles, including maintained zero-version database UUIDs', () => {
  const row = nativeRow(30);
  validateFeedPage(page([row]), 'for-you');
  assert.throws(
    () => validateFeedPage(page([{ ...row, profiles: null }]), 'for-you'),
    /ordinary player profile/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, profiles: { ...row.profiles, id: uuid(31) } }]), 'for-you'),
    /profile disagrees/,
  );
  assert.throws(
    () => validateFeedPage(page([{ ...row, profiles: { ...row.profiles, is_horse: true } }]), 'for-you'),
    /internal fleet label/,
  );

  assert.match(REELS_FEED_SERVER, /const PERSISTED_UUID_RE = \/\^\[0-9a-f\]\{8\}\(\?:-\[0-9a-f\]\{4\}\)\{3\}-\[0-9a-f\]\{12\}\$\/i/);
  const attachProfiles = REELS_FEED_SERVER.match(/async function attachProfiles[\s\S]*?(?=\nasync function readPage)/)?.[0] || '';
  assert.match(attachProfiles, /PERSISTED_UUID_RE\.test\(String\(id \|\| ''\)\)/);
  assert.doesNotMatch(attachProfiles, /filter\(id => UUID_RE\.test/);
  const followedAuthors = REELS_FEED_SERVER.match(/async function readAllFollowedAuthorIds[\s\S]*?(?=\nasync function loadEligibilityContext)/)?.[0] || '';
  assert.match(followedAuthors, /PERSISTED_UUID_RE\.test\(followingId\)/,
    'persisted followed authors may include maintained zero-version database UUIDs');
  assert.match(followedAuthors, /if \(!UUID_RE\.test\(String\(viewerId \|\| ''\)\)\)/,
    'caller-controlled viewer identity must remain strict');
  assert.match(REELS_FEED_SERVER, /const UUID_RE = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]/,
    'caller-controlled UUID validation must remain strict');
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
  assert.match(
    REELS_LIVE_CHECK,
    /const expectedPostTopic = index === 3 \? 'unknown' : 'poker';[\s\S]*post\.topics\[0\] === expectedPostTopic/,
    'the authoritative verifier must honor the normalized topics array for the legacy group',
  );
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
  assert.equal(mine.receipt.ownershipProof, 'row-validated');

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
    cursors: 0,
    terminal: true,
    records: 0,
    uniqueReels: 0,
    uniqueAssets: 0,
    partialPages: 0,
    duplicateIds: 0,
    duplicateAssets: 0,
    ownerBound: true,
    cacheControl: 'private-no-store',
    ownershipProof: 'authoritative-empty',
  };
  const categoryReceipt = ({
    reels,
    library,
    horse,
    socialPost = 0,
    unknownNative = 0,
    topics,
    origins,
    sourceTypes,
    playbackTypes,
    rightsStatuses,
    uniqueSources,
    fingerprint,
    uniqueHorseAuthors = horse,
  }) => ({
    pages: 1,
    cursors: 0,
    terminal: true,
    reels,
    uniqueIds: reels,
    uniqueAssets: reels,
    partialPages: 0,
    duplicateIds: 0,
    duplicateAssets: 0,
    restrictedTextMatches: 0,
    managed: library + horse,
    library,
    horse,
    socialPost,
    unknownNative,
    horseAuthorProfiles: {
      reels: horse,
      resolvedProfiles: horse,
      uniqueAuthors: uniqueHorseAuthors,
      mismatches: 0,
      internalLabelsExposed: 0,
    },
    mix: {
      topics,
      origins,
      sourceTypes,
      playbackTypes,
      rightsStatuses,
      uniqueSources,
      sourceFingerprint: fingerprint,
    },
  });
  const forYou = categoryReceipt({
    reels: 2_001,
    library: 1_999,
    horse: 1,
    socialPost: 1,
    unknownNative: 1,
    topics: { poker: 1_995, slots: 4, sports: 1, unknown: 1 },
    origins: { video_library: 1_999, horse: 1, social_post: 1 },
    sourceTypes: { video_library: 1_999, youtube: 1, native: 1 },
    playbackTypes: { youtube_embed: 2_000, native: 1 },
    rightsStatuses: { embed_only: 2_000, user_authorized: 1 },
    uniqueSources: SOURCE_DIVERSITY_FLOORS['for-you'],
    fingerprint: '1'.repeat(16),
  });
  const poker = categoryReceipt({
    reels: 60,
    library: 60,
    horse: 0,
    topics: { poker: 60 },
    origins: { video_library: 60 },
    sourceTypes: { video_library: 60 },
    playbackTypes: { youtube_embed: 60 },
    rightsStatuses: { embed_only: 60 },
    uniqueSources: SOURCE_DIVERSITY_FLOORS.poker,
    fingerprint: '2'.repeat(16),
  });
  const slots = categoryReceipt({
    reels: 60,
    library: 60,
    horse: 0,
    topics: { slots: 60 },
    origins: { video_library: 60 },
    sourceTypes: { video_library: 60 },
    playbackTypes: { youtube_embed: 60 },
    rightsStatuses: { embed_only: 60 },
    uniqueSources: SOURCE_DIVERSITY_FLOORS['casino-slots'],
    fingerprint: '3'.repeat(16),
  });
  const sports = categoryReceipt({
    reels: 4,
    library: 0,
    horse: 4,
    topics: { sports: 4 },
    origins: { horse: 4 },
    sourceTypes: { youtube: 4 },
    playbackTypes: { youtube_embed: 4 },
    rightsStatuses: { embed_only: 4 },
    uniqueSources: SOURCE_DIVERSITY_FLOORS.sports,
    fingerprint: '4'.repeat(16),
  });
  const receipt = {
    observedAt: new Date().toISOString(),
    status: 'passed',
    expectedSha: 'a'.repeat(40),
    deploymentId: 'deployment-proof',
    accountFingerprint: '5'.repeat(16),
    productionIdentity: {
      before: { commitSha: 'a'.repeat(40), deploymentId: 'deployment-proof' },
      after: { commitSha: 'a'.repeat(40), deploymentId: 'deployment-proof' },
    },
    categories: {
      'for-you': forYou,
      poker,
      'casino-slots': slots,
      sports,
    },
    canonicalCrawl: forYou,
    aliases: {
      checked: 11,
      groups: 4,
      winners: 4,
      fingerprint: createHash('sha256')
        .update(SUP07_ALIASES.map(alias => `${alias.reference}:${alias.winner}:${alias.key}`).join('|'))
        .digest('hex')
        .slice(0, 16),
    },
    aliasState: {
      reelsRead: 7,
      postsRead: 4,
      reelFailures: [],
      postFailures: [],
      storageObjectsProven: 4,
    },
    accountCollections: { mine: collection, saved: collection },
    checks: [...REQUIRED_RECEIPT_CHECKS],
    coverage: {
      healthStable: true,
      followingApi: { signedOutStatus: 401, signedInStatus: 200, reels: 0 },
      publicMobile: {
        oldBookmarkCanonicalized: true,
        loserAliasRenderedCanonicalWinner: true,
        staleStorageRetired: true,
        hostileDropUsedStableEmbed: true,
        midFlightDropRetainedPlayer: true,
        retryRecoveredSports: true,
        activePlayers: 1,
        browserErrors: 0,
        injectedDrops: 1,
        readOnlyGuardInstalled: true,
        blockedMutationAttempts: 3,
        blockedMutationClasses: ['first-party-write'],
        allowedMutationAttempts: 0,
      },
      staleAuthMobile: {
        revoked: {
          apiStatuses: [401],
          reauthPrompt: true,
          activePlayers: 0,
          browserErrors: 0,
          authStorageCleared: false,
          blockedAuthRefresh: false,
          readOnlyGuardInstalled: true,
          blockedMutationAttempts: 7,
          blockedMutationClasses: ['first-party-write'],
          allowedMutationAttempts: 0,
        },
        expired: {
          apiStatuses: [],
          reauthPrompt: true,
          activePlayers: 0,
          browserErrors: 0,
          authStorageCleared: true,
          blockedAuthRefresh: true,
          readOnlyGuardInstalled: true,
          blockedMutationAttempts: 1,
          blockedMutationClasses: ['auth-refresh'],
          allowedMutationAttempts: 0,
        },
      },
      slotsDesktop: {
        responsibleGamingNotice: true,
        activePlayers: 1,
        browserErrors: 0,
        readOnlyGuardInstalled: true,
        blockedMutationAttempts: 0,
        blockedMutationClasses: [],
        allowedMutationAttempts: 0,
      },
      signedInMobile: {
        followingAuthorized: true,
        ordinaryArticleReaderPreserved: true,
        myReels: { synchronized: true, state: 'empty' },
        savedReels: { synchronized: true, state: 'empty' },
        browserErrors: 0,
        readOnlyGuardInstalled: true,
        blockedMutationAttempts: 5,
        blockedMutationClasses: ['first-party-write'],
        allowedMutationAttempts: 0,
      },
    },
  };
  assert.equal(validateReceipt(receipt), receipt);
  assert.throws(() => {
    const underfilled = {
      ...receipt.canonicalCrawl,
      reels: 2_000,
      uniqueIds: 2_000,
      uniqueAssets: 2_000,
      managed: 1_999,
      library: 1_998,
      mix: {
        ...receipt.canonicalCrawl.mix,
        topics: { poker: 1_994, slots: 4, sports: 1, unknown: 1 },
        origins: { video_library: 1_998, horse: 1, social_post: 1 },
        sourceTypes: { video_library: 1_998, youtube: 1, native: 1 },
        playbackTypes: { youtube_embed: 1_999, native: 1 },
        rightsStatuses: { embed_only: 1_999, user_authorized: 1 },
      },
    };
    validateReceipt({
      ...receipt,
      categories: { ...receipt.categories, 'for-you': underfilled },
      canonicalCrawl: underfilled,
    });
  }, /more than 2,000/);
  assert.throws(() => validateReceipt({ ...receipt, aliases: { checked: 10, groups: 4 } }), /every SUP-07/);
  assert.throws(
    () => validateReceipt({
      ...receipt,
      categories: { ...receipt.categories, sports: undefined },
    }),
    /omitted sports/,
  );
  assert.throws(
    () => validateReceipt({
      ...receipt,
      categories: {
        ...receipt.categories,
        poker: {
          ...receipt.categories.poker,
          mix: { ...receipt.categories.poker.mix, uniqueSources: SOURCE_DIVERSITY_FLOORS.poker - 1 },
        },
      },
    }),
    /source-diversity floor/,
  );
  assert.throws(
    () => validateReceipt({
      ...receipt,
      categories: {
        ...receipt.categories,
        'for-you': {
          ...receipt.categories['for-you'],
          horseAuthorProfiles: {
            ...receipt.categories['for-you'].horseAuthorProfiles,
            resolvedProfiles: 0,
          },
        },
      },
    }),
    /ordinary player profile/,
  );
  assert.throws(
    () => validateReceipt({
      ...receipt,
      coverage: { ...receipt.coverage, staleAuthMobile: undefined },
    }),
    /Revoked stale auth did not fail closed/,
  );
  assert.throws(
    () => validateReceipt({
      ...receipt,
      coverage: {
        ...receipt.coverage,
        publicMobile: { ...receipt.coverage.publicMobile, allowedMutationAttempts: 1 },
      },
    }),
    /allowed a mutation/,
  );
  assert.throws(
    () => validateReceipt({
      ...receipt,
      coverage: {
        ...receipt.coverage,
        staleAuthMobile: {
          ...receipt.coverage.staleAuthMobile,
          revoked: {
            ...receipt.coverage.staleAuthMobile.revoked,
            apiStatuses: [401, 200],
          },
        },
      },
    }),
    /received private Following media/,
  );
  assert.match(REELS_LIVE_CHECK, /const expectedSha = process\.env\.REELS_EXPECTED_SHA;[\s\S]*report\.expectedSha, expectedSha/);
  assert.match(
    E2E_WORKFLOW,
    /name: Assert complete sanitized Reels receipt[\s\S]*REELS_EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/,
  );
  assert.throws(
    () => validateReceipt({ ...receipt, checks: receipt.checks.slice(1) }),
    /check inventory is incomplete/,
  );
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
