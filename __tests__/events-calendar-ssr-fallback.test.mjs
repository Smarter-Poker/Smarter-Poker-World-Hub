import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fetchJsonWithDeadline } from '../src/lib/server/fetchJsonWithDeadline.js';

const pageUrl = new URL('../pages/hub/events-calendar.js', import.meta.url);

// Render the owning component; only external services and unrelated shells are replaced.
async function calendarHarness() {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  const { transformSync } = require('@babel/core');
  const source = process.env.CALENDAR_GPS_BASELINE
    ? execFileSync('git', ['show', 'HEAD:pages/hub/events-calendar.js'], { encoding: 'utf8' })
    : await readFile(pageUrl, 'utf8');
  const code = transformSync(source, { filename: 'events-calendar.js', babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
  const module = { exports: {} };
  const passthrough = ({ children, as: Tag = 'div', ...props }) => React.createElement(Tag, props, children);
  const deps = {
    react: React, 'next/link': passthrough, 'next/router': { useRouter: () => ({ back() {} }) },
    swr: () => ({ data: { events: [], success: true }, mutate() {}, isLoading: false }),
    'next/dynamic': () => () => null,
    '../../src/hooks/useVenueRealtime': () => {},
    '../../src/hooks/useAccessibleDialog': () => ({ dialogRef: { current: null }, initialFocusRef: { current: null } }),
    '../../src/components/poker-near-me/PokerNearMeConsole': { PokerNearMePanelShell: passthrough, PokerNearMeConsoleIcon: () => null },
    '../../src/data/city-coordinates': await import('../src/data/city-coordinates.js'),
    '../../src/lib/geoUtils': { resolveEntityCoordinates: () => null, haversineDistance: () => 0 },
    '../../src/lib/server/fetchJsonWithDeadline': { fetchJsonWithDeadline() {} },
    '../../src/lib/seo/hubPageSchema': { hubCollectionSchema: () => ({}) },
    '../../src/config/hamburgerMenus': { getMenuConfig: () => ({}) },
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(name => Object.hasOwn(deps, name) ? deps[name] : name.startsWith('../../src/components/') ? () => null : require(name), module, module.exports);
  const originals = { navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), localStorage: globalThis.localStorage, window: globalThis.window };
  const requests = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition(success, error) { requests.push({ success, error }); } } } });
  globalThis.localStorage = { getItem: () => null };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  let view;
  await act(async () => { view = create(React.createElement(module.exports.default, { fallbackData: null, initialDateKey: '2026-10-12' })); });
  const click = async predicate => act(async () => view.root.findAllByType('button').find(predicate).props.onClick());
  return { view, requests, act, click, close: async () => { await act(async () => view.unmount()); if (originals.navigator) Object.defineProperty(globalThis, 'navigator', originals.navigator); else delete globalThis.navigator; globalThis.localStorage = originals.localStorage; globalThis.window = originals.window; } };
}

test('closed calendar GPS request cannot replace a newer selected city', async () => {
  const h = await calendarHarness();
  try {
    await h.click(b => b.props.id === 'ec-location-btn');
    await h.click(b => b.props.className === 'loc-gps-btn');
    const stale = h.requests.at(-1);
    await h.click(b => b.props['aria-label'] === 'Close');
    await h.click(b => b.props.id === 'ec-location-btn');
    await h.click(b => b.props.children === 'Chicago, IL');
    await h.act(async () => stale.success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.deepEqual(h.view.root.findAllByProps({ className: 'pnm-location-city' }).map(n => n.props.children), ['Chicago, IL']);
  } finally { await h.close(); }
});

test('mount GPS cannot overwrite an explicit calendar city or clear', async () => {
  const h = await calendarHarness();
  try {
    const stale = h.requests[0];
    await h.click(b => b.props.id === 'ec-location-btn');
    await h.click(b => b.props.children === 'Chicago, IL');
    await h.act(async () => stale.success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.deepEqual(h.view.root.findAllByProps({ className: 'pnm-location-city' }).map(n => n.props.children), ['Chicago, IL']);
    await h.click(b => b.props.className === 'pnm-location-clear');
    await h.act(async () => stale.success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.equal(h.view.root.findAll(n => n.props.className === 'pnm-location-city').length, 0);
  } finally { await h.close(); }
});

test('calendar GPS close resets loading and an old error cannot cancel a new request', async () => {
  const h = await calendarHarness();
  try {
    await h.click(b => b.props.id === 'ec-location-btn');
    await h.click(b => b.props.className === 'loc-gps-btn');
    const old = h.requests.at(-1);
    await h.click(b => b.props['aria-label'] === 'Close');
    await h.click(b => b.props.id === 'ec-location-btn');
    assert.equal(h.view.root.findByProps({ className: 'loc-gps-btn' }).props.disabled, false);
    await h.click(b => b.props.className === 'loc-gps-btn');
    const fresh = h.requests.at(-1);
    await h.act(async () => old.error({ code: 1 }));
    assert.equal(h.view.root.findByProps({ className: 'loc-gps-btn' }).props.disabled, true);
    assert.equal(h.view.root.findAllByProps({ role: 'alert' }).length, 0);
    await h.act(async () => fresh.success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.equal(h.view.root.findByProps({ className: 'pnm-location-city' }).props.children, 'My Location (GPS)');
    assert.equal(h.view.root.findAllByProps({ role: 'dialog' }).length, 0);
  } finally { await h.close(); }
});

test('calendar GPS permission failure stays visible and retries successfully', async () => {
  const h = await calendarHarness();
  try {
    await h.click(b => b.props.id === 'ec-location-btn');
    await h.click(b => b.props.className === 'loc-gps-btn');
    await h.act(async () => h.requests.at(-1).error({ code: 1 }));
    assert.equal(h.view.root.findAllByProps({ role: 'alert' }).length, 1);
    assert.equal(h.view.root.findByProps({ className: 'loc-gps-btn' }).props.disabled, false);
    await h.click(b => b.props.className === 'loc-gps-btn');
    await h.act(async () => h.requests.at(-1).success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.equal(h.view.root.findAllByProps({ role: 'dialog' }).length, 0);
    const latQuery = h.view.root.findAll(n => n.props.className === 'pnm-location-city');
    assert.equal(latQuery[0].props.children, 'My Location (GPS)');
  } finally { await h.close(); }
});

test('manual calendar submission owns the location over a pending GPS response', async () => {
  const h = await calendarHarness();
  try {
    await h.click(b => b.props.id === 'ec-location-btn');
    await h.click(b => b.props.className === 'loc-gps-btn');
    const old = h.requests.at(-1);
    await h.act(async () => {
      h.view.root.findByProps({ id: 'loc-city-input' }).props.onChange({ target: { value: 'Chicago' } });
      h.view.root.findByProps({ id: 'loc-state-input' }).props.onChange({ target: { value: 'IL' } });
    });
    await h.act(async () => h.view.root.findAllByType('form').find(n => n.props.className === 'loc-form').props.onSubmit({ preventDefault() {} }));
    await h.act(async () => old.success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.equal(h.view.root.findByProps({ className: 'pnm-location-city' }).props.children, 'Chicago, IL');
  } finally { await h.close(); }
});

test('clear all prevents pending mount GPS from repopulating calendar location', async () => {
  const h = await calendarHarness();
  try {
    await h.act(async () => h.view.root.findByProps({ id: 'ec-game-type' }).props.onChange({ target: { value: 'PLO' } }));
    await h.click(b => b.props.className === 'ec-clear-btn');
    await h.act(async () => h.requests[0].success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.equal(h.view.root.findAllByProps({ className: 'pnm-location-pill' }).length, 0);
  } finally { await h.close(); }
});

test('ordinary mount GPS updates calendar and pending requests are harmless after unmount', async () => {
  const h = await calendarHarness();
  try {
    await h.act(async () => h.requests[0].success({ coords: { latitude: 34.0522, longitude: -118.2437 } }));
    assert.equal(h.view.root.findAllByProps({ className: 'pnm-location-pill' }).length, 1);
  } finally { await h.close(); }
  await h.act(async () => {
    h.requests[0].success({ coords: { latitude: 41.8781, longitude: -87.6298 } });
    h.requests[0].error({ code: 1 });
  });
  assert.equal(h.view.toJSON(), null);
});

const expectDeadline = async (fetchImpl) => {
  let capturedSignal;
  const startedAt = Date.now();

  await assert.rejects(
    fetchJsonWithDeadline('https://example.test/calendar', {
      fetchImpl: (url, options) => {
        capturedSignal = options.signal;
        return fetchImpl(url, options);
      },
      timeoutMs: 25,
    }),
    { name: 'TimeoutError' }
  );

  assert.equal(capturedSignal.aborted, true);

  // 250ms -> 2s (2026-09-08). The two callers of this helper pass a transport
  // that NEVER SETTLES - `new Promise(() => {})`. So what is being proved here
  // is bounded versus unbounded: without the deadline this hangs until the
  // test runner gives up. It is not a benchmark of the timer's accuracy.
  //
  // 250ms against a 25ms timeout is 225ms of scheduling headroom, and that is
  // not enough on a runner carrying twelve concurrent jobs - the event loop
  // stalls, the timer fires late, and the assertion fails for a reason that
  // has nothing to do with the code under test. Measured 2026-09-08: this was
  // the only failure in a 1,519-test Pre-Deploy Safety Checks run, on three
  // separate branches whose diffs touched nothing near it, blocking merges.
  //
  // Two seconds still proves the deadline fired - the alternative is infinity -
  // and it is 40x below the 5s timeout the page itself uses in production, so
  // a genuinely broken deadline still fails this.
  const elapsed = Date.now() - startedAt;
  assert.ok(
    elapsed < 2_000,
    `deadline did not terminate: ${elapsed}ms. This transport never settles, so ` +
      `the helper must have aborted it on the timer or it would run forever.`
  );
};

test('deadline terminates a transport that ignores its abort signal', async () => {
  await expectDeadline(() => new Promise(() => {}));
});

test('deadline also terminates a stalled JSON response body', async () => {
  await expectDeadline(async () => ({
    ok: true,
    json: () => new Promise(() => {}),
  }));
});

test('successful JSON completes before the deadline', async () => {
  const payload = { success: true, events: [{ id: 'event-1' }] };
  const result = await fetchJsonWithDeadline('https://example.test/calendar', {
    fetchImpl: async () => ({ ok: true, json: async () => payload }),
    timeoutMs: 100,
  });

  assert.deepEqual(result, payload);
});

test('non-success responses return null without reading a body', async () => {
  let bodyRead = false;
  const result = await fetchJsonWithDeadline('https://example.test/calendar', {
    fetchImpl: async () => ({
      ok: false,
      json: async () => {
        bodyRead = true;
      },
    }),
    timeoutMs: 100,
  });

  assert.equal(result, null);
  assert.equal(bodyRead, false);
});

test('events calendar SSR uses the bounded helper and preserves its empty fallback', async () => {
  const source = await readFile(pageUrl, 'utf8');

  assert.match(source, /fetchJsonWithDeadline\(url, \{ timeoutMs: 5_000 \}\)/);
  assert.match(source, /const initialDateKey = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(source, /fallbackData: null, initialDateKey/);
});

test('events calendar hydrates date-dependent controls from the server date key', async () => {
  const source = await readFile(pageUrl, 'utf8');

  assert.match(source, /EventsCalendarPage\(\{ fallbackData, initialDateKey \}\)/);
  assert.match(source, /useState\(initialDate\.key\)/);
  assert.match(source, /useState\(initialDate\.dayIndex\)/);
  assert.match(source, /const todayIdx = todayDayIndex/);
  assert.doesNotMatch(source, /const todayIdx = new Date\(\)\.getDay\(\)/);
});
