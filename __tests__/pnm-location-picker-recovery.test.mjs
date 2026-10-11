import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const file = 'src/components/maps/LeafletLocationPicker.jsx';
const source = process.env.PNM_PICKER_SOURCE_REV ? execFileSync('git', ['show', `${process.env.PNM_PICKER_SOURCE_REV}:${file}`], { encoding: 'utf8' }) : readFileSync(file, 'utf8');
const pending = () => { let resolve; return { promise: new Promise(yes => { resolve = yes; }), resolve: value => resolve(value) }; };
function clock() {
  let now = 0; let next = 0; const timers = new Map();
  return { timers, setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id), tick(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } } };
}
async function flush() { for (let n = 0; n < 15; n++) await Promise.resolve(); }
function helpers(fetch, time) {
  const text = source.slice(source.indexOf('// Nominatim forward search.'), source.indexOf('export default function'));
  return new Function('fetch', 'setTimeout', 'clearTimeout', 'stateAbbrev', `${text}; return { search: nominatimSearch, reverse: nominatimReverse };`)(fetch, time.setTimeout, time.clearTimeout, value => value === 'Nevada' ? 'NV' : value);
}
test('actual location lookup settles stalled fetch and stalled body after one total deadline', async () => {
  for (const fetch of [() => new Promise(() => {}), async () => ({ ok: true, json: () => new Promise(() => {}) })]) {
    const time = clock(); const controller = new AbortController(); let outcome = 'pending';
    void helpers(fetch, time).search('Las Vegas', controller).then(() => { outcome = 'success'; }, () => { outcome = 'failure'; });
    await flush(); time.tick(30000); await flush();
    assert.equal(outcome, 'failure'); assert.equal(controller.signal.aborted, true); assert.equal(time.timers.size, 0);
  }
});
test('provider refusal is an error, not a valid empty search; successful empty remains valid', async () => {
  const time = clock();
  await assert.rejects(helpers(async () => ({ ok: false }), time).search('NV', new AbortController()));
  assert.deepEqual(await helpers(async () => ({ ok: true, json: async () => [] }), time).search('NV', new AbortController()), []);
  assert.equal(time.timers.size, 0);
});
test('actual forward effect cancels obsolete results, releases spinner and provides retry/manual fields', async () => {
  const start = source.indexOf('  // Debounced search against Nominatim');
  const bodyStart = source.indexOf('useEffect(() => {', start) + 'useEffect(() => {'.length;
  const body = source.slice(bodyStart, source.indexOf('  }, [searchInput', start));
  const time = clock(); const first = pending(); const second = pending(); let request = 0;
  const h = helpers(() => (++request === 1 ? first.promise : request === 2 ? second.promise : new Promise(() => {})), time);
  const observed = { results: [], busy: false, error: '' }; const debounce = { current: null };
  const effect = query => new Function('searchInput', 'searchDebounceRef', 'setTimeout', 'clearTimeout', 'nominatimSearch', 'setSearchResults', 'setSearching', 'setSearchError', 'AbortController', body)(query, debounce, time.setTimeout, time.clearTimeout, h.search, rows => { observed.results = rows; }, busy => { observed.busy = busy; }, error => { observed.error = error; }, AbortController);
  const oldCleanup = effect('Old City'); time.tick(700); await flush(); oldCleanup();
  const cleanup = effect('New City'); time.tick(700); await flush();
  second.resolve({ ok: true, json: async () => [{ place_id: 2, display_name: 'New City' }] }); await flush();
  first.resolve({ ok: true, json: async () => [{ place_id: 1, display_name: 'Old City' }] }); await flush();
  assert.equal(observed.results[0].place_id, 2); assert.equal(observed.busy, false); cleanup(); assert.equal(time.timers.size, 0);
  const failureCleanup = effect('Unavailable City'); time.tick(700); await flush(); time.tick(30000); await flush();
  assert.equal(observed.busy, false); assert.match(observed.error, /unavailable/i); failureCleanup();
  assert.match(source, /Retry Location Search/); assert.match(source, /data-location-lookup-error/); assert.match(source, /aria-label="City"/); assert.match(source, /aria-label="State"/);
});
function propagation(reverse) {
  const start = source.indexOf('    const propagate = async');
  const body = source.slice(start, source.indexOf("    markerRef.current.on('dragend'", start));
  const changes = []; const errors = []; const reverseAbortRef = { current: null };
  const refs = { markerRef: { current: { setLatLng() {} } }, circleRef: { current: { setLatLng() {} } }, onChangeRef: { current: value => changes.push(value) }, valueRef: { current: { city: 'Saved City', state: 'NV' } } };
  const scope = { ...refs, reverseAbortRef, sessionActive: true, approximateOnly: true, approximateLocation: (lat, lng) => ({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }), nominatimReverse: reverse, AbortController, setReverseError: value => errors.push(value) };
  return { run: new Function(...Object.keys(scope), `${body}; return propagate;`)(...Object.values(scope)), changes, errors, reverseAbortRef, refs };
}
test('actual selected privacy-safe point persists before geocoding and an older lookup cannot replace it', async () => {
  const first = pending(), second = pending(); let count = 0;
  const state = propagation(() => ++count === 1 ? first.promise : second.promise);
  void state.run(36.17123, -115.14123); assert.deepEqual(state.changes[0], { city: 'Saved City', state: 'NV', lat: 36.17, lng: -115.14, approximate: true });
  void state.run(36.19123, -115.19123);
  second.resolve({ city: 'Current City', state: 'NV' }); await flush(); const length = state.changes.length;
  first.resolve({ city: 'Obsolete City', state: 'CA' }); await flush();
  assert.equal(state.changes.length, length); assert.equal(state.changes.at(-1).city, 'Current City'); assert.equal(state.changes.at(-1).lat, 36.19);
});
test('actual reverse lookup failure keeps chosen point and signals manual recovery', async () => {
  const state = propagation(async () => { throw new Error('Provider refused'); });
  await state.run(36.17123, -115.14123);
  assert.equal(state.changes.length, 1); assert.equal(state.changes[0].approximate, true); assert.match(state.errors.at(-1), /point was kept/i);
});
test('actual manual callbacks revoke a pending reverse lookup and preserve sequential field edits', async () => {
  const result = pending();
  const state = propagation(() => result.promise);
  void state.run(36.17123, -115.14123);
  const originalController = state.reverseAbortRef.current;
  const callbackStart = source.indexOf('  const updateManualLocation = useCallback(');
  assert.ok(callbackStart >= 0, 'Manual location callback must revoke pending reverse ownership');
  const callback = source.slice(callbackStart, source.indexOf('  const handleMapLayoutChange', callbackStart));
  const update = new Function('useCallback', 'reverseAbortRef', 'valueRef', 'onChangeRef', `${callback}; return updateManualLocation;`)(
    fn => fn, state.reverseAbortRef, state.refs.valueRef, state.refs.onChangeRef);
  update('city', 'Player City'); update('state', 'CA');
  assert.equal(originalController.signal.aborted, true);
  assert.equal(state.reverseAbortRef.current, null);
  assert.equal(state.changes.at(-1).city, 'Player City');
  assert.equal(state.changes.at(-1).state, 'CA');
  assert.equal(state.changes.at(-1).lat, 36.17);
  assert.equal(state.changes.at(-1).lng, -115.14);
  assert.equal(state.changes.at(-1).approximate, true);
  const count = state.changes.length;
  result.resolve({ city: 'Late Provider City', state: 'NV' }); await flush();
  assert.equal(state.changes.length, count);
  assert.match(source, /updateManualLocation\('city', event\.target\.value\)/);
  assert.match(source, /updateManualLocation\('state', event\.target\.value\)/);
  assert.equal((source.match(/updateManualLocation\('city', (?:event|e)\.target\.value\)/g) || []).length, 2);
  assert.equal((source.match(/updateManualLocation\('state', (?:event|e)\.target\.value\)/g) || []).length, 2);
  assert.doesNotMatch(source, /onChangeRef\.current\?\.\(\{ \.\.\.value, (?:city|state):/);
});
test('actual search-result callback preserves new coordinates for same-batch manual edits', async () => {
  const state = propagation(() => new Promise(() => {}));
  const start = source.indexOf('  const pickResult = useCallback(');
  const callback = source.slice(start, source.indexOf('  // Fallback if Leaflet', start));
  const args = { useCallback: fn => fn, approximateOnly: true, approximateLocation: (lat, lng) => ({ lat, lng }),
    mapInstance: { current: null }, markerRef: { current: null }, circleRef: { current: null },
    setSearchResults() {}, setSearchInput() {}, reverseAbortRef: state.reverseAbortRef, setReverseError() {},
    stateAbbrev: value => value, valueRef: state.refs.valueRef, onChangeRef: state.refs.onChangeRef };
  const pick = new Function(...Object.keys(args), `${callback}; return pickResult;`)(...Object.values(args));
  await pick({ lat: '35', lon: '-110', address: { city: 'Selected City', state: 'AZ' } });
  assert.equal(state.refs.valueRef.current.lat, 35);
  assert.equal(state.refs.valueRef.current.lng, -110);
  assert.equal(state.refs.valueRef.current.city, 'Selected City');
  assert.deepEqual(state.refs.valueRef.current, state.changes.at(-1));
});
