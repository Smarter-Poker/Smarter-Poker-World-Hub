import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dynamic discovery routes publish their own heading, title, description, and breadcrumb', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  const controller = read('src/components/poker-near-me/discoveryController.js');
  for (const slug of ['venues', 'map', 'saved', 'live-games', 'tours', 'series', 'daily-tournaments', 'events-calendar', 'more', 'roadtrip', 'alerts']) {
    assert.match(controller, new RegExp(`['"]?${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*:`));
  }
  assert.match(controller, /function normalizeRouteSlug/);
  assert.match(page, /import \{[\s\S]*normalizeRouteSlug[\s\S]*from '.{0,80}discoveryController'/);
  assert.match(page, /const requestedCanonicalSlug = normalizeRouteSlug\(router\.query\.pnmTab\)/);
  assert.match(page, /title=\{routeMeta\.title\}/);
  assert.match(page, /description=\{routeMeta\.description\}/);
  assert.match(page, /<h1 className="pnm-title">\{routeMeta\.heading\}<\/h1>/);
  assert.match(page, /name: routeMeta\.breadcrumb/);
});

// Mobile phase 3 (2026-09-04) replaced the ARIA tablist (roving tabindex,
// one labelled tabpanel that unmounted every other surface) with an in-page
// anchor row: every surface is a stacked <section aria-labelledby> that is
// always in the DOM, and the row is a <nav> of plain buttons that scroll to
// a section and carry aria-current. A tablist would be wrong here because
// there is no longer a single panel the tabs control. The keyboard model is
// the native one (every button is in the tab order), so the roving
// ArrowLeft/ArrowRight/Home/End handler is gone with the tablist. This pin
// now guards the anchor-row contract instead.
test('primary discovery surfaces are an anchor row over labelled stacked sections', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  const sections = read('src/components/poker-near-me/pnmSections.js');
  assert.match(sections, /export const PRIMARY_SECTIONS = \[/);
  assert.match(page, /<nav\s+className="pnm-top-tabs"\s+aria-label="Poker Near Me sections"/);
  assert.match(page, /aria-current=\{selected \? 'true' : undefined\}/);
  assert.doesNotMatch(page, /tabIndex=\{selected \? 0 : -1\}/, 'no roving tabindex: every anchor is in the tab order');
  assert.doesNotMatch(page, /role="tabpanel"|role="tablist"/);
  for (const key of ['venues', 'events', 'live', 'map', 'saved', 'more']) {
    assert.match(page, new RegExp(`id=\\{sectionId\\('${key}'\\)\\}[\\s\\S]{0,200}aria-labelledby="pnm-section-${key}-title"`), `section ${key} is labelled`);
  }
});

// Mobile phase 3: the family rail WRAPS (every link visible at every width),
// so there is no sideways scroller to centre the active link inside. The
// centring effect this used to pin (railRef / activeRef / rail.scrollTo)
// existed only because the rail overflowed; the pin moves to the wrapping
// rule and to the component no longer scrolling anything.
test('the shared family rail wraps and still names every destination', () => {
  const nav = read('src/components/poker-near-me/PokerNearMeFamilyNav.jsx');
  const world = read('src/styles/worlds/poker-near-me.css');
  assert.match(world, /\.pnm-family-nav__rail \{[^}]*flex-wrap: wrap;/s);
  assert.doesNotMatch(nav, /scrollTo\(|scrollLeft|railRef|activeRef/);
  assert.match(nav, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(nav, /poker-near-me\/events-calendar/);
});

test('both lobby location recovery sheets are focus-managed physical dialogs', () => {
  const permission = read('src/components/poker-near-me/modals/LocationEnablePopup.js');
  const manual = read('src/components/poker-near-me/modals/ManualLocationModal.js');
  const theme = read('src/styles/worlds/poker-near-me.css');

  for (const modal of [permission, manual]) {
    assert.match(modal, /role="dialog"/);
    assert.match(modal, /aria-modal="true"/);
    assert.match(modal, /event\.key === 'Escape'/);
    assert.match(modal, /event\.key !== 'Tab'/);
    assert.match(modal, /acquireScrollLock/);
    assert.match(modal, /returnFocusRef\.current\?\.focus\?\.\(\)/);
    assert.doesNotMatch(modal, /backdropFilter|borderRadius:\s*1[028]/);
  }

  assert.match(theme, /\.pnm-location-sheet__frame \{/);
  assert.match(theme, /\.pnm-location-sheet__energy \{/);
  assert.match(theme, /border-radius: 4px;/);
  assert.match(theme, /grid-template-columns: minmax\(0, 2fr\) minmax\(110px, 0\.8fr\)/);
});

test('the lobby never stacks a location prompt over its first-run tutorial', () => {
  const lobby = read('pages/hub/poker-near-me/lobby.js');
  assert.match(lobby, /Never open a permission sheet or browser prompt on mount/);
  assert.match(lobby, /'prompt' and 'denied' wait for the explicit Enable Location control/);
  assert.doesNotMatch(lobby, /Permission state is 'prompt' or 'denied' — show our branded popup/);
});

test('Home Games leaves the global brand suffix to SEOHead', () => {
  const page = read('pages/hub/home-games.js');
  assert.match(page, /title="Home Games - Find Poker Home Games Near You"/);
  assert.doesNotMatch(page, /title="Home Games - Find Poker Home Games Near You \| Smarter\.Poker"/);
});
