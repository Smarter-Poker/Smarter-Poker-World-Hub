#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSnapshotVenueDirectory } from '../src/lib/poker-near-me/venueDirectoryServer.js';
import { fetchCompleteDirectory, materialSha, sha } from './lib/pnm-directory-snapshot.mjs';

const SNAPSHOTS = [
  'data/poker-venue-directory-snapshot.json',
  'public/data/poker-venue-directory-snapshot.json',
];
const MAX_SNAPSHOT_AGE_DAYS = Number(process.env.PNM_MAX_SNAPSHOT_AGE_DAYS || 30);
const MAX_LIVE_DRIFT_COUNT = Number(process.env.PNM_MAX_DIRECTORY_DRIFT_COUNT || 5);
const MAX_LIVE_DRIFT_PERCENT = Number(process.env.PNM_MAX_DIRECTORY_DRIFT_PERCENT || 2);
const MAX_FUTURE_SKEW_MINUTES = Number(process.env.PNM_MAX_SNAPSHOT_FUTURE_SKEW_MINUTES || 10);
const liveUrl = process.argv.find((arg) => arg.startsWith('--live-url='))?.slice('--live-url='.length)
  || process.env.PNM_DIRECTORY_LIVE_URL
  || '';

function snapshotAgeDays(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? (Date.now() - timestamp) / 86_400_000 : Infinity;
}

async function loadSnapshot(relativePath) {
  const source = JSON.parse(await readFile(resolve(process.cwd(), relativePath), 'utf8'));
  const directory = buildSnapshotVenueDirectory({
    params: { limit: 1000, offset: 0 },
    venues: source.venues || [],
    metadata: source.metadata || {},
  });
  const manifest = source.metadata;
  if (!manifest) throw new Error(`${relativePath} has no metadata manifest`);
  if (manifest.public_count !== directory.total) {
    throw new Error(`${relativePath} manifest count ${manifest.public_count} does not match projection ${directory.total}`);
  }
  const projectedSha256 = sha(directory.data);
  if (manifest.projected_sha256 !== projectedSha256) {
    throw new Error(`${relativePath} projected hash does not match its venue payload`);
  }
  const ageDays = snapshotAgeDays(manifest.generated_at);
  if (ageDays < -(MAX_FUTURE_SKEW_MINUTES / 1440)) {
    throw new Error(`${relativePath} snapshot generated_at is implausibly future-dated`);
  }
  if (ageDays > MAX_SNAPSHOT_AGE_DAYS) {
    throw new Error(`${relativePath} snapshot is ${Math.floor(ageDays)} days old; maximum is ${MAX_SNAPSHOT_AGE_DAYS}`);
  }
  const materialSha256 = materialSha(directory.data);
  if (manifest.schema_version >= 2 && manifest.material_sha256 !== materialSha256) {
    throw new Error(`${relativePath} material hash does not match its venue payload`);
  }
  return { relativePath, source, directory, manifest, ageDays, materialSha256 };
}

const snapshots = await Promise.all(SNAPSHOTS.map(loadSnapshot));
const [serverSnapshot, publicSnapshot] = snapshots;
if (serverSnapshot.manifest.projected_sha256 !== publicSnapshot.manifest.projected_sha256) {
  throw new Error('Server and public directory snapshots do not have the same projected hash');
}

for (const snapshot of snapshots) {
  console.log(`✓ ${snapshot.relativePath}: ${snapshot.directory.total} public venues, hash ${snapshot.manifest.projected_sha256.slice(0, 12)}, age ${Math.floor(snapshot.ageDays)}d`);
}

if (liveUrl) {
  const sourceOrigin = new URL(liveUrl).origin;
  const live = await fetchCompleteDirectory({ sourceOrigin });
  const localIds = new Set(serverSnapshot.directory.data.map((venue) => String(venue.id)));
  const liveIds = new Set(live.venues.map((venue) => String(venue.id)));
  const onlySnapshot = [...localIds].filter((id) => !liveIds.has(id));
  const onlyLive = [...liveIds].filter((id) => !localIds.has(id));
  const driftCount = onlySnapshot.length + onlyLive.length;
  const denominator = Math.max(localIds.size, liveIds.size, 1);
  const driftPercent = Math.round((driftCount / denominator) * 10_000) / 100;
  console.log(`✓ live parity: ${liveIds.size} live, ${localIds.size} snapshot, ${driftCount} differing ids (${driftPercent}%)`);
  if (driftCount > MAX_LIVE_DRIFT_COUNT || driftPercent > MAX_LIVE_DRIFT_PERCENT) {
    throw new Error(`Live/snapshot drift exceeds budget (${MAX_LIVE_DRIFT_COUNT} rows or ${MAX_LIVE_DRIFT_PERCENT}%)`);
  }
  const liveMaterialSha = materialSha(live.venues);
  if (driftCount === 0 && liveMaterialSha !== serverSnapshot.materialSha256) {
    console.warn('! live material content differs from the published snapshot while venue IDs remain aligned');
  }
}
