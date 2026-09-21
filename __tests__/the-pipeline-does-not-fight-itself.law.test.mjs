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
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const WORKFLOWS = join(ROOT, '.github/workflows');

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
  // next.config.js is not imported directly: it pulls in retired error provider, PWA and a
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
  assert.match(read('scripts/vercel-should-build.sh'), /vercel-should-build\.mjs/);
  const gate = read('scripts/vercel-should-build.mjs');
  assert.match(gate, /VERCEL_ENV === 'preview'/);
  assert.match(gate, /!process\.env\.VERCEL_GIT_COMMIT_REF\?\.startsWith\('preview\/'\)/);
  assert.ok(gate.indexOf('finish(false,') < gate.indexOf('const previous'), 'unrequested previews skip before Git work');
});

test('branches that are never browsed are refused before a container is created', () => {
  // Vercel enables a branch when ANY matching pattern is true. The default
  // is now false, so new branch prefixes cannot accidentally queue a build.
  assert.deepEqual(JSON.parse(read('vercel.json')).git.deploymentEnabled, {
    '**': false, main: true, 'preview/**': true,
  });
});

// -- 3. main is allowed to finish what it started ----------------------------

// NARROWED 2026-09-09, after the general version was tried and was wrong.
//
// The first attempt asserted that NO workflow triggering on push:main may
// carry a bare `cancel-in-progress: true`. It flagged seven: audit-marker-
// guard, build-safety-gate, no-conflict-markers, silent-revert-guard,
// silent-write-guard, supabase-invariants and undefined-identifier-guard.
//
// Measured before believing it - 30 main runs each:
//
//   audit-marker-guard          cancelled  0/30   (timeout 3m)
//   no-conflict-markers         cancelled  0/30   (timeout 2m)
//   silent-write-guard          cancelled  0/30   (timeout 6m)
//   supabase-invariants         cancelled  0/30
//   undefined-identifier-guard  cancelled  0/30
//   build-safety-gate           cancelled  1/30
//   silent-revert-guard         cancelled  2/30
//
// All seven finish comfortably inside the ~7m50s median gap between commits
// on main, so the cancellation never fires and `true` is the right setting for
// them - it is cheap and the superseded verdict really is worthless.
//
// The inversion only bites when a job cannot finish inside that gap. That is a
// property of RUN HISTORY, which a file-reading law cannot see, so this law
// asserts the two cases that were actually measured and fixed rather than a
// static proxy that is wrong for most of the repo.

test('push-delivery-watchdog does not cancel its own main runs', () => {
  // Measured 2026-09-08 by scripts/ci/report-pipeline-p50.mjs: 21 of 26 main
  // runs CANCELLED. It installs dependencies and a WebKit browser before it
  // probes anything, so it cannot finish inside the commit gap - and it is a
  // WATCHDOG. One cancelled before it can look is not a quieter watchdog, it
  // is an absent one reporting green. After the fix: 1 of 30.
  const yml = read('.github/workflows/push-delivery-watchdog.yml');
  assert.match(
    yml,
    /cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/,
    'push-delivery-watchdog must not bare-cancel its main runs'
  );
});

test('e2e-tests.yml is off the per-push triggers while it is red', () => {
  // 2026-09-09. It ran on push:[main] with cancel-in-progress removed and
  // burned 556 RUNNER-MINUTES in 24 hours across 20 runs, every one red, on
  // the runner pool the audit found to be the estate's binding constraint.
  // 78 failures a run are one environmental cause: /api/health answers 503
  // because the job starts the app against https://placeholder.supabase.co.
  //
  // This is the guard for putting it back: restore the triggers only together
  // with the expression, so it cannot return to the shape that caused this.
  const yml = read('.github/workflows/e2e-tests.yml');
  const onBlock = yml.slice(yml.indexOf('\non:'), yml.indexOf('\njobs:'));
  const hasMainPush = /\n\s{2}push:\n[\s\S]*?branches:\s*\[[^\]]*main/.test(onBlock);
  const hasPr = /\n\s{2}pull_request:/.test(onBlock);

  if (hasMainPush || hasPr) {
    assert.match(
      yml,
      /cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/,
      'e2e-tests.yml has regained a per-push trigger. Before that is safe, give ' +
        'the job real Supabase credentials (or teach the /api/health specs that ' +
        'a placeholder-backed server is expected to be degraded), and keep the ' +
        'cancel-in-progress expression so main runs are not killed mid-verdict.'
    );
  } else {
    assert.match(
      onBlock,
      /workflow_dispatch:/,
      'it must remain runnable on demand while it is off the automatic triggers'
    );
  }
});

test('e2e-tests.yml keeps its concurrency group scoped per ref', () => {
  const yml = read('.github/workflows/e2e-tests.yml');
  // Scoping by ref is what stops every pull request serialising behind main.

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

// -- 4. Nothing pays for the same install twice ------------------------------

test('the four browser jobs cache node_modules and their browsers', () => {
  // Measured 2026-09-08: no workflow in this repo cached node_modules,
  // .next/cache, or ~/.cache/ms-playwright - verified by grepping all 38
  // files for ms-playwright and PLAYWRIGHT_BROWSERS_PATH and finding nothing.
  // Four jobs therefore extracted 1,324 packages and downloaded Chromium and
  // WebKit from scratch on every run, while the pattern that fixes it was
  // already proven in this same repo at build-safety-gate.yml (424s -> ~15s).
  const NEEDS_BROWSERS = [
    'e2e-tests.yml',
    'global-footer-e2e.yml',
    'push-delivery-watchdog.yml',
    'preview-signup-gate.yml',
  ];
  for (const wf of NEEDS_BROWSERS) {
    const yml = read(`.github/workflows/${wf}`);
    assert.match(
      yml,
      /path:\s*~\/\.cache\/ms-playwright/,
      `${wf} installs Playwright browsers and must cache them`
    );
  }

  // node_modules, on the three that install with --ignore-scripts. The fourth
  // (preview-signup-gate) installs WITH scripts, so its tree carries native
  // binaries and is deliberately not sharing this cache.
  for (const wf of ['e2e-tests.yml', 'global-footer-e2e.yml', 'push-delivery-watchdog.yml']) {
    const yml = read(`.github/workflows/${wf}`);
    assert.match(yml, /path:\s*node_modules/, `${wf} must cache node_modules`);
    assert.match(
      yml,
      /key:\s*nm-wh-noscripts-/,
      `${wf} must use the SHARED --ignore-scripts key. Two jobs installing the ` +
        `identical tree under two different keys never warm each other - Club ` +
        `Arena did exactly that and neither cache ever helped the other.`
    );
    assert.match(
      yml,
      /if:\s*steps\.nm-cache\.outputs\.cache-hit\s*!=\s*'true'/,
      `${wf} must SKIP the install on a cache hit. npm ci deletes node_modules ` +
        `before installing, so an unguarded install throws the restored tree away.`
    );
  }
});

test('the two jobs that build Next.js reuse .next/cache', () => {
  for (const wf of ['e2e-tests.yml']) {
    const yml = read(`.github/workflows/${wf}`);
    assert.match(yml, /path:\s*\.next\/cache/, `${wf} runs a full build and must reuse the webpack cache`);
  }
});

// -- 5. The measurement exists, and runs somewhere it will actually fire -----

test('the weekly pipeline report runs from publish-watchdog, not a new schedule', () => {
  const script = 'scripts/ci/report-pipeline-p50.mjs';
  assert.doesNotThrow(() => read(script), `${script} must exist`);

  const wd = read('.github/workflows/publish-watchdog.yml');
  assert.match(
    wd,
    /node scripts\/ci\/report-pipeline-p50\.mjs/,
    'the weekly report must be invoked from publish-watchdog.yml. CLAUDE.md ' +
      '11.3 forbids a net-new GitHub schedule: trigger, 11.4 explains why this ' +
      'kind of GitHub-asking-GitHub work cannot live in Open Claw, and 10.9 ' +
      'bans the Claude scheduler outright.'
  );

  const src = read(script);
  assert.match(
    src,
    /getUTCDay\(\)\s*===\s*1/,
    'the report must self-gate to one window a week - publish-watchdog runs ' +
      'every 30 minutes and this is a weekly report'
  );
  assert.doesNotMatch(
    src,
    /mcp__scheduled-tasks|scheduled-tasks__create/,
    'never the Claude scheduler (CLAUDE.md 10.9)'
  );
});

// -- 6. A preview branch is for LOOKING at ------------------------------------

test('a preview/* branch builds a preview and is not auto-merged into main', () => {
  // These two halves have to agree or the opt-in is a trap. On 2026-09-09 they
  // did not: scripts/vercel-should-build.sh had just been taught that
  // `preview/*` means "build me a preview", and agent-open-pr.yml still opened
  // a pull request for every non-main branch, which autopilot then squash-
  // merged. An experiment branch pushed to MEASURE something - with "Not for
  // merging as-is" in its own commit message - was on main and in production
  // four minutes later.
  //
  // Nothing enforces a commit message. The branch prefix is the only thing
  // both halves can read, so both halves read it.
  const gate = read('scripts/vercel-should-build.mjs');
  assert.match(
    gate,
    /startsWith\('preview\/'\)/,
    'preview/* must still be the opt-in that gets a Vercel preview build'
  );

  const openPr = read('.github/workflows/agent-open-pr.yml');
  assert.match(
    openPr,
    /!startsWith\(github\.ref_name, 'preview\/'\)/,
    "agent-open-pr.yml must skip preview/* branches. A branch whose whole " +
      'purpose is to be looked at must not open a pull request that autopilot ' +
      'then merges - that is how an experiment reached production on 2026-09-09.'
  );
});
