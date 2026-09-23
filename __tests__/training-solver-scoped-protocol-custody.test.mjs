// Permanent custody guard for the scoped solver-worker protocol.
//
// On 2026-09-17 a wholesale application restoration (#1821) silently put the
// v1 worker protocol, the retired v1/v2 gateway RPC names and a direct
// solver_status upsert back on main, deleted the operation-scope migration
// file and renamed the engine-alert receipt migration away from its installed
// ledger version. Production had (and keeps) the scope-binding migration
// installed: it denies the retired functions to service_role and forbids
// direct solver_status writes, so the restored gateway could only fail.
//
// This file pins the source half of that installed contract. It reads the
// real maintained files; it must never be satisfied by editing an expected
// value to match a downgrade.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  SOLVER_WORKER_PROTOCOL,
  solverWorkerEnvelopeIsValid,
} from '../src/lib/training/solverWorkerAuth.mjs';

const SCOPED_PROTOCOL = 'smarter-poker.solver-worker.v2';
const GATEWAY_PATH = 'pages/api/training/solver-worker.js';
const ORCHESTRATOR_PATH = 'scripts/preflop-deep/orchestrate.py';
const MIGRATIONS_DIRECTORY = 'supabase/migrations';

// Installed in production under exactly these ledger versions and names. The
// bytes are pinned so a rename, a re-save or an "equivalent" rewrite is a
// visible custody change instead of silent ledger drift. An installed
// migration is never edited or replayed; a new behavior needs a new file.
const INSTALLED_SOLVER_WINDOW_MIGRATIONS = Object.freeze({
  '20260913170000_training_solver_operation_scope_binding.sql':
    '47509b9229e304ddeff119def75247594e6b4c251457f94a905f3cd6f7a8967b',
  '20260913170312_engine_alert_delivery_receipts.sql':
    '381fbfe11dd8db020edcc754e2c8b7b144f115f6cac54ce3d3ecd27ff052c2ed',
});

const SCOPED_GATEWAY_RPCS = Object.freeze([
  'training_claim_solver_worker_request_v2',
  'training_ingest_solver_artifact_v2',
  'training_solver_worker_row_states_v3',
  'training_solver_worker_board_page_v2',
  'training_solver_worker_heartbeat_v1',
]);

// The scope-binding migration revokes every one of these from service_role.
const RETIRED_GATEWAY_RPCS = Object.freeze([
  'training_claim_solver_worker_request_v1',
  'training_ingest_solver_artifact_v1',
  'training_solver_worker_row_states_v1',
  'training_solver_worker_row_states_v2',
  'training_solver_worker_board_page_v1',
]);

function sha256(path) {
  return createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

function rpcNames(source) {
  return [...source.matchAll(/\.rpc\(\s*'([^']+)'/g)].map(([, name]) => name);
}

function scopedEnvelope(overrides = {}) {
  return {
    protocol: SCOPED_PROTOCOL,
    operation: 'heartbeat',
    worker: {
      machine_id: 'M1',
      solver_version: 'PioSOLVER-test',
      solver_binary_checksum: 'a'.repeat(64),
      pipeline_commit: 'b'.repeat(40),
      manifest_version: '4',
      manifest_checksum: 'c'.repeat(64),
      admission_mode: 'bounded_canary',
      ...overrides.worker,
    },
    payload: {
      phase: 'custody', board: '', spots_done: 0, rows_written: 0, bad: 0, note: '',
    },
    ...overrides.envelope,
  };
}

test('gateway and Windows worker speak the same scoped wire protocol', () => {
  assert.equal(SOLVER_WORKER_PROTOCOL, SCOPED_PROTOCOL);

  const auth = fs.readFileSync('src/lib/training/solverWorkerAuth.mjs', 'utf8');
  const orchestrator = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
  const declared = [...orchestrator.matchAll(/^WORKER_PROTOCOL = "([^"]+)"$/gm)]
    .map(([, protocol]) => protocol);
  assert.deepEqual(declared, [SCOPED_PROTOCOL]);
  for (const [name, source] of [['solverWorkerAuth.mjs', auth], ['orchestrate.py', orchestrator]]) {
    assert.doesNotMatch(
      source,
      /smarter-poker\.solver-worker\.v1\b/,
      `${name} must not name the retired unscoped protocol`,
    );
  }

  // The signed envelope carries the manifest-derived admission mode on both
  // sides; a worker that cannot state its scope is not interpretable.
  assert.match(orchestrator, /"admission_mode": ACTIVE_ADMISSION_MODE,/);
  assert.match(orchestrator, /EXECUTION_SCOPE_BACKLOG = "training_backlog"/);
  assert.match(orchestrator, /EXECUTION_SCOPE_BOUNDED_CANARY = "bounded_canary"/);
  assert.match(orchestrator, /manifest execution scope %r does not authorize %s mode/);
});

test('signed envelopes without an exact admission scope are rejected', () => {
  assert.equal(solverWorkerEnvelopeIsValid(scopedEnvelope(), 'M1'), true);
  assert.equal(
    solverWorkerEnvelopeIsValid(
      scopedEnvelope({ worker: { admission_mode: 'backlog' } }), 'M1',
    ),
    true,
  );

  const unscoped = scopedEnvelope();
  delete unscoped.worker.admission_mode;
  assert.equal(solverWorkerEnvelopeIsValid(unscoped, 'M1'), false);
  for (const admissionMode of ['held', '', null, 'canary', 'BACKLOG']) {
    assert.equal(
      solverWorkerEnvelopeIsValid(
        scopedEnvelope({ worker: { admission_mode: admissionMode } }), 'M1',
      ),
      false,
      `admission_mode ${JSON.stringify(admissionMode)} must not authorize work`,
    );
  }
  assert.equal(
    solverWorkerEnvelopeIsValid(
      scopedEnvelope({ envelope: { protocol: 'smarter-poker.solver-worker.v1' } }), 'M1',
    ),
    false,
  );
});

test('gateway calls only the scoped RPCs production still grants', () => {
  const gateway = fs.readFileSync(GATEWAY_PATH, 'utf8');
  const called = rpcNames(gateway);

  for (const name of SCOPED_GATEWAY_RPCS) {
    assert.ok(called.includes(name), `${name} must be the gateway's database entrypoint`);
  }
  for (const name of RETIRED_GATEWAY_RPCS) {
    assert.ok(
      !new RegExp(`\\b${name}\\b`).test(gateway),
      `${name} is revoked from service_role in production and must not return`,
    );
  }
  for (const name of called.filter((rpc) => rpc.startsWith('training_'))) {
    assert.ok(
      SCOPED_GATEWAY_RPCS.includes(name),
      `${name} is not part of the scoped solver-worker contract`,
    );
  }

  // Every scoped call states the admission mode the worker signed.
  assert.ok(
    (gateway.match(/p_expected_admission_mode: worker\.admission_mode/g) || []).length >= 4,
    'claim/ingest, row states, board page and heartbeat must each bind the signed scope',
  );
});

test('gateway performs no direct table write, solver_status included', () => {
  const gateway = fs.readFileSync(GATEWAY_PATH, 'utf8');
  assert.doesNotMatch(gateway, /solver_status/);
  assert.doesNotMatch(gateway, /supabase\s*\.from\(/);
  assert.doesNotMatch(gateway, /\.(?:upsert|insert|update|delete)\(/);
  assert.match(
    gateway,
    /if \(data !== true\) throw new Error\('Solver heartbeat returned an invalid receipt'\)/,
    'the heartbeat must require the scoped RPC receipt instead of assuming a write happened',
  );
});

test('production-installed solver-window migrations keep their ledger names and bytes', () => {
  const window = fs.readdirSync(MIGRATIONS_DIRECTORY)
    .filter((name) => name.startsWith('2026091317'))
    .sort();
  assert.deepEqual(window, Object.keys(INSTALLED_SOLVER_WINDOW_MIGRATIONS).sort());
  for (const [name, expected] of Object.entries(INSTALLED_SOLVER_WINDOW_MIGRATIONS)) {
    assert.equal(
      sha256(`${MIGRATIONS_DIRECTORY}/${name}`),
      expected,
      `${name} is installed in production; its bytes are custody evidence, not editable source`,
    );
  }

  const scopeBinding = fs.readFileSync(
    `${MIGRATIONS_DIRECTORY}/20260913170000_training_solver_operation_scope_binding.sql`,
    'utf8',
  );
  for (const name of SCOPED_GATEWAY_RPCS) {
    assert.match(
      scopeBinding,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(`),
      `${name} must be granted by the installed scope-binding migration`,
    );
  }
  for (const name of RETIRED_GATEWAY_RPCS) {
    assert.match(
      scopeBinding,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(`),
      `${name} must be revoked by the installed scope-binding migration`,
    );
  }
});

test('controller release-bundle builder and its suite stay in the repository', () => {
  for (const path of [
    'scripts/preflop-deep/build_release_bundle.py',
    'scripts/preflop-deep/test_build_release_bundle.py',
  ]) {
    assert.ok(fs.statSync(path).size > 0, `${path} must exist`);
  }
  const canarySuite = fs.readFileSync('__tests__/training-solver-bounded-canary.test.mjs', 'utf8');
  assert.match(
    canarySuite,
    /\['test_build_release_bundle\.py'\]/,
    'the required Phase 6 pretest must keep executing the builder suite',
  );
});

test('restoring the scoped protocol opens no solver release gate', () => {
  const manifest = JSON.parse(fs.readFileSync('scripts/preflop-deep/phases.json', 'utf8'));
  assert.equal(manifest.execution_scope, 'training_backlog');
  assert.equal(manifest.release_gate.solver_ready, false);
  assert.notEqual(manifest.release_gate.bounded_canary_ready, true);
  assert.equal(manifest.bounded_canary_contracts, undefined);
});
