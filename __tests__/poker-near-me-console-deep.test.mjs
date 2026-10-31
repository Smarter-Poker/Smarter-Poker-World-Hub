/**
 * #ClubArenaConsole deep-route contracts (2026-09-29).
 *
 * Source contracts for the deep Poker Near Me routes: the signal deck, the
 * location directories, the venue profile, and the series and tour surfaces.
 * Each assertion pins a defect that was measured in a render, not a taste.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

function seriesHydrationFixture() {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const ts = require('typescript');
  const source = process.env.PNM_SERIES_SOURCE_REV ? execFileSync('git', ['show', `${process.env.PNM_SERIES_SOURCE_REV}:pages/hub/poker-series.js`], { encoding: 'utf8' }) : read('pages/hub/poker-series.js');
  // Render the actual page with supplied SSG props; do not load its server-only
  // database imports or execute getStaticProps in this hydration regression.
  const componentSource = source.slice(0, source.indexOf("import { supabaseAdmin }"));
  const code = ts.transpileModule(componentSource, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const empty = () => null;
  const frame = ({ children }) => React.createElement(React.Fragment, null, children);
  const modules = {
    'next/head': frame, 'next/link': ({ href, children, ...props }) => React.createElement('a', { ...props, href }, children),
    'next/router': { useRouter: () => ({ isReady: false, query: {}, push() {}, replace() {} }) }, 'next/dynamic': () => empty,
    '../../src/components/ui/FullScreenPageOverlay': frame, '../../src/components/ui/UniversalHeader': empty,
    '../../src/components/poker-near-me/PokerNearMeFamilyNav': empty, '../../src/components/seo/HubPageSummary': empty,
    '../../src/components/ui/HamburgerMenu': empty, '../../src/config/hamburgerMenus': { getMenuConfig: () => ({}) },
    '../../src/hooks/useVenueRealtime': empty, '../../src/lib/geoUtils': { resolveEntityCoordinates: () => null, haversineDistance: () => 0 },
    'swr': () => ({ data: null, error: null, isValidating: false, mutate() {} }),
    '../../src/components/poker-near-me/PokerIdentityMark': empty,
    '../../src/components/poker-near-me/PokerNearMeConsole': { PokerNearMeConsoleIcon: empty, PokerNearMePanelShell: ({ children, className }) => React.createElement('section', { className }, children) },
    '../../src/lib/poker-near-me/structuredData': { buildSeriesDirectorySchema: () => ({}), serializePokerJsonLd: JSON.stringify },
    '../../src/lib/seo/hubPageSchema': { datasetSchema: () => [], faqSchema: () => [] },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    assert.ok(Object.hasOwn(modules, name), `Unexpected actual series import ${name}`); return modules[name];
  }, mod, mod.exports);
  const props = { initialSeries: [{ id: 42, series_uid: 'series-42', name: 'Clock Boundary Series', start_date: '2026-10-11', end_date: '2026-10-11', events: [{ name: 'Boundary Event', start_date: '2026-10-11', buy_in: 100 }] }], initialSeriesMeta: { generatedAt: '2026-10-11T12:00:00Z', totalCount: 1 } };
  return { React, Page: mod.exports.default, props, require };
}

async function withSeriesBrowser(run) {
  const previous = { Date: globalThis.Date, window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, tz: process.env.TZ };
  let instant = '2026-10-11T23:59:00Z'; let nextId = 0; const timers = new Map(); const listeners = new Map();
  const clock = value => { instant = value; };
  globalThis.Date = class extends previous.Date { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return new previous.Date(instant).getTime(); } };
  process.env.TZ = 'UTC';
  const browser = () => {
    globalThis.localStorage = { getItem: () => '{"series-42":123}', setItem() {} };
    globalThis.window = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name), scrollY: 0 };
    globalThis.fetch = async () => ({ json: async () => ({ venues: [] }) });
  };
  try { await run({ clock, browser, timers, listeners, fakeTimers: () => {
    globalThis.setTimeout = (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id; };
    globalThis.clearTimeout = id => timers.delete(id);
  } }); } finally {
    Object.assign(globalThis, { Date: previous.Date, window: previous.window, localStorage: previous.localStorage, fetch: previous.fetch, setTimeout: previous.setTimeout, clearTimeout: previous.clearTimeout });
    if (previous.tz === undefined) delete process.env.TZ; else process.env.TZ = previous.tz;
  }
}

test('actual Series first paint matches cached SSR across midnight without claiming fresh status', async () => {
  const { React, Page, props, require } = seriesHydrationFixture();
  await withSeriesBrowser(async ({ clock, browser }) => {
    delete globalThis.window;
    const render = () => require('react-dom/server').renderToString(React.createElement(Page, props));
    const server = render(); browser(); globalThis.localStorage.getItem = () => '{}'; clock('2026-10-12T00:01:00Z');
    const client = render();
    const digest = html => createHash('sha256').update(html).digest('hex');
    assert.equal(digest(client), digest(server), 'actual cached SSR and first browser render must agree after the date changes');
    clock('2026-10-11T23:59:00Z'); process.env.TZ = 'America/Los_Angeles';
    assert.equal(digest(render()), digest(server), 'the same instant in another browser timezone also matches the cached first paint');
  });
});

test('actual Series saved favorites do not diverge from SSR before mount', async () => {
  const { React, Page, props, require } = seriesHydrationFixture();
  await withSeriesBrowser(async ({ browser }) => {
    delete globalThis.window;
    const render = () => require('react-dom/server').renderToString(React.createElement(Page, props));
    const server = render(); browser(); const client = render();
    const digest = html => createHash('sha256').update(html).digest('hex');
    assert.equal(digest(client), digest(server), 'browser-only stored favorites hydrate after the matching first paint');
  });
});

test('actual Series restores favorites after mount and refreshes every status at midnight with timer cleanup', async () => {
  const { React, Page, props, require } = seriesHydrationFixture(); const renderer = require('react-test-renderer');
  await withSeriesBrowser(async ({ clock, browser, fakeTimers, timers, listeners }) => {
    browser(); fakeTimers(); let tree;
    try {
      await renderer.act(async () => { tree = renderer.create(React.createElement(Page, props)); });
      assert.equal(tree.root.findByProps({ 'aria-label': 'Favorite series' }).props['aria-pressed'], 'true');
      assert.match(JSON.stringify(tree.toJSON()), /LIVE NOW/);
      assert.match(JSON.stringify(tree.toJSON()), /Boundary Event/);
      const midnight = [...timers].find(([, timer]) => timer.ms === 60000); assert.ok(midnight, 'existing local-midnight refresh remains scheduled');
      clock('2026-10-12T00:00:01Z'); timers.delete(midnight[0]);
      await renderer.act(async () => midnight[1].fn());
      assert.doesNotMatch(JSON.stringify(tree.toJSON()), /LIVE NOW/);
      assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Boundary Event/, 'expired event preview advances with the same clock');
      const subtitle = tree.root.findByProps({ className: 'pnm-subtitle' });
      assert.match(subtitle.children.join(''), /0 Live Now/, 'memoized count changes with the same midnight clock');
      await renderer.act(async () => listeners.get('storage')({ key: 'pnm_series_favorites', newValue: '{}' }));
      assert.equal(tree.root.findByProps({ 'aria-label': 'Favorite series' }).props['aria-pressed'], 'false');
    } finally { await renderer.act(async () => tree?.unmount()); }
    assert.equal(timers.size, 0, 'unmount removes the midnight timer');
  });
});

test('venue map and premium actions retain full painted touch targets', () => {
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  const owner = css.match(/body\.world-poker-near-me \.map-actions :is\(\.directions-btn, \.viewmap-btn\),\s*body\.world-poker-near-me \.peak-analytics-upgrade \{([^}]+)\}/);
  assert.ok(owner, 'both map actions and the premium overlay share the painted control owner');
  assert.match(owner[1], /min-height: 52px/);
  assert.match(owner[1], /button-secondary\.png/);
  assert.match(owner[1], /max-width: 100%/);
  assert.match(read('pages/hub/venues/[id].js'), /className="peak-analytics-upgrade"/);
});

test('venue live-detail disclosure keeps a 44px target on desktop and mobile', () => {
  const page = read('pages/hub/venues/[id].js');
  const owner = page.match(/\.bravo-live-scroll-btn\s*\{([^}]+)\}/);
  assert.ok(owner, 'the View Full Details action keeps its route-owned rule');
  assert.match(owner[1], /min-width:\s*44px/);
  assert.match(owner[1], /min-height:\s*44px/);
  assert.match(owner[1], /box-sizing:\s*border-box/);
  assert.match(owner[1], /justify-content:\s*center/);
  assert.match(page, /className="bravo-live-scroll-btn"[\s\S]*?View Full Details/);
});

test('venue schedules expose each real calendar date without shifting or collapsing occurrences', () => {
  const page = read('pages/hub/venues/[id].js');
  assert.match(page, /<time dateTime=\{scheduleDate\.iso\}>\{scheduleDate\.label\}<\/time>/);
  assert.match(page, /var scheduleDate = formatScheduleOccurrenceDate\(s\.event_date\)/);
  assert.match(page, /schedules\.map\(function \(s, idx\)/);
  const helper = page.match(/function formatScheduleOccurrenceDate\(value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, 'date formatter exists at the rendering owner');
  const format = new Function(`${helper}; return formatScheduleOccurrenceDate;`)();
  assert.deepEqual(format('2026-10-14'), { iso: '2026-10-14', label: 'Oct 14, 2026' });
  assert.deepEqual(format('2026-10-14T00:00:00Z'), { iso: '2026-10-14', label: 'Oct 14, 2026' });
  assert.deepEqual(format('2026-11-01'), { iso: '2026-11-01', label: 'Nov 1, 2026' });
  assert.deepEqual(format('2028-02-29'), { iso: '2028-02-29', label: 'Feb 29, 2028' });
  for (const invalid of [null, undefined, '', '1970-01-01', '2026-02-29', '2026-13-01', '2026-10-40', 'not-a-date']) assert.equal(format(invalid), null);
  const functions = ['scheduleGroupIsToday', 'scheduleVenueToday', 'compareScheduleOccurrences'].map(name => page.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0]);
  assert.ok(functions.every(Boolean));
  const behavior = new Function(`${helper}; ${functions.join('\n')}; return { scheduleGroupIsToday, scheduleVenueToday, compareScheduleOccurrences };`)();
  const today = behavior.scheduleVenueToday('America/New_York', new Date('2026-10-10T01:00:00Z'));
  assert.deepEqual(today, { iso: '2026-10-09', day: 'Friday' });
  assert.equal(behavior.scheduleVenueToday(null, new Date()), null);
  assert.equal(behavior.scheduleVenueToday('Not/AZone', new Date()), null);
  assert.match(page, /scheduleVenueToday\(resolveVenueTimeZone\(venue\), new Date\(\)\)/);
  assert.match(page, /\[venue\?\.timezone, venue\?\.state\]/);
  assert.equal(behavior.scheduleGroupIsToday('Friday', [{ event_date: '2026-10-16' }, { event_date: '2026-10-23' }], today), false);
  assert.equal(behavior.scheduleGroupIsToday('Friday', [{ event_date: '2026-10-09' }], today), true);
  assert.equal(behavior.scheduleGroupIsToday('Friday', [{ event_date: null }], today), true);
  assert.equal(behavior.scheduleGroupIsToday('Friday', [{ event_date: '1970-01-01' }], today), false);
  const dated = [{ event_date: '2026-10-23', start_time: '18:00' }, { event_date: '2026-10-16', start_time: '18:00' }, { event_date: '2026-10-16', start_time: '11:00' }];
  assert.deepEqual(dated.sort(behavior.compareScheduleOccurrences).map(row => row.event_date + ' ' + row.start_time), ['2026-10-16 18:00', '2026-10-16 11:00', '2026-10-23 18:00']);
  assert.equal(behavior.compareScheduleOccurrences({ event_date: '2026-10-16', start_time: '9 AM' }, { event_date: '2026-10-16', start_time: '11 AM' }), 0, 'same-date source ordering is retained');
  assert.match(page, /schedules\.sort\(compareScheduleOccurrences\)/);
  assert.match(page, /var isToday = scheduleGroupIsToday\(day, schedules, scheduleToday\)/);
});

test('venue schedule and live report states use complete painted panels without changing handlers', () => {
  const page = read('pages/hub/venues/[id].js');
  assert.equal((page.match(/<PokerNearMePanelShell as="section" id="tournaments-section"/g) || []).length, 2);
  assert.match(page, /<PokerNearMePanelShell as="section" className="live-games-section venue-console-body"/);
  assert.match(page, /onSubmit=\{handleReportGame\}/);
  assert.match(page, /disabled=\{reportSubmitting \|\| !reportForm.stakes.trim\(\)\}/);
  assert.match(page, /venue.schedule_read_error \? 'Tournament Schedule Could Not Be Loaded/);
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  assert.match(css, /\.venue-console-body[\s\S]*button-primary\.png/);
  assert.match(css, /\.venue-console-body[\s\S]*utility-well\.webp/);
});

test('observed intelligence carries painted rails in loading, empty and populated states', () => {
  const widget = read('src/components/poker-near-me/BestTimeToGoWidget.jsx');
  assert.equal((widget.match(/<PokerNearMePanelShell className="bttg-widget/g) || []).length, 3);
  assert.match(widget, /Modeled Estimates Are Excluded/);
  assert.match(widget, /heatData\?\.data_mode === 'observed_history'/);
  assert.match(widget, /className="bttg-widget bttg-empty venue-console-body" role="status"/);
});

test('the signal deck prints its description once', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  // The console head used to be handed the same string the body prints, so
  // every deep route carried its description twice: once clipped inside a
  // painted band that does not wrap, and once as readable prose.
  assert.doesNotMatch(deck, /subtitle=\{description\}/);
  assert.match(deck, /subtitle=\{subtitle\}/);
  const descriptionPrints = deck.match(/\{description\}/g) || [];
  assert.equal(descriptionPrints.length, 1, 'description reaches the DOM exactly once');
  assert.match(deck, /<p className="pnm-deep-deck__description">\{description\}<\/p>/);
});

test('a phrase heading prints on the stage, not inside the painted band', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  assert.match(deck, /headTitle = null/);
  assert.match(deck, /const stageHeading = Boolean\(headTitle/);
  assert.match(deck, /titleAs=\{stageHeading \? 'p' : 'h1'\}/);
  assert.match(deck, /title=\{stageHeading \? headTitle : title\}/);
  assert.match(deck, /<h1 id="pnm-deep-route-title" className="pnm-deep-deck__heading">\{title\}<\/h1>/);

  // One h1 per route either way: the painted band carries it when the
  // heading is a name, the stage carries it when the heading is a phrase.
  const page = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.match(page, /headTitle=\{placeLabel\}/);
});

test('the painted head keeps its own lines against the pre-console stylesheets', () => {
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  // poker-near-me.css and poker-near-me-command-surfaces.css still dress
  // `.pnm-deep-deck h1` as free display type. `text-wrap: balance` there
  // overrides the text-wrap-mode half of the chassis' `white-space: nowrap`,
  // and the fitted title wrapped inside a band that clips.
  assert.match(css, /\.pnc\.pnm-deep-deck \.pnc-zone[\s\S]{0,400}?white-space: nowrap !important/);
  assert.match(css, /\.pnc\.pnm-deep-deck \.pnc-zone[\s\S]{0,400}?text-wrap: nowrap !important/);
  assert.match(css, /\.pnc\.pnm-deep-deck \.pnc-zone[\s\S]{0,400}?max-width: none !important/);
});

test('the deep stylesheet loads a runtime-size crest, never the source master', () => {
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  assert.doesNotMatch(css, /painted-chassis-v1\/source\//);
  assert.match(css, /painted-chassis-v1\/crest-locator-520\.webp/);

  const copy = 'public/images/pnm-console/painted-chassis-v1/crest-locator-520.png';
  const master = 'public/images/pnm-console/painted-chassis-v1/source/crest-locator.png';
  assert.ok(exists(copy), copy + ' is missing');
  assert.ok(exists(master), master + ' is missing');
  const copyBytes = fs.statSync(path.join(root, copy)).size;
  const masterBytes = fs.statSync(path.join(root, master)).size;
  assert.ok(copyBytes < 400000, 'runtime crest is ' + copyBytes + ' bytes');
  assert.ok(copyBytes < masterBytes / 3, 'the runtime crest is a real downscale of the master');
});

test('a tour code with no tour behind it is a real not found, never an invented page', () => {
  const page = read('pages/hub/tours/[code].js');
  // /hub/tours/NOPE123 used to answer 200 with "NOPE123 Poker Tour ... is a
  // Poker Tour Followed On Smarter.Poker": a soft 404 that states a tour
  // exists. The page now refuses to name a tour it cannot find.
  assert.match(page, /let identity = registryEntry \? 'known' : 'not-found'/);
  assert.match(page, /identity = 'unavailable'/);
  assert.match(page, /if \(identity !== 'known'\) \{/);
  assert.match(page, /res\.statusCode = 404/);
  assert.match(page, /res\.statusCode = 503/);
  assert.match(page, /'Cache-Control', 'public, s-maxage=60'/);
  assert.match(page, /'Retry-After', '120'/);
  assert.match(page, /title=\{missing \? 'Tour Not Found' : 'Tour Directory Unavailable'\}/);
  assert.match(page, /noindex=\{true\}/);
  assert.match(page, /<DeepRouteNotice/);
  // The API is not asked about a tour the catalog has already denied.
  assert.match(page, /const swrKey = code && identity === 'known'/);
});

test('the painted notice is a real chassis with real recovery links', () => {
  const deck = read('src/components/poker-near-me/DeepRouteSignalDeck.jsx');
  assert.match(deck, /export function DeepRouteNotice\(/);
  assert.match(deck, /foot="foot"/);
  assert.match(deck, /className="pnm-deep-notice__link"/);

  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  assert.match(css, /\.pnm-deep-notice__link \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.pnm-deep-notice__link:focus-visible/);
  assert.match(css, /\.pnm-deep-notice__links \{[\s\S]*?border-top: 1px solid #000/);
  assert.doesNotMatch(css, /\.pnm-deep-notice__link:hover/);
});

test('a venue logo never fills a photographic band', () => {
  // The bundled directory carries 398 venues, zero cover photos and 191
  // profile photos, and a profile photo is the room's wordmark. It used to
  // fill the 16:8.5 card band and the venue hero, cropped to fit.
  const card = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.doesNotMatch(card, /cover_photo_url \|\| venue\.profile_photo_url/);
  assert.match(card, /const cover = String\(venue\.cover_photo_url \|\| ''\)\.trim\(\)/);
  assert.match(card, /naturalWidth \/ Math\.max\(1, naturalHeight\) >= 1\.2/);

  const venue = read('pages/hub/venues/[id].js');
  assert.doesNotMatch(venue, /image=\{venue\.cover_photo_url \|\| venue\.profile_photo_url\}/);
  assert.match(venue, /image=\{venue\.cover_photo_url \|\| null\}/);
});

test('the venue profile paints its waiting and not-found states', () => {
  const venue = read('pages/hub/venues/[id].js');
  assert.match(venue, /import DeepRouteSignalDeck, \{ DeepRouteNotice \}/);
  assert.match(venue, /title="Loading Venue"/);
  assert.match(venue, /title="Venue Not Found"/);
  assert.match(venue, /role="status" aria-live="polite"/);
  // A confirmed missing venue is still Next's own 404, not a page that
  // invents a room.
  assert.match(venue, /if \(!venue && confirmedMissing\) return \{ notFound: true \}/);
});

test('a directory keeps every link while staying a readable length', () => {
  const page = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  // Measured at 390px before this: /hub/poker-near-me/in/tx was 48,304px
  // tall with 86 full cards. The overflow is printed as rows, visible and
  // server rendered, so no venue link leaves the HTML.
  assert.match(page, /const DIRECTORY_CARD_LIMIT = 12/);
  assert.match(page, /function DirectoryIndex\(/);
  assert.match(page, /states\.slice\(DIRECTORY_CARD_LIMIT\)/);
  assert.match(page, /cities\.slice\(DIRECTORY_CARD_LIMIT\)/);
  assert.match(page, /venuesWithCashGames\.slice\(DIRECTORY_CARD_LIMIT\)/);
  assert.match(page, /venuesWithCashGames\.slice\(0, DIRECTORY_CARD_LIMIT\)/);
  // Nothing is hidden behind a toggle.
  assert.doesNotMatch(page, /<details/);
  assert.doesNotMatch(page, /display:\s*none/);

  const series = read('pages/hub/poker-series.js');
  assert.match(series, /const SERIES_PANEL_LIMIT = 12/);
  assert.match(series, /filteredSeries\.slice\(SERIES_PANEL_LIMIT\)/);
  // A separate class from the page's own A-to-Z `.series-index` section:
  // two different elements must not answer to one class name.
  assert.match(series, /className="series-more__link"/);
  assert.match(series, /className="series-index-link"/);
});

test('every directory index row is a real link at a real target size', () => {
  const css = read('src/styles/worlds/poker-near-me-console-deep.css');
  assert.match(css, /\.pnm-location-index__link \{[\s\S]*?min-height: 48px/);
  assert.match(css, /\.pnm-location-index__link \{[\s\S]*?border-top: 1px solid #000/);
  assert.match(css, /\.pnm-location-index__link:focus-visible/);
  assert.doesNotMatch(css, /\.pnm-location-index__link:hover/);
  // The desktop ceiling: a painted surface stops at the master's own width.
  assert.match(css, /\.pnm-location-index \{[\s\S]*?width: min\(100%, 1000px\)/);
});

test('the series directory row is painted, not a CSS card', () => {
  const page = read('pages/hub/poker-series.js');
  assert.match(page, /import \{ PokerNearMePanelShell, PokerNearMeConsoleIcon \}/);
  assert.match(page, /<PokerNearMePanelShell\s+key=\{series\.series_uid/);
  assert.doesNotMatch(page, /\.tour-card-premium::before/);
  assert.doesNotMatch(page, /\.tour-card-premium:hover/);
  assert.match(page, /body\.world-poker-near-me \.pnc-panel\.tour-card-premium \{[\s\S]*?background-image: none !important/);
  assert.match(page, /body\.world-poker-near-me \.pnc-panel\.tour-card-premium \{[\s\S]*?border-radius: 0 !important/);
  assert.match(page, /painted-controls-v1\/button-primary\.png/);
  assert.match(page, /painted-controls-v1\/button-secondary\.png/);
  assert.doesNotMatch(page, /\.tour-action-btn\.primary \{\s*background: linear-gradient/);
});

test('the save control clears the room-type label and meets the target floor', () => {
  const page = read('pages/hub/poker-series.js');
  // "Casino" printed underneath the heart on every row: the label sat at the
  // header's right with margin-left:auto, the control was absolutely
  // positioned over the same corner, and the control was 32px.
  assert.match(page, /\.tour-fav-btn \{[\s\S]*?width: 44px;\s*height: 44px/);
  assert.doesNotMatch(page, /\.tour-fav-btn:hover/);
  assert.match(page, /\.tour-card-header \{[\s\S]*?padding-right: 46px/);
  assert.match(page, /className="tour-region-tag tour-region-tag--type"/);
  assert.match(page, /aria-pressed=\{isFav \? 'true' : 'false'\}/);

  const tours = read('pages/hub/poker-tours.js');
  assert.match(tours, /\.tour-fav-btn \{[\s\S]*?width: 44px;\s*height: 44px/);
  assert.doesNotMatch(tours, /\.tour-fav-btn:hover/);
});

test('series and tour surfaces print figures as rows, never as rounded chips', () => {
  for (const file of ['pages/hub/poker-series.js', 'pages/hub/poker-tours.js']) {
    const page = read(file);
    assert.match(page, /\.tour-region-tag \{[\s\S]*?border-radius: 0/);
    assert.match(page, /\.tour-region-tag \{[\s\S]*?background: none/);
    assert.match(page, /\.tour-code-badge \{[\s\S]*?border-radius: 0/);
  }
});

test('the tour card is painted and carries no drawn icon family', () => {
  const card = read('src/components/poker-series/TourCard.js');
  assert.match(card, /import \{ PokerNearMePanelShell, PokerNearMeConsoleIcon \}/);
  assert.match(card, /<PokerNearMePanelShell/);
  assert.match(card, /<\/PokerNearMePanelShell>/);
  assert.doesNotMatch(card, /<svg/);
  assert.match(card, /<PokerNearMeConsoleIcon name="saved"/);
  assert.match(card, /<PokerNearMeConsoleIcon name="alert"/);
  // The real link the sitemap agrees with stays a link.
  assert.match(card, /href=\{detailHref\}/);
});

test('the series detail page is on the painted chassis, not on glass cards', () => {
  const page = read('pages/hub/series/[id].js');
  assert.match(page, /import \{ PokerNearMePanelShell, PokerNearMeConsoleIcon \}/);
  assert.doesNotMatch(page, /backdrop-filter: blur/);
  assert.doesNotMatch(page, /<div className="section-card">/);
  assert.doesNotMatch(page, /<div className="series-header">/);
  assert.doesNotMatch(page, /<div className="stats-grid">/);
  const opened = (page.match(/<PokerNearMePanelShell/g) || []).length;
  const closed = (page.match(/<\/PokerNearMePanelShell>/g) || []).length;
  assert.equal(opened, closed);
  assert.ok(opened >= 6, 'expected at least six painted panels, found ' + opened);
  assert.match(page, /painted-controls-v1\/button-primary\.png/);
  assert.match(page, /painted-controls-v1\/button-secondary\.png/);
  // A missing series keeps the branch it already had.
  assert.match(page, /title="Series Not Found"/);
  assert.match(page, /noindex=\{true\}/);
});

test('the deep surfaces keep their routes, canonicals and crawlable links', () => {
  for (const file of [
    'pages/hub/poker-near-me/in/index.js',
    'pages/hub/poker-near-me/in/[state]/index.js',
    'pages/hub/poker-near-me/in/[state]/[city].js',
    'pages/hub/venues/[id].js',
    'pages/hub/poker-tours.js',
    'pages/hub/tours/[code].js',
    'pages/hub/poker-series.js',
    'pages/hub/series/[id].js',
  ]) {
    assert.ok(exists(file), file);
  }
  const location = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.match(location, /breadcrumbs=\{\[/);
  assert.match(location, /PokerNearMeFamilyNav/);
  assert.match(location, /serializePokerJsonLd/);
  assert.match(location, /canonical=\{canonical\}/);

  const tour = read('pages/hub/tours/[code].js');
  assert.match(tour, /canonical=\{seo\.canonical\}/);
  assert.match(tour, /jsonLd=\{tourSchema/);
  assert.match(tour, /PokerNearMeFamilyNav/);
});
