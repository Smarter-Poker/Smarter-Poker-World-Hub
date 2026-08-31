import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { buildSnapshotVenueDirectory } from '../src/lib/poker-near-me/venueDirectoryServer.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const json = async (path) => JSON.parse(await source(path));
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('server and browser directory snapshots are fresh, exact, and projection-only', async () => {
  const [serverText, publicText] = await Promise.all([
    source('data/poker-venue-directory-snapshot.json'),
    source('public/data/poker-venue-directory-snapshot.json'),
  ]);
  assert.equal(serverText, publicText);

  const snapshot = JSON.parse(serverText);
  const directory = buildSnapshotVenueDirectory({
    params: { limit: 1000, offset: 0 },
    venues: snapshot.venues,
    metadata: snapshot.metadata,
  });
  assert.equal(directory.total, snapshot.metadata.public_count);
  assert.equal(sha(directory.data), snapshot.metadata.projected_sha256);
  assert.equal(directory.snapshot.generated_at, snapshot.metadata.generated_at);
  assert.match(directory.data_revision, /^snapshot:[a-f0-9]{16}$/);
  assert.ok(Date.now() - Date.parse(snapshot.metadata.generated_at) < 30 * 86_400_000);
  assert.ok(directory.data.every((venue) => venue.id && venue.location_quality?.status));
  assert.ok(directory.data.every((venue) => venue.email === undefined && venue.search_vector === undefined));
});

test('directory API and every SSR location family use the dedicated snapshot provenance', async () => {
  const [api, discovery, locations, country, state, city, structured] = await Promise.all([
    source('pages/api/poker/venues.js'),
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('src/lib/poker-near-me/locationPages.js'),
    source('pages/hub/poker-near-me/in/index.js'),
    source('pages/hub/poker-near-me/in/[state]/index.js'),
    source('pages/hub/poker-near-me/in/[state]/[city].js'),
    source('src/lib/poker-near-me/structuredData.js'),
  ]);
  assert.match(api, /poker-venue-directory-snapshot\.json/);
  assert.match(api, /X-PNM-Data-Revision/);
  assert.match(api, /X-PNM-Snapshot-Generated-At/);
  assert.match(discovery, /poker-venue-directory-snapshot\.json/);
  assert.match(locations, /poker-venue-directory-snapshot\.json/);
  assert.doesNotMatch(locations, /all-venues\.json/);
  for (const route of [country, state, city]) {
    assert.match(route, /dataSource/);
    assert.match(route, /dataRevision/);
    assert.match(route, /snapshot/);
  }
  assert.match(structured, /dateModified: fetchedAt/);
});

test('discovery progressively hydrates, cancels safely, caches revisions, and reports partial live state', async () => {
  const [page, activity, css] = await Promise.all([
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('src/lib/poker-near-me/activity.js'),
    source('src/styles/worlds/poker-near-me.css'),
  ]);
  assert.match(page, /DIRECTORY_PAGE_SIZE = 160/);
  assert.match(page, /requestIdleCallback/);
  assert.match(page, /new AbortController\(\)/);
  assert.match(page, /controller\.abort\(\)/);
  assert.match(page, /mergePages/);
  assert.match(page, /sp-offline-venues-integrity-v2/);
  assert.match(page, /directory_load_interrupted/);
  assert.match(page, /partial_live/);
  assert.match(page, /includeVenues: initialVenues\.length === 0/);
  assert.match(activity, /data_revision/);
  assert.match(activity, /snapshot_age_days/);
  assert.match(activity, /complete:/);
  assert.match(css, /data-directory-source='supabase'/);
  assert.match(css, /data-directory-source='partial_live'/);
});

test('four distinct regional WebP visuals are wired with non-deceptive artwork labels', async () => {
  const files = [
    'public/images/pnm-phase-12/location-pacific-command-v1.webp',
    'public/images/pnm-phase-12/location-southwest-command-v1.webp',
    'public/images/pnm-phase-12/location-heartland-command-v1.webp',
    'public/images/pnm-phase-12/location-atlantic-command-v1.webp',
  ];
  const buffers = await Promise.all(files.map(async (path) => {
    const info = await stat(new URL(path, root));
    assert.ok(info.size > 100_000, `${path} is unexpectedly small`);
    return readFile(new URL(path, root));
  }));
  assert.equal(new Set(buffers.map((buffer) => createHash('sha256').update(buffer).digest('hex'))).size, files.length);

  const component = await source('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  for (const path of files) assert.match(component, new RegExp(path.replace('public', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(component, /Fictional .* poker discovery console artwork/);
  assert.match(component, /ogImage=/);
  assert.match(component, /Location verified/);
  assert.match(component, /Updated \{updatedLabel\}/);
  assert.doesNotMatch(component, /Verified room signals|No verified venue profiles/);
});

test('snapshot refresh and parity checks fail closed on degraded or drifting sources', async () => {
  const [refresh, snapshotRuntime, check, resilientFetch, policyGrantCheck, manifest] = await Promise.all([
    source('scripts/refresh-pnm-directory-snapshot.mjs'),
    source('scripts/lib/pnm-directory-snapshot.mjs'),
    source('scripts/check-pnm-directory-snapshot.mjs'),
    source('scripts/ci/lib/resilient-fetch.mjs'),
    source('scripts/ci/check-policy-function-grants.mjs'),
    json('data/poker-venue-directory-snapshot.json'),
  ]);
  assert.match(snapshotRuntime, /refusing to use snapshot-backed data/);
  assert.match(refresh, /location-integrity metadata/);
  assert.match(snapshotRuntime, /json\.data_source === 'static_snapshot'/);
  assert.match(check, /fetchCompleteDirectory/);
  assert.match(check, /drift exceeds budget/);
  assert.match(resilientFetch, /PGRST303/);
  assert.match(resilientFetch, /jwt issued at future/);
  assert.match(resilientFetch, /TOTAL_BUDGET_MS = 360_000/);
  assert.match(policyGrantCheck, /resilientFetch/);
  assert.doesNotMatch(policyGrantCheck, /await fetch\(/);
  assert.equal(manifest.metadata.source_count, manifest.venues.length);
  assert.ok(manifest.metadata.source_candidate_count >= manifest.metadata.source_count);
});
