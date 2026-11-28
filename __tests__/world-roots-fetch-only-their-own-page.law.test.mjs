/**
 * WORLD ROOTS FETCH ONLY THEIR OWN PAGE ON FIRST PAINT (2026-11-28)
 *
 * e2e/mobile-budget.spec.ts counts every script a World root downloads at
 * 375px before it settles. On main 86afcba5 two roots failed it:
 *
 *   /hub/poker-tools   959-960 KB (budget 900 KB)
 *   /hub/toke-tracker  901 KB     (budget 900 KB)
 *
 * A per-chunk dump of that production build showed that neither page was
 * heavy. They were downloading other pages. next/link prefetches a link as
 * soon as it is in the viewport:
 *
 *   - Poker Tools has Equity Calculator and ICM Calculator shortcuts on screen
 *     at first paint. That prefetched both calculator pages and their chunks,
 *     including the Horse Brain poker engine the Equity Calculator imports
 *     (one 121 KB chunk). About 200 KB in all, for pages nobody had opened.
 *     The same build sometimes measured 598 KB, depending on whether those
 *     prefetches finished inside the measurement window.
 *   - Toke Tracker has a Back To Dashboard link and four tool cards on screen.
 *     That prefetched the Bankroll Manager dashboard (54 KB) and the Shift,
 *     Analytics, Vault and Venues pages with their TokeTracker, DealerVault,
 *     calendar and receipt chunks, about 130 KB.
 *
 * Those links keep prefetch={false}. The pages router still prefetches a link
 * on hover and on touchstart, so the page warms when the player starts to tap
 * it, and nothing on screen changes.
 *
 * The second half pins the static import graph: neither root may statically
 * import the engine or the tool pages it links to. A static import puts them
 * back in the first-paint bundle with or without prefetch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Every <Link ...> opening tag in a source file, with its href text. */
function linkTags(src) {
  return [...src.matchAll(/<Link\b([^>]*)>/g)].map((m) => m[1]);
}

/**
 * Local static import graph (relative specifiers only; dynamic import() and
 * next/dynamic are not static and are intentionally not followed).
 */
const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
function resolveLocal(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}
function staticGraph(entry) {
  const start = path.join(ROOT, entry);
  const parent = new Map([[start, null]]);
  const queue = [start];
  const importRe = /(?:^|\n)\s*(?:import\s[^'"();]*?from\s*|import\s*|export\s[^'"();]*?from\s*)['"]([^'"]+)['"]/g;
  while (queue.length) {
    const file = queue.shift();
    if (!/\.(m?js|jsx|tsx?)$/.test(file)) continue;
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(importRe)) {
      const next = resolveLocal(file, m[1]);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return parent;
}
function chainTo(graph, file) {
  const chain = [];
  for (let at = file; at; at = graph.get(at)) chain.unshift(path.relative(ROOT, at));
  return chain.join(' -> ');
}
function assertNotInGraph(entry, forbidden) {
  const graph = staticGraph(entry);
  assert.ok(graph.size > 5, `${entry}: import graph walker found almost nothing (${graph.size} files); the walker is broken`);
  for (const [file] of graph) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    for (const rule of forbidden) {
      assert.ok(!rule.test(rel), `${entry} statically imports ${rel} (${chainTo(graph, file)}). ` +
        'That is another page or engine, not first-paint code: load it with dynamic import() or link to it.');
    }
  }
}

test('Poker Tools calculator shortcuts never viewport-prefetch their pages', () => {
  const tags = linkTags(read('pages/hub/poker-tools.js'));
  for (const href of ['/hub/training/equity-calculator', '/hub/training/icm-calculator']) {
    const tag = tags.find((t) => t.includes(`href="${href}"`));
    assert.ok(tag, `Poker Tools no longer links ${href}; update this law with the page`);
    assert.match(tag, /prefetch=\{false\}/, `the ${href} shortcut must keep prefetch={false}`);
  }
});

test('every Toke Tracker workspace link and the image header return link skip viewport prefetch', () => {
  const tags = linkTags(read('src/components/bankroll/toke/TokeWorkspace.jsx'));
  assert.ok(tags.length >= 3, 'TokeWorkspace lost its links; update this law with the component');
  for (const tag of tags) assert.match(tag, /prefetch=\{false\}/, `TokeWorkspace link without prefetch={false}: <Link${tag}>`);

  const header = read('src/components/bankroll/BankrollImageHeader.jsx');
  const back = linkTags(header).find((t) => t.includes('data-header-back'));
  assert.ok(back, 'BankrollImageHeader lost its return link; update this law with the component');
  assert.match(back, /prefetch=\{false\}/, 'the image header return link must keep prefetch={false}');
});

test('Poker Tools does not statically import the poker engine or the pages it links to', () => {
  assertNotInGraph('pages/hub/poker-tools.js', [
    /^src\/lib\/poker-engine\//,
    /^src\/lib\/training\/horseBrainTrainingAdapter/,
    /^pages\/hub\/training\//,
  ]);
});

test('Toke Tracker landing does not statically import its tool pages or the Bankroll dashboard', () => {
  assertNotInGraph('pages/hub/toke-tracker/index.js', [
    /^pages\/hub\/bankroll-manager/,
    /^pages\/hub\/toke-tracker\/(shift|analytics|vault|venues)/,
    /^src\/components\/bankroll\/(TokeTracker|DealerVault|TokeCalendar|VenueIntelligence|ReceiptScanner)\.jsx$/,
  ]);
});
