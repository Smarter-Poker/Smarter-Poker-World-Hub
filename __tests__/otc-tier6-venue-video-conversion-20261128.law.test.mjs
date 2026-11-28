/**
 * OTC TIER 6 VENUE FOLLOW CONVERSION, VIDEO-TO-GTO PRACTICE BRIDGE &
 * MOBILE VIDEO WATCH OVERLAY ARBITRATION CI FORTRESS (2026-11-28)
 *
 * Permanent root-cause anti-regression laws covering:
 *   1. Guest "Follow" taps on `/hub/venues/[id]` keep optimistic localStorage
 *      persistence, record a deduped pending guest spot (`sp_saved_spots_v1`)
 *      that auto-syncs to cloud via `syncGuestSavedSpotsToCloud`, track
 *      `seo_venue_follow_signup_click`, dispatch `sp:peak-utility-pwa`, and
 *      open `SmarterQuickSignupSheet` with `redirectPath` while keeping
 *      unfollow and authenticated follow behavior completely intact.
 *   2. `/hub/video-library/watch/[videoId]/[[...slug]].js` mounts a crisp
 *      `#SMARTERDESIGN` Video-To-GTO Practice & Study Streak Bridge for guests
 *      above the single `SmarterAccountUnlockGate` (`#0b1120`, `1px solid #1e3a5f`,
 *      `0px` corners, `#2563eb` / `#38bdf8`, `>=44px` buttons, flex-wrap 0px
 *      overflow) wiring both Practice and Bookmark CTAs into telemetry,
 *      `sp_saved_spots_v1`, and `openQuickSignup`.
 *   3. `src/components/news/NewsletterCaptureBar.js` includes
 *      `'/hub/video-library/watch/'` in `INTERACTIVE_CONVERSION_PREFIXES` while
 *      leaving pure editorial routes untouched and keeping the app shell light.
 *   4. House style (Title Case, zero em dashes, zero banned gold hex colors,
 *      zero rounded SaaS radii on watch page, zero banned venue claims).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const { create, act } = require('react-test-renderer');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function compileModule(relPath, customRequire, globals = {}) {
  const src = read(relPath);
  const compiled = ts.transpileModule(src, {
    fileName: path.basename(relPath),
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: mod.exports,
    module: mod,
    console: { log() {}, warn() {}, error() {} },
    process: { env: {} },
    URLSearchParams,
    URL,
    Date,
    Set,
    Map,
    Promise,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    require: customRequire,
    ...globals,
  });
  return mod.exports;
}

function makeMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(String(k), String(v)); },
    removeItem: (k) => { data.delete(String(k)); },
    clear: () => { data.clear(); },
    _map: data,
  };
}

function loadSyncGuestSavedSpotsToCloud() {
  const bannerExports = compileModule(
    'src/components/seo/SmarterUnlockedWelcomeBanner.jsx',
    (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === 'next/link') return { __esModule: true, default: () => null };
      if (name === 'next/router') return { useRouter: () => ({ asPath: '/hub' }) };
      if (name.endsWith('seoFunnelTelemetry')) return { trackSeoFunnelEvent: () => {} };
      if (name.endsWith('.module.css')) return {};
      throw new Error(`Unexpected import in SmarterUnlockedWelcomeBanner: ${name}`);
    },
  );
  return bannerExports.syncGuestSavedSpotsToCloud;
}

function loadNewsletterPureHelpers() {
  const src = read('src/components/news/NewsletterCaptureBar.js');
  const fnStart = src.indexOf('export function normalizeCapturePath');
  const fnEnd = src.indexOf('export default function NewsletterCaptureBar');
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'Pure helper slice must exist above default export');
  const pureSnippet = src.slice(fnStart, fnEnd).replace(/^export\s+function\s+/gm, 'function ');
  const sb = { exports: {} };
  vm.runInNewContext(
    `${pureSnippet}
exports.isNewsletterCaptureRoute = isNewsletterCaptureRoute;
exports.isInteractiveConversionRoute = isInteractiveConversionRoute;
exports.shouldSuppressNewsletterBar = shouldSuppressNewsletterBar;`,
    sb,
  );
  return sb.exports;
}

// ── LAW 1: Guest Venue Follow Conversion & Cloud Sync ───────────────────────
test('OTC TIER 6 LAW 1: guest Follow tap on /hub/venues/[id] persists pending cloud follow, fires telemetry + Peak-Utility PWA + Quick Signup, preserves unfollow & authed follow, and syncs to cloud', async () => {
  const venueSrc = read('pages/hub/venues/[id].js');

  assert.match(venueSrc, /import\s+\{\s*openQuickSignup\s*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/components\/seo\/SmarterQuickSignupSheet['"]/);
  assert.match(venueSrc, /import\s+\{\s*trackSeoFunnelEvent\s*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/lib\/seo\/seoFunnelTelemetry['"]/);

  const fnStart = venueSrc.indexOf('var handleFollow = function () {');
  const fnEnd = venueSrc.indexOf('var handleShare = async function () {', fnStart);
  assert.ok(fnStart > 0 && fnEnd > fnStart, 'handleFollow function slice must exist');
  const handleFollowSlice = venueSrc.slice(fnStart, fnEnd);

  // Order & structure guards inside handleFollow
  const setSpotIdx = handleFollowSlice.indexOf("setItem('sp_saved_spots_v1'");
  const trackIdx = handleFollowSlice.indexOf("trackSeoFunnelEvent('seo_venue_follow_signup_click'");
  const pwaIdx = handleFollowSlice.indexOf("new CustomEvent('sp:peak-utility-pwa'");
  const signupIdx = handleFollowSlice.indexOf('openQuickSignup({');
  assert.ok(
    setSpotIdx > 0 && trackIdx > setSpotIdx && pwaIdx > trackIdx && signupIdx > pwaIdx,
    'Guest follow must persist sp_saved_spots_v1, track telemetry, dispatch sp:peak-utility-pwa, then openQuickSignup',
  );
  assert.match(handleFollowSlice, /redirectPath:\s*venuePath/, 'openQuickSignup must receive redirectPath (not returnPath)');
  assert.doesNotMatch(handleFollowSlice, /returnPath:/, 'openQuickSignup must not use unknown returnPath key');
  assert.doesNotMatch(handleFollowSlice, /\bVerified\s+(?:Poker\s+)?(?:Rooms|Venues)\b/i, 'handleFollow must never use banned Verified Rooms/Venues claims');

  // Behavioral harness: execute extracted handleFollow for guest follow, guest unfollow, and authenticated follow
  const localStore = makeMemoryStorage();
  const dispatchedEvents = [];
  const trackedEvents = [];
  const signupCalls = [];
  const fetchCalls = [];
  let isFollowedState = false;
  let followerCountState = 10;

  function CustomEventMock(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }

  const runFollow = (currentFollowed) => {
    isFollowedState = currentFollowed;
    const mockWindow = {
      localStorage: localStore,
      dispatchEvent: (ev) => dispatchedEvents.push(ev),
    };
    const sandbox = {
      id: 'bellagio-las-vegas',
      venue: { name: 'Bellagio Poker Room' },
      isFollowed: isFollowedState,
      followerCount: followerCountState,
      setIsFollowed: (v) => { isFollowedState = v; },
      setFollowerCount: (fn) => { followerCountState = typeof fn === 'function' ? fn(followerCountState) : fn; },
      localStorage: localStore,
      window: mockWindow,
      CustomEvent: CustomEventMock,
      Date,
      JSON,
      Math,
      Array,
      Object,
      String,
      console: { warn() {} },
      trackSeoFunnelEvent: (name, props) => trackedEvents.push({ name, props }),
      openQuickSignup: (detail) => signupCalls.push(detail),
      fetch: (url, opts) => {
        fetchCalls.push({ url, opts });
        return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
      },
    };
    vm.runInNewContext(`${handleFollowSlice}\nhandleFollow();`, sandbox);
  };

  // Pre-seed 25 spots to prove dedupe + cap at 25
  const preseeded = Array.from({ length: 25 }, (_, i) => ({
    id: `old-spot-${i}`,
    toolSlug: 'poker-tool',
    toolName: 'Saved Spot',
    summaryText: `Spot ${i}`,
    url: `/tools/spot-${i}`,
    savedAt: '2026-11-28T00:00:00.000Z',
  }));
  localStore.setItem('sp_saved_spots_v1', JSON.stringify(preseeded));

  // 1) Guest taps Follow (newState === true)
  runFollow(false);
  assert.equal(isFollowedState, true);
  assert.equal(followerCountState, 11);
  assert.deepEqual(JSON.parse(localStore.getItem('followed-venues')), ['bellagio-las-vegas']);

  const savedSpots = JSON.parse(localStore.getItem('sp_saved_spots_v1'));
  assert.equal(savedSpots.length, 25, 'sp_saved_spots_v1 must remain capped at 25');
  assert.equal(savedSpots[0].id, 'venue-follow-bellagio-las-vegas');
  assert.equal(savedSpots[0].kind, 'venue-follow');
  assert.equal(savedSpots[0].toolSlug, 'venue-follow');
  assert.equal(savedSpots[0].label, 'Bellagio Poker Room');
  assert.equal(savedSpots[0].path, '/hub/venues/bellagio-las-vegas');
  assert.equal(savedSpots[0].url, '/hub/venues/bellagio-las-vegas');

  assert.equal(trackedEvents.length, 1);
  assert.equal(trackedEvents[0].name, 'seo_venue_follow_signup_click');
  assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents[0].props)), {
    venueId: 'bellagio-las-vegas',
    venueName: 'Bellagio Poker Room',
  });

  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'sp:peak-utility-pwa');
  assert.deepEqual(JSON.parse(JSON.stringify(dispatchedEvents[0].detail)), { unlockKey: 'venue-follow' });

  assert.equal(signupCalls.length, 1);
  assert.equal(signupCalls[0].unlockKey, 'venue-follow');
  assert.equal(signupCalls[0].source, 'venue-follow-button');
  assert.equal(signupCalls[0].redirectPath, '/hub/venues/bellagio-las-vegas');
  assert.equal(signupCalls[0].title, 'Save Your Followed Room & Get Live Waitlist Alerts');
  assert.match(signupCalls[0].subtitle, /30-Day Free VIP \+ 500 Diamonds/);
  assert.equal(fetchCalls.length, 0, 'Guest follow must not POST /api/poker/follow');

  // 2) Guest taps Unfollow (newState === false) -> localStorage removed, no modal/event
  runFollow(true);
  assert.equal(isFollowedState, false);
  assert.deepEqual(JSON.parse(localStore.getItem('followed-venues')), []);
  assert.equal(signupCalls.length, 1, 'Guest unfollow must not reopen quick signup');
  assert.equal(dispatchedEvents.length, 1, 'Guest unfollow must not dispatch sp:peak-utility-pwa');
  assert.equal(trackedEvents.length, 1, 'Guest unfollow must not fire signup click telemetry');

  // 3) Authenticated follow -> calls /api/poker/follow, never opens quick signup
  localStore.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'tok_live_1234567890abcdef' }));
  runFollow(false);
  assert.equal(fetchCalls.length, 1, 'Authenticated follow must POST /api/poker/follow');
  assert.equal(fetchCalls[0].url, '/api/poker/follow');
  assert.equal(signupCalls.length, 1, 'Authenticated follow must not open quick signup');

  // 4) End-to-end cloud sync through SmarterUnlockedWelcomeBanner.syncGuestSavedSpotsToCloud
  const syncGuestSavedSpotsToCloud = loadSyncGuestSavedSpotsToCloud();
  const sessionStore = makeMemoryStorage();
  const syncedPayloads = [];
  const synced = await syncGuestSavedSpotsToCloud({
    localStorage: localStore,
    sessionStorage: sessionStore,
    fetch: async (url, opts) => {
      syncedPayloads.push({ url, body: JSON.parse(opts.body) });
      return { ok: true };
    },
  });
  assert.equal(synced, true, 'syncGuestSavedSpotsToCloud must sync persisted venue-follow spot');
  assert.equal(syncedPayloads.length, 1);
  assert.equal(syncedPayloads[0].url, '/api/training/tool-records');
  assert.equal(syncedPayloads[0].body.data.spots[0].id, 'venue-follow-bellagio-las-vegas');
  assert.equal(syncedPayloads[0].body.data.spots[0].toolSlug, 'venue-follow');
  assert.equal(syncedPayloads[0].body.data.spots[0].summaryText, 'Bellagio Poker Room');
  assert.equal(syncedPayloads[0].body.data.spots[0].url, '/hub/venues/bellagio-las-vegas');
});

// ── LAW 2: Video-To-GTO Practice & Study Streak Bridge ──────────────────────
test('OTC TIER 6 LAW 2: VideoWatchPage mounts #SMARTERDESIGN Video-To-GTO Practice & Study Streak Bridge for guests, wires Practice & Bookmark CTAs + cloud sync, hides for signed-in users, and preserves single gate', async () => {
  const watchSrc = read('pages/hub/video-library/watch/[videoId]/[[...slug]].js');

  // Preserve single SmarterAccountUnlockGate and SEO/Defer contracts
  const gateMatches = watchSrc.match(/<SmarterAccountUnlockGate\b/g) || [];
  assert.equal(gateMatches.length, 1, 'Watch page must keep exactly one SmarterAccountUnlockGate');
  assert.match(watchSrc, /VideoLibrarySEOHead/);
  assert.match(watchSrc, /jsonLd=\{jsonLd\}/);
  assert.match(watchSrc, /<DeferUntilNear[^>]*>\s*<SmarterAccountUnlockGate/);

  // Bridge must appear above SmarterAccountUnlockGate
  const bridgeIdx = watchSrc.indexOf('data-testid="video-gto-practice-bridge"');
  const gateIdx = watchSrc.indexOf('<SmarterAccountUnlockGate');
  assert.ok(bridgeIdx > 0 && gateIdx > bridgeIdx, 'Video-To-GTO Practice Bridge must be mounted above SmarterAccountUnlockGate');

  // Compile & render VideoWatchPage as guest and as signed-in user
  const localStore = makeMemoryStorage();
  const trackedEvents = [];
  const signupCalls = [];
  let mockUser = null;

  const noopComp = { __esModule: true, default: ({ children }) => React.createElement('div', null, children || null) };
  const mockWindow = {
    localStorage: localStore,
    location: { origin: 'https://smarter.poker' },
  };

  const watchMod = compileModule(
    'pages/hub/video-library/watch/[videoId]/[[...slug]].js',
    (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('.css')) return {};
      if (name === 'next/link') return { __esModule: true, default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children) };
      if (name === 'next/router') return { useRouter: () => ({ query: {}, push: () => Promise.resolve(true) }) };
      if (name === 'next/dynamic') return { __esModule: true, default: () => () => null };
      if (name.endsWith('AvatarContext')) return { useAvatar: () => ({ user: mockUser }) };
      if (name.endsWith('SmarterQuickSignupSheet')) return { openQuickSignup: (detail) => signupCalls.push(detail) };
      if (name.endsWith('seoFunnelTelemetry')) return { trackSeoFunnelEvent: (event, props) => trackedEvents.push({ event, props }) };
      if (name.endsWith('useVideoLibraryWatchTracking')) return { __esModule: true, default: () => ({ status: 'idle', resumeSeconds: 0, savedSeconds: 0 }) };
      if (name.endsWith('useVideoLibraryQueue')) return { __esModule: true, default: () => ({ queue: { items: [] }, advance: () => null, enqueueNext: () => {}, error: null }) };
      if (name.endsWith('useYouTubeErrorManager')) return { useYouTubeErrorManager: () => ({ ytError: false, errorInfo: null }) };
      if (name.endsWith('videoWatchHistory')) return { claimEarnedWatchReward: () => {} };
      if (name.endsWith('videoLibraryPlayback.mjs')) return { PLAYER_ORIGIN: 'https://www.youtube-nocookie.com' };
      if (name.endsWith('videoLibrarySocialShare.mjs')) return { videoLibrarySocialShareHref: () => '/hub/social-media' };
      if (name.endsWith('videoLibraryChannels.mjs')) return { CHANNEL_KEY_RE: /^[a-z0-9-]+$/i };
      if (name.endsWith('WatchPlaybackTools')) {
        return {
          __esModule: true,
          default: () => null,
          WatchDescription: () => null,
          subscribeWatchPlayer: () => {},
        };
      }
      if (name.endsWith('videoLibraryHelpSteps.mjs')) return { VIDEO_LIBRARY_HELP_STEPS: { watch: [] } };
      if (name.endsWith('hamburgerMenus')) return { getMenuConfig: () => ({ menuItems: [], bottomLinks: [] }) };
      if (name.endsWith('videoLibraryAvailability')) return { BLOCKED_VIDEO_LIBRARY_IDS: [], YOUTUBE_VIDEO_ID_RE: /^[a-zA-Z0-9_-]{11}$/, isVideoLibraryVideoAllowed: () => true };
      if (name.endsWith('videoLibraryCuration.mjs')) return { VIDEO_LIBRARY_POKER_TYPES: ['cash', 'tournament'], isCuratedFeedVideo: () => true, mixedContentFilter: () => '', durationSeconds: () => 600 };
      if (name.endsWith('videoLibraryWatch.mjs')) {
        return {
          VIDEO_ROW_FIELDS: '',
          VIDEO_TYPE_LABELS: { cash: 'Cash Game' },
          buildVideoJsonLd: () => [],
          buildVideoWatchWebPageJsonLd: () => ({}),
          buildWatchDescription: () => 'Desc',
          isIndexableWatchVideo: () => true,
          normaliseVideoRow: (r) => r,
          readableDate: () => 'Nov 28, 2026',
          readableDuration: () => '10 Minutes',
          renderVideoWatchMarkdown: () => '',
          videoThumbnailUrl: () => 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          watchPath: (v) => `/hub/video-library/watch/${v.videoId}/river-bluff-catch`,
          watchUrl: (v) => `https://smarter.poker/hub/video-library/watch/${v.videoId}/river-bluff-catch`,
        };
      }
      if (name.endsWith('videoLibraryCards')) return { formatViewCount: () => '12K Views', getVideoChannel: () => ({ name: 'HCL' }), getVideoMetaLine: () => '' };
      if (name.endsWith('videoLibraryChapters.mjs')) return { creatorChapters: () => [] };
      return noopComp;
    },
    { window: mockWindow, document: { hidden: false } },
  );

  const VideoWatchPage = watchMod.default;
  const pageProps = {
    unavailable: false,
    video: {
      videoId: 'dQw4w9WgXcQ',
      title: 'River Bluff Catch In 3-Bet Pot',
      type: 'cash',
      duration: '10:00',
      views: 12000,
      publishedAt: '2026-11-28T00:00:00Z',
    },
    channel: { name: 'Hustler Casino Live', initials: 'HC', logo: null },
    channelHref: '/hub/video-library/channels/hcl',
    description: 'Watch River Bluff Catch In 3-Bet Pot.',
    canonical: 'https://smarter.poker/hub/video-library/watch/dQw4w9WgXcQ/river-bluff-catch',
    indexable: true,
    jsonLd: [],
    chapters: [],
    channelVideos: [],
    relatedVideos: [],
  };

  let tree;
  await act(async () => {
    tree = create(React.createElement(VideoWatchPage, pageProps));
  });

  const bridge = tree.root.find((n) => n.props?.['data-testid'] === 'video-gto-practice-bridge');
  assert.equal(bridge.props.style.background, '#0b1120');
  assert.equal(bridge.props.style.border, '1px solid #1e3a5f');
  assert.equal(bridge.props.style.borderRadius, 0);

  const collectText = (node) => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (!node || !Array.isArray(node.children)) return '';
    return node.children.map(collectText).join(' ');
  };
  const bridgeText = collectText(bridge);
  assert.match(bridgeText, /INTERACTIVE VIDEO TO GTO BRIDGE/);
  assert.match(bridgeText, /Practice This Strategy Spot In 107 GTO Games/);

  const practiceBtn = tree.root.find((n) => n.props?.['data-testid'] === 'video-bridge-practice-cta');
  const bookmarkBtn = tree.root.find((n) => n.props?.['data-testid'] === 'video-bridge-bookmark-cta');
  assert.ok(practiceBtn.props.style.minHeight >= 44, 'Practice CTA must meet 44px touch target');
  assert.ok(bookmarkBtn.props.style.minHeight >= 44, 'Bookmark CTA must meet 44px touch target');
  assert.equal(practiceBtn.props.style.borderRadius, 0);
  assert.equal(bookmarkBtn.props.style.borderRadius, 0);
  assert.equal(practiceBtn.props.style.background, '#2563eb');
  assert.equal(bookmarkBtn.props.style.color, '#38bdf8');

  // Click Practice CTA
  await act(async () => {
    practiceBtn.props.onClick();
  });
  assert.equal(trackedEvents.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents[0])), {
    event: 'seo_video_bridge_click',
    props: { action: 'practice', videoId: 'dQw4w9WgXcQ' },
  });
  assert.equal(signupCalls.length, 1);
  assert.equal(signupCalls[0].unlockKey, 'video-practice');
  assert.equal(signupCalls[0].redirectPath, '/hub/video-library/watch/dQw4w9WgXcQ/river-bluff-catch');
  assert.equal(localStore.getItem('sp_saved_spots_v1'), null, 'Practice CTA should not create a bookmark');

  // Click Bookmark CTA
  await act(async () => {
    bookmarkBtn.props.onClick();
  });
  assert.equal(trackedEvents.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents[1])), {
    event: 'seo_video_bridge_click',
    props: { action: 'bookmark', videoId: 'dQw4w9WgXcQ' },
  });
  assert.equal(signupCalls.length, 2);
  assert.equal(signupCalls[1].unlockKey, 'video-bookmark');
  assert.equal(signupCalls[1].redirectPath, '/hub/video-library/watch/dQw4w9WgXcQ/river-bluff-catch');

  const storedBookmarks = JSON.parse(localStore.getItem('sp_saved_spots_v1'));
  assert.equal(storedBookmarks.length, 1);
  assert.equal(storedBookmarks[0].id, 'video-bookmark-dQw4w9WgXcQ');
  assert.equal(storedBookmarks[0].kind, 'video-bookmark');
  assert.equal(storedBookmarks[0].toolSlug, 'video-bookmark');
  assert.equal(storedBookmarks[0].label, 'River Bluff Catch In 3-Bet Pot');
  assert.equal(storedBookmarks[0].path, '/hub/video-library/watch/dQw4w9WgXcQ/river-bluff-catch');
  assert.equal(storedBookmarks[0].url, '/hub/video-library/watch/dQw4w9WgXcQ/river-bluff-catch');

  // Verify cloud sync of video-bookmark spot
  localStore.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'tok_live_video_9876543210' }));
  const syncGuestSavedSpotsToCloud = loadSyncGuestSavedSpotsToCloud();
  const syncedPayloads = [];
  const synced = await syncGuestSavedSpotsToCloud({
    localStorage: localStore,
    sessionStorage: makeMemoryStorage(),
    fetch: async (url, opts) => {
      syncedPayloads.push({ url, body: JSON.parse(opts.body) });
      return { ok: true };
    },
  });
  assert.equal(synced, true, 'syncGuestSavedSpotsToCloud must sync persisted video-bookmark spot');
  assert.equal(syncedPayloads[0].body.data.spots[0].id, 'video-bookmark-dQw4w9WgXcQ');
  assert.equal(syncedPayloads[0].body.data.spots[0].toolSlug, 'video-bookmark');

  // Signed-in users should NOT see the guest conversion bridge
  mockUser = { id: 'signed-in-member-1' };
  let authedTree;
  await act(async () => {
    authedTree = create(React.createElement(VideoWatchPage, pageProps));
  });
  const authedBridges = authedTree.root.findAll((n) => n.props?.['data-testid'] === 'video-gto-practice-bridge');
  assert.equal(authedBridges.length, 0, 'Signed-in members must not see guest Video-To-GTO signup bridge');

  await act(async () => {
    tree.unmount();
    authedTree.unmount();
  });
});

// ── LAW 3: Mobile Overlay Arbitration For /hub/video-library/watch/ ─────────
test('OTC TIER 6 LAW 3: NewsletterCaptureBar adds /hub/video-library/watch/ to INTERACTIVE_CONVERSION_PREFIXES without disturbing pure editorial routes or app shell weight', () => {
  const barSrc = read('src/components/news/NewsletterCaptureBar.js');
  assert.match(barSrc, /['"]\/hub\/video-library\/watch\/['"]/);
  assert.doesNotMatch(barSrc, /lib\/analytics/, 'NewsletterCaptureBar must stay free of lib/analytics');
  assert.doesNotMatch(barSrc, /SmarterQuickSignupSheet|solverRanges|LiveStreamService/, 'NewsletterCaptureBar must stay lightweight for _app shell');

  const {
    isNewsletterCaptureRoute,
    isInteractiveConversionRoute,
    shouldSuppressNewsletterBar,
  } = loadNewsletterPureHelpers();

  const videoWatchRoutes = [
    '/hub/video-library/watch/dQw4w9WgXcQ',
    '/hub/video-library/watch/dQw4w9WgXcQ/river-bluff-catch',
  ];

  for (const route of videoWatchRoutes) {
    assert.equal(isInteractiveConversionRoute(route), true, `Must cover ${route}`);
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 390, scrollRatio: 0.4 }),
      true,
      `390px mobile below 85% scroll must suppress Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 390, scrollRatio: 0.85 }),
      false,
      `390px mobile at >=85% scroll must allow Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 1280, scrollRatio: 0.4 }),
      false,
      `Desktop without tool engagement must allow Weekly Wire bar on ${route}`,
    );
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: route, viewportWidth: 1280, scrollRatio: 0.9, quickSignupOpen: true }),
      true,
      `Open quick signup sheet must suppress Weekly Wire bar on ${route}`,
    );
  }

  for (const editorialRoute of ['/hub/news', '/hub/article/wsop-main-event', '/hub/wire', '/hub/magazine']) {
    assert.equal(isInteractiveConversionRoute(editorialRoute), false, `Editorial route ${editorialRoute} must stay untouched`);
    assert.equal(
      shouldSuppressNewsletterBar({ pathname: editorialRoute, viewportWidth: 390, scrollRatio: 0.3 }),
      false,
      `Editorial route ${editorialRoute} must keep immediate Weekly Wire capture on mobile`,
    );
    assert.equal(isNewsletterCaptureRoute(editorialRoute), true);
  }
});

// ── LAW 4: House Style (#SMARTERDESIGN, Zero Gold, Zero Em Dash, Zero Rounded) ─
test('OTC TIER 6 LAW 4: watch page and venue follow conversion block obey #SMARTERDESIGN (zero banned gold, zero rounded SaaS radii, zero em dashes in copy)', () => {
  const watchSrc = read('pages/hub/video-library/watch/[videoId]/[[...slug]].js');
  const venueSrc = read('pages/hub/venues/[id].js');
  const barSrc = read('src/components/news/NewsletterCaptureBar.js');

  const bannedGoldRe = /#(?:f2b84b|d4a853|ffd700|f59e0b|fbbf24|eab308)\b/i;
  assert.doesNotMatch(watchSrc, bannedGoldRe, 'Watch page must contain zero banned gold/amber hex colors');
  assert.doesNotMatch(
    watchSrc,
    /borderRadius:\s*(8|10|12|14|16|18|20|24|999)\b|border-radius:\s*(8|10|12|14|16|18|20|24|999)px/,
    'Watch page must keep 0px sharp hardware corners (zero generic SaaS radii)',
  );

  const followStart = venueSrc.indexOf('var handleFollow = function () {');
  const followEnd = venueSrc.indexOf('var handleShare = async function () {', followStart);
  const followSlice = venueSrc.slice(followStart, followEnd);
  assert.doesNotMatch(followSlice, bannedGoldRe, 'Venue follow block must contain zero banned gold hex colors');

  // Zero em dashes in user-facing copy of our added code blocks
  const bridgeStart = watchSrc.indexOf('const handleBridgePractice =');
  const bridgeEnd = watchSrc.indexOf('Below-the-fold account panels', bridgeStart);
  const bridgeSlice = watchSrc.slice(bridgeStart, bridgeEnd);
  assert.doesNotMatch(bridgeSlice, /\u2014/, 'Video-To-GTO bridge must contain zero em dashes');
  assert.doesNotMatch(followSlice.replace(/\/\/[^\n]*/g, ''), /\u2014/, 'Venue follow conversion copy must contain zero em dashes');
  assert.doesNotMatch(barSrc.replace(/\/\/[^\n]*/g, ''), /\u2014/, 'NewsletterCaptureBar copy must contain zero em dashes');
});
