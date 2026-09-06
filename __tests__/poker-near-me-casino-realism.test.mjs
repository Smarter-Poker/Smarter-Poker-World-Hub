import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = (path) => JSON.parse(read(path));

test('Poker Near Me shared navigation preserves stable discovery routes', () => {
  const nav = read('src/components/poker-near-me/PokerNearMeFamilyNav.jsx');
  [
    '/hub/poker-near-me/lobby',
    '/hub/poker-near-me/venues',
    '/hub/poker-near-me/live-games',
    '/hub/poker-near-me/map',
    '/hub/events-calendar',
    '/hub/poker-tours',
    '/hub/home-games',
    '/hub/poker-near-me/saved',
  ].forEach((route) => assert.match(nav, new RegExp(route.replaceAll('/', '\\/'))));
  assert.match(nav, /aria-current=\{active \? 'page'/);
  assert.match(nav, /aria-label="Poker Near Me"/);
});

test('all primary Poker Near Me page families render the shared navigation', () => {
  [
    'pages/hub/home-games.js',
    'pages/hub/poker-tours.js',
    'pages/hub/poker-series.js',
    'pages/hub/events-calendar.js',
    'pages/hub/daily-tournaments.js',
    'pages/hub/venues/[id].js',
  ].forEach((path) => {
    const page = read(path);
    assert.match(page, /PokerNearMeFamilyNav/);
    assert.match(page, /<PokerNearMeFamilyNav \/>/);
  });

  const dynamicFamily = read('pages/hub/poker-near-me/[pnmTab].js');
  assert.doesNotMatch(dynamicFamily, /PokerNearMeFamilyNav/);
  assert.match(dynamicFamily, /className="pnm-top-tabs"/);
});

test('casino realism theme covers the full route family and mobile audit target', () => {
  const provider = read('src/components/WorldThemeProvider.js');
  [
    '/hub/poker-near-me',
    '/hub/venues',
    '/hub/home-games',
    '/hub/poker-tours',
    '/hub/poker-series',
    '/hub/tours',
    '/hub/series',
    '/hub/events-calendar',
    '/hub/daily-tournaments',
  ].forEach((route) => assert.match(provider, new RegExp(route.replaceAll('/', '\\/'))));

  const theme = read('src/styles/worlds/poker-near-me.css');
  assert.match(theme, /--pnm-blue: #2fa8ff/);
  assert.match(theme, /--pnm-gold: #c8a45d/);
  // Mobile phase 3 moved the phone audit block from 700px to 768px: the
  // mobile standard allows exactly three boundaries (900 / 768 / 600) and
  // 700 was a fourth. The block itself (background position, family nav
  // padding, 44px controls, one-column grids) is unchanged.
  assert.match(theme, /@media \(max-width: 768px\)/);
  assert.doesNotMatch(theme, /@media \(max-width: 700px\)/);
  assert.match(theme, /overflow-x: hidden/);
  assert.match(theme, /min-height: 44px/);
});

test('public venue and home-game routes resolve to the Poker Near Me command world', () => {
  const registry = readJson('src/config/world-footer-navigation.json');
  const pokerNearMe = registry.worlds.find((world) => world.id === 'poker-near-me');
  const myClubs = registry.worlds.find((world) => world.id === 'my-clubs');

  assert.ok(pokerNearMe, 'Poker Near Me world must exist');
  assert.ok(myClubs, 'My Clubs world must exist');
  for (const prefix of ['/hub/poker-near-me', '/hub/venues', '/hub/home-games']) {
    assert.ok(
      pokerNearMe.routePrefixes.includes(prefix),
      `${prefix} must inherit the Poker Near Me command menu and footer`
    );
    assert.equal(
      myClubs.routePrefixes.includes(prefix),
      false,
      `${prefix} cannot have ambiguous command-world ownership`
    );
  }

  const allPrefixes = registry.worlds.flatMap((world) => world.routePrefixes);
  assert.equal(new Set(allPrefixes).size, allPrefixes.length, 'world route prefixes must be unique');
});

test('the project-bound cinematic environment asset is present and optimized', () => {
  const asset = new URL('../public/images/pnm-redesign/casino-command-map-v1.webp', import.meta.url);
  assert.equal(existsSync(asset), true);
  assert.ok(statSync(asset).size > 100_000, 'asset should retain enough detail for a cinematic hero');
  assert.ok(statSync(asset).size < 400_000, 'asset should stay within a practical web delivery budget');

  const canvas = read('src/components/poker-near-me/lobby/LobbyCanvas.jsx');
  assert.match(canvas, /casino-command-map-v1\.webp/);
});

test('Poker Near Me command surfaces keep continuous edges and full touch targets', () => {
  const style = read('src/styles/worlds/poker-near-me-machined.css');
  assert.match(
    style,
    /body\.world-poker-near-me \.sp-drawer::after,[\s\S]*?\.sp-world-command-trigger::after\s*\{[\s\S]*?content:\s*none !important;/
  );
  assert.match(
    style,
    /\.tours-search-clear, \.tour-fav-btn, \.tc-stepper button\)\s*\{[\s\S]*?width:\s*44px !important;[\s\S]*?min-width:\s*44px !important;[\s\S]*?height:\s*44px !important;[\s\S]*?min-height:\s*44px !important;/
  );
  assert.match(
    style,
    /\[data-pnm-secondary-foundation='interaction-v1'\] \.cmd-panel\s*\{[\s\S]*?border:\s*1px solid[\s\S]*?border-radius:\s*3px !important;/
  );
  assert.match(
    style,
    /\[data-pnm-secondary-foundation='interaction-v1'\] \.cmd-panel::before\s*\{[\s\S]*?content:\s*none !important;/
  );
  assert.match(style, /\.sort-results-label, \.results-showing, \.vc3-empty-state,[\s\S]*?color:\s*#8fa0b2 !important;/);
  assert.match(style, /\.pnm-tab-badge\s*\{[\s\S]*?background:\s*#b4232b !important;/);
  assert.match(style, /\.pnm-page \.primary-btn\s*\{[\s\S]*?background:\s*#12648c !important;/);
});

test('Home Games page CSS is hydration-stable', () => {
  const homeGames = read('pages/hub/home-games.js');
  assert.match(homeGames, /<style dangerouslySetInnerHTML=\{\{ __html: `/);
  assert.doesNotMatch(homeGames, /<style>\{`\s*\.hg-page\s*\{/);
});
