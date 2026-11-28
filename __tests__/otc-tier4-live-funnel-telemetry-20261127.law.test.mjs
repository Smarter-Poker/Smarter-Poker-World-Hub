/**
 * OTC Tier 4 Live Organic Conversion Funnel Telemetry - Permanent CI Fortress Law Test (2026-11-27)
 *
 * Enforces:
 *   1. `SEO_FUNNEL_EVENTS` defines the exact 9 canonical SEO conversion funnel events.
 *   2. `buildSeoFunnelSummary` computes exact stage totals, safe conversion rates
 *      (`null` when denominator is 0, never `NaN`/`Infinity`), and emits strictly
 *      aggregate zero-PII counts.
 *   3. `loadSeoFunnelRollup` follows PostHog HogQL API (`https://us.posthog.com`),
 *      uses 5-minute TTL cache with `resetSeoFunnelRollupCacheForTest()`, enforces
 *      strict `AbortController` timeouts, never leaks credentials, never throws,
 *      and never substitutes unavailable telemetry for zeros.
 *   4. `pages/api/health/signup.js` attaches `seoFunnel` in parallel without
 *      degrading HTTP 200 health status on PostHog errors/timeouts.
 *   5. `pages/admin/signup-health.js` renders `#SMARTERDESIGN`
 *      "Live Organic Conversion Funnel (7-Day Telemetry)" below Attribution with
 *      proportional cyan/blue bars when available and honest
 *      "PostHog Telemetry Unavailable" state when unavailable (zero fake zeros,
 *      zero em/en dashes, zero banned gold hexes).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  SEO_FUNNEL_EVENTS,
  buildSeoFunnelHogqlQuery,
  buildSeoFunnelSummary,
  loadSeoFunnelRollup,
  resetSeoFunnelRollupCacheForTest,
} from '../src/lib/acquisition/seoFunnelRollup.mjs';
import {
  loadRecentSignupAttribution,
  summarizeSignupAttribution,
} from '../src/lib/acquisition/attributionSummary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BANNED_GOLD_RE = /#(?:ffd700|d4af37|f5c542|f59e0b|fbbf24|eab308|d97706)\b/i;

// 1. Pure funnel summary math & zero-PII guarantees
test('SEO_FUNNEL_EVENTS and buildSeoFunnelSummary compute exact stage totals, null-safe rates, and zero PII', () => {
  assert.deepEqual([...SEO_FUNNEL_EVENTS], [
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
  ]);

  const summary = buildSeoFunnelSummary(
    {
      seo_mini_gto_drill_answered: 120,
      seo_leak_finder_complete: 45,
      seo_calculator_save_bar_click: 35,
      seo_quick_signup_opened: 80,
      seo_quick_signup_oauth_click: 30,
      seo_quick_signup_email_continue: 10,
      seo_google_one_tap_success: 10,
      seo_post_signup_activation_shown: 25,
      seo_guest_spots_synced: 15,
      // Attempt to smuggle unknown / PII keys
      email: 'victim@example.com',
      distinct_id: '11111111-1111-4111-8111-111111111111',
      unknown_event: 999,
    },
    { windowDays: 7 },
  );

  assert.equal(summary.available, true);
  assert.equal(summary.window_days, 7);
  assert.deepEqual(Object.keys(summary.events), [...SEO_FUNNEL_EVENTS]);
  assert.deepEqual(summary.stages, {
    engaged: 200,
    sheetOpened: 80,
    authIntent: 50,
    activated: 25,
    spotsSynced: 15,
    viralShares: 0,
  });
  assert.equal(summary.rates.engagedToSheetPct, 40);
  assert.equal(summary.rates.sheetToAuthIntentPct, 62.5);
  assert.equal(summary.rates.authIntentToActivatedPct, 50);
  assert.equal(summary.rates.activatedToSyncedPct, 60);

  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /victim@example\.com|11111111-1111|unknown_event/);

  // Zero-denominator guard: rates MUST be null, never NaN/Infinity/fabricated
  const empty = buildSeoFunnelSummary({});
  assert.equal(empty.available, true);
  assert.deepEqual(empty.stages, {
    engaged: 0,
    sheetOpened: 0,
    authIntent: 0,
    activated: 0,
    spotsSynced: 0,
    viralShares: 0,
  });
  assert.equal(empty.rates.engagedToSheetPct, null);
  assert.equal(empty.rates.sheetToAuthIntentPct, null);
  assert.equal(empty.rates.authIntentToActivatedPct, null);
  assert.equal(empty.rates.activatedToSyncedPct, null);

  // Partial denominator zero (sheetOpened = 0 while authIntent > 0 via One Tap)
  const partial = buildSeoFunnelSummary({
    seo_mini_gto_drill_answered: -5,
    seo_google_one_tap_success: 4,
    seo_post_signup_activation_shown: 3,
  });
  assert.equal(partial.stages.engaged, 0, 'negative counts must clamp to 0');
  assert.equal(partial.rates.engagedToSheetPct, null);
  assert.equal(partial.rates.sheetToAuthIntentPct, null);
  assert.equal(partial.rates.authIntentToActivatedPct, 75);
});

// 2. PostHog HogQL loader: unconfigured, success + TTL cache, fetch_error, timeout
test('loadSeoFunnelRollup handles unconfigured, HogQL query + 5m cache, fetch errors, and AbortController timeout', async () => {
  resetSeoFunnelRollupCacheForTest();

  // 2a. Unconfigured -> never calls fetch, never substitutes zeros
  let calledWhenUnconfigured = false;
  const unconfigured = await loadSeoFunnelRollup({
    env: {},
    fetchImpl: async () => {
      calledWhenUnconfigured = true;
      return { ok: true, json: async () => ({ results: [] }) };
    },
  });
  assert.equal(calledWhenUnconfigured, false);
  assert.deepEqual(unconfigured, {
    available: false,
    reason: 'unconfigured',
    window_days: 7,
    events: {},
    stages: null,
    rates: null,
  });

  // Non-numeric project ID must also fail closed as unconfigured
  const badProject = await loadSeoFunnelRollup({
    env: { POSTHOG_REPORTING_API_KEY: 'phx_secret_value', POSTHOG_REPORTING_PROJECT_ID: '../bad' },
  });
  assert.equal(badProject.available, false);
  assert.equal(badProject.reason, 'unconfigured');
  assert.equal(badProject.stages, null);
  assert.doesNotMatch(JSON.stringify(badProject), /phx_secret_value/);

  // 2b. Successful HogQL fetch + 5-minute TTL cache
  const SECRET_KEY = 'phx_live_test_reporting_key_do_not_leak';
  let fetchCalls = 0;
  let capturedUrl = '';
  let capturedInit = null;
  const mockFetch = async (url, init) => {
    fetchCalls += 1;
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({
        results: [
          ['seo_mini_gto_drill_answered', 60],
          ['seo_leak_finder_complete', 25],
          ['seo_calculator_save_bar_click', 15],
          ['seo_quick_signup_opened', 40],
          ['seo_quick_signup_oauth_click', 14],
          ['seo_quick_signup_email_continue', 6],
          ['seo_google_one_tap_success', 4],
          ['seo_post_signup_activation_shown', 12],
          ['seo_guest_spots_synced', 9],
        ],
      }),
    };
  };

  const t0 = Date.parse('2026-11-28T04:00:00Z');
  const env = {
    POSTHOG_REPORTING_API_KEY: SECRET_KEY,
    POSTHOG_REPORTING_PROJECT_ID: '12345',
  };

  const first = await loadSeoFunnelRollup({ fetchImpl: mockFetch, env, windowDays: 7, now: t0 });
  assert.equal(fetchCalls, 1);
  assert.equal(capturedUrl, 'https://us.posthog.com/api/projects/12345/query/');
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.headers.Authorization, `Bearer ${SECRET_KEY}`);
  assert.ok(capturedInit.signal instanceof AbortSignal);

  const parsedBody = JSON.parse(capturedInit.body);
  assert.equal(parsedBody.query.kind, 'HogQLQuery');
  assert.match(parsedBody.query.query, /SELECT event, count\(\) AS event_count/);
  assert.match(parsedBody.query.query, /seo_mini_gto_drill_answered/);
  assert.match(parsedBody.query.query, /seo_guest_spots_synced/);

  assert.equal(first.available, true);
  assert.equal(first.stages.engaged, 100);
  assert.equal(first.stages.sheetOpened, 40);
  assert.equal(first.stages.authIntent, 24);
  assert.equal(first.stages.activated, 12);
  assert.equal(first.stages.spotsSynced, 9);
  assert.equal(first.rates.engagedToSheetPct, 40);
  assert.equal(first.rates.sheetToAuthIntentPct, 60);
  assert.equal(first.rates.authIntentToActivatedPct, 50);
  assert.doesNotMatch(JSON.stringify(first), new RegExp(SECRET_KEY));

  // Mutating caller's returned object must not corrupt cached copy
  first.stages.engaged = 999999;

  // Second call within 5 minutes uses cache (no second fetch)
  const second = await loadSeoFunnelRollup({
    fetchImpl: mockFetch,
    env,
    windowDays: 7,
    now: t0 + 2 * 60 * 1000,
  });
  assert.equal(fetchCalls, 1, 'second call within 5m TTL must reuse cache');
  assert.equal(second.stages.engaged, 100, 'cached summary must remain intact');

  // Call after 5-minute TTL expires triggers fresh query
  const third = await loadSeoFunnelRollup({
    fetchImpl: mockFetch,
    env,
    windowDays: 7,
    now: t0 + 6 * 60 * 1000,
  });
  assert.equal(fetchCalls, 2, 'call after 5m TTL must re-fetch');
  assert.equal(third.available, true);

  // resetSeoFunnelRollupCacheForTest forces fresh fetch even at same timestamp
  resetSeoFunnelRollupCacheForTest();
  await loadSeoFunnelRollup({
    fetchImpl: mockFetch,
    env,
    windowDays: 7,
    now: t0 + 6 * 60 * 1000,
  });
  assert.equal(fetchCalls, 3, 'resetSeoFunnelRollupCacheForTest must clear cache');

  // 2c. Upstream HTTP 500 -> fetch_error, never throws, never fakes zeros
  resetSeoFunnelRollupCacheForTest();
  const httpErr = await loadSeoFunnelRollup({
    env,
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }),
  });
  assert.deepEqual(httpErr, {
    available: false,
    reason: 'fetch_error',
    window_days: 7,
    events: {},
    stages: null,
    rates: null,
  });

  // 2d. Strict AbortController timeout -> timeout, never throws, never fakes zeros
  resetSeoFunnelRollupCacheForTest();
  let aborted = false;
  const timedOut = await loadSeoFunnelRollup({
    env,
    timeoutMs: 35,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  });
  assert.equal(aborted, true, 'AbortController must abort slow PostHog requests');
  assert.deepEqual(timedOut, {
    available: false,
    reason: 'timeout',
    window_days: 7,
    events: {},
    stages: null,
    rates: null,
  });

  // Query helper rejects invalid window
  assert.throws(() => buildSeoFunnelHogqlQuery('2026-11-28T00:00:00Z', '2026-11-27T00:00:00Z'));
});

// 3. pages/api/health/signup.js wiring: parallel non-breaking seoFunnel
test('pages/api/health/signup.js wires seoFunnel in parallel and never degrades HTTP 200 on PostHog failure', async () => {
  const src = read('pages/api/health/signup.js');
  assert.match(src, /seoFunnelRollup\.mjs/);
  assert.match(src, /loadSeoFunnelRollup/);
  assert.match(src, /seoFunnel:/);

  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const compiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: 'signup-health-api.js',
  }).outputText;

  let funnelMode = 'ok';
  const mockLoadSeoFunnelRollup = async () => {
    if (funnelMode === 'throw') throw new Error('posthog exploded');
    if (funnelMode === 'timeout') {
      return { available: false, reason: 'timeout', window_days: 7, events: {}, stages: null, rates: null };
    }
    return buildSeoFunnelSummary({
      seo_mini_gto_drill_answered: 40,
      seo_quick_signup_opened: 20,
      seo_quick_signup_oauth_click: 10,
      seo_post_signup_activation_shown: 5,
      seo_guest_spots_synced: 4,
    });
  };

  const mockSupabase = {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({
          data: {
            new_users_15m: 1,
            new_users_1h: 3,
            new_users_24h: 18,
            errors_1h: 0,
            errors_24h: 0,
            last_signup_at: new Date().toISOString(),
            last_error_at: null,
          },
          error: null,
        }),
      }),
    }),
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  };

  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    process: { ...process, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: 'local-test-key' } },
    require: (name) => {
      if (name === '@supabase/supabase-js') return { createClient: () => mockSupabase };
      if (name.endsWith('apiErrorHandler')) return { reportApiError: () => {} };
      if (name.endsWith('attributionSummary.mjs')) return { loadRecentSignupAttribution, summarizeSignupAttribution };
      if (name.endsWith('seoFunnelRollup.mjs')) return { loadSeoFunnelRollup: mockLoadSeoFunnelRollup };
      return {};
    },
  });

  const invoke = async () => {
    let statusCode = null;
    let body = null;
    const res = {
      setHeader: () => {},
      status: (code) => ({
        json: (payload) => {
          statusCode = code;
          body = payload;
          return res;
        },
      }),
    };
    await mod.exports.default({ method: 'GET' }, res);
    return { statusCode, body };
  };

  const okRes = await invoke();
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.body.status, 'ok');
  assert.equal(okRes.body.seoFunnel.available, true);
  assert.equal(okRes.body.seoFunnel.stages.engaged, 40);
  assert.equal(okRes.body.seoFunnel.rates.engagedToSheetPct, 50);

  // Timeout must NOT degrade HTTP 200 health status
  funnelMode = 'timeout';
  const timeoutRes = await invoke();
  assert.equal(timeoutRes.statusCode, 200);
  assert.equal(timeoutRes.body.status, 'ok');
  assert.equal(timeoutRes.body.seoFunnel.available, false);
  assert.equal(timeoutRes.body.seoFunnel.reason, 'timeout');
  assert.equal(timeoutRes.body.seoFunnel.stages, null);

  // Unexpected throw inside rollup loader must NOT degrade HTTP 200 health status
  funnelMode = 'throw';
  const throwRes = await invoke();
  assert.equal(throwRes.statusCode, 200);
  assert.equal(throwRes.body.status, 'ok');
  assert.equal(throwRes.body.seoFunnel.available, false);
  assert.equal(throwRes.body.seoFunnel.stages, null);
});

// 4. pages/admin/signup-health.js rendering: available & honest unavailable states
test('pages/admin/signup-health.js renders Live Organic Conversion Funnel (7-Day Telemetry) and honest unavailable state', () => {
  const src = read('pages/admin/signup-health.js');
  assert.match(src, /seoFunnelRollup\.mjs/);
  assert.match(src, /Live Organic Conversion Funnel \(7-Day Telemetry\)/);
  assert.match(src, /PostHog Telemetry Unavailable/);
  assert.doesNotMatch(src, BANNED_GOLD_RE, 'must contain zero banned gold hexes');

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
    generatedAt: '2026-11-28T04:00:00Z',
    attribution: {
      available: true,
      totalSignups: 12,
      channels: { organic_google: 5, organic_bing: 1, organic_ai: 3, referral: 1, paid_or_utm: 1, direct: 1 },
      providers: { google: 6, facebook: 2, email: 4, other: 0, oauth_total: 8 },
      landingPages: [],
      unlockKeys: [],
    },
  };

  // 4a. Available telemetry state
  const liveFunnel = buildSeoFunnelSummary({
    seo_mini_gto_drill_answered: 150,
    seo_leak_finder_complete: 30,
    seo_calculator_save_bar_click: 20,
    seo_quick_signup_opened: 90,
    seo_quick_signup_oauth_click: 36,
    seo_quick_signup_email_continue: 9,
    seo_google_one_tap_success: 0,
    seo_post_signup_activation_shown: 18,
    seo_guest_spots_synced: 9,
  });

  const htmlAvailable = renderToStaticMarkup(
    React.createElement(mod.exports.default, { ...baseProps, seoFunnel: liveFunnel }),
  );

  // Panel must appear BELOW Organic SEO & Conversion Funnel Attribution
  const attrIdx = htmlAvailable.indexOf('id="organic-attribution-scorecard"');
  const funnelIdx = htmlAvailable.indexOf('id="live-organic-funnel-scorecard"');
  assert.ok(attrIdx > -1 && funnelIdx > attrIdx, 'Live Organic Conversion Funnel must render below Attribution scorecard');

  assert.match(htmlAvailable, /Live Organic Conversion Funnel \(7-Day Telemetry\)/);
  assert.match(htmlAvailable, /Tool\/Drill Engaged/);
  assert.match(htmlAvailable, /Quick Signup Opened/);
  assert.match(htmlAvailable, /OAuth \/ Email Click/);
  assert.match(htmlAvailable, /Account Activated/);
  assert.match(htmlAvailable, /Cloud Spots Synced/);
  assert.match(htmlAvailable, /role="progressbar"/);
  assert.match(htmlAvailable, /45%/);
  assert.match(htmlAvailable, /50%/);
  assert.match(htmlAvailable, /40%/);
  assert.doesNotMatch(htmlAvailable, /NaN|Infinity/);

  // 4b. Unavailable telemetry state -> honest message, ZERO fake stage bars
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

  assert.match(htmlUnavailable, /Live Organic Conversion Funnel \(7-Day Telemetry\)/);
  assert.match(htmlUnavailable, /PostHog Telemetry Unavailable/);
  assert.match(htmlUnavailable, /data-state="unavailable"/);
  assert.doesNotMatch(htmlUnavailable, /data-funnel-stage=/, 'unavailable state must never render fake zero funnel stages');
});
