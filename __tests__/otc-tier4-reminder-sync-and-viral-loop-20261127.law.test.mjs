/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OTC TIER 4 CI FORTRESS: SERIES EVENT REMINDER CLOUD SYNC + VIRAL
 *  PLAYER-SHARE REFERRAL LOOP & PEAK-UTILITY PWA SIGNAL (2026-11-27)
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for:
 *   1. pages/hub/series/[id].js — handleEventRemindMe persists clicked event
 *      reminders into localStorage sp_saved_spots_v1 (deduped by
 *      series-reminder-<seriesId>-<eventNumOrSlug>, capped at 25 items) with
 *      ZERO new imports before dispatching sp:open-quick-signup, syncing
 *      end-to-end via SmarterUnlockedWelcomeBanner.syncGuestSavedSpotsToCloud
 *      and auto-checking Day-0 Win #1.
 *   2. src/components/seo/SmarterUnlockedWelcomeBanner.jsx — exported pure
 *      buildMemberShareReferralUrl(), #SMARTERDESIGN 1-click "Invite A Poker
 *      Friend (Free 30-Day VIP + 500 Diamonds)" button with clipboard copy +
 *      seo_member_referral_link_copied telemetry + "Invite Link Copied" state,
 *      sp:peak-utility-pwa CustomEvent dispatch on banner activation, zero
 *      lib/analytics imports, zero em/en dashes, never "Verified Rooms".
 *   3. src/components/seo/SmarterMiniGtoDrill.jsx — exported
 *      buildAttributedDrillShareUrl() carrying
 *      utm_source=player_share&utm_medium=referral&utm_campaign=gto_drill
 *      for both page link and OG result card share attribution.
 *   4. src/components/seo/SmarterCalculatorSaveBar.jsx — exported
 *      buildAttributedCalcSpotUrl() + crisp 1-click "Share Spot" secondary
 *      button (styles.ctaSecondary) copying canonical tool URL with
 *      utm_source=player_share&utm_medium=referral&utm_campaign=calc_spot,
 *      tracking seo_calculator_share_click, showing "Spot Link Copied".
 *   5. Global #SMARTERDESIGN & attribution integrity across all 4 files:
 *      zero em/en dashes, zero banned gold hexes, zero lib/analytics imports,
 *      every styles.* reference verified in SmarterSeoKit.module.css, and
 *      every referral URL classified as channel='referral' by
 *      classifySignupChannel().
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { classifySignupChannel } from '../src/lib/acquisition/attributionSummary.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const renderer = require('react-test-renderer');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|d4af37|facc15|f2b84b|d4a853)\b/i;

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

function compileModule(relPath, customRequire) {
  const source = read(relPath);
  const { outputText } = ts.transpileModule(source, {
    fileName: relPath,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(customRequire, mod, mod.exports);
  return mod.exports;
}

function assertValidCssClasses(relPath) {
  const src = read(relPath);
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  const definedClasses = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));
  const missing = [];
  for (const m of src.matchAll(/\bstyles\.([A-Za-z][A-Za-z0-9_-]*)\b/g)) {
    if (!definedClasses.has(m[1])) missing.push(`styles.${m[1]}`);
  }
  assert.deepEqual(missing, [], `${relPath} references undefined SmarterSeoKit CSS classes: ${missing.join(', ')}`);
}

test('OTC-T4 LAW 1: pages/hub/series/[id].js persists clicked event reminders into sp_saved_spots_v1 (deduped, max 25, zero new imports) and syncs end-to-end into cloud & Day-0 Win #1', async () => {
  const src = read('pages/hub/series/[id].js');

  assert.doesNotMatch(
    src,
    /import[\s\S]{0,80}(SmarterQuickSignupSheet|SmarterUnlockedWelcomeBanner)/,
    'series/[id].js must add ZERO new imports for reminder persistence',
  );
  assert.match(src, /sp_saved_spots_v1/, 'series/[id].js must persist reminders to sp_saved_spots_v1');
  assert.match(src, /toolSlug:\s*'series-event-reminder'/);
  assert.match(src, /toolName:\s*'Tournament Event Reminder'/);
  assert.match(src, /series-reminder-/);
  assert.match(src, /\.slice\(0,\s*25\)/, 'series reminder queue must be capped at 25 items');

  // Verify persistence happens BEFORE sp:open-quick-signup dispatch inside handleEventRemindMe
  const fnIdx = src.indexOf('const handleEventRemindMe');
  const setItemIdx = src.indexOf("setItem('sp_saved_spots_v1'", fnIdx);
  const quickSignupIdx = src.indexOf("new CustomEvent('sp:open-quick-signup'", fnIdx);
  assert.ok(fnIdx > 0 && setItemIdx > fnIdx && quickSignupIdx > setItemIdx, 'sp_saved_spots_v1 write must occur before sp:open-quick-signup dispatch');

  // Compile SeriesDetailPage and exercise handleEventRemindMe click end-to-end
  const noopComponent = { __esModule: true, default: () => null };
  const seriesMod = compileModule('pages/hub/series/[id].js', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'next/head' || name === 'next/link') return noopComponent;
    if (name === 'next/router') {
      return {
        useRouter: () => ({
          isReady: true,
          query: { id: '5000693' },
          asPath: '/hub/series/5000693',
          push: () => {},
        }),
      };
    }
    if (name === 'swr') {
      return {
        __esModule: true,
        default: () => ({
          data: {
            series: {
              id: '5000693',
              name: '2026 Wynn Signature Series',
              city: 'Las Vegas',
              state: 'NV',
              start_date: '2026-04-20',
              end_date: '2026-04-30',
              events: [
                {
                  event_number: 14,
                  event_name: '$1,100 Mystery Bounty NLH',
                  buy_in: 1100,
                  start_date: '2026-04-24',
                  start_time: '12:00:00',
                },
                {
                  event_name: '$400 Seniors Championship',
                  buy_in: 400,
                  start_date: '2026-04-25',
                },
              ],
            },
            results: [],
            leaderboard: [],
            followerCount: 12,
            activities: [],
          },
          isLoading: false,
          error: null,
          mutate: () => {},
        }),
      };
    }
    if (name.endsWith('useHasMounted')) return { __esModule: true, default: () => true };
    if (name.endsWith('useVenueRealtime')) return { __esModule: true, default: () => {} };
    if (name.endsWith('EventBus')) return { eventBus: { on: () => {}, off: () => {}, emit: () => {} } };
    if (name.endsWith('pokerFormatters')) return { formatGameType: (v) => v, decodeHtml: (v) => v };
    if (name.endsWith('PokerNearMeConsole')) {
      return {
        PokerNearMePanelShell: ({ children }) => React.createElement('div', null, children),
        PokerNearMeConsoleIcon: () => null,
      };
    }
    if (name.endsWith('pnm-utils')) return { resolveVenueTimeZone: () => 'America/Los_Angeles' };
    if (name.endsWith('scheduleTemporal.mjs')) {
      return { qualifiedScheduleZone: () => 'America/Los_Angeles', scheduleDateStatus: () => 'upcoming' };
    }
    if (name.endsWith('calendarExport.mjs')) {
      return { buildSeriesIcs: () => '', buildGoogleCalendarUrl: () => null };
    }
    if (name.endsWith('seriesSeo.mjs')) {
      return {
        fetchSeries: async () => ({ series: null, status: 'ok' }),
        formatRange: () => 'Apr 20 - 30, 2026',
        isPublicSeries: () => false,
        originFrom: () => 'https://smarter.poker',
        seriesCacheControl: () => 'public',
        seriesDescription: () => '',
        seriesPath: () => '/hub/series/5000693',
        seriesPlace: () => 'Las Vegas, NV',
        seriesSchema: () => [],
        seriesTitle: () => 'Series',
        seriesOgImage: () => null,
        toSeoSeries: (s) => s,
      };
    }
    if (name.endsWith('seriesRouteIdentity.mjs')) {
      return {
        canonicalSeriesRouteId: (id) => id,
        isPokerSeriesRouteId: () => false,
        isServableSeriesParentEvidence: () => true,
        isSyntheticTestSeries: () => false,
        toPokerSeriesRouteId: (id) => id,
        tournamentSeriesIdFromPointerUid: () => null,
      };
    }
    if (name.endsWith('venueAeo.mjs')) {
      return { buildSeriesFactKernel: () => '', buildSeriesPaaQuestions: () => [] };
    }
    if (name.endsWith('seriesEventSchema.mjs')) {
      return { buildSeriesMetaDescription: () => '', buildSeriesSubEventSchema: () => [] };
    }
    return noopComponent;
  });

  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  const dispatched = [];

  // Pre-seed 25 older spots to prove cap-at-25 enforcement
  const preseeded = Array.from({ length: 25 }, (_, i) => ({
    id: `older-spot-${i}`,
    toolSlug: 'pot-odds-calculator',
    toolName: 'Pot Odds',
    summaryText: `Old Spot ${i}`,
    url: '/tools/pot-odds-calculator',
    savedAt: '2026-11-26T00:00:00.000Z',
  }));
  localStore.setItem('sp_saved_spots_v1', JSON.stringify(preseeded));

  const prevWindow = globalThis.window;
  const prevLocalStorage = globalThis.localStorage;
  const prevCustomEvent = globalThis.CustomEvent;

  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.localStorage = localStore;
  globalThis.window = {
    localStorage: localStore,
    sessionStorage: sessionStore,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: (ev) => dispatched.push(ev),
    location: { href: 'https://smarter.poker/hub/series/5000693', pathname: '/hub/series/5000693' },
  };

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(seriesMod.default, { seoSeries: null }));
    });

    const remindBtn0 = tree.root.findByProps({ 'data-testid': 'series-event-remind-btn-0' });
    let stopped = false;
    await renderer.act(async () => {
      remindBtn0.props.onClick({ stopPropagation: () => { stopped = true; } });
    });
    assert.equal(stopped, true, 'Remind Me click must stop row expansion propagation');

    // Click same event a second time to verify deduplication by id
    await renderer.act(async () => {
      remindBtn0.props.onClick({ stopPropagation: () => {} });
    });

    const storedAfter = JSON.parse(localStore.getItem('sp_saved_spots_v1'));
    assert.equal(storedAfter.length, 25, 'sp_saved_spots_v1 must remain capped at 25 items');
    assert.equal(storedAfter[0].id, 'series-reminder-5000693-14');
    assert.equal(storedAfter[0].toolSlug, 'series-event-reminder');
    assert.equal(storedAfter[0].toolName, 'Tournament Event Reminder');
    assert.match(storedAfter[0].summaryText, /\$1,100 Mystery Bounty NLH \(\$1,100 · .*\) At 2026 Wynn Signature Series/);
    assert.equal(storedAfter[0].url, '/hub/series/5000693');
    assert.ok(!Number.isNaN(Date.parse(storedAfter[0].savedAt)), 'savedAt must be a valid ISO timestamp');
    assert.equal(
      storedAfter.filter((item) => item.id === 'series-reminder-5000693-14').length,
      1,
      'Repeated Remind Me clicks on the same event must deduplicate by id',
    );
    assert.ok(
      dispatched.some((ev) => ev.type === 'sp:open-quick-signup' && ev.detail?.unlockKey === 'series-alerts-event-reminder'),
      'Remind Me click must still dispatch sp:open-quick-signup',
    );

    // Verify end-to-end cloud sync + Day-0 Win #1 auto-check via SmarterUnlockedWelcomeBanner
    const bannerMod = compileModule('src/components/seo/SmarterUnlockedWelcomeBanner.jsx', (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === 'next/link') return noopComponent;
      if (name === 'next/router') return { useRouter: () => ({ asPath: '/hub/series/5000693' }) };
      if (name.endsWith('/seoFunnelTelemetry')) return { trackSeoFunnelEvent: () => {} };
      if (name.endsWith('.module.css')) return { __esModule: true, default: {} };
      throw new Error(`Unexpected import in SmarterUnlockedWelcomeBanner: ${name}`);
    });

    localStore.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'valid_jwt_token_series_sync' }));
    const syncedRequests = [];
    const synced = await bannerMod.syncGuestSavedSpotsToCloud({
      localStorage: localStore,
      sessionStorage: sessionStore,
      fetch: async (url, init) => {
        syncedRequests.push({ url, init });
        return { ok: true, status: 200 };
      },
    });
    assert.equal(synced, true);
    assert.equal(syncedRequests.length, 1);
    assert.equal(syncedRequests[0].url, '/api/training/tool-records');
    const syncedPayload = JSON.parse(syncedRequests[0].init.body);
    assert.equal(syncedPayload.data.spots[0].id, 'series-reminder-5000693-14');
    assert.equal(syncedPayload.data.spots[0].toolSlug, 'series-event-reminder');

    const checklist = bannerMod.buildDay0ChecklistState({ savedSpotCount: storedAfter.length, completedIds: [] });
    assert.equal(checklist[0].id, 'save-first-spot');
    assert.equal(checklist[0].completed, true, 'Persisted series event reminder must auto-check Day-0 Win #1');
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
    globalThis.localStorage = prevLocalStorage;
    globalThis.CustomEvent = prevCustomEvent;
  }
});

test('OTC-T4 LAW 2: SmarterUnlockedWelcomeBanner exports buildMemberShareReferralUrl, renders Invite A Poker Friend CTA, dispatches sp:peak-utility-pwa, and obeys strict hygiene', async () => {
  const rel = 'src/components/seo/SmarterUnlockedWelcomeBanner.jsx';
  const src = read(rel);

  assert.doesNotMatch(src, /lib\/analytics/, 'SmarterUnlockedWelcomeBanner must never import lib/analytics');
  assert.doesNotMatch(src, /[\u2014\u2013]/, 'SmarterUnlockedWelcomeBanner must contain zero em or en dashes');
  assert.doesNotMatch(src, BANNED_GOLD, 'SmarterUnlockedWelcomeBanner must contain zero banned gold hexes');
  assert.doesNotMatch(src, /Verified Rooms/i, 'SmarterUnlockedWelcomeBanner must never say Verified Rooms');
  assert.match(src, /Listed Rooms/, 'SmarterUnlockedWelcomeBanner must keep Listed Rooms');
  assert.match(src, /export function buildMemberShareReferralUrl\(/);
  assert.match(src, /Invite A Poker Friend \(Free 30-Day VIP \+ 500 Diamonds\)/);
  assert.match(src, /Invite Link Copied/);
  assert.match(src, /seo_member_referral_link_copied/);
  assert.match(src, /new CustomEvent\('sp:peak-utility-pwa'/);
  assertValidCssClasses(rel);

  const funnelEvents = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const linkStub = {
    __esModule: true,
    default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
  };

  const mod = compileModule(rel, (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return linkStub;
    if (name === 'next/router') return { useRouter: () => ({ asPath: '/hub/series/5000693' }) };
    if (name.endsWith('/seoFunnelTelemetry')) {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name.endsWith('.module.css')) return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected SmarterUnlockedWelcomeBanner import: ${name}`);
  });

  // Pure helper assertions
  const withNum = mod.buildMemberShareReferralUrl({ playerNumber: 42019 });
  assert.equal(
    withNum,
    'https://smarter.poker/auth/signup?ref=42019&utm_source=member_share&utm_medium=referral&utm_campaign=day0_invite',
  );
  const withPaddedString = mod.buildMemberShareReferralUrl({ playerNumber: '00881', siteUrl: 'https://smarter.poker/' });
  assert.equal(
    withPaddedString,
    'https://smarter.poker/auth/signup?ref=881&utm_source=member_share&utm_medium=referral&utm_campaign=day0_invite',
  );
  const withoutNum = mod.buildMemberShareReferralUrl({ userId: '11111111-2222-3333-4444-555555555555', playerNumber: null });
  assert.equal(
    withoutNum,
    'https://smarter.poker/auth/signup?src=member-share&utm_source=member_share&utm_medium=referral&utm_campaign=day0_invite',
  );
  assert.doesNotMatch(withoutNum, /11111111/, 'Referral URL must never leak user UUID');
  const invalidNum = mod.buildMemberShareReferralUrl({ playerNumber: 'abc-not-num' });
  assert.equal(
    invalidNum,
    'https://smarter.poker/auth/signup?src=member-share&utm_source=member_share&utm_medium=referral&utm_campaign=day0_invite',
  );

  // Confirm attributionSummary classifies member_share referral URLs as channel='referral'
  for (const urlStr of [withNum, withoutNum]) {
    const parsedUrl = new URL(urlStr);
    const classified = classifySignupChannel({
      utm_source: parsedUrl.searchParams.get('utm_source'),
      utm_medium: parsedUrl.searchParams.get('utm_medium'),
      utm_campaign: parsedUrl.searchParams.get('utm_campaign'),
    });
    assert.equal(classified.channel, 'referral');
  }

  // Interactive mount: sp:peak-utility-pwa dispatch + 1-click Invite Link copy
  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  localStore.setItem(
    'smarter-poker-auth',
    JSON.stringify({
      access_token: 'valid_jwt_token_banner_test',
      user: { id: 'user-1', user_metadata: { player_number: 7712 } },
    }),
  );
  sessionStore.setItem(
    'sp_just_unlocked_v1',
    JSON.stringify({ unlockKey: 'series-alerts-event-reminder', source: 'series-event-row-reminder' }),
  );

  const dispatched = [];
  const copiedTexts = [];

  const prevWindow = globalThis.window;
  const prevCustomEvent = globalThis.CustomEvent;
  const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    localStorage: localStore,
    sessionStorage: sessionStore,
    location: { pathname: '/hub/series/5000693' },
    dispatchEvent: (ev) => dispatched.push(ev),
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => { copiedTexts.push(text); },
      },
    },
  });

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(mod.default));
    });

    const pwaEvent = dispatched.find((ev) => ev.type === 'sp:peak-utility-pwa');
    assert.ok(pwaEvent, 'Banner activation must dispatch sp:peak-utility-pwa CustomEvent');
    assert.equal(pwaEvent.detail?.unlockKey, 'series-alerts-event-reminder');

    const inviteBtn = tree.root.findByProps({ 'data-testid': 'unlocked-banner-invite-btn' });
    assert.equal(inviteBtn.children.join(''), 'Invite A Poker Friend (Free 30-Day VIP + 500 Diamonds)');

    await renderer.act(async () => {
      await inviteBtn.props.onClick();
    });

    assert.equal(copiedTexts.length, 1);
    assert.equal(
      copiedTexts[0],
      'https://smarter.poker/auth/signup?ref=7712&utm_source=member_share&utm_medium=referral&utm_campaign=day0_invite',
    );
    assert.ok(
      funnelEvents.some((e) => e.event === 'seo_member_referral_link_copied' && e.props?.has_player_number === true),
      'Clicking Invite button must track seo_member_referral_link_copied',
    );
    assert.equal(
      tree.root.findByProps({ 'data-testid': 'unlocked-banner-invite-btn' }).children.join(''),
      'Invite Link Copied',
    );
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
    if (prevNavigator) Object.defineProperty(globalThis, 'navigator', prevNavigator);
  }
});

test('OTC-T4 LAW 3: SmarterMiniGtoDrill exports buildAttributedDrillShareUrl and copies UTM-attributed page + OG card URLs', async () => {
  const rel = 'src/components/seo/SmarterMiniGtoDrill.jsx';
  const src = read(rel);

  assert.doesNotMatch(src, /lib\/analytics/, 'SmarterMiniGtoDrill must never import lib/analytics');
  assert.doesNotMatch(src, /[\u2014\u2013]/, 'SmarterMiniGtoDrill must contain zero em or en dashes');
  assert.doesNotMatch(src, BANNED_GOLD, 'SmarterMiniGtoDrill must contain zero banned gold hexes');
  assert.match(src, /export function buildAttributedDrillShareUrl\(/);
  assert.match(src, /utm_source=player_share&utm_medium=referral&utm_campaign=gto_drill/);
  assertValidCssClasses(rel);

  const funnelEvents = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const mod = compileModule(rel, (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') return { openQuickSignup: () => {} };
    if (name === '../../lib/seo/seoFunnelTelemetry') {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name === './SmarterSeoKit.module.css') return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected SmarterMiniGtoDrill import: ${name}`);
  });

  const baseShareUrl = mod.buildAttributedDrillShareUrl({ redirectPath: '/learn/category/preflop' });
  assert.equal(
    baseShareUrl,
    'https://smarter.poker/learn/category/preflop?utm_source=player_share&utm_medium=referral&utm_campaign=gto_drill',
  );
  const spotShareUrl = mod.buildAttributedDrillShareUrl({
    redirectPath: '/learn/category/preflop',
    spotId: 'preflop-btn-a5s-vs-co',
  });
  const parsedSpot = new URL(spotShareUrl);
  assert.equal(parsedSpot.searchParams.get('utm_source'), 'player_share');
  assert.equal(parsedSpot.searchParams.get('utm_medium'), 'referral');
  assert.equal(parsedSpot.searchParams.get('utm_campaign'), 'gto_drill');
  assert.equal(parsedSpot.searchParams.get('spot'), 'preflop-btn-a5s-vs-co');

  assert.equal(
    classifySignupChannel({
      utm_source: parsedSpot.searchParams.get('utm_source'),
      utm_medium: parsedSpot.searchParams.get('utm_medium'),
      utm_campaign: parsedSpot.searchParams.get('utm_campaign'),
    }).channel,
    'referral',
  );

  // Interactive share test
  const copiedTexts = [];
  const prevWindow = globalThis.window;
  const prevCustomEvent = globalThis.CustomEvent;
  const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    location: { pathname: '/learn/category/preflop' },
    dispatchEvent: () => {},
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => { copiedTexts.push(text); },
      },
    },
  });

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(mod.default, { category: 'Preflop', redirectPath: '/learn/category/preflop' }),
      );
    });
    const raiseBtn = tree.root.findByProps({ 'data-testid': 'mini-gto-action-raise-3-bet' });
    await renderer.act(async () => {
      raiseBtn.props.onClick();
    });
    const shareBtn = tree.root.findByProps({ 'data-testid': 'mini-gto-share-btn' });
    await renderer.act(async () => {
      await shareBtn.props.onClick();
    });

    assert.equal(copiedTexts.length, 1);
    assert.match(copiedTexts[0], /https:\/\/smarter\.poker\/learn\/category\/preflop\?utm_source=player_share&utm_medium=referral&utm_campaign=gto_drill/);
    assert.match(copiedTexts[0], /https:\/\/smarter\.poker\/api\/og\/tool-card\?.*utm_source=player_share&utm_medium=referral&utm_campaign=gto_drill/);
    assert.ok(funnelEvents.some((e) => e.event === 'seo_mini_gto_drill_share'));
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
    if (prevNavigator) Object.defineProperty(globalThis, 'navigator', prevNavigator);
  }
});

test('OTC-T4 LAW 4: SmarterCalculatorSaveBar adds 1-click Share Spot secondary button (styles.ctaSecondary) with UTM attribution and telemetry', async () => {
  const rel = 'src/components/seo/SmarterCalculatorSaveBar.jsx';
  const src = read(rel);

  assert.doesNotMatch(src, /lib\/analytics/, 'SmarterCalculatorSaveBar must never import lib/analytics');
  assert.doesNotMatch(src, /[\u2014\u2013]/, 'SmarterCalculatorSaveBar must contain zero em or en dashes');
  assert.doesNotMatch(src, BANNED_GOLD, 'SmarterCalculatorSaveBar must contain zero banned gold hexes');
  assert.match(src, /className=\{styles\.ctaSecondary\}/, 'Share Spot button must use styles.ctaSecondary');
  assert.match(src, /Share Spot/);
  assert.match(src, /Spot Link Copied/);
  assert.match(src, /seo_calculator_share_click/);
  assert.match(src, /utm_source', 'player_share'/);
  assert.match(src, /utm_medium', 'referral'/);
  assert.match(src, /utm_campaign', 'calc_spot'/);
  assertValidCssClasses(rel);

  const funnelEvents = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const mod = compileModule(rel, (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') return { openQuickSignup: () => {} };
    if (name === '../../lib/seo/seoFunnelTelemetry') {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name === './SmarterSeoKit.module.css') return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected SmarterCalculatorSaveBar import: ${name}`);
  });

  const calcShareUrl = mod.buildAttributedCalcSpotUrl({ redirectPath: '/tools/poker-odds-calculator' });
  assert.equal(
    calcShareUrl,
    'https://smarter.poker/tools/poker-odds-calculator?utm_source=player_share&utm_medium=referral&utm_campaign=calc_spot',
  );
  const parsedCalc = new URL(calcShareUrl);
  assert.equal(
    classifySignupChannel({
      utm_source: parsedCalc.searchParams.get('utm_source'),
      utm_medium: parsedCalc.searchParams.get('utm_medium'),
      utm_campaign: parsedCalc.searchParams.get('utm_campaign'),
    }).channel,
    'referral',
  );

  // Interactive guest render + click Share Spot
  const copiedTexts = [];
  const localStore = makeMemoryStorage();
  const prevWindow = globalThis.window;
  const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  globalThis.window = {
    localStorage: localStore,
    location: { pathname: '/tools/poker-odds-calculator', search: '' },
    dispatchEvent: () => {},
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => { copiedTexts.push(text); },
      },
    },
  });

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(mod.default, {
          toolSlug: 'poker-odds-calculator',
          toolName: 'Poker Odds Calculator',
          redirectPath: '/tools/poker-odds-calculator',
        }),
      );
    });

    const shareBtn = tree.root.findByProps({ 'data-testid': 'calculator-share-cta-poker-odds-calculator' });
    assert.equal(shareBtn.props.className, 'ctaSecondary');
    assert.equal(shareBtn.children.join(''), 'Share Spot');

    await renderer.act(async () => {
      await shareBtn.props.onClick();
    });

    assert.equal(copiedTexts.length, 1);
    assert.equal(
      copiedTexts[0],
      'https://smarter.poker/tools/poker-odds-calculator?utm_source=player_share&utm_medium=referral&utm_campaign=calc_spot',
    );
    assert.ok(
      funnelEvents.some((e) => e.event === 'seo_calculator_share_click' && e.props?.tool_slug === 'poker-odds-calculator'),
      'Share Spot click must track seo_calculator_share_click',
    );
    assert.equal(
      tree.root.findByProps({ 'data-testid': 'calculator-share-cta-poker-odds-calculator' }).children.join(''),
      'Spot Link Copied',
    );
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
    if (prevNavigator) Object.defineProperty(globalThis, 'navigator', prevNavigator);
  }
});
