import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';


const LAUNCHER = fs.readFileSync('scripts/preflop-deep/run_machine.py', 'utf8');
const ORCHESTRATOR = fs.readFileSync('scripts/preflop-deep/orchestrate.py', 'utf8');
const RUNBOOK = fs.readFileSync(
  '.agent/audits/2026-09-07-training-solver-catalog-admission-runbook.md',
  'utf8',
);
const WINDOWS_SETUP = fs.readFileSync('scripts/windows-setup.bat', 'utf8');
const WINDOWS_DEPLOYMENT = fs.readFileSync('scripts/WINDOWS_DEPLOYMENT.txt', 'utf8');


test('bounded solver canary Python contract suite passes', () => {
  execFileSync('python3', ['test_bounded_canary.py'], {
    cwd: 'scripts/preflop-deep',
    encoding: 'utf8',
    stdio: 'pipe',
  });
});


test('launcher resolves a sealed machine target before any Pio process spawn', () => {
  assert.match(LAUNCHER, /extra_arguments == \["--canary"\]/);
  const launch = LAUNCHER.slice(
    LAUNCHER.indexOf('def _launch_approved_solver():'),
    LAUNCHER.indexOf('_proc = _launch_approved_solver()'),
  );
  const validation = launch.indexOf('validate_manifest(');
  const reservation = launch.indexOf('prepare_bounded_canary_execution(');
  const heartbeat = launch.indexOf('orchestrate._worker_request(');
  const spawn = launch.indexOf('subprocess.Popen(');
  assert.ok(validation >= 0 && validation < reservation);
  assert.ok(reservation < heartbeat);
  assert.ok(heartbeat < spawn);
  assert.match(ORCHESTRATOR, /bounded_canary_ready/);
  assert.match(ORCHESTRATOR, /bounded_canary_contracts_sha256/);
  assert.match(ORCHESTRATOR, /"partition_count", "partition_index"/);
  assert.match(ORCHESTRATOR, /CLI partition does not match its sealed machine partition/);
  assert.match(ORCHESTRATOR, /foreign, stale, or ambiguously certified/);
  assert.match(ORCHESTRATOR, /bounded canary server authority does not match/);
  assert.match(WINDOWS_SETUP, /run_machine\.py %SP_MACHINE_ID% 2 %SP_PARTITION_INDEX% --canary/);
  assert.equal((WINDOWS_DEPLOYMENT.match(/run_machine\.py M[12] 2 [01] --canary/g) || []).length, 2);

  execFileSync('python3', ['-c', String.raw`
import ast

source = open('run_machine.py', encoding='utf-8').read()
tree = ast.parse(source)
nodes = [
    node for node in tree.body
    if isinstance(node, ast.FunctionDef) and node.name == '_launch_approved_solver'
]
module = ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[]))

class NoSpawn:
    PIPE = object()
    STDOUT = object()
    calls = 0
    @classmethod
    def Popen(cls, *_args, **_kwargs):
        cls.calls += 1
        return object()

class MissingTarget:
    NUM = 2
    IDX = 0
    def validate_manifest(self, _text, mode):
        assert mode == 'canary'
        return {'version': 5}, 'c' * 64
    def prepare_bounded_canary_execution(self, *_args):
        raise SystemExit('approved manifest has no unique bounded canary target for M1')
    def _worker_request(self, *_args):
        raise AssertionError('heartbeat reached without a canary target')

scope = {
    'RUN_MODE': 'canary',
    '_prepared_bounded_canary': None,
    'manifest_bytes': b'{}',
    'orchestrate': MissingTarget(),
    'machine_id': 'M1',
    'approved_manifest': 'c' * 64,
    'PIO_EXE': 'never-launch.exe',
    'subprocess': NoSpawn,
    '_solver_child_environment': lambda: {},
}
exec(compile(module, 'run_machine.py', 'exec'), scope)
try:
    scope['_launch_approved_solver']()
    raise AssertionError('missing sealed target was accepted')
except SystemExit as error:
    assert 'no unique bounded canary target' in str(error)
assert NoSpawn.calls == 0

class GatewayDown(MissingTarget):
    def prepare_bounded_canary_execution(self, *_args):
        return {'machine_id': 'M1', 'targets': [{}, {}], 'pending_targets': [{}, {}]}
    def _worker_request(self, *_args):
        raise RuntimeError('gateway unavailable')

scope['orchestrate'] = GatewayDown()
try:
    scope['_launch_approved_solver']()
    raise AssertionError('solver spawned before gateway preflight')
except RuntimeError as error:
    assert 'gateway unavailable' in str(error)
assert NoSpawn.calls == 0

class AlreadyComplete(MissingTarget):
    def __init__(self):
        self.completed = False
    def prepare_bounded_canary_execution(self, *_args):
        return {'machine_id': 'M1', 'targets': [{}, {}], 'pending_targets': []}
    def complete_bounded_canary_without_solver(self, _plan):
        self.completed = True
    def _worker_request(self, *_args):
        raise AssertionError('redundant preflight heartbeat after terminal verification')

already_complete = AlreadyComplete()
scope['orchestrate'] = already_complete
try:
    scope['_launch_approved_solver']()
    raise AssertionError('completed canary did not exit')
except SystemExit as error:
    assert error.code == 0
assert already_complete.completed is True
assert NoSpawn.calls == 0
`], {
    cwd: 'scripts/preflop-deep',
    encoding: 'utf8',
  });
});


test('canary path is capped at two identities, ingests only pending rows, verifies, and exits', () => {
  const bounded = ORCHESTRATOR.slice(
    ORCHESTRATOR.indexOf('def run_bounded_canary(plan):'),
    ORCHESTRATOR.indexOf('\ndef main():'),
  );
  assert.match(bounded, /len\(plan\["targets"\]\) != 2/);
  assert.match(bounded, /for target in plan\["pending_targets"\]:/);
  assert.match(bounded, /for target, strategy_matrix, validation in prepared_artifacts:/);
  assert.equal((bounded.match(/receipt = patch_v2\(/g) || []).length, 1);
  assert.match(bounded, /if len\(admitted\) != len\(plan\["pending_targets"\]\)/);
  assert.match(bounded, /verify_bounded_canary_admission\(plan\)/);
  assert.match(bounded, /"phase": "bounded-canary-complete"/);
  assert.match(bounded, /"rows_written": len\(admitted\)/);
  assert.doesNotMatch(bounded, /boards_for\(/);
  assert.doesNotMatch(bounded, /while True/);
  assert.match(ORCHESTRATOR, /return run_bounded_canary\(PREPARED_BOUNDED_CANARY\)/);
});


test('catalog authority runbook includes the complete live schema contract', () => {
  const approval = RUNBOOK.slice(
    RUNBOOK.indexOf('INSERT INTO public.training_solver_provenance_authority'),
    RUNBOOK.indexOf('COMMIT;', RUNBOOK.indexOf('INSERT INTO public.training_solver_provenance_authority')),
  );
  for (const field of [
    'source_combo_order_sha256',
    'training_game_contracts_sha256',
    'manifest_contracts',
  ]) {
    assert.match(approval, new RegExp(`\\b${field}\\b`));
  }
  for (const field of [
    'game_type', 'stack_depth', 'oop_player', 'ip_player', 'pot_chips',
    'eff_chips', 'rake', 'accuracy_fraction', 'oop_range_checksum',
    'ip_range_checksum', 'range_combo_order', 'source_combo_order_sha256',
    'tree_geometry', 'streets',
  ]) {
    assert.match(approval, new RegExp(`'${field}'`));
  }
  assert.match(RUNBOOK, /Omitting any of these\s+fields is not a partial approval/);
  assert.match(approval, /INSERT INTO public\.training_solver_bounded_canary_targets/);
  assert.match(approval, /UPDATE public\.training_solver_ingest_scopes/);
  assert.match(approval, /admission_mode = 'bounded_canary'/);
  assert.match(approval, /AND admission_mode = 'held'/);
  assert.match(RUNBOOK, /A backlog approval is a separate explicit `held` to `backlog`/);
  assert.match(RUNBOOK, /One Active Ingest Scope Per Physical Machine/);
  assert.match(RUNBOOK, /M1 may have at most one such tuple and M2 may have at most/);
  assert.match(RUNBOOK, /TRAINING_SOLVER_MACHINE_INGEST_SCOPE_ALREADY_ACTIVE/);
  assert.match(RUNBOOK, /An UPDATE may not move a target's machine, provenance tuple/);
  assert.match(WINDOWS_DEPLOYMENT,
    /backlog gate may remain false while a deliberately bounded canary is[\s\S]*bounded_canary_ready=true/);
});
