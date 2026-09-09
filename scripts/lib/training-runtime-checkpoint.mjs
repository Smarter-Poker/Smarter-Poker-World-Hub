import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

export const TRAINING_RUNTIME_CHECKPOINT_SCHEMA = 3;
export const TRAINING_RUNTIME_AUDIT_CONTRACT = 'phase-6-runtime-v4';
export const TRAINING_RUNTIME_NODE_VERSION = '24.12.0';
export const TRAINING_RUNTIME_MIN_FREE_BYTES = 8 * 1024 * 1024 * 1024;

const LIFECYCLE_FIELDS = [
  'loadRecovery',
  'correctFeedback',
  'incorrectFeedback',
  'manualNext',
  'completion',
  'retry',
  'levelTransition',
];

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  assert.equal(
    String(version).replace(/^v/, ''),
    TRAINING_RUNTIME_NODE_VERSION,
    `runtime audit requires repo-certified Node ${TRAINING_RUNTIME_NODE_VERSION}; received ${version}`,
  );
}

export function assertDiskHeadroom(freeBytes, minimumBytes = TRAINING_RUNTIME_MIN_FREE_BYTES) {
  assert.ok(
    Number.isFinite(freeBytes) && freeBytes >= minimumBytes,
    `runtime audit requires at least ${(minimumBytes / (1024 ** 3)).toFixed(1)} GiB free; found ${(Number(freeBytes || 0) / (1024 ** 3)).toFixed(1)} GiB`,
  );
}

export function assertDistinctArtifactPaths(outputPath, checkpointPath) {
  if (!outputPath || !checkpointPath) return;
  assert.notEqual(
    resolve(outputPath),
    resolve(checkpointPath),
    'runtime audit output and checkpoint paths must be different',
  );
}

export function buildExpectedBatchMap({ games, viewports, batchSize, lifecycleAudit }) {
  const expected = new Map();
  for (const viewport of viewports) {
    for (let offset = 0; offset < games.length; offset += batchSize) {
      const key = `${viewport.name}:${offset}`;
      expected.set(key, {
        key,
        viewport: { ...viewport },
        games: games.slice(offset, offset + batchSize).map((game) => ({
          id: game.id,
          expectedUi: game.id.startsWith('psy-') ? 'psychology-scenario' : 'club-arena-table',
        })),
        surfaces: lifecycleAudit ? ['play', 'arena', 'lifecycle'] : ['play', 'arena'],
      });
    }
  }
  return expected;
}

export function createCheckpoint(fingerprint) {
  return {
    schemaVersion: TRAINING_RUNTIME_CHECKPOINT_SCHEMA,
    fingerprint,
    fingerprintSha256: sha256(JSON.stringify(fingerprint)),
    batchResults: {},
    feedbackChecks: [],
    feedbackComplete: false,
  };
}

function resultKey(result) {
  return `${result.gameId}:${result.viewport}:${result.surface}`;
}

function expectedResultKeys(descriptor) {
  return descriptor.games.flatMap((game) => (
    descriptor.surfaces.map((surface) => `${game.id}:${descriptor.viewport.name}:${surface}`)
  ));
}

export function validateSuccessfulBatch(descriptor, results) {
  assert.ok(Array.isArray(results), `${descriptor.key} checkpoint batch must be an array`);
  const expectedKeys = expectedResultKeys(descriptor);
  assert.equal(
    results.length,
    expectedKeys.length,
    `${descriptor.key} checkpoint batch has incomplete surface coverage`,
  );
  const actualKeys = results.map(resultKey);
  assert.equal(
    new Set(actualKeys).size,
    actualKeys.length,
    `${descriptor.key} checkpoint batch contains duplicate surface records`,
  );
  assert.deepEqual(
    [...actualKeys].sort(),
    [...expectedKeys].sort(),
    `${descriptor.key} checkpoint batch does not match its expected games and surfaces`,
  );

  const gameById = new Map(descriptor.games.map((game) => [game.id, game]));
  for (const result of results) {
    assert.ok(Array.isArray(result.failures), `${resultKey(result)} must declare failures`);
    assert.equal(result.failures.length, 0, `${resultKey(result)} is not a successful surface record`);
    if (result.surface === 'arena') {
      assert.equal(result.lobbyReady, true, `${resultKey(result)} did not reach the arena lobby`);
      assert.equal(result.optionCount, 4, `${resultKey(result)} did not expose four answers`);
      assert.equal(
        result.runtimeUi,
        gameById.get(result.gameId)?.expectedUi,
        `${resultKey(result)} rendered the wrong gameplay UI`,
      );
    }
    if (result.surface === 'lifecycle') {
      for (const field of LIFECYCLE_FIELDS) {
        assert.equal(result[field], true, `${resultKey(result)} did not verify ${field}`);
      }
    }
  }
  return results;
}

export function normalizeFailedBatch(descriptor, results, failureMessage) {
  const supplied = Array.isArray(results) ? results : [];
  const byKey = new Map();
  const duplicates = new Set();
  for (const result of supplied) {
    if (!result || typeof result !== 'object') continue;
    const key = resultKey(result);
    if (byKey.has(key)) duplicates.add(key);
    else byKey.set(key, result);
  }
  const reason = failureMessage || 'runtime batch did not produce a complete verified result';

  return descriptor.games.flatMap((game) => descriptor.surfaces.map((surface) => {
    const key = `${game.id}:${descriptor.viewport.name}:${surface}`;
    const suppliedResult = byKey.get(key);
    if (!suppliedResult) {
      return {
        gameId: game.id,
        viewport: descriptor.viewport.name,
        surface,
        failures: [reason],
      };
    }
    const failures = Array.isArray(suppliedResult.failures)
      ? [...suppliedResult.failures]
      : [`${key} did not declare a failures array`];
    if (duplicates.has(key)) failures.push(`${key} was emitted more than once`);
    return { ...suppliedResult, failures };
  }));
}

export function validateFeedbackChecks(feedbackChecks, expectedIds = ['cash-001', 'psy-001']) {
  assert.ok(Array.isArray(feedbackChecks), 'feedback checkpoint must be an array');
  assert.equal(feedbackChecks.length, expectedIds.length, 'feedback checkpoint is incomplete');
  const ids = feedbackChecks.map((item) => item.gameId);
  assert.equal(new Set(ids).size, ids.length, 'feedback checkpoint contains duplicate games');
  assert.deepEqual([...ids].sort(), [...expectedIds].sort(), 'feedback checkpoint has the wrong games');
  for (const item of feedbackChecks) {
    assert.equal(item.failure, undefined, `${item.gameId} feedback checkpoint contains a failure`);
    assert.equal(item.manualNext, true, `${item.gameId} feedback did not require manual Next`);
    assert.equal(item.persisted, true, `${item.gameId} feedback did not persist`);
    assert.match(item.verdict || '', /^(?:Correct|Incorrect)$/, `${item.gameId} feedback verdict is invalid`);
    if (item.gameId === 'cash-001') {
      assert.equal(item.continuation, true, 'cash-001 feedback did not reach a browser-driven continuation');
      assert.equal(item.continuationStreet, 'turn', 'cash-001 continuation did not reach the Turn');
      assert.equal(item.continuationRequests, 1, 'cash-001 continuation did not issue exactly one request');
    }
  }
  return feedbackChecks;
}

export function validateCheckpoint(checkpoint, fingerprint, expectedBatches, feedbackRequired) {
  assert.equal(
    checkpoint?.schemaVersion,
    TRAINING_RUNTIME_CHECKPOINT_SCHEMA,
    'runtime audit checkpoint schema is not supported',
  );
  assert.deepEqual(
    checkpoint.fingerprint,
    fingerprint,
    'runtime audit checkpoint does not match this deployment and run configuration',
  );
  assert.equal(
    checkpoint.fingerprintSha256,
    sha256(JSON.stringify(fingerprint)),
    'runtime audit checkpoint fingerprint digest is invalid',
  );
  assert.ok(
    checkpoint.batchResults && typeof checkpoint.batchResults === 'object' && !Array.isArray(checkpoint.batchResults),
    'runtime audit checkpoint batchResults must be an object',
  );
  for (const [key, results] of Object.entries(checkpoint.batchResults)) {
    const descriptor = expectedBatches.get(key);
    assert.ok(descriptor, `runtime audit checkpoint contains unexpected batch ${key}`);
    validateSuccessfulBatch(descriptor, results);
  }
  assert.equal(typeof checkpoint.feedbackComplete, 'boolean', 'feedbackComplete must be a boolean');
  if (checkpoint.feedbackComplete) {
    assert.equal(feedbackRequired, true, 'checkpoint contains feedback for a run that does not require it');
    validateFeedbackChecks(checkpoint.feedbackChecks);
  } else {
    assert.deepEqual(checkpoint.feedbackChecks, [], 'incomplete feedback must not be checkpointed');
  }
  return checkpoint;
}

export function pendingBatchDescriptors(expectedBatches, checkpoint) {
  return [...expectedBatches.values()].filter(({ key }) => !checkpoint.batchResults[key]);
}

export function validateCompleteSuccessfulRun(checkpoint, expectedBatches, feedbackRequired) {
  const expectedKeys = [...expectedBatches.keys()].sort();
  const actualKeys = Object.keys(checkpoint.batchResults).sort();
  assert.deepEqual(actualKeys, expectedKeys, 'runtime audit did not complete every expected batch');
  for (const [key, descriptor] of expectedBatches) {
    validateSuccessfulBatch(descriptor, checkpoint.batchResults[key]);
  }
  if (feedbackRequired) {
    assert.equal(checkpoint.feedbackComplete, true, 'runtime audit did not complete feedback checks');
    validateFeedbackChecks(checkpoint.feedbackChecks);
  }
}

export function writeCheckpointAtomic(checkpointPath, checkpoint) {
  if (!checkpointPath) return;
  const temporaryPath = `${checkpointPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporaryPath, checkpointPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function loadOrCreateCheckpoint(checkpointPath, fingerprint, expectedBatches, feedbackRequired) {
  if (!checkpointPath || !existsSync(checkpointPath)) return createCheckpoint(fingerprint);
  try {
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    return validateCheckpoint(checkpoint, fingerprint, expectedBatches, feedbackRequired);
  } catch (error) {
    // A stale/corrupt checkpoint may never certify the current build, but it
    // also must not permanently poison every supervised retry. Preserve it as
    // forensic evidence and start a clean checkpoint whose fingerprint is
    // bound to the current deployment, code, browser, auth fixture, and matrix.
    const rejectedPath = `${checkpointPath}.rejected.${Date.now()}.${randomUUID()}.json`;
    renameSync(checkpointPath, rejectedPath);
    const fresh = createCheckpoint(fingerprint);
    fresh.rejectedCheckpoint = {
      path: rejectedPath,
      reason: error?.message || String(error),
    };
    return fresh;
  }
}

export function removeCheckpointAfterSuccessfulRun(checkpointPath, success) {
  if (success && checkpointPath && existsSync(checkpointPath)) unlinkSync(checkpointPath);
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function acquireCheckpointLock(checkpointPath, fingerprintSha256, options = {}) {
  if (!checkpointPath) return () => {};
  const lockPath = `${checkpointPath}.lock`;
  const localHostname = options.hostname || hostname();
  const localPid = options.pid || process.pid;
  const isAlive = options.isProcessAlive || processIsAlive;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const owner = {
      schemaVersion: 1,
      token: randomUUID(),
      pid: localPid,
      hostname: localHostname,
      startedAt: new Date().toISOString(),
      fingerprintSha256,
    };
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeFileSync(fd, `${JSON.stringify(owner, null, 2)}\n`);
      } finally {
        closeSync(fd);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (!existsSync(lockPath)) return;
        const current = JSON.parse(readFileSync(lockPath, 'utf8'));
        if (current.token === owner.token) unlinkSync(lockPath);
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let existing;
      try {
        existing = JSON.parse(readFileSync(lockPath, 'utf8'));
      } catch {
        throw new Error(`runtime audit checkpoint lock is unreadable: ${lockPath}`);
      }
      const sameHost = existing.hostname === localHostname;
      if (!sameHost || !Number.isInteger(existing.pid) || isAlive(existing.pid)) {
        throw new Error(
          `runtime audit checkpoint is already owned by pid ${existing.pid || 'unknown'} on ${existing.hostname || 'unknown host'}`,
        );
      }
      unlinkSync(lockPath);
    }
  }
  throw new Error(`runtime audit could not acquire checkpoint lock ${lockPath}`);
}
