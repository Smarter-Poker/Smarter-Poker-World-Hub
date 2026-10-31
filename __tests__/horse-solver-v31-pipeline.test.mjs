import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('the authenticated immutable input approval guards pass', () => {
  const result = spawnSync(process.execPath, ['--test', '__tests__/horse-v31-input-approval.test.mjs'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('the certified V31 solver pipeline passes its hermetic parser and contract suite', () => {
  const result = spawnSync(
    process.env.PYTHON_BIN || 'python3',
    ['scripts/horse-solver-v31/test_pipeline.py'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const count = result.stderr.match(/Ran (\d+) tests/);
  assert.ok(count, result.stderr);
  assert.ok(Number(count[1]) >= 14, `expected at least 14 Python tests, got ${count[1]}`);
  assert.match(result.stderr, /OK/);
});

for (const suite of [
  'scripts/horse-solver-v31/test_compile_inputs.py',
  'scripts/horse-solver-v31/test_public_hist215.py',
  'scripts/horse-solver-v31/test_final_public215_training.py',
  'scripts/horse-solver-v31/test_continue_r7_once.py',
  'scripts/horse-solver-v31/test_seal_r7_once.py',
  'scripts/ci/test-provision-horse-v31-hmac.py',
]) {
  test(`V31 commissioning prerequisite ${suite} passes`, () => {
    const python = suite.endsWith('/test_final_public215_training.py')
      ? process.env.V31_NUMERIC_PYTHON || process.env.PYTHON_BIN || 'python3'
      : process.env.PYTHON_BIN || 'python3';
    const result = spawnSync(python, [suite], {
      cwd: ROOT, encoding: 'utf8', timeout: 120_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Ran \d+ tests/);
    assert.match(result.stderr, /OK/);
  });
}

test('workers use narrow HMAC ingress and PostgreSQL-owned node seals', () => {
  const worker = read('scripts/horse-solver-v31/worker.py');
  const gateway = read('scripts/horse-solver-v31/gateway.py');
  const pio = read('scripts/horse-solver-v31/pio_upi.py');
  const compactor = read('scripts/horse-solver-v31/compactor.py');
  const preparer = read('scripts/horse-solver-v31/prepare_bundle.py');
  const documentation = read('scripts/horse-solver-v31/README.md');

  assert.doesNotMatch(worker + gateway + compactor, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(preparer, /HMAC_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(gateway, /smarter-poker\.horse-solver-v31-ingress\.v1/);
  assert.match(gateway, /uuid\.uuid4\(\)/);
  assert.match(worker, /"ingest_artifact"/);
  assert.match(worker, /not a regular file, or not executable/);
  assert.match(worker, /mark_invalid\(heartbeat\)/);
  assert.match(worker, /source_receipt_is_valid/);
  assert.match(worker, /--preflight-only/);
  assert.match(worker, /no gateway was contacted and no source row was written/);
  assert.doesNotMatch(worker, /node_checksum/);
  assert.match(compactor, /"build_cell"/);
  assert.match(compactor, /"seal_dataset"/);
  assert.match(compactor, /timeout_seconds=280/);
  assert.doesNotMatch(compactor, /mark_candidate|promote_dataset/);
  assert.match(pio, /calc_ev \{player\} \{node\}:\{action\}/);
  const rakeSetup = pio.indexOf('commands.append(f"set_rake');
  const treeBuild = pio.indexOf('commands.append("build_tree")');
  const go = pio.indexOf('"go",', rakeSetup);
  assert.ok(treeBuild > 0 && rakeSetup > treeBuild && go > rakeSetup);
  assert.match(documentation, /cannot mark a candidate or promote one/);
  assert.match(documentation, /no OpenClaw dependency/);
  assert.match(preparer, /"approved": False/);
  assert.match(preparer, /verify_published_pipeline/);
  assert.match(preparer, /input_bundle_checksum/);
  assert.match(preparer, /input_bundle_id/);
  assert.match(documentation, /prepare_bundle\.py/);
});

test('the shipped example is deliberately disabled and cannot claim a corpus', () => {
  const manifest = JSON.parse(
    read('scripts/horse-solver-v31/manifest.disabled.example.json'),
  );
  assert.equal(manifest.enabled, false);
  assert.equal(manifest.scenarios.length, 0);
  assert.equal(manifest.pipeline_commit, '0'.repeat(40));
  assert.equal(manifest.solver_binary_checksum, '0'.repeat(64));
});


test('official scalar exporter checks run with pinned numerical dependencies in the existing required CI job',()=>{
 const workflow=read('.github/workflows/build-safety-gate.yml');
 assert.match(workflow,/python-version: '3\.14\.2'/);
 assert.match(workflow,/update-environment: false/);
 assert.match(workflow,/requirements-public215-tests\.txt/);
 assert.match(workflow,/V31_NUMERIC_PYTHON=/);
 const requirements=read('scripts/horse-solver-v31/requirements-public215-tests.txt');
 for(const pin of ['numpy==2.3.5','scipy==1.17.0','scikit-learn==1.9.0','joblib==1.5.3','threadpoolctl==3.6.0','narwhals==2.22.1'])assert.ok(requirements.split('\n').includes(pin));
});

test('every maintained full-build caller supplies the same pinned scalar-test runtime',()=>{
 for(const file of ['global-footer-e2e.yml','e2e-tests.yml']){
  const source=read('.github/workflows/'+file);
  assert.match(source,/python-version: '3\.14\.2'/);
  assert.match(source,/only-binary=:all: -r scripts\/horse-solver-v31\/requirements-public215-tests\.txt/);
  assert.match(source,/V31_NUMERIC_PYTHON=.*v31-public215-contracts\/bin\/python/);
  assert.ok(source.indexOf('Install locked V31 test numerical dependencies')<source.indexOf('run: npm run build -- --webpack'));
 }
});


test('required TypeScript setup keeps cache failures outside dependency and compiler admission', () => {
  const job = yaml.load(read('.github/workflows/build-safety-gate.yml')).jobs['type-check'];
  assert.equal(job['timeout-minutes'], 10);
  assert.equal(job.if, "github.event_name == 'pull_request'");
  const steps = job.steps;
  const node = steps.find(step => step.name === 'Setup Node.js');
  assert.equal(node.uses, 'actions/setup-node@v4');
  assert.equal(node.with['node-version'], '20.x');
  assert.equal(node.with.cache, undefined);
  assert.equal(node.with['registry-url'], 'https://npm.pkg.github.com');
  assert.equal(node.with.scope, '@smarter-poker');
  assert.equal(node.with['always-auth'], true);
  assert.equal(node['continue-on-error'], undefined, 'Node setup must fail closed');
  assert.equal(node.if, undefined);

  const location = steps.find(step => step.id === 'npm-cache-location');
  assert.match(location.run, /npm config get cache/);
  assert.match(location.run, /node -p 'process.arch'/);
  const npmCache = steps.find(step => step.name === 'Restore optional npm cache');
  const modules = steps.find(step => step.id === 'nm-cache');
  for (const step of [npmCache, modules]) {
    assert.equal(step['timeout-minutes'], 2);
    assert.equal(step['continue-on-error'], true);
    assert.equal(step.env.SEGMENT_DOWNLOAD_TIMEOUT_MINS, 1);
  }
  assert.equal(npmCache.uses, 'actions/cache/restore@v4');
  assert.equal(npmCache.with.path, '${{ steps.npm-cache-location.outputs.path }}');
  assert.equal(npmCache.with.key, "node-cache-${{ runner.os }}-${{ steps.npm-cache-location.outputs.arch }}-npm-${{ hashFiles('package-lock.json') }}");
  assert.equal(modules.with.key, "nm-wh-typecheck-${{ runner.os }}-node20-${{ hashFiles('package-lock.json') }}");
  const install = steps.find(step => step.name === 'Install dependencies');
  assert.equal(install.if, "steps.nm-cache.outputs.cache-hit != 'true'");
  assert.match(install.run, /npm ci --ignore-scripts/);
  assert.ok(install.env.NODE_AUTH_TOKEN && install.env.NPM_TOKEN);
  assert.equal(install['continue-on-error'], undefined);
  const compiler = steps.find(step => step.name === 'CHECK: TypeScript compilation (advisory)');
  assert.equal(compiler.if, undefined, 'compiler cannot depend on cache success');
  assert.match(compiler.run, /npx tsc --noEmit/);
  assert.ok(steps.indexOf(node) < steps.indexOf(npmCache));
  assert.ok(steps.indexOf(npmCache) < steps.indexOf(modules));
  assert.ok(steps.indexOf(modules) < steps.indexOf(install));
  assert.ok(steps.indexOf(install) < steps.indexOf(compiler));
  // Missing outputs after a failed/timed-out restore select installation;
  // neither the install nor compiler may require a successful cache outcome.
  assert.equal(npmCache.if, undefined);
  assert.equal(modules.if, undefined);
  assert.doesNotMatch(install.if, /outcome|conclusion|npm-cache-location/);
});
