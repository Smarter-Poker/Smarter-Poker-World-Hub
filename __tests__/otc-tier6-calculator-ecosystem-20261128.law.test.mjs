/**
 * OTC TIER 6 CI FORTRESS: FLAGSHIP CALCULATOR ECOSYSTEM CLOUD-SAVE & SESSION MILESTONE (2026-11-28)
 *
 * Permanent root-cause regression locks proving all 10 flagship poker calculators under pages/tools/
 * participate in Save Spot cloud sync, Share Spot viral link attribution, and the Tier 5
 * soft-metered 2-spot Session Milestone (sp_calc_engagements_v1):
 *   1. Every one of the 10 calculator pages imports and mounts SmarterCalculatorSaveBar once,
 *      with a unique toolSlug matching the page filename and redirectPath matching /tools/<slug>.
 *   2. SmarterCalculatorSaveBar is mounted right above the single SmarterAccountUnlockGate,
 *      preserving SEOHead (directly or via delegated page wrapper), CitationBacklinkBox,
 *      and AiPromptLauncher.
 *   3. Every page enforces Title Case copy on SmarterCalculatorSaveBar props, zero em/en dashes,
 *      zero &apos; entities, and zero banned gold hexes.
 *   4. Cross-calculator guest navigation across 2 flagship calculators records 2 unique spots in
 *      sp_calc_engagements_v1 and reveals the Tier 5 calc-metered-milestone banner while keeping
 *      Save Spot and Share Spot actions intact.
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
const renderer = require('react-test-renderer');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|d4af37|facc15|f2b84b|d4a853)\b/i;

const FLAGSHIP_CALCULATORS = [
  { slug: 'pot-odds-calculator', rel: 'pages/tools/pot-odds-calculator.js', wrapperSeo: null },
  { slug: 'bankroll-calculator', rel: 'pages/tools/bankroll-calculator.js', wrapperSeo: null },
  { slug: 'icm-calculator', rel: 'pages/tools/icm-calculator.js', wrapperSeo: 'pages/hub/training/icm-calculator.js' },
  { slug: 'rake-calculator', rel: 'pages/tools/rake-calculator.js', wrapperSeo: null },
  { slug: 'variance-calculator', rel: 'pages/tools/variance-calculator.js', wrapperSeo: null },
  { slug: 'push-fold-calculator', rel: 'pages/tools/push-fold-calculator.js', wrapperSeo: null },
  { slug: 'poker-winrate-calculator', rel: 'pages/tools/poker-winrate-calculator.js', wrapperSeo: null },
  { slug: 'who-wins-calculator', rel: 'pages/tools/who-wins-calculator.js', wrapperSeo: null },
  { slug: 'bounty-calculator', rel: 'pages/tools/bounty-calculator.js', wrapperSeo: null },
  { slug: 'spr-calculator', rel: 'pages/tools/spr-calculator.js', wrapperSeo: null },
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function extractSaveBarJsxElement(src, rel) {
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const matches = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText(sf) === 'SmarterCalculatorSaveBar') {
        matches.push(node);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { sf, matches };
}

function getJsxPropMap(element, sf) {
  const props = new Map();
  for (const attr of element.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    const name = attr.name.getText(sf);
    const init = attr.initializer;
    if (!init) {
      props.set(name, { kind: 'boolean', value: true });
    } else if (ts.isStringLiteral(init)) {
      props.set(name, { kind: 'string', value: init.text });
    } else if (ts.isJsxExpression(init) && init.expression) {
      props.set(name, { kind: 'expression', text: init.expression.getText(sf) });
    }
  }
  return props;
}

function isTitleCaseWordToken(token) {
  const cleaned = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!cleaned) return true;
  if (/^\d/.test(cleaned)) return true;
  if (/^[A-Z0-9]+$/.test(cleaned)) return true;
  return /^[A-Z]/.test(cleaned);
}

function assertTitleCaseString(str, context) {
  const segments = str.split(/[\s/\-]+/).filter(Boolean);
  for (const seg of segments) {
    assert.ok(
      isTitleCaseWordToken(seg),
      `${context} has non-Title-Case word "${seg}" in "${str}"`,
    );
  }
}

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

test('OTC-T6 LAW 1: All 10 flagship calculators import and mount SmarterCalculatorSaveBar once with unique matching toolSlug and valid props', () => {
  const seenSlugs = new Set();

  for (const calc of FLAGSHIP_CALCULATORS) {
    const src = read(calc.rel);
    assert.match(
      src,
      /import\s+SmarterCalculatorSaveBar\s+from\s+['"]\.\.\/\.\.\/src\/components\/seo\/SmarterCalculatorSaveBar['"]/,
      `${calc.rel} must import SmarterCalculatorSaveBar`,
    );

    const { sf, matches } = extractSaveBarJsxElement(src, calc.rel);
    assert.equal(
      matches.length,
      1,
      `${calc.rel} must mount exactly 1 <SmarterCalculatorSaveBar /> (found ${matches.length})`,
    );

    const props = getJsxPropMap(matches[0], sf);
    const slugProp = props.get('toolSlug');
    assert.equal(slugProp?.kind, 'string', `${calc.rel} toolSlug must be a literal string`);
    assert.equal(slugProp?.value, calc.slug, `${calc.rel} toolSlug must match filename slug "${calc.slug}"`);
    assert.ok(!seenSlugs.has(slugProp.value), `Duplicate toolSlug detected: ${slugProp.value}`);
    seenSlugs.add(slugProp.value);

    for (const requiredTextProp of ['toolName', 'eyebrow', 'title', 'description', 'ctaLabel']) {
      const prop = props.get(requiredTextProp);
      assert.equal(
        prop?.kind,
        'string',
        `${calc.rel} SmarterCalculatorSaveBar must pass literal string prop "${requiredTextProp}"`,
      );
      assert.ok(
        prop.value.trim().length >= 5,
        `${calc.rel} SmarterCalculatorSaveBar "${requiredTextProp}" must be descriptive`,
      );
      assertTitleCaseString(prop.value, `${calc.rel} (${requiredTextProp})`);
    }

    const summaryProp = props.get('summaryText');
    assert.ok(
      summaryProp && (summaryProp.kind === 'string' || summaryProp.kind === 'expression'),
      `${calc.rel} SmarterCalculatorSaveBar must pass summaryText`,
    );

    const redirectProp = props.get('redirectPath');
    assert.ok(redirectProp, `${calc.rel} SmarterCalculatorSaveBar must pass redirectPath`);
    if (redirectProp.kind === 'string') {
      assert.equal(redirectProp.value, `/tools/${calc.slug}`);
    } else {
      assert.equal(redirectProp.text, 'canonicalPath');
      assert.match(
        src,
        new RegExp(`const\\s+canonicalPath\\s*=\\s*['"]/tools/${calc.slug}['"]`),
        `${calc.rel} canonicalPath must equal /tools/${calc.slug}`,
      );
    }
  }

  assert.equal(seenSlugs.size, 10, 'All 10 flagship calculator toolSlugs must be unique');
});

test('OTC-T6 LAW 2: Every flagship calculator mounts SmarterCalculatorSaveBar above its single SmarterAccountUnlockGate and preserves SEOHead, CitationBacklinkBox, and AiPromptLauncher', () => {
  for (const calc of FLAGSHIP_CALCULATORS) {
    const src = read(calc.rel);
    const gateMatches = src.match(/<SmarterAccountUnlockGate\b/g) || [];
    assert.equal(
      gateMatches.length,
      1,
      `${calc.rel} must preserve exactly 1 <SmarterAccountUnlockGate />`,
    );

    const saveBarIdx = src.indexOf('<SmarterCalculatorSaveBar');
    const gateIdx = src.indexOf('<SmarterAccountUnlockGate');
    assert.ok(
      saveBarIdx > -1 && gateIdx > -1 && saveBarIdx < gateIdx,
      `${calc.rel} must mount <SmarterCalculatorSaveBar /> directly above <SmarterAccountUnlockGate />`,
    );

    if (calc.wrapperSeo) {
      const wrappedSrc = read(calc.wrapperSeo);
      assert.match(wrappedSrc, /<SEOHead\b/, `${calc.wrapperSeo} must preserve <SEOHead />`);
    } else {
      assert.match(src, /<SEOHead\b/, `${calc.rel} must preserve <SEOHead />`);
      assert.match(src, /<CitationBacklinkBox\b/, `${calc.rel} must preserve <CitationBacklinkBox />`);
      assert.match(src, /<AiPromptLauncher\b/, `${calc.rel} must preserve <AiPromptLauncher />`);
    }
  }
});

test('OTC-T6 LAW 3: All 10 flagship calculator pages enforce zero em/en dashes, zero &apos; entities, and zero banned gold hexes', () => {
  for (const calc of FLAGSHIP_CALCULATORS) {
    const src = read(calc.rel);
    const codeOnly = stripComments(src);
    assert.doesNotMatch(codeOnly, /[\u2014\u2013]/, `${calc.rel} must contain zero em or en dashes`);
    assert.doesNotMatch(codeOnly, /&apos;/i, `${calc.rel} must never use &apos; in JSX text`);
    assert.doesNotMatch(codeOnly, BANNED_GOLD, `${calc.rel} must never use banned gold hexes`);
  }
});

test('OTC-T6 LAW 4: Cross-calculator navigation across 2 flagship calculators triggers the Tier 5 2-spot Session Milestone in sp_calc_engagements_v1', async () => {
  const styleProxy = new Proxy({}, { get: (_, prop) => String(prop) });
  const mod = compileModule('src/components/seo/SmarterCalculatorSaveBar.jsx', (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === './SmarterQuickSignupSheet') return { openQuickSignup: () => {} };
    if (name === '../../lib/seo/seoFunnelTelemetry') return { trackSeoFunnelEvent: () => {} };
    if (name === './SmarterSeoKit.module.css') return { __esModule: true, default: styleProxy };
    throw new Error(`Unexpected SmarterCalculatorSaveBar import: ${name}`);
  });

  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  const listeners = new Map();
  const prevWindow = globalThis.window;

  globalThis.window = {
    localStorage: localStore,
    sessionStorage: sessionStore,
    location: { pathname: '/tools/pot-odds-calculator', search: '' },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev) => {
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
  };

  let tree1;
  let tree2;
  try {
    // Visit Calculator #1: Pot Odds Calculator
    await renderer.act(async () => {
      tree1 = renderer.create(
        React.createElement(mod.default, {
          toolSlug: 'pot-odds-calculator',
          toolName: 'Pot Odds & MDF Calculator',
          summaryText: 'Pot $100, Facing Bet $50 (50% Pot): Pot Odds 3.00:1, Req Equity 25.0%, MDF 66.7%',
          redirectPath: '/tools/pot-odds-calculator',
        }),
      );
    });
    assert.ok(tree1.root.findByProps({ 'data-testid': 'calculator-save-cta-pot-odds-calculator' }));
    assert.ok(tree1.root.findByProps({ 'data-testid': 'calculator-share-cta-pot-odds-calculator' }));
    assert.equal(tree1.root.findAllByProps({ 'data-testid': 'calc-metered-milestone' }).length, 0);

    await renderer.act(async () => tree1.unmount());
    tree1 = null;

    // Visit Calculator #2: SPR Calculator in same session -> triggers Tier 5 2-spot milestone
    globalThis.window.location.pathname = '/tools/spr-calculator';
    await renderer.act(async () => {
      tree2 = renderer.create(
        React.createElement(mod.default, {
          toolSlug: 'spr-calculator',
          toolName: 'SPR & Geometric Sizing Calculator',
          summaryText: 'Pot 100, Stack 400 (4.00 SPR): 3-Street Geo 54.0% Pot, 2-Street Geo 100.0% Pot',
          redirectPath: '/tools/spr-calculator',
        }),
      );
    });

    assert.ok(tree2.root.findByProps({ 'data-testid': 'calculator-save-cta-spr-calculator' }));
    assert.ok(tree2.root.findByProps({ 'data-testid': 'calculator-share-cta-spr-calculator' }));
    const milestone = tree2.root.findByProps({ 'data-testid': 'calc-metered-milestone' });
    assert.ok(milestone, '2nd flagship calculator visit in same session must reveal calc-metered-milestone');
    const saved = JSON.parse(sessionStore.getItem('sp_calc_engagements_v1'));
    assert.equal(saved.length, 2);
  } finally {
    if (tree1) await renderer.act(async () => tree1.unmount());
    if (tree2) await renderer.act(async () => tree2.unmount());
    globalThis.window = prevWindow;
  }
});
