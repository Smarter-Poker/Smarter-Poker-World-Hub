import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildVenueIntegrityQueue, filterVenueIntegrityQueue } from '../src/lib/poker-near-me/venueIntegrityOperations.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('operator queue keeps actionable source records and identifies duplicate groups', () => {
  const queue = buildVenueIntegrityQueue([
    { id: 1, name: 'Signal Room', city: 'Reno', state: 'NV', latitude: 39.52, longitude: -119.81 },
    { id: 2, name: 'Signal Room', city: 'Reno', state: 'NV', latitude: 39.53, longitude: -119.82 },
    { id: 3, name: 'Wrong State Room', city: 'Rohnert Park', state: 'CA', latitude: 36.12, longitude: -115.16 },
    { id: 4, name: 'Missing Pin', city: 'Austin', state: 'TX' },
    { id: 5, name: 'Alaska Boundary Pending', city: 'Anchorage', state: 'AK', latitude: 61.21, longitude: -149.9 },
  ]);

  assert.deepEqual(queue.summary, {
    input: 5,
    actionable: 5,
    duplicate_groups: 1,
    conflict: 1,
    missing: 1,
    duplicate: 2,
    unverified: 1,
  });
  assert.equal(queue.issues[0].id, 3);
  assert.equal(queue.issues[0].issue_type, 'conflict');
  assert.deepEqual(queue.issues.filter((issue) => issue.issue_type === 'duplicate').map((issue) => issue.related_ids), [[2], [1]]);
  assert.equal(filterVenueIntegrityQueue(queue.issues, { status: 'missing' })[0].id, 4);
  assert.equal(filterVenueIntegrityQueue(queue.issues, { search: 'anchorage' })[0].id, 5);
});

test('checked-in venue snapshots carry the live integrity contract', async () => {
  for (const path of ['data/all-venues.json', 'public/data/all-venues.json']) {
    const snapshot = JSON.parse(await read(path));
    assert.equal(snapshot.metadata.data_integrity.input, snapshot.venues.length);
    assert.equal(snapshot.metadata.data_integrity.output, snapshot.venues.length);
    assert.ok(snapshot.metadata.data_integrity.verified > 0);
    assert.ok(snapshot.venues.every((venue) => venue.location_quality?.status));
    assert.ok(snapshot.venues.filter((venue) => venue.location_quality.status === 'conflict')
      .every((venue) => venue.location_quality.mappable === false));
  }
});

test('admin correction surface is role-gated, MFA-gated, atomic, and audit logged', async () => {
  const [api, page, styles, migration, revisionMigration, sync, auditScript] = await Promise.all([
    read('pages/api/admin/venue-integrity.js'),
    read('pages/admin/venue-integrity.js'),
    read('styles/VenueIntegrityConsole.module.css'),
    read('supabase/migrations/20260830190000_venue_location_integrity_operations.sql'),
    read('supabase/migrations/20260830194000_venue_location_integrity_revision.sql'),
    read('scripts/sync_supabase_to_json.js'),
    read('scripts/apply-venue-integrity-to-json.mjs'),
  ]);

  assert.match(api, /ADMIN_ROLES = \['admin', 'superadmin', 'god'\]/);
  assert.match(api, /requireMfaEnrolled/);
  assert.match(api, /assessVenueLocation\(\{ \.\.\.current/);
  assert.match(api, /\['verified', 'border'\]\.includes/);
  assert.match(api, /resolve_venue_location_integrity/);
  assert.match(api, /venue_location_integrity_log/);
  assert.match(api, /recent_corrections/);
  assert.match(page, /Venue Integrity Operations/);
  assert.match(page, /expected_revision/);
  assert.match(api, /location_integrity_revision/);
  assert.match(page, /credentials: 'include'/);
  assert.match(page, /minLength=\{12\}/);
  assert.match(page, /process\.env\.NODE_ENV === 'development'/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /venue revision changed/);
  assert.match(migration, /venue_location_integrity_log/);
  assert.match(migration, /before_record jsonb NOT NULL/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.match(revisionMigration, /ADD COLUMN IF NOT EXISTS location_integrity_revision/);
  assert.match(revisionMigration, /v_before\.location_integrity_revision IS DISTINCT FROM p_expected_updated_at/);
  assert.doesNotMatch(revisionMigration, /v_before\.updated_at/);
  assert.match(sync, /applyVenueIntegrity\(formattedVenues\)/);
  assert.match(auditScript, /--check/);
});
