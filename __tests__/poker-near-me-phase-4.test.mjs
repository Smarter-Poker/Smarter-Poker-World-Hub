import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('phase 4 location route hierarchy is present and server-backed', () => {
  const routes = [
    'pages/hub/poker-near-me/in/index.js',
    'pages/hub/poker-near-me/in/[state]/index.js',
    'pages/hub/poker-near-me/in/[state]/[city].js',
  ];
  routes.forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), file));
  const helper = read('src/lib/poker-near-me/locationPages.js');
  assert.match(helper, /fetchVenueDirectoryResilient/);
  assert.match(helper, /directorySnapshotData/);
  assert.match(helper, /stateSlugToCode/);
  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /buildPokerVenueUrls/);
  assert.match(sitemap, /venue_type/);
  assert.match(sitemap, /\['series', 'tour', 'home_game'\]\.includes\(venue\.venue_type\)/);
});

test('venue, home game, and dashboard inherit the shared signal chassis', () => {
  for (const file of [
    'pages/hub/venues/[id].js',
    'pages/hub/home-games/[slug].js',
    'pages/hub/home-games/[slug]/dashboard.js',
  ]) {
    const source = read(file);
    assert.match(source, /DeepRouteSignalDeck/);
    assert.match(source, /PokerNearMeFamilyNav/);
  }
  const dashboard = read('pages/hub/home-games/[slug]/dashboard.js');
  assert.match(dashboard, /role="tablist"/);
  assert.match(dashboard, /role="tabpanel"/);
  assert.match(dashboard, /ArrowRight/);
  assert.match(dashboard, /noindex, nofollow/);
});

test('recent-place personalization stays on-device and excludes precise location', () => {
  const activity = read('src/lib/poker-near-me/activity.js');
  assert.match(activity, /localStorage/);
  assert.doesNotMatch(activity, /latitude|longitude|\blat\b|\blng\b/);
  assert.match(read('src/components/poker-near-me/PokerNearMeRecentRail.jsx'), /Private on this device/);
});

test('map surfaces expose keyboard and assistive-technology contracts', () => {
  for (const file of [
    'src/components/poker-near-me/VenueMap.jsx',
    'src/components/poker-near-me/VenueMapPanel.jsx',
  ]) {
    const source = read(file);
    assert.match(source, /keyboard: true/);
    assert.match(source, /tabIndex=\{0\}/);
    assert.match(source, /aria-label=/);
  }
});

test('cinematic assets are optimized and constrained-device rendering is adaptive', () => {
  const assets = [
    'public/images/pnm-phase-4/venue-signal-fallback-v1.webp',
    'public/images/pnm-phase-4/location-command-grid-v1.webp',
  ];
  assets.forEach((file) => {
    const stat = fs.statSync(path.join(root, file));
    assert.ok(stat.size < 350_000, `${file} is ${stat.size} bytes`);
  });
  const canvas = read('src/components/poker-near-me/lobby/LobbyCanvas.jsx');
  assert.match(canvas, /saveData/);
  assert.match(canvas, /deviceMemory/);
  assert.match(canvas, /prefers-reduced-motion/);
  assert.match(canvas, /data-render-mode/);
});

test('dynamic status and freshness remain semantic HTML rather than image text', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  assert.match(deck, /role="status"/);
  assert.match(deck, /<time dateTime=/);
  assert.match(deck, /<dl className="pnm-deep-deck__metrics">/);
  assert.match(deck, /fetchpriority/);
});
