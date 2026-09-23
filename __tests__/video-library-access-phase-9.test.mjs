import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const CATALOG = read('../pages/api/video-library/catalog.js');
const DATA = read('../src/data/videoLibraryData.js');
const AVAILABILITY = read('../src/lib/videoLibraryAvailability.js');
const INTEGRITY_MIGRATION = read('../supabase/migrations/20260906235959_video_reels_integrity_foundation.sql');
const MEMORY_CAMPAIGN = read('../src/components/memory/MemoryCampaignView.tsx');
const LIVE_HELP = read('../src/lib/liveHelp/contextCollector.ts');
const SUPABASE_TYPES = read('../src/types/supabase.ts');
const availabilityModule = await import(`data:text/javascript;base64,${Buffer.from(AVAILABILITY).toString('base64')}`);
const { BLOCKED_VIDEO_LIBRARY_IDS, VIDEO_LIBRARY_ALLOWED_TYPES, isVideoLibraryVideoAllowed } = availabilityModule;

test('the audited fallback source no longer contains inaccessible embeds', () => {
  const declaredIds = [...DATA.matchAll(/videoId:\s*'([^']+)'/g)].map(match => match[1]);
  const overlap = declaredIds.filter(videoId => BLOCKED_VIDEO_LIBRARY_IDS.includes(videoId));
  assert.equal(BLOCKED_VIDEO_LIBRARY_IDS.length, 32);
  assert.deepEqual(overlap, []);
});

test('the availability gate rejects fake, blocked, missing, and object-form IDs', () => {
  const fresh = new Date().toISOString();
  // Shared freshness contract: 7 days maximum verification age, 5 minutes
  // future skew, matching the installed SQL predicates. Boundaries are probed
  // one hour either side so test runtime can never straddle the limit.
  const HOUR_MS = 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * HOUR_MS;
  const oneDayOld = new Date(Date.now() - (25 * HOUR_MS)).toISOString();
  const withinContract = new Date(Date.now() - (SEVEN_DAYS_MS - HOUR_MS)).toISOString();
  const beyondContract = new Date(Date.now() - (SEVEN_DAYS_MS + HOUR_MS)).toISOString();
  const withinFutureSkew = new Date(Date.now() + (60 * 1000)).toISOString();
  const beyondFutureSkew = new Date(Date.now() + HOUR_MS).toISOString();
  assert.equal(isVideoLibraryVideoAllowed('524_3UypGkU'), false);
  assert.equal(isVideoLibraryVideoAllowed({ videoId: 'RpU9bwH-2WI' }), false);
  assert.equal(isVideoLibraryVideoAllowed('dbCLX6WbyJg'), false);
  assert.equal(isVideoLibraryVideoAllowed({ videoId: 'kiAPXh4jRHo', type: 'cash' }), false);
  assert.equal(isVideoLibraryVideoAllowed('FAKE89dbizc'), false);
  assert.equal(isVideoLibraryVideoAllowed('!!!'), false);
  assert.equal(isVideoLibraryVideoAllowed('too-short'), false);
  assert.equal(isVideoLibraryVideoAllowed('way-too-long-for-youtube'), false);
  assert.equal(isVideoLibraryVideoAllowed(null), false);
  assert.equal(isVideoLibraryVideoAllowed({ videoId: 'dQw4w9WgXcQ', type: 'cash' }), false);
  assert.equal(isVideoLibraryVideoAllowed({
    videoId: 'M7lc1UVf-VE', type: 'tournament', availabilityStatus: 'verified',
    embeddable: true, availabilityCheckedAt: fresh,
  }), true);
  assert.equal(isVideoLibraryVideoAllowed({
    videoId: 'M7lc1UVf-VE', type: 'cash', availabilityStatus: 'verified',
    embeddable: true, availabilityCheckedAt: oneDayOld,
  }), true, '25 hours old is allowed: one daily verifier run cannot renew every row inside 24 hours');
  assert.equal(isVideoLibraryVideoAllowed({
    videoId: 'M7lc1UVf-VE', type: 'cash', availabilityStatus: 'verified',
    embeddable: true, availabilityCheckedAt: withinContract,
  }), true, '7 days minus 1 hour is inside the shared contract');
  assert.equal(isVideoLibraryVideoAllowed({
    videoId: 'M7lc1UVf-VE', type: 'cash', availabilityStatus: 'verified',
    embeddable: true, availabilityCheckedAt: beyondContract,
  }), false, '7 days plus 1 hour has expired and must fail closed');
  assert.equal(isVideoLibraryVideoAllowed({
    videoId: 'M7lc1UVf-VE', type: 'cash', availabilityStatus: 'verified',
    embeddable: true, availabilityCheckedAt: withinFutureSkew,
  }), true, 'one minute of clock skew is tolerated');
  assert.equal(isVideoLibraryVideoAllowed({
    videoId: 'M7lc1UVf-VE', type: 'cash', availabilityStatus: 'verified',
    embeddable: true, availabilityCheckedAt: beyondFutureSkew,
  }), false, 'a verification dated beyond the 5 minute skew must fail closed');
  // The longer expiry bound never admits an unproven record, however recent.
  for (const [label, overrides] of [
    ['unknown status', { availabilityStatus: 'unknown' }],
    ['missing status', { availabilityStatus: undefined }],
    ['null status', { availabilityStatus: null }],
    ['unavailable status', { availabilityStatus: 'unavailable' }],
    ['error status', { availabilityStatus: 'error' }],
    ['embedding disabled', { embeddable: false }],
    ['embeddable unknown', { embeddable: null }],
    ['truthy non-boolean embeddable', { embeddable: 'true' }],
    ['null checked-at', { availabilityCheckedAt: null }],
    ['missing checked-at', { availabilityCheckedAt: undefined }],
    ['unparseable checked-at', { availabilityCheckedAt: 'not-a-date' }],
  ]) {
    assert.equal(isVideoLibraryVideoAllowed({
      videoId: 'M7lc1UVf-VE', type: 'cash', availabilityStatus: 'verified',
      embeddable: true, availabilityCheckedAt: fresh, ...overrides,
    }), false, `${label} must fail closed`);
  }
  assert.equal(isVideoLibraryVideoAllowed({
    videoId: 'M7lc1UVf-VE', type: 'tournament', availabilityStatus: 'verified',
    embeddable: true, availabilityCheckedAt: '2020-01-01T00:00:00.000Z',
  }), false);
  assert.equal(isVideoLibraryVideoAllowed({ videoId: 'slot-video', type: 'slots' }), false);
  assert.deepEqual(VIDEO_LIBRARY_ALLOWED_TYPES, ['cash', 'tournament']);
});

test('live, fallback, bookmark, and player entry points share the availability gate', () => {
  assert.match(PAGE, /STATIC_VIDEOS[\s\S]*\.filter\(isVideoLibraryVideoAllowed\)/);
  assert.match(PAGE, /payload\.data[\s\S]*\.filter\(isVideoLibraryVideoAllowed\)/);
  assert.match(PAGE, /if \(!isVideoLibraryVideoAllowed\(requestedVideoId\)\)/);
  assert.match(PAGE, /video\?\.videoId !== requestedVideoId \|\| !isVideoLibraryVideoAllowed\(video\)/);
  assert.match(CATALOG, /query\.not\('youtube_video_id', 'in'/);
  assert.match(CATALOG, /query\.in\('type', VIDEO_LIBRARY_ALLOWED_TYPES\)/);
  assert.match(CATALOG, /from\('video_library_public_catalog'\)/);
  assert.match(INTEGRITY_MIGRATION, /CREATE OR REPLACE VIEW public\.video_library_public_catalog[\s\S]*fn_is_video_library_asset_eligible/);
  assert.match(INTEGRITY_MIGRATION, /NOT EXISTS \([\s\S]*youtube_embed_failures[\s\S]*verification_status = 'confirmed'[\s\S]*resolved = false/);
  assert.doesNotMatch(CATALOG, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|/);
  assert.match(CATALOG, /map\(normaliseVideo\)\.filter\(isVideoLibraryVideoAllowed\)/);
  assert.match(CATALOG, /idsRequested && ids\.length === 0/);
  assert.match(CATALOG, /Invalid video ids filter/);
  assert.match(CATALOG, /\^\[A-Za-z0-9_-\]\{11\}\$/);
});

test('build-health fixes keep memory reference practice outside unverified account progression', () => {
  assert.match(MEMORY_CAMPAIGN, /\.from\('memory_charts_gold'\)/);
  assert.doesNotMatch(MEMORY_CAMPAIGN, /\.from\('memory_game_sessions'\)/);
  assert.doesNotMatch(MEMORY_CAMPAIGN, /\.from\('user_level_progress'\)/);
  assert.match(MEMORY_CAMPAIGN, /Local Range Reference Practice/);
  assert.match(MEMORY_CAMPAIGN, /Account Progress[\s\S]*Not Recorded/);
  assert.match(MEMORY_CAMPAIGN, /Local campaign answers never mutate account progress or rewards/);
  assert.match(LIVE_HELP, /\.select\('game_id, gtow_score, score_scale, created_at, attempt_id, training_attempts![^']+'\)/);
  assert.match(LIVE_HELP, /\.eq\('training_attempts\.status', 'completed'\)/);
  assert.match(LIVE_HELP, /\.eq\('training_attempts\.practice_only', false\)/);
  assert.match(LIVE_HELP, /signedTrainingScore\(session\)/);
  assert.match(SUPABASE_TYPES, /memory_game_sessions: \{/);
  assert.match(SUPABASE_TYPES, /training_sessions: \{[\s\S]*gtow_score: number/);
});
