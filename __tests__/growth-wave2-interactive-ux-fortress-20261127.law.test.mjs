/**
 * GROWTH WAVE 2 INTERACTIVE UX CI FORTRESS (2026-11-27)
 *
 * Permanent regression locks for Lane 2 interactive micro-tools & conversion UX:
 *   1. SmarterMiniGtoDrill playable 1-hand GTO widget (Preflop/Postflop/Tournaments/Math),
 *      zero analytics.js import, verified SmarterSeoKit.module.css classes,
 *      sp:seo-tool-engaged dispatch, seoFunnelTelemetry logging, openQuickSignup CTA,
 *      Next Spot toggle, and Share Result Card (/api/og/tool-card).
 *   2. 6-Max 100BB Position Action Bar (UTG/MP/HJ/CO/BTN/SB) on pages/learn/hands/[hand].js
 *      backed by RFI from src/config/solverRanges with 1-click Copy Shareable Hand Card.
 *   3. Custom /api/og/tool-card ogImage + SmarterMiniGtoDrill mounted on
 *      pages/learn/category/[category].js.
 *   4. SmarterMiniGtoDrill mounted on pages/features/poker-training-games.js.
 *   5. Row-level "Remind Me" alert button on pages/hub/series/[id].js with >= 44px
 *      touch target dispatching sp:open-quick-signup (series-alerts-event-reminder)
 *      with zero new imports.
 *   6. #SMARTERDESIGN enforcement: zero em/en dashes, zero banned gold hexes,
 *      sharp borderRadius: 0 across all Lane 2 additions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const React = require('react');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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

test('Wave 2.1: SmarterMiniGtoDrill implements #SMARTERDESIGN, zero analytics.js, verified CSS classes, and interactive spot flow', async () => {
  const src = read('src/components/seo/SmarterMiniGtoDrill.jsx');
  const css = read('src/components/seo/SmarterSeoKit.module.css');

  assert.doesNotMatch(src, /lib\/analytics/, 'SmarterMiniGtoDrill must never import analytics.js');
  assert.match(src, /trackSeoFunnelEvent/, 'SmarterMiniGtoDrill must log via seoFunnelTelemetry.js');
  assert.match(src, /openQuickSignup/, 'SmarterMiniGtoDrill must open SmarterQuickSignupSheet');
  assert.match(src, /sp:seo-tool-engaged/, 'SmarterMiniGtoDrill must dispatch sp:seo-tool-engaged');
  assert.match(src, /Play All 107 GTO Games Free/, 'SmarterMiniGtoDrill must expose the primary GTO CTA');
  assert.match(src, /Next Spot/, 'SmarterMiniGtoDrill must provide a Next Spot toggle');
  assert.match(src, /Share Result Card/, 'SmarterMiniGtoDrill must provide a Share Result Card button');
  assert.match(src, /\/api\/og\/tool-card/, 'SmarterMiniGtoDrill share link must target /api/og/tool-card');
  assert.doesNotMatch(src, /[—–]/, 'SmarterMiniGtoDrill must contain zero em or en dashes');
  assert.doesNotMatch(
    src,
    /#(?:f2b84b|d4a853|ffd700|f59e0b|fbbf24|eab308)\b/i,
    'SmarterMiniGtoDrill must contain zero banned gold hexes',
  );

  // Every styles.* reference must exist in SmarterSeoKit.module.css
  const definedClasses = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));
  for (const m of src.matchAll(/\bstyles\.([A-Za-z][A-Za-z0-9_-]*)\b/g)) {
    assert.ok(definedClasses.has(m[1]), `Undefined SmarterSeoKit CSS class: styles.${m[1]}`);
  }

  // Render and exercise interaction with react-test-renderer
  const renderer = require('react-test-renderer');
  const funnelEvents = [];
  const signupCalls = [];
  const dispatchedEvents = [];
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });

  const { default: SmarterMiniGtoDrill } = compileModule('src/components/seo/SmarterMiniGtoDrill.jsx', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') {
      return { openQuickSignup: (detail) => signupCalls.push(detail) };
    }
    if (name === '../../lib/seo/seoFunnelTelemetry') {
      return { trackSeoFunnelEvent: (event, props) => funnelEvents.push({ event, props }) };
    }
    if (name === './SmarterSeoKit.module.css') return styleProxy;
    throw new Error(`Unexpected SmarterMiniGtoDrill import: ${name}`);
  });

  // SSR render check across all 4 core categories
  for (const category of ['Preflop', 'Postflop', 'Tournaments', 'Math']) {
    const html = renderToStaticMarkup(
      React.createElement(SmarterMiniGtoDrill, { category, redirectPath: `/learn/category/${category.toLowerCase()}` }),
    );
    assert.match(html, new RegExp(`data-category="${category}"`));
    assert.match(html, /Raise \/ 3-Bet/);
    assert.match(html, /Call/);
    assert.match(html, /Fold/);
  }

  // Interactive click -> reveal -> CTA + Next Spot check
  const prevWindow = globalThis.window;
  const prevCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent: (ev) => dispatchedEvents.push(ev),
  };

  let tree;
  try {
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(SmarterMiniGtoDrill, { category: 'Preflop', redirectPath: '/learn/category/preflop' }),
      );
    });

    const raiseBtn = tree.root.findByProps({ 'data-testid': 'mini-gto-action-raise-3-bet' });
    await renderer.act(async () => {
      raiseBtn.props.onClick();
    });

    const resultPanel = tree.root.findByProps({ 'data-testid': 'mini-gto-result-panel' });
    assert.ok(resultPanel, 'Result panel must reveal immediately on click');
    assert.ok(
      dispatchedEvents.some((ev) => ev.type === 'sp:seo-tool-engaged'),
      'Clicking an action must dispatch sp:seo-tool-engaged',
    );
    assert.ok(
      funnelEvents.some((ev) => ev.event === 'seo_mini_gto_drill_answered'),
      'Clicking an action must log seo_mini_gto_drill_answered',
    );

    const signupCta = tree.root.findByProps({ 'data-testid': 'mini-gto-signup-cta' });
    await renderer.act(async () => {
      signupCta.props.onClick();
    });
    assert.equal(signupCalls.length, 1, 'CTA must invoke openQuickSignup');
    assert.equal(signupCalls[0].redirectPath, '/learn/category/preflop');

    const nextBtn = tree.root.findByProps({ 'data-testid': 'mini-gto-next-spot-btn' });
    await renderer.act(async () => {
      nextBtn.props.onClick();
    });
    assert.equal(
      tree.root.findAllByProps({ 'data-testid': 'mini-gto-result-panel' }).length,
      0,
      'Next Spot must advance and reset the answer reveal state',
    );
  } finally {
    if (tree) {
      await renderer.act(async () => tree.unmount());
    }
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
  }
});

test('Wave 2.2: pages/learn/hands/[hand].js renders 6-Max 100BB Position Action Bar from RFI with shareable hand card', async () => {
  const src = read('pages/learn/hands/[hand].js');
  assert.match(src, /import\s*\{\s*RFI\s*\}\s*from\s*'\.\.\/\.\.\/\.\.\/src\/config\/solverRanges'/);
  assert.match(src, /data-testid="hand-position-action-bar"/);
  assert.match(src, /Copy Shareable Hand Card/);
  assert.match(src, /\/api\/og\/tool-card\?tool=preflop&title=/);
  assert.match(src, /fitMetaDescription\(hand\.summary,\s*158\)/);
  assert.doesNotMatch(src, /[—–]/, 'pages/learn/hands/[hand].js must contain zero em or en dashes');

  const solverRanges = await import('../src/config/solverRanges.js');
  const hands = await import('../src/content/learn/hands.js');
  const learnSite = await import('../src/lib/learn/learnSite.js');
  const matchups = await import('../src/content/learn/matchups.js');
  const titleFit = await import('../src/lib/seo/titleFit.js');

  const stubComponent = { __esModule: true, default: () => null };
  const linkStub = {
    __esModule: true,
    default: ({ href, children, prefetch: _prefetch, ...props }) => React.createElement('a', { href, ...props }, children),
  };

  const mod = compileModule('pages/learn/hands/[hand].js', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return linkStub;
    if (name.endsWith('solverRanges')) return solverRanges;
    if (name.endsWith('hands.js')) return hands;
    if (name.endsWith('learnSite.js')) return learnSite;
    if (name.endsWith('matchups.js')) return matchups;
    if (name.endsWith('titleFit.js')) return titleFit;
    if (name.endsWith('SEOHead')) return { __esModule: true, default: () => null, schemas: { organization: {} } };
    if (name.endsWith('SmarterQuickSignupSheet')) return { openQuickSignup: () => true };
    if (name.endsWith('analytics')) return { capture: () => {} };
    return stubComponent;
  });

  // Render A5s (mixed UTG 52%, pure BTN 100%) and 72o (fold 0% everywhere)
  const a5s = hands.STARTING_HANDS.find((h) => h.code === 'A5s');
  const sevenDeuce = hands.STARTING_HANDS.find((h) => h.code === '72o');
  assert.ok(a5s && sevenDeuce);

  const a5sHtml = renderToStaticMarkup(React.createElement(mod.default, { hand: a5s }));
  for (const seat of ['utg', 'mp', 'hj', 'co', 'btn', 'sb']) {
    assert.match(a5sHtml, new RegExp(`data-testid="hand-seat-btn-${seat}"`));
  }
  assert.match(a5sHtml, /Mixed 52%/, 'A5s UTG open frequency must read 52% from RFI');
  assert.match(a5sHtml, /Pure Open 100%/, 'A5s BTN open frequency must read Pure Open 100% from RFI');

  const sevenDeuceHtml = renderToStaticMarkup(React.createElement(mod.default, { hand: sevenDeuce }));
  assert.match(sevenDeuceHtml, /Fold 0%/, '72o must display Fold 0% across seats');
});

test('Wave 2.3: pages/learn/category/[category].js sets custom OG tool-card image and mounts SmarterMiniGtoDrill', () => {
  const src = read('pages/learn/category/[category].js');
  assert.match(
    src,
    /ogImage=\{`\/api\/og\/tool-card\?tool=learn&title=\$\{encodeURIComponent\(`\$\{category\} Poker Strategy`\)\}&subtitle=\$\{encodeURIComponent\(`\$\{lessons\.length\} Free GTO Guides`\)\}`\}/,
    'category/[category].js must pass custom /api/og/tool-card ogImage to SEOHead',
  );
  assert.match(src, /import SmarterMiniGtoDrill from '\.\.\/\.\.\/\.\.\/src\/components\/seo\/SmarterMiniGtoDrill'/);
  assert.match(src, /<SmarterMiniGtoDrill\s+category=\{category\}\s+redirectPath=\{path\}\s*\/>/);
  assert.doesNotMatch(src, /[—–]/, 'category/[category].js must contain zero em or en dashes');
});

test('Wave 2.4: pages/features/poker-training-games.js mounts SmarterMiniGtoDrill for Preflop', () => {
  const src = read('pages/features/poker-training-games.js');
  assert.match(src, /import SmarterMiniGtoDrill from '\.\.\/\.\.\/src\/components\/seo\/SmarterMiniGtoDrill'/);
  assert.match(
    src,
    /<SmarterMiniGtoDrill[\s\S]*?category="Preflop"[\s\S]*?redirectPath="\/features\/poker-training-games"/,
    'poker-training-games.js must mount SmarterMiniGtoDrill with Preflop category and redirectPath',
  );
  assert.doesNotMatch(src, /[—–]/, 'poker-training-games.js must contain zero em or en dashes');
});

test('Wave 2.5: pages/hub/series/[id].js adds accessible row-level Remind Me alert button with zero new imports', () => {
  const src = read('pages/hub/series/[id].js');
  assert.doesNotMatch(
    src,
    /import[\s\S]{0,80}SmarterQuickSignupSheet/,
    'series/[id].js must dispatch sp:open-quick-signup directly without importing SmarterQuickSignupSheet',
  );
  assert.match(src, /new CustomEvent\('sp:open-quick-signup'/);
  assert.match(src, /unlockKey:\s*'series-alerts-event-reminder'/);
  assert.match(src, /className="event-remind-btn"/);
  assert.match(src, /Remind Me/);
  assert.match(src, /\.event-remind-btn\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(src, /\.event-remind-btn\s*\{[\s\S]*?border-radius:\s*0/);
  assert.match(src, /eventObj\.stopPropagation\(\)/, 'Remind Me click must stop row expansion propagation');
  assert.match(src, /<td colSpan="9">/, 'Expanded detail row must span all 9 table columns');
});
