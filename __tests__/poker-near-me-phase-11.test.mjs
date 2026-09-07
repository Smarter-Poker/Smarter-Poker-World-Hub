import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildSnapshotVenueDirectory,
  fetchVenueDirectoryResilient,
  VENUE_DIRECTORY_FIELD_LIST,
} from '../src/lib/poker-near-me/venueDirectoryServer.js';

const root = new URL('../', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');

const venue = (overrides = {}) => ({
  id: 1,
  name: 'Signal Room',
  venue_type: 'casino',
  city: 'Las Vegas',
  state: 'NV',
  latitude: 36.17,
  longitude: -115.14,
  is_active: true,
  is_suppressed: false,
  trust_score: 88,
  pokeratlas_slug: 'signal-room-las-vegas',
  email: 'private@example.com',
  search_vector: 'internal search document',
  ...overrides,
});

function failingSupabase(message = 'JWT issued at future') {
  const query = {
    select() { return query; },
    eq() { return query; },
    neq() { return query; },
    is() { return query; },
    not() { return query; },
    ilike() { return query; },
    textSearch() { return query; },
    order() { return query; },
    range() { return query; },
    then(resolve) { return Promise.resolve({ data: null, error: new Error(message), count: null }).then(resolve); },
  };
  return { from() { return query; } };
}

test('snapshot directory preserves filters, integrity, order, and the public projection', () => {
  const result = buildSnapshotVenueDirectory({
    params: { state: 'NV', type: 'casino', search: 'signal las', limit: 1 },
    venues: [
      venue({ id: 2, name: 'Lower Signal Room', trust_score: 20 }),
      venue({ id: 1, is_featured: true }),
      venue({ id: 3, state: 'CA' }),
      venue({ id: 4, is_suppressed: true }),
      venue({ id: 5, canonical_venue_id: 1 }),
      venue({ id: 6, venue_type: 'series' }),
    ],
  });

  assert.equal(result.degraded, true);
  assert.equal(result.data_source, 'static_snapshot');
  assert.equal(result.total, 2);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, 1);
  assert.equal(result.data[0].location_quality.mappable, true);
  assert.equal(result.data[0].pokeratlas_slug, 'signal-room-las-vegas');
  assert.equal(result.data[0].email, undefined);
  assert.equal(result.data[0].search_vector, undefined);
  assert.ok(VENUE_DIRECTORY_FIELD_LIST.every((field) => field !== 'email' && field !== 'search_vector'));
  assert.ok(VENUE_DIRECTORY_FIELD_LIST.includes('pokeratlas_slug'));
});

test('checked-in fallback directory retains safe PokerAtlas identity keys', async () => {
  const snapshot = JSON.parse(await source('data/poker-venue-directory-snapshot.json'));
  const bellagio = snapshot.venues.find((row) => row.name === 'Bellagio Poker Room');
  const borgata = snapshot.venues.find((row) => row.name === 'Borgata Hotel Casino');
  assert.equal(bellagio?.pokeratlas_slug, 'bellagio-poker-room-las-vegas');
  assert.equal(borgata?.pokeratlas_slug, 'borgata-hotel-casino-atlantic-city');
});

test('location holds stay searchable but never enter a bounded map result', () => {
  const traveling = venue({
    id: 7,
    name: 'National Charity Tour',
    venue_type: 'charity',
    city: 'National',
    state: 'MULTI',
  });
  const list = buildSnapshotVenueDirectory({
    params: { limit: 20 },
    venues: [traveling],
  });
  assert.equal(list.total, 1);
  assert.deepEqual(list.data[0].location_quality, {
    status: 'unverified', mappable: false, reason: 'traveling_entity',
  });

  const map = buildSnapshotVenueDirectory({
    params: { north: 40, south: 30, east: -110, west: -120, limit: 20 },
    venues: [traveling],
  });
  assert.equal(map.total, 0);
  assert.deepEqual(map.data, []);
});

test('public directory degrades to the projected snapshot without exposing the database error', async () => {
  let fallbackMessage = '';
  const result = await fetchVenueDirectoryResilient({
    supabase: failingSupabase(),
    params: { state: 'NV', limit: 24 },
    fallbackVenues: [venue()],
    onFallback: (error) => { fallbackMessage = error.message; },
  });

  assert.equal(fallbackMessage, 'JWT issued at future');
  assert.equal(result.degraded, true);
  assert.equal(result.data_source, 'static_snapshot');
  assert.equal(result.data.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /JWT issued at future/);
});

test('an unexpected empty live projection uses snapshot rows without inventing empty locations', async () => {
  const emptyQuery = {
    select() { return emptyQuery; },
    eq() { return emptyQuery; },
    neq() { return emptyQuery; },
    is() { return emptyQuery; },
    not() { return emptyQuery; },
    ilike() { return emptyQuery; },
    textSearch() { return emptyQuery; },
    order() { return emptyQuery; },
    range() { return emptyQuery; },
    then(resolve) { return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve); },
  };
  const supabase = { from() { return emptyQuery; } };
  const fallbackVenues = [venue({ state: 'NV' })];

  const matched = await fetchVenueDirectoryResilient({
    supabase,
    params: { state: 'NV' },
    fallbackVenues,
  });
  assert.equal(matched.degraded, true);
  assert.equal(matched.total, 1);

  const genuinelyEmpty = await fetchVenueDirectoryResilient({
    supabase,
    params: { state: 'AK' },
    fallbackVenues,
  });
  assert.equal(genuinelyEmpty.degraded, false);
  assert.equal(genuinelyEmpty.total, 0);
});

test('invalid viewport requests remain 400-class errors instead of entering snapshot mode', async () => {
  await assert.rejects(
    fetchVenueDirectoryResilient({
      supabase: failingSupabase(),
      params: { north: 'nope', south: '1', east: '1', west: '1' },
      fallbackVenues: [venue()],
    }),
    (error) => error?.statusCode === 400,
  );
});

test('API, SSR, location families, and lobby accessibility share the Phase 11 contract', async () => {
  const [api, discovery, locations, lobby, lobbyCss] = await Promise.all([
    source('pages/api/poker/venues.js'),
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('src/lib/poker-near-me/locationPages.js'),
    source('pages/hub/poker-near-me/lobby.js'),
    source('src/styles/worlds/poker-near-me-lobby.css'),
  ]);

  assert.match(api, /fetchVenueDirectoryResilient/);
  assert.match(api, /X-PNM-Data-Source/);
  assert.match(api, /if \(directory\.degraded\) res\.setHeader\('Cache-Control', 'no-store'\)/);
  assert.match(discovery, /data-directory-source/);
  assert.match(discovery, /Retry Live Registry/);
  assert.match(discovery, /fetchVenueDirectoryResilient/);
  assert.match(discovery, /<section className="pnm-layout" aria-label="Poker Near Me discovery results">/);
  assert.match(locations, /fetchVenueDirectoryResilient/);
  assert.match(lobby, /<section id="pnm-lobby-main"/);
  assert.match(lobby, /Skip To Poker Near Me Choices/);
  assert.match(lobbyCss, /min-width: 44px !important/);
  assert.match(lobbyCss, /min-height: 44px !important/);
});
