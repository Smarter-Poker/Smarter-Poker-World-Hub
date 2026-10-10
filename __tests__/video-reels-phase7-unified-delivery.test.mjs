import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  REELS_FEED_MODES,
  REELS_MOBILE_BUDGETS,
  boundedReelWindow,
  capReelsInMemory,
  dataSaverEnabled,
  reelsFeedModeContract,
  reelsFeedModeForQuery,
  restoreReelsPosition,
} from '../src/lib/reelsDeliveryContract.mjs';
import {
  REEL_FEEDBACK_ACTIONS,
  applyReelFeedbackState,
  reelMatchesFeedback,
} from '../src/lib/reelsFeedback.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/reels.js');
const LIBRARY = read('../src/components/social/Reels.jsx');
const SOCIAL = read('../src/components/social/ReelsFeedCarousel.jsx');
const VIDEO_LIBRARY = read('../pages/hub/video-library.js');
const CONTROLLER = read('../src/lib/reelsFeedController.mjs');
const METRICS_API = read('../pages/api/reels/delivery-metrics.js');
const METRICS_SQL = read('../supabase/migrations/20261004180000_reels_delivery_metrics.sql');
const METRICS_SEQUENCE_PRIVILEGES_SQL = read('../supabase/migrations/20261004182500_reels_delivery_metrics_sequence_privileges.sql');
const PLAYER = read('../src/components/reels/ReelPlayerFrame.jsx');

test('all three public Reel surfaces use the one canonical feed controller', () => {
  for (const source of [PAGE, LIBRARY, SOCIAL]) {
    assert.match(source, /loadCanonicalReelsWindow/);
    assert.doesNotMatch(source, /scanReelsContinuations/);
  }
  assert.match(CONTROLLER, /fetchPokerReels/);
  assert.match(CONTROLLER, /scanReelsContinuations/);
  assert.match(CONTROLLER, /capReelsInMemory/);
});

test('feed modes are explicit, stable, and auth safe', () => {
  assert.deepEqual(REELS_FEED_MODES.map((mode) => mode.id), [
    'for-you', 'following', 'latest', 'learning', 'shorts',
  ]);
  assert.equal(reelsFeedModeContract('following', { signedIn: false }).id, 'for-you');
  assert.equal(reelsFeedModeContract('following', { signedIn: true }).id, 'following');
  assert.equal(reelsFeedModeForQuery({ mode: 'shorts' }), 'shorts');
  assert.equal(reelsFeedModeForQuery({ category: 'following' }), 'following');
  assert.equal(reelsFeedModeForQuery({ mode: 'hostile' }), 'for-you');
});

test('bounded playback and hostile persisted state cannot mount an unbounded player list', () => {
  const rows = Array.from({ length: 500 }, (_, index) => ({ id: `row-${index}` }));
  assert.deepEqual(boundedReelWindow(rows, 250).map((row) => row.id), ['row-249', 'row-250', 'row-251']);
  assert.equal(capReelsInMemory(rows, 'row-250').length, REELS_MOBILE_BUDGETS.maxFeedItemsInMemory);
  assert.equal(restoreReelsPosition({ reelId: 'not-a-uuid' }, rows), 0);
  const id = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(restoreReelsPosition({ reelId: id }, [{ id }]), 0);
  assert.equal(dataSaverEnabled({ connection: { saveData: true } }), true);
  assert.equal(dataSaverEnabled({ connection: { effectiveType: '2g' } }), true);
});

test('delivery metrics are aggregate-only and service-role protected', () => {
  assert.match(METRICS_SQL, /ENABLE ROW LEVEL SECURITY/);
  assert.match(METRICS_SQL, /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated/);
  assert.match(METRICS_SQL, /GRANT USAGE, SELECT ON SEQUENCE public\.reels_delivery_metrics_id_seq TO service_role/);
  assert.match(METRICS_SEQUENCE_PRIVILEGES_SQL, /REVOKE ALL ON SEQUENCE public\.reels_delivery_metrics_id_seq\s+FROM PUBLIC, anon, authenticated/);
  assert.match(METRICS_SEQUENCE_PRIVILEGES_SQL, /GRANT USAGE, SELECT ON SEQUENCE public\.reels_delivery_metrics_id_seq\s+TO service_role/);
  assert.match(METRICS_SQL, /Stores no user, reel, session, IP, URL, or device identifier/);
  assert.doesNotMatch(METRICS_SQL, /user_id|reel_id|session_id|ip_address|user_agent/i);
  assert.match(METRICS_API, /LIMITS\.write/);
  assert.match(METRICS_API, /Request body too large/);
  assert.match(METRICS_API, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('the mobile category rail and shared text-first card are wired into public delivery', () => {
  assert.match(PAGE, /<ReelsModeRail/);
  assert.match(SOCIAL, /import ReelCard from '..\/reels\/ReelCard'/);
  assert.match(SOCIAL, /<ReelCard[\s\S]*?key=\{reel\.id\}[\s\S]*?textFirst/);
  assert.match(PAGE, /recordReelsDeliveryMetric/);
  assert.match(LIBRARY, /recordReelsDeliveryMetric/);
  assert.match(SOCIAL, /recordReelsDeliveryMetric/);
});

test('one player lifecycle shell and the complete feedback contract are shared', () => {
  for (const source of [PAGE, LIBRARY, SOCIAL]) {
    assert.match(source, /ReelPlayerFrame/);
    assert.match(source, /ReelFeedbackActions/);
  }
  assert.match(PLAYER, /data-reel-player="canonical"/);
  assert.deepEqual(REEL_FEEDBACK_ACTIONS.map((action) => action.id), [
    'not-interested', 'already-watched', 'wrong-category', 'hide-source',
  ]);
  const reel = { id: 'reel-1', channel_id: 'creator-1' };
  const hidden = applyReelFeedbackState({}, 'hide-source', reel);
  assert.equal(reelMatchesFeedback({ id: 'reel-2', channel_id: 'creator-1' }, hidden), true);
  assert.equal(reelMatchesFeedback({ id: 'reel-3', channel_id: 'creator-2' }, hidden), false);
});

test('the Video Library exposes every Phase 7 discovery view from verified catalog data', () => {
  for (const label of ['New Today', 'Shorts', 'Skill Level', 'Creator', 'Event', 'Under 10 Min']) {
    assert.match(VIDEO_LIBRARY, new RegExp(label));
  }
  assert.match(VIDEO_LIBRARY, /data-video-library-discovery/);
  assert.match(VIDEO_LIBRARY, /activeDiscoveryView\.videos/);
});
