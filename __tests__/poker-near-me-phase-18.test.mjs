import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isPokerDiscoveryRouteIndexable,
  POKER_DISCOVERY_SITEMAP_ROUTES,
  PRIVATE_POKER_DISCOVERY_SLUGS,
} from '../src/lib/poker-near-me/sitemapRoutes.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('daily anomaly automation is authenticated, exact, observed, and paged', async () => {
  const [route, dispatcher, health] = await Promise.all([
    source('pages/api/internal/pnm-integrity-refresh.js'),
    source('scripts/openclaw-cron-dispatcher.py'),
    source('pages/api/admin/cron-health.js'),
  ]);

  assert.match(route, /validateCronAuth\(req\)/);
  assert.match(route, /syncVenueIntegrityState\(getSupabase\(\)\)/);
  assert.match(route, /result\.source_rows !== result\.synced_rows/);
  assert.match(route, /withCronHealth\('pnm-integrity-refresh', handler\)/);
  assert.match(route, /maxDuration: 300/);
  assert.match(dispatcher, /\('\/api\/internal\/pnm-integrity-refresh',\s*dict\(hour=5, minute=20\)\)/);
  assert.match(dispatcher, /'\/api\/internal\/pnm-integrity-refresh':\s*2/);
  assert.match(dispatcher, /'\/api\/internal\/pnm-integrity-refresh':\s*300/);
  assert.match(health, /name: 'pnm-integrity-refresh'[\s\S]*?intervalMin: 1440/);
});

test('indexation separates public discovery from private workspaces', async () => {
  const [page, sitemap, robots] = await Promise.all([
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('pages/sitemap.xml.js'),
    source('public/robots.txt'),
  ]);

  assert.equal(POKER_DISCOVERY_SITEMAP_ROUTES.length, 9);
  assert.equal(new Set(POKER_DISCOVERY_SITEMAP_ROUTES.map((route) => route.path)).size, 9);
  assert.deepEqual(PRIVATE_POKER_DISCOVERY_SLUGS, ['saved', 'alerts']);
  assert.equal(isPokerDiscoveryRouteIndexable('venues'), true);
  assert.equal(isPokerDiscoveryRouteIndexable('saved'), false);
  assert.equal(isPokerDiscoveryRouteIndexable('alerts'), false);
  assert.match(page, /noindex=\{!isPokerDiscoveryRouteIndexable\(canonicalSlug\)\}/);
  assert.match(sitemap, /\.\.\.POKER_DISCOVERY_SITEMAP_ROUTES/);
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\/smarter\.poker\/sitemap\.xml/);
});

test('legacy and unknown discovery bookmarks converge on canonical routes', async () => {
  const page = await source('pages/hub/poker-near-me/[pnmTab].js');
  assert.match(page, /const canonicalSlug = normalizeRouteSlug\(requestedSlug\) \|\| 'venues'/);
  assert.match(page, /if \(requestedSlug !== canonicalSlug\)/);
  assert.match(page, /permanent: true/);
  assert.match(page, /if \(key === 'pnmTab'\) return/);
});

test('retired Poker Near Me raster variants stay out of the public payload', async () => {
  const retired = [
    'public/images/lobby-pods/poker-near-me-grid.jpg',
    'public/images/poker-near-me-hud-frame.jpg',
    'public/images/poker-near-me-hud-frame.png',
    'public/images/poker-near-me-hud-frame-clean.png',
  ];
  for (const path of retired) {
    await assert.rejects(access(new URL(path, root)));
  }
});
