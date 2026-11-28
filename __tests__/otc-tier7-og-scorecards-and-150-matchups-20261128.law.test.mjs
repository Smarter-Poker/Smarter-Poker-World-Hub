/**
 * OTC TIER 7: DYNAMIC OG SCORECARDS & 150 VERIFIED HAND MATCHUPS FORTRESS (2026-11-28)
 * ====================================================================================
 * Permanent regression locks for:
 *   1. Dynamic /api/og/tool-card Satori 1200x630 modes (`tool=leak-finder` and
 *      `tool=gto-drill`): strict `display: 'flex'` on every element, zero banned
 *      gold hexes, zero em/en dashes, edge runtime, and safe input sanitization.
 *   2. 1-click "Share My Leak Scorecard" (`data-testid="leak-finder-share-card-btn"`)
 *      on pages/tools/gto-leak-finder/index.js wired to canonical F1 event
 *      `seo_calculator_share_click`, branded UTM + optional `&ref=<playerNumber>`
 *      share URL, and dynamic `/api/og/tool-card?tool=leak-finder` ogImage.
 *   3. Upgraded Share Result Card on src/components/seo/SmarterMiniGtoDrill.jsx
 *      carrying `hand`, `pos`, `tool=gto-drill`, and `utm_source=drill_share&utm_medium=social`.
 *   4. 150 verified programmatic /tools/odds/[matchup] entries across NLHE, PLO4,
 *      PLO5, and Short Deck (6+): unique slugs & titles, exact equity sum math
 *      (<= 0.02% tolerance), title <= 60 chars, description 70..158 chars,
 *      zero em/en dashes, and 100% /sitemap-tools.xml parity with zero duplicates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  TOOL_HAND_MATCHUPS,
  getToolHandMatchup,
  toolMatchupPath,
} from '../src/content/tools/handMatchups.js';
import { fitsInAResult } from '../src/lib/seo/titleFit.js';
import { generateSitemapXml } from '../src/lib/seo/sitemapBuilders.mjs';
import { TOOLS_SITEMAP_URLS } from '../pages/sitemap-tools.xml.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const renderer = require('react-test-renderer');

const BANNED_GOLD_RE = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37|d4a853|f2b84b)\b/i;

function loadTranspiledModule(relPath, customRequire) {
  const src = read(relPath);
  const { outputText } = ts.transpileModule(src, {
    fileName: path.basename(relPath),
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

test('OTC TIER 7 LAW 1 — pages/api/og/tool-card.js supports tool=leak-finder & tool=gto-drill with Satori display:flex, zero banned gold, and strict input sanitization', async () => {
  const src = read('pages/api/og/tool-card.js');
  assert.match(src, /export\s+const\s+config\s*=\s*\{\s*runtime:\s*['"]edge['"]\s*\}/);
  assert.match(src, /width:\s*1200/);
  assert.match(src, /height:\s*630/);
  assert.doesNotMatch(src, BANNED_GOLD_RE, 'pages/api/og/tool-card.js must contain zero banned gold hexes');
  assert.doesNotMatch(src, /rgba\(\s*255\s*,\s*215\s*,\s*0/i, 'pages/api/og/tool-card.js must contain zero gold rgba values');
  assert.doesNotMatch(src, /[—–]/, 'pages/api/og/tool-card.js must contain zero em or en dashes');

  // Verify every JSX <div in handler has display: 'flex' for Satori compatibility
  const divTags = [...src.matchAll(/<div\b[\s\S]*?>/g)].map((m) => m[0]);
  assert.ok(divTags.length >= 10, `Expected >= 10 JSX div elements in tool-card.js (got ${divTags.length})`);
  for (const tag of divTags) {
    assert.match(tag, /display:\s*['"]flex['"]/, `Every Satori JSX element must include display: 'flex': ${tag.slice(0, 120)}`);
  }

  const capturedResponses = [];
  class MockImageResponse {
    constructor(element, options) {
      this.element = element;
      this.options = options;
      capturedResponses.push({ element, options });
    }
  }

  const solvedSpotEngine = await import('../src/lib/seo/solvedSpotEngine.js');
  const mod = loadTranspiledModule('pages/api/og/tool-card.js', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === '@vercel/og') return { ImageResponse: MockImageResponse };
    if (name.includes('solvedSpotEngine')) return solvedSpotEngine;
    throw new Error(`Unexpected import in tool-card.js: ${name}`);
  });

  // 1. Valid tool=leak-finder
  const leakModel = mod.buildToolCardModel(
    new URLSearchParams('tool=leak-finder&score=84&leak=Turn+Barrels&bb100=3.4'),
  );
  assert.equal(leakModel.mode, 'leak-finder');
  assert.match(leakModel.title, /Smarter\.Poker 60-Second GTO Leak Scorecard/);
  assert.match(leakModel.subtitle, /Score: 84%/);
  assert.match(leakModel.subtitle, /Primary Leak: Turn Barrels/);
  assert.match(leakModel.subtitle, /-3\.4 BB\/100/);
  assert.match(leakModel.subtitle, /Beat My Score Free/);

  // 2. Dirty/XSS/out-of-range leak-finder inputs safely clamped and sanitized
  const dirtyLeak = mod.buildToolCardModel(
    new URLSearchParams(
      'tool=leak-finder&score=999&leak=' +
        encodeURIComponent('<script>alert(1)</script>Turn Barrels Over-Folding River Spots Forever And Ever') +
        '&bb100=-250',
    ),
  );
  assert.equal(dirtyLeak.mode, 'leak-finder');
  assert.match(dirtyLeak.subtitle, /Score: 100%/);
  assert.doesNotMatch(dirtyLeak.subtitle, /<script>/i);
  const leakMetric = dirtyLeak.metrics.find((m) => m.label === 'PRIMARY LEAK');
  assert.ok(leakMetric && leakMetric.value.length <= 40, `Sanitized leak must be <= 40 chars (got ${leakMetric?.value?.length})`);
  assert.match(dirtyLeak.subtitle, /-99\.9 BB\/100/);

  // 3. Missing params for leak-finder never crash
  const emptyLeak = mod.buildToolCardModel(new URLSearchParams('tool=leak-finder'));
  assert.equal(emptyLeak.mode, 'leak-finder');
  assert.match(emptyLeak.subtitle, /Beat My Score Free/);

  // 4. Valid tool=gto-drill
  const drillModel = mod.buildToolCardModel(
    new URLSearchParams('tool=gto-drill&hand=AQs&action=3-Bet&grade=Optimal&pos=BTN'),
  );
  assert.equal(drillModel.mode, 'gto-drill');
  assert.match(drillModel.title, /Smarter\.Poker Solver Drill/);
  assert.match(drillModel.title, /AQs From BTN/);
  assert.match(drillModel.subtitle, /Optimal Play: 3-Bet/);

  // 5. Dirty/missing gto-drill inputs safely sanitized without crashes
  const dirtyDrill = mod.buildToolCardModel(
    new URLSearchParams('tool=gto-drill&hand=<img+src=x>&pos=!!!&action=&grade='),
  );
  assert.equal(dirtyDrill.mode, 'gto-drill');
  assert.doesNotMatch(dirtyDrill.title, /[<>]/);
  assert.match(dirtyDrill.subtitle, /Optimal Play: 3-Bet/);

  // 6. Handler invokes ImageResponse(1200x630) cleanly for both modes
  await mod.default({ url: 'https://smarter.poker/api/og/tool-card?tool=leak-finder&score=84&leak=Turn+Barrels&bb100=3.4' });
  await mod.default({ url: 'https://smarter.poker/api/og/tool-card?tool=gto-drill&hand=AQs&pos=BTN&action=3-Bet&grade=Optimal' });
  assert.equal(capturedResponses.length, 2);
  assert.deepEqual(capturedResponses[0].options, { width: 1200, height: 630 });
  assert.deepEqual(capturedResponses[1].options, { width: 1200, height: 630 });
});

test('OTC TIER 7 LAW 2 — gto-leak-finder mounts leak-finder-share-card-btn wired to seo_calculator_share_click, branded ref URL & dynamic /api/og/tool-card?tool=leak-finder', async () => {
  const src = read('pages/tools/gto-leak-finder/index.js');
  assert.match(src, /data-testid="leak-finder-share-card-btn"/);
  assert.match(src, /Share My Leak Scorecard/);
  assert.match(src, /Copied Share Link!/);
  assert.match(src, /trackSeoFunnelEvent\('seo_calculator_share_click'/);
  assert.match(src, /toolSlug:\s*'gto-leak-finder'/);
  assert.match(src, /\/api\/og\/tool-card\?tool=leak-finder/);
  assert.doesNotMatch(src, BANNED_GOLD_RE);
  assert.doesNotMatch(src, /[—–]/);

  const spotsMod = await import('../src/content/tools/gtoLeakFinderSpots.js');
  const funnelEvents = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const noopComponent = { __esModule: true, default: () => null };
  const mod = loadTranspiledModule('pages/tools/gto-leak-finder/index.js', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return noopComponent;
    if (name === 'next/router') return { useRouter: () => ({ isReady: true, query: {}, asPath: '/tools/gto-leak-finder' }) };
    if (name.includes('SEOHead')) return { __esModule: true, default: () => null, schemas: { organization: {} } };
    if (name.includes('hubPageSchema')) return { hubProductSchema: () => [] };
    if (name.includes('SmarterQuickSignupSheet')) return { openQuickSignup: () => {} };
    if (name.includes('SmarterUnlockedWelcomeBanner')) return { SAVED_SPOTS_STORAGE_KEY: 'sp_saved_spots_v1' };
    if (name.includes('seoFunnelTelemetry')) {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name.includes('edgeCacheHeaders')) return { setPublicSeoHtmlCache: () => {} };
    if (name.includes('gtoLeakFinderSpots')) return spotsMod;
    if (name.endsWith('.module.css')) return { __esModule: true, default: styleProxy };
    return noopComponent;
  });

  // Pure URL builder tests (with and without playerNumber ref)
  const guestUrl = mod.buildLeakFinderShareUrl({ score: 80, leakSlug: 'turn-barrel-selection', bb100: 3.4 });
  const parsedGuest = new URL(guestUrl);
  assert.equal(parsedGuest.pathname, '/tools/gto-leak-finder');
  assert.equal(parsedGuest.searchParams.get('score'), '80');
  assert.equal(parsedGuest.searchParams.get('leak'), 'turn-barrel-selection');
  assert.equal(parsedGuest.searchParams.get('utm_source'), 'leak_share');
  assert.equal(parsedGuest.searchParams.get('utm_medium'), 'social');
  assert.equal(parsedGuest.searchParams.get('utm_campaign'), 'gto_leak_finder');
  assert.equal(parsedGuest.searchParams.get('ref'), null);

  const memberUrl = mod.buildLeakFinderShareUrl({ score: 80, leakSlug: 'turn-barrel-selection', playerNumber: 1254 });
  const parsedMember = new URL(memberUrl);
  assert.equal(parsedMember.searchParams.get('ref'), '1254');

  // Dynamic OG image helper
  assert.equal(
    mod.buildLeakFinderOgImageUrl({ score: '84', leak: 'turn-barrels', bb100: '3.4' }),
    '/api/og/tool-card?tool=leak-finder&score=84&leak=turn-barrels&bb100=3.4',
  );
  assert.match(mod.buildLeakFinderOgImageUrl({}), /\/api\/og\/tool-card\?tool=gto/);

  // Interactive completion + share button click
  const copied = [];
  const store = new Map([
    ['smarter-poker-auth', JSON.stringify({ user: { user_metadata: { player_number: 4242 } } })],
  ]);
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
    localStorage: {
      length: 1,
      key: () => 'smarter-poker-auth',
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => {
          copied.push(text);
        },
      },
    },
  });

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(mod.default, {}));
    });
    for (const spot of spotsMod.GTO_LEAK_FINDER_SPOTS) {
      const opt = spot.options[0];
      const optBtn = tree.root.findByProps({ 'data-testid': `leak-option-${opt.id}` });
      await renderer.act(async () => {
        optBtn.props.onClick();
      });
      const nextBtn = tree.root.findByProps({ 'data-testid': 'leak-finder-next-btn' });
      await renderer.act(async () => {
        nextBtn.props.onClick();
      });
    }

    const shareBtn = tree.root.findByProps({ 'data-testid': 'leak-finder-share-card-btn' });
    await renderer.act(async () => {
      await shareBtn.props.onClick();
    });

    assert.equal(copied.length, 1);
    const shared = new URL(copied[0]);
    assert.equal(shared.pathname, '/tools/gto-leak-finder');
    assert.equal(shared.searchParams.get('utm_source'), 'leak_share');
    assert.equal(shared.searchParams.get('utm_medium'), 'social');
    assert.equal(shared.searchParams.get('utm_campaign'), 'gto_leak_finder');
    assert.equal(shared.searchParams.get('ref'), '4242');
    assert.ok(
      funnelEvents.some((e) => e.event === 'seo_calculator_share_click' && e.props?.toolSlug === 'gto-leak-finder'),
      'Clicking leak-finder-share-card-btn must emit canonical seo_calculator_share_click with toolSlug gto-leak-finder',
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

test('OTC TIER 7 LAW 3 — SmarterMiniGtoDrill copies hand, pos, tool=gto-drill & utm_source=drill_share&utm_medium=social', async () => {
  const rel = 'src/components/seo/SmarterMiniGtoDrill.jsx';
  const src = read(rel);
  assert.match(src, /tool=gto-drill|params\.set\('tool',\s*'gto-drill'\)/);
  assert.match(src, /drill_share/);
  assert.doesNotMatch(src, BANNED_GOLD_RE);
  assert.doesNotMatch(src, /[—–]/);

  const funnelEvents = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const mod = loadTranspiledModule(rel, (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') return { openQuickSignup: () => {} };
    if (name === '../../lib/seo/seoFunnelTelemetry') {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name === './SmarterSeoKit.module.css') return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected import in SmarterMiniGtoDrill: ${name}`);
  });

  const ogUrl = new URL(mod.buildDrillOgCardUrl({ hand: 'AQs', pos: 'BTN', action: '3-Bet', grade: 'Optimal' }));
  assert.equal(ogUrl.pathname, '/api/og/tool-card');
  assert.equal(ogUrl.searchParams.get('tool'), 'gto-drill');
  assert.equal(ogUrl.searchParams.get('hand'), 'AQs');
  assert.equal(ogUrl.searchParams.get('pos'), 'BTN');
  assert.equal(ogUrl.searchParams.get('action'), '3-Bet');
  assert.equal(ogUrl.searchParams.get('grade'), 'Optimal');
  assert.equal(ogUrl.searchParams.get('utm_source'), 'drill_share');
  assert.equal(ogUrl.searchParams.get('utm_medium'), 'social');

  const socialUrl = new URL(
    mod.buildDrillSocialShareUrl({ redirectPath: '/learn/category/preflop', hand: 'A5s', pos: 'BTN' }),
  );
  assert.equal(socialUrl.searchParams.get('hand'), 'A5s');
  assert.equal(socialUrl.searchParams.get('pos'), 'BTN');
  assert.equal(socialUrl.searchParams.get('utm_source'), 'drill_share');
  assert.equal(socialUrl.searchParams.get('utm_medium'), 'social');
});

test('OTC TIER 7 LAW 4 — TOOL_HAND_MATCHUPS scales to >= 150 unique verified matchups across NLHE, PLO4, PLO5 & Short Deck with exact math and 100% /sitemap-tools.xml parity', () => {
  assert.ok(
    TOOL_HAND_MATCHUPS.length >= 150,
    `TOOL_HAND_MATCHUPS must contain >= 150 matchups (got ${TOOL_HAND_MATCHUPS.length})`,
  );

  const seenSlugs = new Set();
  const seenTitles = new Set();
  const gameCounts = { nlhe: 0, plo4: 0, plo5: 0, short_deck: 0 };

  for (const m of TOOL_HAND_MATCHUPS) {
    assert.ok(!seenSlugs.has(m.slug), `duplicate matchup slug "${m.slug}"`);
    seenSlugs.add(m.slug);
    assert.equal(getToolHandMatchup(m.slug), m, `lookup resolves ${m.slug}`);
    assert.equal(m.path, toolMatchupPath(m.slug), `path matches slug for ${m.slug}`);

    assert.ok(!seenTitles.has(m.title), `duplicate matchup title "${m.title}"`);
    seenTitles.add(m.title);
    assert.ok(fitsInAResult(m.title), `${m.slug} title "${m.title}" must fit <= 60 chars with brand`);
    assert.ok(
      m.description.length >= 70 && m.description.length <= 158,
      `${m.slug} description length ${m.description.length} must be 70..158`,
    );
    assert.doesNotMatch(JSON.stringify(m), /[—–]/, `${m.slug} must contain zero em or en dashes`);
    assert.doesNotMatch(JSON.stringify(m), BANNED_GOLD_RE, `${m.slug} must contain zero banned gold hexes`);

    assert.ok(m.tie >= 0, `${m.slug} tie must be >= 0 (got ${m.tie})`);
    const outcomeSum = m.winA + m.winB + m.tie;
    const equitySum = m.equityA + m.equityB;
    assert.ok(
      Math.abs(outcomeSum - 100) <= 0.02,
      `${m.slug} winA+winB+tie=${outcomeSum.toFixed(2)} must equal 100.00 (+/- 0.02)`,
    );
    assert.ok(
      Math.abs(equitySum - 100) <= 0.02,
      `${m.slug} equityA+equityB=${equitySum.toFixed(2)} must equal 100.00 (+/- 0.02)`,
    );
    assert.ok(
      Math.abs(m.winA + m.tie / 2 - m.equityA) <= 0.02,
      `${m.slug} equityA (${m.equityA}) must equal winA + tie/2 (+/- 0.02)`,
    );
    assert.ok(
      Math.abs(m.winB + m.tie / 2 - m.equityB) <= 0.02,
      `${m.slug} equityB (${m.equityB}) must equal winB + tie/2 (+/- 0.02)`,
    );

    assert.ok(m.faqs.length >= 3, `${m.slug} must have >= 3 FAQs`);
    assert.ok(m.flopHitNotes.length >= 3, `${m.slug} must have >= 3 flop hit notes`);
    assert.ok(m.strategicTakeaways.length >= 3, `${m.slug} must have >= 3 strategic takeaways`);

    for (const rel of m.relatedSlugs) {
      assert.ok(getToolHandMatchup(rel), `${m.slug} related slug "${rel}" must resolve`);
      assert.notEqual(rel, m.slug, `${m.slug} must not self-link`);
    }

    if (m.game in gameCounts) gameCounts[m.game] += 1;
  }

  assert.ok(gameCounts.nlhe >= 120, `Expected >= 120 NLHE matchups (got ${gameCounts.nlhe})`);
  assert.ok(gameCounts.plo4 >= 14, `Expected >= 14 PLO4 matchups (got ${gameCounts.plo4})`);
  assert.ok(gameCounts.plo5 >= 7, `Expected >= 7 PLO5 matchups (got ${gameCounts.plo5})`);
  assert.ok(gameCounts.short_deck >= 8, `Expected >= 8 Short Deck matchups (got ${gameCounts.short_deck})`);

  for (const requiredSlug of [
    'ak-vs-qq-short-deck',
    'aa-vs-jts-short-deck',
    'aa-vs-a5s',
    '76s-vs-aa',
    'aakk-vs-9876-plo4',
    'aakkq-vs-jt987-plo5',
  ]) {
    assert.ok(getToolHandMatchup(requiredSlug), `Required Tier 7 matchup "${requiredSlug}" must exist`);
  }

  const xml = generateSitemapXml(TOOLS_SITEMAP_URLS);
  for (const matchup of TOOL_HAND_MATCHUPS) {
    assert.ok(
      xml.includes(`<loc>https://smarter.poker/tools/odds/${matchup.slug}</loc>`),
      `sitemap-tools.xml must register /tools/odds/${matchup.slug}`,
    );
  }
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'sitemap-tools.xml must have zero duplicate <loc> entries');
});
