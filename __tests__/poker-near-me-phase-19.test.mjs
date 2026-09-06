import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import {
  buildLiveCashGameIndex,
  cashGameCountLabel,
  findLiveCashGameEntry,
  isModeledCashGameData,
} from '../src/lib/poker-near-me/liveCashGameData.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('every core Poker Near Me route root opts into the machined shared layer', async () => {
  const routes = await Promise.all([
    source('pages/hub/poker-near-me/lobby.js'),
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('src/components/poker-near-me/PokerNearMeLocationPage.jsx'),
    source('pages/hub/venues/[id].js'),
  ]);
  for (const route of routes) assert.match(route, /data-pnm-realism="machined-v2"/);

  const app = await source('pages/_app.js');
  assert.match(app, /poker-near-me-machined\.css/);
});
test('modeled cash games keep provenance through slug and name joins', () => {
  const payload = {
    metadata: { data_mode: 'estimated' },
    venues: [{
      venue_name: 'Bellagio Hotel & Casino',
      bravo_slug: 'pa-bellagio-las-vegas',
      is_simulated: true,
      data_mode: 'estimated',
      tables_running_total: 3,
      tables_running_observed: 0,
      tables_running_simulated: 3,
      games: [{ game: '1/3 NLH', tables_running: 3, players_waiting: 2, is_simulated: true }],
    }],
  };
  const index = buildLiveCashGameIndex(payload, 123);
  const bySlug = findLiveCashGameEntry({ pokeratlas_slug: 'bellagio-las-vegas' }, index);
  const byName = findLiveCashGameEntry({ name: 'Bellagio Hotel & Casino' }, index);
  assert.equal(bySlug, byName);
  assert.equal(bySlug.tables_running, 3);
  assert.equal(bySlug.players_waiting, 2);
  assert.equal(isModeledCashGameData(bySlug), true);
  assert.equal(cashGameCountLabel(bySlug), 'Approx. 3 Tables');
});

test('observed cash games are the only rows labeled live now', () => {
  const index = buildLiveCashGameIndex({
    metadata: { data_mode: 'live' },
    venues: [{
      venue_name: 'Observed Room',
      bravo_slug: 'observed-room',
      data_mode: 'live',
      tables_running_observed: 1,
      tables_running_simulated: 0,
      games: [{ game: '2/5 NLH', tables_running: 1, players_waiting: 0, is_simulated: false }],
    }],
  });
  const observed = findLiveCashGameEntry({ bravo_slug: 'observed-room' }, index);
  assert.equal(isModeledCashGameData(observed), false);
  assert.equal(cashGameCountLabel(observed), 'Live Now: 1 Table');
});

test('all card and popup consumers use the shared cash game adapter', async () => {
  const [discovery, lobby, location, card, compare, map] = await Promise.all([
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('pages/hub/poker-near-me/lobby.js'),
    source('src/components/poker-near-me/PokerNearMeLocationPage.jsx'),
    source('src/components/poker-near-me/VenueCard.js'),
    source('src/components/poker-near-me/VenueCompare.jsx'),
    source('src/components/poker-near-me/mapPresentation.js'),
  ]);
  for (const consumer of [discovery, lobby, location, compare]) {
    assert.match(consumer, /buildLiveCashGameIndex|findLiveCashGameEntry/);
  }
  assert.match(card, /cashGameCountLabel/);
  assert.match(card, /Modeled From Saved Cash-Game Data/);
  assert.doesNotMatch(card, /LIVE NOW: \{venue\.live_data\.tables_running\}/);
  assert.match(map, /cashGameCountLabel/);
  assert.match(map, /gameLabels\.join/);
  assert.doesNotMatch(map, /live table\$\{/);
});

test('simulator converts zero-only catalog history into honest publishable estimates', async () => {
  const simulator = await source('scripts/bravo-simulator-daemon.py');
  assert.match(simulator, /catalog_only = stat_source == 'pokeratlas' and max_t <= 0/);
  assert.match(simulator, /baseline = 1\.0/);
  assert.match(simulator, /max_t = 2/);
  assert.match(simulator, /MIN_GENERATABLE_VENUES/);
  assert.match(simulator, /f"pa-\{row\['pokeratlas_slug'\]\}"/);
  assert.match(simulator, /'scrape_batch_id':  batch_id/);
  assert.match(simulator, /'data_quality':     sim_data_quality\(\)/);
});

test('machined map artwork and control geometry stay optimized and continuous', async () => {
  const asset = new URL('../public/images/pnm-redesign/map-command-render-v2.webp', import.meta.url);
  const info = await stat(asset);
  assert.ok(info.size > 100_000, 'render should retain cinematic detail');
  assert.ok(info.size < 250_000, 'render should stay within the map loading budget');

  const [style, map, panel] = await Promise.all([
    source('src/styles/worlds/poker-near-me-machined.css'),
    source('src/components/poker-near-me/mapPresentation.js'),
    source('src/components/poker-near-me/MapTabPanel.jsx'),
  ]);
  assert.match(style, /map-command-render-v2\.webp/);
  assert.match(style, /\.sp-drawer[\s\S]*?clip-path: none !important/);
  assert.match(style, /\[style\*='border-radius'\]/);
  assert.match(map, /border-radius:3px/);
  assert.match(map, /#48c7ff/);
  assert.match(panel, /className="pnm-map-radius-control"/);
  assert.match(panel, /aria-label="Map search radius"/);
});
