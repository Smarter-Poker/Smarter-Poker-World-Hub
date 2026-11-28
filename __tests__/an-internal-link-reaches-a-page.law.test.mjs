/**
 * AN INTERNAL LINK REACHES A PAGE (live SEO contract, 2026-11-28).
 *
 * `scripts/ci/check-live-seo-contract.mjs` crawled production after #3264
 * and found three internal links that did not land on a page:
 *   - the Training footer's "Play" pointed at /hub/training/play-mode, a
 *     redirect shim, so every visit and every crawler paid a 307 hop;
 *   - rules pages printed a /glossary/<slug> chip for every relatedTerms
 *     entry, including terms the glossary never defined (club-arena,
 *     side-pot, all-in, push-fold), each a 404;
 *   - series pages linked /hub/poker-near-me/in/<state> even when the
 *     directory lists no rooms there, which that page answers with 404.
 * Each is fixed where the link is made. These pins keep the cause from
 * coming back, not just the three URLs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readGlossaryTerms, glossaryLinksFor } from '../src/lib/learn/glossaryLinks.js';

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function pageFileFor(pathname) {
  const base = path.join(ROOT, 'pages', pathname.replace(/^\//, ''));
  for (const candidate of [`${base}.js`, `${base}.jsx`, `${base}.tsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// The one recorded exception: /hub/marketplace is the Marketplace world's own
// address. next.config.js answers it with a permanent 308 to /hub/diamond-store
// and the footer route matrix requires the physical page (see the comment at
// the top of pages/hub/marketplace.js). It is a world address, not a shim a
// menu item was pointed at by mistake.
const WORLD_ADDRESS_REDIRECTS = new Set(['/hub/marketplace']);

test('no World footer or menu item points at a page that only redirects', () => {
  const nav = JSON.parse(read('src/config/world-footer-navigation.json'));
  const hrefs = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (typeof node.href === 'string') hrefs.push(node.href);
      Object.values(node).forEach(walk);
    }
  };
  walk(nav);
  assert.ok(hrefs.length > 20, 'the footer navigation was read');
  for (const href of hrefs) {
    if (!href.startsWith('/')) continue;
    if (WORLD_ADDRESS_REDIRECTS.has(href.split(/[?#]/)[0])) continue;
    const file = pageFileFor(href.split(/[?#]/)[0]);
    if (!file) continue;
    const src = fs.readFileSync(file, 'utf8');
    const redirectShim = /redirect:\s*\{/.test(src) && /return null;\s*\}\s*$/.test(src.trim());
    assert.ok(!redirectShim, `${href} is a redirect shim (${path.relative(ROOT, file)}); link to its destination instead`);
  }
});

test('a rules page links only the glossary terms that have a page', () => {
  const page = read('pages/rules/[slug].js');
  assert.match(page, /glossaryLinksFor\(rule\.relatedTerms, readGlossaryTerms\(\)\)/);
  assert.doesNotMatch(page, /rule\.relatedTerms \|\| \[\]\)\.map/, 'relatedTerms is never rendered unfiltered');
  // The resolver itself drops a term the glossary does not define.
  const terms = readGlossaryTerms();
  if (terms.size) {
    assert.deepEqual(glossaryLinksFor(['club-arena-not-a-term', [...terms.keys()][0]], terms).map((t) => t.slug), [[...terms.keys()][0]]);
  }
});

test('a series page links its state directory only when that directory has rooms', () => {
  const page = read('pages/hub/series/[id].js');
  assert.match(page, /async function stateDirectoryPathFor\(state\)/);
  assert.match(page, /fetchPokerVenueLocation\(\{ state: resolved\.code \}\)/);
  assert.match(page, /result\?\.venues\?\.length \? `\/hub\/poker-near-me\/in\/\$\{resolved\.slug\}` : null/);
  assert.match(page, /seoSeries\.stateDirectoryPath = await stateDirectoryPathFor\(seoSeries\.state\)/);
  assert.doesNotMatch(page, /poker-near-me\/in\/\$\{stateCode\}/, 'no link built from the bare state code');
  assert.match(page, /<a href=\{stateDirectoryPath\}>/);
});

test('the series breadcrumb names the state only when its directory has rooms', async () => {
  const { seriesSchema } = await import('../src/lib/poker-near-me/seriesSeo.mjs');
  const crumbs = (series) => seriesSchema(series)
    .find((node) => node['@type'] === 'BreadcrumbList')
    .itemListElement.map((item) => item.item);
  const base = { id: 'test-1', name: 'Fall Classic', state: 'MO', city: 'St. Louis' };
  assert.ok(!crumbs(base).some((url) => url.includes('/poker-near-me/in/')), 'no state crumb without a confirmed directory');
  assert.ok(!crumbs({ ...base, stateDirectoryPath: null }).some((url) => url.includes('/poker-near-me/in/')));
  assert.ok(crumbs({ ...base, state: 'NV', stateDirectoryPath: '/hub/poker-near-me/in/nv' }).includes('https://smarter.poker/hub/poker-near-me/in/nv'));
});
