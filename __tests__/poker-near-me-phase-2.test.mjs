import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('first-time visitors are not prompted for geolocation on mount', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  assert.match(page, /if \(hasSavedLocation && !hasSavedCity/);
  assert.match(page, /First-time permission requests now happen only from an/);
  assert.doesNotMatch(page, /else \{\s*requestGpsLocation\(\);\s*\}/);
});

test('discovery status rail distinguishes live, modeled, and offline data', () => {
  const rail = read('src/components/poker-near-me/DiscoveryStatusRail.jsx');
  assert.match(rail, /aria-label="Discovery data status"/);
  assert.match(rail, /aria-live="polite"/);
  assert.match(rail, /Live observations/);
  assert.match(rail, /Observed \+ modeled/);
  assert.match(rail, /Modeled coverage/);
  assert.match(rail, /Feed offline/);
  assert.match(rail, /'Pending'/);

  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  assert.match(page, /<DiscoveryStatusRail/);
  assert.match(page, /liveDataAgeMinutes=\{liveDataAgeMinutes\}/);
  assert.match(page, /liveDataMode == null \|\| liveDataMode === 'none'/);
  assert.doesNotMatch(page, /liveDataMode === 'none'\s*\? '0'/);
});

test('location recovery dialog is keyboard-addressable and casino themed', () => {
  const modal = read('src/components/ui/LocationEnableModal.jsx');
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === 'Escape'/);
  assert.match(modal, /closeButtonRef\.current\?\.focus/);
  assert.match(modal, /location-enable-modal__frame/);

  const theme = read('src/styles/worlds/poker-near-me.css');
  assert.match(theme, /body\.world-poker-near-me \.location-enable-modal__frame/);
  assert.match(theme, /border-radius: 4px !important/);
});

test('tour artwork and compact mobile actions have resilient fallbacks', () => {
  const tour = read('src/components/poker-near-me/TourCard.js');
  assert.match(tour, /onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.match(tour, /aria-pressed=\{!!isFavorited\}/);
  assert.match(tour, /<button[\s\S]*className="action-btn primary"/);

  const venue = read('src/components/poker-near-me/VenueCard.js');
  assert.match(venue, /aria-label=\{`Get directions to/);
  assert.match(venue, /aria-label=\{`Call /);

  const theme = read('src/styles/worlds/poker-near-me.css');
  assert.match(theme, /:is\(\.fav-btn, \.vc3-fav, \.vc3-icon-btn, \.map-recenter-btn\)/);
  assert.match(theme, /min-width: 44px !important/);
  assert.match(theme, /\.pnm-filter-bar \{\s*min-height: 86px;\s*flex: 0 0 86px;/);
});
