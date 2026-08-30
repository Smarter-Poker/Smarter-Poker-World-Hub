#!/usr/bin/env node
/**
 * Apply the shared venue-integrity contract to checked-in offline snapshots.
 * The write is deterministic except for preserving each snapshot's existing
 * generated_at metadata. Use --check in CI to assert that both files are safe.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyVenueIntegrity } from '../src/lib/poker-near-me/venueIntegrityServer.js';

const paths = ['data/all-venues.json', 'public/data/all-venues.json'];
const checkOnly = process.argv.includes('--check');
let failed = false;

for (const relativePath of paths) {
  const absolutePath = resolve(process.cwd(), relativePath);
  const source = JSON.parse(await readFile(absolutePath, 'utf8'));
  const integrity = applyVenueIntegrity(source.venues || []);
  const output = {
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
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const current = await readFile(absolutePath, 'utf8');
  const hasIntegrity = output.venues.every((venue) => venue?.location_quality?.status);
  const unchanged = current === serialized;

  if (checkOnly) {
    if (!hasIntegrity || !unchanged) {
      failed = true;
      console.error(`✗ ${relativePath} is missing current venue integrity metadata`);
    } else {
      console.log(`✓ ${relativePath}: ${integrity.summary.output} venues, ${integrity.summary.held} held`);
    }
    continue;
  }

  await writeFile(absolutePath, serialized);
  console.log(`✓ ${relativePath}: ${integrity.summary.output} venues, ${integrity.summary.held} held, ${integrity.summary.duplicate_count} duplicates removed`);
}

if (failed) process.exit(1);
