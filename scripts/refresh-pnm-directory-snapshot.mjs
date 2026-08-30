#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE_ORIGIN = process.env.PNM_DIRECTORY_SOURCE_ORIGIN || 'https://smarter.poker';
const OUTPUTS = [
  'data/poker-venue-directory-snapshot.json',
  'public/data/poker-venue-directory-snapshot.json',
];
const dryRun = process.argv.includes('--dry-run');

function sha(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return { response, json: await response.json() };
}

const directoryUrl = new URL('/api/poker/venues', SOURCE_ORIGIN);
directoryUrl.searchParams.set('view', 'directory');
directoryUrl.searchParams.set('limit', '1000');
directoryUrl.searchParams.set('offset', '0');
const healthUrl = new URL('/api/health', SOURCE_ORIGIN);

const [{ response, json: directory }, { json: health }] = await Promise.all([
  getJson(directoryUrl),
  getJson(healthUrl),
]);
if (!directory.success || !Array.isArray(directory.data) || directory.data.length === 0) {
  throw new Error('Directory source did not return a usable public venue projection');
}
if (directory.degraded === true || directory.data_source === 'static_snapshot') {
  throw new Error('Directory source is degraded; refusing to refresh the canonical snapshot');
}
if (!directory.data.every((venue) => venue?.id && venue?.location_quality?.status)) {
  throw new Error('Directory source omitted identity or location-integrity metadata');
}

const venues = [...directory.data].sort((a, b) => (
  Number(Boolean(b?.is_featured)) - Number(Boolean(a?.is_featured))
  || (Number(b?.trust_score) || 0) - (Number(a?.trust_score) || 0)
  || String(a?.name || '').localeCompare(String(b?.name || ''))
));
const projectedSha256 = sha(venues);
const generatedAt = new Date().toISOString();
const sourceVersion = String(health?.version || '').trim() || null;
const payload = {
  venues,
  metadata: {
    schema_version: 1,
    generated_at: generatedAt,
    source_origin: new URL(SOURCE_ORIGIN).origin,
    source_version: sourceVersion,
    source_candidate_count: Number(directory.total) || venues.length,
    source_count: venues.length,
    public_count: venues.length,
    projected_sha256: projectedSha256,
    data_revision: directory.data_revision
      || response.headers.get('x-pnm-data-revision')
      || `production:${sourceVersion || 'unknown'}:${projectedSha256.slice(0, 16)}`,
    newest_source_at: venues
      .flatMap((venue) => [venue.last_verified_at, venue.last_scraped_at, venue.last_scraped])
      .map((value) => Date.parse(String(value || '')))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
      .map((value) => new Date(value).toISOString())[0] || null,
  },
};
const serialized = `${JSON.stringify(payload, null, 2)}\n`;

if (dryRun) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    source_origin: payload.metadata.source_origin,
    source_version: payload.metadata.source_version,
    source_candidate_count: payload.metadata.source_candidate_count,
    public_count: payload.metadata.public_count,
    projected_sha256: payload.metadata.projected_sha256,
    data_revision: payload.metadata.data_revision,
  }, null, 2));
  process.exit(0);
}

const stagedOutputs = [];
for (const relativePath of OUTPUTS) {
  const absolutePath = resolve(process.cwd(), relativePath);
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(temporaryPath, serialized);
  const staged = await readFile(temporaryPath, 'utf8');
  if (staged !== serialized) throw new Error(`Atomic snapshot staging failed for ${relativePath}`);
  stagedOutputs.push({ relativePath, absolutePath, temporaryPath });
}

for (const { relativePath, absolutePath, temporaryPath } of stagedOutputs) {
  await rename(temporaryPath, absolutePath);
  console.log(`✓ ${relativePath}: ${venues.length} venues, ${projectedSha256.slice(0, 12)}, source ${sourceVersion || 'unknown'}`);
}
