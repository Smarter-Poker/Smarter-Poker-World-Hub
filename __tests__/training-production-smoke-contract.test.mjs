import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const smoke = readFileSync(
  new URL('../scripts/training-production-smoke.mjs', import.meta.url),
  'utf8',
);

test('production smoke enforces the footerless mobile arena launch contract', () => {
  assert.match(smoke, /mobile arena lobby must remain footerless/);
  assert.match(smoke, /assert\.equal\(geometry\.footerCount, 0/);
  assert.match(smoke, /launchBottomGap < 8 \|\| launchBottomGap > 48/);
  assert.match(smoke, /startInsideViewport/);
  assert.match(smoke, /launchInsideViewport/);
  assert.match(smoke, /startInsideLaunch/);
  assert.doesNotMatch(smoke, /mobile launch\/footer geometry missing/);
  assert.doesNotMatch(smoke, /mobile Start button is covered by the footer/);
});

test('production smoke is exact-build bound and emits atomic archive evidence', () => {
  assert.match(smoke, /TRAINING_PRODUCTION_EXPECTED_BUILD/);
  assert.match(smoke, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(smoke, /TRAINING_PRODUCTION_EVIDENCE_DIR/);
  assert.match(smoke, /isAbsolute\(input\)/);
  assert.match(smoke, /\/Volumes\/SmarterArchives\/agent-evidence/);
  assert.match(smoke, /must be a new run-specific directory/);
  assert.match(smoke, /function writeEvidenceAtomic/);
  assert.match(smoke, /renameSync\(temporaryPath, EVIDENCE_PATH\)/);
  assert.match(smoke, /mode: 0o600/);
  assert.match(smoke, /status: 'in_progress'/);
  assert.match(smoke, /summary\.status = 'complete'/);
  assert.match(smoke, /summary\.status = 'failed'/);
  assert.match(smoke, /path: join\(SCREENSHOT_DIR/);
  assert.doesNotMatch(smoke, /\/tmp(?:\/|['"`])/);
});

test('production smoke binds health and deployment identity before and after the run', () => {
  assert.match(smoke, /async function readDeploymentIdentity/);
  assert.match(smoke, /\/api\/health\?trainingProductionSmoke=/);
  assert.match(smoke, /function assertExpectedDeployment/);
  assert.match(smoke, /identity\.version,[\s\S]*EXPECTED_PROTECTED_BUILD/);
  assert.match(smoke, /identity\.commitSha,[\s\S]*EXPECTED_PROTECTED_BUILD/);
  assert.match(smoke, /identity\.deploymentId/);
  assert.match(smoke, /identity\.deploymentUrl/);
  assert.match(smoke, /summary\.deploymentBefore = await readDeploymentIdentity\(\)/);
  assert.match(smoke, /summary\.deploymentAfter = await readDeploymentIdentity\(\)/);
  assert.match(smoke, /assert\.deepEqual\([\s\S]*summary\.deploymentAfter,[\s\S]*summary\.deploymentBefore/);
});
