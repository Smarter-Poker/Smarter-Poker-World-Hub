import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isVenueMapEligible, summarizeVenueIntegrity, isPublicCanonicalVenue } from '../src/lib/poker-near-me/venueIntegrity.js';
import { applyVenueIntegrity, assessVenueLocation } from '../src/lib/poker-near-me/venueIntegrityServer.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('alias targets must be active unsuppressed canonical public identities', async () => {
  const valid = { id: 12, is_active: true, is_suppressed: false, canonical_venue_id: null };
  assert.equal(isPublicCanonicalVenue(valid), true);
  for (const invalid of [null, {}, { ...valid, is_active: false }, { ...valid, is_suppressed: true }, { ...valid, canonical_venue_id: 13 }]) {
    assert.equal(isPublicCanonicalVenue(invalid), false);
  }
  const discovery = await read('pages/api/poker/venues.js');
  const publicDetail = await read('pages/api/public/venue/[id].js');
  assert.match(discovery, /!canonicalError && isPublicCanonicalVenue\(canonical\)/);
  assert.match(publicDetail, /!isPublicCanonicalVenue\(canonicalResult.data\)/);
  assert.match(publicDetail, /id = String\(venue.id\)/);
  assert.match(publicDetail, /venue && !isPublicCanonicalVenue\(venue\)/);
});

test('inactive listings and polygon matches cannot claim closure or verified addresses', async () => {
  const profile = await read('pages/hub/venues/[id].js');
  assert.match(profile, /venue.is_active === false/);
  assert.match(profile.match(/const PUBLIC_VENUE_FIELDS = \[[\s\S]*?\];/)?.[0] || '', /'is_active'/);
  assert.match(profile, /This does not confirm a permanent closure/);
  const location = await read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  assert.match(location, /State-Coordinate Match/);
  assert.doesNotMatch(location, />Location Verified</);
});

test('public venue handler resolves alias before downstream reads and refuses hidden targets', async () => {
  const source = await read('pages/api/public/venue/[id].js');
  const boundary = source.slice(source.indexOf('const safeQ ='), source.indexOf('if (venueError) {'));
  const execute = new Function('getSupabase', 'isPublicCanonicalVenue', 'reportApiError', `return async (req, res) => { ${boundary}; return { venue, id }; };`);
  const alias = { id: 1, is_active: false, is_suppressed: true, canonical_venue_id: 2 };
  const canonical = { id: 2, is_active: true, is_suppressed: false, canonical_venue_id: null };
  for (const target of [canonical, { ...canonical, is_active: false }, { ...canonical, is_suppressed: true }, { ...canonical, canonical_venue_id: 3 }, null]) {
    const reads = [];
    const database = { from() { let id; return { select() { return this; }, eq(_key, value) { id = value; return this; }, maybeSingle() { reads.push(id); return Promise.resolve({ data: String(id) === '1' ? alias : target, error: null }); } }; } };
    const res = { status(code) { this.code = code; return this; }, json(body) { return body; } };
    const result = await execute(() => database, isPublicCanonicalVenue, () => {})({ query: { id: '1' } }, res);
    assert.deepEqual(reads.map(String), ['1', '2']);
    if (target === canonical) {
      assert.equal(result.id, '2');
      assert.equal(result.venue.canonical_redirect_from, 1);
    } else assert.equal(res.code, 404);
  }
  const database = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: alias, error: new Error('ambiguous lookup') }); } }; } };
  const res = { status(code) { this.code = code; return this; }, json(body) { return body; } };
  await execute(() => database, isPublicCanonicalVenue, () => {})({ query: { id: '1' } }, res);
  assert.equal(res.code, 503);
});

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

test('foreign and traveling identities cannot masquerade as fixed US map venues', () => {
  assert.deepEqual(assessVenueLocation({
    name: 'Club Montmartre',
    venue_type: 'poker_club',
    city: 'Paris',
    state: 'Paris',
    country: 'US',
    latitude: 48.88365,
    longitude: 2.32748,
  }), {
    status: 'conflict', mappable: false, reason: 'state_unrecognized',
  });
  assert.deepEqual(assessVenueLocation({
    name: 'National Charity Tour',
    venue_type: 'charity',
    city: 'National',
    state: 'MULTI',
    country: 'US',
    latitude: 36.1674,
    longitude: -115.1484,
  }), {
    status: 'unverified', mappable: false, reason: 'traveling_entity',
  });
  assert.deepEqual(assessVenueLocation({
    name: 'Canadian Room',
    venue_type: 'casino',
    city: 'Windsor',
    state: 'ON',
    country: 'CA',
    latitude: 42.319,
    longitude: -83.039,
  }), {
    status: 'conflict', mappable: false, reason: 'country_outside_us',
  });
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
  const [api, map, panel, readout, detail, activity, tabPage, controller] = await Promise.all([
    read('pages/api/poker/venues.js'),
    read('src/components/poker-near-me/VenueMap.jsx'),
    read('src/components/poker-near-me/VenueMapPanel.jsx'),
    read('src/components/poker-near-me/MapCoverageReadout.jsx'),
    read('pages/hub/venues/[id].js'),
    read('src/lib/poker-near-me/activity.js'),
    read('pages/hub/poker-near-me/[pnmTab].js'),
    read('src/components/poker-near-me/discoveryController.js'),
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
  assert.match(readout, /Held For Review/);
  assert.match(readout, /Privacy-Safe/);
  assert.match(detail, /Location Signal Held For Review/);
  assert.match(detail, /!locationConflict && venue\.latitude/);
  assert.match(activity, /held_count:/);
  assert.doesNotMatch(activity, /\blatitude\b|\blongitude\b/);
  assert.match(tabPage, /sp-offline-venues-integrity-v2/);
  assert.match(controller, /DIRECTORY_PAGE_SIZE = 160/);
  assert.match(tabPage, /DIRECTORY_PAGE_SIZE[\s\S]*discoveryController/);
  assert.match(tabPage, /view=directory&limit=\$\{DIRECTORY_PAGE_SIZE\}&offset=\$\{offset\}/);
  assert.match(tabPage, /Venue directory did not include signal integrity metadata/);
  assert.match(tabPage, /reason: 'offline_snapshot'/);
});
