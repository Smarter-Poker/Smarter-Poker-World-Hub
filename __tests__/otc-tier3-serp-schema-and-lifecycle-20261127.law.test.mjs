/**
 * OTC Tier 2/3 SERP Schema, Organic Activation Drip, Weekly Wire Account-Upgrade
 * Bridge & Experiment Variant Attribution — Permanent Fortress Law Test (2026-11-27)
 *
 * Enforces:
 *   1. `buildSeriesSubEventSchema` emits valid Schema.org `Event` + `Offer` (numeric
 *      price, USD, canonical URL), caps at 25 events, cleanly omits missing/zero buy-ins,
 *      and refuses placeholder/unlocated series.
 *   2. `pages/hub/series/[id].js` and `src/lib/poker-near-me/seriesSeo.mjs` wire
 *      `buildSeriesSubEventSchema` and enhanced dynamic meta descriptions (<= 158 chars)
 *      while preserving existing series schema/event laws.
 *   3. `resolveOrganicActivationTrack`, `buildOrganicWelcomeEmail`, and
 *      `buildDay1ActivationNudgeEmail` cover all 6 tracks with zero em/en dashes,
 *      zero banned gold hexes, valid URLs, compliant VIP+500 wording, non-empty HTML/text,
 *      and zero PII leakage.
 *   4. `weeklyWireEngine.mjs` `non_account` segment renders the compliant account-upgrade
 *      bridge with clean UTM attribution and zero em dashes.
 *   5. `attributionSummary.mjs` aggregates non-PII `experimentVariants` across top-level,
 *      `last_24h`, and `last_7d`, and `pages/admin/signup-health.js` renders A/B Offer
 *      Experiment Breakdown (`control-gto` vs `welcome-vip-500`) and AI Search Engines
 *      tiles inside the `#SMARTERDESIGN` Organic SEO & Conversion Funnel Attribution scorecard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  buildSeriesMetaDescription,
  buildSeriesSubEventSchema,
} from '../src/lib/seo/seriesEventSchema.mjs';
import {
  seriesDescription,
  seriesSchema,
  toSeoSeries,
} from '../src/lib/poker-near-me/seriesSeo.mjs';
import {
  ORGANIC_ACTIVATION_TRACKS,
  buildDay1ActivationNudgeEmail,
  buildOrganicWelcomeEmail,
  resolveOrganicActivationTrack,
} from '../src/lib/seo/organicWelcomeDrip.mjs';
import {
  buildPromoBlockForSegment,
  renderWeeklyWireEmail,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';
import {
  loadRecentSignupAttribution,
  sanitizeAttributionExperimentVariant,
  summarizeSignupAttribution,
} from '../src/lib/acquisition/attributionSummary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BANNED_GOLD_RE = /#(?:ffd700|d4af37|f5c542|f59e0b|fbbf24|eab308|d97706)\b/i;

// ── 1. Rich Event SERP Schema Helper & Series Page Wiring ────────────────────
test('buildSeriesSubEventSchema emits valid Schema.org Event + Offer, caps at 25, and handles missing buy-ins cleanly', () => {
  const series = {
    id: '468',
    name: 'DeepStack Showdown 2026',
    venueName: 'Venetian Las Vegas',
    city: 'Las Vegas',
    state: 'NV',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    mainEventBuyin: 1600,
    mainEventGuaranteed: 500000,
  };

  // 32 events: 30 valid dated events (some with buy_in, some without), 1 undated, 1 unnamed
  const rawEvents = [
    ...Array.from({ length: 30 }, (_, idx) => ({
      event_name: `Event #${idx + 1}: NLH DeepStack`,
      start_date: `2026-06-${String((idx % 28) + 1).padStart(2, '0')}`,
      start_time: idx % 2 === 0 ? '11:00:00' : null,
      buy_in: idx === 0 ? 400 : idx === 1 ? 0 : idx === 2 ? null : 600,
      guarantee: idx === 0 ? 100000 : null,
    })),
    { event_name: 'Undated Satellite', start_date: null, buy_in: 150 },
    { event_name: '   ', start_date: '2026-06-15', buy_in: 300 },
  ];

  const subEvents = buildSeriesSubEventSchema(series, rawEvents);
  assert.equal(subEvents.length, 25, 'subEvent list must cap at 25 by default');

  const first = subEvents[0];
  assert.equal(first['@type'], 'Event');
  assert.equal(first.name, 'Event #1: NLH DeepStack');
  assert.equal(first.startDate, '2026-06-01T11:00');
  assert.equal(first.eventStatus, 'https://schema.org/EventScheduled');
  assert.equal(first.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.equal(first.location['@type'], 'Place');
  assert.equal(first.location.name, 'Venetian Las Vegas');
  assert.equal(first.location.address['@type'], 'PostalAddress');
  assert.equal(first.location.address.addressLocality, 'Las Vegas');
  assert.equal(first.location.address.addressRegion, 'NV');
  assert.equal(first.offers['@type'], 'Offer');
  assert.equal(typeof first.offers.price, 'number', 'Offer price must be numeric');
  assert.equal(first.offers.price, 400);
  assert.equal(first.offers.priceCurrency, 'USD');
  assert.equal(first.offers.url, 'https://smarter.poker/hub/series/468');

  // Missing or zero buy-in cleanly omits `offers`
  assert.equal(subEvents[1].offers, undefined, 'buy_in=0 must omit offers');
  assert.equal(subEvents[2].offers, undefined, 'buy_in=null must omit offers');
  assert.equal(subEvents[3].offers.price, 600);

  // Respects custom maxEvents
  assert.equal(buildSeriesSubEventSchema(series, rawEvents, { maxEvents: 5 }).length, 5);

  // Placeholder / missing location produces empty array (never emits invalid schema)
  assert.deepEqual(
    buildSeriesSubEventSchema({ id: '999', name: 'No Venue', venueName: 'Unknown', city: 'TBD', state: null }, rawEvents),
    [],
  );

  // Enhanced dynamic meta description stays <= 158 chars and highlights event count & guarantee
  const desc = buildSeriesMetaDescription(series, rawEvents);
  assert.ok(desc.length >= 60 && desc.length <= 158, `meta description length ${desc.length} must be 60..158`);
  assert.match(desc, /32 events/i);
  assert.match(desc, /\$500,000 GTD/);
});

test('pages/hub/series/[id].js and seriesSeo.mjs wire buildSeriesSubEventSchema and <=158-char meta description', () => {
  const pageSrc = read('pages/hub/series/[id].js');
  const seoSrc = read('src/lib/poker-near-me/seriesSeo.mjs');

  assert.match(pageSrc, /buildSeriesSubEventSchema/);
  assert.match(pageSrc, /buildSeriesMetaDescription/);
  assert.match(pageSrc, /jsonLd=\{seriesSchema\(series\)\}/, 'must preserve existing series schema law');
  assert.match(seoSrc, /buildSeriesSubEventSchema/);
  assert.match(seoSrc, /buildSeriesMetaDescription/);

  const seoSeries = toSeoSeries({
    id: 5000777,
    name: '2026 Wynn Summer Classic',
    venue_name: 'Wynn Las Vegas',
    city: 'Las Vegas',
    state: 'NV',
    start_date: '2026-06-01',
    end_date: '2026-07-15',
    main_event_buyin: 3500,
    main_event_guaranteed: 5000000,
    total_events: 40,
    events: Array.from({ length: 30 }, (_, i) => ({
      event_name: `$600 NLH Flight ${i + 1}`,
      start_date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      start_time: '12:00:00',
      buy_in: 600,
      guarantee: 250000,
    })),
  });

  const graph = seriesSchema(seoSeries);
  const eventSeries = graph.find((n) => n['@type'] === 'EventSeries');
  assert.ok(eventSeries, 'EventSeries node must exist');
  assert.equal(eventSeries.subEvent.length, 25, 'seriesSchema subEvent must be capped at 25');
  assert.equal(eventSeries.subEvent[0].offers.price, 600);
  assert.equal(eventSeries.subEvent[0].offers.url, 'https://smarter.poker/hub/series/5000777');

  const metaDesc = seriesDescription(seoSeries);
  assert.ok(metaDesc.length <= 158, `seriesDescription length ${metaDesc.length} must not exceed 158`);
  assert.match(metaDesc, /40 events/);
});

// ── 2. Intent-Personalized Day-0 / Day-1 Organic Activation Email Composer ───
test('resolveOrganicActivationTrack maps organic signups accurately into all 6 canonical tracks', () => {
  assert.deepEqual([...ORGANIC_ACTIVATION_TRACKS], [
    'gto-ranges',
    'odds-calculator',
    'gto-leak-finder',
    'series-reminder',
    'live-venues',
    'general-hub',
  ]);

  assert.equal(resolveOrganicActivationTrack({ unlockKey: 'preflop-charts-unlock', landingPath: '/tools/preflop-charts' }), 'gto-ranges');
  assert.equal(resolveOrganicActivationTrack({ unlockKey: 'hand-aa', landingPath: '/learn/hands/aa' }), 'gto-ranges');
  assert.equal(resolveOrganicActivationTrack({ unlockKey: 'calc-save-odds', landingPath: '/tools/poker-odds-calculator' }), 'odds-calculator');
  assert.equal(resolveOrganicActivationTrack({ unlockKey: 'gto-leak-finder', landingPath: '/tools/gto-leak-finder' }), 'gto-leak-finder');
  assert.equal(resolveOrganicActivationTrack({ unlockKey: 'series-reminder-468', landingPath: '/hub/series/468' }), 'series-reminder');
  assert.equal(resolveOrganicActivationTrack({ unlockKey: 'venue-alert-12', landingPath: '/hub/poker-near-me/in/nv' }), 'live-venues');
  assert.equal(resolveOrganicActivationTrack({ unlockKey: '', landingPath: '/' }), 'general-hub');
});

test('buildOrganicWelcomeEmail and buildDay1ActivationNudgeEmail produce compliant zero-em-dash, zero-gold HTML & text across all 6 tracks', () => {
  for (const track of ORGANIC_ACTIVATION_TRACKS) {
    const day0 = buildOrganicWelcomeEmail({
      track,
      firstName: 'Alex',
      landingPath: '/tools/poker-odds-calculator?secret=should-strip',
      siteUrl: 'https://smarter.poker',
    });
    assert.equal(day0.track, track);
    assert.ok(day0.subject.length > 10);
    assert.ok(day0.previewText.length > 10);
    assert.ok(day0.html.length > 200);
    assert.ok(day0.text.length > 100);
    const day0Url = new URL(day0.ctaUrl);
    assert.equal(day0Url.origin, 'https://smarter.poker');
    assert.equal(day0Url.pathname, '/hub/verify-phone');
    assert.doesNotMatch(day0.ctaUrl, /secret=should-strip/, 'raw query strings must never leak into ctaUrl');
    assert.match(day0.html, /Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.match(day0.text, /Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.doesNotMatch(day0.subject, /[—–]/, `Day-0 subject for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day0.previewText, /[—–]/, `Day-0 previewText for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day0.html, /[—–]/, `Day-0 html for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day0.text, /[—–]/, `Day-0 text for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day0.html, BANNED_GOLD_RE, `Day-0 html for ${track} must contain zero banned gold hexes`);

    const day1 = buildDay1ActivationNudgeEmail({
      track,
      firstName: 'Alex',
      siteUrl: 'https://smarter.poker',
    });
    assert.equal(day1.track, track);
    assert.match(day1.subject, /1-Minute Challenge: Beat The Solver On This BTN 3-Bet Spot/);
    assert.ok(day1.previewText.length > 10);
    assert.ok(day1.html.length > 200);
    assert.ok(day1.text.length > 100);
    const day1Url = new URL(day1.ctaUrl);
    assert.equal(day1Url.origin, 'https://smarter.poker');
    assert.equal(day1Url.pathname, '/hub/training/hand-lab');
    assert.match(day1.html, /Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.doesNotMatch(day1.subject, /[—–]/, `Day-1 subject for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day1.previewText, /[—–]/, `Day-1 previewText for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day1.html, /[—–]/, `Day-1 html for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day1.text, /[—–]/, `Day-1 text for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(day1.html, BANNED_GOLD_RE, `Day-1 html for ${track} must contain zero banned gold hexes`);
  }

  // Zero-PII guard: email passed into firstName must never appear in rendered output
  const safeCheck = buildOrganicWelcomeEmail({
    track: 'general-hub',
    firstName: 'private@example.com',
  });
  assert.doesNotMatch(safeCheck.html, /private@example\.com/);
  assert.doesNotMatch(safeCheck.text, /private@example\.com/);
});

// ── 3. Weekly Wire Non-Account Account-Upgrade Bridge ────────────────────────
test('weeklyWireEngine non_account promo block delivers compliant account-upgrade bridge with UTM attribution and zero em dashes', () => {
  const prevSecret = process.env.PROMO_SIGNUP_SECRET;
  process.env.PROMO_SIGNUP_SECRET = 'otc-tier3-test-secret-20261127';
  try {
    const block = buildPromoBlockForSegment('non_account', { siteUrl: 'https://smarter.poker' });
    assert.match(block.headline, /Create Your Free Smarter\.Poker Account.*30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.doesNotMatch(block.headline, /[—–]/);
    assert.doesNotMatch(block.body, /[—–]/);
    assert.doesNotMatch(block.ctaLabel, /[—–]/);

    const parsed = new URL(block.ctaUrl);
    assert.equal(parsed.origin, 'https://smarter.poker');
    assert.equal(parsed.pathname, '/auth/signup');
    assert.ok(parsed.searchParams.get('pt'), 'non_account signup URL must keep signed pt token');
    assert.equal(parsed.searchParams.get('utm_source'), 'weekly_wire');
    assert.equal(parsed.searchParams.get('utm_medium'), 'email');
    assert.equal(parsed.searchParams.get('utm_campaign'), 'non_account_upgrade_bridge');

    const rendered = renderWeeklyWireEmail({
      edition: { editionNumber: 9, subject: 'Weekly Wire #9', articles: [], platformUpdates: [] },
      promoBlock: block,
      siteUrl: 'https://smarter.poker',
    });
    assert.match(rendered.html, /Create Your Free Smarter\.Poker Account: Claim 30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.match(rendered.text, /Create Your Free Smarter\.Poker Account: Claim 30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.doesNotMatch(rendered.html, /[—–]/);
    assert.doesNotMatch(rendered.text, /[—–]/);
  } finally {
    if (prevSecret === undefined) delete process.env.PROMO_SIGNUP_SECRET;
    else process.env.PROMO_SIGNUP_SECRET = prevSecret;
  }
});

// ── 4. Experiment Variant Rollup & Admin Scorecard Rendering ─────────────────
test('attributionSummary aggregates non-PII experimentVariants in top-level, last_24h, and last_7d', async () => {
  assert.equal(sanitizeAttributionExperimentVariant('control-gto'), 'control-gto');
  assert.equal(sanitizeAttributionExperimentVariant('Welcome-VIP-500'), 'welcome-vip-500');
  assert.equal(sanitizeAttributionExperimentVariant('leak@example.com'), null);
  assert.equal(sanitizeAttributionExperimentVariant('11111111-1111-4111-8111-111111111111'), null);

  const summary = summarizeSignupAttribution([
    {
      id: 'u1',
      raw_app_meta_data: { provider: 'google' },
      raw_user_meta_data: {
        acquisition_utm_source: 'google',
        acquisition_utm_medium: 'organic',
        experiment_variant: 'control-gto',
      },
    },
    {
      id: 'u2',
      app_metadata: { provider: 'email' },
      raw_user_meta_data: {
        acquisition_utm_source: 'chatgpt',
        acquisition_utm_medium: 'ai_referral',
        experiment_variant: 'welcome-vip-500',
      },
    },
    {
      id: 'u3',
      app_metadata: { provider: 'facebook' },
      raw_user_meta_data: {
        experiment_variant: 'welcome-vip-500',
      },
    },
    {
      id: 'u4',
      app_metadata: { provider: 'email' },
      raw_user_meta_data: {
        experiment_variant: 'spring-banner-v2',
      },
    },
    {
      id: 'u5',
      app_metadata: { provider: 'email' },
      raw_user_meta_data: {
        experiment_variant: 'pii@secret.invalid',
      },
    },
  ]);

  assert.deepEqual(summary.experimentVariants, {
    'control-gto': 1,
    'welcome-vip-500': 2,
    'spring-banner-v2': 1,
  });
  assert.doesNotMatch(JSON.stringify(summary), /pii@secret\.invalid/);

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
                  id: 'r1',
                  email: 'a@example.com',
                  created_at: '2026-11-28T01:00:00Z',
                  app_metadata: { provider: 'google' },
                  raw_user_meta_data: {
                    acquisition_utm_source: 'chatgpt',
                    acquisition_utm_medium: 'ai_referral',
                    experiment_variant: 'welcome-vip-500',
                  },
                },
                {
                  id: 'r2',
                  email: 'b@example.com',
                  created_at: '2026-11-25T01:00:00Z',
                  app_metadata: { provider: 'email' },
                  raw_user_meta_data: {
                    acquisition_utm_source: 'perplexity',
                    acquisition_utm_medium: 'ai_referral',
                    experiment_variant: 'control-gto',
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

  const recent = await loadRecentSignupAttribution(mockSb, { now });
  assert.equal(recent.experimentVariants['welcome-vip-500'], 1);
  assert.equal(recent.experimentVariants['control-gto'], 1);
  assert.equal(recent.last_24h.experimentVariants['welcome-vip-500'], 1);
  assert.equal(recent.last_24h.experimentVariants['control-gto'], 0);
  assert.equal(recent.last_7d.experimentVariants['welcome-vip-500'], 1);
  assert.equal(recent.last_7d.experimentVariants['control-gto'], 1);
});

test('pages/admin/signup-health.js renders A/B Offer Experiment Breakdown and AI Search Engines tiles inside AttributionScorecard', () => {
  const src = read('pages/admin/signup-health.js');
  assert.match(src, /A\/B Offer Experiment Breakdown/);
  assert.match(src, /control-gto/);
  assert.match(src, /welcome-vip-500/);
  assert.match(src, /AI Search Engines/);
  assert.doesNotMatch(src, BANNED_GOLD_RE);

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
      return {};
    },
  });

  const html = renderToStaticMarkup(
    React.createElement(mod.exports.default, {
      health: { new_users_15m: 3, new_users_1h: 7, new_users_24h: 32, probe_runs_15m: 2, errors_1h: 0, errors_24h: 0 },
      heartbeats: [],
      errors: [],
      generatedAt: '2026-11-28T03:00:00Z',
      attribution: {
        available: true,
        totalSignups: 25,
        channels: { organic_google: 10, organic_bing: 2, organic_ai: 6, referral: 3, paid_or_utm: 2, direct: 2 },
        providers: { google: 12, facebook: 3, email: 10, other: 0, oauth_total: 15 },
        aiEngines: { chatgpt: 3, perplexity: 2, claude: 1, gemini: 0 },
        experimentVariants: { 'control-gto': 11, 'welcome-vip-500': 14 },
        landingPages: [{ path: '/tools/poker-odds-calculator', count: 9 }],
        unlockKeys: [{ key: 'calc-save-odds', count: 6 }],
        last_24h: {
          totalSignups: 6,
          channels: { organic_google: 2, organic_bing: 0, organic_ai: 2, referral: 1, paid_or_utm: 1, direct: 0 },
          aiEngines: { chatgpt: 1, perplexity: 1, claude: 0, gemini: 0 },
          experimentVariants: { 'control-gto': 2, 'welcome-vip-500': 4 },
        },
      },
    }),
  );

  assert.match(html, /A\/B Offer Experiment Breakdown \(Control-GTO Vs Welcome-VIP-500\)/);
  assert.match(html, /Control GTO \(control-gto\)/);
  assert.match(html, /Welcome VIP \+ 500 \(welcome-vip-500\)/);
  assert.match(html, /AI Search Engines/);
  assert.match(html, /ChatGPT/);
  assert.match(html, /Perplexity/);
  assert.match(html, /Claude/);
  assert.match(html, /Gemini/);
});
