#!/usr/bin/env node
/**
 * Apply the shared venue-integrity contract to checked-in offline snapshots.
 * The write is deterministic except for preserving each snapshot's existing
 * generated_at metadata. Use --check in CI to assert that both files are safe.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyVenueIntegrity } from '../src/lib/poker-near-me/venueIntegrityServer.js';
import { buildSnapshotVenueDirectory } from '../src/lib/poker-near-me/venueDirectoryServer.js';
import { materialSha, sha } from './lib/pnm-directory-snapshot.mjs';

const paths = [
  { path: 'data/all-venues.json', directory: false },
  { path: 'public/data/all-venues.json', directory: false },
  { path: 'data/poker-venue-directory-snapshot.json', directory: true },
  { path: 'public/data/poker-venue-directory-snapshot.json', directory: true },
];
const checkOnly = process.argv.includes('--check');
let failed = false;
const canonicalVenueSource = JSON.parse(await readFile(
  resolve(process.cwd(), 'data/all-venues.json'),
  'utf8',
));
const pokerAtlasSlugById = new Map(
  (canonicalVenueSource.venues || [])
    .filter((venue) => venue?.id != null && venue?.pokeratlas_slug)
    .map((venue) => [String(venue.id), venue.pokeratlas_slug]),
);

for (const target of paths) {
  const relativePath = target.path;
  const absolutePath = resolve(process.cwd(), relativePath);
  const source = JSON.parse(await readFile(absolutePath, 'utf8'));
  // Directory snapshots are an intentionally narrow public projection. Carry
  // the safe PokerAtlas identity key over from the canonical local export so
  // offline/fallback cards can join the same saved live-game rows as the live
  // Supabase directory response.
  const sourceVenues = (source.venues || []).map((venue) => {
    if (!target.directory || venue?.pokeratlas_slug || venue?.id == null) return venue;
    const pokerAtlasSlug = pokerAtlasSlugById.get(String(venue.id));
    return pokerAtlasSlug ? { ...venue, pokeratlas_slug: pokerAtlasSlug } : venue;
  });
  const integrity = applyVenueIntegrity(sourceVenues);
  let output;
  if (target.directory) {
    const directory = buildSnapshotVenueDirectory({
      params: { limit: 1000, offset: 0 },
      venues: integrity.venues,
      metadata: source.metadata || {},
    });
    output = {
      ...source,
      venues: directory.data,
      metadata: {
        ...(source.metadata || {}),
        source_count: directory.total,
        public_count: directory.total,
        projected_sha256: sha(directory.data),
        material_sha256: materialSha(directory.data),
      },
    };
  } else {
    output = {
      ...source,
      venues: integrity.venues,
      metadata: {
        ...(source.metadata || {}),
        total: integrity.venues.length,
        active: integrity.venues.filter((venue) => venue.is_active !== false).length,
        with_logo: integrity.venues.filter((venue) => venue.logo_url).length,
        data_integrity: integrity.summary,
      },
    };
  }
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const current = await readFile(absolutePath, 'utf8');
  const hasIntegrity = output.venues.every((venue) => venue?.location_quality?.status);
  const unchanged = current === serialized;

  if (checkOnly) {
    if (!hasIntegrity || !unchanged) {
      failed = true;
      console.error(`✗ ${relativePath} is missing current venue integrity metadata`);
    } else {
      console.log(`✓ ${relativePath}: ${output.venues.length} venues, ${integrity.summary.held} held`);
    }
    continue;
  }

  await writeFile(absolutePath, serialized);
  console.log(`✓ ${relativePath}: ${output.venues.length} venues, ${integrity.summary.held} held, ${integrity.summary.duplicate_count} duplicates removed`);
}

if (failed) process.exit(1);
