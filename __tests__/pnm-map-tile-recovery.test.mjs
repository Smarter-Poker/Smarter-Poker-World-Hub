import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const revision = process.env.PNM_MAP_TILE_SOURCE_REV;
const read = (path) => revision ? execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' }) : readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { createPokerMapSession } = await import(`data:text/javascript;base64,${Buffer.from(read('src/lib/poker-near-me/mapRuntime.js')).toString('base64')}`);

function fixture(options = {}) {
  const layers = [];
  const states = [];
  const container = { dataset: {} };
  const map = { offCalls: 0, removeCalls: 0, off() { this.offCalls++; }, remove() { this.removeCalls++; }, createPane() { return { style: {} }; } };
  const L = {
    map: () => map,
    tileLayer(url) {
      const handlers = new Map();
      const layer = {
        url, handlers, redraws: 0,
        on(event, handler) { handlers.set(event, handler); return this; },
        off(event, handler) { if (handlers.get(event) === handler) handlers.delete(event); return this; },
        emit(event, data = {}) { handlers.get(event)?.(data); },
        addTo() { return this; },
        redraw() { this.redraws++; this.emit('loading'); return this; },
      };
      layers.push(layer);
      return layer;
    },
    control: { attribution: () => ({ addAttribution() { return this; }, addTo() { return this; } }) },
  };
  const session = createPokerMapSession({ L, container, onTileStatus: (state) => states.push(state), ...options });
  return { session, layers, states, container, map };
}
const tile = (layer, failed = false) => {
  const image = {};
  layer.emit('tileloadstart', { tile: image });
  layer.emit(failed ? 'tileerror' : 'tileload', { tile: image });
  return image;
};

test('actual session reports total tile failure and explicit redraw recovers without rebuilding the map', () => {
  const { session, layers: [layer], states, container, map } = fixture();
  assert.equal(container.dataset.mapTiles, 'loading');
  tile(layer, true);
  layer.emit('load');
  assert.deepEqual(states.at(-1), { status: 'unavailable', loaded: 0, failed: 1 });
  session.retryTiles();
  assert.equal(layer.redraws, 1);
  assert.equal(container.dataset.mapTiles, 'loading');
  tile(layer);
  layer.emit('load');
  assert.deepEqual(states.at(-1), { status: 'ready', loaded: 1, failed: 0 });
  assert.equal(session.map, map);
  assert.equal(map.removeCalls, 0);
  session.destroy();
});

test('reference-layer failure remains degraded even when base imagery succeeds', () => {
  const { session, layers, container } = fixture({ tileStyle: 'dark_all' });
  tile(layers[0]); layers[0].emit('load');
  assert.equal(container.dataset.mapTiles, 'loading');
  tile(layers[1], true); layers[1].emit('load');
  assert.equal(container.dataset.mapTiles, 'degraded');
  session.retryTiles();
  assert.deepEqual(layers.map((layer) => layer.redraws), [1, 1]);
  for (const layer of layers) { tile(layer); layer.emit('load'); }
  assert.equal(container.dataset.mapTiles, 'ready');
  session.destroy();
});

test('old and duplicate image events cannot certify or poison the retry batch', () => {
  const { session, layers: [layer], container, states } = fixture();
  const stale = {};
  layer.emit('tileloadstart', { tile: stale });
  session.retryTiles();
  layer.emit('tileload', { tile: stale });
  layer.emit('tileerror', { tile: stale });
  layer.emit('load');
  assert.equal(container.dataset.mapTiles, 'loading');
  const current = tile(layer);
  layer.emit('tileerror', { tile: current });
  layer.emit('load');
  assert.deepEqual(states.at(-1), { status: 'ready', loaded: 1, failed: 0 });
  session.destroy();
});

test('destroy detaches observers and captured late handlers cannot update the consumer', () => {
  const { session, layers: [layer], states, map } = fixture();
  const late = layer.handlers.get('tileerror');
  const image = {};
  layer.emit('tileloadstart', { tile: image });
  session.destroy(); session.destroy();
  const count = states.length;
  late?.({ tile: image });
  session.retryTiles?.();
  assert.equal(states.length, count);
  assert.equal(layer.handlers.size, 0);
  assert.equal(layer.redraws, 0);
  assert.equal(map.removeCalls, 1);
});

test('tile observation is backward compatible with consumers that omit the optional callback', () => {
  const { session, layers: [layer], container } = fixture({ onTileStatus: undefined });
  tile(layer); layer.emit('load');
  assert.equal(container.dataset.mapTiles, 'ready');
  assert.doesNotThrow(() => session.destroy());
});

test('all five actual map consumers wire guarded tile status and painted retry plus public list', () => {
  const paths = [
    'src/components/poker-near-me/VenueMapPanel.jsx',
    'src/components/poker-near-me/VenueMap.jsx',
    'src/components/poker-near-me/RoadTripPlanner.jsx',
    'pages/hub/venues/[id].js',
    'src/components/maps/LeafletLocationPicker.jsx',
  ];
  for (const path of paths) {
    const source = read(path);
    assert.match(source, /onTileStatus:\s*\(\{\s*status\s*\}\)\s*=>\s*\{\s*if\s*\((?:mountedRef\.current|sessionActive|!cancelled)\)\s*setTileStatus\(status\)/, path);
    assert.match(source, /(?:tileStatus === 'degraded' \|\| tileStatus === 'unavailable'|\['degraded', 'unavailable'\]\.includes\(tileStatus\))/, path);
    assert.match(source, /<PokerNearMePanelShell[^>]*className="pnm-map-tile-warning"[^>]*data-map-tile-warning="true"/s, path);
    assert.match(source, /data-map-tile-retry="true"[^>]*onClick=\{\(\) => mapSessionRef\.current\?\.retryTiles\(\)\}/, path);
    assert.match(source, /data-map-tile-list="true"\s+href="\/hub\/poker-near-me\/venues"/, path);
  }
});
