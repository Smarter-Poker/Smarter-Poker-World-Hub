import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import {
  buildLiveCashGameIndex,
  buildVenueDirectoryIdentityIndex,
  cashGameCountLabel,
  findLiveCashGameEntry,
  findVenueDirectoryEntry,
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
test('modeled cash games keep provenance through slug, alias, and normalized-core joins', () => {
  const payload = {
    metadata: { data_mode: 'estimated' },
    venues: [
      {
        venue_name: 'Bellagio Hotel & Casino',
        bravo_slug: 'pa-bellagio-poker-room-las-vegas',
        is_simulated: true,
        data_mode: 'estimated',
        tables_running_total: 3,
        tables_running_observed: 0,
        tables_running_simulated: 3,
        games: [{ game: '1/3 NLH', tables_running: 3, players_waiting: 2, is_simulated: true }],
      },
      {
        venue_name: 'Borgata Hotel Casino & Spa',
        bravo_slug: 'pa-borgata-hotel-casino-atlantic-city',
        is_simulated: true,
        data_mode: 'estimated',
        tables_running_total: 4,
        games: [{ game: '2/5 NLH', tables_running: 4, players_waiting: 1, is_simulated: true }],
      },
      {
        venue_name: 'Lodge Card Club Austin',
        bravo_slug: 'the-lodge-card-club',
        is_simulated: true,
        data_mode: 'estimated',
        tables_running_total: 5,
        games: [{ game: '1/2 NLH', tables_running: 5, players_waiting: 0, is_simulated: true }],
      },
    ],
  };
  const index = buildLiveCashGameIndex(payload, 123);
  const bySlug = findLiveCashGameEntry({ pokeratlas_slug: 'bellagio-poker-room-las-vegas' }, index);
  const byName = findLiveCashGameEntry({ name: 'Bellagio Poker Room' }, index);
  assert.equal(bySlug, byName);
  assert.equal(bySlug.tables_running, 3);
  assert.equal(bySlug.players_waiting, 2);
  assert.equal(isModeledCashGameData(bySlug), true);
  assert.equal(cashGameCountLabel(bySlug), 'Approx. 3 Tables');
  assert.equal(findLiveCashGameEntry({ name: 'Borgata Hotel Casino' }, index)?.tables_running, 4);
  assert.equal(findLiveCashGameEntry({ name: 'Lodge Poker Club' }, index)?.tables_running, 5);
});

test('normalized-core joins fail closed when two feed venues are ambiguous', () => {
  const index = buildLiveCashGameIndex({
    venues: [
      { venue_name: 'Signal Poker Room', bravo_slug: 'signal-east', games: [] },
      { venue_name: 'Signal Card Club', bravo_slug: 'signal-west', games: [] },
    ],
  });
  assert.equal(findLiveCashGameEntry({ name: 'Signal Casino' }, index), null);
  assert.ok(findLiveCashGameEntry({ bravo_slug: 'signal-east' }, index));
  assert.ok(findLiveCashGameEntry({ bravo_slug: 'signal-west' }, index));
});

test('live feed parent joins share the same deterministic aliases and fail closed', () => {
  const directoryIndex = buildVenueDirectoryIdentityIndex([
    { id: 1, name: 'Bellagio Poker Room', pokeratlas_slug: 'bellagio-poker-room-las-vegas' },
    { id: 2, name: 'Borgata Hotel Casino' },
    { id: 3, name: 'Lodge Poker Club' },
    { id: 4, name: 'Signal Poker Room' },
    { id: 5, name: 'Signal Card Club' },
  ]);
  assert.equal(findVenueDirectoryEntry({ bravo_slug: 'pa-bellagio-poker-room-las-vegas' }, directoryIndex)?.id, 1);
  assert.equal(findVenueDirectoryEntry({ venue_name: 'Borgata Hotel Casino & Spa' }, directoryIndex)?.id, 2);
  assert.equal(findVenueDirectoryEntry({ venue_name: 'Lodge Card Club Austin' }, directoryIndex)?.id, 3);
  assert.equal(findVenueDirectoryEntry({ venue_name: 'Signal Casino' }, directoryIndex), null);
});

test('both live APIs import the one shared matcher implementation', async () => {
  const [dedup, liveTables] = await Promise.all([
    source('pages/api/poker/venue-dedup.js'),
    source('pages/api/poker/live-tables.js'),
  ]);
  for (const api of [dedup, liveTables]) {
    assert.match(api, /from ['"]\.\.\/\.\.\/\.\.\/src\/lib\/poker-near-me\/venueMatching['"]/);
    assert.doesNotMatch(api, /function normalizeForMatch/);
  }
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

test('legacy none mode cannot erase modeled zero-table evidence', () => {
  const index = buildLiveCashGameIndex({
    venues: [{
      venue_name: 'Quiet Modeled Room',
      bravo_slug: 'quiet-modeled-room',
      data_mode: 'none',
      is_simulated: true,
      tables_running_total: 0,
      games: [{
        game: '1/2 NLH',
        tables_running: 0,
        players_waiting: 0,
        is_simulated: true,
      }],
    }],
  });
  const modeled = findLiveCashGameEntry({ bravo_slug: 'quiet-modeled-room' }, index);
  assert.equal(modeled.data_mode, 'estimated');
  assert.equal(modeled.live_count_known, true);
  assert.equal(cashGameCountLabel(modeled), 'Approx. 0 Tables');
});

test('all card and popup consumers use the shared cash game adapter', async () => {
  const [discovery, lobby, location, card, compare, map, liveFeed] = await Promise.all([
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('pages/hub/poker-near-me/lobby.js'),
    source('src/components/poker-near-me/PokerNearMeLocationPage.jsx'),
    source('src/components/poker-near-me/VenueCard.js'),
    source('src/components/poker-near-me/VenueCompare.jsx'),
    source('src/components/poker-near-me/mapPresentation.js'),
    source('src/components/poker-near-me/LiveGamesFeed.jsx'),
  ]);
  for (const consumer of [discovery, lobby, location, compare]) {
    assert.match(consumer, /buildLiveCashGameIndex|findLiveCashGameEntry/);
  }
  assert.match(discovery, /const liveEntry = findLiveCashGameEntry\(venue, liveDataMapRef\.current\)/);
  assert.doesNotMatch(discovery, /liveDataMapRef\.current\[normName\]/);
  assert.match(card, /cashGameCountLabel/);
  assert.match(card, /Modeled From Saved Cash-Game Data/);
  assert.doesNotMatch(card, /LIVE NOW: \{venue\.live_data\.tables_running\}/);
  assert.match(map, /cashGameCountLabel/);
  assert.match(map, /gameLabels\.join/);
  assert.doesNotMatch(map, /live table\$\{/);
  assert.match(liveFeed, /buildLiveCashGameEntry/);
  assert.match(liveFeed, /buildVenueDirectoryIdentityIndex/);
  assert.match(liveFeed, /findVenueDirectoryEntry/);
  assert.doesNotMatch(liveFeed, /getSignificantWords|bestScore|word-overlap/);

  const venueDetail = await source('pages/hub/venues/[id].js');
  assert.match(venueDetail, /buildLiveCashGameIndex/);
  assert.match(venueDetail, /findLiveCashGameEntry\(venue, buildLiveCashGameIndex\(json\)\)/);
  assert.match(venueDetail, /normalizeVenueName\(venue\.name\)/);
  assert.match(venueDetail, /live-tables\?venue=/);
  assert.match(venueDetail, /'bravo_slug', 'pokeratlas_slug'/);
  assert.doesNotMatch(venueDetail, /bName\.includes\(venueLower\)/);
  assert.doesNotMatch(venueDetail, /json\.venues\.length === 1/);
});

test('simulator publishes only sufficiently sampled observed Bravo history', async () => {
  const simulator = await source('scripts/bravo-simulator-daemon.py');
  assert.match(simulator, /qualified = is_observed_bravo_row\(r\)/);
  assert.match(simulator, /bravo_records = \[r for r in records if r\['qualified'\]\]/);
  assert.match(simulator, /if not bravo_records:[\s\S]*?continue/);
  assert.match(simulator, /len\(samples\) < MIN_CONTEXT_OBSERVATIONS/);
  assert.match(simulator, /len\(distinct_dates\) < MIN_CONTEXT_DAYS/);
  assert.match(simulator, /no_qualified_observed_bravo_history/);
  assert.match(simulator, /retire_unqualified_simulator_rows\(\)/);
  assert.doesNotMatch(simulator, /catalog_only = stat_source == 'pokeratlas'/);
  assert.doesNotMatch(simulator, /baseline = 1\.0/);
  assert.match(simulator, /'scrape_batch_id':  batch_id/);
  assert.match(simulator, /'data_quality':     sim_data_quality\(\)/);
  assert.match(simulator, /'observation_kind': OBSERVATION_MODELED/);
});

test('simulator rejects scraped navigation labels before they become venues', async () => {
  const simulator = await source('scripts/bravo-simulator-daemon.py');
  assert.match(simulator, /def _is_noise_venue\(venue_name: str, venue_slug: str = ''\)/);
  assert.match(simulator, /'view live info'/);
  assert.match(simulator, /'wait list registration'/);
  assert.match(simulator, /if not name or _is_noise_venue\(name\):/);
  assert.match(simulator, /venue_type not in PHYSICAL_DIRECTORY_VENUE_TYPES/);
});

test('painted map artwork and control geometry stay optimized and continuous', async () => {
  const asset = new URL('../public/images/pnm-redesign/map-command-render-v2.webp', import.meta.url);
  const info = await stat(asset);
  assert.ok(info.size > 100_000, 'render should retain cinematic detail');
  assert.ok(info.size < 250_000, 'render should stay within the map loading budget');

  const [style, paintedStyle, map, frame, panel] = await Promise.all([
    source('src/styles/worlds/poker-near-me-machined.css'),
    source('src/styles/worlds/poker-near-me-console-map.css'),
    source('src/components/poker-near-me/mapPresentation.js'),
    source('src/components/poker-near-me/MapSurfaceFrame.jsx'),
    source('src/components/poker-near-me/MapTabPanel.jsx'),
  ]);
  assert.match(style, /map-command-render-v2\.webp/);
  assert.match(style, /\.sp-drawer[\s\S]*?clip-path: none !important/);
  assert.match(style, /\[style\*='border-radius'\]/);
  assert.match(paintedStyle, /painted-chassis-v1\/top-flat\.png/);
  assert.match(paintedStyle, /painted-chassis-v1\/mid\.png/);
  assert.match(paintedStyle, /painted-chassis-v1\/bottom-foot\.png/);
  assert.match(paintedStyle, /painted-controls-v1\/utility-well\.png/);
  assert.match(paintedStyle, /min-height:\s*44px/);
  assert.match(map, /pnm-painted-marker/);
  assert.match(map, /pnm-painted-cluster/);
  assert.doesNotMatch(map, /border-radius:3px|linear-gradient|<svg width="40"/);
  assert.match(map, /#48c7ff/);
  assert.match(frame, /data-pnm-map-console="painted-chassis-v1"/);
  assert.match(frame, /PokerNearMeConsoleIcon/);
  assert.equal((frame.match(/\{children\}/g) || []).length, 1);
  assert.match(panel, /className="pnm-map-radius-control"/);
  assert.match(panel, /aria-label="Map search radius"/);
});
