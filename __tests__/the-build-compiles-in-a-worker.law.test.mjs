// ----------------------------------------------------------------------------
// THE BUILD COMPILES IN A WORKER (law, 2026-11-28)
//
// Every hub-vanguard production build from f2412480 (#3299) to f0d956a9 was
// SIGKILLed by Vercel's 4-core / 8 GB Standard Build Machine (exit 137, "Out
// of Memory event detected"). The cause was not #3299's 1,100 lines. It was
// where webpack ran: Next only compiles in a child process that exits when it
// is done if next.config.js has NO custom webpack() - ours has one - so all
// three compilers ran in the main `next build` process and everything they
// allocated was still held when page-data collection forked three workers.
//
// Measured with scripts/ci/measure-build-memory.py (whole process tree, the
// way the container counts it), warm cache from the previous deployment as on
// Vercel: see .agent/audits/2026-11-28-build-oom-root-cause.md for the table.
//
// These assertions read the real files. They do not run a build.
// ----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function experimentalBlock(cfg) {
  const start = cfg.indexOf('experimental: {');
  assert.ok(start > 0, 'next.config.js must have an experimental block');
  let depth = 0;
  for (let i = cfg.indexOf('{', start); i < cfg.length; i += 1) {
    if (cfg[i] === '{') depth += 1;
    if (cfg[i] === '}') { depth -= 1; if (depth === 0) return cfg.slice(start, i + 1); }
  }
  throw new Error('unterminated experimental block');
}

test('a custom webpack() does not silently move compilation into the main process', () => {
  const cfg = read('next.config.js');
  const block = experimentalBlock(cfg);
  // Next 16: useBuildWorker = webpackBuildWorker || (undefined && !config.webpack).
  // With a webpack() present, only an explicit true keeps the worker.
  assert.match(cfg, /\n  webpack: \(config/, 'premise: next.config.js has a custom webpack()');
  assert.match(block, /\n\s*webpackBuildWorker: true,/,
    'experimental.webpackBuildWorker must be true while next.config.js has a webpack(): without it every ' +
    'compiler runs in the main next build process and production builds are OOM-killed (exit 137)');
  assert.doesNotMatch(cfg, /webpackBuildWorker:\s*(false|process\.env)/, 'no switch that turns the worker off');
});

test('webpack memory optimisations stay a measured decision, not a reflex', () => {
  // Measured 2026-11-28 (audit): +56 s of compile on every deployment for
  // 143 MB once the worker is on. Turning it on needs a new measurement.
  assert.doesNotMatch(experimentalBlock(read('next.config.js')), /\n\s*webpackMemoryOptimizations: true,/);
});

test('nothing in the build is made incompatible with the build worker', () => {
  // Next refuses parallelServerCompiles / parallelServerBuildTraces without
  // build workers, and --experimental-debug-memory-usage does not run with
  // them; none of those may come back as a way round this law.
  const pkg = JSON.parse(read('package.json'));
  for (const name of ['build', 'build:vercel']) {
    assert.doesNotMatch(pkg.scripts[name], /--experimental-debug-memory-usage/, name);
  }
});

test('the memory measurement exists, never gates, and runs the production command', () => {
  const wf = '.github/workflows/build-memory-measure.yml';
  assert.ok(existsSync(join(ROOT, wf)), `${wf} must exist`);
  const yml = read(wf);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /branches: \['bookmark\/build-measure-\*\*'\]/, 'only on parked measurement branches');
  assert.doesNotMatch(yml, /pull_request|schedule:/, 'a measurement, never a required check or a schedule');
  assert.match(yml, /measure-build-memory\.py[^\n]*-- npm run build:vercel/, 'it measures the exact Vercel build command');
  const sampler = read('scripts/ci/measure-build-memory.py');
  assert.match(sampler, /\/usr\/bin\/time/);
  assert.match(sampler, /smaps_rollup/, 'it sums PSS over the whole process tree, as the container counts');
});
