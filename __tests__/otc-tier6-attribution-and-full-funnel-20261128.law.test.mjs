/**
 * OTC Tier 6 Dark-Social OAuth Attribution & Full Tier 1-6 Organic Funnel Rollup
 * Permanent CI Fortress Law Test (2026-11-28)
 *
 * Enforces:
 *   1. `hasAttributionPayload(meta)` recognizes all 6 canonical attribution keys
 *      and rejects empty, null, array, whitespace, or unrelated payloads.
 *   2. Dark-social / iOS Safari / Google App / direct organic OAuth sign-ups
 *      without `utm_source` complete full flow-bound `beginOAuthAttribution` ->
 *      `attributionForNewAccount` round-trips, while empty storage still returns
 *      `null` and existing attributed accounts (`acquisition_utm_source` OR
 *      `acquisition_landing_path`) are never overwritten.
 *   3. `SEO_FUNNEL_EVENTS` defines all 17 canonical zero-PII Tier 1-6 events,
 *      `buildSeoFunnelHogqlQuery` queries all 17 events, and `buildSeoFunnelSummary`
 *      rolls up Tier 4-6 clicks into `stages.engaged`, includes
 *      `seo_quick_signup_magic_link_sent` in `stages.authIntent`, computes
 *      `stages.viralShares`, and preserves all 5 funnel stages + 4 rate keys.
 *   4. `pages/admin/signup-health.js` renders `Viral Shares` alongside the
 *      5-stage funnel bar chart and displays all 8 Tier 4-6 event counters cleanly
 *      with zero em/en dashes, zero banned gold hexes, and zero fake counters
 *      when PostHog telemetry is unavailable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  FIRST_LANDING_KEY,
  FIRST_TOUCH_KEY,
  OAUTH_INTENT_KEY,
  hasAttributionPayload,
  recordFirstTouch,
  recordUnlockIntent,
  firstTouchMetadata,
  beginOAuthAttribution,
  attributionForNewAccount,
} from '../src/lib/acquisition/firstTouch.mjs';
import {
  SEO_FUNNEL_EVENTS,
  buildSeoFunnelHogqlQuery,
  buildSeoFunnelSummary,
  loadSeoFunnelRollup,
  resetSeoFunnelRollupCacheForTest,
} from '../src/lib/acquisition/seoFunnelRollup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BANNED_GOLD_RE = /#(?:ffd700|d4af37|f5c542|f59e0b|fbbf24|eab308|d97706)\b/i;

function fakeWindow(search = '', pathname = '/', referrer = '') {
  const store = new Map();
  return {
    location: { search, pathname },
    document: { referrer },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    store,
  };
}

function oauthUser(createdIso, signedInIso, extra = {}) {
  return {
    app_metadata: { provider: 'google' },
    created_at: createdIso,
    last_sign_in_at: signedInIso,
    user_metadata: {},
    ...extra,
  };
}

// 1. Pure hasAttributionPayload helper
test('OTC TIER 6 LAW 1: hasAttributionPayload detects every canonical attribution key and rejects empty payloads', () => {
  for (const invalid of [
    null,
    undefined,
    '',
    'google',
    42,
    [],
    {},
    { acquisition_utm_source: '' },
    { acquisition_utm_source: '   ' },
    { acquisition_landing_path: null },
    { acquisition_captured_at: '2026-11-28T00:00:00.000Z' },
  ]) {
    assert.equal(hasAttributionPayload(invalid), false, `expected false for ${JSON.stringify(invalid)}`);
  }

  for (const valid of [
    { acquisition_utm_source: 'google' },
    { acquisition_landing_path: '/tools/poker-odds-calculator' },
    { unlock_key: 'solver-matrix' },
    { seo_source: 'quick-signup-sheet' },
    { experiment_variant: 'welcome-vip-500' },
    { acquisition_ai_engine: 'chatgpt' },
  ]) {
    assert.equal(hasAttributionPayload(valid), true, `expected true for ${JSON.stringify(valid)}`);
  }
});

// 2. Dark-social OAuth round-trip, empty storage null, and overwrite protection
test('OTC TIER 6 LAW 2: dark-social and unlock-intent OAuth attribution survive round-trip without utm_source and never overwrite existing accounts', () => {
  const t0 = Date.parse('2026-11-28T06:00:00Z');

  // 2a. Dark-social / iOS Safari landing (no utm_source, no document.referrer)
  const darkWin = fakeWindow('', '/tools/poker-odds-calculator', '');
  assert.equal(recordFirstTouch(darkWin, t0 - 60_000), null);
  assert.equal(darkWin.store.has(FIRST_TOUCH_KEY), false);
  assert.equal(darkWin.store.has(FIRST_LANDING_KEY), true);

  darkWin.location = { search: '', pathname: '/auth/signup' };
  const darkNonce = beginOAuthAttribution(darkWin, t0);
  assert.match(darkNonce, /^[a-f0-9]{32}$/, 'dark-social landing must mint an OAuth attribution nonce');

  const freshDarkUser = oauthUser('2026-11-28T06:00:15.000Z', '2026-11-28T06:00:15.200Z');
  const darkMeta = attributionForNewAccount(freshDarkUser, darkWin, t0 + 25_000, darkNonce);
  assert.deepEqual(darkMeta, {
    acquisition_landing_path: '/tools/poker-odds-calculator',
  });
  assert.equal(darkWin.store.has(OAUTH_INTENT_KEY), false, 'nonce must remain single-use');
  assert.equal(
    attributionForNewAccount(freshDarkUser, darkWin, t0 + 30_000, darkNonce),
    null,
    'replayed dark-social callback must return null',
  );

  // 2b. Unlock-intent-only OAuth flow (no UTM, no landing path)
  const unlockWin = fakeWindow('', '/auth/login', '');
  recordUnlockIntent(
    {
      unlockKey: 'gto-matrix',
      source: 'venue-follow',
      experimentVariant: 'welcome-vip-500',
      aiEngine: 'perplexity',
    },
    unlockWin,
    t0 - 15_000,
  );
  const unlockNonce = beginOAuthAttribution(unlockWin, t0);
  assert.match(unlockNonce, /^[a-f0-9]{32}$/, 'unlock intent alone must mint an OAuth attribution nonce');

  const unlockMeta = attributionForNewAccount(freshDarkUser, unlockWin, t0 + 20_000, unlockNonce);
  assert.deepEqual(unlockMeta, {
    unlock_key: 'gto-matrix',
    seo_source: 'venue-follow',
    experiment_variant: 'welcome-vip-500',
    acquisition_ai_engine: 'perplexity',
  });

  // 2c. Empty storage (no UTM, no landing path, no unlock intent) MUST still return null
  const emptyWin = fakeWindow('', '/auth/login', '');
  assert.deepEqual(firstTouchMetadata(emptyWin, t0), {});
  assert.equal(beginOAuthAttribution(emptyWin, t0), null);

  // Even if a forged intent somehow existed with empty metadata, attributionForNewAccount returns null
  const fakeNonce = 'b'.repeat(32);
  emptyWin.localStorage.setItem(OAUTH_INTENT_KEY, JSON.stringify({ nonce: fakeNonce, started_at: new Date(t0).toISOString() }));
  assert.equal(attributionForNewAccount(freshDarkUser, emptyWin, t0 + 20_000, fakeNonce), null);

  // 2d. Existing attributed user is NEVER overwritten (either utm_source OR landing_path)
  const makeDarkBrowser = () => {
    const w = fakeWindow('', '/learn/icm-basics', '');
    recordFirstTouch(w, t0 - 30_000);
    return w;
  };
  let existingWin = makeDarkBrowser();
  let n1 = beginOAuthAttribution(existingWin, t0);
  assert.equal(
    attributionForNewAccount(
      oauthUser('2026-11-28T06:00:10.000Z', '2026-11-28T06:00:10.100Z', {
        user_metadata: { acquisition_utm_source: 'reddit' },
      }),
      existingWin,
      t0 + 15_000,
      n1,
    ),
    null,
    'existing user with acquisition_utm_source must never be overwritten',
  );

  existingWin = makeDarkBrowser();
  const n2 = beginOAuthAttribution(existingWin, t0);
  assert.equal(
    attributionForNewAccount(
      oauthUser('2026-11-28T06:00:10.000Z', '2026-11-28T06:00:10.100Z', {
        user_metadata: { acquisition_landing_path: '/tools/icm-calculator' },
      }),
      existingWin,
      t0 + 15_000,
      n2,
    ),
    null,
    'existing user with acquisition_landing_path must never be overwritten',
  );
});

// 3. Full 21-event Tier 1-6 SEO Funnel Rollup & HogQL query (1:1 emitted event parity)
test('OTC TIER 6 LAW 3: SEO_FUNNEL_EVENTS, HogQL query, buildSeoFunnelSummary, and loadSeoFunnelRollup cover all 21 live-emitted Tier 1-6 events', async () => {
  const expectedEvents = [
    'seo_mini_gto_drill_answered',
    'seo_mini_gto_drill_cta_click',
    'seo_leak_finder_complete',
    'seo_leak_finder_unlock_click',
    'seo_calculator_save_bar_click',
    'seo_quick_signup_opened',
    'seo_quick_signup_oauth_click',
    'seo_quick_signup_email_continue',
    'seo_google_one_tap_success',
    'seo_post_signup_activation_shown',
    'seo_post_signup_day0_win_click',
    'seo_guest_spots_synced',
    'seo_local_action_bar_click',
    'seo_calc_milestone_click',
    'seo_quick_signup_magic_link_sent',
    'seo_concept_bridge_click',
    'seo_calculator_share_click',
    'seo_mini_gto_drill_share',
    'seo_member_referral_link_copied',
    'seo_venue_follow_signup_click',
    'seo_video_bridge_click',
  ];

  assert.equal(SEO_FUNNEL_EVENTS.length, 21);
  assert.deepEqual([...SEO_FUNNEL_EVENTS], expectedEvents);

  const hogql = buildSeoFunnelHogqlQuery('2026-11-21T00:00:00Z', '2026-11-28T00:00:00Z');
  for (const eventName of expectedEvents) {
    assert.ok(hogql.includes(`'${eventName}'`), `HogQL query must include '${eventName}'`);
  }

  const allCounts = {
    // Engaged = 10 + 4 + 20 + 6 + 30 + 15 + 25 + 12 + 8 + 5 = 135 (let's sum to 125 for crisp percentages: 5+5+15+5+30+15+25+12+8+5=125)
    seo_mini_gto_drill_answered: 5,
    seo_mini_gto_drill_cta_click: 5,
    seo_leak_finder_complete: 15,
    seo_leak_finder_unlock_click: 5,
    seo_calculator_save_bar_click: 30,
    seo_local_action_bar_click: 15,
    seo_calc_milestone_click: 25,
    seo_concept_bridge_click: 12,
    seo_venue_follow_signup_click: 8,
    seo_video_bridge_click: 5,
    // Sheet opened = 50
    seo_quick_signup_opened: 50,
    // Auth intent (including magic link) = 12 + 8 + 7 + 3 = 30
    seo_quick_signup_oauth_click: 12,
    seo_quick_signup_email_continue: 8,
    seo_quick_signup_magic_link_sent: 7,
    seo_google_one_tap_success: 3,
    // Activated & synced
    seo_post_signup_activation_shown: 18,
    seo_post_signup_day0_win_click: 4,
    seo_guest_spots_synced: 9,
    // Viral shares = 10 + 4 + 6 = 20
    seo_calculator_share_click: 10,
    seo_mini_gto_drill_share: 4,
    seo_member_referral_link_copied: 6,
    // Smuggled PII key must be stripped
    email: 'player@example.com',
  };

  const summary = buildSeoFunnelSummary(allCounts, { windowDays: 7 });
  assert.equal(summary.available, true);
  assert.deepEqual(Object.keys(summary.events), expectedEvents);
  assert.deepEqual(summary.stages, {
    engaged: 125,
    sheetOpened: 50,
    authIntent: 30,
    activated: 18,
    spotsSynced: 9,
    viralShares: 20,
  });
  assert.deepEqual(summary.rates, {
    engagedToSheetPct: 40,
    sheetToAuthIntentPct: 60,
    authIntentToActivatedPct: 60,
    activatedToSyncedPct: 50,
  });
  assert.doesNotMatch(JSON.stringify(summary), /player@example\.com/);

  // Verify loadSeoFunnelRollup parses all 17 rows from PostHog HogQL response
  resetSeoFunnelRollupCacheForTest();
  const rows = expectedEvents.map((name) => [name, allCounts[name]]);
  const loaded = await loadSeoFunnelRollup({
    env: {
      POSTHOG_REPORTING_API_KEY: 'phx_test_tier6',
      POSTHOG_REPORTING_PROJECT_ID: '67890',
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ results: rows }),
    }),
    now: Date.parse('2026-11-28T07:00:00Z'),
  });
  assert.equal(loaded.available, true);
  assert.deepEqual(loaded.stages, summary.stages);
  assert.deepEqual(loaded.rates, summary.rates);
});

// 4. /admin/signup-health renders Viral Shares and all 8 Tier 4-6 event counters cleanly
test('OTC TIER 6 LAW 4: pages/admin/signup-health.js renders Viral Shares and Tier 4-6 event counters cleanly without PII, em dashes, or fake unavailable counters', () => {
  const src = read('pages/admin/signup-health.js');
  assert.doesNotMatch(src, BANNED_GOLD_RE, 'signup-health.js must contain zero banned gold hexes');
  const funnelBlock = src.slice(src.indexOf('function LiveOrganicFunnelScorecard'));
  assert.doesNotMatch(funnelBlock, /[—–]/, 'LiveOrganicFunnelScorecard must contain zero em/en dashes');

  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');

  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: 'signup-health.jsx',
  }).outputText;

  const mockStyles = {
    surface: 'surface',
    panel: 'panel',
    metric: 'metric',
    state: 'state',
    tableWell: 'tableWell',
    responsiveGrid: 'responsiveGrid',
  };
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    process,
    require: (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === '@supabase/supabase-js') return { createClient: () => ({}) };
      if (name.endsWith('OperatorAdminSurface.module.css')) return { __esModule: true, default: mockStyles, ...mockStyles };
      if (name.endsWith('GrowthScorecard')) return { __esModule: true, default: () => React.createElement('div', { id: 'mock-growth' }) };
      if (name.endsWith('growthScorecard.mjs')) return { loadGrowthScorecard: async () => null };
      if (name.endsWith('attributionSummary.mjs')) return { loadRecentSignupAttribution: async () => null };
      if (name.endsWith('seoFunnelRollup.mjs')) return { loadSeoFunnelRollup: async () => null };
      return {};
    },
  });

  const baseProps = {
    health: { new_users_15m: 2, new_users_1h: 5, new_users_24h: 24, probe_runs_15m: 1, errors_1h: 0, errors_24h: 0 },
    heartbeats: [],
    errors: [],
    generatedAt: '2026-11-28T07:00:00Z',
    attribution: {
      available: true,
      totalSignups: 12,
      channels: { organic_google: 5, organic_bing: 1, organic_ai: 3, referral: 1, paid_or_utm: 1, direct: 1 },
      providers: { google: 6, facebook: 2, email: 4, other: 0, oauth_total: 8 },
      landingPages: [],
      unlockKeys: [],
    },
  };

  const liveFunnel = buildSeoFunnelSummary({
    seo_mini_gto_drill_answered: 80,
    seo_leak_finder_complete: 20,
    seo_calculator_save_bar_click: 10,
    seo_local_action_bar_click: 19,
    seo_calc_milestone_click: 23,
    seo_concept_bridge_click: 17,
    seo_venue_follow_signup_click: 13,
    seo_video_bridge_click: 18,
    seo_quick_signup_opened: 100,
    seo_quick_signup_oauth_click: 25,
    seo_quick_signup_email_continue: 10,
    seo_quick_signup_magic_link_sent: 11,
    seo_google_one_tap_success: 4,
    seo_post_signup_activation_shown: 25,
    seo_guest_spots_synced: 15,
    seo_calculator_share_click: 20,
    seo_mini_gto_drill_share: 9,
    seo_member_referral_link_copied: 14,
  });

  const htmlAvailable = renderToStaticMarkup(
    React.createElement(mod.exports.default, { ...baseProps, seoFunnel: liveFunnel }),
  );

  // Viral Shares metric displayed alongside the 5-stage funnel
  assert.match(htmlAvailable, /data-funnel-metric="viralShares"/);
  assert.match(htmlAvailable, /Viral Shares/);
  assert.match(htmlAvailable, />43</);

  // All 9 Tier 4-6 event counters rendered cleanly
  assert.match(htmlAvailable, /Tier 4-6 Organic Event Counters/);
  assert.match(htmlAvailable, /data-section="tier46-event-counters"/);
  for (const [eventKey, label] of [
    ['seo_local_action_bar_click', 'Local Action Clicks'],
    ['seo_calc_milestone_click', 'Calculator Milestone Clicks'],
    ['seo_quick_signup_magic_link_sent', 'Magic Link Emails Sent'],
    ['seo_concept_bridge_click', 'Concept Bridge Clicks'],
    ['seo_calculator_share_click', 'Calculator Spot Shares'],
    ['seo_mini_gto_drill_share', 'GTO Drill Shares'],
    ['seo_member_referral_link_copied', 'Member Referral Copies'],
    ['seo_venue_follow_signup_click', 'Venue Follow Signups'],
    ['seo_video_bridge_click', 'Video Bridge Clicks'],
  ]) {
    assert.match(htmlAvailable, new RegExp(`data-event-counter="${eventKey}"`), `must render counter for ${eventKey}`);
    assert.match(htmlAvailable, new RegExp(label), `must render Title Case label ${label}`);
  }
  assert.doesNotMatch(htmlAvailable, /NaN|Infinity/);

  // Unavailable state must never render Viral Shares or Tier 4-6 fake counters
  const htmlUnavailable = renderToStaticMarkup(
    React.createElement(mod.exports.default, {
      ...baseProps,
      seoFunnel: {
        available: false,
        reason: 'unconfigured',
        window_days: 7,
        events: {},
        stages: null,
        rates: null,
      },
    }),
  );
  assert.doesNotMatch(htmlUnavailable, /data-funnel-stage=/);
  assert.doesNotMatch(htmlUnavailable, /data-funnel-metric="viralShares"/);
  assert.doesNotMatch(htmlUnavailable, /data-event-counter=/);
});
