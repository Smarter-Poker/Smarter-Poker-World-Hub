/**
 * THE SITEMAP LISTS ONLY PAGES WORTH INDEXING (AEO phase 3, 2026-09-17).
 *
 * The September sweep took out the routes that redirect a signed-out
 * visitor to a login page. It left the ones that load, render their
 * chrome, and then show the viewer their own results.
 *
 * Measured on production as OAI-SearchBot with scripts and styles
 * stripped, those fifteen returned between 0 and 49 words, and several
 * returned no <title> and no <h1> at all:
 *
 *   /hub/profile              0 words   a client-side redirect, nothing else
 *   /hub/article              0 words   needs ?id=, serves an empty shell
 *   /hub/friends              0 words   the viewer's own friends
 *   /hub/training/progress    3 words   the viewer's own results
 *   /hub/trivia/stats         8 words   the viewer's own results
 *   ...
 *
 * There is nothing on any of them an engine could cite, because what they
 * show depends entirely on who is looking. A sitemap is a list of pages
 * worth indexing, not a list of routes, and every entry that cannot be
 * cited spends crawl budget teaching an engine nothing.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sitemapPaths = () =>
  [...read('pages/sitemap.xml.js').matchAll(/\{ path: '([^']+)'/g)].map((m) => m[1]);

/** Route -> why a crawler can never cite it. */
const ABOUT_THE_VIEWER = {
  '/hub/profile': 'a client-side redirect to the signed-in player\'s own profile',
  '/hub/article': 'needs an ?id= query; the bare route is an empty shell',
  '/hub/avatars': 'the viewer picking their own avatar',
  '/hub/friends': "the viewer's own friends, requests and followers",
  '/hub/social-pages/create': 'a create form',
  '/hub/bankroll-manager/export': "an export of the viewer's own ledger",
  '/hub/training/progress': "the viewer's own training results",
  '/hub/training/reports': "the viewer's own training results",
  '/hub/training/aggregate': "the viewer's own training results",
  '/hub/training/streaks': "the viewer's own training results",
  '/hub/training/achievements': "the viewer's own training results",
  '/hub/trivia/stats': "the viewer's own trivia results",
  '/hub/trivia/achievements': "the viewer's own trivia results",
  '/hub/preflop-charts/achievements': "the viewer's own practice results",
  '/hub/preflop-charts/stats': "the viewer's own practice results",
  // Not about the viewer, about the staff: an email and password form, a
  // roster table and an SQL console, gated on profiles.is_admin. A public
  // sitemap is the wrong place to advertise an admin login.
  '/horses': 'the staff admin console, behind a login form',
};

test('no page that is about the viewer is offered to a crawler', () => {
  const listed = new Set(sitemapPaths());
  const offenders = Object.entries(ABOUT_THE_VIEWER)
    .filter(([route]) => listed.has(route))
    .map(([route, why]) => `${route} (${why})`);
  assert.deepEqual(offenders, [], `these show the viewer their own data:\n${offenders.join('\n')}`);
});

test('no route the sitemap lists is only a redirect', () => {
  // A crawler that follows a sitemap entry to a redirect learns the
  // destination it could have reached anyway, and spends a fetch to do it.
  //
  // The line-count heuristic this used to carry missed /hub/trivia/survival,
  // a 76 line redirect shim, because a shim with a long explanatory comment
  // is still a shim. Detect the redirect itself instead: a server redirect,
  // a named redirect component, or router.replace/push to a constant on
  // mount (AEO phase 3, 2026-09-18).
  const offenders = [];
  for (const route of sitemapPaths()) {
    const candidates =
      route === '/' ? ['pages/index.js'] : [`pages${route}.js`, `pages${route}/index.js`];
    const file = candidates.find((f) => fs.existsSync(path.join(ROOT, f)));
    if (!file) continue;
    const src = read(file);
    if (/redirect:\s*\{/.test(src) && /getServerSideProps|getStaticProps/.test(src)) {
      offenders.push(`${route} (${file}: a server redirect)`);
    } else if (/<CanonicalTrainingRedirect/.test(src)) {
      offenders.push(`${route} (${file}: a redirect shim)`);
    } else if (/router\.(replace|push)\(\s*[A-Z_]{3,}\s*\)/.test(src)) {
      offenders.push(`${route} (${file}: redirects to a constant route on mount)`);
    }
  }
  assert.deepEqual(offenders, [], `the sitemap lists redirects:\n${offenders.join('\n')}`);
});

test('the sitemap never offers a page that tells crawlers not to index it', () => {
  // The sitemap says "index this" and the page says "do not". The crawler
  // believes the page, so the entry spends budget to be overruled.
  // /hub/trivia/survival did exactly this: listed, noindex, and canonical to
  // a different URL (AEO phase 3, 2026-09-18).
  const offenders = [];
  for (const route of sitemapPaths()) {
    const candidates =
      route === '/' ? ['pages/index.js'] : [`pages${route}.js`, `pages${route}/index.js`];
    const file = candidates.find((f) => fs.existsSync(path.join(ROOT, f)));
    if (!file) continue;
    const src = read(file);
    if (/noindex=\{true\}|noindex\s*$|content="noindex/m.test(src) && /noindex/.test(src)) {
      if (/noindex=\{true\}/.test(src) || /content="noindex/.test(src)) {
        offenders.push(`${route} (${file}) declares noindex`);
      }
    }
    // A page whose canonical names a different route is asking not to be the
    // indexed one either.
    const canonical = src.match(/canonical=\{?["']?([^"'}\s]+)/)?.[1];
    if (canonical && canonical.startsWith('/') && canonical !== route) {
      offenders.push(`${route} (${file}) canonicals to ${canonical}`);
    }
  }
  assert.deepEqual(offenders, [], `the sitemap contradicts the page:\n${offenders.join('\n')}`);
});

test('no admin console is advertised in the public sitemap', () => {
  // A scanner, not a list: any listed route whose page is an admin surface
  // or ships a password form fails here, whether or not anyone named it.
  const offenders = [];
  for (const route of sitemapPaths()) {
    const candidates =
      route === '/' ? ['pages/index.js'] : [`pages${route}.js`, `pages${route}/index.js`];
    const file = candidates.find((f) => fs.existsSync(path.join(ROOT, f)));
    if (!file) continue;
    const src = read(file);
    const reasons = [];
    if (/\bAdmin\b/.test(src.slice(0, 3000)) || src.includes('is_admin')) reasons.push('an admin surface');
    if (src.includes('signInWithPassword') || src.includes('loginForm')) reasons.push('a password form');
    if (reasons.length) offenders.push(`${route} (${file}: ${reasons.join(', ')})`);
  }
  assert.deepEqual(offenders, [], `the sitemap advertises staff surfaces:\n${offenders.join('\n')}`);

  // Leaving the sitemap stops it being promoted; robots.txt stops it being
  // crawled at all. A group is exclusive, so the rule must be in every one.
  const robots = read('public/robots.txt');
  const groups = (robots.match(/^User-agent:/gm) || []).length;
  assert.equal(
    (robots.match(/^Disallow: \/horses$/gm) || []).length,
    groups,
    `every one of the ${groups} crawler groups disallows /horses`,
  );
});

test('every route the sitemap promises is a route that exists', () => {
  // A sitemap entry with no page behind it is a 404 the site asked for.
  const missing = [];
  for (const route of sitemapPaths()) {
    const candidates =
      route === '/'
        ? ['pages/index.js']
        : [`pages${route}.js`, `pages${route}/index.js`, `pages${route}.jsx`, `pages${route}/index.jsx`];
    if (!candidates.some((file) => fs.existsSync(path.join(ROOT, file)))) missing.push(route);
  }
  assert.deepEqual(missing, [], `the sitemap lists routes with no page:\n${missing.join('\n')}`);
});

test('the routes that carry the products are still there', () => {
  // The other half of the law: a sweep that removes too much is the same
  // bug pointing the other way.
  const listed = new Set(sitemapPaths());
  for (const route of [
    '/',
    '/about',
    '/hub',
    '/hub/training',
    '/hub/home-games',
    '/hub/bankroll-manager',
    '/hub/commander',
    '/hub/poker-near-me/lobby',
    '/hub/news',
    '/hub/video-library',
    '/hub/preflop-charts',
    '/hub/trivia',
  ]) {
    assert.ok(listed.has(route), `the sitemap must still list ${route}`);
  }
});
