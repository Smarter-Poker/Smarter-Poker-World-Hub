/**
 * OTC TIER 8 PREFLOP RANGE QUIZ MODE & VENUE STAKE ALERT + AUTHENTIC
 * AGGREGATERATING JSON-LD CI FORTRESS (2026-11-28)
 *
 * Permanent root-cause anti-regression laws covering:
 *   1. `pages/tools/preflop-ranges/[position].js` preserves PreflopRangeMatrixHub
 *      (SEOHead, JSON-LD, 13x13 matrix, SmarterCalculatorSaveBar) and single
 *      SmarterAccountUnlockGate while mounting a #SMARTERDESIGN interactive
 *      mode toggle (`Chart View` vs `Quiz Yourself (Tap Any Hand)`), blind
 *      13x13 tap-any-hand quiz matrix + quick prompts, instant evaluation
 *      against real `RFI` solver frequencies (`freq >= 50` Open Raise,
 *      `0 < freq < 50` Mixed / Low-Freq Open, `0` Fold), live `X/Y Correct`
 *      scoreboard, `sp:seo-tool-engaged` dispatch, canonical F1 telemetry
 *      (`seo_mini_gto_drill_answered`), and 2+ answer save CTA wired to
 *      `openQuickSignup`.
 *   2. `pages/hub/venues/[id].js` mounts `data-testid="venue-stake-alert-btn"`
 *      (`Alert Me For Live Stakes`) right beside the Follow button, persisting
 *      pending `stake-alert` spot in `sp_saved_spots_v1` (cloud-sync compatible),
 *      tracking `seo_venue_follow_signup_click` (`{ action: 'stake-alert', venueId }`),
 *      dispatching `sp:peak-utility-pwa` (`{ unlockKey: 'venue-follow' }`), and
 *      opening `openQuickSignup` with venue-specific title.
 *   3. `pages/hub/venues/[id].js` exports pure `buildAuthenticVenueAggregateRating`
 *      returning `null` unless `ratingValue` is finite in `[1, 5]` AND
 *      `reviewCount` is an integer `>= 3`, and attaches `aggregateRating` to
 *      venue JSON-LD ONLY when non-null (never fabricating from `trust_score`
 *      or `< 3` reviews).
 *   4. Strict house style: zero "Verified Rooms"/"Verified Venues", zero
 *      hardcoded room counts, zero em/en dashes, zero `&apos;` in JSX text,
 *      Title Case, zero banned gold hexes, zero rounded SaaS radii.
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
      esModuleInterop: true,
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
  };
}

function collectText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || !Array.isArray(node.children)) return '';
  return node.children.map(collectText).join('');
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

// ── LAW 1: Preflop Range Positional Quiz Mode ───────────────────────────────
test('OTC TIER 8 LAW 1: /tools/preflop-ranges/[position] preserves PreflopRangeMatrixHub & single gate, toggles Quiz Mode, evaluates real RFI frequencies, tracks F1 telemetry + sp:seo-tool-engaged, and unlocks 2+ answer Quick Signup CTA', async () => {
  const posSrc = read('pages/tools/preflop-ranges/[position].js');
  assert.match(posSrc, /<PreflopRangeMatrixHub\b/);
  assert.equal((posSrc.match(/<SmarterAccountUnlockGate\b/g) || []).length, 1, 'Must keep single SmarterAccountUnlockGate');
  assert.match(posSrc, /data-testid="preflop-quiz-toggle"/);
  assert.match(posSrc, /data-testid="preflop-quiz-panel"/);
  assert.match(posSrc, /data-testid="preflop-quiz-save-cta"/);

  const solverRanges = await import('../src/config/solverRanges.js');
  const trackedEvents = [];
  const signupCalls = [];
  const dispatchedEvents = [];

  function CustomEventMock(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }

  const mockWindow = {
    dispatchEvent: (ev) => dispatchedEvents.push(ev),
  };

  const posMod = compileModule(
    'pages/tools/preflop-ranges/[position].js',
    (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('PreflopRangeMatrixHub')) {
        return {
          __esModule: true,
          default: ({ unlockGateSlot, initialPosition, canonicalPath, markdownPath }) =>
            React.createElement(
              'div',
              {
                'data-testid': 'mock-preflop-hub',
                'data-pos': initialPosition,
                'data-canonical': canonicalPath,
                'data-markdown': markdownPath,
              },
              unlockGateSlot,
            ),
        };
      }
      if (name.endsWith('SmarterAccountUnlockGate')) {
        return {
          __esModule: true,
          default: (props) => React.createElement('div', { 'data-testid': 'mock-unlock-gate', ...props }),
        };
      }
      if (name.endsWith('SmarterQuickSignupSheet')) {
        return { openQuickSignup: (detail) => signupCalls.push(detail) };
      }
      if (name.endsWith('seoFunnelTelemetry')) {
        return { trackSeoFunnelEvent: (event, props) => trackedEvents.push({ event, props }) };
      }
      if (name.endsWith('solverRanges')) {
        return solverRanges;
      }
      if (name.endsWith('edgeCacheHeaders.mjs')) {
        return { setPublicSeoHtmlCache: () => {} };
      }
      throw new Error(`Unexpected import in [position].js: ${name}`);
    },
    { window: mockWindow, CustomEvent: CustomEventMock },
  );

  // Pure evaluator checks against REAL solverRanges.RFI values
  const aaOpen = posMod.evaluatePreflopQuizAnswer('UTG', 'AA', 'open');
  assert.equal(aaOpen.freq, 100);
  assert.equal(aaOpen.verdict, 'Open Raise');
  assert.equal(aaOpen.isCorrect, true);

  const aaFold = posMod.evaluatePreflopQuizAnswer('UTG', 'AA', 'fold');
  assert.equal(aaFold.isCorrect, false);

  const a5sOpen = posMod.evaluatePreflopQuizAnswer('UTG', 'A5s', 'open');
  assert.equal(a5sOpen.freq, 52);
  assert.equal(a5sOpen.verdict, 'Open Raise');
  assert.equal(a5sOpen.isCorrect, true);

  const ktsMixed = posMod.evaluatePreflopQuizAnswer('UTG', 'KTs', 'open');
  assert.equal(ktsMixed.freq, 42);
  assert.equal(ktsMixed.verdict, 'Mixed / Low-Freq Open');
  assert.equal(ktsMixed.category, 'mixed');
  assert.equal(ktsMixed.isCorrect, true);

  const foldHand = posMod.evaluatePreflopQuizAnswer('UTG', '72o', 'fold');
  assert.equal(foldHand.freq, 0);
  assert.equal(foldHand.verdict, 'Fold');
  assert.equal(foldHand.isCorrect, true);

  const wrongOpen = posMod.evaluatePreflopQuizAnswer('UTG', '72o', 'open');
  assert.equal(wrongOpen.isCorrect, false);

  // Render component & exercise full interactive quiz flow
  const Page = posMod.default;
  let tree;
  await act(async () => {
    tree = create(
      React.createElement(Page, {
        initialPosition: 'UTG',
        canonicalPath: '/tools/preflop-ranges/utg',
        markdownPath: '/tools/preflop-ranges/utg.md',
      }),
    );
  });

  // Hub props preserved + single gate preserved
  const hub = tree.root.find((n) => n.props?.['data-testid'] === 'mock-preflop-hub');
  assert.equal(hub.props['data-pos'], 'UTG');
  assert.equal(hub.props['data-canonical'], '/tools/preflop-ranges/utg');
  assert.equal(hub.props['data-markdown'], '/tools/preflop-ranges/utg.md');
  assert.equal(tree.root.findAll((n) => n.props?.['data-testid'] === 'mock-unlock-gate').length, 1);

  // Mode toggle present; Quiz panel hidden in default Chart View
  const toggleBar = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-toggle');
  assert.ok(toggleBar);
  assert.equal(tree.root.findAll((n) => n.props?.['data-testid'] === 'preflop-quiz-panel').length, 0);

  const chartBtn = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-mode-chart');
  const quizBtn = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-mode-quiz');
  assert.equal(collectText(chartBtn), 'Chart View');
  assert.equal(collectText(quizBtn), 'Quiz Yourself (Tap Any Hand)');
  assert.ok(chartBtn.props.style.minHeight >= 44);
  assert.ok(quizBtn.props.style.minHeight >= 44);
  assert.equal(chartBtn.props.style.borderRadius, 0);
  assert.equal(quizBtn.props.style.borderRadius, 0);

  // Switch to Quiz Mode
  await act(async () => {
    quizBtn.props.onClick();
  });

  const panel = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-panel');
  assert.ok(panel, 'Quiz panel must mount in Quiz Mode');
  const allCells = tree.root.findAll((n) => typeof n.props?.['data-testid'] === 'string' && n.props['data-testid'].startsWith('preflop-quiz-cell-'));
  assert.equal(allCells.length, 169, 'Quiz matrix must expose all 169 hands (13x13)');

  // Answer #1: Tap AA -> Open Raise
  const aaCell = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-cell-AA');
  await act(async () => {
    aaCell.props.onClick();
  });
  const openBtn = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-open-btn');
  await act(async () => {
    openBtn.props.onClick();
  });

  assert.equal(collectText(tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-score')), '1/1 Correct');
  assert.equal(tree.root.findAll((n) => n.props?.['data-testid'] === 'preflop-quiz-save-cta').length, 0, 'Save CTA must wait for 2+ quiz answers');
  assert.equal(trackedEvents.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents[0])), {
    event: 'seo_mini_gto_drill_answered',
    props: { position: 'UTG', hand: 'AA' },
  });
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'sp:seo-tool-engaged');

  // Answer #2: Tap 72o -> Fold
  const foldCell = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-cell-72o');
  await act(async () => {
    foldCell.props.onClick();
  });
  const foldBtn = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-fold-btn');
  await act(async () => {
    foldBtn.props.onClick();
  });

  assert.equal(collectText(tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-score')), '2/2 Correct');
  assert.equal(trackedEvents.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents[1])), {
    event: 'seo_mini_gto_drill_answered',
    props: { position: 'UTG', hand: '72o' },
  });
  assert.equal(dispatchedEvents.length, 2);
  assert.equal(dispatchedEvents[1].type, 'sp:seo-tool-engaged');

  // After 2+ answers, peak-dopamine Save CTA mounts and wires to openQuickSignup
  const saveCta = tree.root.find((n) => n.props?.['data-testid'] === 'preflop-quiz-save-cta');
  assert.equal(collectText(saveCta), 'Save Your GTO Quiz Score & Play 107 Games Free');
  assert.equal(saveCta.props.style.borderRadius, 0);
  await act(async () => {
    saveCta.props.onClick();
  });

  assert.equal(signupCalls.length, 1);
  assert.equal(signupCalls[0].unlockKey, 'solver-matrix');
  assert.equal(signupCalls[0].redirectPath, '/tools/preflop-ranges/utg');
  assert.equal(signupCalls[0].title, 'Save Your GTO Quiz Score & Play 107 Games Free');
  assert.equal(trackedEvents[2].event, 'seo_mini_gto_drill_cta_click');

  await act(async () => {
    tree.unmount();
  });
});

// ── LAW 2: Venue Detail "Tonight's Stake Alert" Button ──────────────────────
test('OTC TIER 8 LAW 2: /hub/venues/[id] mounts venue-stake-alert-btn beside Follow, persists stake-alert spot to sp_saved_spots_v1 (syncs to cloud), tracks seo_venue_follow_signup_click, dispatches sp:peak-utility-pwa, and opens quick signup', async () => {
  const venueSrc = read('pages/hub/venues/[id].js');

  // Button placement: right beside the Follow button inside .action-buttons
  const followBtnIdx = venueSrc.indexOf("className={'action-btn follow-btn'");
  const stakeAlertBtnIdx = venueSrc.indexOf('data-testid="venue-stake-alert-btn"');
  const shareBtnIdx = venueSrc.indexOf('className="action-btn share-btn"');
  assert.ok(
    followBtnIdx > 0 && stakeAlertBtnIdx > followBtnIdx && shareBtnIdx > stakeAlertBtnIdx,
    'venue-stake-alert-btn must sit right beside the Follow button before Share',
  );
  assert.match(venueSrc, /Alert Me For Live Stakes/);

  // Extract handleStakeAlert cleanly without disturbing handleFollow slice
  const fnStart = venueSrc.indexOf('var handleStakeAlert = function () {');
  const fnEnd = venueSrc.indexOf('useEffect(() => {\n    const fetchFriendState', fnStart);
  assert.ok(fnStart > 0 && fnEnd > fnStart, 'handleStakeAlert function slice must exist');
  const stakeAlertSlice = venueSrc.slice(fnStart, fnEnd);

  const localStore = makeMemoryStorage();
  const dispatchedEvents = [];
  const trackedEvents = [];
  const signupCalls = [];
  let stakeAlertEnabledState = false;
  let followCalled = 0;

  function CustomEventMock(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }

  const runStakeAlert = () => {
    const mockWindow = {
      localStorage: localStore,
      dispatchEvent: (ev) => dispatchedEvents.push(ev),
    };
    const sandbox = {
      id: '1828',
      venue: { name: 'The Lodge Card Club' },
      isFollowed: false,
      handleFollow: () => { followCalled += 1; },
      setStakeAlertEnabled: (fn) => {
        stakeAlertEnabledState = typeof fn === 'function' ? fn(stakeAlertEnabledState) : fn;
      },
      localStorage: localStore,
      window: mockWindow,
      CustomEvent: CustomEventMock,
      Date,
      JSON,
      Array,
      Object,
      String,
      console: { warn() {} },
      trackSeoFunnelEvent: (name, props) => trackedEvents.push({ name, props }),
      openQuickSignup: (detail) => signupCalls.push(detail),
    };
    vm.runInNewContext(`${stakeAlertSlice}\nhandleStakeAlert();`, sandbox);
  };

  // Guest tap
  runStakeAlert();

  const savedSpots = JSON.parse(localStore.getItem('sp_saved_spots_v1'));
  assert.equal(savedSpots.length, 1);
  assert.equal(savedSpots[0].id, 'stake-alert-1828');
  assert.equal(savedSpots[0].kind, 'stake-alert');
  assert.equal(savedSpots[0].label, 'The Lodge Card Club Live Stakes');
  assert.equal(savedSpots[0].path, '/hub/venues/1828');
  assert.equal(savedSpots[0].url, '/hub/venues/1828');

  assert.equal(trackedEvents.length, 1);
  assert.equal(trackedEvents[0].name, 'seo_venue_follow_signup_click');
  assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents[0].props)), {
    action: 'stake-alert',
    venueId: '1828',
  });

  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'sp:peak-utility-pwa');
  assert.deepEqual(JSON.parse(JSON.stringify(dispatchedEvents[0].detail)), { unlockKey: 'venue-follow' });

  assert.equal(signupCalls.length, 1);
  assert.equal(signupCalls[0].unlockKey, 'venue-follow');
  assert.equal(signupCalls[0].title, 'Get Live Stake & Waitlist Alerts For The Lodge Card Club');
  assert.equal(signupCalls[0].redirectPath, '/hub/venues/1828');
  assert.equal(followCalled, 0);

  // Authenticated tap -> toggles local alert state & follows without opening quick signup
  localStore.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'tok_live_stake_alert_123456' }));
  runStakeAlert();
  assert.equal(stakeAlertEnabledState, true);
  assert.equal(followCalled, 1);
  assert.equal(signupCalls.length, 1, 'Authenticated tap must not reopen quick signup');

  // Verify end-to-end cloud sync compatibility via SmarterUnlockedWelcomeBanner
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
  assert.equal(synced, true);
  assert.equal(syncedPayloads[0].body.data.spots[0].id, 'stake-alert-1828');
  assert.equal(syncedPayloads[0].body.data.spots[0].kind, 'stake-alert');
  assert.equal(syncedPayloads[0].body.data.spots[0].label, 'The Lodge Card Club Live Stakes');
  assert.equal(syncedPayloads[0].body.data.spots[0].path, '/hub/venues/1828');
});

// ── LAW 3: Strictly Authentic Database-Backed AggregateRating JSON-LD ───────
test('OTC TIER 8 LAW 3: buildAuthenticVenueAggregateRating fails closed for < 3 reviews or invalid ratings and buildVenueJsonLd attaches aggregateRating strictly when authentic', () => {
  const venueSrc = read('pages/hub/venues/[id].js');
  const startIdx = venueSrc.indexOf('export function buildAuthenticVenueAggregateRating');
  const endIdx = venueSrc.indexOf('/** Count schedule rows', startIdx);
  assert.ok(startIdx > 0 && endIdx > startIdx, 'buildAuthenticVenueAggregateRating + buildVenueJsonLd block must exist');

  const pureSnippet = venueSrc
    .slice(startIdx, endIdx)
    .replace(/^export\s+function\s+/gm, 'function ');

  const sb = {
    exports: {},
    isPublishableStreetAddress: (v) => Boolean(v),
    clampText: (t) => String(t || ''),
    resolveVenueWikidataLinks: () => [],
    toAbsoluteUrl: (u) => (typeof u === 'string' && u.startsWith('http') ? u : null),
    buildVenueFaqJsonLd: () => null,
    buildVenueSpeakableJsonLd: () => null,
    Number,
    String,
    Array,
    Object,
    Math,
    parseFloat,
    parseInt,
    isNaN,
  };
  vm.runInNewContext(
    `${pureSnippet}
exports.buildAuthenticVenueAggregateRating = buildAuthenticVenueAggregateRating;
exports.buildVenueJsonLd = buildVenueJsonLd;`,
    sb,
  );

  const { buildAuthenticVenueAggregateRating, buildVenueJsonLd } = sb.exports;

  // Fail-closed cases (< 3 reviews, non-integer counts, out-of-range or non-finite ratings)
  assert.equal(buildAuthenticVenueAggregateRating(), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: 4.8, reviewCount: 0 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: 4.8, reviewCount: 1 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: 4.8, reviewCount: 2 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: 4.8, reviewCount: 3.5 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: 4.8, reviewCount: '5' }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: 0.9, reviewCount: 10 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: 5.1, reviewCount: 10 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: NaN, reviewCount: 10 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: Infinity, reviewCount: 10 }), null);
  assert.equal(buildAuthenticVenueAggregateRating({ ratingValue: '4.5', reviewCount: 10 }), null);

  // Authentic DB-backed ratings (>= 3 reviews, ratingValue in [1, 5])
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildAuthenticVenueAggregateRating({ ratingValue: 4.6, reviewCount: 3 }))),
    {
      '@type': 'AggregateRating',
      ratingValue: 4.6,
      reviewCount: 3,
      bestRating: 5,
      worstRating: 1,
    },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildAuthenticVenueAggregateRating({ ratingValue: 4.3333, reviewCount: 18 }))),
    {
      '@type': 'AggregateRating',
      ratingValue: 4.33,
      reviewCount: 18,
      bestRating: 5,
      worstRating: 1,
    },
  );

  // Venue JSON-LD omits aggregateRating when DB has < 3 reviews (even with trust_score!)
  const venueNoReviews = {
    id: 1828,
    name: 'The Lodge Card Club',
    venue_type: 'poker_club',
    city: 'Round Rock',
    state: 'TX',
    trust_score: 4.9,
    avg_rating: 5.0,
    review_count: 2,
  };
  const ldOmitted = buildVenueJsonLd(venueNoReviews, 'https://smarter.poker/hub/venues/1828', null);
  const venueNodeOmitted = ldOmitted['@graph'].find((n) => n['@id'] === 'https://smarter.poker/hub/venues/1828#venue');
  assert.equal(venueNodeOmitted.aggregateRating, undefined, 'Must NEVER emit aggregateRating when reviewCount < 3');

  // Venue JSON-LD emits aggregateRating strictly when DB has >= 3 authentic reviews
  const venueWithReviews = {
    ...venueNoReviews,
    avg_rating: 4.75,
    review_count: 14,
  };
  const ldValid = buildVenueJsonLd(venueWithReviews, 'https://smarter.poker/hub/venues/1828', null);
  const venueNodeValid = ldValid['@graph'].find((n) => n['@id'] === 'https://smarter.poker/hub/venues/1828#venue');
  assert.deepEqual(JSON.parse(JSON.stringify(venueNodeValid.aggregateRating)), {
    '@type': 'AggregateRating',
    ratingValue: 4.75,
    reviewCount: 14,
    bestRating: 5,
    worstRating: 1,
  });
});

// ── LAW 4: Venue Claims, Zero Hardcoded Counts, Zero Gold, Zero Em/En Dash, Zero &apos; ──
test('OTC TIER 8 LAW 4: owned files obey strict house style (zero Verified Rooms/Venues, zero hardcoded room counts, zero em/en dashes, zero &apos; in JSX text, zero banned gold hexes)', () => {
  const posSrc = read('pages/tools/preflop-ranges/[position].js');
  const venueSrc = read('pages/hub/venues/[id].js');

  const bannedGoldRe = /#(?:f2b84b|d4a853|ffd700|f59e0b|fbbf24|eab308)\b/i;
  const bannedVenueClaimsRe = /\bVerified\s+(?:Poker\s+)?(?:Rooms|Venues)\b/i;
  const hardcodedRoomCountRe = /\b(?:478|483|500\+|600\+|700\+|800\+)\s+(?:Live\s+)?(?:Poker\s+)?(?:Rooms|Venues)\b/i;

  // Full check on pages/tools/preflop-ranges/[position].js
  assert.doesNotMatch(posSrc, bannedGoldRe, '[position].js must contain zero banned gold hexes');
  assert.doesNotMatch(posSrc, bannedVenueClaimsRe, '[position].js must never say Verified Rooms/Venues');
  assert.doesNotMatch(posSrc, hardcodedRoomCountRe, '[position].js must never hardcode room counts');
  assert.doesNotMatch(posSrc.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''), /[—–]/, '[position].js must contain zero em/en dashes');
  assert.doesNotMatch(posSrc, /&apos;/, '[position].js must contain zero &apos; in JSX text');
  assert.doesNotMatch(
    posSrc,
    /borderRadius:\s*(?:8|10|12|14|16|18|20|24|999)\b/,
    '[position].js must keep 0px sharp hardware corners',
  );

  // Scoped checks on added blocks in pages/hub/venues/[id].js
  const stakeStart = venueSrc.indexOf('var handleStakeAlert = function () {');
  const stakeEnd = venueSrc.indexOf('useEffect(() => {\n    const fetchFriendState', stakeStart);
  const stakeSlice = venueSrc.slice(stakeStart, stakeEnd);
  assert.doesNotMatch(stakeSlice, bannedGoldRe, 'handleStakeAlert must contain zero banned gold hexes');
  assert.doesNotMatch(stakeSlice, bannedVenueClaimsRe, 'handleStakeAlert must never say Verified Rooms/Venues');
  assert.doesNotMatch(stakeSlice, hardcodedRoomCountRe, 'handleStakeAlert must never hardcode room counts');
  assert.doesNotMatch(stakeSlice.replace(/\/\/[^\n]*/g, ''), /[—–]/, 'handleStakeAlert must contain zero em/en dashes');
  assert.doesNotMatch(stakeSlice, /&apos;/, 'handleStakeAlert must contain zero &apos;');

  const btnStart = venueSrc.indexOf('data-testid="venue-stake-alert-btn"');
  const btnSlice = venueSrc.slice(btnStart - 60, btnStart + 650);
  assert.doesNotMatch(btnSlice, bannedGoldRe, 'venue-stake-alert-btn must contain zero banned gold hexes');
  assert.doesNotMatch(btnSlice, /&apos;/, 'venue-stake-alert-btn must contain zero &apos;');
  assert.doesNotMatch(btnSlice, /[—–]/, 'venue-stake-alert-btn must contain zero em/en dashes');

  const cssStart = venueSrc.indexOf('.stake-alert-btn {');
  const cssSlice = venueSrc.slice(cssStart, cssStart + 400);
  assert.doesNotMatch(cssSlice, bannedGoldRe, '.stake-alert-btn CSS must contain zero banned gold hexes');

  const aggStart = venueSrc.indexOf('export function buildAuthenticVenueAggregateRating');
  const aggSlice = venueSrc.slice(aggStart, aggStart + 600);
  assert.doesNotMatch(aggSlice.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''), /[—–]/, 'buildAuthenticVenueAggregateRating must contain zero em/en dashes');
});
