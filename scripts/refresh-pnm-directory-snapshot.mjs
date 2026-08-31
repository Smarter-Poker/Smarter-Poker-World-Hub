#!/usr/bin/env node
import { open, readFile, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCompleteDirectory, fetchHealth, materialSha, sha } from './lib/pnm-directory-snapshot.mjs';

const SOURCE_ORIGIN = process.env.PNM_DIRECTORY_SOURCE_ORIGIN || 'https://smarter.poker';
const OUTPUTS = [
  'data/poker-venue-directory-snapshot.json',
  'public/data/poker-venue-directory-snapshot.json',
];
const LOCK_STALE_MS = 15 * 60 * 1000;

async function acquireLock(cwd) {
  const lockPath = resolve(cwd, '.pnm-directory-snapshot.lock');
  try {
    return { handle: await open(lockPath, 'wx', 0o600), lockPath };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const info = await stat(lockPath).catch(() => null);
    if (!info || Date.now() - info.mtimeMs <= LOCK_STALE_MS) {
      throw new Error('Another Poker Near Me snapshot refresh is already running');
    }
    await rm(lockPath, { force: true });
    return { handle: await open(lockPath, 'wx', 0o600), lockPath };
  }
}

async function releaseLock(lock) {
  if (!lock) return;
  await lock.handle.close();
  await rm(lock.lockPath, { force: true });
}

async function recoverInterruptedPromotion(outputs) {
  const backups = outputs.map((absolutePath) => `${absolutePath}.pnm-refresh.backup`);
  const hasBackup = (await Promise.all(backups.map((path) => stat(path).then(() => true).catch(() => false)))).some(Boolean);
  if (!hasBackup) return;
  for (let index = 0; index < outputs.length; index += 1) {
    const backup = backups[index];
    const backupExists = await stat(backup).then(() => true).catch(() => false);
    if (!backupExists) continue;
    await rm(outputs[index], { force: true });
    await rename(backup, outputs[index]);
  }
}

export async function promoteSnapshotPair({ cwd, relativeOutputs = OUTPUTS, serialized, promoteHook, lock: suppliedLock }) {
  const outputs = relativeOutputs.map((relativePath) => resolve(cwd, relativePath));
  const temporary = outputs.map((absolutePath) => `${absolutePath}.${process.pid}.tmp`);
  const backups = outputs.map((absolutePath) => `${absolutePath}.pnm-refresh.backup`);
  const lock = suppliedLock || await acquireLock(cwd);
  const ownsLock = !suppliedLock;
  let backupsSafeToDelete = false;
  try {
    await lock.handle.writeFile(`${process.pid}\n`);
    await lock.handle.sync();
    await recoverInterruptedPromotion(outputs);
    for (let index = 0; index < outputs.length; index += 1) {
      const handle = await open(temporary[index], 'w', 0o644);
      try {
        await handle.writeFile(serialized);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (await readFile(temporary[index], 'utf8') !== serialized) {
        throw new Error(`Atomic snapshot staging failed for ${relativeOutputs[index]}`);
      }
    }
    for (let index = 0; index < outputs.length; index += 1) {
      await rm(backups[index], { force: true });
      await rename(outputs[index], backups[index]);
    }
    for (let index = 0; index < outputs.length; index += 1) {
      await promoteHook?.(index);
      await rename(temporary[index], outputs[index]);
    }
    backupsSafeToDelete = true;
  } catch (error) {
    try {
      for (let index = 0; index < outputs.length; index += 1) {
        const backupExists = await stat(backups[index]).then(() => true).catch(() => false);
        if (!backupExists) continue;
        await rm(outputs[index], { force: true });
        await rename(backups[index], outputs[index]);
      }
      backupsSafeToDelete = true;
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], 'Snapshot promotion failed and rollback needs recovery');
    }
    throw error;
  } finally {
    await Promise.all(temporary.map((path) => rm(path, { force: true })));
    if (backupsSafeToDelete) await Promise.all(backups.map((path) => rm(path, { force: true })));
    if (ownsLock) await releaseLock(lock);
  }
}

export async function buildSnapshotPayload({ sourceOrigin = SOURCE_ORIGIN, fetchImpl = fetch }) {
  const [{ candidateCount, dataRevision, venues: sourceVenues }, health] = await Promise.all([
    fetchCompleteDirectory({ sourceOrigin, fetchImpl }),
    fetchHealth({ sourceOrigin, fetchImpl }),
  ]);
  if (!sourceVenues.every((venue) => venue?.id && venue?.location_quality?.status)) {
    throw new Error('Directory source omitted identity or location-integrity metadata');
  }
  const venues = [...sourceVenues].sort((a, b) => (
    Number(Boolean(b?.is_featured)) - Number(Boolean(a?.is_featured))
    || (Number(b?.trust_score) || 0) - (Number(a?.trust_score) || 0)
    || String(a?.name || '').localeCompare(String(b?.name || ''))
  ));
  const projectedSha256 = sha(venues);
  const sourceVersion = String(health?.version || '').trim() || null;
  return {
    venues,
    metadata: {
      schema_version: 2,
      generated_at: new Date().toISOString(),
      source_origin: new URL(sourceOrigin).origin,
      source_version: sourceVersion,
      source_candidate_count: candidateCount,
      source_count: venues.length,
      public_count: venues.length,
      projected_sha256: projectedSha256,
      material_sha256: materialSha(venues),
      data_revision: dataRevision || `production:${sourceVersion || 'unknown'}:${projectedSha256.slice(0, 16)}`,
      newest_source_at: venues
        .flatMap((venue) => [venue.last_verified_at, venue.last_scraped_at, venue.last_scraped])
        .map((value) => Date.parse(String(value || '')))
        .filter(Number.isFinite)
        .sort((a, b) => b - a)
        .map((value) => new Date(value).toISOString())[0] || null,
    },
  };
}

export async function runSnapshotRefresh({ cwd = process.cwd(), dryRun = false, fetchImpl = fetch, sourceOrigin = SOURCE_ORIGIN, relativeOutputs = OUTPUTS } = {}) {
  if (dryRun) return buildSnapshotPayload({ sourceOrigin, fetchImpl });
  const lock = await acquireLock(cwd);
  try {
    await lock.handle.writeFile(`${process.pid}\n`);
    await lock.handle.sync();
    const payload = await buildSnapshotPayload({ sourceOrigin, fetchImpl });
    await promoteSnapshotPair({ cwd, relativeOutputs, serialized: `${JSON.stringify(payload, null, 2)}\n`, lock });
    return payload;
  } finally {
    await releaseLock(lock);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const payload = await runSnapshotRefresh({ dryRun });
  if (dryRun) {
    console.log(JSON.stringify({ mode: 'dry-run', ...payload.metadata }, null, 2));
  } else {
    for (const relativePath of OUTPUTS) {
      console.log(`✓ ${relativePath}: ${payload.venues.length} venues, ${payload.metadata.projected_sha256.slice(0, 12)}, source ${payload.metadata.source_version || 'unknown'}`);
    }
  }
}
