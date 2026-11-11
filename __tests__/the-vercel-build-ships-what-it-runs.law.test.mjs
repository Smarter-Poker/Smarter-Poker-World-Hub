// LAW: THE VERCEL BUILD'S CONTRACTS RUN BEFORE MERGE, AND IT SHIPS WHAT IT RUNS
// (2026-11-11, alert row 255715).
//
// On 2026-10-17 #2473 (27da635) added __tests__/printful-status.test.mjs to
// test:marketplace without its own `!/` line in .vercelignore. The marketplace
// contract in __tests__/marketplace-operations.test.mjs requires that line, and
// it ran in exactly two places: the Vercel production build (after merge) and
// Global Footer E2E's `npm run build` (on the PR, but not a required check).
// Global Footer E2E went red on #2473, the PR merged anyway, and production
// deployment dpl_CW1YLaroptrFiBRmbFotkxg5Fj7Y failed. #2474 added the line.
//
// The fix is where the contract runs: Pre-Deploy Safety Checks, which the main
// ruleset requires, now runs marketplace-operations.test.mjs and this file on
// every PR, so the same omission cannot reach main. Separately, every file the
// build command names must survive .vercelignore at all (git's own ignore
// engine), which covers tests/ and e2e/ where no broad re-include exists.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildInputs,
  checkCheckout,
  excludedFromUpload,
  unlistedMarketplaceTests,
} from '../scripts/ci/vercel-build-inputs.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = join(ROOT, '__tests__/fixtures/vercel-build-inputs-27da635');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('the 2026-10-17 build (27da635) is caught: printful-status.test.mjs had no line of its own', () => {
  const pre = JSON.parse(readFileSync(join(FIXTURE, 'build-scripts.json'), 'utf8'));
  const ignore = readFileSync(join(FIXTURE, 'vercelignore.txt'), 'utf8');
  assert.deepEqual(unlistedMarketplaceTests(pre.scripts['test:marketplace'], ignore), [
    '__tests__/printful-status.test.mjs',
  ]);
});

test('this checkout: every test:marketplace file has its own .vercelignore line', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.deepEqual(unlistedMarketplaceTests(scripts['test:marketplace'], read('.vercelignore')), []);
});

test('the required Pre-Deploy Safety Checks job runs the build contracts on every PR', () => {
  const workflow = read('.github/workflows/build-safety-gate.yml');
  const job = workflow.slice(workflow.indexOf('\n  safety-checks:'));
  assert.ok(job.length < workflow.length, 'safety-checks job not found');
  // The job ends where the next two-space-indented job key begins.
  const next = job.slice(1).search(/\n {2}[\w-]+:\n/);
  const jobBody = next === -1 ? job : job.slice(0, next + 1);
  assert.match(jobBody, /name: Pre-Deploy Safety Checks/);
  assert.match(jobBody, /if: github\.event_name == 'pull_request'/);
  const runs = [...jobBody.matchAll(/run: (node --test [^\n]+)/g)].map((m) => m[1]);
  const step = runs.find((run) => run.includes('__tests__/marketplace-operations.test.mjs'));
  assert.ok(step, 'marketplace-operations.test.mjs is not run by Pre-Deploy Safety Checks');
  assert.match(step, /__tests__\/the-vercel-build-ships-what-it-runs\.law\.test\.mjs/);
  assert.doesNotMatch(step, /--test-name-pattern|--test-skip-pattern/, 'run the whole files');
});

test('the matcher follows gitignore negation and directory rules', () => {
  const rules = '/tests/*\n!/tests/helpers/\n/tests/helpers/*\n!/tests/helpers/kept.mjs\n/docs/\n';
  assert.deepEqual(
    excludedFromUpload(rules, [
      'tests/a.test.mjs',
      'tests/helpers/kept.mjs',
      'tests/helpers/dropped.mjs',
      'docs/x.json',
      'scripts/y.mjs',
    ]),
    ['docs/x.json', 'tests/a.test.mjs', 'tests/helpers/dropped.mjs']
  );
});

test('a script the build names but package.json lacks is reported', () => {
  const inputs = buildInputs({
    buildCommand: 'npm run a',
    scripts: { a: 'node x.mjs && npm run b' },
    exists: () => true,
  });
  assert.deepEqual(inputs.missingScripts, ['b']);
});

test('this checkout: every file the Vercel build names is in the upload', async () => {
  const result = await checkCheckout(ROOT);
  assert.ok(result.files.length > 0, 'the build command names no files; re-read this law');
  assert.deepEqual(result.missingScripts, [], 'build reaches an npm script that does not exist');
  assert.deepEqual(
    result.excluded,
    [],
    'these files are run by the Vercel build but excluded by .vercelignore; re-include them'
  );
});
