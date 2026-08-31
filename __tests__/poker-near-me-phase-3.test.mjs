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

test('primary discovery tabs implement roving keyboard focus and a labelled panel', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  const controller = read('src/components/poker-near-me/discoveryController.js');
  assert.match(controller, /const PRIMARY_TABS = \[/);
  assert.match(page, /event\.key === 'ArrowRight'/);
  assert.match(page, /event\.key === 'ArrowLeft'/);
  assert.match(page, /event\.key === 'Home'/);
  assert.match(page, /event\.key === 'End'/);
  assert.match(page, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(page, /aria-controls="pnm-primary-panel"/);
  assert.match(page, /id="pnm-primary-panel"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby=\{`pnm-tab-\$\{activePrimaryTab\}`\}/);
});

test('the shared family rail centers its current deep-link destination on mobile', () => {
  const nav = read('src/components/poker-near-me/PokerNearMeFamilyNav.jsx');
  assert.match(nav, /const railRef = useRef\(null\)/);
  assert.match(nav, /const activeRef = useRef\(null\)/);
  assert.match(nav, /active\.offsetLeft - \(\(rail\.clientWidth - active\.offsetWidth\) \/ 2\)/);
  assert.match(nav, /rail\.scrollTo\(\{ left: target, behavior: 'auto' \}\)/);
  assert.match(nav, /ref=\{active \? activeRef : undefined\}/);
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
  assert.match(page, /title="Home Games — Find Poker Home Games Near You"/);
  assert.doesNotMatch(page, /title="Home Games — Find Poker Home Games Near You \| Smarter\.Poker"/);
});
