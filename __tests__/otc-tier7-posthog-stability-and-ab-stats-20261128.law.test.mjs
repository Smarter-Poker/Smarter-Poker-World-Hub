/**
 * OTC Tier 7 PostHog Stability, Stale Fallback Cache & Statistical Significance
 * Permanent CI Fortress Law Test (2026-11-28)
 *
 * Enforces:
 *   1. `src/lib/acquisition/seoFunnelRollup.mjs` uses `refresh: 'blocking'`,
 *      widens default `timeoutMs` to `6500`, preserves all 21 `SEO_FUNNEL_EVENTS`,
 *      maintains a 30-minute `staleFallbackCache` returning `{ ...snapshot, stale: true }`
 *      on transient timeout/fetch_error, fails closed on cold start or expired
 *      stale cache (never fabricating zeros), and clears both caches in
 *      `resetSeoFunnelRollupCacheForTest()`.
 *   2. `src/lib/acquisition/abSignificance.mjs` exports pure
 *      `computeVariantSignificance` (accurate two-proportion z-test + erfc p-value,
 *      zero NaN/Infinity on edge/invalid inputs) and `evaluateAuthProviderReadiness`
 *      (boolean-only Google One Tap status, never leaking secret values).
 *   3. `pages/admin/signup-health.js` renders `#SMARTERDESIGN` Statistical
 *      Significance badge (`data-testid="ab-significance-badge"`), compact
 *      `OAuth & One Tap Readiness` card (`data-testid="oauth-readiness-card"`),
 *      and subtle `Cached Snapshot` pill when `seoFunnel.stale === true`, with
 *      zero secret values, zero PII, zero em/en dashes, and zero banned gold hexes.
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
  buildSeoFunnelSummary,
  loadSeoFunnelRollup,
  resetSeoFunnelRollupCacheForTest,
} from '../src/lib/acquisition/seoFunnelRollup.mjs';
import {
  computeVariantSignificance,
  evaluateAuthProviderReadiness,
} from '../src/lib/acquisition/abSignificance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BANNED_GOLD_RE = /#(?:ffd700|d4af37|f5c542|f59e0b|fbbf24|eab308|d97706)\b/i;

function assertNoNonFiniteValues(obj, label) {
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'number') {
      assert.ok(Number.isFinite(val), `${label}.${key} must be finite, got ${val}`);
    }
  }
}

// 1. PostHog HogQL stability: refresh:'blocking', 6500ms default timeout, 30m stale fallback vs cold fail-closed
test('OTC TIER 7 LAW 1: seoFunnelRollup uses refresh:blocking, 6500ms default timeout, 21 events, and 30m stale fallback vs cold fail-closed', async () => {
  const src = read('src/lib/acquisition/seoFunnelRollup.mjs');
  assert.match(src, /refresh:\s*'blocking'/, 'HogQL query must use refresh: blocking');
  assert.doesNotMatch(src, /force_blocking/, 'HogQL query must NOT force cold ClickHouse scans via force_blocking');
  assert.match(src, /DEFAULT_TIMEOUT_MS\s*=\s*6500/, 'default timeoutMs must be 6500ms');
  assert.match(src, /STALE_FALLBACK_TTL_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/, 'staleFallbackCache TTL must be 30 minutes');
  assert.equal(SEO_FUNNEL_EVENTS.length, 21, 'all 21 SEO_FUNNEL_EVENTS must remain intact');

  const env = {
    POSTHOG_REPORTING_API_KEY: 'phx_tier7_secret_do_not_leak',
    POSTHOG_REPORTING_PROJECT_ID: '54321',
  };
  const t0 = Date.parse('2026-11-28T09:00:00Z');

  // 1a. Cold start timeout MUST fail closed (never fabricate zeros)
  resetSeoFunnelRollupCacheForTest();
  const coldTimeout = await loadSeoFunnelRollup({
    env,
    timeoutMs: 25,
    now: t0,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  });
  assert.deepEqual(coldTimeout, {
    available: false,
    reason: 'timeout',
    window_days: 7,
    events: {},
    stages: null,
    rates: null,
  });

  // 1b. Cold start HTTP 500 MUST fail closed
  const coldError = await loadSeoFunnelRollup({
    env,
    now: t0 + 1000,
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }),
  });
  assert.deepEqual(coldError, {
    available: false,
    reason: 'fetch_error',
    window_days: 7,
    events: {},
    stages: null,
    rates: null,
  });

  // 1c. Warm fetch succeeds with refresh:'blocking' and populates both 5m + 30m caches
  let capturedBody = null;
  let fetchCount = 0;
  const warmFetch = async (_url, init) => {
    fetchCount += 1;
    capturedBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        results: [
          ['seo_mini_gto_drill_answered', 100],
          ['seo_quick_signup_opened', 50],
          ['seo_quick_signup_oauth_click', 25],
          ['seo_post_signup_activation_shown', 15],
          ['seo_guest_spots_synced', 10],
        ],
      }),
    };
  };

  const fresh = await loadSeoFunnelRollup({ env, now: t0, fetchImpl: warmFetch });
  assert.equal(fetchCount, 1);
  assert.equal(capturedBody.refresh, 'blocking');
  assert.equal(fresh.available, true);
  assert.equal(fresh.stale, undefined);
  assert.equal(fresh.stages.engaged, 100);
  assert.equal(fresh.stages.sheetOpened, 50);

  // 1d. After 5m fresh TTL expires (t0 + 10m), transient timeout returns stale clone with stale: true
  const staleOnTimeout = await loadSeoFunnelRollup({
    env,
    timeoutMs: 25,
    now: t0 + 10 * 60 * 1000,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  });
  assert.equal(staleOnTimeout.available, true);
  assert.equal(staleOnTimeout.stale, true);
  assert.equal(staleOnTimeout.stages.engaged, 100);
  assert.equal(staleOnTimeout.stages.sheetOpened, 50);

  // Mutating returned stale clone must NOT corrupt cached snapshot
  staleOnTimeout.stages.engaged = 999999;

  // 1e. After 5m fresh TTL expires (t0 + 20m), transient fetch_error also returns intact stale snapshot
  const staleOnError = await loadSeoFunnelRollup({
    env,
    now: t0 + 20 * 60 * 1000,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  assert.equal(staleOnError.available, true);
  assert.equal(staleOnError.stale, true);
  assert.equal(staleOnError.stages.engaged, 100);

  // 1f. After 30m stale TTL expires (t0 + 31m), transient error MUST fail closed (no stale data!)
  const expiredFallback = await loadSeoFunnelRollup({
    env,
    now: t0 + 31 * 60 * 1000,
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  assert.deepEqual(expiredFallback, {
    available: false,
    reason: 'fetch_error',
    window_days: 7,
    events: {},
    stages: null,
    rates: null,
  });

  // 1g. resetSeoFunnelRollupCacheForTest clears BOTH rollupCache AND staleFallbackCache
  await loadSeoFunnelRollup({ env, now: t0, fetchImpl: warmFetch });
  resetSeoFunnelRollupCacheForTest();
  const afterResetError = await loadSeoFunnelRollup({
    env,
    now: t0 + 2 * 60 * 1000,
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
  assert.equal(afterResetError.available, false);
  assert.equal(afterResetError.reason, 'fetch_error');
  assert.equal(afterResetError.stages, null);
});

// 2. Statistical Significance Engine math & edge cases
test('OTC TIER 7 LAW 2: computeVariantSignificance computes accurate two-proportion z-test, pValue, liftPct, and handles zero/invalid inputs without NaN or Infinity', () => {
  // 2a. Clear variant winner (10% vs 22.5% over n=200 each -> +125% lift, p < 0.001)
  const variantWin = computeVariantSignificance({
    controlCount: 20,
    controlTotal: 200,
    variantCount: 45,
    variantTotal: 200,
  });
  assertNoNonFiniteValues(variantWin, 'variantWin');
  assert.equal(variantWin.sampleReady, true);
  assert.equal(variantWin.significant, true);
  assert.equal(variantWin.winner, 'variant');
  assert.equal(variantWin.confidenceLabel, '95%+ Confidence');
  assert.equal(variantWin.liftPct, 125);
  assert.ok(variantWin.zScore > 3.3 && variantWin.zScore < 3.5, `expected zScore ~3.39, got ${variantWin.zScore}`);
  assert.ok(variantWin.pValue > 0 && variantWin.pValue < 0.002, `expected pValue < 0.002, got ${variantWin.pValue}`);

  // 2b. Clear control winner (30% vs 15% over n=200 each -> -50% lift, p < 0.001)
  const controlWin = computeVariantSignificance({
    controlCount: 60,
    controlTotal: 200,
    variantCount: 30,
    variantTotal: 200,
  });
  assertNoNonFiniteValues(controlWin, 'controlWin');
  assert.equal(controlWin.sampleReady, true);
  assert.equal(controlWin.significant, true);
  assert.equal(controlWin.winner, 'control');
  assert.equal(controlWin.confidenceLabel, '95%+ Confidence');
  assert.equal(controlWin.liftPct, -50);
  assert.ok(controlWin.zScore < -3.5);
  assert.ok(controlWin.pValue < 0.001);

  // 2c. Sample ready, statistically indistinguishable -> tie / No Clear Winner
  const tie = computeVariantSignificance({
    controlCount: 50,
    controlTotal: 200,
    variantCount: 54,
    variantTotal: 200,
  });
  assertNoNonFiniteValues(tie, 'tie');
  assert.equal(tie.sampleReady, true);
  assert.equal(tie.significant, false);
  assert.equal(tie.winner, 'tie');
  assert.equal(tie.confidenceLabel, 'No Clear Winner');
  assert.equal(tie.liftPct, 8);
  assert.ok(tie.pValue > 0.6 && tie.pValue < 0.7, `expected pValue ~0.649, got ${tie.pValue}`);

  // 2d. Insufficient sample (<30 per arm) MUST never declare significance even with huge gap
  const smallSample = computeVariantSignificance({
    controlCount: 2,
    controlTotal: 20,
    variantCount: 16,
    variantTotal: 20,
  });
  assertNoNonFiniteValues(smallSample, 'smallSample');
  assert.equal(smallSample.sampleReady, false);
  assert.equal(smallSample.significant, false);
  assert.equal(smallSample.winner, 'insufficient_sample');
  assert.equal(smallSample.confidenceLabel, 'Collecting Sample');

  // 2e. Zero, negative, out-of-range, NaN, Infinity, and empty inputs NEVER produce NaN or Infinity
  const edgeCases = [
    undefined,
    {},
    { controlCount: 0, controlTotal: 0, variantCount: 0, variantTotal: 0 },
    { controlCount: 0, controlTotal: 100, variantCount: 15, variantTotal: 100 },
    { controlCount: 100, controlTotal: 100, variantCount: 100, variantTotal: 100 },
    { controlCount: -10, controlTotal: -5, variantCount: NaN, variantTotal: Infinity },
    { controlCount: 500, controlTotal: 50, variantCount: 600, variantTotal: 50 },
    { controlCount: 'bad', controlTotal: null, variantCount: undefined, variantTotal: -100, minSamplePerVariant: -5 },
  ];
  for (const input of edgeCases) {
    const res = computeVariantSignificance(input);
    assertNoNonFiniteValues(res, `edge(${JSON.stringify(input)})`);
    const serialized = JSON.stringify(res);
    assert.doesNotMatch(serialized, /NaN|Infinity/);
  }
});

// 3. Auth Provider Readiness diagnostics: boolean One Tap status, zero secret leakage
test('OTC TIER 7 LAW 3: evaluateAuthProviderReadiness inspects OAuth share and reports boolean Google One Tap status with zero secret leakage', () => {
  const SECRET_CLIENT_ID = '999888777666-supersecretclientid.apps.googleusercontent.com';

  // 3a. Configured One Tap + healthy OAuth share (60%)
  const healthy = evaluateAuthProviderReadiness({
    attribution: {
      totalSignups: 20,
      providers: { google: 9, facebook: 3, oauth_total: 12, email: 8, other: 0 },
    },
    env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: SECRET_CLIENT_ID },
  });
  assert.equal(healthy.googleOneTapConfigured, true);
  assert.equal(healthy.googleOneTapStatus, 'Configured');
  assert.equal(healthy.magicLinkReady, true);
  assert.equal(healthy.oauthSharePct, 60);
  assert.equal(healthy.emailSharePct, 40);
  assert.match(healthy.recommendation, /Healthy OAuth Adoption/);
  assert.doesNotMatch(JSON.stringify(healthy), new RegExp(SECRET_CLIENT_ID));
  assert.doesNotMatch(JSON.stringify(healthy), /999888777666/);

  // 3b. Missing One Tap env var -> Pending Env Var
  const pending = evaluateAuthProviderReadiness({
    attribution: {
      totalSignups: 10,
      providers: { google: 3, facebook: 1, oauth_total: 4, email: 6, other: 0 },
    },
    env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: '   ' },
  });
  assert.equal(pending.googleOneTapConfigured, false);
  assert.equal(pending.googleOneTapStatus, 'Pending Env Var');
  assert.equal(pending.oauthSharePct, 40);
  assert.match(pending.recommendation, /NEXT_PUBLIC_GOOGLE_CLIENT_ID/);

  // 3c. Configured One Tap + low OAuth share (<40%) -> friction audit recommendation
  const lowOauth = evaluateAuthProviderReadiness({
    attribution: {
      totalSignups: 20,
      providers: { google: 4, facebook: 0, oauth_total: 4, email: 16, other: 0 },
    },
    env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: SECRET_CLIENT_ID },
  });
  assert.equal(lowOauth.googleOneTapConfigured, true);
  assert.equal(lowOauth.oauthSharePct, 20);
  assert.match(lowOauth.recommendation, /Below 40%/);

  // 3d. Null / empty attribution -> null oauthSharePct, never NaN
  const empty = evaluateAuthProviderReadiness({ attribution: null, env: {} });
  assert.equal(empty.googleOneTapConfigured, false);
  assert.equal(empty.oauthSharePct, null);
  assert.doesNotMatch(JSON.stringify(empty), /NaN|Infinity/);
});

// 4. SSR render of pages/admin/signup-health.js
test('OTC TIER 7 LAW 4: pages/admin/signup-health.js renders ab-significance-badge, oauth-readiness-card, and Cached Snapshot pill cleanly', () => {
  const src = read('pages/admin/signup-health.js');
  assert.match(src, /abSignificance\.mjs/);
  assert.match(src, /data-testid="ab-significance-badge"/);
  assert.match(src, /data-testid="oauth-readiness-card"/);
  assert.match(src, /Cached Snapshot/);
  assert.doesNotMatch(src, BANNED_GOLD_RE, 'signup-health.js must contain zero banned gold hexes');
  assert.doesNotMatch(src, /fontSize:\s*(?:9|10|11)(?:\D|$)/, 'signup-health.js must keep fontSize >= 12');

  const scorecardSlice = src.slice(src.indexOf('function OAuthReadinessCard'));
  assert.doesNotMatch(scorecardSlice, /[—–]/, 'scorecards must contain zero em/en dashes');

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
  const SECRET_ID = '1122334455-do-not-render.apps.googleusercontent.com';
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    process: { ...process, env: { ...process.env, NEXT_PUBLIC_GOOGLE_CLIENT_ID: SECRET_ID } },
    require: (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === '@supabase/supabase-js') return { createClient: () => ({}) };
      if (name.endsWith('OperatorAdminSurface.module.css')) return { __esModule: true, default: mockStyles, ...mockStyles };
      if (name.endsWith('GrowthScorecard')) return { __esModule: true, default: () => React.createElement('div', { id: 'mock-growth' }) };
      if (name.endsWith('growthScorecard.mjs')) return { loadGrowthScorecard: async () => null };
      if (name.endsWith('attributionSummary.mjs')) return { loadRecentSignupAttribution: async () => null };
      if (name.endsWith('seoFunnelRollup.mjs')) return { loadSeoFunnelRollup: async () => null };
      if (name.endsWith('abSignificance.mjs')) {
        return { computeVariantSignificance, evaluateAuthProviderReadiness };
      }
      return {};
    },
  });

  const baseHealth = {
    new_users_15m: 2,
    new_users_1h: 5,
    new_users_24h: 35,
    probe_runs_15m: 2,
    errors_1h: 0,
    errors_24h: 0,
  };

  // 4a. Significant experiment + Configured Google One Tap + Stale PostHog snapshot
  const staleFunnel = {
    ...buildSeoFunnelSummary({
      seo_mini_gto_drill_answered: 400,
      seo_quick_signup_opened: 400,
      seo_quick_signup_oauth_click: 80,
      seo_post_signup_activation_shown: 50,
      seo_guest_spots_synced: 30,
    }),
    stale: true,
  };

  const htmlStaleSignificant = renderToStaticMarkup(
    React.createElement(mod.exports.default, {
      health: baseHealth,
      heartbeats: [],
      errors: [],
      generatedAt: '2026-11-28T09:00:00Z',
      googleOneTapConfigured: true,
      attribution: {
        available: true,
        totalSignups: 65,
        channels: { organic_google: 30, organic_bing: 5, organic_ai: 15, referral: 5, paid_or_utm: 5, direct: 5 },
        providers: { google: 33, facebook: 6, email: 26, other: 0, oauth_total: 39 },
        experimentVariants: { 'control-gto': 20, 'welcome-vip-500': 45 },
        landingPages: [],
        unlockKeys: [],
      },
      seoFunnel: staleFunnel,
    }),
  );

  assert.match(htmlStaleSignificant, /data-testid="ab-significance-badge"/);
  assert.match(htmlStaleSignificant, /95%\+ Confidence/);
  assert.match(htmlStaleSignificant, /Sample Ready/);
  assert.match(htmlStaleSignificant, /Lift: \+125%/);

  assert.match(htmlStaleSignificant, /data-testid="oauth-readiness-card"/);
  assert.match(htmlStaleSignificant, /OAuth &amp; One Tap Readiness/);
  assert.match(htmlStaleSignificant, /60%/);
  assert.match(htmlStaleSignificant, /Configured/);
  assert.match(htmlStaleSignificant, /Magic Link Readiness/);
  assert.match(htmlStaleSignificant, /Active/);

  assert.match(htmlStaleSignificant, /data-testid="seo-funnel-stale-pill"/);
  assert.match(htmlStaleSignificant, /Cached Snapshot/);

  assert.doesNotMatch(htmlStaleSignificant, new RegExp(SECRET_ID), 'must NEVER leak raw Google Client ID');
  assert.doesNotMatch(htmlStaleSignificant, /1122334455/);
  assert.doesNotMatch(htmlStaleSignificant, /NaN|Infinity/);

  // 4b. Small sample + Pending Env Var + Fresh PostHog snapshot (NO Cached Snapshot pill)
  const freshFunnel = buildSeoFunnelSummary({
    seo_mini_gto_drill_answered: 40,
    seo_quick_signup_opened: 20,
    seo_quick_signup_oauth_click: 10,
    seo_post_signup_activation_shown: 6,
    seo_guest_spots_synced: 4,
  });

  const htmlFreshPending = renderToStaticMarkup(
    React.createElement(mod.exports.default, {
      health: baseHealth,
      heartbeats: [],
      errors: [],
      generatedAt: '2026-11-28T09:00:00Z',
      googleOneTapConfigured: false,
      attribution: {
        available: true,
        totalSignups: 12,
        channels: { organic_google: 6, organic_bing: 1, organic_ai: 2, referral: 1, paid_or_utm: 1, direct: 1 },
        providers: { google: 4, facebook: 2, email: 6, other: 0, oauth_total: 6 },
        experimentVariants: { 'control-gto': 5, 'welcome-vip-500': 7 },
        landingPages: [],
        unlockKeys: [],
      },
      seoFunnel: freshFunnel,
    }),
  );

  assert.match(htmlFreshPending, /data-testid="ab-significance-badge"/);
  assert.match(htmlFreshPending, /Collecting Sample/);
  assert.match(htmlFreshPending, /data-testid="oauth-readiness-card"/);
  assert.match(htmlFreshPending, /Pending Env Var/);
  assert.doesNotMatch(htmlFreshPending, /Cached Snapshot/, 'fresh snapshot must NOT render Cached Snapshot pill');
  assert.doesNotMatch(htmlFreshPending, /data-testid="seo-funnel-stale-pill"/);
  assert.doesNotMatch(htmlFreshPending, /NaN|Infinity/);
});
