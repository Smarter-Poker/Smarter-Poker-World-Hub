/**
 * __tests__/pg17-parallel-and-build-parity.law.test.mjs
 *
 * Law & regression fortress for:
 *   - Item 6: Bounded parallel execution of all 39 PostgreSQL 17 qualification
 *     suites inside the required `Pre-Deploy Safety Checks` job.
 *   - Item 2: Cached `Vercel Build Parity (next build --webpack)` PR gate in
 *     `.github/workflows/build-safety-gate.yml` with read-only `node_modules`
 *     restore so `prune-platform-bins.sh` / `patch-next.js` never mutate the
 *     shared `nm-wh-noscripts` cache.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  buildSuiteEnv,
  extractSuitesFromWorkflow,
  parseConcurrency,
  parseSuiteManifest,
  runSuitesParallel,
} from '../scripts/ci/run-pg17-suites-parallel.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/build-safety-gate.yml');
const RUNNER_PATH = path.join(ROOT, 'scripts/ci/run-pg17-suites-parallel.mjs');

const EXPECTED_PG17_SUITES = [
  {
    name: 'CHECK 24C: Training PostgreSQL 17 Behavioral Authority',
    commandMatch: /npm run audit:training:phase6-db/,
  },
  {
    name: 'Reels Native Queue Captions Reactions And Measurements PostgreSQL Authority',
    commandMatch: /__tests__\/reels-measured-delivery-postgres\.test\.mjs/,
  },
  {
    name: 'Trivia Phase 12 PostgreSQL 17 Cutover Authority',
    commandMatch: /bash scripts\/trivia\/p12-cutover-replica-tests\/run\.sh/,
  },
  {
    name: 'Stable Admin Restrictions And Private Exports Native PostgreSQL 17',
    commandMatch: /node scripts\/qualify-operator-export-artifacts-pg17\.mjs/,
  },
  {
    name: 'Messenger Saved Statements And Received Payments PostgreSQL',
    commandMatch: /node scripts\/ci\/test-messenger-accounting-postgres\.mjs/,
  },
  {
    name: 'Atomic actual-own-hand publication qualification',
    commandMatch: /node scripts\/ci\/test-grounded-hand-publication\.mjs/,
  },
  {
    name: 'Signup Player Number And Downstream PostgreSQL Regression',
    commandMatch: /node --test __tests__\/signup-player-number-postgres\.test\.mjs/,
  },
  {
    name: 'VIP Gift Friendship Payment And Redemption PostgreSQL 17',
    commandMatch: /node --test __tests__\/vip-gifts-postgres\.test\.mjs/,
  },
  {
    name: 'Notice Cashout Authorization And Bank Settlement PostgreSQL',
    commandMatch: /python3 scripts\/ci\/test-notice-cashout-postgres\.py/,
  },
  {
    name: 'Club Notice Board Native Authorization And Pagination',
    commandMatch: /node --test __tests__\/club-notice-board-postgres\.test\.mjs/,
  },
  {
    name: 'Private Schema Manifest PostgreSQL Contract',
    commandMatch: /python3 scripts\/ci\/test-schema-manifest-postgres\.py/,
  },
  {
    name: 'Weekly Club Statement Certified Details PostgreSQL',
    commandMatch: /python3 scripts\/ci\/test-weekly-club-details-postgres\.py/,
  },
  {
    name: 'Training Favorite Ownership And Constraints',
    commandMatch: /node --test __tests__\/training-game-favorites-postgres\.test\.mjs/,
  },
  {
    name: 'Notification Delivery Policy And Database Guards',
    commandMatch: /node --test __tests__\/notification-delivery-policy\.test\.mjs __tests__\/notification-delivery-policy-postgres\.test\.mjs/,
  },
  {
    name: 'Video Library Channel Follows PostgreSQL 17',
    commandMatch: /node scripts\/qualification\/videoLibraryChannelFollows\.mjs/,
  },
  {
    name: 'Video Library Playlist Ordering PostgreSQL 17',
    commandMatch: /node scripts\/qualification\/videoLibraryPlaylistReorder\.mjs/,
  },
  {
    name: 'Messenger Dock Publication PostgreSQL 17',
    commandMatch: /python3 scripts\/ci\/test-messenger-dock-publication\.py/,
  },
  {
    name: 'Caption Model Budget PostgreSQL 17 Contracts',
    commandMatch: /node --test __tests__\/caption-model-budget-migration\.test\.mjs/,
  },
  {
    name: 'Public Profile RPC Privacy PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/public-profile-rpc-migration-postgres\.test\.mjs/,
  },
  {
    name: 'Home Games Address Visibility PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/home-games-address-visibility-postgres\.test\.mjs/,
  },
  {
    name: 'Home Games Owner Consistency PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/home-games-owner-consistency-postgres\.test\.mjs/,
  },
  {
    name: 'Poker Near Me Contributions PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/pnm-contributions-postgres\.test\.mjs/,
  },
  {
    name: 'Poker Near Me Player Planning PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/pnm-player-planning-postgres\.test\.mjs/,
  },
  {
    name: 'Social Horse Real Name PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/social-horse-real-name-postgres\.test\.mjs/,
  },
  {
    name: 'Horse News Atomic Publisher PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/horse-news-atomic-publisher-postgres\.test\.mjs/,
  },
  {
    name: 'Native Video Source Revocation PostgreSQL 17 Contract',
    commandMatch: /node --test __tests__\/native-video-source-revocation-postgres\.test\.mjs/,
  },
  {
    name: 'Trivia Phase 11 Payout Control PostgreSQL 17 Authority',
    commandMatch: /bash scripts\/trivia\/p11-payout-control-replica-tests\/run\.sh/,
  },
  {
    name: 'Trivia Phase 9 Solo Authority PostgreSQL 17 Cutover',
    commandMatch: /bash scripts\/trivia\/phase9-solo-authority-replica-tests\/run\.sh/,
  },
  {
    name: 'Training Phase 6 Atomic Management PostgreSQL Rollback Authority',
    commandMatch: /node scripts\/qualify-phase6-atomic-management-pg17\.mjs/,
  },
  {
    name: 'Trivia Phase 11 Alert And Kill-Switch PostgreSQL 17 Drills',
    commandMatch: /bash scripts\/trivia\/p11-alert-killswitch-replica-tests\/run\.sh/,
  },
  {
    name: 'Engine Alert Receipt PostgreSQL Contracts',
    commandMatch: /node --test __tests__\/engine-alert-receipts-postgres\.test\.mjs/,
  },
  {
    name: 'Historical User Reels Rights PostgreSQL Contracts',
    commandMatch: /npm run audit:video-reels:post-rights-db/,
  },
  {
    name: 'One Reaction Invokes One Notification Handler',
    commandMatch: /python3 scripts\/ci\/test-reaction-notification-postgres\.py/,
  },
  {
    name: 'Messenger Sends Preserve Request Identity',
    commandMatch: /python3 scripts\/ci\/test-messenger-send-postgres\.py/,
  },
  {
    name: 'Messenger Account Continuity And History Navigation',
    commandMatch: /python3 scripts\/ci\/test-messenger-continuity-postgres\.py/,
  },
  {
    name: 'Messenger Deletion Persists Per Account',
    commandMatch: /python3 scripts\/ci\/test-messenger-deletion-postgres\.py/,
  },
  {
    name: 'Messenger Reads Stop At The Displayed Message',
    commandMatch: /python3 scripts\/ci\/test-messenger-bounded-read-postgres\.py/,
  },
  {
    name: 'Club Messenger Welcomes Follow The Committed Downline',
    commandMatch: /python3 scripts\/ci\/test-club-messenger-welcome-postgres\.py/,
  },
  {
    name: 'Owner Operational Notification PostgreSQL Contracts',
    commandMatch: /python3 scripts\/ci\/test-owner-operational-notification-postgres\.py/,
  },
];

test('100% suite parity: all 39 PG17 suites stay wired in Pre-Deploy Safety Checks with exact job name and artifact upload', () => {
  const workflowText = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const parsedWorkflow = yaml.load(workflowText);

  assert.equal(
    parsedWorkflow.jobs['safety-checks']?.name,
    'Pre-Deploy Safety Checks',
    'Required branch-protection job name "Pre-Deploy Safety Checks" must never change',
  );

  const steps = parsedWorkflow.jobs['safety-checks'].steps;
  const parallelStep = steps.find((s) => s.name === 'Run PostgreSQL 17 Qualification Suites In Parallel');
  assert.ok(parallelStep, 'Pre-Deploy Safety Checks must invoke the parallel PG17 runner step');
  assert.equal(parallelStep.id, 'owner_notification_postgres');
  assert.match(parallelStep.run, /node scripts\/ci\/run-pg17-suites-parallel\.mjs --concurrency 4/);

  const uploadStep = steps.find((s) => s.name === 'Retain Owner Notification PostgreSQL Evidence');
  assert.ok(uploadStep, 'Owner notification artifact upload step must stay preserved');
  assert.equal(uploadStep.with?.path, 'artifacts/owner-operational-notification/');
  assert.match(uploadStep.if, /steps\.owner_notification_postgres\.outcome != 'skipped'/);

  const extracted = extractSuitesFromWorkflow(workflowText);
  assert.equal(
    extracted.length,
    EXPECTED_PG17_SUITES.length,
    `Expected all ${EXPECTED_PG17_SUITES.length} PG17 suites in parallel manifest, found ${extracted.length}`,
  );

  const byName = new Map(extracted.map((s) => [s.name, s]));
  for (const expected of EXPECTED_PG17_SUITES) {
    const actual = byName.get(expected.name);
    assert.ok(actual, `Missing PG17 suite from parallel manifest: "${expected.name}"`);
    assert.match(actual.run, expected.commandMatch, `Suite "${expected.name}" lost its expected command`);
  }
});

test('concurrency validation enforces bounded integer limits', () => {
  assert.equal(parseConcurrency(undefined), DEFAULT_CONCURRENCY);
  assert.equal(parseConcurrency(''), DEFAULT_CONCURRENCY);
  assert.equal(parseConcurrency('1'), MIN_CONCURRENCY);
  assert.equal(parseConcurrency('4'), 4);
  assert.equal(parseConcurrency(String(MAX_CONCURRENCY)), MAX_CONCURRENCY);
  for (const bad of ['0', '-1', '17', '999', 'abc', '2.5', '4;rm -rf /']) {
    assert.throws(() => parseConcurrency(bad), /concurrency|out of bounds|Invalid/i, `must reject "${bad}"`);
  }
});

test('manifest parser rejects empty, malformed, and duplicate suites', () => {
  assert.throws(() => parseSuiteManifest('[]'), /non-empty/);
  assert.throws(() => parseSuiteManifest('- name: only-name\n'), /missing a non-empty "run"/);
  assert.throws(
    () => parseSuiteManifest('- name: dup\n  run: echo 1\n- name: dup\n  run: echo 2\n'),
    /Duplicate suite name/,
  );
});

test('buildSuiteEnv isolates shared TMPDIR/RUNNER_TEMP while preserving suite-specific overrides', () => {
  const baseEnv = {
    PATH: process.env.PATH,
    RUNNER_TEMP: '/tmp/shared-runner-temp',
    TMPDIR: '/tmp/shared-runner-temp',
    PHASE6_POSTGRES_BIN: '/usr/lib/postgresql/17/bin',
  };
  const suiteTmp = '/tmp/shared-runner-temp/pg17-abc/01';
  const env = buildSuiteEnv(
    baseEnv,
    {
      TMPDIR: '/tmp/shared-runner-temp',
      PG17_BINDIR: '/usr/lib/postgresql/17/bin',
      VIP_GIFT_POSTGRES_ROOT: '/tmp/shared-runner-temp/vip-gifts',
    },
    suiteTmp,
  );
  assert.equal(env.TMPDIR, suiteTmp, 'shared TMPDIR must be redirected to the suite subdir');
  assert.equal(env.RUNNER_TEMP, suiteTmp, 'RUNNER_TEMP must be isolated to the suite subdir');
  assert.equal(env.PG17_BINDIR, '/usr/lib/postgresql/17/bin');
  assert.equal(env.VIP_GIFT_POSTGRES_ROOT, '/tmp/shared-runner-temp/vip-gifts');
});

test('runSuitesParallel executes concurrently within bounds, isolates scratch dirs, and propagates failures', async (t) => {
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pg17-runner-test-'));
  t.after(() => fs.rmSync(scratchRoot, { recursive: true, force: true }));

  const seenTmpDirs = new Set();
  const suites = [
    { name: 'suite-a', run: 'sleep 0.12 && echo "ok-a:$TMPDIR:$RUNNER_TEMP"', env: {} },
    { name: 'suite-b', run: 'sleep 0.12 && echo "ok-b:$TMPDIR:$RUNNER_TEMP"', env: {} },
    { name: 'suite-c', run: 'echo "err-c" >&2 && exit 7', env: {} },
    { name: 'suite-d', run: 'sleep 0.12 && echo "ok-d:$TMPDIR:$RUNNER_TEMP"', env: {} },
    { name: 'suite-e', run: 'echo "ok-e:$TMPDIR:$RUNNER_TEMP"', env: {} },
  ];

  const summary = await runSuitesParallel(suites, {
    concurrency: 2,
    tempParent: scratchRoot,
    baseEnv: { ...process.env, RUNNER_TEMP: scratchRoot, TMPDIR: scratchRoot },
  });

  assert.equal(summary.ok, false, 'any failing suite must fail the parallel batch');
  assert.equal(summary.totalCount, 5);
  assert.equal(summary.passedCount, 4);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.maxObservedConcurrency, 2, 'worker pool must never exceed requested concurrency');

  const failed = summary.results.find((r) => r.name === 'suite-c');
  assert.ok(failed);
  assert.equal(failed.ok, false);
  assert.equal(failed.exitCode, 7);
  assert.match(failed.stderr, /err-c/);

  for (const r of summary.results.filter((x) => x.ok)) {
    const match = r.stdout.trim().match(/^ok-[a-e]:([^:]+):(.+)$/);
    assert.ok(match, `unexpected stdout for ${r.name}: ${r.stdout}`);
    assert.equal(match[1], match[2], 'TMPDIR and RUNNER_TEMP must match per-suite subdir');
    assert.notEqual(match[1], scratchRoot, 'suite must not share the bare scratch root');
    seenTmpDirs.add(match[1]);
  }
  assert.equal(seenTmpDirs.size, 4, 'every passing suite must receive a unique scratch subdir');

  // Batch scratch dir must be cleaned up after completion.
  assert.deepEqual(fs.readdirSync(scratchRoot), [], 'batch temporary root must be cleaned up after exit');
});

test('CLI integration: run-pg17-suites-parallel.mjs exits 0 on all-pass and 1 when any suite fails', (t) => {
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pg17-cli-test-'));
  t.after(() => fs.rmSync(scratchRoot, { recursive: true, force: true }));

  const env = { ...process.env, RUNNER_TEMP: scratchRoot, TMPDIR: scratchRoot, GITHUB_ACTIONS: 'false' };
  const passManifest = '- name: pass-1\n  run: echo pass-one\n- name: pass-2\n  run: echo pass-two\n';
  const passRes = spawnSync(process.execPath, [RUNNER_PATH, '--concurrency', '2'], {
    input: passManifest,
    env,
    encoding: 'utf8',
  });
  assert.equal(passRes.status, 0, passRes.stderr);
  assert.match(passRes.stdout, /OK: 2\/2 PostgreSQL 17 suite\(s\) passed/);

  const failManifest = '- name: pass-1\n  run: echo pass-one\n- name: fail-2\n  run: echo boom >&2 && exit 3\n';
  const failRes = spawnSync(process.execPath, [RUNNER_PATH, '--concurrency', '2'], {
    input: failManifest,
    env,
    encoding: 'utf8',
  });
  assert.equal(failRes.status, 1, 'CLI must exit 1 when any suite fails');
  assert.match(failRes.stderr, /FAILED: 1\/2 PostgreSQL 17 suite\(s\) failed/);
  assert.match(failRes.stderr, /boom/);
});

test('Vercel Build Parity job runs cached npm run build:vercel without mutating shared node_modules cache', () => {
  const workflowText = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const parsedWorkflow = yaml.load(workflowText);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const vercelCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const job = parsedWorkflow.jobs['vercel-build-parity'];

  assert.ok(job, 'build-safety-gate.yml must define the vercel-build-parity job');
  assert.equal(job.name, 'Vercel Build Parity (webpack)');
  assert.equal(job.if, "github.event_name == 'pull_request'");

  const nmStep = job.steps.find((s) => s.with?.path === 'node_modules');
  assert.ok(nmStep, 'vercel-build-parity must restore node_modules');
  assert.equal(
    nmStep.uses,
    'actions/cache/restore@v4',
    'must use read-only actions/cache/restore@v4 so prune-platform-bins.sh and patch-next.js never save a mutated node_modules back to the shared cache',
  );
  assert.equal(
    nmStep.with.key,
    "nm-wh-noscripts-${{ runner.os }}-node24-${{ hashFiles('package-lock.json') }}",
  );

  const installStep = job.steps.find((s) => typeof s.run === 'string' && s.run.includes('npm ci'));
  assert.ok(installStep, 'vercel-build-parity must install on cache miss');
  assert.equal(installStep.if, `steps.${nmStep.id}.outputs.cache-hit != 'true'`);
  assert.equal(installStep.run.trim(), 'npm ci --ignore-scripts');

  const nextCacheStep = job.steps.find((s) => s.with?.path === '.next/cache');
  assert.ok(nextCacheStep, 'vercel-build-parity must cache .next/cache across runs');
  assert.equal(nextCacheStep.uses, 'actions/cache@v4');

  const buildStep = job.steps.find((s) => typeof s.run === 'string' && s.run.includes('npm run build:vercel'));
  assert.ok(buildStep, 'vercel-build-parity must execute exact vercel.json buildCommand (npm run build:vercel)');
  assert.equal(buildStep.run.trim(), vercelCfg.buildCommand);
  assert.equal(buildStep.env?.NODE_ENV, 'production');

  // Verify build:vercel itself keeps the exact webpack build + bundle-budget pipeline.
  const buildVercel = pkg.scripts?.['build:vercel'] ?? '';
  assert.match(buildVercel, /node scripts\/copy-reader-assets\.mjs/);
  assert.match(buildVercel, /bash scripts\/prune-platform-bins\.sh/);
  assert.match(buildVercel, /node scripts\/patch-next\.js/);
  assert.match(buildVercel, /NODE_OPTIONS='--max-old-space-size=4096' next build --webpack/);
  assert.match(buildVercel, /node scripts\/check-horses-phase9-bundles\.mjs/);
});
