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
};

test('no page that is about the viewer is offered to a crawler', () => {
  const listed = new Set(sitemapPaths());
  const offenders = Object.entries(ABOUT_THE_VIEWER)
    .filter(([route]) => listed.has(route))
    .map(([route, why]) => `${route} (${why})`);
  assert.deepEqual(offenders, [], `these show the viewer their own data:\n${offenders.join('\n')}`);
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
