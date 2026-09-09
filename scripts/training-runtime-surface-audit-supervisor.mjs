import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertDistinctArtifactPaths,
  assertSupportedNodeVersion,
} from './lib/training-runtime-checkpoint.mjs';
import {
  parseSupervisorAttemptTimeout,
  parseSupervisorMaxAttempts,
  runTrainingRuntimeAuditSupervisor,
} from './lib/training-runtime-supervisor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const auditScript = join(ROOT, 'scripts/training-runtime-surface-audit.mjs');
const outputPath = String(process.env.TRAINING_AUDIT_OUTPUT || '').trim();
const checkpointPath = String(
  process.env.TRAINING_AUDIT_CHECKPOINT
  || (outputPath ? `${outputPath}.checkpoint.json` : ''),
).trim();
assert.ok(outputPath, 'supervised runtime audit requires TRAINING_AUDIT_OUTPUT');
assert.ok(checkpointPath, 'supervised runtime audit requires TRAINING_AUDIT_CHECKPOINT');
assertDistinctArtifactPaths(outputPath, checkpointPath);

const childArgs = process.argv.slice(2).filter((argument) => argument !== '--allow-partial');
const allowPartial = process.argv.slice(2).includes('--allow-partial');
const expectedBuild = String(process.env.TRAINING_AUDIT_EXPECTED_BUILD || '').trim();

function writeOutputAtomic(value) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporaryPath, outputPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

// Invalidate any prior successful receipt before launching. If this process or
// its child crashes, a stale certificate cannot be mistaken for this run.
const startingReceipt = {
  success: false,
  status: 'in_progress',
  certificationMode: allowPartial ? 'partial' : 'full',
  startedAt: new Date().toISOString(),
  expectedBuild: expectedBuild || null,
};
writeOutputAtomic(startingReceipt);

let maxAttempts;
let attemptTimeoutMs;
try {
  assertSupportedNodeVersion();
  if (!allowPartial) {
    assert.match(
      expectedBuild,
      /^[0-9a-f]{40}$/i,
      'full supervised runtime certification requires a 40-character TRAINING_AUDIT_EXPECTED_BUILD',
    );
  }
  maxAttempts = parseSupervisorMaxAttempts(process.env.TRAINING_AUDIT_MAX_ATTEMPTS);
  attemptTimeoutMs = parseSupervisorAttemptTimeout(
    process.env.TRAINING_AUDIT_ATTEMPT_TIMEOUT_MS,
  );
} catch (error) {
  writeOutputAtomic({
    ...startingReceipt,
    status: 'failed',
    supervisorFailure: error?.message || String(error),
  });
  throw error;
}
const result = await runTrainingRuntimeAuditSupervisor({
  command: process.execPath,
  args: [auditScript, ...childArgs],
  cwd: ROOT,
  env: {
    ...process.env,
    TRAINING_AUDIT_CHECKPOINT: checkpointPath,
    TRAINING_AUDIT_REQUIRE_FULL: allowPartial ? '0' : '1',
    TRAINING_AUDIT_LIFECYCLE: allowPartial
      ? process.env.TRAINING_AUDIT_LIFECYCLE
      : '1',
    TRAINING_AUDIT_QUESTIONS_PER_SESSION: allowPartial
      ? process.env.TRAINING_AUDIT_QUESTIONS_PER_SESSION
      : '20',
    TRAINING_AUDIT_SUPERVISED: '1',
  },
  maxAttempts,
  attemptTimeoutMs,
});

let exitCode = result.exitCode;
let receipt = null;
try {
  receipt = JSON.parse(readFileSync(outputPath, 'utf8'));
} catch {
  receipt = null;
}
if (exitCode === 0) {
  try {
    assert.equal(receipt?.success, true, 'runtime audit child exited successfully without a successful receipt');
    assert.notEqual(receipt?.status, 'in_progress', 'runtime audit child left an in-progress receipt');
    if (!allowPartial) {
      assert.equal(receipt?.certificationMode, 'full', 'runtime audit child did not produce a full certificate');
      assert.equal(receipt?.targetDeployment?.commitSha, expectedBuild,
        'runtime audit receipt is not bound to the requested deployment');
    }
  } catch (error) {
    exitCode = 1;
    receipt = {
      ...(receipt && typeof receipt === 'object' ? receipt : {}),
      success: false,
      status: 'failed',
      supervisorFailure: error?.message || String(error),
    };
  }
}
if (exitCode !== 0) {
  writeOutputAtomic({
    ...(receipt && typeof receipt === 'object' ? receipt : {}),
    success: false,
    status: 'failed',
    supervisor: {
      attempts: result.attempts,
      interruptedSignal: result.interruptedSignal,
      timedOut: result.lastResult?.timedOut === true,
      exitCode,
    },
  });
}

process.exitCode = exitCode;
