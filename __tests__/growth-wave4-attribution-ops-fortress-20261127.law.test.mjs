/**
 * Growth Wave 4 Attribution Ops — Permanent CI Fortress Law Test (2026-11-27)
 *
 * Enforces:
 *   1. `summarizeSignupAttribution` classifies all 6 acquisition channels
 *      (`organic_google`, `organic_bing`, `organic_ai`, `referral`,
 *      `paid_or_utm`, `direct`) across both `raw_user_meta_data` and
 *      `user_metadata`.
 *   2. Accurate OAuth (`google`, `facebook`) vs `email` counting.
 *   3. Top 10 capping & deterministic sorting for `landingPages` and `unlockKeys`.
 *   4. Strict ZERO-PII output guarantee (no emails, legal names, user IDs,
 *      invite secrets, or raw query strings ever leak).
 *   5. Non-blocking, bounded `loadRecentSignupAttribution` behavior on errors
 *      and timeouts.
 *   6. Non-breaking wiring in `pages/api/health/signup.js` and `#SMARTERDESIGN`
 *      rendering in `pages/admin/signup-health.js`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  ATTRIBUTION_CHANNELS,
  classifySignupChannel,
  summarizeSignupAttribution,
  loadRecentSignupAttribution,
} from '../src/lib/acquisition/attributionSummary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('summarizeSignupAttribution classifies all 6 channels across raw_user_meta_data and user_metadata', () => {
  const users = [
    // organic_google (raw_user_meta_data)
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'google-org@example.invalid',
      raw_app_meta_data: { provider: 'google' },
      raw_user_meta_data: {
        acquisition_utm_source: 'google',
        acquisition_utm_medium: 'organic',
        acquisition_landing_path: '/tools/poker-odds-calculator',
        unlock_key: 'calc-save-odds',
      },
    },
    // organic_google via Android Google Search referrer (user_metadata)
    {
      id: '11111111-1111-4111-8111-111111111112',
      email: 'google-android@example.invalid',
      app_metadata: { provider: 'email' },
      user_metadata: {
        referrer: 'android-app://com.google.android.googlequicksearchbox/',
        acquisition_landing_path: '/learn/hands/aa',
        unlock_key: 'hand-aa',
      },
    },
    // organic_bing
    {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'bing-org@example.invalid',
      app_metadata: { provider: 'email' },
      user_metadata: {
        acquisition_utm_source: 'bing',
        acquisition_utm_medium: 'organic',
        acquisition_landing_path: '/learn/icm-basics',
        unlock_key: 'masthead-learn',
      },
    },
    // organic_ai (ChatGPT, Perplexity, Claude, Gemini)
    {
      id: '33333333-3333-4333-8333-333333333331',
      email: 'ai-chatgpt@example.invalid',
      app_metadata: { provider: 'google' },
      raw_user_meta_data: {
        acquisition_utm_source: 'chatgpt',
        acquisition_utm_medium: 'ai_referral',
        acquisition_landing_path: '/compare/gto-wizard',
        unlock_key: 'compare-gto',
      },
    },
    {
      id: '33333333-3333-4333-8333-333333333332',
      email: 'ai-perplexity@example.invalid',
      app_metadata: { provider: 'facebook' },
      user_metadata: {
        acquisition_utm_source: 'perplexity',
        acquisition_utm_medium: 'ai_referral',
        acquisition_landing_path: '/tools/icm-calculator',
      },
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'ai-gemini@example.invalid',
      identities: [{ provider: 'google' }],
      user_metadata: {
        referrer: 'https://gemini.google.com/app',
        acquisition_landing_path: '/tools/poker-odds-calculator',
      },
    },
    // referral (player referral number + club invite)
    {
      id: '44444444-4444-4444-8444-444444444441',
      email: 'ref-player@example.invalid',
      app_metadata: { provider: 'email' },
      raw_user_meta_data: {
        referral_player_number: '1253',
      },
    },
    {
      id: '44444444-4444-4444-8444-444444444442',
      email: 'ref-club@example.invalid',
      app_metadata: { provider: 'facebook' },
      user_metadata: {
        club_invite_code: 'SHARK42',
      },
    },
    // paid_or_utm (social UTM campaign + google cpc must NOT be organic_google)
    {
      id: '55555555-5555-4555-8555-555555555551',
      email: 'utm-linkedin@example.invalid',
      app_metadata: { provider: 'email' },
      user_metadata: {
        acquisition_utm_source: 'linkedin',
        acquisition_utm_medium: 'social',
        acquisition_utm_campaign: 'freerolls',
        acquisition_landing_path: '/freerolls',
      },
    },
    {
      id: '55555555-5555-4555-8555-555555555552',
      email: 'paid-google@example.invalid',
      app_metadata: { provider: 'google' },
      raw_user_meta_data: {
        acquisition_utm_source: 'google',
        acquisition_utm_medium: 'cpc',
        acquisition_utm_campaign: 'brand-search',
        acquisition_landing_path: '/tools/poker-odds-calculator',
      },
    },
    // direct (no attribution metadata)
    {
      id: '66666666-6666-4666-8666-666666666661',
      email: 'direct-user@example.invalid',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Direct Player' },
    },
  ];

  const summary = summarizeSignupAttribution(users);

  assert.equal(summary.totalSignups, 11);
  assert.deepEqual(Object.keys(summary.channels).sort(), [...ATTRIBUTION_CHANNELS].sort());
  assert.deepEqual(summary.channels, {
    organic_google: 2,
    organic_bing: 1,
    organic_ai: 3,
    referral: 2,
    paid_or_utm: 2,
    direct: 1,
  });

  assert.deepEqual(summary.providers, {
    google: 4,
    facebook: 2,
    email: 5,
    other: 0,
    oauth_total: 6,
  });

  assert.equal(summary.aiEngines.chatgpt, 1);
  assert.equal(summary.aiEngines.perplexity, 1);
  assert.equal(summary.aiEngines.gemini, 1);
  assert.equal(summary.landingPages[0].path, '/tools/poker-odds-calculator');
  assert.equal(summary.landingPages[0].count, 3);
  assert.equal(classifySignupChannel({ acquisition_utm_source: 'claude', acquisition_utm_medium: 'ai_referral' }).channel, 'organic_ai');
});

test('summarizeSignupAttribution caps landingPages and unlockKeys to top 10 and emits ZERO PII', () => {
  const users = [];
  for (let i = 1; i <= 12; i += 1) {
    const repeats = 13 - i;
    for (let r = 0; r < repeats; r += 1) {
      users.push({
        id: `99999999-9999-4999-8999-${String(i * 100 + r).padStart(12, '0')}`,
        email: `private-player-${i}-${r}@secret-domain.invalid`,
        phone: '+15551234567',
        raw_app_meta_data: { provider: i % 2 === 0 ? 'google' : 'email' },
        raw_user_meta_data: {
          full_name: `Sensitive LegalName${i}`,
          first_name: 'Sensitive',
          last_name: `LegalName${i}`,
          acquisition_utm_source: 'google',
          acquisition_utm_medium: 'organic',
          acquisition_landing_path: `/tools/calc-${String(i).padStart(2, '0')}?email=leak@bad.com&token=SECRETTOKEN`,
          unlock_key: `gate-${String(i).padStart(2, '0')}`,
        },
      });
    }
  }

  // Add hostile PII-laden entries attempting to smuggle secrets into landing_path and unlock_key
  users.push({
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    email: 'hostile.pii@example.invalid',
    raw_user_meta_data: {
      full_name: 'Hostile Victim',
      club_invite_code: 'PRIVATE_INVITE_999',
      acquisition_landing_path: '/hub/club-arena/invite/PRIVATE_INVITE_999',
      unlock_key: 'hostile.pii@example.invalid',
    },
  });

  const summary = summarizeSignupAttribution(users);

  assert.equal(summary.landingPages.length, 10, 'landingPages must be capped at top 10');
  assert.equal(summary.unlockKeys.length, 10, 'unlockKeys must be capped at top 10');
  assert.equal(summary.landingPages[0].path, '/tools/calc-01');
  assert.equal(summary.landingPages[0].count, 12);
  assert.equal(summary.unlockKeys[0].key, 'gate-01');
  assert.equal(summary.unlockKeys[0].count, 12);

  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /@/, 'zero emails may appear anywhere in attribution output');
  assert.doesNotMatch(serialized, /Sensitive|LegalName|Hostile|Victim/, 'zero legal names may appear');
  assert.doesNotMatch(serialized, /99999999-9999|aaaaaaaa-bbbb/, 'zero user UUIDs may appear');
  assert.doesNotMatch(serialized, /PRIVATE_INVITE_999|SECRETTOKEN|\+15551234567/, 'zero invite codes, tokens, or phones may appear');
});

test('loadRecentSignupAttribution computes 24h and 7d windows safely and never throws on provider failure', async () => {
  const now = Date.parse('2026-11-28T03:00:00Z');
  const mockSb = {
    auth: {
      admin: {
        listUsers: async ({ page }) => {
          if (page > 1) return { data: { users: [] }, error: null };
          return {
            data: {
              users: [
                {
                  id: 'u-recent',
                  email: 'real1@example.com',
                  created_at: '2026-11-28T01:00:00Z',
                  app_metadata: { provider: 'google' },
                  user_metadata: {
                    acquisition_utm_source: 'google',
                    acquisition_utm_medium: 'organic',
                    acquisition_landing_path: '/tools/poker-odds-calculator',
                    unlock_key: 'calc-save-odds',
                  },
                },
                {
                  id: 'u-3d',
                  email: 'real2@example.com',
                  created_at: '2026-11-25T12:00:00Z',
                  app_metadata: { provider: 'email' },
                  user_metadata: {
                    acquisition_utm_source: 'perplexity',
                    acquisition_utm_medium: 'ai_referral',
                    acquisition_landing_path: '/compare/gto-wizard',
                  },
                },
                {
                  id: 'u-probe',
                  email: 'probe-123@example.invalid',
                  created_at: '2026-11-28T02:00:00Z',
                  app_metadata: { provider: 'email' },
                  user_metadata: {},
                },
                {
                  id: 'u-old',
                  email: 'old@example.com',
                  created_at: '2026-10-01T00:00:00Z',
                  app_metadata: { provider: 'email' },
                  user_metadata: { acquisition_utm_source: 'bing', acquisition_utm_medium: 'organic' },
                },
              ],
            },
            error: null,
          };
        },
      },
    },
  };

  const result = await loadRecentSignupAttribution(mockSb, { now });
  assert.equal(result.available, true);
  assert.equal(result.totalSignups, 2, 'only non-probe users in the last 7d are counted');
  assert.equal(result.channels.organic_google, 1);
  assert.equal(result.channels.organic_ai, 1);
  assert.equal(result.last_24h.totalSignups, 1);
  assert.equal(result.last_24h.channels.organic_google, 1);
  assert.equal(result.last_7d.totalSignups, 2);

  // Failure path: throws inside listUsers -> safe fallback, never throws
  const brokenSb = {
    auth: {
      admin: {
        listUsers: async () => {
          throw new Error('simulated upstream timeout');
        },
      },
    },
  };
  const fallback = await loadRecentSignupAttribution(brokenSb, { now });
  assert.equal(fallback.available, false);
  assert.equal(fallback.totalSignups, 0);
  assert.deepEqual(fallback.landingPages, []);
});

test('pages/api/health/signup.js wires attribution safely while preserving existing health contract', () => {
  const src = read('pages/api/health/signup.js');
  assert.match(src, /attributionSummary\.mjs/, 'must import attributionSummary.mjs');
  assert.match(src, /loadRecentSignupAttribution/, 'must load bounded recent attribution');
  assert.match(src, /summarizeSignupAttribution/, 'must reference summarizeSignupAttribution');
  assert.match(src, /attribution:\s*attributionRes/, 'must expose additive attribution field');
  assert.match(src, /signup_health_view/, 'must preserve signup_health_view query');
  assert.match(src, /status === 'degraded' \? 503 : 200/, 'must preserve HTTP 503/200 status-code honesty');
  assert.match(src, /new_users_15m/);
  assert.match(src, /new_users_1h/);
  assert.match(src, /new_users_24h/);
  assert.match(src, /trigger_errors_1h/);
  assert.match(src, /trigger_errors_24h/);
  assert.match(src, /last_signup_at/);
  assert.match(src, /last_error_at/);
  assert.match(src, /checked_at/);
  assert.match(src, /latency_ms/);
  assert.match(src, /VERCEL_GIT_COMMIT_SHA \|\| process\.env\.BUILD_COMMIT_SHA \|\| 'local'/);
});

test('pages/admin/signup-health.js renders #SMARTERDESIGN Organic SEO & Conversion Funnel Attribution scorecard with zero banned gold hexes or em dashes', () => {
  const src = read('pages/admin/signup-health.js');
  assert.match(src, /loadRecentSignupAttribution/);
  assert.match(src, /Organic SEO &amp; Conversion Funnel Attribution/);
  assert.match(src, /Google Organic/);
  assert.match(src, /Bing Organic/);
  assert.match(src, /AI Search \(ChatGPT\/Perplexity\/Claude\/Gemini\)/);
  assert.match(src, /UTM \/ Campaign/);
  assert.match(src, /OAuth Vs Email Split/);
  assert.match(src, /Top Converting Landing Pages/);
  assert.match(src, /Top Unlock Gates/);
  assert.match(src, /fetch\('\/api\/health\/signup'\)/);

  // Zero banned gold hexes anywhere in the file
  assert.doesNotMatch(src, /#(?:f5c542|ffd700|d4af37|f59e0b|fbbf24|eab308|d97706)/i, 'must not contain banned gold hexes');

  // Zero em/en dashes in JSX/UI code inside AttributionScorecard
  const scorecardBlock = src.slice(src.indexOf('function AttributionScorecard'));
  assert.doesNotMatch(scorecardBlock, /[—–]/, 'AttributionScorecard must contain zero em/en dashes');

  // Compile & static-render SignupHealthDashboard with live attribution fixture
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');

  const compiled = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: 'signup-health.jsx',
  }).outputText;

  const mockStyles = { surface: 'surface', panel: 'panel', metric: 'metric', state: 'state', tableWell: 'tableWell', responsiveGrid: 'responsiveGrid' };
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
      return {};
    },
  });

  const html = renderToStaticMarkup(
    React.createElement(mod.exports.default, {
      health: { new_users_15m: 2, new_users_1h: 5, new_users_24h: 24, probe_runs_15m: 1, errors_1h: 0, errors_24h: 0 },
      heartbeats: [],
      errors: [],
      generatedAt: '2026-11-28T03:00:00Z',
      attribution: {
        available: true,
        totalSignups: 20,
        channels: { organic_google: 8, organic_bing: 2, organic_ai: 4, referral: 3, paid_or_utm: 2, direct: 1 },
        providers: { google: 9, facebook: 3, email: 8, other: 0, oauth_total: 12 },
        landingPages: [{ path: '/tools/poker-odds-calculator', count: 7 }],
        unlockKeys: [{ key: 'calc-save-odds', count: 5 }],
        last_24h: { totalSignups: 4, channels: { organic_google: 2, organic_bing: 0, organic_ai: 1, referral: 1, paid_or_utm: 0, direct: 0 } },
      },
    }),
  );

  assert.match(html, /Organic SEO &amp; Conversion Funnel Attribution/);
  assert.match(html, /Google Organic/);
  assert.match(html, /AI Search \(ChatGPT\/Perplexity\/Claude\/Gemini\)/);
  assert.match(html, /\/tools\/poker-odds-calculator/);
  assert.match(html, /calc-save-odds/);
  assert.match(html, /Google OAuth/);
  assert.match(html, /Facebook OAuth/);
});

test('pages/api/health/signup.js handler preserves 200/503 status codes and attaches zero-PII attribution', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const src = read('pages/api/health/signup.js');
  const compiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: 'signup-health-api.js',
  }).outputText;

  let viewRow = {
    new_users_15m: 1,
    new_users_1h: 2,
    new_users_24h: 10,
    errors_1h: 0,
    errors_24h: 0,
    last_signup_at: new Date().toISOString(),
    last_error_at: null,
  };
  let shouldFailAttribution = false;

  const mockSupabase = {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: viewRow, error: null }),
      }),
    }),
    auth: {
      admin: {
        listUsers: async () => {
          if (shouldFailAttribution) throw new Error('boom');
          return {
            data: {
              users: [
                {
                  id: 'u-1',
                  email: 'secret@example.com',
                  created_at: new Date().toISOString(),
                  app_metadata: { provider: 'google' },
                  user_metadata: {
                    full_name: 'Private Person',
                    acquisition_utm_source: 'google',
                    acquisition_utm_medium: 'organic',
                    acquisition_landing_path: '/tools/poker-odds-calculator',
                    unlock_key: 'calc-save-odds',
                  },
                },
              ],
            },
            error: null,
          };
        },
      },
    },
  };

  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    process: { ...process, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: 'local-test-key', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' } },
    require: (name) => {
      if (name === '@supabase/supabase-js') return { createClient: () => mockSupabase };
      if (name.endsWith('apiErrorHandler')) return { reportApiError: () => {} };
      if (name.endsWith('attributionSummary.mjs')) return { loadRecentSignupAttribution, summarizeSignupAttribution };
      if (name.endsWith('authDoorProbe.mjs')) return { evaluateAuthDoors: () => ({ supabaseAuthConfigured: true, callbackPath: '/auth/callback' }) };
      return {};
    },
  });

  const invoke = async () => {
    const headers = {};
    let statusCode = null;
    let body = null;
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      status: (code) => ({
        json: (payload) => { statusCode = code; body = payload; return res; },
      }),
    };
    await mod.exports.default({ method: 'GET' }, res);
    return { statusCode, body, headers };
  };

  const ok = await invoke();
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.status, 'ok');
  assert.equal(ok.body.counts.new_users_24h, 10);
  assert.equal(ok.body.version, 'abcdef12');
  assert.equal(ok.body.attribution.available, true);
  assert.equal(ok.body.attribution.channels.organic_google, 1);
  assert.equal(ok.body.attribution.providers.google, 1);
  assert.doesNotMatch(JSON.stringify(ok.body), /secret@example\.com|Private Person/);

  // Attribution failure must NOT degrade or fail the health endpoint
  shouldFailAttribution = true;
  const resilient = await invoke();
  assert.equal(resilient.statusCode, 200);
  assert.equal(resilient.body.status, 'ok');
  assert.equal(resilient.body.attribution.available, false);

  // Degraded signup_health_view still returns HTTP 503
  viewRow = { ...viewRow, new_users_24h: 0, new_users_1h: 0, new_users_15m: 0 };
  const degraded = await invoke();
  assert.equal(degraded.statusCode, 503);
  assert.equal(degraded.body.status, 'degraded');
});
