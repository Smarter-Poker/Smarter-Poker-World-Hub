/**
 * OTC Tier 8 Law Suite: 1-Click Embeddable Poker Widgets Generator & Tonight/Weekend Tournament Hub (2026-11-28)
 *
 * Permanently locks:
 *  1. Pure buildAttributedEmbedSnippet helper on pages/tools/embeds.js (iframe + UTM + attributed backlink)
 *  2. Featured 1-Click Widget Builder UI (#SMARTERDESIGN, 3 featured widgets, copy button, canonical F1 event)
 *  3. Tonight / This Weekend / All Upcoming quick-filter pill bar on pages/hub/tournaments/this-weekend.js
 *  4. Schema.org Event JSON-LD emission capped at 25, skipping placeholder dates & venues
 *  5. 1-Click Remind Me structured Phase-D spot contract (sp_saved_spots_v1 -> sanitizeGuestSpots -> SmarterQuickSignupSheet)
 *  6. Strict hygiene: zero em/en dashes, zero &apos;, zero banned gold hexes, zero Verified Rooms/Venues claims
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function loadJsxModule(relPath, extraRequires = {}) {
  const src = read(relPath);
  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: path.basename(relPath),
  }).outputText;

  const mod = { exports: {} };
  const dummyComp = { __esModule: true, default: () => null };
  const lucideProxy = new Proxy({}, { get: () => () => null });

  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    process,
    URL,
    URLSearchParams,
    Date,
    Set,
    Map,
    Math,
    JSON,
    Promise,
    Number,
    String,
    Array,
    Object,
    Boolean,
    RegExp,
    parseInt,
    isNaN,
    encodeURIComponent,
    setTimeout,
    React,
    require: (name) => {
      if (name in extraRequires) return extraRequires[name];
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === 'lucide-react') return lucideProxy;
      if (name === 'next/link') {
        return {
          __esModule: true,
          default: ({ href, children, ...props }) =>
            React.createElement('a', { href: typeof href === 'string' ? href : '#', ...props }, children),
        };
      }
      if (name === 'next/head') {
        return { __esModule: true, default: ({ children }) => React.createElement(React.Fragment, null, children) };
      }
      if (name === 'next/router') {
        return { useRouter: () => ({ pathname: '/', asPath: '/', query: {}, back: () => {}, push: () => {} }) };
      }
      if (name === 'swr') {
        return { __esModule: true, default: () => ({ data: null, isLoading: false }) };
      }
      if (name.endsWith('.module.css')) return { __esModule: true, default: {} };
      return dummyComp;
    },
  });
  return mod.exports;
}

const EMBEDS_STUBS = {
  '../../src/components/seo/SEOHead': {
    __esModule: true,
    default: () => null,
    schemas: { organization: { '@type': 'Organization', name: 'Smarter.Poker', url: 'https://smarter.poker' } },
  },
  '../../src/lib/seo/hubPageSchema': { hubProductSchema: () => [] },
  '../../src/lib/seo/backlinkCatalog.mjs': { DEAD_TOOL_REPLACEMENTS: [] },
  '../../src/lib/seo/edgeCacheHeaders.mjs': { setPublicSeoHtmlCache: () => {} },
  '../../src/lib/venueCount.mjs': { VENUE_COUNT_LABEL: '470+' },
  '../../src/lib/seo/seoFunnelTelemetry': { trackSeoFunnelEvent: () => {} },
};

const WEEKEND_STUBS = {
  '../../../src/components/seo/SEOHead': {
    __esModule: true,
    default: ({ children }) => React.createElement(React.Fragment, null, children),
    normalizeJsonLdGraph: (arr) => arr,
  },
  '../../../src/config/hamburgerMenus': { getMenuConfig: () => ({ menuItems: [], bottomLinks: [] }) },
  '../../../src/lib/home-games/urls': { homeGameUrl: (t) => `/hub/home-games/${t?.id || 'game'}` },
  '../../../src/lib/poker-near-me/structuredData': {
    buildDailyTournamentSchema: () => ({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Weekend' }),
    serializePokerJsonLd: (v) => JSON.stringify(v),
  },
  '../../../src/lib/poker-near-me/weekendSchedule.mjs': {
    getWeekendDates: () => ({
      friday: '2026-11-27',
      saturday: '2026-11-28',
      sunday: '2026-11-29',
      dates: ['2026-11-27', '2026-11-28', '2026-11-29'],
      referenceDay: 'Saturday',
      isCurrentlyWeekend: true,
      weekendRangeLabel: 'Nov 27 - 29, 2026',
    }),
  },
  '../../../src/lib/seo/hubPageSchema': {
    datasetSchema: () => ({ '@type': 'Dataset', name: 'Weekend' }),
    faqSchema: () => ({ '@type': 'FAQPage', mainEntity: [] }),
    breadcrumbSchema: () => ({ '@type': 'BreadcrumbList', itemListElement: [] }),
  },
  '../../../src/components/seo/SmarterQuickSignupSheet': { openQuickSignup: () => true },
  '../../../src/lib/seo/seoFunnelTelemetry': { trackSeoFunnelEvent: () => {} },
  '../../../src/lib/venueCount.mjs': { VENUE_COUNT_LABEL: '470+' },
};

test('T8-1: buildAttributedEmbedSnippet produces clean iframe + UTM params + attributed Smarter.Poker backlink', () => {
  const embedsMod = loadJsxModule('pages/tools/embeds.js', EMBEDS_STUBS);
  assert.equal(typeof embedsMod.buildAttributedEmbedSnippet, 'function');

  const snippet = embedsMod.buildAttributedEmbedSnippet({
    widgetSlug: 'pot-odds-calculator',
    title: 'Pot Odds Calculator',
  });

  assert.ok(
    snippet.includes(
      '<iframe src="https://smarter.poker/tools/pot-odds-calculator?embed=1&utm_source=embed&utm_medium=widget&utm_campaign=pot-odds-calculator"'
    ),
    'iframe src must include ?embed=1 and widget UTM parameters'
  );
  assert.ok(snippet.includes('height="560"'), 'default height must be 560');
  assert.ok(snippet.includes('title="Pot Odds Calculator"'), 'iframe must include escaped title');
  assert.ok(
    snippet.includes(
      'href="https://smarter.poker/tools/pot-odds-calculator?utm_source=embed&utm_medium=backlink&utm_campaign=pot-odds-calculator"'
    ),
    'attributed backlink must include backlink UTM parameters'
  );
  assert.ok(snippet.includes('rel="noopener"'), 'attributed backlink must include rel="noopener"');
  assert.ok(
    snippet.includes('Powered By Smarter.Poker - Open Full GTO Solver Free'),
    'attributed backlink must include canonical attribution text'
  );

  // Custom origin, height clamping, slug normalization, and HTML attribute escaping
  const custom = embedsMod.buildAttributedEmbedSnippet({
    widgetSlug: '/tools/preflop-ranges/',
    title: '13x13 "Preflop" <Matrix>',
    height: 700,
    siteUrl: 'https://staging.smarter.poker/',
  });
  assert.ok(
    custom.includes(
      'https://staging.smarter.poker/tools/preflop-ranges?embed=1&utm_source=embed&utm_medium=widget&utm_campaign=preflop-ranges'
    ),
    'normalizes trailing slash on siteUrl and leading /tools/ on widgetSlug'
  );
  assert.ok(custom.includes('height="700"'));
  assert.ok(custom.includes('title="13x13 &quot;Preflop&quot; &lt;Matrix&gt;"'), 'escapes unsafe HTML attribute chars');

  // Empty/invalid input fails safely without throwing
  const fallback = embedsMod.buildAttributedEmbedSnippet({});
  assert.ok(fallback.includes('https://smarter.poker/tools/pot-odds-calculator?embed=1'));
  assert.ok(fallback.includes('height="560"'));
});

test('T8-2: pages/tools/embeds.js mounts Featured 1-Click Widget Builder (#SMARTERDESIGN) with 3 widgets, copy button, and F1 telemetry', () => {
  const embedsSrc = read('pages/tools/embeds.js');
  assert.ok(embedsSrc.includes('data-testid="featured-embed-widget-builder"'));
  assert.ok(embedsSrc.includes('data-testid="copy-embed-snippet-btn"'));
  assert.ok(embedsSrc.includes("trackSeoFunnelEvent('seo_calculator_share_click'"));
  assert.ok(embedsSrc.includes('Pot Odds Calculator'));
  assert.ok(embedsSrc.includes('13x13 Preflop Range Matrix'));
  assert.ok(embedsSrc.includes('Live Poker Room Schedule / Tournament Hub'));

  const embedsMod = loadJsxModule('pages/tools/embeds.js', EMBEDS_STUBS);
  assert.equal(embedsMod.FEATURED_EMBED_WIDGETS.length, 3);
  const html = renderToStaticMarkup(React.createElement(embedsMod.default));
  assert.ok(html.includes('data-testid="featured-embed-widget-builder"'), 'SSR renders featured-embed-widget-builder');
  assert.ok(html.includes('data-testid="copy-embed-snippet-btn"'), 'SSR renders copy-embed-snippet-btn');
  assert.ok(html.includes('Pot Odds Calculator'));
  assert.ok(html.includes('13x13 Preflop Range Matrix'));
  assert.ok(html.includes('Live Poker Room Schedule / Tournament Hub'));
  assert.ok(
    html.includes('Powered By Smarter.Poker - Open Full GTO Solver Free'),
    'SSR textarea pre-populates copy-ready attributed snippet'
  );
});

test('T8-3: Tonight / This Weekend / All Upcoming filter + Schema.org Event nodes (capped at 25, skipping placeholders)', () => {
  const weekendMod = loadJsxModule('pages/hub/tournaments/this-weekend.js', WEEKEND_STUBS);

  // Quick-filter tests
  const sampleRows = [
    { id: '1', tournament_name: 'Wednesday Night Turbo', venue_name: 'Lodge Card Club', event_date: '2026-11-25', weekendDay: 'Wednesday', start_time: '7:00 PM', buy_in: 120 },
    { id: '2', tournament_name: 'Friday Deepstack', venue_name: 'Wynn Poker Room', event_date: '2026-11-27', weekendDay: 'Friday', start_time: '6:00 PM', buy_in: 400 },
    { id: '3', tournament_name: 'Saturday Monster Stack', venue_name: 'Aria Poker Room', event_date: '2026-11-28', weekendDay: 'Saturday', start_time: '1:00 PM', buy_in: 600 },
    { id: '4', tournament_name: 'Sunday Major', venue_name: 'Bellagio Poker Room', event_date: '2026-11-29', weekendDay: 'Sunday', start_time: '2:00 PM', buy_in: 1100 },
  ];

  const tonightRes = weekendMod.filterTonightWeekendTournaments(sampleRows, {
    mode: 'tonight',
    todayIso: '2026-11-25',
    todayDayName: 'Wednesday',
    weekendDates: ['2026-11-27', '2026-11-28', '2026-11-29'],
  });
  assert.equal(tonightRes.length, 1);
  assert.equal(tonightRes[0].id, '1');

  const weekendRes = weekendMod.filterTonightWeekendTournaments(sampleRows, {
    mode: 'weekend',
    todayIso: '2026-11-25',
    todayDayName: 'Wednesday',
    weekendDates: ['2026-11-27', '2026-11-28', '2026-11-29'],
  });
  assert.equal(weekendRes.length, 3);

  const allRes = weekendMod.filterTonightWeekendTournaments(sampleRows, {
    mode: 'all',
    todayIso: '2026-11-25',
    todayDayName: 'Wednesday',
    weekendDates: ['2026-11-27', '2026-11-28', '2026-11-29'],
  });
  assert.equal(allRes.length, 4);

  // Schema.org Event node tests: skips placeholders and strictly caps at 25
  const mixedEvents = [
    { id: 'bad-1', tournament_name: 'Epoch Event', venue_name: 'Real Venue', event_date: '1970-01-01', buy_in: 100 },
    { id: 'bad-2', tournament_name: 'TBD Date', venue_name: 'Real Venue', event_date: 'TBD', buy_in: 100 },
    { id: 'bad-3', tournament_name: 'No Date', venue_name: 'Real Venue', buy_in: 100 },
    { id: 'bad-4', tournament_name: 'Invalid Calendar Date', venue_name: 'Real Venue', event_date: '2026-02-30', buy_in: 100 },
    { id: 'bad-5', tournament_name: 'Placeholder Venue', venue_name: 'Live Poker Room', event_date: '2026-11-28', buy_in: 100 },
    ...Array.from({ length: 35 }, (_, idx) => ({
      id: `ok-${idx + 1}`,
      venue_id: 100 + idx,
      tournament_name: `Saturday Deepstack #${idx + 1}`,
      venue_name: `Texas Card Club ${idx + 1}`,
      city: 'Austin',
      state: 'TX',
      event_date: '2026-11-28',
      start_time: '7:00 PM',
      buy_in: 250,
    })),
  ];

  const eventNodes = weekendMod.buildWeekendEventSchemaNodes(mixedEvents);
  assert.equal(eventNodes.length, 25, 'Event schema nodes must be capped at 25');
  for (const node of eventNodes) {
    assert.equal(node['@type'], 'Event');
    assert.ok(node.name && !node.name.includes('Epoch') && !node.name.includes('TBD'));
    assert.match(node.startDate, /^2026-11-28T19:00:00$/);
    assert.equal(node.location['@type'], 'Place');
    assert.ok(node.location.name && node.location.name !== 'Live Poker Room');
    assert.equal(node.offers['@type'], 'Offer');
    assert.equal(node.offers.price, 250);
    assert.equal(node.offers.priceCurrency, 'USD');
    assert.match(node.url, /^https:\/\/smarter\.poker\//);
    assert.match(node.offers.url, /^https:\/\/smarter\.poker\//);
  }
});

test('T8-4: Weekend Remind Me builds Phase-D-compatible spot surviving sanitizeGuestSpots & opens SmarterQuickSignupSheet', () => {
  const weekendSrc = read('pages/hub/tournaments/this-weekend.js');
  assert.ok(weekendSrc.includes('data-testid="tonight-weekend-filter"'));
  assert.ok(weekendSrc.includes('data-testid="weekend-remind-me-btn"'));
  assert.ok(weekendSrc.includes("sp_saved_spots_v1"));
  assert.ok(weekendSrc.includes("unlockKey: 'series-alerts-event-reminder'"));
  assert.ok(weekendSrc.includes("openQuickSignup("));
  assert.doesNotMatch(weekendSrc, /new Date\(\)\.toISOString\(\)/, 'must preserve deterministic hydration law');

  const weekendMod = loadJsxModule('pages/hub/tournaments/this-weekend.js', WEEKEND_STUBS);
  const bannerMod = loadJsxModule('src/components/seo/SmarterUnlockedWelcomeBanner.jsx', {
    '../../lib/seo/seoFunnelTelemetry': { trackSeoFunnelEvent: () => {} },
  });

  const sampleTournament = {
    id: 'evt-777',
    venue_id: 501,
    tournament_name: '$300 Saturday Night Deepstack',
    venue_name: 'The Lodge Card Club',
    city: 'Round Rock',
    state: 'TX',
    event_date: '2026-11-28',
    weekendDay: 'Saturday',
    start_time: '7:00 PM',
    buy_in: 300,
    guaranteed: 25000,
  };

  const spot = weekendMod.buildWeekendReminderSpot(sampleTournament, {
    savedAt: '2026-11-28T09:00:00Z',
  });
  assert.equal(spot.kind, 'series-reminder');
  assert.equal(spot.label, '$300 Saturday Night Deepstack');
  assert.equal(spot.eventDate, '2026-11-28T19:00:00');
  assert.equal(spot.startDate, '2026-11-28T19:00:00');
  assert.equal(spot.seriesName, 'The Lodge Card Club Weekend Schedule');
  assert.equal(spot.venue, 'The Lodge Card Club');
  assert.equal(spot.path, '/hub/tournaments/this-weekend');

  // Verify zero field loss through sanitizeGuestSpots (Phase D pipeline contract)
  const sanitized = bannerMod.sanitizeGuestSpots([spot]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].kind, 'series-reminder');
  assert.equal(sanitized[0].label, spot.label);
  assert.equal(sanitized[0].eventDate, spot.eventDate);
  assert.equal(sanitized[0].startDate, spot.startDate);
  assert.equal(sanitized[0].seriesName, spot.seriesName);
  assert.equal(sanitized[0].venue, spot.venue);
  assert.equal(sanitized[0].path, '/hub/tournaments/this-weekend');

  // Verify SSR renders filter bar, Remind Me button, and Event schema JSON-LD
  const html = renderToStaticMarkup(
    React.createElement(weekendMod.default, {
      initialTournaments: [sampleTournament],
      initialTodayIso: '2026-11-28',
    })
  );
  assert.ok(html.includes('data-testid="tonight-weekend-filter"'));
  assert.ok(html.includes('data-testid="weekend-remind-me-btn"'));
  assert.ok(html.includes('Remind Me'));
  assert.ok(html.includes('"@type":"Event"'), 'SSR JSON-LD emits Schema.org Event node');
});

test('T8-5: Strict hygiene across embeds.js and this-weekend.js (zero em/en dashes, zero &apos;, zero banned gold, zero Verified Rooms/Venues)', () => {
  const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37)\b/i;
  const BLANKET_VERIFIED = /\bVerified\s+(?:Live\s+)?(?:Poker\s+)?(?:Rooms|Venues)\b/i;

  for (const rel of ['pages/tools/embeds.js', 'pages/hub/tournaments/this-weekend.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, /[—–]/, `${rel} must not contain em or en dashes`);
    assert.doesNotMatch(src, /&apos;/, `${rel} must never use &apos; in JSX text`);
    assert.doesNotMatch(src, BANNED_GOLD, `${rel} must not contain banned gold hex colors`);
    assert.doesNotMatch(src, BLANKET_VERIFIED, `${rel} must not make blanket Verified Rooms/Venues claims`);
  }
});
