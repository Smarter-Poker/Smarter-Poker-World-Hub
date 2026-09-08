// ----------------------------------------------------------------------------
// THE PIPELINE DOES NOT FIGHT ITSELF (law, 2026-09-08)
//
// Three settings that each spent months quietly costing minutes per change,
// found by `.agent/audits/2026-09-08-publish-pipeline-improvements.md`. Every
// one was a plausible-looking constant that had outlived its reason, and none
// was wrong in a way anything could see. So they get a test.
//
//   1. The build was told to use 2 cores on an 8-core machine.
//   2. Preview deployments were opt-OUT, so every branch prefix nobody had
//      thought of built a preview no one opened, in production's own queue.
//   3. e2e-tests.yml cancelled its own main runs faster than they could finish.
//
// These assertions read the real files. They do not run a build - the proof
// that cores 3 and 4 are actually used is the Vercel build log's "using N
// workers" line, recorded in the audit.
// ----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// -- 1. The build reads the machine instead of hard-coding a core count -------

test('experimental.cpus is derived from the machine, never a bare constant', () => {
  const cfg = read('next.config.js');

  assert.match(
    cfg,
    /cpus:\s*resolveBuildCpus\(\)/,
    'experimental.cpus must call resolveBuildCpus(). A literal here is how the ' +
      'build ended up using 2 of 8 cores for four months.'
  );
  assert.doesNotMatch(
    cfg,
    /cpus:\s*process\.env\.BUILD_CPUS\s*\?\s*Number\(process\.env\.BUILD_CPUS\)\s*:\s*\d+/,
    'the old ternary with a constant fallback is back'
  );
  assert.match(cfg, /function resolveBuildCpus\(\)/, 'resolveBuildCpus() must exist');
  assert.match(
    cfg,
    /availableParallelism|os\.cpus\(\)/,
    'resolveBuildCpus() must actually read the core count'
  );
  assert.match(
    cfg,
    /process\.env\.BUILD_CPUS/,
    'BUILD_CPUS must remain an override - it is the documented escape hatch for ' +
      'the /_not-found export-worker race on constrained machines'
  );
});

test('the real resolveBuildCpus gives 4 on an 8-core builder and 1 on a 2-core box', () => {
  // Extracted and evaluated from next.config.js rather than re-implemented, so
  // this cannot pass against a function that no longer behaves this way.
  // next.config.js is not imported directly: it pulls in Sentry, PWA and a
  // child_process call at module scope.
  const src = read('next.config.js');
  const fn = src.match(/function resolveBuildCpus\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'could not extract resolveBuildCpus() from next.config.js');

  const build = (cores, env = {}) =>
    new Function(
      'os',
      'process',
      `${fn[0]}; return resolveBuildCpus;`
    )({ availableParallelism: () => cores, cpus: () => Array(Math.max(0, cores || 0)).fill({}) }, { env });

  assert.equal(build(8)(), 4, 'Vercel Enhanced Build Machine (8 cores, 16 GB)');
  assert.equal(build(16)(), 4, 'capped at 4 until a p50 says a bigger step is safe');
  assert.equal(build(4)(), 3);
  assert.equal(
    build(2)(),
    1,
    'a 2-core sandbox must land on 1 by itself - the 2026-07-21 note asked a ' +
      'person to remember BUILD_CPUS=1, and a person will not'
  );
  assert.equal(build(1)(), 1);
  assert.equal(build(8, { BUILD_CPUS: '1' })(), 1, 'BUILD_CPUS overrides the derivation');
  assert.equal(build(NaN)(), 2, 'unreadable core count falls back to the old default');
});

// -- 2. A preview deployment is opt-in ---------------------------------------

test('preview builds are an allow-list, not a deny-list', () => {
  const gate = read('scripts/vercel-should-build.sh');

  assert.match(
    gate,
    /preview\/\*\)/,
    'the preview allow-list arm must exist. Naming prefixes to EXCLUDE cannot ' +
      'win: it has to guess every prefix anyone will ever invent.'
  );

  const start = gate.indexOf('INVERTED 2026-09-08');
  assert.ok(start > -1, 'the inverted preview gate must be present');
  const block = gate.slice(start, gate.indexOf('CHANGED=', start));
  assert.ok(block.length > 0, 'could not delimit the preview gate block');

  assert.match(
    block,
    /^\s*\*\)\s*$[\s\S]*?exit 0/m,
    'the catch-all arm of the preview case must SKIP (exit 0), not fall through'
  );
  assert.doesNotMatch(
    block,
    /^\s*agent\/\*\)\s*$/m,
    'agent/* no longer needs its own arm - the allow-list covers it, and a ' +
      'leftover deny-list arm invites someone to extend the wrong list'
  );
});

test('branches that are never browsed are refused before a container is created', () => {
  const enabled = JSON.parse(read('vercel.json')).git?.deploymentEnabled ?? {};

  // deploymentEnabled stops the deployment being CREATED. ignoreCommand does
  // not: it provisions a build container and clones the repo before the script
  // gets to say no. For refs that can never want a preview the map is strictly
  // cheaper, so both are used.
  for (const ref of ['agent/**', 'ci-marker/**', 'backup/**', 'build/**', 'patch/**']) {
    assert.equal(
      enabled[ref],
      false,
      `vercel.json git.deploymentEnabled must disable "${ref}". patch/** was ` +
        `missing until 2026-09-08, which is how the audit of this very problem ` +
        `triggered a preview build on its own branch.`
    );
  }
});

// -- 3. main is allowed to finish what it started ----------------------------

test('e2e-tests.yml does not cancel its own main-branch runs', () => {
  const yml = read('.github/workflows/e2e-tests.yml');

  assert.match(
    yml,
    /cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/,
    'e2e-tests.yml triggers on push:[main] and workflow_dispatch, so a bare ' +
      '"true" cancels essentially every run it makes. Measured over the last ' +
      '120 commits: median 7.3 minutes between commits on main, 53% of gaps ' +
      'under 8, against ~7 minutes of install and build before the first test.'
  );
  assert.doesNotMatch(
    yml,
    /cancel-in-progress:\s*true\s*$/m,
    'e2e-tests.yml has a bare "cancel-in-progress: true" again'
  );
  assert.match(
    yml,
    /group:\s*e2e-\$\{\{\s*github\.ref\s*\}\}/,
    'the concurrency group must still be scoped per ref, or every pull request ' +
      'would serialise behind main'
  );
});

test('global-footer-e2e.yml is pull-request-only, which is why it keeps cancel-in-progress: true', () => {
  // Deliberately NOT given the expression above. On 2026-09-04 this workflow
  // dropped its `push: [main]` trigger, so github.ref is never refs/heads/main
  // here and the expression would be dead code that reads like a decision.
  //
  // This assertion exists so the bug cannot come back through the other door:
  // if someone restores the main-push trigger, this test fails and points at
  // the concurrency setting that then needs to change with it.
  const yml = read('.github/workflows/global-footer-e2e.yml');
  const on = yml.slice(yml.indexOf('\non:'), yml.indexOf('concurrency:'));

  assert.doesNotMatch(
    on,
    /push:/,
    'global-footer-e2e.yml has regained a push trigger. If it now runs on main, ' +
      'give it the same cancel-in-progress expression as e2e-tests.yml in the ' +
      'same commit - on main, cancel-in-progress: true is the deadlock described ' +
      'in .agent/audits/2026-08-21-publish-deadlock-and-palette-clobber.md.'
  );
  assert.match(on, /pull_request:/, 'it must still run on pull requests');
});
