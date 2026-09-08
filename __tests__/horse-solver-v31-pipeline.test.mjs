import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('the certified V31 solver pipeline passes its hermetic parser and contract suite', () => {
  const result = spawnSync(
    process.env.PYTHON_BIN || 'python3',
    ['scripts/horse-solver-v31/test_pipeline.py'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Ran 10 tests/);
  assert.match(result.stderr, /OK/);
});

test('workers use narrow HMAC ingress and PostgreSQL-owned node seals', () => {
  const worker = read('scripts/horse-solver-v31/worker.py');
  const gateway = read('scripts/horse-solver-v31/gateway.py');
  const pio = read('scripts/horse-solver-v31/pio_upi.py');
  const compactor = read('scripts/horse-solver-v31/compactor.py');
  const documentation = read('scripts/horse-solver-v31/README.md');

  assert.doesNotMatch(worker + gateway + compactor, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(gateway, /smarter-poker\.horse-solver-v31-ingress\.v1/);
  assert.match(gateway, /uuid\.uuid4\(\)/);
  assert.match(worker, /"ingest_artifact"/);
  assert.match(worker, /not a regular file, or not executable/);
  assert.match(worker, /mark_invalid\(heartbeat\)/);
  assert.match(worker, /source_receipt_is_valid/);
  assert.doesNotMatch(worker, /node_checksum/);
  assert.match(compactor, /"build_cell"/);
  assert.match(compactor, /"seal_dataset"/);
  assert.match(compactor, /timeout_seconds=280/);
  assert.doesNotMatch(compactor, /mark_candidate|promote_dataset/);
  assert.match(pio, /calc_ev \{player\} \{node\}:\{action\}/);
  assert.ok(pio.indexOf('commands.append("set_rake') < pio.indexOf('commands.extend(("build_tree"'));
  assert.match(documentation, /cannot mark a candidate or promote one/);
  assert.match(documentation, /no OpenClaw dependency/);
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
