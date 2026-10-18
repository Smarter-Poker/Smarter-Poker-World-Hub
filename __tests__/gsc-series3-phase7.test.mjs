import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');

test('Phase 7: locationPages.js implements nearbyVenues fallback defense', async () => {
  const content = await source('src/lib/poker-near-me/locationPages.js');
  assert.ok(content.includes('nearbyVenues'), 'locationPages must export nearbyVenues in payload');
  assert.ok(content.includes('allStateVenues'), 'locationPages must collect all state venues for fallback');
  assert.ok(content.includes('venues.length < 3'), 'locationPages must trigger enrichment when venue count < 3');
});

test('Phase 7: PokerNearMeLocationPage renders Nearby Poker Rooms section for thin content defense', async () => {
  const content = await source('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.ok(content.includes('nearbyVenues = []'), 'Component must accept nearbyVenues prop');
  assert.ok(content.includes('pnm-nearby-venues-heading'), 'Component must render nearby-venues heading');
  assert.ok(content.includes('Nearby Poker Rooms In'), 'Component must display Title-Cased section title');
  assert.ok(content.includes('Regional Coverage'), 'Component must display Regional Coverage chip');
});

test('Phase 7: City SSR route passes nearbyVenues to page props', async () => {
  const content = await source('pages/hub/poker-near-me/in/[state]/[city].js');
  assert.ok(content.includes('props: { ...result'), 'City SSR route must spread fetchPokerVenueLocation result');
});
