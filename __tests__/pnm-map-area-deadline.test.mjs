import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { appendPokerMapBounds, isVenueWithinPokerMapBounds } from '../src/lib/poker-near-me/mapBounds.js';
const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const path = 'src/components/poker-near-me/VenueMapPanel.jsx';
const source = process.env.PNM_MAP_AREA_SOURCE_REV
  ? execFileSync('git', ['show', `${process.env.PNM_MAP_AREA_SOURCE_REV}:${path}`], { encoding: 'utf8' })
  : fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const callbacks = source.slice(source.indexOf('  async function searchCurrentMapArea()'), source.indexOf('  return (', source.indexOf('  function resetMapArea()')));
const resetEffect = source.slice(source.indexOf('  useEffect(() => {\n    viewportAbortRef.current?.abort();'), source.indexOf('  // Keep callback ref current'));
const cleanupStart = source.indexOf('      mountedRef.current = false;');
const cleanup = source.slice(cleanupStart, source.indexOf('      const container', cleanupStart));
const room = { id: 1, name: 'Existing Room', latitude: 39, longitude: -119 };
function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
function clock() {
  let now = 0; let next = 0; const timers = new Map();
  return { timers, setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: (id) => timers.delete(id),
    tick: (ms) => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } } };
}
async function mount(fetcher, baseVenues = [room]) {
  const time = clock(); const events = []; const requests = []; const updates = []; let api; let state; let tree;
  function Fixture({ revision = 0 }) {
    const [viewportVenues, realSetVenues] = React.useState(null);
    const [areaSearchBusy, setAreaSearchBusy] = React.useState(false);
    const [areaSearchError, setAreaSearchError] = React.useState('');
    const [areaSearchAvailable, setAreaSearchAvailable] = React.useState(true);
    const viewportAbortRef = React.useRef(null); const mountedRef = React.useRef(true);
    const scope = { mountedRef, viewportAbortRef, viewportBoundsRef: { current: { north: 40, south: 38, east: -118, west: -120 } },
      baseVenuesRef: { current: baseVenues }, mapInstanceRef: { current: { getZoom: () => 10 } }, fittedGeoSignatureRef: { current: null },
      enableViewportSearch: true, areaSearchBusy, viewportState: 'NV', baseGeoSignature: String(revision), radiusMiles: 50, userLocation: null,
      setAreaSearchBusy, setAreaSearchError, setAreaSearchAvailable, setViewportVenues: (rows) => { updates.push(rows); realSetVenues(rows); },
      appendPokerMapBounds, isVenueWithinPokerMapBounds,
      summarizeVenueIntegrity: (rows) => ({ verified: rows.length, approximate: 0, held: 0 }), clusteringAvailable: true,
      capturePokerNearMeEvent: (...value) => events.push(value), fetch: (url, options) => { requests.push({ url, options }); return fetcher(url, options); },
      AbortController, URLSearchParams, window: { location: { pathname: '/hub/poker-near-me/map' } },
      setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, useEffect: React.useEffect };
    const names = Object.keys(scope);
    api = new Function(...names, `${resetEffect}\n${callbacks}\nreturn { search: searchCurrentMapArea, reset: resetMapArea };`)(...names.map((key) => scope[key]));
    React.useEffect(() => () => { new Function('mountedRef', 'viewportAbortRef', cleanup)(mountedRef, viewportAbortRef); }, []);
    state = { busy: areaSearchBusy, error: areaSearchError, available: areaSearchAvailable, venues: viewportVenues || baseVenues };
    return null;
  }
  await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
  return { time, events, requests, updates, get state() { return state; }, search: () => api.search(), reset: () => api.reset(),
    change: async () => renderer.act(async () => tree.update(React.createElement(Fixture, { revision: 1 }))),
    close: async () => renderer.act(async () => tree.unmount()) };
}

test('actual map area callback settles an abort-insensitive fetch at the total 30-second deadline and permits retry', async () => {
  let attempt = 0; const late = deferred();
  const env = await mount(() => ++attempt === 1 ? late.promise : Promise.resolve({ ok: true, json: async () => ({ success: true, data: [{ ...room, id: 2 }] }) }));
  try {
    let settled = false; await renderer.act(async () => { void env.search().then(() => { settled = true; }); });
    await renderer.act(async () => env.time.tick(29999)); assert.equal(env.state.busy, true); assert.equal(settled, false);
    await renderer.act(async () => env.time.tick(1));
    assert.equal(settled, true); assert.equal(env.state.busy, false); assert.match(env.state.error, /timed out/i);
    assert.deepEqual(env.state.venues, [room]); assert.equal(env.requests[0].options.signal.aborted, true); assert.equal(env.time.timers.size, 0);
    await renderer.act(async () => env.search()); assert.equal(env.state.venues[0].id, 2); assert.equal(env.state.error, '');
    const count = env.updates.length;
    await renderer.act(async () => late.resolve({ ok: true, json: async () => ({ success: true, data: [{ ...room, id: 99 }] }) }));
    assert.equal(env.updates.length, count); assert.equal(env.events.length, 1);
  } finally { await env.close(); }
});

test('actual map deadline includes a stalled response body and ignores its late payload', async () => {
  const body = deferred(); const env = await mount(async () => ({ ok: true, json: () => body.promise }));
  try {
    let settled = false; await renderer.act(async () => { void env.search().then(() => { settled = true; }); });
    await renderer.act(async () => env.time.tick(30000)); assert.equal(settled, true); assert.equal(env.state.busy, false); assert.match(env.state.error, /timed out/i);
    const count = env.updates.length; await renderer.act(async () => body.resolve({ success: true, data: [{ ...room, id: 99 }] }));
    assert.equal(env.updates.length, count); assert.deepEqual(env.state.venues, [room]); assert.equal(env.events.length, 0); assert.equal(env.time.timers.size, 0);
  } finally { await env.close(); }
});

test('actual reset revokes and settles the old request without unlocking its replacement', async () => {
  const old = deferred(); const current = deferred(); let attempt = 0; const env = await mount(() => ++attempt === 1 ? old.promise : current.promise);
  try {
    let oldSettled = false; await renderer.act(async () => { void env.search().then(() => { oldSettled = true; }); });
    await renderer.act(async () => env.reset()); assert.equal(oldSettled, true); assert.equal(env.time.timers.size, 0);
    await renderer.act(async () => { void env.search(); }); assert.equal(env.state.busy, true);
    await renderer.act(async () => old.resolve({ ok: true, json: async () => ({ success: true, data: [{ ...room, id: 99 }] }) }));
    assert.equal(env.state.busy, true); assert.deepEqual(env.state.venues, [room]);
    await renderer.act(async () => current.resolve({ ok: true, json: async () => ({ success: true, data: [room] }) }));
    assert.equal(env.state.busy, false); assert.equal(env.time.timers.size, 0);
  } finally { await env.close(); }
});

test('actual changed-filter and unmount cleanup settle requests and remove their deadlines', async () => {
  const env = await mount(() => new Promise(() => {})); let settled = 0;
  await renderer.act(async () => { void env.search().then(() => { settled++; }); });
  await env.change(); assert.equal(settled, 1); assert.equal(env.time.timers.size, 0); assert.equal(env.state.error, '');
  await renderer.act(async () => { void env.search().then(() => { settled++; }); });
  await env.close(); assert.equal(settled, 2); assert.equal(env.time.timers.size, 0);
});

test('actual map area success retains bounded tour pins and public provenance with no deadline leak', async () => {
  const tour = { ...room, id: 3, name: 'Public Tour Stop', venue_type: 'tour_stop' };
  const outsideTour = { ...tour, id: 4, latitude: 42 };
  const env = await mount(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [room, room] }) }), [room, tour, outsideTour]);
  try {
    await renderer.act(async () => env.search()); assert.deepEqual(env.state.venues, [room, tour]); assert.equal(env.state.busy, false); assert.equal(env.time.timers.size, 0);
    assert.equal(env.events[0][0], 'map_area_searched'); assert.equal(env.events[0][1].source, 'viewport_api'); assert.equal(env.events[0][1].verified_count, 2);
    const params = new URL(env.requests[0].url, 'https://smarter.poker').searchParams; assert.equal(params.get('state'), 'NV'); assert.equal(params.get('north'), '40');
  } finally { await env.close(); }
});

test('actual failed area response preserves markers and removes its timer without claiming success', async () => {
  const env = await mount(async () => ({ ok: false, status: 503, json: async () => ({ success: false, error: 'Provider unavailable' }) }));
  try {
    await renderer.act(async () => env.search()); assert.equal(env.state.busy, false); assert.match(env.state.error, /unavailable/i);
    assert.deepEqual(env.state.venues, [room]); assert.equal(env.events.length, 0); assert.equal(env.time.timers.size, 0);
  } finally { await env.close(); }
});

test('actual degraded area fallback keeps established markers and offers retry rather than claiming a fresh scan', async () => {
  let attempt = 0;
  const env = await mount(async () => ({ ok: true, status: 200, json: async () => ++attempt === 1
    ? { success: true, degraded: true, data: [{ ...room, id: 99 }], home_groups: [], total: 1, total_home_groups: 0, hasGpsData: false, viewport: { north: 40, south: 38, east: -118, west: -120 }, data_integrity: {} }
    : { success: true, data: [{ ...room, id: 2 }] } }));
  try {
    await renderer.act(async () => env.search());
    assert.deepEqual(env.state.venues, [room], 'Degraded fallback cannot replace the established map');
    assert.match(env.state.error, /unavailable/i);
    assert.equal(env.state.busy, false);
    assert.equal(env.events.length, 0, 'Do not certify fallback data as viewport_api success');
    assert.equal(env.time.timers.size, 0);
    await renderer.act(async () => env.search());
    assert.equal(env.state.venues[0].id, 2);
    assert.equal(env.state.error, '');
    assert.equal(env.events.length, 1);
  } finally { await env.close(); }
});

test('actual healthy empty area remains an honest successful scan, not a degraded read', async () => {
  const env = await mount(async () => ({ ok: true, status: 200, json: async () => ({ success: true, degraded: false, data: [] }) }));
  try {
    await renderer.act(async () => env.search());
    assert.deepEqual(env.updates.at(-1), []);
    assert.equal(env.state.error, '');
    assert.equal(env.state.busy, false);
    assert.equal(env.events.length, 1);
    assert.equal(env.events[0][1].result_count, 0);
    assert.equal(env.time.timers.size, 0);
  } finally { await env.close(); }
});
