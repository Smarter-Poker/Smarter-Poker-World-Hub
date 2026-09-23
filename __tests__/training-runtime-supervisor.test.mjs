import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseStrictInteger,
  parseSupervisorAttemptTimeout,
  parseSupervisorMaxAttempts,
  runTrainingRuntimeAuditSupervisor,
} from '../scripts/lib/training-runtime-supervisor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

class FakeChild extends EventEmitter {
  constructor(result = null) {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.killCalls = [];
    if (result) {
      queueMicrotask(() => {
        this.exitCode = result.code;
        this.signalCode = result.signal;
        this.emit('exit', result.code, result.signal);
      });
    }
  }

  kill(signal) {
    this.killCalls.push(signal);
    queueMicrotask(() => {
      this.signalCode = signal;
      this.emit('exit', null, signal);
    });
    return true;
  }
}

class TermResistantChild extends FakeChild {
  kill(signal) {
    this.killCalls.push(signal);
    if (signal === 'SIGKILL') {
      queueMicrotask(() => {
        this.signalCode = signal;
        this.emit('exit', null, signal);
      });
    }
    return true;
  }
}

function memoryStream() {
  const chunks = [];
  return {
    chunks,
    write(value) {
      chunks.push(String(value));
      return true;
    },
  };
}

test('package exposes the supervised runtime audit as a permanent entrypoint', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['audit:training:runtime'],
    'node scripts/training-runtime-surface-audit-supervisor.mjs',
  );
  const supervisor = readFileSync(
    join(ROOT, 'scripts/training-runtime-surface-audit-supervisor.mjs'),
    'utf8',
  );
  assert.match(supervisor, /status: 'in_progress'/);
  assert.match(supervisor, /TRAINING_AUDIT_REQUIRE_FULL: allowPartial \? '0' : '1'/);
  assert.match(supervisor, /TRAINING_AUDIT_EXPECTED_BUILD/);
  assert.match(supervisor, /receipt\?\.certificationMode, 'full'/);

  const expectedAuthorityTests = [
    'action-button-style-contract',
    'award-diamonds-v2-concurrency',
    'chart-question-node',
    'leak-engine-wiring',
    'preflop-local-practice-authority',
    'training-acl-closeout-authority',
    'training-advisor-followup-migration',
    'training-answer-grading-contract',
    'training-arena-auxiliary-mode-authority',
    'training-arena-client-answer-authority',
    'training-arena-review-gateway-authority',
    'training-attestation-continuation-real-geometry',
    'training-authored-model-honesty',
    'training-authored-surface-authority',
    'training-auxiliary-launch-wiring',
    'training-batch-canonical-replacement',
    'training-blind-grading-boundary',
    'training-bookmark-authority',
    'training-client-endpoint-wiring',
    'training-coach-local-practice-authority',
    'training-coaching-summary-authority',
    'training-community-leaderboard-authority',
    'training-completion-api-boundary',
    'training-cross-rpc-concurrency',
    'training-custom-config-contract',
    'training-custom-launch-contract',
    'training-custom-solve-preflop-contract',
    'training-custom-solver-spot-authority',
    'training-daily-challenge-authority',
    'training-daily-goals-authority',
    'training-dashboard-rpc-authority',
    'training-feed-authority',
    'training-final-honesty-surfaces',
    'training-focused-launch-wiring',
    'training-generated-scenario-provenance',
    'training-grading-receipt',
    'training-history-outage-honesty',
    'training-hub-outage-honesty',
    'training-jarvis-study-plan-authority',
    'training-jarvis-verified-launchers',
    'training-leaderboard-page-authority',
    'training-legacy-authority-boundary',
    'training-legacy-consumer-authority',
    'training-level-launch-authority',
    'training-level-progress-failclosed',
    'training-memory-games-authored-reference',
    'training-memory-practice-authority',
    'training-milestone-reward-authority',
    'training-mixed-strategy-launch-authority',
    'training-multistreet-hand-manager',
    'training-next-street-authority',
    'training-phase-2-adversarial',
    'training-phase-3-adversarial',
    'training-phase6-truth-closeout',
    'training-polling-lifecycle-authority',
    'training-postflop-heuristic-provenance',
    'training-practice-session-boundary',
    'training-preflop-chart-authority',
    'training-preflop-daily-practice-authority',
    'training-preloader-eligibility',
    'training-progress-authority-read',
    'training-projection-authority-package-c',
    'training-question-delivery-authority',
    'training-question-integrity',
    'training-question-order-contract',
    'training-question-selection-contract',
    'training-range-builder-authored-reference',
    'training-request-deadline',
    'training-reissue-authority',
    'training-retired-achievement-challenge-authority',
    'training-retired-analysis-authority',
    'training-retired-client-mutations',
    'training-retired-legacy-solver-surfaces',
    'training-reward-display-authority',
    'training-runtime-checkpoint',
    'training-runtime-fixture-authority',
    'training-runtime-supervisor',
    'training-runtime-wiring',
    'training-server-authority-migration',
    'training-session-attempt-contract',
    'training-session-config-contract',
    'training-single-question-recovery-contract',
    'training-skill-tree-zero-xp-authority',
    'training-solutions-v2-authority',
    'training-solver-contract',
    'training-solver-row-identity',
    'training-solver-scoped-protocol-custody',
    'training-solver-worker-ingestion',
    'training-spot-study-authority',
    'training-spot-trainer-launcher-authority',
    'training-streak-authority-read',
    'training-streak-entitlement-contract',
    'training-streak-settlement-ui',
    'training-surface-inventory-classifier',
    'training-tournaments-read-contract',
    'training-verified-leaderboard',
    'training-verified-report-authority',
  ].map((name) => `__tests__/${name}.test.mjs`).sort();
  const authorityCommand = packageJson.scripts['test:training:phase6-authority'];
  assert.match(
    packageJson.scripts['pretest:training:phase6-authority'],
    /__tests__\/training-production-delivery-attestation\.test\.mjs/,
    'the production delivery attestation contract must run in the permanent Phase 6 gate',
  );
  assert.match(authorityCommand, /^node --experimental-vm-modules --test /);
  assert.deepEqual(
    [...authorityCommand.matchAll(/__tests__\/[^ ]+\.test\.mjs/g)].map(([path]) => path).sort(),
    expectedAuthorityTests,
  );
  assert.match(packageJson.scripts.build, /npm run test:training:phase6-authority/);
  assert.equal(
    packageJson.scripts['audit:training:phase6-db'],
    'npm run audit:training:award-db && npm run audit:training:authority-db && npm run audit:training:cross-rpc-db && npm run audit:training:delivery-db && npm run audit:training:acl-db && npm run audit:training:truth-db && npm run audit:training:migration-runner-db && npm run audit:training:solver-catalog-db',
  );
  assert.equal(
    packageJson.scripts['audit:training:migration-runner-db'],
    'node --test __tests__/sql-migration-runner-postgres.test.mjs',
    'the permanent PostgreSQL gate must exercise the hardened migration runner against a real PG17 server',
  );

  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  assert.match(vercel.buildCommand, /npm run test:training:phase6-authority/);
  const vercelIgnore = readFileSync(join(ROOT, '.vercelignore'), 'utf8');
  const phase6BuildTests = [
    packageJson.scripts['test:training:legacy-windows-retirement'],
    packageJson.scripts['pretest:training:phase6-authority'],
    packageJson.scripts['test:training:phase6-authority'],
  ].flatMap((command) => [...command.matchAll(/__tests__\/[^ ]+\.test\.mjs/g)]
    .map(([testPath]) => `/${testPath}`));
  const phase6TransitiveInputs = [
    '/__tests__/solver-matrix-trust-runtime-probe.cjs',
    '/e2e/03-training-gto.spec.ts',
    '/tests/helpers/canonicalTrainingPolicyFixture.mjs',
  ];
  const deploymentReincludes = vercelIgnore
    .split(/\r?\n/)
    .filter((line) => line.startsWith('!/'))
    .map((line) => new RegExp(`^${line.slice(1)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '[^/]*')}$`));
  assert.ok(phase6BuildTests.length > 0, 'expected Phase 6 deployment test inputs');
  for (const testPath of [...phase6BuildTests, ...phase6TransitiveInputs]) {
    assert.ok(
      deploymentReincludes.some((pattern) => pattern.test(testPath)),
      `${testPath} must survive .vercelignore for the Vercel authority gate`,
    );
  }

  const safetyGate = readFileSync(
    join(ROOT, '.github/workflows/build-safety-gate.yml'),
    'utf8',
  );
  assert.match(safetyGate, /CHECK 24: Training server-authority contracts/);
  assert.match(safetyGate, /node-version: '24\.12\.0'/);
  assert.match(safetyGate, /Restore node_modules For Training Authority/);
  assert.match(safetyGate, /npm ci --ignore-scripts/);
  assert.ok(
    safetyGate.indexOf('Install Dependencies For Training Authority')
      < safetyGate.indexOf('CHECK 24: Training server-authority contracts'),
    'the clean required runner must install authority-test dependencies before CHECK 24',
  );
  const authorityInstallBlock = safetyGate.slice(
    safetyGate.indexOf('Install Dependencies For Training Authority'),
    safetyGate.indexOf('CHECK 24: Training server-authority contracts'),
  );
  assert.doesNotMatch(
    authorityInstallBlock,
    /npm install/,
    'the required authority gate must fail closed on a non-reproducible npm ci failure',
  );
  assert.equal(
    (safetyGate.match(/run: npm run test:training:phase6-authority/g) || []).length,
    1,
    'the required PR safety context must run the authority suite exactly once',
  );
  assert.match(
    safetyGate,
    /name: "CHECK 8: Auth-critical files exist"[\s\S]*?node --experimental-vm-modules --test/,
    'the aggregate safety guard must enable VM modules before importing Phase 6 transport tests',
  );
  assert.match(safetyGate, /postgresql-17/);
  const postgresInstallBlock = safetyGate.slice(
    safetyGate.indexOf('Install PostgreSQL 17 For Training Authority On Linux Runners'),
    safetyGate.indexOf('Resolve Exact PostgreSQL 17 Training Test Binaries'),
  );
  assert.match(
    postgresInstallBlock,
    /if: runner\.os == 'Linux'/,
    'the required gate must provision exact PostgreSQL 17 on the Linux self-hosted estate',
  );
  assert.doesNotMatch(
    postgresInstallBlock,
    /runner\.environment == 'github-hosted'/,
    'self-hosted Linux runners must not bypass PostgreSQL 17 provisioning',
  );
  assert.match(safetyGate, /PHASE6_POSTGRES_BIN=\$postgres_bin/);
  assert.match(safetyGate, /AWARD_V2_POSTGRES_BIN=\$postgres_bin/);
  assert.match(safetyGate, /CHECK 24C: Training PostgreSQL 17 Behavioral Authority/);
  assert.equal(
    (safetyGate.match(/run: npm run audit:training:phase6-db/g) || []).length,
    1,
    'the required PR safety context must run the PostgreSQL 17 behavior suite exactly once',
  );
});

test('every Phase 6 database verifier requires exact PostgreSQL 17 binaries', () => {
  for (const file of [
    'scripts/verify-award-diamonds-v2-concurrency-postgres.mjs',
    'scripts/verify-training-authority-postgres.mjs',
    'scripts/verify-training-cross-rpc-concurrency-postgres.mjs',
    'scripts/verify-training-cache-replay-postgres.mjs',
    'scripts/verify-training-acl-closeout-postgres.mjs',
    'scripts/verify-training-phase6-truth-postgres.mjs',
    'scripts/verify-training-solver-catalog-postgres.mjs',
  ]) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.match(source, /\/usr\/lib\/postgresql\/17\/bin/, file);
    assert.match(source, /pg_config', \['--bindir'\]/, file);
    assert.match(source, /\\b17\\\.\\d\+\\b/, file);
    assert.doesNotMatch(source, /postgresql@16/, file);
    assert.match(source, /createdb/, `${file} must require createdb`);
    assert.match(source, /--locale=en_US\.UTF-8/, `${file} must use production-like collation`);
    assert.match(source, /server_version_num/, `${file} must assert the running server major`);
    assert.match(source, /server_encoding/, `${file} must assert UTF8`);
    assert.match(source, /datcollate/, `${file} must assert production-like collation`);
  }
});

test('supervisor retries with the same checkpoint environment and then succeeds', async () => {
  const launches = [];
  const results = [
    { code: 1, signal: null },
    { code: 0, signal: null },
  ];
  const stderr = memoryStream();
  const result = await runTrainingRuntimeAuditSupervisor({
    command: '/runtime/node',
    args: ['/repo/scripts/training-runtime-surface-audit.mjs'],
    cwd: '/repo',
    env: {
      TRAINING_AUDIT_CHECKPOINT: '/tmp/runtime.checkpoint.json',
      TRAINING_AUDIT_SUPERVISED: '1',
    },
    maxAttempts: 4,
    stderr,
    signalSource: new EventEmitter(),
    spawnImpl(command, args, options) {
      launches.push({ command, args, options });
      return new FakeChild(results[launches.length - 1]);
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.attempts, 2);
  assert.equal(launches.length, 2);
  assert.deepEqual(
    launches.map(({ options }) => options.env.TRAINING_AUDIT_CHECKPOINT),
    ['/tmp/runtime.checkpoint.json', '/tmp/runtime.checkpoint.json'],
  );
  assert.ok(launches.every(({ options }) => options.stdio === 'inherit'));
  assert.match(stderr.chunks.join(''), /preserving the fail-closed checkpoint/);
});

test('supervisor stops after the first successful child', async () => {
  let launches = 0;
  const result = await runTrainingRuntimeAuditSupervisor({
    maxAttempts: 4,
    stderr: memoryStream(),
    signalSource: new EventEmitter(),
    spawnImpl() {
      launches += 1;
      return new FakeChild({ code: 0, signal: null });
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.attempts, 1);
  assert.equal(launches, 1);
});

test('supervisor enforces its maximum attempt count and returns the last failure', async () => {
  let launches = 0;
  const result = await runTrainingRuntimeAuditSupervisor({
    maxAttempts: 3,
    stderr: memoryStream(),
    signalSource: new EventEmitter(),
    spawnImpl() {
      launches += 1;
      return new FakeChild({ code: 7, signal: null });
    },
  });

  assert.equal(result.exitCode, 7);
  assert.equal(result.attempts, 3);
  assert.equal(launches, 3);
  assert.equal(parseSupervisorMaxAttempts(undefined), 4);
  assert.equal(parseSupervisorMaxAttempts('3'), 3);
  for (const value of ['0', '1.5', '11', 'invalid']) {
    assert.throws(() => parseSupervisorMaxAttempts(value), /integer from 1 through 10/);
  }
});

test('strict runtime integers reject NaN, infinities, fractions, and out-of-range values', () => {
  assert.equal(parseStrictInteger(undefined, {
    name: 'batch size', fallback: 8, minimum: 1, maximum: 107,
  }), 8);
  assert.equal(parseStrictInteger('107', {
    name: 'batch size', fallback: 8, minimum: 1, maximum: 107,
  }), 107);
  for (const value of ['NaN', 'Infinity', '1.5', '0', '108']) {
    assert.throws(() => parseStrictInteger(value, {
      name: 'batch size', fallback: 8, minimum: 1, maximum: 107,
    }), /batch size must be an integer from 1 through 107/);
  }
  assert.equal(parseSupervisorAttemptTimeout(undefined), 4 * 60 * 60 * 1_000);
  assert.throws(() => parseSupervisorAttemptTimeout('59999'), /60000 through 86400000/);
});

test('supervisor times out a stuck child, escalates to SIGKILL, and fails closed', async () => {
  const children = [];
  const result = await runTrainingRuntimeAuditSupervisor({
    maxAttempts: 1,
    attemptTimeoutMs: 5,
    killGraceMs: 5,
    stderr: memoryStream(),
    signalSource: new EventEmitter(),
    spawnImpl() {
      const child = new TermResistantChild();
      children.push(child);
      return child;
    },
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.lastResult.timedOut, true);
  assert.equal(result.lastResult.terminationReason, 'timeout');
  assert.deepEqual(children[0].killCalls, ['SIGTERM', 'SIGKILL']);
});

for (const [signal, expectedExitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  test(`supervisor forwards ${signal}, preserves the checkpoint, and does not retry`, async () => {
    const signalSource = new EventEmitter();
    const children = [];
    const resultPromise = runTrainingRuntimeAuditSupervisor({
      maxAttempts: 4,
      stderr: memoryStream(),
      signalSource,
      spawnImpl() {
        const child = new FakeChild();
        children.push(child);
        queueMicrotask(() => signalSource.emit(signal));
        return child;
      },
    });

    const result = await resultPromise;
    assert.equal(result.exitCode, expectedExitCode);
    assert.equal(result.attempts, 1);
    assert.equal(result.interruptedSignal, signal);
    assert.equal(children.length, 1);
    assert.deepEqual(children[0].killCalls, [signal]);
    assert.equal(signalSource.listenerCount('SIGINT'), 0);
    assert.equal(signalSource.listenerCount('SIGTERM'), 0);
  });
}
