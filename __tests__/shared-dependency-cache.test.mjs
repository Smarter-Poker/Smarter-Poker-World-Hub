import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { load } = createRequire(import.meta.url)('js-yaml');
const read = name => load(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8'));
const gate = read('build-safety-gate.yml');
const cacheStep = job => job.steps.find(step => step.with?.path === 'node_modules');

test('protected main populates the exact dependency caches that pull requests can reuse', () => {
  const warm = gate.jobs['dependency-cache'];
  assert.ok(warm, 'PR-only cache writers cannot share a cache with the next pull request');
  assert.equal(warm.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.ok(gate.on.push.branches.includes('main'));
  assert.equal(warm['timeout-minutes'], 12);
  assert.deepEqual(warm.permissions, { contents: 'read', packages: 'read' });
  const cache = cacheStep(warm);
  const variants = warm.strategy.matrix.include;
  assert.equal(variants.length, 2);
  for (const [job, node] of [['safety-checks', '24.12.0'], ['type-check', '20.x']]) {
    const variant = variants.find(row => row.node === node);
    assert.ok(variant, `missing compatible runtime ${node}`);
    assert.equal(variant['node-major'], node.split('.')[0]);
    const rendered = cache.with.key
      .replace('${{ matrix.cache-prefix }}', variant['cache-prefix'])
      .replace('${{ matrix.node-major }}', variant['node-major']);
    assert.equal(rendered, cacheStep(gate.jobs[job]).with.key);
  }
  for (const file of ['global-footer-e2e.yml', 'e2e-tests.yml']) {
    const consumer = Object.values(read(file).jobs).find(job => cacheStep(job));
    assert.equal(cacheStep(consumer).with.key, cacheStep(gate.jobs['safety-checks']).with.key);
  }
});

test('cache hits do no install work and misses remain lockfile-exact without lifecycle scripts', () => {
  const warm = gate.jobs['dependency-cache'];
  assert.ok(warm);
  const cache = cacheStep(warm);
  assert.match(cache.with.key, /hashFiles\('package-lock.json'\)/);
  assert.equal(cache.with['restore-keys'], undefined, 'never restore an incompatible dependency tree');
  const install = warm.steps.find(step => step.run?.includes('npm ci'));
  assert.equal(install.if, `steps.${cache.id}.outputs.cache-hit != 'true'`);
  assert.equal(install.run, 'npm ci --ignore-scripts');
  assert.equal(install['continue-on-error'], undefined);
  assert.ok(!warm.steps.some(step => /build|deploy|dispatch|merge/.test(step.run ?? '')));
  assert.equal(warm.steps.find(step => step.uses?.startsWith('actions/setup-node@')).with['node-version'], '${{ matrix.node }}');
});

test('the existing required check executes this cache wiring regression', () => {
  assert.ok(gate.jobs['safety-checks'].steps.some(step => step.run?.includes('__tests__/shared-dependency-cache.test.mjs')));
});
