import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isVenueMapEligible, summarizeVenueIntegrity } from '../src/lib/poker-near-me/venueIntegrity.js';
import { applyVenueIntegrity, assessVenueLocation } from '../src/lib/poker-near-me/venueIntegrityServer.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('state polygons hold contradictory venue coordinates out of maps', () => {
  const conflict = { name: 'California Identity With Nevada Pin', state: 'CA', latitude: 36.1238, longitude: -115.1683 };
  const verified = { name: 'Las Vegas Room', state: 'NV', latitude: 36.1238, longitude: -115.1683 };
  const privateHome = { name: 'Private Table', venue_type: 'home_game', state: 'NV', latitude: 36.12, longitude: -115.16 };

  assert.deepEqual(assessVenueLocation(conflict), {
    status: 'conflict', mappable: false, reason: 'state_coordinate_conflict',
  });
  assert.equal(assessVenueLocation(verified).status, 'verified');
  assert.deepEqual(assessVenueLocation(privateHome), {
    status: 'approximate', mappable: true, reason: 'privacy_protected',
  });
  assert.equal(assessVenueLocation({ state: 'NV' }).status, 'missing');
});

test('duplicate resolution selects one complete record and never blends fields', () => {
  const result = applyVenueIntegrity([
    {
      id: 100,
      name: 'Signal Poker Room',
      city: 'Rohnert Park',
      state: 'CA',
      latitude: 36.1238,
      longitude: -115.1683,
      phone: '(702) 555-0100',
      address: 'Wrong source address',
    },
    {
      id: 101,
      name: 'Signal Poker Room',
      city: 'Rohnert Park',
      state: 'CA',
      latitude: 38.3396,
      longitude: -122.7011,
      data_quality: 'scraped_verified',
    },
  ]);

  assert.equal(result.venues.length, 1);
  assert.equal(result.summary.duplicate_count, 1);
  assert.equal(result.venues[0].id, 101);
  assert.equal(result.venues[0].phone, undefined);
  assert.equal(result.venues[0].address, undefined);
  assert.equal(isVenueMapEligible(result.venues[0]), true);

  const anonymous = applyVenueIntegrity([
    { name: 'Imported room awaiting identity' },
    { name: 'Imported room awaiting identity' },
  ]);
  assert.equal(anonymous.venues.length, 2);
  assert.equal(anonymous.summary.duplicate_count, 0);
});

test('client integrity summary distinguishes verified, privacy-safe, missing, and held signals', () => {
  const venues = [
    { latitude: 36.1, longitude: -115.1, location_quality: { status: 'verified', mappable: true } },
    { venue_type: 'home_game', latitude: 36.2, longitude: -115.2, location_quality: { status: 'approximate', mappable: true } },
    { latitude: null, longitude: null, location_quality: { status: 'missing', mappable: false } },
    { latitude: 36.3, longitude: -115.3, location_quality: { status: 'conflict', mappable: false } },
  ];
  assert.deepEqual(summarizeVenueIntegrity(venues), {
    input: 4, mapped: 2, verified: 1, approximate: 1, unverified: 0, missing: 1, held: 1,
  });
});

test('venue API and both shared maps enforce the integrity contract', async () => {
  const [api, map, panel, readout, detail, activity, tabPage] = await Promise.all([
    read('pages/api/poker/venues.js'),
    read('src/components/poker-near-me/VenueMap.jsx'),
    read('src/components/poker-near-me/VenueMapPanel.jsx'),
    read('src/components/poker-near-me/MapCoverageReadout.jsx'),
    read('pages/hub/venues/[id].js'),
    read('src/lib/poker-near-me/activity.js'),
    read('pages/hub/poker-near-me/[pnmTab].js'),
  ]);

  assert.match(api, /applyVenueIntegrity\(venues\)/);
  assert.match(api, /location_quality\?\.mappable !== false/);
  assert.match(api, /data_integrity: integritySummary/);
  for (const source of [map, panel]) {
    assert.match(source, /isVenueMapEligible/);
    assert.match(source, /data-map-integrity-held/);
    assert.match(source, /verified_count/);
    assert.match(source, /approximate_count/);
    assert.match(source, /held_count/);
  }
  assert.match(readout, /held for review/);
  assert.match(readout, /privacy-safe/);
  assert.match(detail, /Location signal held for review/);
  assert.match(detail, /!locationConflict && venue\.latitude/);
  assert.match(activity, /held_count:/);
  assert.doesNotMatch(activity, /\blatitude\b|\blongitude\b/);
  assert.match(tabPage, /sp-offline-venues-integrity-v2/);
  assert.match(tabPage, /DIRECTORY_PAGE_SIZE = 160/);
  assert.match(tabPage, /view=directory&limit=\$\{DIRECTORY_PAGE_SIZE\}&offset=\$\{offset\}/);
  assert.match(tabPage, /Venue directory did not include signal integrity metadata/);
  assert.match(tabPage, /reason: 'offline_snapshot'/);
});
