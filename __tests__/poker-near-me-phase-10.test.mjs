import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fetchVenueDirectory, VENUE_DIRECTORY_FIELDS } from '../src/lib/poker-near-me/venueDirectoryServer.js';
import { buildVenueIntegrityStateRows } from '../src/lib/poker-near-me/venueIntegrityState.js';

const root = new URL('../', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');

function queryMock(rows) {
  const calls = [];
  const query = {
    select(fields, options) { calls.push(['select', fields, options]); return query; },
    eq(...args) { calls.push(['eq', ...args]); return query; },
    neq(...args) { calls.push(['neq', ...args]); return query; },
    is(...args) { calls.push(['is', ...args]); return query; },
    not(...args) { calls.push(['not', ...args]); return query; },
    ilike(...args) { calls.push(['ilike', ...args]); return query; },
    or(...args) { calls.push(['or', ...args]); return query; },
    order(...args) { calls.push(['order', ...args]); return query; },
    range(...args) { calls.push(['range', ...args]); return query; },
    then(resolve) { return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve); },
  };
  return { supabase: { from(table) { calls.push(['from', table]); return query; } }, calls };
}

test('directory view uses an explicit projection and excludes retired aliases', async () => {
  const { supabase, calls } = queryMock([{
    id: 10,
    name: 'Signal Room',
    venue_type: 'casino',
    city: 'Las Vegas',
    state: 'NV',
    latitude: 36.17,
    longitude: -115.14,
    is_active: true,
    is_suppressed: false,
  }]);
  const result = await fetchVenueDirectory({ supabase, params: { limit: 24, state: 'NV' } });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].location_quality.mappable, true);
  assert.ok(!VENUE_DIRECTORY_FIELDS.includes('*'));
  assert.ok(calls.some((call) => call[0] === 'is' && call[1] === 'canonical_venue_id' && call[2] === null));
  assert.ok(calls.some((call) => call[0] === 'neq' && call[1] === 'id' && call[2] === 3109));
  assert.ok(calls.some((call) => call[0] === 'range' && call[1] === 0 && call[2] === 23));
});

test('exact state sync preserves polygon conflicts and multi-signal remediation', () => {
  const rows = buildVenueIntegrityStateRows([{
    id: 88, name: 'Boundary Test', venue_type: 'casino', city: 'Las Vegas', state: 'NV',
    latitude: 41.88, longitude: -87.63, is_active: true, is_suppressed: false,
    location_integrity_revision: '2026-08-30T00:00:00.000Z',
  }], Date.parse('2026-08-30T00:00:00.000Z'));
  assert.equal(rows[0].location_status, 'conflict');
  assert.equal(rows[0].mappable, false);
  assert.deepEqual(rows[0].issue_types, ['conflict', 'incomplete', 'stale']);
  assert.equal(rows[0].primary_issue, 'conflict');
});

test('admin API keeps authentication, MFA, revisions, and audited RPCs on every write path', async () => {
  const api = await source('pages/api/admin/venue-integrity.js');
  assert.match(api, /getServerUserWithFallback/);
  assert.match(api, /requireMfaEnrolled/);
  assert.match(api, /apply_venue_directory_enrichment/);
  assert.match(api, /retire_duplicate_poker_venue/);
  assert.match(api, /syncVenueIntegrityState/);
  assert.match(api, /p_expected_revision/);
  assert.match(api, /venue_location_integrity_state/);
  assert.doesNotMatch(api, /\.single\(\)/);
});

test('phase 10 migrations retain history and add indexed duplicate state', async () => {
  const operations = await source('supabase/migrations/20260830210000_pnm_phase10_directory_operations.sql');
  const duplicateRefresh = await source('supabase/migrations/20260830211500_pnm_phase10_duplicate_state_refresh.sql');
  assert.match(operations, /canonical_venue_id integer REFERENCES public\.poker_venues/);
  assert.match(operations, /venue_directory_enrichment_log/);
  assert.match(operations, /venue_duplicate_retirement_log/);
  assert.match(operations, /GRANT EXECUTE[^]*TO service_role/);
  assert.match(duplicateRefresh, /HAVING count\(\*\) > 1/);
  assert.match(duplicateRefresh, /array_remove\(duplicate_group\.venue_ids, identity\.id\)/);
});

test('first discovery and location pages use the fast server directory', async () => {
  const page = await source('pages/hub/poker-near-me/[pnmTab].js');
  const locations = await source('src/lib/poker-near-me/locationPages.js');
  const venuePage = await source('pages/hub/venues/[id].js');
  const reviewsApi = await source('pages/api/poker/reviews.js');
  assert.match(page, /export async function getServerSideProps/);
  assert.match(page, /view=directory&limit=1000/);
  assert.match(page, /pnm-ssr-directory/);
  assert.match(locations, /fetchVenueDirectory/);
  assert.doesNotMatch(locations, /\/api\/poker\/venues/);
  assert.match(venuePage, /data\.canonical_venue_id/);
  assert.match(venuePage, /permanent: true/);
  assert.match(page, /\^\\d\+\$\/\.test\(String\(id\)\)/);
  assert.match(reviewsApi, /filter\(v => \/\^\\d\+\$\/\.test\(v\)\)/);
});
