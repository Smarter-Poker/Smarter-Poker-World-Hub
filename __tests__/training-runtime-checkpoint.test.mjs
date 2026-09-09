import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  acquireCheckpointLock,
  assertDiskHeadroom,
  assertDistinctArtifactPaths,
  assertSupportedNodeVersion,
  buildExpectedBatchMap,
  createCheckpoint,
  loadOrCreateCheckpoint,
  pendingBatchDescriptors,
  removeCheckpointAfterSuccessfulRun,
  validateCheckpoint,
  validateCompleteSuccessfulRun,
  validateFeedbackChecks,
  validateSuccessfulBatch,
  writeCheckpointAtomic,
} from '../scripts/lib/training-runtime-checkpoint.mjs';

const fingerprint = {
  contract: 'test-contract',
  targetDeployment: { version: 'deadbeef' },
  auditImplementationSha256: 'implementation-sha',
  catalogSha256: 'catalog-sha',
  baseUrl: 'https://smarter.poker',
  authUserId: 'audit-user',
  gameIds: ['cash-001', 'psy-001'],
  viewports: [{ name: 'mobile', width: 390, height: 844 }],
  batchSize: 1,
  concurrency: 1,
  lifecycleAudit: true,
  questionsPerSession: 20,
};

const expectedBatches = buildExpectedBatchMap({
  games: [{ id: 'cash-001' }, { id: 'psy-001' }],
  viewports: fingerprint.viewports,
  batchSize: 1,
  lifecycleAudit: true,
});

function successfulBatch(descriptor) {
  return descriptor.games.flatMap((game) => descriptor.surfaces.map((surface) => {
    const base = {
      gameId: game.id,
      viewport: descriptor.viewport.name,
      surface,
      failures: [],
    };
    if (surface === 'arena') {
      return {
        ...base,
        lobbyReady: true,
        optionCount: 4,
        runtimeUi: game.expectedUi,
      };
    }
    if (surface === 'lifecycle') {
      return {
        ...base,
        loadRecovery: true,
        correctFeedback: true,
        incorrectFeedback: true,
        manualNext: true,
        completion: true,
        retry: true,
        levelTransition: true,
      };
    }
    return base;
  }));
}

const validFeedback = [
  {
    gameId: 'cash-001',
    verdict: 'Correct',
    manualNext: true,
    persisted: true,
    continuation: true,
    continuationStreet: 'turn',
    continuationRequests: 1,
  },
  { gameId: 'psy-001', verdict: 'Incorrect', manualNext: true, persisted: true },
];

test('runtime version guard accepts only the repo-certified Node runtime', () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion('24.12.0'));
  assert.doesNotThrow(() => assertSupportedNodeVersion('v24.12.0'));
  for (const version of ['20.20.2', '24.15.0', '25.0.0', '26.3.0', 'not-a-version']) {
    assert.throws(() => assertSupportedNodeVersion(version), /repo-certified Node 24\.12\.0/);
  }
});

test('runtime disk preflight fails before the host reaches critical headroom', () => {
  assert.doesNotThrow(() => assertDiskHeadroom(9 * 1024 ** 3));
  assert.throws(() => assertDiskHeadroom(7 * 1024 ** 3), /at least 8\.0 GiB free/);
});

test('runtime checkpoint refuses to overwrite its final output path', () => {
  assert.throws(
    () => assertDistinctArtifactPaths('/tmp/audit.json', '/tmp/../tmp/audit.json'),
    /must be different/,
  );
  assert.doesNotThrow(
    () => assertDistinctArtifactPaths('/tmp/audit.json', '/tmp/audit.checkpoint.json'),
  );
});

test('an interrupted audit resumes only complete, successful batches', () => {
  const directory = mkdtempSync(join(tmpdir(), 'training-runtime-checkpoint-'));
  const checkpointPath = join(directory, 'audit.checkpoint.json');
  try {
    const interrupted = createCheckpoint(fingerprint);
    const first = expectedBatches.get('mobile:0');
    interrupted.batchResults[first.key] = successfulBatch(first);
    writeCheckpointAtomic(checkpointPath, interrupted);

    const resumed = loadOrCreateCheckpoint(
      checkpointPath,
      fingerprint,
      expectedBatches,
      true,
    );
    assert.deepEqual(
      pendingBatchDescriptors(expectedBatches, resumed).map(({ key }) => key),
      ['mobile:1'],
    );

    const second = expectedBatches.get('mobile:1');
    resumed.batchResults[second.key] = successfulBatch(second);
    resumed.feedbackChecks = validFeedback;
    resumed.feedbackComplete = true;
    assert.doesNotThrow(() => validateCompleteSuccessfulRun(resumed, expectedBatches, true));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('stale-build, empty, partial, duplicate, and failed batch checkpoints fail closed', () => {
  const valid = createCheckpoint(fingerprint);
  const first = expectedBatches.get('mobile:0');
  valid.batchResults[first.key] = successfulBatch(first);
  assert.doesNotThrow(() => validateCheckpoint(valid, fingerprint, expectedBatches, true));

  const staleBuild = structuredClone(fingerprint);
  staleBuild.targetDeployment.version = 'cafebabe';
  assert.throws(
    () => validateCheckpoint(valid, staleBuild, expectedBatches, true),
    /does not match this deployment/,
  );

  assert.throws(() => validateSuccessfulBatch(first, []), /incomplete surface coverage/);
  assert.throws(
    () => validateSuccessfulBatch(first, successfulBatch(first).slice(0, 2)),
    /incomplete surface coverage/,
  );
  assert.throws(
    () => validateSuccessfulBatch(first, [
      ...successfulBatch(first).slice(0, 2),
      successfulBatch(first)[0],
    ]),
    /duplicate surface records/,
  );
  const failed = successfulBatch(first);
  failed[0].failures.push('page error');
  assert.throws(() => validateSuccessfulBatch(first, failed), /not a successful surface record/);
});

test('a stale or corrupt checkpoint is quarantined and cannot poison supervised retries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'training-runtime-quarantine-'));
  const checkpointPath = join(directory, 'audit.checkpoint.json');
  try {
    const stale = createCheckpoint({ ...fingerprint, targetDeployment: { version: 'old-build' } });
    writeCheckpointAtomic(checkpointPath, stale);
    const restarted = loadOrCreateCheckpoint(checkpointPath, fingerprint, expectedBatches, true);
    assert.deepEqual(restarted.batchResults, {});
    assert.match(restarted.rejectedCheckpoint?.reason || '', /does not match this deployment/);
    assert.equal(existsSync(restarted.rejectedCheckpoint.path), true);
    assert.equal(existsSync(checkpointPath), false);

    writeFileSync(checkpointPath, '{broken-json');
    const reparsed = loadOrCreateCheckpoint(checkpointPath, fingerprint, expectedBatches, true);
    assert.deepEqual(reparsed.batchResults, {});
    assert.equal(existsSync(reparsed.rejectedCheckpoint.path), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('feedback checkpoint requires exactly the two persistent manual-Next flows', () => {
  assert.doesNotThrow(() => validateFeedbackChecks(validFeedback));
  assert.throws(() => validateFeedbackChecks([]), /incomplete/);
  assert.throws(
    () => validateFeedbackChecks([validFeedback[0], validFeedback[0]]),
    /duplicate games/,
  );
  assert.throws(
    () => validateFeedbackChecks([
      validFeedback[0],
      { ...validFeedback[1], manualNext: false },
    ]),
    /manual Next/,
  );
});

test('failed runs retain their checkpoint and successful runs remove it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'training-runtime-cleanup-'));
  const checkpointPath = join(directory, 'audit.checkpoint.json');
  try {
    writeCheckpointAtomic(checkpointPath, createCheckpoint(fingerprint));
    removeCheckpointAfterSuccessfulRun(checkpointPath, false);
    assert.equal(existsSync(checkpointPath), true);
    removeCheckpointAfterSuccessfulRun(checkpointPath, true);
    assert.equal(existsSync(checkpointPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('checkpoint lock rejects a live writer and safely reclaims a dead local writer', () => {
  const directory = mkdtempSync(join(tmpdir(), 'training-runtime-lock-'));
  const checkpointPath = join(directory, 'audit.checkpoint.json');
  const lockPath = `${checkpointPath}.lock`;
  try {
    const release = acquireCheckpointLock(checkpointPath, 'fingerprint');
    assert.throws(
      () => acquireCheckpointLock(checkpointPath, 'fingerprint'),
      /already owned/,
    );
    release();
    assert.equal(existsSync(lockPath), false);

    writeFileSync(lockPath, `${JSON.stringify({
      schemaVersion: 1,
      token: 'dead-writer',
      pid: 999_999,
      hostname: hostname(),
    })}\n`);
    const releaseReclaimed = acquireCheckpointLock(
      checkpointPath,
      'fingerprint',
      { isProcessAlive: () => false },
    );
    assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).pid, process.pid);
    releaseReclaimed();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
