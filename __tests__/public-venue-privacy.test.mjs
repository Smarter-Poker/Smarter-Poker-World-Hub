/**
 * Operator PII never leaves through a public venue surface (2026-11-11).
 * See src/lib/poker-near-me/publicVenuePrivacy.mjs for the two rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redactPublicVenue, isUnverifiedSelfRegistration } from '../src/lib/poker-near-me/publicVenuePrivacy.mjs';

const read = (p) => readFileSync(p, 'utf8');

test('operator fields are always removed; verified venues keep their business address and phone', () => {
  const verified = { id: 1, source: 'self_registration', data_quality: 'scraped_verified', address: '1 Main St', phone: '5550100', email: 'owner@example.invalid', claimed_by: 'u1', primary_contact_id: 'c1', city: 'X' };
  const out = redactPublicVenue(verified);
  for (const k of ['email', 'claimed_by', 'primary_contact_id']) assert.equal(k in out, false, k);
  assert.equal(out.address, '1 Main St');
  assert.equal(out.phone, '5550100');
  assert.equal(verified.email, 'owner@example.invalid', 'input is not mutated');
});

test('an unverified self-registration hides street address, ZIP, phone and coordinates but stays findable by city', () => {
  const v = { id: 2, source: 'self_registration', data_quality: 'unverified', address: '2 Home Rd', zip: '00000', phone: '5550101', lat: 1, lng: 2, latitude: 1, longitude: 2, city: 'Y', state: 'IL' };
  const out = redactPublicVenue(v);
  for (const k of ['address', 'zip', 'phone', 'lat', 'lng', 'latitude', 'longitude']) assert.equal(out[k], null, k);
  assert.equal(out.city, 'Y');
  assert.equal(isUnverifiedSelfRegistration({ source: 'self_registration', data_quality: 'unverified' }), true, '"unverified" is not verified');
  assert.equal(isUnverifiedSelfRegistration({ source: 'self_registration' }), true, 'missing quality is unverified');
  assert.equal(isUnverifiedSelfRegistration({ source: 'self_registration', data_quality: 'canonical' }), false);
  assert.equal(isUnverifiedSelfRegistration({ source: 'scraper', data_quality: 'unverified' }), false, 'scraped businesses keep their public address');
});

test('the checked-in public venue files carry no operator PII and no unverified self-registration contact data', () => {
  for (const f of ['public/data/all-venues.json', 'data/all-venues.json', 'public/data/poker-venue-directory-snapshot.json', 'data/poker-venue-directory-snapshot.json']) {
    const rows = JSON.parse(read(f)).venues;
    for (const r of rows) {
      for (const k of ['email', 'claimed_by', 'primary_contact_id']) assert.equal(r[k] == null, true, `${f} venue ${r.id} carries ${k}`);
      if (isUnverifiedSelfRegistration(r)) for (const k of ['address', 'zip', 'phone']) assert.equal(r[k] == null, true, `${f} venue ${r.id} publishes ${k}`);
    }
  }
  const dump = JSON.parse(read('api_output.json')).data;
  assert.equal(dump.some((r) => r.email || r.claimed_by), false, 'api_output.json carries operator PII');
});

test('every public venue boundary applies the redaction', () => {
  const api = read('pages/api/poker/venues.js');
  assert.match(api, /data: redactPublicVenues\(directory\.data\)/);
  assert.equal((api.match(/data: redactPublicVenue\(venue\)/g) || []).length, 2, 'both single-venue responses');
  assert.match(api, /data: redactPublicVenues\(limited\)/);
  assert.match(api, /data: redactPublicVenues\(fallbackVenues\)/);
  const dir = read('src/lib/poker-near-me/venueDirectoryServer.js');
  assert.match(dir, /return redactPublicVenue\(projected\);/);
  assert.match(dir, /data: page\.map\(redactPublicVenue\)/);
  assert.match(read('pages/hub/venues/[id].js'), /redactPublicVenue\(\{ \.\.\.out, source: row\.source, data_quality: row\.data_quality \}\)/);
  assert.match(read('scripts/sync_supabase_to_json.js'), /venues: redactPublicVenues\(integrity\.venues\)/);
});
