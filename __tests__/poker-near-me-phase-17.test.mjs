import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('discovery navigation distinguishes user history from filter synchronization', async () => {
  const page = await source('pages/hub/poker-near-me/[pnmTab].js');

  assert.match(page, /const pushDiscoverySurface = \(nextState\) =>/);
  assert.match(page, /window\.history\.pushState\(/);
  assert.match(page, /window\.history\.replaceState\(/);
  assert.match(page, /options: \{ \.\.\.window\.history\.state\?\.options, shallow: true, scroll: false \}/);
  assert.match(page, /`\$\{window\.location\.pathname\}\$\{window\.location\.search\}`/);
  assert.match(page, /window\.addEventListener\('popstate', restoreDiscoveryState\)/);
  assert.match(page, /window\.removeEventListener\('popstate', restoreDiscoveryState\)/);
  assert.match(page, /window\.addEventListener\('pagehide', markExiting\)/);
  assert.match(page, /if \(discoveryPageExitingRef\.current\) return/);
  assert.doesNotMatch(page, /const currentUrl = router\.asPath/);
});

test('restored routes remain explicit to assistive technology', async () => {
  const [page, world] = await Promise.all([
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('src/styles/worlds/poker-near-me.css'),
  ]);

  assert.match(
    page,
    /className="pnm-route-announcer" role="status" aria-live="polite" aria-atomic="true"/
  );
  assert.match(page, /Showing \{routeMeta\.breadcrumb\}/);
  assert.match(world, /\.pnm-route-announcer\s*\{[\s\S]*?clip-path:\s*inset\(50%\)/);
});

test('shared Poker Near Me world supports WebKit masks and user contrast preferences', async () => {
  const world = await source('src/styles/worlds/poker-near-me.css');

  assert.match(world, /-webkit-mask-image:\s*linear-gradient\(to bottom/);
  assert.match(world, /-webkit-mask-image:\s*linear-gradient\(90deg/);
  assert.match(world, /@media \(prefers-contrast: more\)/);
  assert.match(world, /@media \(forced-colors: active\)/);
  assert.match(world, /outline:\s*3px solid Highlight !important/);
  assert.match(world, /\[aria-selected='true'\][\s\S]*?background:\s*Highlight !important/);
  assert.match(world, /@media \(prefers-reduced-motion: reduce\)/);
});

test('mobile command controls use continuous contained frames', async () => {
  const [header, menu, navigation, world] = await Promise.all([
    source('src/components/ui/UniversalHeader.js'),
    source('src/components/ui/HamburgerMenu.jsx'),
    source('src/config/worldMenuNavigation.js'),
    source('src/styles/worlds/poker-near-me.css'),
  ]);

  // The approved chrome deliberately replaced the old rectangular cyan
  // pseudo-element with a soft, edge-free glow. Preserve keyboard visibility
  // without reintroducing a box over the baked header artwork.
  assert.match(
    header,
    /\.approved-global-header__button:focus,\s*\.approved-global-header__button:focus-visible\s*\{[\s\S]*?outline:\s*none;[\s\S]*?box-shadow:\s*none;/
  );
  assert.match(
    header,
    /\.approved-global-header__button:focus-visible\s*\{[\s\S]*?background:\s*radial-gradient\(/
  );
  assert.doesNotMatch(
    header,
    /\.approved-global-header__button:focus-visible::(?:before|after)\s*\{[\s\S]*?border:/
  );
  assert.match(world, /:where\(:not\([\s\S]*?\.approved-global-header__button[\s\S]*?\.sp-grid-tile/);
  assert.match(navigation, /'poker-near-me':[\s\S]*?scheme:\s*'casino-realism'[\s\S]*?accent:\s*'#38bdf8'/);
  assert.match(menu, /data-world-command-menu='poker-near-me'[\s\S]*?border-style:\s*solid !important/);
  assert.match(menu, /data-world-command-menu='poker-near-me'[\s\S]*?\.sp-grid-tile::after\s*\{[\s\S]*?content:\s*none/);
  assert.match(menu, /border-color:\s*#48c7ff !important/);
  assert.doesNotMatch(menu, /data-world-command-menu='poker-near-me'[^}]*clip-path/);
});

test('Phase 5 stays on the shared route family instead of forking handlers or data', async () => {
  const routes = await Promise.all([
    source('pages/hub/poker-near-me/lobby.js'),
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('pages/hub/poker-near-me/in/index.js'),
    source('pages/hub/poker-near-me/in/[state]/index.js'),
    source('pages/hub/poker-near-me/in/[state]/[city].js'),
    source('pages/hub/venues/[id].js'),
    source('pages/hub/home-games.js'),
    source('pages/hub/home-games/near-me.js'),
    source('pages/hub/poker-series.js'),
    source('pages/hub/events-calendar.js'),
    source('pages/hub/series/[id].js'),
    source('pages/hub/tours/[code].js'),
  ]);

  assert.equal(routes.length, 12);
  for (const route of routes) {
    assert.match(route, /PokerNearMe|poker-near-me|pnm-|world-poker-near-me/i);
  }
});
