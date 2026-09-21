/**
 * NO PUBLIC PAGE IS NAMELESS (AEO phase 3, 2026-09-18).
 *
 * A page that answers 200 with no <title> and no robots directive is the
 * worst thing a site can serve an engine. It is not merely unranked: it is
 * a nameless, near-empty document that the engine must fold into its
 * judgement of the whole domain. Six of them were live, none in the
 * sitemap, all indexable, measured as OAI-SearchBot:
 *
 *   /pokerbrain               10 words   no title   index
 *   /hub/session-history      19 words   no title   index
 *   /hub/hand-history         13 words   no title   index
 *   /hub/profile               9 words   no title   index
 *   /demo/outro               22 words   no title   index
 *   /poker-room-demo           0 words   no title   index
 *
 * Staying out of the sitemap protects none of them. A sitemap is an
 * invitation, not a fence; robots.txt is the fence, and none of these six
 * were behind it. /hub/vip-membership/manage already had the answer and
 * had had it for a while: name the page, then ask not to be indexed. The
 * six now do the same.
 *
 * WHY THIS IS A SCANNER AND NOT A LIST
 *
 * The first pass at this was a list, built by grepping each page file for
 * SEOHead or <title>. It reported /hub/poker-near-me/in as headless. That
 * page is fine: it delegates its whole head to PokerNearMeLocationPage,
 * one import away, and serves a 50-character title, an h1, a canonical and
 * schema. The list was wrong about a page that worked, which is the same
 * failure as being wrong about a page that does not.
 *
 * So this walks the tree. For each page it resolves the page's own local
 * imports and asks whether the page, or anything it imports, provides a
 * title. Every law in this programme that caught a real defect walked the
 * tree; every list-based one passed while the bug was live.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Next.js machinery, not pages. _app and _document frame every page and
 * have no head of their own to give; an error page is served with a status
 * that already tells an engine not to index it.
 */
const NOT_A_PAGE = new Set([
  'pages/_app.js',
  'pages/_document.js',
  'pages/404.js',
  'pages/500.js',
  'pages/_error.js',
]);

/**
 * The routes robots.txt actually fences off, read from robots.txt rather
 * than copied into a list here. A page behind the fence is not served to a
 * crawler at all, so it owes no title. Copying these paths into this file
 * would let the two drift, and a fence that only this test believes in is
 * not a fence.
 */
function disallowedPrefixes() {
  const txt = fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8');
  const out = new Set();
  for (const m of txt.matchAll(/^Disallow:\s*(\S+)\s*$/gm)) out.add(m[1]);
  return [...out];
}

/** pages/hub/foo/index.js -> /hub/foo ; pages/hub/[x].js -> /hub/[x] */
function routeOf(rel) {
  return '/' + rel
    .replace(/^pages\//, '')
    .replace(/\.(js|jsx)$/, '')
    .replace(/\/index$/, '');
}

function behindTheFence(rel, prefixes) {
  const route = routeOf(rel);
  return prefixes.some((p) => (p.endsWith('/') ? route.startsWith(p) : route === p || route.startsWith(p + '/')));
}

/**
 * A route that answers with something other than an HTML page - sitemap.xml
 * and friends - writes its bytes to the response and renders nothing. It
 * has no head because it has no document, which is correct, not a defect.
 */
function isResourceRoute(rel) {
  const src = read(rel) || '';
  const writesResponse = /res\.(write|end|setHeader\(\s*['"]Content-Type)/.test(src);
  const rendersNothing = /export default function \w+\(\)\s*\{\s*return null;?\s*\}/.test(src);
  return writesResponse && rendersNothing;
}

function pageFiles(dir = 'pages', out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'api' || entry.name === 'node_modules') continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) pageFiles(rel, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/**
 * Comments are stripped before scanning. This file's own explanation names
 * every symbol it looks for, and several of the pages explain their head in
 * a comment; a scanner that reads its own warning as evidence is a scanner
 * nobody keeps.
 */
function withoutComments(src) {
  // Line based on purpose. The obvious implementation - a non-greedy
  // /\*[\s\S]*?\*/ sweep - was tried first and ate 33,000 of USRobots.js's
  // 37,000 characters, taking the page's real <title> with them, because a
  // template literal of CSS elsewhere in the file opened a block the sweep
  // happily closed much later. A scanner that silently deletes the evidence
  // it is looking for reports a healthy page as broken, which is how this
  // law nearly shipped with two false accusations in it.
  //
  // Dropping whole comment lines cannot swallow code: the worst it can do
  // is miss a trailing comment on a line that also has code, and a trailing
  // comment is not where anyone explains a head.
  return src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'));
    })
    .join('\n');
}

const readCache = new Map();
function read(rel) {
  if (!readCache.has(rel)) {
    try {
      readCache.set(rel, withoutComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    } catch {
      readCache.set(rel, null);
    }
  }
  return readCache.get(rel);
}

/** Resolve a relative import specifier to a file in this repo, or null. */
function resolveLocal(fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.join(path.posix.dirname(fromRel), spec);
  for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]) {
    if (read(cand) !== null) return cand;
  }
  return null;
}

/** Every relative module this file pulls in, static or dynamic. */
function localImports(rel) {
  const src = read(rel) || '';
  const specs = new Set();
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) specs.add(m[1]);
  const out = [];
  for (const spec of specs) {
    const target = resolveLocal(rel, spec);
    if (target) out.push(target);
  }
  return out;
}

/**
 * Does this file put a title in the head? Either through the shared
 * SEOHead wrapper, which always emits one, or by writing the tag itself.
 */
function providesTitle(rel) {
  const src = read(rel) || '';
  if (/<SEOHead\b/.test(src)) return true;
  if (/<SharedSEOHead\b/.test(src)) return true;
  if (/<title\b/.test(src)) return true;
  return false;
}

/**
 * A page whose server response is a redirect or a 404 never paints and
 * never needs a head. Detected from the shape of the data function, not
 * from a list of paths.
 */
function neverPaints(rel) {
  const src = read(rel) || '';
  if (!/export\s+(?:async\s+)?function\s+getServerSideProps/.test(src)
      && !/export\s+const\s+getServerSideProps/.test(src)) return false;
  const returnsRedirect = /return\s*\{[^}]*redirect\s*:/.test(src)
    || /redirect\s*:\s*\{\s*destination/.test(src);
  const alwaysNotFound = /return\s*\{\s*notFound\s*:\s*true\s*\}/.test(src)
    && !/return\s*\{\s*props/.test(src);
  if (!returnsRedirect && !alwaysNotFound) return false;
  // Only exempt when EVERY path redirects: a page that redirects
  // conditionally still paints for everyone else.
  return !/return\s*\{\s*props/.test(src);
}

/** Two levels of import following: the page, then what the page pulls in. */
function titleReachableFrom(rel, depth = 2, seen = new Set()) {
  if (seen.has(rel) || depth < 0) return false;
  seen.add(rel);
  if (providesTitle(rel)) return true;
  if (depth === 0) return false;
  for (const next of localImports(rel)) {
    // A page may re-export another page's component wholesale
    // (`export { default } from './memory-games'`), so a target under
    // pages/ is followed like any other. The seen set and the depth bound
    // keep that from wandering.
    if (titleReachableFrom(next, depth - 1, seen)) return true;
  }
  return false;
}

test('every page that paints says what it is', () => {
  const fence = disallowedPrefixes();
  const nameless = [];
  for (const rel of pageFiles()) {
    if (NOT_A_PAGE.has(rel)) continue;
    if (neverPaints(rel)) continue;
    if (isResourceRoute(rel)) continue;
    if (behindTheFence(rel, fence)) continue;
    if (!titleReachableFrom(rel)) nameless.push(rel);
  }

  assert.deepEqual(
    nameless,
    [],
    'These pages answer a request with no <title> anywhere in their head. An '
    + 'engine sees a nameless document and judges the whole site on it. Give '
    + 'the page a <SEOHead> with a title; add `noindex` too if it is a signed '
    + 'in surface or an internal demo, the way /hub/vip-membership/manage '
    + 'does. Staying out of the sitemap is not protection: the sitemap is an '
    + 'invitation, robots.txt is the fence.\n\nNameless:\n  '
    + nameless.join('\n  '),
  );
});

test('a signed in or internal page that names itself also asks not to be indexed', () => {
  // The six pages this law was written for are account surfaces and demos.
  // Naming them is the fix; naming them and then inviting an engine in
  // would be a worse outcome than leaving them nameless.
  const shouldBeNoindex = [
    'pages/pokerbrain.js',
    'pages/hub/session-history.js',
    'pages/hub/hand-history.js',
    'pages/hub/profile.js',
    'pages/demo/outro.js',
    'pages/poker-room-demo.js',
    // Client side redirect shims. They serve a 200 with an empty body to a
    // crawler that does not run JavaScript, so a title without a noindex
    // would invite an engine to index nothing at all.
    'pages/hub/gto-trainer.js',
    'pages/hub/tournaments.js',
    'pages/hub/social-media/compose.js',
    'pages/hub/social-media/[slug].js',
  ];
  const indexable = shouldBeNoindex.filter((rel) => {
    const src = read(rel);
    if (src === null) return false; // deleted is fine; it cannot be indexed
    return !/\bnoindex\b/.test(src);
  });
  assert.deepEqual(
    indexable,
    [],
    'These are signed in surfaces or internal demos. They must pass `noindex` '
    + 'to SEOHead. If one of them has become a public page worth reading, '
    + 'remove it from this list in the same commit that gives it real '
    + 'content.\n\nIndexable:\n  ' + indexable.join('\n  '),
  );
});
