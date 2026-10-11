import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
function storage() { const map = new Map(); return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key), map }; }
test('planning name field owns the unwarped painted aperture rather than an unconstrained desktop row', async () => {
  const path = 'src/components/poker-near-me/PlayerPlanningPanel.module.css';
  const css = process.env.PNM_PLANNING_CSS_REV ? require('node:child_process').execFileSync('git', ['show', `${process.env.PNM_PLANNING_CSS_REV}:${path}`], { encoding: 'utf8' }) : await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const well = css.match(/\.well\s*\{([^}]+)\}/)?.[1] || '';
  const input = css.match(/\.input\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(well, /width:\s*min\(100%,\s*420px\)/);
  assert.match(well, /aspect-ratio:\s*1829\s*\/\s*313/);
  assert.match(well, /box-sizing:\s*border-box/);
  assert.match(well, /center\s*\/\s*contain\s+no-repeat/);
  assert.match(input, /min-height:\s*48px/); assert.match(input, /font-size:\s*16px/);
  assert.match(input, /padding:\s*12px\s+24px/);
});
async function compiled(path, dependencies) {
  const text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => String(key) });
    throw new Error(`Unexpected UI import ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
async function setup(service = {}) {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const listeners = new Map();
  globalThis.window = { addEventListener: (name, cb) => { const list = listeners.get(name) || []; list.push(cb); listeners.set(name, list); }, removeEventListener() {}, location: { search: '' } };
  globalThis.sessionStorage = storage(); globalThis.localStorage = storage();
  let actor = A; const auth = { getAuthUser: () => ({ id: actor }) };
  const planning = await compiled('src/lib/poker-near-me/playerPlanning.js', { '../../components/poker-near-me/discoveryController.js': {} });
  const hook = await compiled('src/components/poker-near-me/usePlayerPlanningWrite.js', { '../../lib/authUtils': auth, '../../services/pokerNearMePlayerPlanning': service, '../../lib/poker-near-me/playerPlanning': planning });
  return { hook: hook.default, auth, previous, listeners, switchTo: (id) => { actor = id; for (const fn of listeners.get('storage') || []) fn({ key: 'smarter-poker-auth' }); }, close: () => Object.assign(globalThis, previous) };
}
test('actual planning hook retains unknown UUID, suppresses double click, and reads before same-ID retry', async () => {
  let reject; const calls = []; let operation;
  const service = { mutatePlayerPlan: async (body, _, expected) => { calls.push({ body, expected }); operation = body.operation_id; if (calls.length === 1) await new Promise((_, no) => { reject = no; }); return { operation_id: operation, action: body.action, plan: { id: body.id } }; }, checkPlanningOperation: async (id, options) => { assert.equal(id, operation); assert.equal(options.expectedUserId, A); return null; } };
  const env = await setup(service); let writer; let tree;
  function Fixture() { writer = env.hook('trip'); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    let first; await renderer.act(async () => { first = writer.submit({ action: 'create', id: ID }); await writer.submit({ action: 'create', id: ID }); });
    assert.equal(calls.length, 1); assert.equal(calls[0].expected, A);
    await renderer.act(async () => { reject(new Error('lost acknowledgment')); await first; });
    assert.equal(writer.pending.request.operation_id, operation); assert.equal(writer.retryable, false);
    await renderer.act(async () => writer.check()); assert.equal(writer.retryable, true);
    await renderer.act(async () => writer.retry());
    assert.equal(calls.length, 2); assert.deepEqual(calls[0].body, calls[1].body); assert.equal(writer.pending, null);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});
test('actual hook isolates switched accounts and does not relabel committed storage cleanup failures as pending', async () => {
  let resolve; let writer; let tree; let refreshed = 0;
  const env = await setup({ mutatePlayerPlan: async (request, _, expected) => { assert.equal(expected, A); await new Promise((yes) => { resolve = yes; }); return { operation_id: request.operation_id, action: request.action, id: request.id }; } });
  function Fixture() { writer = env.hook('saved', () => { refreshed++; }); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    let request; await renderer.act(async () => { request = writer.submit({ action: 'delete', id: ID }); });
    await renderer.act(async () => env.switchTo(B)); assert.equal(writer.busy, false); assert.equal(writer.pending, null);
    await renderer.act(async () => { resolve(); await request; }); assert.equal(refreshed, 0); assert.equal(writer.notice, '');
    await renderer.act(async () => env.switchTo(A));
    globalThis.sessionStorage.removeItem = () => { throw new Error('storage locked'); };
    let second; await renderer.act(async () => { second = writer.submit({ action: 'delete', id: ID }); });
    await renderer.act(async () => { resolve(); await second; });
    assert.equal(writer.pending, null); assert.equal(refreshed, 1); assert.match(writer.error, /Write Was Recorded/);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});
test('actual hook releases only its account-owned lock across unresolved account switches', async () => {
  const requests = []; let writer; let tree;
  const env = await setup({ mutatePlayerPlan: (request, _, expected) => new Promise((resolve) => requests.push({ request, expected, resolve })) });
  function Fixture() { writer = env.hook('switch-lock'); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    let first; await renderer.act(async () => { first = writer.submit({ action: 'create', id: ID }); });
    const firstReceipt = sessionStorage.getItem(`pnm-planning-pending:${A}:switch-lock`);
    await renderer.act(async () => env.switchTo(A)); assert.equal(writer.busy, true, 'same-account auth refresh retains active request state');
    await renderer.act(async () => env.switchTo(B));
    let second; await renderer.act(async () => { second = writer.submit({ action: 'create', id: B }); });
    assert.equal(requests.length, 2, 'the unresolved first account must not strand the next account');
    assert.equal(requests[1].expected, B); assert.equal(writer.busy, true);
    assert.equal(sessionStorage.getItem(`pnm-planning-pending:${A}:switch-lock`), firstReceipt, 'the unresolved original receipt remains account-owned');
    await renderer.act(async () => { requests[0].resolve({ operation_id: requests[0].request.operation_id, action: 'create', plan: { id: ID } }); await first; });
    assert.equal(writer.busy, true, 'the old finally cannot unlock the new account request');
    await renderer.act(async () => writer.submit({ action: 'create', id: B }));
    assert.equal(requests.length, 2, 'the new account still suppresses duplicate submissions');
    // Its confirmed receipt can clear only the first account's retained record.
    assert.ok(firstReceipt); assert.equal(sessionStorage.getItem(`pnm-planning-pending:${A}:switch-lock`), null);
    assert.ok(sessionStorage.getItem(`pnm-planning-pending:${B}:switch-lock`));
    await renderer.act(async () => { requests[1].resolve({ operation_id: requests[1].request.operation_id, action: 'create', plan: { id: B } }); await second; });
    assert.equal(writer.busy, false); assert.equal(writer.pending, null);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});
test('actual hook blocks corrupt retained receipts and clears definite refusal after original retry', async () => {
  let writes = 0; let writer; let tree;
  const env = await setup({ mutatePlayerPlan: async () => { writes++; throw writes === 1 ? new Error('unknown') : Object.assign(new Error('Permission Refused'), { status: 403, confirmedRefusal: true }); }, checkPlanningOperation: async () => null });
  function Fixture() { writer = env.hook('search'); return null; }
  try {
    globalThis.sessionStorage.setItem(`pnm-planning-pending:${A}:search`, '{bad');
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    await renderer.act(async () => writer.submit({ action: 'create', id: ID })); assert.equal(writes, 0); assert.equal(writer.storageBlocked, true);
    globalThis.sessionStorage.map.clear(); await renderer.act(async () => env.switchTo(A));
    await renderer.act(async () => writer.submit({ action: 'create', id: ID }));
    await renderer.act(async () => writer.check()); await renderer.act(async () => writer.retry());
    assert.equal(writer.pending, null); assert.equal(writer.retryable, false); assert.equal(writer.error, 'Permission Refused'); assert.equal(globalThis.sessionStorage.map.size, 0);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});
test('actual saved library reads private plans with expected account and exposes canonical reload actions', async () => {
  const calls = []; const env = await setup({}); let tree;
  const hook = () => ({ busy: false, pending: null, error: '', notice: '', submit() {} });
  const ui = await compiled('src/components/poker-near-me/PlayerPlanningPanel.jsx', {
    '../../lib/authUtils': env.auth,
    '../../services/pokerNearMePlayerPlanning': { listPlayerPlans: async (_, __, account) => { calls.push(account); return [{ id: ID, kind: 'trip', revision: 1, name: 'Private Trip', document: { origin: 'Private Fixture Address 123', destination: 'Reno, NV' } }]; } },
    '../../services/pokerNearMePreferences': { readPendingPreference: () => null },
    '../../lib/poker-near-me/playerPlanning': { buildSavedSearchUrl: () => '/safe' },
    './usePlayerPlanningWrite': { default: hook, __esModule: true },
    './PokerNearMeConsole': { PokerNearMePanelShell: ({ as: Tag = 'article', children, ...props }) => React.createElement(Tag, props, children) },
  });
  try {
    const { renderToString } = require('react-dom/server');
    const markup = renderToString(React.createElement(ui.default, { userId: A }));
    assert.match(markup, /Sign In To Read Your Private Account Plans/);
    assert.doesNotMatch(markup, /Refresh Account Plans|Saved Searches/);
    await renderer.act(async () => { tree = renderer.create(React.createElement(ui.default, { userId: A })); });
    assert.deepEqual(calls, [A]);
    assert.match(tree.root.findByType('a').props.href, new RegExp(`accountPlan=${ID}`));
    assert.equal(tree.root.findByType('a').props.children, 'Load Account Trip');
    await renderer.act(async () => env.switchTo(B)); assert.equal(tree.root.findAllByType('a').length, 0);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});
test('device-only metrics discard raw search/location and bound both persisted and debug records', async () => {
  const source = await readFile(new URL('../src/components/poker-near-me/discoveryController.js', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} }; new Function('module', 'exports', code)(mod, mod.exports);
  const store = storage(); store.setItem('sp-search-analytics', JSON.stringify([{ query: 'old private address' }]));
  const browser = { localStorage: store, __SEARCH_ANALYTICS__: [] };
  for (let count = 0; count < 60; count++) mod.exports.trackSearchEvent('abandoned_search_query', { query: 'Private Address 123', lat: 12, token: 'private-credential', results: [{ name: 'private' }] }, browser);
  const saved = JSON.parse(store.getItem('sp-search-analytics'));
  assert.equal(saved.length, 50); assert.equal(browser.__SEARCH_ANALYTICS__.length, 50);
  assert.equal(saved[0].queryLength, 19); assert.doesNotMatch(JSON.stringify([saved, browser.__SEARCH_ANALYTICS__]), /Private|Address|credential|old private|"lat"|"results"/);
});

test('actual hook refuses receipt action or target mismatches without losing original request', async () => {
  let writer; let tree; let original;
  const env = await setup({ mutatePlayerPlan: async (request) => { original = request; return { operation_id: request.operation_id, action: 'delete', id: request.id }; }, checkPlanningOperation: async () => ({ operation_id: original.operation_id, action: 'create', plan: { id: B } }) });
  function Fixture() { writer = env.hook('mismatch'); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    await renderer.act(async () => writer.submit({ action: 'create', id: ID }));
    assert.equal(writer.pending.request.operation_id, original.operation_id);
    await renderer.act(async () => writer.check());
    assert.equal(writer.pending.request.id, ID); assert.equal(writer.retryable, false); assert.ok(writer.error);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});
test('actual hook accepts canonical UUID receipts without weakening action or target checks', async () => {
  const target = 'abcdefab-abcd-4abc-8abc-abcdefabcdef'; let writer; let tree;
  const env = await setup({ mutatePlayerPlan: async (request) => ({ operation_id: request.operation_id.toUpperCase(), action: request.action, plan: { id: request.id.toLowerCase() } }) });
  function Fixture() { writer = env.hook('canonical-receipt'); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    await renderer.act(async () => writer.submit({ action: 'create', id: target.toUpperCase() }));
    assert.equal(writer.pending, null); assert.equal(writer.error, ''); assert.match(writer.notice, /Was Saved/);
    assert.equal(sessionStorage.map.size, 0);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});

test('actual lobby GPS preference refusal is visible and account-guarded without undoing local location', async () => {
  const path = 'pages/hub/poker-near-me/lobby.js';
  const source = process.env.PNM_PREF_LOBBY_SOURCE_REV ? require('node:child_process').execFileSync('git', ['show', `${process.env.PNM_PREF_LOBBY_SOURCE_REV}:${path}`], { encoding: 'utf8' }) : await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const wrapper = source.indexOf('  const persistLocalPreference =');
  const start = wrapper >= 0 ? wrapper : source.indexOf('  const onGpsSuccess =');
  const callbacks = source.slice(start, source.indexOf('  // ─── GPS Click handler', start));
  let actor = A; let fail = Object.assign(new Error('Concurrent Preference Refused'), { confirmedRefusal: true }); let run; let visible; let local; let tree;
  const noop = () => {};
  function Fixture() {
    const [error, setPreferenceError] = React.useState(''); visible = error;
    const scope = { useCallback: React.useCallback, userId: A, getAuthUser: () => ({ id: actor }), updatePokerNearMePreferences: async () => { throw fail; }, setPreferenceError,
      setUserLocation: (value) => { local = value; }, setGpsActive: noop, setSortBy: noop, setLocationPromptDismissed: noop, setShowEnablePopup: noop,
      localStorage: storage(), persistSharedGpsLocation: noop, reverseGeocode: async () => ({ city: 'Reno', state: 'NV' }), showLocationSuccessToast: noop,
      cachedFetch: async () => ({}), applyWideVenueFetch: noop, console: { warn: noop }, window: { dispatchEvent: noop }, Event: globalThis.Event };
    const names = Object.keys(scope); run = new Function(...names, `${callbacks}\nreturn onGpsSuccess;`)(...names.map((name) => scope[name])); return null;
  }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    await renderer.act(async () => { await run({ coords: { latitude: 39, longitude: -119 } }); });
    assert.match(visible, /Device-Only.*Not Saved To Your Account/); assert.deepEqual(local, { lat: 39, lng: -119 });
    fail = new Error('Unknown Outcome'); await renderer.act(async () => { await run({ coords: { latitude: 40, longitude: -120 } }); });
    assert.match(visible, /Check The Original Preference Request Before Retrying/);
    const prior = visible; actor = B; fail = Object.assign(new Error('Refused Old Account'), { confirmedRefusal: true });
    await renderer.act(async () => { await run({ coords: { latitude: 41, longitude: -121 } }); }); assert.equal(visible, prior);
    if (wrapper >= 0) assert.equal((source.match(/updatePokerNearMePreferences\(/g) || []).length, 2, 'only the wrapper and existing menu rollback own account writes');
  } finally { await renderer.act(async () => tree?.unmount()); }
});

test('actual trip restores private account fields and public single-stop links without private fallback', async () => {
  const env = await setup({}); let tree; const saves = []; const directions = [];
  const document = { schemaVersion: 1, origin: 'Private Fixture Address 123', destination: 'Reno, NV', waypoints: ['Private Stop'], corridorMi: 25, dateRange: { start: '2026-10-12', end: '2026-10-13' }, venueIds: [1828], seriesIds: [5001066] };
  const noop = () => null;
  const ui = await compiled('src/components/poker-near-me/RoadTripPlanner.jsx', {
    './pnm-utils': { getVenueLogoUrl: noop, getVenueLogoFallback: noop, haversineMiles: () => 1 },
    '../../utils/openNativeMaps': { openNativeMaps: (value) => directions.push(value), openMultiStopRoute: noop },
    '../../lib/poker-near-me/mapRuntime': {}, './MapSurfaceFrame': { default: noop, __esModule: true },
    '../../lib/authUtils': env.auth,
    '../../services/pokerNearMePlayerPlanning': { listPlayerPlans: async (_, __, account) => { assert.equal(account, A); return [{ id: ID, document }]; } },
    './PlayerPlanningPanel': { SavePlayerPlan: (props) => { saves.push(props); return null; } },
    '../../lib/poker-near-me/playerPlanning': { buildSafeTripShareUrl: noop },
    './PokerNearMeConsole': { PokerNearMeConsoleIcon: noop, PokerNearMePanelShell: ({ children }) => React.createElement('section', {}, children) },
    './mapPresentation': {},
    '../../lib/poker-near-me/roadTripRuntime': { filterSeriesForRoute: noop, interpolateRouteLeg: noop, isVenueNearRoute: noop, travelDayNames: noop, validateTravelDateRange: noop },
  });
  globalThis.fetch = async (url, options) => { assert.equal(options.credentials, 'omit'); return { ok: true, json: async () => ({ success: true, data: [url.includes('/venues?') ? { id: 1828, name: 'Public Room', city: 'Reno', state: 'NV', address: 'Public Casino Address', latitude: 39, longitude: -119 } : { id: 5001066, name: 'Public Series' }] }) }; };
  try {
    globalThis.window.location.search = `?accountPlan=${ID}`;
    await renderer.act(async () => { tree = renderer.create(React.createElement(ui.default)); });
    assert.equal(tree.root.findByProps({ 'aria-label': 'Trip origin' }).props.value, document.origin);
    assert.equal(tree.root.findByProps({ 'aria-label': 'Trip destination' }).props.value, document.destination);
    assert.deepEqual(saves.at(-1).document.venueIds, [1828]); assert.deepEqual(saves.at(-1).document.seriesIds, [5001066]);
    assert.ok(tree.root.findAllByType('a').some((link) => link.props.href === '/hub/venues/1828'));
    assert.ok(tree.root.findAllByType('a').some((link) => link.props.href === '/hub/series/5001066'));
    const button = tree.root.findAllByType('button').find((entry) => entry.props.children === 'Public Venue Directions');
    await renderer.act(async () => button.props.onClick());
    assert.equal(directions.length, 1); assert.doesNotMatch(JSON.stringify(directions), /Private/);
    await renderer.act(async () => tree.unmount());
    globalThis.window.location.search = '?planVenues=1828&planSeries=5001066&start=2026-10-12&end=2026-10-13';
    await renderer.act(async () => { tree = renderer.create(React.createElement(ui.default)); });
    assert.equal(tree.root.findByProps({ 'aria-label': 'Trip origin' }).props.value, '');
    assert.ok(tree.root.findAllByType('a').some((link) => link.props.href === '/hub/venues/1828'));
    assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Private Fixture|Private Stop/);
  } finally { await renderer.act(async () => tree?.unmount()); env.close(); }
});
