/**
 * Club Arena static files do not run the edge middleware (2026-10-04).
 *
 * The arena is an external rewrite to its own origin. One cold page load pulls
 * 80-125 images, fonts, scripts and stylesheets through it, and while the
 * non-API matcher caught every one of them each file was billed as a CDN
 * request AND a function invocation. Measured 2026-10-03/04 on hub-vanguard:
 * about 2.0M requests a day, 97% under /hub/club-arena, 1,990,915 middleware
 * runs, and the on-demand spend budget used up four days into the cycle.
 *
 * Two things have to stay true together, and reading the matcher alone does
 * not show the second:
 *
 *   1. a Club Arena static file is NOT matched (no invocation is billed);
 *   2. the Club Arena DOCUMENT still is. The www redirect and the jurisdiction
 *      gate act on the document, so the bare route, every extension-less
 *      client route, the .html files and the .json files must keep running
 *      the middleware. Widening the extension list to html or json would
 *      quietly switch the jurisdiction gate off for the arena.
 *
 * The matcher is a path-to-regexp source of the form '/(<regex>)', which is
 * the regular expression ^/(<regex>)$, so it is evaluated here directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MW = readFileSync(resolve(process.cwd(), 'middleware.ts'), 'utf8');

function nonApiMatcher() {
  const matcherBlock = MW.slice(MW.indexOf('matcher: ['));
  const found = matcherBlock.match(/'(\/\(\(\?!api\|[^']+)'/);
  assert.ok(found, 'the non-API matcher is missing from middleware.ts');
  // The file holds a JS string literal: '\\.' in source is '\.' in the value.
  const source = found[1].replace(/\\\\/g, '\\');
  assert.ok(source.startsWith('/(') && source.endsWith(')'), 'unexpected matcher shape');
  return new RegExp(`^/(${source.slice(2, -1)})$`);
}

const matcher = nonApiMatcher();

test('Club Arena static files are not matched', () => {
  for (const path of [
    '/hub/club-arena/assets/index-Bx91kQ2a-v6.js',
    '/hub/club-arena/assets/vendor-react-C0ffee12-v6.js',
    '/hub/club-arena/assets/TablePage-9a8b7c6d-v6.css',
    '/hub/club-arena/assets/club-buttons/primary.webp',
    '/hub/club-arena/images/global-header/menu.png',
    '/hub/club-arena/images/throwables/stylized/rose.webp',
    '/hub/club-arena/cards/as.webp',
    '/hub/club-arena/club-logos/preset-01.webp',
    '/hub/club-arena/game-card-icons/nlh.png',
    '/hub/club-arena/videos/intro.mp4',
    '/hub/club-arena/sounds/chip.mp3',
    '/hub/club-arena/fonts/fonts-0a1b2c3d.css',
    '/hub/club-arena/fonts/inter-latin.woff2',
    '/hub/club-arena/default-avatar.png',
    '/hub/club-arena/sw-bus.js',
  ]) {
    assert.equal(matcher.test(path), false, `${path} would still invoke the middleware`);
  }
});

test('the Club Arena document still runs the www redirect and the jurisdiction gate', () => {
  for (const path of [
    '/hub/club-arena',
    '/hub/club-arena/',
    '/hub/club-arena/index.html',
    '/hub/club-arena/offline.html',
    '/hub/club-arena/build-info.json',
    '/hub/club-arena/manifest.json',
    '/hub/club-arena/prerender-manifest.json',
    '/hub/club-arena/cashier',
    '/hub/club-arena/clubs/shark-club',
    '/hub/club-arena/clubs/shark.club/tables',
    '/hub/club-arena/legal/tos',
  ]) {
    assert.equal(matcher.test(path), true, `${path} no longer runs the middleware`);
  }
});

test('the exclusion is scoped to Club Arena and changes nothing else', () => {
  for (const path of [
    '/',
    '/hub',
    '/hub/poker-near-me',
    '/hub/training/app.js',
    '/hub/club-arena-archive/logo.png',
    '/images/logo.png',
    '/cards/as.webp',
    '/jurisdiction-blocked',
  ]) {
    assert.equal(matcher.test(path), true, `${path} stopped running the middleware`);
  }
  for (const path of ['/api/health', '/_next/static/chunks/main.js', '/_next/image', '/favicon.ico']) {
    assert.equal(matcher.test(path), false, `${path} was never matched and must not start now`);
  }
});

test('documents and data files are not in the excluded extension list', () => {
  const found = MW.match(/hub\/club-arena\/\.\*\\\\\.\(\?:([^)]+)\)\$/);
  assert.ok(found, 'the Club Arena static exclusion is missing from the matcher');
  const extensions = found[1].split('|');
  for (const forbidden of ['html', 'htm', 'json', 'xml', 'txt', 'webmanifest']) {
    assert.ok(
      !extensions.includes(forbidden),
      `.${forbidden} is excluded from the middleware: that takes the jurisdiction gate off a document`
    );
  }
});
