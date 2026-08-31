import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildSnapshotVenueDirectory } from '../src/lib/poker-near-me/venueDirectoryServer.js';
import { buildPokerVenueSitemapUrls } from '../src/lib/poker-near-me/sitemapRoutes.js';
import { citySlugToTitle, cityTitleToSlug } from '../src/lib/home-games/locationUtils.js';
import directorySnapshotData from '../data/poker-venue-directory-snapshot.json' with { type: 'json' };

test('sitemap route projection deduplicates records and rejects private route families', () => {
  const routes = buildPokerVenueSitemapUrls([
    { id: 1, name: 'Alpha Room', venue_type: 'casino', state: 'NV', city: 'Las Vegas' },
    { id: 1, name: 'Alpha Room duplicate', venue_type: 'casino', state: 'NV', city: 'Las Vegas' },
    { id: 2, name: 'Suppressed Room', venue_type: 'casino', state: 'NV', city: 'Reno', is_suppressed: true },
    { id: 3, name: 'Inactive Room', venue_type: 'casino', state: 'TX', city: 'Austin', is_active: false },
    { id: 4, name: 'Tour', venue_type: 'tour', state: 'NV', city: 'Las Vegas' },
    { id: 5, name: '', venue_type: 'casino', state: 'CA', city: 'Los Angeles' },
    { id: 'bad/state', name: 'International Room', venue_type: 'casino', state: 'XX', city: 'Elsewhere' },
  ]);

  assert.deepEqual(routes, [
    { path: '/hub/venues/1', priority: '0.7', changefreq: 'daily' },
    { path: '/hub/poker-near-me/in/nv', priority: '0.7', changefreq: 'daily' },
    { path: '/hub/poker-near-me/in/nv/las-vegas', priority: '0.6', changefreq: 'daily' },
    { path: '/hub/venues/bad%2Fstate', priority: '0.7', changefreq: 'daily' },
  ]);
});
test('checked directory snapshot produces a complete duplicate-free sitemap projection', () => {
  const directory = buildSnapshotVenueDirectory({
    params: { limit: 1000 },
    venues: directorySnapshotData.venues,
    metadata: directorySnapshotData.metadata,
  });
  const routes = buildPokerVenueSitemapUrls(directory.data);
  const paths = routes.map((route) => route.path);
  const venuePaths = paths.filter((path) => path.startsWith('/hub/venues/'));
  const locationPaths = paths.filter((path) => path.startsWith('/hub/poker-near-me/in/'));

  assert.equal(venuePaths.length, directory.total);
  assert.ok(locationPaths.length > 300);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.every((path) => !path.includes('undefined') && !path.includes('null')));
});

test('sitemap uses the resilient public directory and a bounded freshness window', () => {
  const source = fs.readFileSync(new URL('../pages/sitemap.xml.js', import.meta.url), 'utf8');
  const venueBuilder = source.slice(
    source.indexOf('async function buildPokerVenueUrls()'),
    source.indexOf('function generateSitemapXml'),
  );

  assert.match(venueBuilder, /fetchVenueDirectoryResilient/);
  assert.match(venueBuilder, /buildSnapshotVenueDirectory/);
  assert.match(venueBuilder, /buildPokerVenueSitemapUrls/);
  assert.doesNotMatch(venueBuilder, /\.from\(['"]poker_venues['"]\)/);
  assert.match(source, /s-maxage=300, stale-while-revalidate=1800/);
});

test('city routes compare canonical slugs after a bounded state-level fetch', () => {
  for (const city of ['Port St. Lucie', 'St. Augustine', 'St. Petersburg']) {
    const slug = cityTitleToSlug(city);
    assert.equal(cityTitleToSlug(citySlugToTitle(slug)), slug);
  }

  const source = fs.readFileSync(new URL('../src/lib/poker-near-me/locationPages.js', import.meta.url), 'utf8');
  assert.match(source, /params: \{ limit: 1000, state \}/);
  assert.match(source, /cityTitleToSlug\(venue\.city\) === cityTitleToSlug\(city\)/);
  assert.doesNotMatch(source, /params: \{ limit: 1000, state, city \}/);
});
