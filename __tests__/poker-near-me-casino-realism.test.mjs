import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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
  assert.match(theme, /@media \(max-width: 700px\)/);
  assert.match(theme, /overflow-x: hidden/);
  assert.match(theme, /min-height: 44px/);
});

test('the project-bound cinematic environment asset is present and optimized', () => {
  const asset = new URL('../public/images/pnm-redesign/casino-command-map-v1.webp', import.meta.url);
  assert.equal(existsSync(asset), true);
  assert.ok(statSync(asset).size > 100_000, 'asset should retain enough detail for a cinematic hero');
  assert.ok(statSync(asset).size < 400_000, 'asset should stay within a practical web delivery budget');

  const canvas = read('src/components/poker-near-me/lobby/LobbyCanvas.jsx');
  assert.match(canvas, /casino-command-map-v1\.webp/);
});
