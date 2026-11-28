/**
 * OTC TIER 7 CI FORTRESS: 100% CALCULATOR ECOSYSTEM CLOUD-SAVE COVERAGE (2026-11-28)
 *
 * Permanent root-cause regression locks proving 100% of interactive calculator and tool
 * pages directly under pages/tools/*.js (excluding hub/meta pages index.js, embeds.js,
 * and preflop-ranges.js) participate in Save Spot cloud sync, Share Spot viral link
 * attribution, and the soft-metered 2-spot Session Milestone (sp_calc_engagements_v1):
 *   1. Dynamic directory scan discovers EVERY interactive calculator/tool page under
 *      pages/tools/*.js (50 pages today; automatically protects future pages too).
 *   2. 100% import and mount SmarterCalculatorSaveBar exactly once with a unique literal
 *      toolSlug matching the filename, redirectPath matching /tools/<slug>, non-empty
 *      Title Case copy props (toolName, eyebrow, title, description, ctaLabel), and
 *      summaryText.
 *   3. 100% mount SmarterCalculatorSaveBar above their single SmarterAccountUnlockGate,
 *      preserving SEOHead (directly or via delegated hub wrapper), CitationBacklinkBox,
 *      AiPromptLauncher, and embed guards ({!isEmbed && (...)}) where present.
 *   4. 100% enforce zero em/en dashes, zero &apos; entities, and zero banned gold hexes.
 *   5. Runtime cross-calculator guest navigation across Tier 7 calculators records 2 unique
 *      spots in sp_calc_engagements_v1 and surfaces calc-metered-milestone.
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
const TOOLS_DIR = path.join(ROOT, 'pages', 'tools');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const EXCLUDED_META_PAGES = new Set([
  'index.js',
  'embeds.js',
  'preflop-ranges.js',
]);

const DELEGATED_SEO_WRAPPERS = new Map([
  ['icm-calculator', 'pages/hub/training/icm-calculator.js'],
  ['poker-odds-calculator', 'pages/hub/poker-tools.js'],
]);

const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|d4af37|facc15|f2b84b|d4a853)\b/i;

function listAllCalculatorPages() {
  return fs
    .readdirSync(TOOLS_DIR)
    .filter((name) => name.endsWith('.js') && !EXCLUDED_META_PAGES.has(name))
    .sort()
    .map((file) => ({
      file,
      slug: file.replace(/\.js$/, ''),
      rel: `pages/tools/${file}`,
    }));
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function extractSaveBarJsxElements(src, rel) {
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

test('OTC-T7 LAW 1: 100% of interactive pages/tools/*.js import and mount SmarterCalculatorSaveBar once with unique matching toolSlug, redirectPath, Title Case copy, and summaryText', () => {
  const pages = listAllCalculatorPages();
  assert.ok(pages.length >= 50, `Expected at least 50 calculator pages under pages/tools/*.js (found ${pages.length})`);

  const seenSlugs = new Set();

  for (const calc of pages) {
    const src = read(calc.rel);
    assert.match(
      src,
      /import\s+SmarterCalculatorSaveBar\s+from\s+['"]\.\.\/\.\.\/src\/components\/seo\/SmarterCalculatorSaveBar['"]/,
      `${calc.rel} must import SmarterCalculatorSaveBar`,
    );

    const { sf, matches } = extractSaveBarJsxElements(src, calc.rel);
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
      assert.equal(redirectProp.value, `/tools/${calc.slug}`, `${calc.rel} redirectPath must match /tools/${calc.slug}`);
    } else {
      assert.equal(redirectProp.text, 'canonicalPath', `${calc.rel} dynamic redirectPath must reference canonicalPath`);
      assert.match(
        src,
        new RegExp(`const\\s+canonicalPath\\s*=\\s*['"]/tools/${calc.slug}['"]`),
        `${calc.rel} canonicalPath must equal /tools/${calc.slug}`,
      );
    }
  }

  assert.equal(seenSlugs.size, pages.length, 'Every calculator page must have a unique toolSlug');
});

test('OTC-T7 LAW 2: 100% of calculator pages mount SmarterCalculatorSaveBar above their single SmarterAccountUnlockGate and preserve SEOHead, CitationBacklinkBox, AiPromptLauncher, and embed guards', () => {
  const pages = listAllCalculatorPages();

  for (const calc of pages) {
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

    // If page supports embed mode with an {!isEmbed && (...)} gate wrapper, SaveBar must stay inside it
    const embedGateIdx = src.lastIndexOf('{!isEmbed && (', gateIdx);
    if (embedGateIdx > -1 && gateIdx - embedGateIdx < 900) {
      assert.ok(
        saveBarIdx > embedGateIdx && saveBarIdx < gateIdx,
        `${calc.rel} must keep <SmarterCalculatorSaveBar /> inside the {!isEmbed && (...)} embed guard`,
      );
    }

    const wrapperRel = DELEGATED_SEO_WRAPPERS.get(calc.slug);
    if (wrapperRel) {
      const wrappedSrc = read(wrapperRel);
      assert.match(wrappedSrc, /<SEOHead\b/, `${wrapperRel} must preserve <SEOHead />`);
    } else {
      assert.match(src, /<SEOHead\b/, `${calc.rel} must preserve <SEOHead />`);
      assert.match(src, /<CitationBacklinkBox\b/, `${calc.rel} must preserve <CitationBacklinkBox />`);
      assert.match(src, /<AiPromptLauncher\b/, `${calc.rel} must preserve <AiPromptLauncher />`);
    }
  }
});

test('OTC-T7 LAW 3: 100% of calculator pages enforce zero em/en dashes, zero &apos; entities, and zero banned gold hexes', () => {
  const pages = listAllCalculatorPages();

  for (const calc of pages) {
    const src = read(calc.rel);
    const codeOnly = stripComments(src);
    assert.doesNotMatch(codeOnly, /[\u2014\u2013]/, `${calc.rel} must contain zero em or en dashes`);
    assert.doesNotMatch(codeOnly, /&apos;/i, `${calc.rel} must never use &apos; in JSX text`);
    assert.doesNotMatch(codeOnly, BANNED_GOLD, `${calc.rel} must never use banned gold hexes`);
  }
});

test('OTC-T7 LAW 4: Cross-calculator navigation across Tier 7 tools triggers the 2-spot Session Milestone in sp_calc_engagements_v1', async () => {
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
    location: { pathname: '/tools/3bet-calculator', search: '' },
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
    await renderer.act(async () => {
      tree1 = renderer.create(
        React.createElement(mod.default, {
          toolSlug: '3bet-calculator',
          toolName: '3-Bet, 4-Bet & Squeeze Calculator',
          eyebrow: 'Free Preflop Cloud Sync',
          title: 'Save This 3-Bet & Squeeze Sizing Spot Free',
          description: 'Sync 3-Bet Multipliers, Villain MDF Thresholds & Optimal 4-Bet Sizings Across Phone & Desktop.',
          ctaLabel: 'Save 3-Bet Spot Free',
          summaryText: '100BB IP Vs 2.5BB Open (+0 Callers): Recommended 3-Bet = 7.5BB (3x)',
          redirectPath: '/tools/3bet-calculator',
        }),
      );
    });
    assert.ok(tree1.root.findByProps({ 'data-testid': 'calculator-save-cta-3bet-calculator' }));
    assert.ok(tree1.root.findByProps({ 'data-testid': 'calculator-share-cta-3bet-calculator' }));
    assert.equal(tree1.root.findAllByProps({ 'data-testid': 'calc-metered-milestone' }).length, 0);

    await renderer.act(async () => tree1.unmount());
    tree1 = null;

    globalThis.window.location.pathname = '/tools/outs-calculator';
    await renderer.act(async () => {
      tree2 = renderer.create(
        React.createElement(mod.default, {
          toolSlug: 'outs-calculator',
          toolName: 'Poker Outs & Draw Probability Calculator',
          eyebrow: 'Free Draw Math Cloud Sync',
          title: 'Save This Poker Outs & Draw Odds Spot Free',
          description: 'Sync Clean Outs, Exact Hypergeometric Hit Rates & Break-Even Calling Odds Across Devices.',
          ctaLabel: 'Save Outs Spot Free',
          summaryText: '9 Clean Outs On Flop: Exact Hit Equity = 35.0% Vs Required Pot Odds = 25.0%',
          redirectPath: '/tools/outs-calculator',
        }),
      );
    });

    assert.ok(tree2.root.findByProps({ 'data-testid': 'calculator-save-cta-outs-calculator' }));
    assert.ok(tree2.root.findByProps({ 'data-testid': 'calculator-share-cta-outs-calculator' }));
    const milestone = tree2.root.findByProps({ 'data-testid': 'calc-metered-milestone' });
    assert.ok(milestone, '2nd Tier 7 calculator visit in same session must reveal calc-metered-milestone');
    const saved = JSON.parse(sessionStore.getItem('sp_calc_engagements_v1'));
    assert.equal(saved.length, 2);
  } finally {
    if (tree1) await renderer.act(async () => tree1.unmount());
    if (tree2) await renderer.act(async () => tree2.unmount());
    globalThis.window = prevWindow;
  }
});
