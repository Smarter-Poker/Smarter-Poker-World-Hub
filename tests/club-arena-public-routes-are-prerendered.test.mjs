/**
 * THE PUBLIC ARENA ROUTES POINT AT THEIR PRERENDERED FILES (AEO phase 1,
 * 2026-09-17).
 *
 * The arena origin's Caddy sends every extension-less path to /index.html, so
 * the static HTML the arena build writes for /help, the Legal Center and the
 * four legal documents is served only because next.config.js names those
 * files, ahead of the catch-all rewrite. This pins the list to the routes the
 * arena prerenders (its src/lib/seo.ts PUBLIC_ROUTES; /legal joined on
 * 2026-09-22 after Google filed it as an alternate of the arena root) and
 * keeps the two original rewrites intact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = fs.readFileSync(new URL('../next.config.js', import.meta.url), 'utf8');
const rewrites = config.slice(config.indexOf('async rewrites()'));

test('the help centre and the four legal documents rewrite to their prerendered files', () => {
  assert.match(
    rewrites,
    /source: '\/hub\/club-arena\/help',\s*destination: 'https:\/\/ca-static\.smarter\.poker\/help\/index\.html'/,
  );
  assert.match(
    rewrites,
    /source: '\/hub\/club-arena\/legal\/:doc\(tos\|privacy\|fair-gaming\|promotions\)',\s*destination:\s*'https:\/\/ca-static\.smarter\.poker\/legal\/:doc\/index\.html'/,
  );
});

test('the Legal Center index rewrites to its prerendered file, ahead of the catch-all', () => {
  assert.match(
    rewrites,
    /source: '\/hub\/club-arena\/legal',\s*destination: 'https:\/\/ca-static\.smarter\.poker\/legal\/index\.html'/,
  );
  const legal = rewrites.indexOf("source: '/hub/club-arena/legal'");
  const catchAll = rewrites.indexOf("source: '/hub/club-arena/:path*'");
  assert.ok(legal > -1 && legal < catchAll, 'a named file rewrite after the catch-all never matches');
});

test('the prerendered rewrites come before the catch-all, and the catch-all survives', () => {
  const help = rewrites.indexOf("source: '/hub/club-arena/help'");
  const catchAll = rewrites.indexOf("source: '/hub/club-arena/:path*'");
  assert.ok(help > -1 && catchAll > -1);
  assert.ok(help < catchAll, 'a named file rewrite after the catch-all never matches');
  assert.match(rewrites, /source: '\/hub\/club-arena',\s*destination: 'https:\/\/ca-static\.smarter\.poker\/index\.html'/);
});
