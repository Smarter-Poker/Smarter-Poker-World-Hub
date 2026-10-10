import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyCoordinateRepair, coordinateRepairSql, qualifyDuplicateRetirement, duplicateRetirementSql } from '../scripts/lib/pnm-coordinate-repair.mjs';

const now = Date.parse('2026-10-10T04:00:00Z');
const venue = { id: 3458, name: 'Encore Boston Harbor', venue_type: 'casino', city: 'Everett', state: 'MA', country: 'US', is_active: true, is_suppressed: false, canonical_venue_id: null, latitude: null, longitude: null, lat: null, lng: null, location_integrity_revision: '2026-09-01T10:00:00Z' };
const evidence = { id: 3458, status: 200, url: 'https://www.pokeratlas.com/poker-room/encore-boston-harbor-everett', final_url: 'https://www.pokeratlas.com/poker-room/encore-boston-harbor-everett', hash: 'a'.repeat(64), bytes: 110000, scraped_at: '2026-10-10T03:53:30Z', jsonld: [{ '@type': 'Casino', name: 'Encore Boston Harbor', address: { streetAddress: 'One Broadway', addressLocality: 'Everett', addressRegion: 'MA', addressCountry: 'United States' }, geo: { latitude: 42.39595, longitude: -71.06881 } }] };
const qualify = (v = venue, e = evidence, reviewed = {}) => qualifyCoordinateRepair(v, e, reviewed, now);

test('qualifies the exact physical room with fresh source provenance and state boundaries', () => {
  const plan = qualify();
  assert.equal(plan.accepted, true);
  assert.equal(plan.latitude, 42.39595);
  assert.equal(plan.address, 'One Broadway');
  assert.equal(plan.expected_revision, venue.location_integrity_revision);
  assert.equal(plan.source_sha256, evidence.hash);
});

test('never overwrites either coordinate representation or a conflicting address', () => {
  for (const key of ['latitude', 'longitude', 'lat', 'lng']) assert.equal(qualify({ ...venue, [key]: 0 }).reason, 'existing_coordinates_preserved');
  assert.equal(qualify({ ...venue, address: 'A different address' }).reason, 'existing_address_conflict');
});

test('does not geocode self-registered personal residences or traveling entities', () => {
  assert.equal(qualify({ ...venue, source: 'self_registration' }).reason, 'private_or_traveling_identity');
  for (const venue_type of ['home_game', 'charity', 'series', 'tour']) assert.equal(qualify({ ...venue, venue_type }).reason, 'private_or_traveling_identity');
});

test('rejects stale evidence, bad provenance, foreign rooms and redirects to another room', () => {
  assert.equal(qualify(venue, { ...evidence, scraped_at: '2026-09-01T00:00:00Z' }).reason, 'stale_or_invalid_evidence');
  assert.equal(qualify(venue, { ...evidence, hash: 'unknown' }).reason, 'missing_source_provenance');
  assert.equal(qualify(venue, { ...evidence, final_url: 'https://www.pokeratlas.com/poker-room/venetian-las-vegas' }).reason, 'unreviewed_redirect');
  assert.equal(qualify(venue, { ...evidence, url: 'http://localhost/private' }).reason, 'unqualified_source_response');
  const jsonld = structuredClone(evidence.jsonld);
  jsonld[0].address.addressCountry = 'Canada';
  assert.equal(qualify(venue, { ...evidence, jsonld }).reason, 'ambiguous_or_unmatched_physical_entity');
});

test('rejects another entity, publisher metadata, city centers without a physical address, and duplicate matches', () => {
  for (const change of [{ name: 'Venetian Las Vegas' }, { '@type': 'WebSite' }, { address: { ...evidence.jsonld[0].address, streetAddress: '' } }]) {
    assert.equal(qualify(venue, { ...evidence, jsonld: [{ ...evidence.jsonld[0], ...change }] }).accepted, false);
  }
  assert.equal(qualify(venue, { ...evidence, jsonld: [...evidence.jsonld, ...evidence.jsonld] }).reason, 'ambiguous_or_unmatched_physical_entity');
});

test('only explicit reviewed aliases may match and state-conflicting coordinates remain refused', () => {
  const renamed = { ...venue, name: 'Encore Boston' };
  assert.equal(qualify(renamed).accepted, false);
  assert.equal(qualify(renamed, evidence, { sourceName: 'Encore Boston Harbor' }).accepted, true);
  const jsonld = structuredClone(evidence.jsonld);
  jsonld[0].geo = { latitude: 36.1238067, longitude: -115.1683189 };
  assert.equal(qualify(venue, { ...evidence, jsonld }).reason, 'coordinate_state_conflict');
});

test('reviewed city corrections preserve the old city as concurrency preimage and fill only missing URLs', () => {
  const jsonld = structuredClone(evidence.jsonld);
  jsonld[0].url = 'https://www.encorebostonharbor.com/';
  const plan = qualify({ ...venue, city: 'Boston' }, { ...evidence, jsonld }, { sourceCity: 'Everett', correctCity: 'Everett' });
  assert.equal(plan.accepted, true);
  assert.equal(plan.city, 'Boston');
  assert.equal(plan.corrected_city, 'Everett');
  assert.equal(plan.website, 'https://www.encorebostonharbor.com/');
  assert.equal(qualify(venue, evidence, { correctCity: 'New York' }).reason, 'unmatched_city_correction');
  const sql = coordinateRepairSql([plan]);
  assert.match(sql, /v.city=p.city/);
  assert.match(sql, /city=p.corrected_city/);
  assert.match(sql, /website=coalesce\(nullif\(v.website,''\),p.website\)/);
  assert.match(sql, /pokeratlas_url=coalesce\(nullif\(v.pokeratlas_url,''\),p.source_url\)/);
});

test('atomic plans enforce exact preimage, missing coordinates, concurrency, bounded IDs and audit persistence', () => {
  const sql = coordinateRepairSql([qualify()]);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /FOR UPDATE OF v/);
  assert.match(sql, /location_integrity_revision=p.expected_revision/);
  assert.match(sql, /v.venue_type=p.venue_type/);
  assert.match(sql, /v.latitude IS NULL AND v.longitude IS NULL AND v.lat IS NULL AND v.lng IS NULL/);
  assert.match(sql, /INSERT INTO public.venue_location_integrity_log/);
  assert.match(sql, /RAISE EXCEPTION 'Coordinate repair audit count mismatch'/);
  assert.match(sql, /COMMIT;/);
  assert.throws(() => coordinateRepairSql([]));
  assert.throws(() => coordinateRepairSql([qualify(), qualify()]));
  assert.throws(() => coordinateRepairSql([{ ...qualify(), accepted: false }]));
});

test('duplicate retirement requires an exact active public physical target and source identity', () => {
  const target = { ...venue, id: 100, address: 'One Broadway', latitude: 42.39595, longitude: -71.06881, pokeratlas_url: evidence.final_url + '/tournaments' };
  const plan = qualifyDuplicateRetirement(venue, target, evidence, [], {}, now);
  assert.equal(plan.accepted, true);
  for (const change of [{ is_active: false }, { is_suppressed: true }, { source: 'self_registration' }, { latitude: 0 }, { address: 'Wrong address' }, { pokeratlas_url: 'https://www.pokeratlas.com/poker-room/other' }]) {
    assert.equal(qualifyDuplicateRetirement(venue, { ...target, ...change }, evidence, [], {}, now).accepted, false);
  }
  assert.equal(qualifyDuplicateRetirement(venue, venue, evidence, [], {}, now).accepted, false);
  assert.equal(qualifyDuplicateRetirement(venue, target, evidence, [{ id: 'broken', venue_id: venue.id }], {}, now).accepted, false);
});

test('duplicate SQL locks exact full preimages, retains URLs and histories, audits schedule preimages and impersonates nobody', () => {
  const target = { ...venue, id: 100, address: 'One Broadway', latitude: 42.39595, longitude: -71.06881, pokeratlas_url: evidence.final_url };
  const plan = qualifyDuplicateRetirement(venue, target, evidence, [], {}, now);
  const sql = duplicateRetirementSql([plan]);
  assert.match(sql, /actual IS DISTINCT FROM p->'before_record'/);
  assert.match(sql, /actual IS DISTINCT FROM p->'canonical_record'/);
  assert.match(sql, /Schedule cohort changed/);
  assert.match(sql, /Schedule preimage changed/);
  assert.match(sql, /jsonb_array_elements\(p->'schedules'\) AS e\(value\) WHERE e.value->>'is_active'/);
  assert.doesNotMatch(sql, /jsonb_array_elements\(p->'schedules'\) s WHERE s->>/);
  assert.match(sql, /_duplicate_schedule_preimages/);
  assert.match(sql, /retired_by=NULL/);
  assert.match(sql, /canonical_venue_id=\(p->>'canonical_id'\)::integer/);
  assert.doesNotMatch(sql, /DELETE FROM|UPDATE public\.poker_venues SET[^;]*slug=/i);
  assert.throws(() => duplicateRetirementSql([plan, plan]));
  assert.throws(() => duplicateRetirementSql([{ ...plan, accepted: false }]));
});
