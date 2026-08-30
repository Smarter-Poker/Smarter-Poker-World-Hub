#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSnapshotVenueDirectory } from '../src/lib/poker-near-me/venueDirectoryServer.js';

const SNAPSHOTS = [
  'data/poker-venue-directory-snapshot.json',
  'public/data/poker-venue-directory-snapshot.json',
];
const MAX_SNAPSHOT_AGE_DAYS = Number(process.env.PNM_MAX_SNAPSHOT_AGE_DAYS || 30);
const MAX_LIVE_DRIFT_COUNT = Number(process.env.PNM_MAX_DIRECTORY_DRIFT_COUNT || 5);
const MAX_LIVE_DRIFT_PERCENT = Number(process.env.PNM_MAX_DIRECTORY_DRIFT_PERCENT || 2);
const liveUrl = process.argv.find((arg) => arg.startsWith('--live-url='))?.slice('--live-url='.length)
  || process.env.PNM_DIRECTORY_LIVE_URL
  || '';

function sha(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

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
  if (ageDays > MAX_SNAPSHOT_AGE_DAYS) {
    throw new Error(`${relativePath} snapshot is ${Math.floor(ageDays)} days old; maximum is ${MAX_SNAPSHOT_AGE_DAYS}`);
  }
  return { relativePath, source, directory, manifest, ageDays };
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
  const url = new URL(liveUrl);
  url.searchParams.set('view', 'directory');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('offset', '0');
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Live directory returned ${response.status}`);
  const live = await response.json();
  if (!live.success || !Array.isArray(live.data)) throw new Error('Live directory response is invalid');
  if (live.degraded === true || live.data_source === 'static_snapshot') {
    throw new Error('Live parity target is itself serving snapshot data');
  }
  const localIds = new Set(serverSnapshot.directory.data.map((venue) => String(venue.id)));
  const liveIds = new Set(live.data.map((venue) => String(venue.id)));
  const onlySnapshot = [...localIds].filter((id) => !liveIds.has(id));
  const onlyLive = [...liveIds].filter((id) => !localIds.has(id));
  const driftCount = onlySnapshot.length + onlyLive.length;
  const denominator = Math.max(localIds.size, liveIds.size, 1);
  const driftPercent = Math.round((driftCount / denominator) * 10_000) / 100;
  console.log(`✓ live parity: ${liveIds.size} live, ${localIds.size} snapshot, ${driftCount} differing ids (${driftPercent}%)`);
  if (driftCount > MAX_LIVE_DRIFT_COUNT || driftPercent > MAX_LIVE_DRIFT_PERCENT) {
    throw new Error(`Live/snapshot drift exceeds budget (${MAX_LIVE_DRIFT_COUNT} rows or ${MAX_LIVE_DRIFT_PERCENT}%)`);
  }
}
