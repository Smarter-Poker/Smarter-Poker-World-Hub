#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907201000_training_solver_artifact_catalog.sql',
);
const HARDENING_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907204000_training_solver_spot_security_hardening.sql',
);
const WORKER_INGEST_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907204100_training_solver_worker_signed_ingestion.sql',
);
const BOUNDED_CANARY_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260910120000_training_solver_bounded_canary_authority.sql',
);
const OPERATION_SCOPE_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260913170000_training_solver_operation_scope_binding.sql',
);

const PRODUCTION_DEFAULT_ACL_SQL = String.raw`
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`;

function command(binary, args, { input, quiet = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error([
      `${path.basename(binary)} ${args.join(' ')} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  if (!quiet && result.stdout?.trim()) process.stdout.write(result.stdout);
  return result;
}

function commandExpectFailure(binary, args, { input, expected } = {}) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: process.env,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (result.status === 0) {
    throw new Error(`${path.basename(binary)} unexpectedly accepted an invalid solver object`);
  }
  if (!expected || !output.includes(expected)) {
    throw new Error([
      `${path.basename(binary)} failed without the expected ${expected ?? 'error marker'}`,
      output,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function commandAsync(binary, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => {
      if (status !== 0) {
        reject(new Error([
          `${path.basename(binary)} ${args.join(' ')} failed with status ${status}`,
          stdout,
          stderr,
        ].filter(Boolean).join('\n')));
        return;
      }
      resolve({ stdout, stderr, status });
    });
    child.stdin.end(input || '');
  });
}

async function withStaleReceiptLock(binary, args, cleanup) {
  const child = spawn(binary, args, {
    cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let releaseRequested = false;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const finished = new Promise((resolve, reject) => {
    child.once('error', (error) => { readyReject(error); reject(error); });
    child.once('close', (status, signal) => {
      const error = new Error(`Stale receipt locker exited (${status ?? signal}).\n${stdout}\n${stderr}`);
      readyReject(error);
      if (status !== 0 || !releaseRequested) reject(error);
      else resolve();
    });
  });
  // The owner still awaits this promise in finally; prevent an early child
  // failure becoming an unhandled rejection while cleanup is in flight.
  finished.catch(() => {});
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (/(?:^|\n)stale-receipt-lock-held\r?\n/.test(stdout)) readyResolve();
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.on('error', (error) => { readyReject(error); child.kill('SIGKILL'); });
  // Bound the holder even if its client or the verification callback fails.
  const deadline = setTimeout(() => child.kill('SIGKILL'), 10_000);
  try {
    child.stdin.write(String.raw`
      BEGIN;
      SET LOCAL statement_timeout = '1500ms';
      SET LOCAL idle_in_transaction_session_timeout = '10s';
      SELECT request_nonce
      FROM public.training_solver_worker_receipts
      WHERE machine_id = 'M1' AND request_nonce = md5('stale-receipt-1')::uuid
        AND received_at < now() - interval '24 hours'
      FOR UPDATE
      \gset
      \echo stale-receipt-lock-held
    `);
    // psql emits this marker only after the row lock and a one-row \gset.
    // Keep stdin open, and the transaction held, until cleanup has completed.
    await ready;
    return await cleanup();
  } finally {
    releaseRequested = true;
    if (!child.stdin.destroyed) child.stdin.end('ROLLBACK;\n');
    try { await finished; } finally { clearTimeout(deadline); }
  }
}

function resolvePostgresBin() {
  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  const candidates = [
    process.env.PHASE6_POSTGRES_BIN,
    pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/usr/lib/postgresql/17/bin',
    '/usr/local/pgsql/bin',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (
      ['postgres', 'initdb', 'pg_ctl', 'psql', 'createdb'].every((tool) => existsSync(path.join(candidate, tool)))
    ) {
      const version = spawnSync(path.join(candidate, 'postgres'), ['--version'], { encoding: 'utf8' });
      if (version.status === 0 && /\b17\.\d+\b/.test(version.stdout)) return candidate;
    }
  }
  const resolved = spawnSync('sh', ['-c', 'command -v postgres'], { encoding: 'utf8' });
  if (resolved.status === 0 && resolved.stdout.trim()) {
    const candidate = path.dirname(resolved.stdout.trim());
    const version = spawnSync(path.join(candidate, 'postgres'), ['--version'], { encoding: 'utf8' });
    if (version.status === 0 && /\b17\.\d+\b/.test(version.stdout)) return candidate;
  }
  throw new Error(
    'PostgreSQL 17 binaries are required for the Training solver catalog verifier, including createdb.',
  );
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!port) throw new Error('Could not reserve a disposable PostgreSQL port.');
  return port;
}

const BASELINE_SQL = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.solver_status (
  machine_id text PRIMARY KEY,
  phase text,
  board text,
  spots_done integer DEFAULT 0,
  rows_written integer DEFAULT 0,
  bad integer DEFAULT 0,
  note text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.solver_status ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.solver_status TO service_role;
CREATE TABLE public.solved_spots_gold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_hash text NOT NULL,
  game_type text NOT NULL,
  stack_depth integer NOT NULL,
  street text NOT NULL,
  strategy_matrix jsonb,
  strategy_matrix_v2 jsonb,
  solved_v2_at timestamptz,
  solver_version text,
  solver_binary_checksum text,
  machine_id text,
  pipeline_commit text,
  manifest_version text,
  manifest_checksum text,
  source_artifact_checksum text,
  quality_status text,
  audited_at timestamptz
);
CREATE INDEX idx_ssg_next_street
  ON public.solved_spots_gold (game_type, stack_depth, street, scenario_hash);
CREATE INDEX idx_god_mode_hash
  ON public.solved_spots_gold (scenario_hash);
-- Simulate the permissive legacy ACL so the migration must close every grant,
-- including privileges not needed by the solver worker.
GRANT ALL ON public.solved_spots_gold TO service_role;
GRANT SELECT (scenario_hash), UPDATE (quality_status)
  ON public.solved_spots_gold TO authenticated;
GRANT REFERENCES (id) ON public.solved_spots_gold TO service_role;
ALTER TABLE public.solved_spots_gold ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.solved_spots_gold
  FOR SELECT TO PUBLIC USING (true);
CREATE FUNCTION public.analyze_spots_by_game_type(
  p_game_type text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(game_type text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT 'hu_cash'::text, 1::bigint $$;
GRANT EXECUTE ON FUNCTION public.analyze_spots_by_game_type(text, integer)
  TO authenticated, service_role;
INSERT INTO public.solved_spots_gold (
  id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  'legacy-unproven-row', 'hu_cash', 100, 'flop', '{"position":"BB"}'::jsonb
), (
  '90000000-0000-4000-8000-000000000009',
  'hu_cash_BB_100bb_KhQd2s', 'hu_cash', 100, 'flop', NULL
), (
  'a1000000-0000-4000-8000-0000000000a1',
  'hu_cash_BB_100bb_2c3d4h', 'hu_cash', 100, 'flop', NULL
), (
  'a2000000-0000-4000-8000-0000000000a2',
  'hu_cash_BB_100bb_2c3d4h', 'hu_cash', 100, 'flop', NULL
), (
  'c1000000-0000-4000-8000-000000000001',
  'hu_cash_BB_100bb_AsKd2c', 'hu_cash', 100, 'flop', NULL
), (
  'c2000000-0000-4000-8000-000000000002',
  'turn_hu_cash_BB_100bb_AsKd2cAh', 'hu_cash', 100, 'turn', NULL
), (
  'c3000000-0000-4000-8000-000000000003',
  'hu_cash_BB_100bb_9s8h7d', 'hu_cash', 100, 'flop', NULL
), (
  'c4000000-0000-4000-8000-000000000004',
  'turn_hu_cash_BB_100bb_9s8h7d2c', 'hu_cash', 100, 'turn', NULL
), (
  'd2000000-0000-4000-8000-000000000002',
  'hu_cash_BTN_100bb_5s6h7d', 'hu_cash', 100, 'flop', NULL
), (
  'd3000000-0000-4000-8000-000000000003',
  'hu_cash_BTN_100bb_8sThQc', 'hu_cash', 100, 'flop', NULL
);
`;

// Build this fixture with the production Python harvester instead of copying a
// hand-authored JSON object into SQL. This permanently verifies the wire shape
// at the Python -> jsonb -> catalog boundary (especially board arrays and the
// strict six-decimal probability contract).
const harvestedMatrixResult = command('python3', ['-c', String.raw`
import json, sys
sys.path.insert(0, 'scripts/preflop-deep')
import pio_harvest as harvest

board = ['9h', '8d', '7c']
dead = set(board)
live = [not set(harvest._combo_cards(index)).intersection(dead) for index in range(1326)]
check = ' '.join('0.4' if value else '0' for value in live)
bet = ' '.join('0.6' if value else '0' for value in live)
ev = ' '.join('125' if value else 'nan' for value in live)

def fake_pio(command):
    if command == 'show_children r:0':
        return 'r:0:c r:0:b525'
    if command == 'show_strategy r:0':
        return check + '\n' + bet
    if command == 'calc_ev OOP r:0':
        return ev
    raise AssertionError('unexpected harvester command: ' + command)

scenario_hash, matrix = harvest.harvest_node(
    fake_pio, 'r:0', 'OOP', board, 'BB', 'BB', 'BTN',
    0.75, 1.25, 0.5, 700, 10000, '0.05 10', 'flop', 'hu_cash', 100,
    0.005, '1' * 64, '2' * 64, '3' * 64, '4' * 64,
)
assert scenario_hash == 'hu_cash_BB_100bb_9h8d7c'
assert isinstance(matrix['board'], list) and matrix['board'] == board
assert harvest.validate_row(matrix, scenario_hash, 'hu_cash', 100)['ev_ok'] is True
print(json.dumps(matrix, sort_keys=True, separators=(',', ':'), allow_nan=False))
`], { quiet: true });
const HARVESTED_MATRIX_SQL = harvestedMatrixResult.stdout.trim().replaceAll("'", "''");

const BEHAVIOR_SQL = String.raw`
CREATE OR REPLACE FUNCTION pg_temp.solver_checksum(p_scenario_hash text, p_matrix jsonb)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
  SELECT encode(extensions.digest(convert_to(
    public.fn_training_canonical_jsonb_text_v1(jsonb_build_object(
      'scenario_hash', p_scenario_hash,
      'strategy_matrix_v2', p_matrix
    )),
    'UTF8'
  ), 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION pg_temp.combo_is_board_live(p_index integer, p_board jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  high_index integer := floor((1 + sqrt(1 + 8 * p_index)) / 2)::integer;
  low_index integer;
  high_card text;
  low_card text;
BEGIN
  WHILE high_index * (high_index - 1) / 2 > p_index LOOP
    high_index := high_index - 1;
  END LOOP;
  WHILE (high_index + 1) * high_index / 2 <= p_index LOOP
    high_index := high_index + 1;
  END LOOP;
  low_index := p_index - (high_index * (high_index - 1) / 2);
  low_card := substr('23456789TJQKA', (low_index / 4) + 1, 1)
    || substr('cdhs', (low_index % 4) + 1, 1);
  high_card := substr('23456789TJQKA', (high_index / 4) + 1, 1)
    || substr('cdhs', (high_index % 4) + 1, 1);
  RETURN NOT (p_board ? low_card OR p_board ? high_card);
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.complete_solver_matrix(
  p_position text DEFAULT 'BB',
  p_street text DEFAULT 'flop',
  p_board jsonb DEFAULT '["Jh","7d","2c"]'::jsonb,
  p_node text DEFAULT 'r:0',
  p_hero text DEFAULT 'OOP',
  p_oop text DEFAULT 'BB',
  p_ip text DEFAULT 'BTN',
  p_stack integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'actions', jsonb_build_array(
      jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
      jsonb_build_object(
        'code', 'b525',
        'key', 'bet_chips_525',
        'size_chips', 525,
        'size_semantics', 'cumulative_postflop_contribution_target',
        'size_pct', NULL
      )
    ),
    'frequencies', jsonb_build_object(
      'c', (SELECT jsonb_agg(
        CASE WHEN pg_temp.combo_is_board_live(value, p_board) THEN 0.4 ELSE 0 END
        ORDER BY value
      ) FROM generate_series(0, 1325) value),
      'b525', (SELECT jsonb_agg(
        CASE WHEN pg_temp.combo_is_board_live(value, p_board) THEN 0.6 ELSE 0 END
        ORDER BY value
      ) FROM generate_series(0, 1325) value)
    ),
    'hand_evs_bb', (
      SELECT jsonb_agg(1.25 ORDER BY value) FROM generate_series(0, 1325) value
    ),
    'pot_bb', 7,
    'eff_stack_bb', p_stack,
    'node', p_node,
    'board', p_board,
    'street', p_street,
    'hero', p_hero,
    'position', p_position,
    'oop_player', p_oop,
    'ip_player', p_ip,
    'rake', '0.05 10',
    'tree_geometry', 'srp_parameterized_v2',
    'solver', 'PioSOLVER',
    'ev_oop_bb', 0.75,
    'ev_ip_bb', 1.25,
    'exploitability_pct', 0.05,
    'convergence', jsonb_build_object(
      'schema', 'piosolver.calc-results.v1',
      'source_command', 'calc_results',
      'accuracy_fraction', 0.005,
      'starting_pot_chips', 700,
      'achieved_exploitability_chips', 0.35,
      'achieved_exploitability_fraction', 0.0005
    ),
    'combo_order', 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325'
    , 'range_combo_order', 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325'
    , 'source_combo_order_schema', 'piosolver.show_hand_order.v1'
    , 'source_combo_order_sha256', repeat('1', 64)
    , 'oop_range_checksum', repeat('2', 64)
    , 'ip_range_checksum', repeat('3', 64)
    , 'training_game_contracts_sha256', repeat('4', 64)
  )
$$;

BEGIN;
INSERT INTO public.training_solver_provenance_authority (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts, approved_by
) VALUES (
  'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
  'training-v2', repeat('c', 64), repeat('1', 64), repeat('4', 64),
  jsonb_build_array(jsonb_build_object(
    'game_type', 'hu_cash', 'stack_depth', 100,
    'oop_player', 'BB', 'ip_player', 'BTN',
    'pot_chips', 700, 'eff_chips', 10000, 'rake', '0.05 10',
    'accuracy_fraction', 0.005,
    'oop_range_checksum', repeat('2', 64),
    'ip_range_checksum', repeat('3', 64),
    'range_combo_order', 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
    'source_combo_order_sha256', repeat('1', 64),
    'tree_geometry', 'srp_parameterized_v2', 'streets', jsonb_build_array('flop', 'turn', 'river')
  ), jsonb_build_object(
    'game_type', 'hu_cash', 'stack_depth', 100,
    'oop_player', 'BB', 'ip_player', 'BTN',
    'pot_chips', 700, 'eff_chips', 800, 'rake', '0.05 10',
    'accuracy_fraction', 0.005,
    'oop_range_checksum', repeat('2', 64),
    'ip_range_checksum', repeat('3', 64),
    'range_combo_order', 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
    'source_combo_order_sha256', repeat('1', 64),
    'tree_geometry', 'srp_parameterized_v2', 'streets', jsonb_build_array('flop', 'turn', 'river')
  )), 'phase6-disposable-postgres-verifier'
);
UPDATE public.training_solver_ingest_scopes
SET admission_mode = 'backlog', configured_at = now(),
    configured_by = 'phase6-disposable-postgres-verifier'
WHERE machine_id = 'M1'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2'
  AND manifest_checksum = repeat('c', 64)
  AND admission_mode = 'held';
COMMIT;

-- This is the byte shape emitted above by the real Python harvester, not a
-- hand-authored SQL fixture. It must survive jsonb parsing and enter the same
-- trigger-owned catalog as every other admitted artifact.
INSERT INTO public.solved_spots_gold (
  id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2,
  solver_version, solver_binary_checksum, machine_id, pipeline_commit,
  manifest_version, manifest_checksum, source_artifact_checksum,
  quality_status, audited_at
)
SELECT
  '30000000-0000-4000-8000-000000000003',
  'hu_cash_BB_100bb_9h8d7c', 'hu_cash', 100, 'flop', matrix.value,
  'PioSOLVER 3.0', repeat('a', 64), 'M1', repeat('b', 40),
  'training-v2', repeat('c', 64),
  pg_temp.solver_checksum('hu_cash_BB_100bb_9h8d7c', matrix.value),
  'validated', now()
FROM (VALUES ('${HARVESTED_MATRIX_SQL}'::jsonb)) AS matrix(value);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '30000000-0000-4000-8000-000000000003'
      AND scenario_hash = 'hu_cash_BB_100bb_9h8d7c'
  ) THEN
    RAISE EXCEPTION 'actual Python harvester artifact did not enter the serving catalog';
  END IF;
END $$;
DELETE FROM public.solved_spots_gold
WHERE id = '30000000-0000-4000-8000-000000000003';

DO $$
DECLARE
  canonical text;
BEGIN
  canonical := public.fn_training_canonical_jsonb_text_v1(
    '{
      "strategy_matrix_v2": {
        "unicode": "é😀",
        "position": "BB",
        "nested": {"unit": 1.0, "negative_zero": -0.0, "a": 1e-7, "A": 1e20},
        "frequencies": {"b525": [0.000001, 0.999999], "c": [-0.0, 1.0]},
        "hand_evs_bb": [-12.3457, 0.125],
        "array": [true, null, "line\n\"quote\"\\tail", -1.25e-7, 123],
        "combo_order": "card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325"
      },
      "scenario_hash": "unicode-é😀"
    }'::jsonb
  );
  IF canonical <> '{"scenario_hash":"unicode-é😀","strategy_matrix_v2":{"array":[true,null,"line\n\"quote\"\\tail",-0.000000125,123],"combo_order":"card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325","frequencies":{"b525":[0.000001,0.999999],"c":[0.0,1.0]},"hand_evs_bb":[-12.3457,0.125],"nested":{"A":100000000000000000000,"a":0.0000001,"negative_zero":0.0,"unit":1.0},"position":"BB","unicode":"é😀"}}' THEN
    RAISE EXCEPTION 'database canonical JSON text diverged: %', canonical;
  END IF;
  IF encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
      <> 'db0bdf0ad8539d03e3dab9818577078d819dc2150a98a19ac6debecad1dd1b99' THEN
    RAISE EXCEPTION 'database canonical JSON checksum diverged from the worker vector';
  END IF;
END $$;

DO $$ BEGIN
  IF pg_temp.solver_checksum(
    'hu_cash_BB_100bb_Jh7d2c',
    jsonb_build_object(
      'position', 'BB',
      'combo_order', 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325'
    )
  ) <> 'bf55e71da1955165259cdeca9bed44bd9af97f243f931a33461aa916a2459e3f' THEN
    RAISE EXCEPTION 'database canonical JSON checksum differs from the Python worker contract';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '10000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'catalog migration inferred an unproven historical warehouse row';
  END IF;
END;
$$;

INSERT INTO public.solved_spots_gold (
  id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2,
  solver_version, solver_binary_checksum, machine_id, pipeline_commit,
  manifest_version, manifest_checksum, source_artifact_checksum,
  quality_status, audited_at
)
SELECT
  '60000000-0000-4000-8000-000000000006',
  'hu_cash_BB_100bb_2h3h4h', 'hu_cash', 100, 'flop', matrix.value,
  'PioSOLVER 3.0', repeat('a', 64), 'M1', repeat('b', 40),
  'training-v2', repeat('c', 64),
  pg_temp.solver_checksum('hu_cash_BB_100bb_2h3h4h', matrix.value),
  'validated', now()
FROM (
  VALUES (jsonb_build_object(
    'position', 'BB',
    'combo_order', 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325'
  ))
) AS matrix(value);

INSERT INTO public.solved_spots_gold (
  id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2,
  solver_version, solver_binary_checksum, machine_id, pipeline_commit,
  manifest_version, manifest_checksum, source_artifact_checksum,
  quality_status, audited_at
)
SELECT
  '70000000-0000-4000-8000-000000000007',
  'hu_cash_BB_100bb_5h6h7h', 'hu_cash', 100, 'flop', matrix.value,
  'PioSOLVER 3.1', repeat('e', 64), 'M1', repeat('b', 40),
  'training-v2', repeat('c', 64),
  pg_temp.solver_checksum('hu_cash_BB_100bb_5h6h7h', matrix.value),
  'validated', now()
FROM (
  VALUES (pg_temp.complete_solver_matrix(
    'BB', 'flop', '["5h","6h","7h"]'::jsonb
  ))
) AS matrix(value);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id IN (
      '60000000-0000-4000-8000-000000000006',
      '70000000-0000-4000-8000-000000000007'
    )
  ) THEN
    RAISE EXCEPTION 'skeletal or unapproved self-attested artifact entered the solver registry';
  END IF;
END $$;

INSERT INTO public.solved_spots_gold (
  id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2,
  solver_version, solver_binary_checksum, machine_id, pipeline_commit,
  manifest_version, manifest_checksum, source_artifact_checksum,
  quality_status, audited_at
) VALUES (
  '20000000-0000-4000-8000-000000000002',
  'hu_cash_BB_100bb_Jh7d2c', 'hu_cash', 100, 'flop',
  pg_temp.complete_solver_matrix(),
  'PioSOLVER 3.0', repeat('a', 64), 'M1', repeat('b', 40),
  'training-v2', repeat('c', 64), pg_temp.solver_checksum(
    'hu_cash_BB_100bb_Jh7d2c',
    pg_temp.complete_solver_matrix()
  ),
  'validated', now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
      AND scenario_hash = 'hu_cash_BB_100bb_Jh7d2c'
      AND game_type = 'hu_cash'
      AND stack_depth = 100
      AND street = 'flop'
      AND hero_position = 'BB'
  ) THEN
    RAISE EXCEPTION 'validated future solver artifact was not registered';
  END IF;
END;
$$;

UPDATE public.solved_spots_gold
SET quality_status = 'quarantined'
WHERE id = '20000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.training_solver_artifact_catalog) THEN
    RAISE EXCEPTION 'quarantined artifact remained in request-path registry';
  END IF;
END $$;

UPDATE public.solved_spots_gold
SET quality_status = 'validated'
WHERE id = '20000000-0000-4000-8000-000000000002';
UPDATE public.solved_spots_gold
SET strategy_matrix_v2 = pg_temp.complete_solver_matrix(
      'DEALER', 'flop', '["Jh","7d","2c"]'::jsonb,
      'r:0', 'OOP', 'DEALER', 'BTN', 100
    ),
    source_artifact_checksum = pg_temp.solver_checksum(
      scenario_hash,
      pg_temp.complete_solver_matrix(
        'DEALER', 'flop', '["Jh","7d","2c"]'::jsonb,
        'r:0', 'OOP', 'DEALER', 'BTN', 100
      )
    )
WHERE id = '20000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.training_solver_artifact_catalog) THEN
    RAISE EXCEPTION 'invalid hero position remained in request-path registry';
  END IF;
END $$;

UPDATE public.solved_spots_gold
SET strategy_matrix_v2 = pg_temp.complete_solver_matrix(),
    source_artifact_checksum = pg_temp.solver_checksum(
      scenario_hash,
      pg_temp.complete_solver_matrix()
    )
WHERE id = '20000000-0000-4000-8000-000000000002';

CREATE OR REPLACE FUNCTION pg_temp.assert_matrix_rejected(
  p_case text,
  p_scenario_hash text,
  p_street text,
  p_matrix jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.solved_spots_gold
  SET scenario_hash = p_scenario_hash,
      game_type = 'hu_cash',
      stack_depth = 100,
      street = p_street,
      strategy_matrix_v2 = p_matrix,
      source_artifact_checksum = pg_temp.solver_checksum(p_scenario_hash, p_matrix)
  WHERE id = '20000000-0000-4000-8000-000000000002';
  IF EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'invalid solver matrix entered catalog: %', p_case;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_illegal_node_rejected(
  p_case text,
  p_scenario_hash text,
  p_position text,
  p_street text,
  p_board jsonb,
  p_node text,
  p_hero text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  matrix jsonb;
BEGIN
  matrix := pg_temp.complete_solver_matrix(
    p_position, p_street, p_board, p_node, p_hero, 'BB', 'BTN', 100
  );
  PERFORM pg_temp.assert_matrix_rejected(
    'illegal node grammar: ' || p_case || ' (' || p_node || ')',
    p_scenario_hash,
    p_street,
    matrix
  );
END
$$;

SELECT pg_temp.assert_illegal_node_rejected(
  'under-call encoded as aggression', 'hu_cash_BB_100bb_AhKdQc',
  'BB', 'flop', '["Ah","Kd","Qc"]'::jsonb, 'r:0:b500:r200', 'OOP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'non-all-in raise below the prior full-raise increment', 'hu_cash_BB_100bb_AdKhQs',
  'BB', 'flop', '["Ad","Kh","Qs"]'::jsonb, 'r:0:b500:r800', 'OOP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'raise token at an open node', 'hu_cash_BTN_100bb_2s3c4d',
  'BTN', 'flop', '["2s","3c","4d"]'::jsonb, 'r:0:r500', 'IP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'bet token while facing a wager', 'hu_cash_BB_100bb_3s4c5d',
  'BB', 'flop', '["3s","4c","5d"]'::jsonb, 'r:0:b500:b1000', 'OOP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'non-all-in opening wager below one big blind', 'hu_cash_BTN_100bb_3h4d5c',
  'BTN', 'flop', '["3h","4d","5c"]'::jsonb, 'r:0:b50', 'IP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'third action after check-check', 'hu_cash_BTN_100bb_2h3d4c',
  'BTN', 'flop', '["2h","3d","4c"]'::jsonb, 'r:0:c:c:c', 'IP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'runout before betting-round closure', 'turn_hu_cash_BB_100bb_5h6d7cTs',
  'BB', 'turn', '["5h","6d","7c","Ts"]'::jsonb, 'r:0:Ts', 'OOP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'terminal check-check presented as decision', 'hu_cash_BB_100bb_8h9dTc',
  'BB', 'flop', '["8h","9d","Tc"]'::jsonb, 'r:0:c:c', 'OOP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'action after called wager', 'hu_cash_BTN_100bb_JhQdKc',
  'BTN', 'flop', '["Jh","Qd","Kc"]'::jsonb, 'r:0:b500:c:b800', 'IP'
);
SELECT pg_temp.assert_illegal_node_rejected(
  'runout after an all-in call', 'turn_hu_cash_BB_100bb_QhKdAcTs',
  'BB', 'turn', '["Qh","Kd","Ac","Ts"]'::jsonb,
  'r:0:b10000:c:Ts', 'OOP'
);
DO $$
DECLARE
  matrix jsonb;
  zeros jsonb := (SELECT jsonb_agg(0 ORDER BY value) FROM generate_series(0, 1325) value);
BEGIN
  matrix := pg_temp.complete_solver_matrix(
    'BB', 'turn', '["As","2d","3c","4h"]'::jsonb,
    'r:0', 'OOP', 'BB', 'BTN', 100
  );
  UPDATE public.solved_spots_gold
  SET scenario_hash = 'turn_hu_cash_BB_100bb_As2d3c4h',
      street = 'turn',
      strategy_matrix_v2 = matrix,
      source_artifact_checksum = pg_temp.solver_checksum(
        'turn_hu_cash_BB_100bb_As2d3c4h', matrix
      )
  WHERE id = '20000000-0000-4000-8000-000000000002';
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'legal standalone turn-root artifact was rejected';
  END IF;

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'river', '["As","2d","3c","4h","5s"]'::jsonb,
    'r:0', 'OOP', 'BB', 'BTN', 100
  );
  UPDATE public.solved_spots_gold
  SET scenario_hash = 'river_hu_cash_BB_100bb_As2d3c4h5s',
      street = 'river',
      strategy_matrix_v2 = matrix,
      source_artifact_checksum = pg_temp.solver_checksum(
        'river_hu_cash_BB_100bb_As2d3c4h5s', matrix
      )
  WHERE id = '20000000-0000-4000-8000-000000000002';
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'legal standalone river-root artifact was rejected';
  END IF;

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["Ah","Kd","Qc"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{frequencies,c,1225}', '0.4'::jsonb);
  matrix := jsonb_set(matrix, '{frequencies,b525,1225}', '0.6'::jsonb);
  PERFORM pg_temp.assert_matrix_rejected(
    'strategy mass on board-dead 2cAh', 'hu_cash_BB_100bb_AhKdQc', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["2h","3d","4c"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
    jsonb_build_object('code', 'f', 'key', 'fold', 'size_pct', 0)
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'c', matrix -> 'frequencies' -> 'c',
    'f', matrix -> 'frequencies' -> 'b525'
  ));
  PERFORM pg_temp.assert_matrix_rejected(
    'fold offered without facing a wager', 'hu_cash_BB_100bb_2h3d4c', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["5h","6d","7c"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
    jsonb_build_object(
      'code', 'b525', 'key', 'bet-525', 'size_chips', 525,
      'size_semantics', 'cumulative_postflop_contribution_target'
    ),
    jsonb_build_object(
      'code', 'r525', 'key', 'raise-525', 'size_chips', 525,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies,r525}', zeros);
  PERFORM pg_temp.assert_matrix_rejected(
    'duplicate-equivalent wager targets', 'hu_cash_BB_100bb_5h6d7c', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["6h","7d","8c"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
    jsonb_build_object(
      'code', 'b50', 'key', 'sub-minimum-open', 'size_chips', 50,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'c', matrix -> 'frequencies' -> 'c',
    'b50', matrix -> 'frequencies' -> 'b525'
  ));
  PERFORM pg_temp.assert_matrix_rejected(
    'outgoing opening wager below one big blind',
    'hu_cash_BB_100bb_6h7d8c', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["6s","7h","8d"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object(
      'code', 'b200', 'key', 'bet-200', 'size_chips', 200,
      'size_semantics', 'cumulative_postflop_contribution_target'
    ),
    jsonb_build_object(
      'code', 'b500', 'key', 'bet-500', 'size_chips', 500,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'b200', matrix -> 'frequencies' -> 'c',
    'b500', matrix -> 'frequencies' -> 'b525'
  ));
  PERFORM pg_temp.assert_matrix_rejected(
    'open-node policy omits Check',
    'hu_cash_BB_100bb_6s7h8d', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BTN', 'flop', '["7s","8h","9d"]'::jsonb,
    'r:0:b500', 'IP', 'BB', 'BTN', 100
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'call', 'size_pct', 0),
    jsonb_build_object(
      'code', 'r1000', 'key', 'raise-1000', 'size_chips', 1000,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'c', matrix -> 'frequencies' -> 'c',
    'r1000', matrix -> 'frequencies' -> 'b525'
  ));
  PERFORM pg_temp.assert_matrix_rejected(
    'facing-wager policy omits Fold',
    'hu_cash_BTN_100bb_7s8h9d', 'flop', matrix
  );

  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'f', 'key', 'fold', 'size_pct', 0),
    jsonb_build_object(
      'code', 'r1000', 'key', 'raise-1000', 'size_chips', 1000,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'f', matrix -> 'frequencies' -> 'c',
    'r1000', matrix -> 'frequencies' -> 'b525'
  ));
  PERFORM pg_temp.assert_matrix_rejected(
    'facing-wager policy omits Call',
    'hu_cash_BTN_100bb_7s8h9d', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["8h","9d","Tc"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{frequencies,c}', zeros);
  matrix := jsonb_set(matrix, '{frequencies,b525}', zeros);
  PERFORM pg_temp.assert_matrix_rejected(
    'no legal live combo carries strategy mass', 'hu_cash_BB_100bb_8h9dTc', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["Ah","Kd","Qc"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{frequencies,c,0}', '1.000001'::jsonb);
  matrix := jsonb_set(matrix, '{frequencies,b525,0}', '0'::jsonb);
  PERFORM pg_temp.assert_matrix_rejected(
    'one action exceeds probability one inside the aggregate tolerance',
    'hu_cash_BB_100bb_AhKdQc', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["Ah","Kd","Qc"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{frequencies,b525,0}', '0.600011'::jsonb);
  PERFORM pg_temp.assert_matrix_rejected(
    'live combo sum exceeds six-decimal rounding tolerance',
    'hu_cash_BB_100bb_AhKdQc', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["Ah","Kd","Qc"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{frequencies,b525,0}', '0.599989'::jsonb);
  PERFORM pg_temp.assert_matrix_rejected(
    'live combo sum falls below six-decimal rounding tolerance',
    'hu_cash_BB_100bb_AhKdQc', 'flop', matrix
  );

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'turn', '["Jh","7d","2c","Ts"]'::jsonb,
    'r:0:c:b412:c:Ts', 'OOP', 'BB', 'BTN', 100
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
    jsonb_build_object(
      'code', 'b200', 'key', 'under-baseline-bet', 'size_chips', 200,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'c', matrix -> 'frequencies' -> 'c',
    'b200', matrix -> 'frequencies' -> 'b525'
  ));
  PERFORM pg_temp.assert_matrix_rejected(
    'turn action target below cumulative 412 baseline',
    'turn_hu_cash_BB_100bb_Jh7d2cTs', 'turn', matrix
  );
END
$$;

DO $$
DECLARE
  matrix jsonb;
BEGIN
  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["4s","5h","6d"]'::jsonb
  );
  matrix := jsonb_set(matrix, '{frequencies,b525,0}', '0.59999'::jsonb);
  matrix := jsonb_set(matrix, '{frequencies,b525,1}', '0.60001'::jsonb);
  UPDATE public.solved_spots_gold
  SET scenario_hash = 'hu_cash_BB_100bb_4s5h6d',
      street = 'flop',
      strategy_matrix_v2 = matrix,
      source_artifact_checksum = pg_temp.solver_checksum(
        'hu_cash_BB_100bb_4s5h6d', matrix
      )
  WHERE id = '20000000-0000-4000-8000-000000000002';
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'inclusive six-decimal probability boundaries were rejected';
  END IF;

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["Ad","Kh","Qs"]'::jsonb,
    'r:0:b500:b800', 'OOP', 'BB', 'BTN', 8
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'call', 'size_pct', 0),
    jsonb_build_object('code', 'f', 'key', 'fold', 'size_pct', 0)
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'c', matrix -> 'frequencies' -> 'c',
    'f', matrix -> 'frequencies' -> 'b525'
  ));
  UPDATE public.solved_spots_gold
  SET scenario_hash = 'hu_cash_BB_100bb_AdKhQs',
      street = 'flop',
      strategy_matrix_v2 = matrix,
      source_artifact_checksum = pg_temp.solver_checksum(
        'hu_cash_BB_100bb_AdKhQs', matrix
      )
  WHERE id = '20000000-0000-4000-8000-000000000002';
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'legal exact-stack short all-in raise was rejected';
  END IF;

  matrix := pg_temp.complete_solver_matrix(
    'BB', 'turn', '["Jh","7d","2c","Ts"]'::jsonb,
    'r:0:c:b412:c:Ts', 'OOP', 'BB', 'BTN', 100
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
    jsonb_build_object(
      'code', 'b1442', 'key', 'bet_chips_1442', 'size_chips', 1442,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'c', matrix -> 'frequencies' -> 'c',
    'b1442', matrix -> 'frequencies' -> 'b525'
  ));
  UPDATE public.solved_spots_gold
  SET scenario_hash = 'turn_hu_cash_BB_100bb_Jh7d2cTs',
      street = 'turn',
      strategy_matrix_v2 = matrix,
      source_artifact_checksum = pg_temp.solver_checksum(
        'turn_hu_cash_BB_100bb_Jh7d2cTs', matrix
      )
  WHERE id = '20000000-0000-4000-8000-000000000002';
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'legal cumulative turn target was rejected';
  END IF;

  matrix := pg_temp.complete_solver_matrix(
    'BTN', 'river', '["Jh","7d","2c","Ts","9d"]'::jsonb,
    'r:0:c:b412:c:Ts:b1442:c:9d:c', 'IP', 'BB', 'BTN', 100
  );
  matrix := jsonb_set(matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
    jsonb_build_object(
      'code', 'b4018', 'key', 'bet_chips_4018', 'size_chips', 4018,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  matrix := jsonb_set(matrix, '{frequencies}', jsonb_build_object(
    'c', matrix -> 'frequencies' -> 'c',
    'b4018', matrix -> 'frequencies' -> 'b525'
  ));
  UPDATE public.solved_spots_gold
  SET scenario_hash = 'river_hu_cash_BTN_100bb_Jh7d2cTs9d',
      street = 'river',
      strategy_matrix_v2 = matrix,
      source_artifact_checksum = pg_temp.solver_checksum(
        'river_hu_cash_BTN_100bb_Jh7d2cTs9d', matrix
      )
  WHERE id = '20000000-0000-4000-8000-000000000002';
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'legal cumulative river target was rejected';
  END IF;
END
$$;

UPDATE public.solved_spots_gold
SET scenario_hash = 'hu_cash_BB_100bb_Jh7d2c',
    game_type = 'hu_cash',
    stack_depth = 100,
    street = 'flop',
    strategy_matrix_v2 = pg_temp.complete_solver_matrix(),
    source_artifact_checksum = pg_temp.solver_checksum(
      'hu_cash_BB_100bb_Jh7d2c', pg_temp.complete_solver_matrix()
    )
WHERE id = '20000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'legal root decision did not recover after node-grammar fixtures';
  END IF;
END $$;

INSERT INTO public.solved_spots_gold (
  id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2,
  solver_version, solver_binary_checksum, machine_id, pipeline_commit,
  manifest_version, manifest_checksum, source_artifact_checksum,
  quality_status, audited_at
) VALUES (
  '30000000-0000-4000-8000-000000000003',
  'postflop_complete_BB_40bb_Jh7d2c', 'postflop_complete', 40, 'flop',
  pg_temp.complete_solver_matrix('BB', 'flop', '["Jh","7d","2c"]'::jsonb,
    'r:0', 'OOP', 'BB', 'BTN', 40),
  'PioSOLVER 3.0', repeat('a', 64), 'M1', repeat('b', 40),
  'training-v2', repeat('c', 64), pg_temp.solver_checksum(
    'postflop_complete_BB_40bb_Jh7d2c',
    pg_temp.complete_solver_matrix('BB', 'flop', '["Jh","7d","2c"]'::jsonb,
      'r:0', 'OOP', 'BB', 'BTN', 40)
  ),
  'validated', now()
);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.solved_spots_gold'::regclass
      AND polname = 'Public read access'
  ) THEN
    RAISE EXCEPTION 'legacy public warehouse read policy survived migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '30000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'out-of-contract family/stack pair entered the solver registry';
  END IF;
END $$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.solved_spots_gold (
      id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2,
      solver_version, solver_binary_checksum, machine_id, pipeline_commit,
      manifest_version, manifest_checksum, source_artifact_checksum,
      quality_status, audited_at
    ) VALUES (
      '40000000-0000-4000-8000-000000000004',
      'hu_cash_BB_100bb_AhKdQc', 'hu_cash', 100, 'flop',
      pg_temp.complete_solver_matrix('BB', 'flop', '["Ah","Kd","Qc"]'::jsonb),
      'PioSOLVER 3.0', repeat('a', 64), 'M1', repeat('b', 40),
      'training-v2', repeat('c', 64), repeat('0', 64),
      'validated', now()
    );
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'mismatched solver artifact checksum was accepted';
  END IF;
END $$;

DELETE FROM public.solved_spots_gold
WHERE id = '20000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.training_solver_artifact_catalog) THEN
    RAISE EXCEPTION 'deleted solver artifact left a stale registry identity';
  END IF;
END $$;

DO $worker_ingest_behavior$
DECLARE
  artifact jsonb;
  matrix jsonb;
  first_receipt record;
  replay_receipt record;
  signed_at timestamptz := clock_timestamp();
  nonce uuid := '91000000-0000-4000-8000-000000000001';
  metadata_nonce uuid := '91000000-0000-4000-8000-000000000002';
  conflict_blocked boolean := false;
  stale_blocked boolean := false;
  icm_blocked boolean := false;
  failed_write_blocked boolean := false;
  quarantined_replay_blocked boolean := false;
BEGIN
  INSERT INTO public.training_solver_worker_receipts (
    machine_id, request_nonce, operation, signed_at, body_sha256,
    solver_version, solver_binary_checksum, pipeline_commit,
    manifest_version, manifest_checksum, received_at
  ) VALUES (
    'M1', '91000000-0000-4000-8000-000000000099', 'heartbeat',
    signed_at - interval '2 days', repeat('9', 64),
    'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2', repeat('c', 64), signed_at - interval '2 days'
  );
  matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["Kh","Qd","2s"]'::jsonb,
    'r:0', 'OOP', 'BB', 'BTN', 100
  );
  artifact := jsonb_build_object(
    'audited_at', signed_at,
    'game_type', 'hu_cash',
    'id', '90000000-0000-4000-8000-000000000009',
    'machine_id', 'M1',
    'manifest_checksum', repeat('c', 64),
    'manifest_version', 'training-v2',
    'pipeline_commit', repeat('b', 40),
    'quality_status', 'validated',
    'scenario_hash', 'hu_cash_BB_100bb_KhQd2s',
    'solved_v2_at', signed_at,
    'solver_binary_checksum', repeat('a', 64),
    'solver_version', 'PioSOLVER 3.0',
    'source_artifact_checksum', pg_temp.solver_checksum(
      'hu_cash_BB_100bb_KhQd2s', matrix
    ),
    'stack_depth', 100,
    'strategy_matrix_v2', matrix,
    'street', 'flop'
  );

  SELECT * INTO first_receipt
  FROM public.training_ingest_solver_artifact_v1(
    'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2', repeat('c', 64), nonce, signed_at, repeat('d', 64), artifact
  );
  IF first_receipt.artifact_id <> '90000000-0000-4000-8000-000000000009'
     OR first_receipt.scenario_hash <> 'hu_cash_BB_100bb_KhQd2s'
     OR first_receipt.source_artifact_checksum <> artifact ->> 'source_artifact_checksum'
     OR first_receipt.replayed THEN
    RAISE EXCEPTION 'first scoped solver artifact ingest returned an invalid receipt';
  END IF;
  IF (SELECT count(*) FROM public.solved_spots_gold
      WHERE strategy_matrix_v2 IS NOT NULL
        AND id = '90000000-0000-4000-8000-000000000009') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.training_solver_artifact_catalog
       WHERE artifact_id = '90000000-0000-4000-8000-000000000009'
     ) THEN
    RAISE EXCEPTION 'scoped ingest did not update and admit exactly its pre-existing artifact';
  END IF;
  IF (SELECT count(*) FROM public.training_solver_worker_row_states_v1(
        ARRAY['hu_cash_BB_100bb_KhQd2s']
      ) state
      WHERE state.id = '90000000-0000-4000-8000-000000000009'
        AND state.game_type = 'hu_cash'
        AND state.stack_depth = 100
        AND state.street = 'flop'
        AND state.node = 'r:0'
        AND state.hero_position = 'BB'
        AND state.admitted) <> 1 THEN
    RAISE EXCEPTION 'worker resume state did not bind relational identity to active admission';
  END IF;

  SELECT * INTO replay_receipt
  FROM public.training_ingest_solver_artifact_v1(
    'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2', repeat('c', 64), nonce, signed_at, repeat('d', 64), artifact
  );
  IF NOT replay_receipt.replayed
     OR (SELECT count(*) FROM public.training_solver_worker_receipts
         WHERE machine_id = 'M1' AND request_nonce = nonce) <> 1 THEN
    RAISE EXCEPTION 'byte-identical scoped ingest replay was not idempotent';
  END IF;

  UPDATE public.solved_spots_gold SET quality_status = 'quarantined'
  WHERE id = '90000000-0000-4000-8000-000000000009';
  IF (SELECT count(*) FROM public.training_solver_worker_row_states_v1(
        ARRAY['hu_cash_BB_100bb_KhQd2s']
      ) state WHERE state.admitted) <> 0
     OR EXISTS (
       SELECT 1 FROM public.training_solver_spot_candidates_v1(
         '[{"game_type":"hu_cash","stack_depth":100}]'::jsonb,
         'BB', NULL, NULL, NULL, 3,
         '90000000-0000-4000-8000-000000000009',
         'hu_cash_BB_100bb_KhQd2s', 'flop', 0
       )
     ) THEN
    RAISE EXCEPTION 'quarantined/no-catalog artifact remained admitted to a runtime reader';
  END IF;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64), nonce, signed_at, repeat('d', 64), artifact
    );
  EXCEPTION WHEN raise_exception THEN
    quarantined_replay_blocked := SQLERRM = 'SOLVER_WORKER_REPLAY_ARTIFACT_NOT_CURRENT';
  END;
  IF NOT quarantined_replay_blocked THEN
    RAISE EXCEPTION 'a quarantined artifact was acknowledged from an old ingest receipt';
  END IF;
  UPDATE public.solved_spots_gold SET quality_status = 'validated'
  WHERE id = '90000000-0000-4000-8000-000000000009';
  IF (SELECT count(*) FROM public.training_solver_worker_row_states_v1(
        ARRAY['hu_cash_BB_100bb_KhQd2s']
      ) state WHERE state.admitted) <> 1 THEN
    RAISE EXCEPTION 'worker resume state did not recover after valid catalog readmission';
  END IF;

  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64), nonce, signed_at, repeat('e', 64), artifact
    );
  EXCEPTION WHEN unique_violation THEN conflict_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64),
      '91000000-0000-4000-8000-000000000003', signed_at - interval '10 minutes',
      repeat('f', 64), artifact
    );
  EXCEPTION WHEN invalid_parameter_value THEN stale_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64),
      '91000000-0000-4000-8000-000000000004', signed_at, repeat('1', 64),
      jsonb_set(artifact, '{game_type}', '"mtt_6max_icm"'::jsonb)
    );
  EXCEPTION WHEN invalid_parameter_value THEN icm_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64),
      '91000000-0000-4000-8000-000000000006', signed_at, repeat('6', 64),
      jsonb_set(
        artifact,
        '{id}',
        to_jsonb('90000000-0000-4000-8000-000000000008'::text)
      )
    );
  EXCEPTION WHEN raise_exception THEN
    failed_write_blocked := SQLERRM = 'SOLVER_WORKER_EXACT_ARTIFACT_NOT_UPDATED';
  END;
  IF EXISTS (
    SELECT 1 FROM public.training_solver_worker_receipts
    WHERE machine_id = 'M1'
      AND request_nonce = '91000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'failed initial artifact write left a consumed receipt';
  END IF;
  IF NOT conflict_blocked OR NOT stale_blocked OR NOT icm_blocked
     OR NOT failed_write_blocked THEN
    RAISE EXCEPTION 'scoped ingest accepted nonce conflict, stale timestamp, or unsealed ICM';
  END IF;

  IF NOT public.training_claim_solver_worker_request_v1(
       'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
       'training-v2', repeat('c', 64), metadata_nonce, 'row_states',
       signed_at, repeat('2', 64)
     )
     OR public.training_claim_solver_worker_request_v1(
       'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
       'training-v2', repeat('c', 64), metadata_nonce, 'row_states',
       signed_at, repeat('2', 64)
     )
     OR public.training_claim_solver_worker_request_v1(
       'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
       'training-v2', repeat('c', 64),
       '91000000-0000-4000-8000-000000000005', 'heartbeat',
       signed_at, repeat('3', 64)
     ) THEN
    RAISE EXCEPTION 'metadata nonce or exact active authority binding failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.training_solver_worker_receipts
    WHERE request_nonce = '91000000-0000-4000-8000-000000000099'
  ) THEN
    RAISE EXCEPTION 'bounded expired solver receipt pruning did not run';
  END IF;
END;
$worker_ingest_behavior$;

CREATE OR REPLACE FUNCTION pg_temp.backlog_worker_artifact(
  p_id uuid,
  p_scenario_hash text,
  p_matrix jsonb,
  p_signed_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'audited_at', p_signed_at,
    'game_type', 'hu_cash',
    'id', p_id,
    'machine_id', 'M1',
    'manifest_checksum', repeat('c', 64),
    'manifest_version', 'training-v2',
    'pipeline_commit', repeat('b', 40),
    'quality_status', 'validated',
    'scenario_hash', p_scenario_hash,
    'solved_v2_at', p_signed_at,
    'solver_binary_checksum', repeat('a', 64),
    'solver_version', 'PioSOLVER 3.0',
    'source_artifact_checksum', pg_temp.solver_checksum(p_scenario_hash, p_matrix),
    'stack_depth', 100,
    'strategy_matrix_v2', p_matrix,
    'street', p_matrix ->> 'street'
  )
$$;

DO $backlog_scope_behavior$
DECLARE
  first_matrix jsonb;
  second_matrix jsonb;
  signed_at timestamptz := clock_timestamp();
BEGIN
  first_matrix := pg_temp.complete_solver_matrix(
    'BTN', 'flop', '["5s","6h","7d"]'::jsonb,
    'r:0:c', 'IP', 'BB', 'BTN', 100
  );
  second_matrix := pg_temp.complete_solver_matrix(
    'BTN', 'flop', '["8s","Th","Qc"]'::jsonb,
    'r:0:c', 'IP', 'BB', 'BTN', 100
  );
  PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
    'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2', repeat('c', 64),
    '93500000-0000-4000-8000-000000000001', signed_at, repeat('1', 64),
    pg_temp.backlog_worker_artifact(
      'd2000000-0000-4000-8000-000000000002',
      'hu_cash_BTN_100bb_5s6h7d', first_matrix, signed_at
    )
  );
  PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
    'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2', repeat('c', 64),
    '93500000-0000-4000-8000-000000000002', signed_at, repeat('2', 64),
    pg_temp.backlog_worker_artifact(
      'd3000000-0000-4000-8000-000000000003',
      'hu_cash_BTN_100bb_8sThQc', second_matrix, signed_at
    )
  );
  IF (SELECT count(*) FROM public.training_solver_artifact_catalog
      WHERE artifact_id IN (
        '90000000-0000-4000-8000-000000000009',
        'd2000000-0000-4000-8000-000000000002',
        'd3000000-0000-4000-8000-000000000003'
      )) <> 3 THEN
    RAISE EXCEPTION 'backlog scope stopped after two signed artifacts';
  END IF;
END;
$backlog_scope_behavior$;

CREATE OR REPLACE FUNCTION pg_temp.worker_artifact(
  p_id uuid,
  p_scenario_hash text,
  p_matrix jsonb,
  p_signed_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'audited_at', p_signed_at,
    'game_type', 'hu_cash',
    'id', p_id,
    'machine_id', 'M2',
    'manifest_checksum', repeat('e', 64),
    'manifest_version', 'training-v2-canary',
    'pipeline_commit', repeat('b', 40),
    'quality_status', 'validated',
    'scenario_hash', p_scenario_hash,
    'solved_v2_at', p_signed_at,
    'solver_binary_checksum', repeat('a', 64),
    'solver_version', 'PioSOLVER 3.0',
    'source_artifact_checksum', pg_temp.solver_checksum(p_scenario_hash, p_matrix),
    'stack_depth', 100,
    'strategy_matrix_v2', p_matrix,
    'street', p_matrix ->> 'street'
  )
$$;

-- M1 already owns the migration-preserved backlog scope. A second valid M1
-- tuple may be prepared while held, but activation must fail even though its
-- target pair is otherwise complete. This is the exact stale-backlog bypass
-- that could let one machine ingest beyond a bounded canary.
BEGIN;
INSERT INTO public.training_solver_provenance_authority (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts, approved_by
)
SELECT
  'M1', solver_version, solver_binary_checksum, pipeline_commit,
  'training-v2-conflict', repeat('d', 64), source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts,
  'phase6-disposable-postgres-verifier'
FROM public.training_solver_provenance_authority
WHERE machine_id = 'M1'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2'
  AND manifest_checksum = repeat('c', 64);
INSERT INTO public.training_solver_bounded_canary_targets (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, target_role, artifact_id,
  scenario_hash, street, node, hero_position, approved_by
) VALUES (
  'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
  'training-v2-conflict', repeat('d', 64), 'parent',
  'c1000000-0000-4000-8000-000000000001',
  'hu_cash_BB_100bb_AsKd2c', 'flop', 'r:0', 'BB',
  'phase6-disposable-postgres-verifier'
), (
  'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
  'training-v2-conflict', repeat('d', 64), 'child',
  'c2000000-0000-4000-8000-000000000002',
  'turn_hu_cash_BB_100bb_AsKd2cAh', 'turn',
  'r:0:c:b412:c:Ah', 'BB', 'phase6-disposable-postgres-verifier'
);
DO $same_machine_active_scope_conflict$
DECLARE
  activation_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.training_solver_ingest_scopes
    SET admission_mode = 'bounded_canary', partition_count = 2,
        partition_index = 0
    WHERE machine_id = 'M1'
      AND manifest_version = 'training-v2-conflict'
      AND manifest_checksum = repeat('d', 64);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    activation_blocked :=
      SQLERRM = 'TRAINING_SOLVER_MACHINE_INGEST_SCOPE_ALREADY_ACTIVE';
  END;
  IF NOT activation_blocked OR NOT EXISTS (
    SELECT 1 FROM public.training_solver_ingest_scopes
    WHERE machine_id = 'M1'
      AND manifest_version = 'training-v2-conflict'
      AND manifest_checksum = repeat('d', 64)
      AND admission_mode = 'held'
  ) THEN
    RAISE EXCEPTION 'same-machine active scope did not block canary activation';
  END IF;
END;
$same_machine_active_scope_conflict$;
COMMIT;

-- M1's backlog does not block M2: activation is serialized and capped per
-- physical machine, not globally across the independent workers.
BEGIN;
INSERT INTO public.training_solver_provenance_authority (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts, approved_by
)
SELECT
  'M2', solver_version, solver_binary_checksum, pipeline_commit,
  'training-v2-canary', repeat('e', 64), source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts,
  'phase6-disposable-postgres-verifier'
FROM public.training_solver_provenance_authority
WHERE machine_id = 'M1'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2'
  AND manifest_checksum = repeat('c', 64);
INSERT INTO public.training_solver_bounded_canary_targets (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, target_role, artifact_id,
  scenario_hash, street, node, hero_position, approved_by
) VALUES (
  'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
  'training-v2-canary', repeat('e', 64), 'parent',
  'c1000000-0000-4000-8000-000000000001',
  'hu_cash_BB_100bb_AsKd2c', 'flop', 'r:0', 'BB',
  'phase6-disposable-postgres-verifier'
), (
  'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
  'training-v2-canary', repeat('e', 64), 'child',
  'c2000000-0000-4000-8000-000000000002',
  'turn_hu_cash_BB_100bb_AsKd2cAh', 'turn',
  'r:0:c:b412:c:Ah', 'BB', 'phase6-disposable-postgres-verifier'
);
UPDATE public.training_solver_ingest_scopes
SET admission_mode = 'bounded_canary',
    partition_count = 2,
    partition_index = 1,
    configured_at = now(),
    configured_by = 'phase6-disposable-postgres-verifier'
WHERE machine_id = 'M2'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2-canary'
  AND manifest_checksum = repeat('e', 64)
  AND admission_mode = 'held';
COMMIT;

DO $bounded_canary_ingest_behavior$
DECLARE
  parent_matrix jsonb;
  child_matrix jsonb;
  third_matrix jsonb;
  signed_at timestamptz := clock_timestamp();
  third_blocked boolean := false;
  wrong_node_blocked boolean := false;
  wrong_position_blocked boolean := false;
  wrong_uuid_blocked boolean := false;
  wrong_scenario_blocked boolean := false;
  wrong_street_blocked boolean := false;
  wrong_machine_blocked boolean := false;
  scope_downgrade_blocked boolean := false;
  target_mutation_blocked boolean := false;
  target_move_blocked boolean := false;
BEGIN
  IF (SELECT count(*)
      FROM public.training_solver_worker_row_states_v2(
        'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
        'training-v2-canary', repeat('e', 64),
        ARRAY[
          'hu_cash_BB_100bb_AsKd2c',
          'turn_hu_cash_BB_100bb_AsKd2cAh'
        ]
      ) state
      WHERE state.admission_mode = 'bounded_canary'
        AND state.partition_count = 2
        AND state.partition_index = 1
        AND state.canary_authorized
        AND state.canary_target_role IN ('parent', 'child')
        AND state.authorized_node IS NOT NULL
        AND state.authorized_hero_position = 'BB') <> 2 THEN
    RAISE EXCEPTION 'caller-bound canary authority was not provable before solve';
  END IF;
  parent_matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["As","Kd","2c"]'::jsonb,
    'r:0', 'OOP', 'BB', 'BTN', 100
  );
  child_matrix := pg_temp.complete_solver_matrix(
    'BB', 'turn', '["As","Kd","2c","Ah"]'::jsonb,
    'r:0:c:b412:c:Ah', 'OOP', 'BB', 'BTN', 100
  );
  child_matrix := jsonb_set(child_matrix, '{actions}', jsonb_build_array(
    jsonb_build_object('code', 'c', 'key', 'check', 'size_pct', 0),
    jsonb_build_object(
      'code', 'b1442', 'key', 'bet_chips_1442', 'size_chips', 1442,
      'size_semantics', 'cumulative_postflop_contribution_target'
    )
  ));
  child_matrix := jsonb_set(child_matrix, '{frequencies}', jsonb_build_object(
    'c', child_matrix -> 'frequencies' -> 'c',
    'b1442', child_matrix -> 'frequencies' -> 'b525'
  ));
  third_matrix := pg_temp.complete_solver_matrix(
    'BB', 'flop', '["9s","8h","7d"]'::jsonb,
    'r:0', 'OOP', 'BB', 'BTN', 100
  );

  PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
    'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2-canary', repeat('e', 64),
    '94000000-0000-4000-8000-000000000001', signed_at, repeat('5', 64),
    pg_temp.worker_artifact(
      'c1000000-0000-4000-8000-000000000001',
      'hu_cash_BB_100bb_AsKd2c', parent_matrix, signed_at
    )
  );
  PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
    'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2-canary', repeat('e', 64),
    '94000000-0000-4000-8000-000000000002', signed_at, repeat('6', 64),
    pg_temp.worker_artifact(
      'c2000000-0000-4000-8000-000000000002',
      'turn_hu_cash_BB_100bb_AsKd2cAh', child_matrix, signed_at
    )
  );

  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      '94000000-0000-4000-8000-000000000003', signed_at, repeat('7', 64),
      pg_temp.worker_artifact(
        'c3000000-0000-4000-8000-000000000003',
        'hu_cash_BB_100bb_9s8h7d', third_matrix, signed_at
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    third_blocked := SQLERRM = 'SOLVER_WORKER_CANARY_TARGET_NOT_AUTHORIZED';
  END;

  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      '94000000-0000-4000-8000-000000000004', signed_at, repeat('8', 64),
      pg_temp.worker_artifact(
        'c1000000-0000-4000-8000-000000000001',
        'hu_cash_BB_100bb_AsKd2c',
        jsonb_set(parent_matrix, '{node}', '"r:0:c"'::jsonb), signed_at
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    wrong_node_blocked := SQLERRM = 'SOLVER_WORKER_CANARY_TARGET_NOT_AUTHORIZED';
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      '94000000-0000-4000-8000-000000000005', signed_at, repeat('9', 64),
      pg_temp.worker_artifact(
        'c1000000-0000-4000-8000-000000000001',
        'hu_cash_BB_100bb_AsKd2c',
        jsonb_set(parent_matrix, '{position}', '"CO"'::jsonb), signed_at
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    wrong_position_blocked :=
      SQLERRM = 'SOLVER_WORKER_CANARY_TARGET_NOT_AUTHORIZED';
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      '94000000-0000-4000-8000-000000000006', signed_at, repeat('a', 64),
      pg_temp.worker_artifact(
        'c3000000-0000-4000-8000-000000000003',
        'hu_cash_BB_100bb_AsKd2c', parent_matrix, signed_at
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    wrong_uuid_blocked :=
      SQLERRM = 'SOLVER_WORKER_CANARY_TARGET_NOT_AUTHORIZED';
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      '94000000-0000-4000-8000-000000000007', signed_at, repeat('b', 64),
      pg_temp.worker_artifact(
        'c1000000-0000-4000-8000-000000000001',
        'hu_cash_BB_100bb_9s8h7d', third_matrix, signed_at
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    wrong_scenario_blocked :=
      SQLERRM = 'SOLVER_WORKER_CANARY_TARGET_NOT_AUTHORIZED';
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      '94000000-0000-4000-8000-000000000008', signed_at, repeat('c', 64),
      pg_temp.worker_artifact(
        'c1000000-0000-4000-8000-000000000001',
        'hu_cash_BB_100bb_AsKd2c',
        jsonb_set(parent_matrix, '{street}', '"turn"'::jsonb), signed_at
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    wrong_street_blocked :=
      SQLERRM = 'SOLVER_WORKER_CANARY_TARGET_NOT_AUTHORIZED';
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      '94000000-0000-4000-8000-000000000009', signed_at, repeat('d', 64),
      pg_temp.worker_artifact(
        'c1000000-0000-4000-8000-000000000001',
        'hu_cash_BB_100bb_AsKd2c', parent_matrix, signed_at
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    wrong_machine_blocked := SQLERRM = 'SOLVER_WORKER_INGEST_SCOPE_MISSING';
  END;

  BEGIN
    UPDATE public.training_solver_ingest_scopes
    SET admission_mode = 'backlog', partition_count = NULL,
        partition_index = NULL
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-canary'
      AND manifest_checksum = repeat('e', 64);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    scope_downgrade_blocked :=
      SQLERRM = 'TRAINING_SOLVER_INGEST_SCOPE_IMMUTABLE';
  END;
  BEGIN
    UPDATE public.training_solver_bounded_canary_targets
    SET node = 'r:0:c'
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-canary'
      AND target_role = 'parent';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    target_mutation_blocked :=
      SQLERRM = 'TRAINING_SOLVER_CANARY_TARGETS_IMMUTABLE';
  END;
  BEGIN
    UPDATE public.training_solver_bounded_canary_targets
    SET machine_id = 'M1',
        manifest_version = 'training-v2-conflict',
        manifest_checksum = repeat('d', 64)
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-canary'
      AND manifest_checksum = repeat('e', 64)
      AND target_role = 'parent';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    target_move_blocked :=
      SQLERRM = 'TRAINING_SOLVER_CANARY_TARGETS_IMMUTABLE';
  END;

  IF NOT third_blocked OR NOT wrong_node_blocked OR NOT wrong_position_blocked
     OR NOT wrong_uuid_blocked OR NOT wrong_scenario_blocked
     OR NOT wrong_street_blocked OR NOT wrong_machine_blocked
     OR NOT scope_downgrade_blocked OR NOT target_mutation_blocked
     OR NOT target_move_blocked
     OR (SELECT count(*)
         FROM public.training_solver_artifact_catalog
         WHERE artifact_id IN (
           'c1000000-0000-4000-8000-000000000001',
           'c2000000-0000-4000-8000-000000000002'
         )) <> 2
     OR EXISTS (
       SELECT 1 FROM public.solved_spots_gold
       WHERE id = 'c3000000-0000-4000-8000-000000000003'
         AND strategy_matrix_v2 IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.training_solver_worker_receipts
       WHERE machine_id = 'M2'
         AND request_nonce = '94000000-0000-4000-8000-000000000003'
     )
     OR EXISTS (
       SELECT 1 FROM public.training_solver_worker_receipts
       WHERE machine_id = 'M2'
         AND request_nonce IN (
           '94000000-0000-4000-8000-000000000004',
           '94000000-0000-4000-8000-000000000005',
           '94000000-0000-4000-8000-000000000006',
           '94000000-0000-4000-8000-000000000007',
           '94000000-0000-4000-8000-000000000008',
           '94000000-0000-4000-8000-000000000009'
         )
     )
     OR (SELECT count(*)
         FROM public.training_solver_worker_row_states_v2(
           'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
           'training-v2-canary', repeat('e', 64),
           ARRAY[
             'hu_cash_BB_100bb_AsKd2c',
             'turn_hu_cash_BB_100bb_AsKd2cAh'
           ]
         ) state
         WHERE state.canary_authorized
           AND state.admitted
           AND state.node = state.authorized_node
           AND state.hero_position = state.authorized_hero_position) <> 2
     THEN
    RAISE EXCEPTION 'bounded canary authority admitted an unauthorized third artifact';
  END IF;
END;
$bounded_canary_ingest_behavior$;

UPDATE public.training_solver_provenance_authority
SET retired_at = clock_timestamp()
WHERE machine_id = 'M2'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2-canary'
  AND manifest_checksum = repeat('e', 64)
  AND retired_at IS NULL;
DO $bounded_canary_retirement_behavior$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.training_solver_worker_row_states_v2(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-canary', repeat('e', 64),
      ARRAY[
        'hu_cash_BB_100bb_AsKd2c',
        'turn_hu_cash_BB_100bb_AsKd2cAh'
      ]
    ) state
    WHERE state.admitted OR state.canary_authorized
  ) OR EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id IN (
      'c1000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000002'
    )
  ) THEN
    RAISE EXCEPTION 'retired canary authority remained authorized or admitted';
  END IF;
END;
$bounded_canary_retirement_behavior$;

DO $retired_scope_cannot_reactivate$
DECLARE
  reactivation_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.training_solver_provenance_authority
    SET retired_at = NULL
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-canary'
      AND manifest_checksum = repeat('e', 64);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    reactivation_blocked :=
      SQLERRM = 'TRAINING_SOLVER_PROVENANCE_RETIREMENT_IMMUTABLE';
  END;
  IF NOT reactivation_blocked THEN
    RAISE EXCEPTION 'retired bounded canary could be reactivated';
  END IF;
END;
$retired_scope_cannot_reactivate$;

-- A future incomplete authority remains held. It cannot activate without two
-- targets and a migration rerun must never silently broaden it to backlog.
INSERT INTO public.training_solver_provenance_authority (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts, approved_by
)
SELECT
  'M2', solver_version, solver_binary_checksum, pipeline_commit,
  'training-v2-held', repeat('f', 64), source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts,
  'phase6-disposable-postgres-verifier'
FROM public.training_solver_provenance_authority
WHERE machine_id = 'M1'
  AND manifest_version = 'training-v2'
  AND manifest_checksum = repeat('c', 64);
DO $incomplete_scope_behavior$
DECLARE
  zero_target_activation_blocked boolean := false;
  one_target_activation_blocked boolean := false;
  invalid_lineage_activation_blocked boolean := false;
  third_target_blocked boolean := false;
  nonpreexisting_target_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.training_solver_bounded_canary_targets (
      machine_id, solver_version, solver_binary_checksum, pipeline_commit,
      manifest_version, manifest_checksum, target_role, artifact_id,
      scenario_hash, street, node, hero_position, approved_by
    ) VALUES (
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-held', repeat('f', 64), 'parent',
      'd1000000-0000-4000-8000-000000000001',
      'hu_cash_BB_100bb_5s6s7s', 'flop', 'r:0', 'BB',
      'phase6-disposable-postgres-verifier'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    nonpreexisting_target_blocked :=
      SQLERRM = 'TRAINING_SOLVER_CANARY_TARGET_NOT_PREEXISTING';
  END;
  BEGIN
    UPDATE public.training_solver_ingest_scopes
    SET admission_mode = 'bounded_canary', partition_count = 2,
        partition_index = 1
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-held'
      AND manifest_checksum = repeat('f', 64);
  EXCEPTION WHEN check_violation THEN
    zero_target_activation_blocked :=
      SQLERRM = 'TRAINING_SOLVER_INGEST_SCOPE_TARGET_SET_INVALID';
  END;
  INSERT INTO public.training_solver_bounded_canary_targets (
    machine_id, solver_version, solver_binary_checksum, pipeline_commit,
    manifest_version, manifest_checksum, target_role, artifact_id,
    scenario_hash, street, node, hero_position, approved_by
  ) VALUES (
    'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2-held', repeat('f', 64), 'parent',
    'c3000000-0000-4000-8000-000000000003',
    'hu_cash_BB_100bb_9s8h7d', 'flop', 'r:0', 'BB',
    'phase6-disposable-postgres-verifier'
  );
  BEGIN
    UPDATE public.training_solver_ingest_scopes
    SET admission_mode = 'bounded_canary', partition_count = 2,
        partition_index = 1
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-held'
      AND manifest_checksum = repeat('f', 64);
  EXCEPTION WHEN check_violation THEN
    one_target_activation_blocked :=
      SQLERRM = 'TRAINING_SOLVER_INGEST_SCOPE_TARGET_SET_INVALID';
  END;
  INSERT INTO public.training_solver_bounded_canary_targets (
    machine_id, solver_version, solver_binary_checksum, pipeline_commit,
    manifest_version, manifest_checksum, target_role, artifact_id,
    scenario_hash, street, node, hero_position, approved_by
  ) VALUES (
    'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2-held', repeat('f', 64), 'child',
    'c2000000-0000-4000-8000-000000000002',
    'turn_hu_cash_BB_100bb_AsKd2cAh', 'turn',
    'r:0:c:b412:c:Ah', 'BB', 'phase6-disposable-postgres-verifier'
  );
  BEGIN
    UPDATE public.training_solver_ingest_scopes
    SET admission_mode = 'bounded_canary', partition_count = 2,
        partition_index = 1
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-held'
      AND manifest_checksum = repeat('f', 64);
  EXCEPTION WHEN check_violation THEN
    invalid_lineage_activation_blocked :=
      SQLERRM = 'TRAINING_SOLVER_CANARY_LINEAGE_INVALID';
  END;
  DELETE FROM public.training_solver_bounded_canary_targets
  WHERE machine_id = 'M2'
    AND manifest_version = 'training-v2-held'
    AND manifest_checksum = repeat('f', 64)
    AND target_role = 'child';
  INSERT INTO public.training_solver_bounded_canary_targets (
    machine_id, solver_version, solver_binary_checksum, pipeline_commit,
    manifest_version, manifest_checksum, target_role, artifact_id,
    scenario_hash, street, node, hero_position, approved_by
  ) VALUES (
    'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
    'training-v2-held', repeat('f', 64), 'child',
    'c4000000-0000-4000-8000-000000000004',
    'turn_hu_cash_BB_100bb_9s8h7d2c', 'turn',
    'r:0:c:b412:c:2c', 'BB', 'phase6-disposable-postgres-verifier'
  );
  BEGIN
    INSERT INTO public.training_solver_bounded_canary_targets (
      machine_id, solver_version, solver_binary_checksum, pipeline_commit,
      manifest_version, manifest_checksum, target_role, artifact_id,
      scenario_hash, street, node, hero_position, approved_by
    ) VALUES (
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-held', repeat('f', 64), 'parent',
      'c3000000-0000-4000-8000-000000000003',
      'hu_cash_BB_100bb_9s8h7d', 'flop', 'r:0', 'BB',
      'phase6-disposable-postgres-verifier'
    );
  EXCEPTION WHEN unique_violation THEN third_target_blocked := true;
  END;
  IF NOT nonpreexisting_target_blocked
     OR NOT zero_target_activation_blocked
     OR NOT one_target_activation_blocked
     OR NOT invalid_lineage_activation_blocked
     OR NOT third_target_blocked
     OR NOT EXISTS (
    SELECT 1 FROM public.training_solver_ingest_scopes
    WHERE machine_id = 'M2'
      AND manifest_version = 'training-v2-held'
      AND manifest_checksum = repeat('f', 64)
      AND admission_mode = 'held'
  ) THEN
    RAISE EXCEPTION 'incomplete canary scope did not remain fail-closed';
  END IF;
END;
$incomplete_scope_behavior$;

SET ROLE authenticated;
DO $$
DECLARE
  read_blocked boolean := false;
  authority_read_blocked boolean := false;
  analysis_execute_blocked boolean := false;
  candidate_execute_blocked boolean := false;
  insert_blocked boolean := false;
  update_blocked boolean := false;
  delete_blocked boolean := false;
  worker_receipt_read_blocked boolean := false;
  worker_claim_execute_blocked boolean := false;
  worker_ingest_execute_blocked boolean := false;
  worker_row_states_execute_blocked boolean := false;
  worker_row_states_v2_execute_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.training_solver_artifact_catalog LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN read_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_solver_provenance_authority LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN authority_read_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.analyze_spots_by_game_type(NULL, 1);
  EXCEPTION WHEN insufficient_privilege THEN analysis_execute_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_solver_spot_candidates_v1(
      '[{"game_type":"hu_cash","stack_depth":100}]'::jsonb,
      NULL, NULL, NULL, NULL, 12
    );
  EXCEPTION WHEN insufficient_privilege THEN candidate_execute_blocked := true;
  END;
  BEGIN
    INSERT INTO public.solved_spots_gold (
      scenario_hash, game_type, stack_depth, street
    ) VALUES ('browser-forgery', 'hu_cash', 100, 'flop');
  EXCEPTION WHEN insufficient_privilege THEN insert_blocked := true;
  END;
  BEGIN
    UPDATE public.solved_spots_gold SET quality_status = 'validated'
    WHERE id = '10000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN update_blocked := true;
  END;
  BEGIN
    DELETE FROM public.solved_spots_gold
    WHERE id = '10000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN delete_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_solver_worker_receipts LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN worker_receipt_read_blocked := true;
  END;
  BEGIN
    PERFORM public.training_claim_solver_worker_request_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64),
      '92000000-0000-4000-8000-000000000001', 'heartbeat', now(), repeat('4', 64)
    );
  EXCEPTION WHEN insufficient_privilege THEN worker_claim_execute_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64),
      '92000000-0000-4000-8000-000000000002', now(), repeat('5', 64), '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN worker_ingest_execute_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_solver_worker_row_states_v1(
      ARRAY['hu_cash_BB_100bb_KhQd2s']
    );
  EXCEPTION WHEN insufficient_privilege THEN worker_row_states_execute_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_solver_worker_row_states_v2(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64),
      ARRAY['hu_cash_BB_100bb_KhQd2s']
    );
  EXCEPTION WHEN insufficient_privilege THEN
    worker_row_states_v2_execute_blocked := true;
  END;
  IF NOT read_blocked THEN RAISE EXCEPTION 'authenticated could read the solver registry'; END IF;
  IF NOT authority_read_blocked THEN
    RAISE EXCEPTION 'authenticated could read the solver provenance authority';
  END IF;
  IF NOT analysis_execute_blocked THEN
    RAISE EXCEPTION 'authenticated could execute the 80 GB solver aggregate';
  END IF;
  IF NOT candidate_execute_blocked THEN
    RAISE EXCEPTION 'authenticated could execute the service-only solver candidate RPC';
  END IF;
  IF NOT insert_blocked OR NOT update_blocked OR NOT delete_blocked THEN
    RAISE EXCEPTION 'authenticated retained solver warehouse write access';
  END IF;
  IF NOT worker_receipt_read_blocked OR NOT worker_claim_execute_blocked
     OR NOT worker_ingest_execute_blocked OR NOT worker_row_states_execute_blocked
     OR NOT worker_row_states_v2_execute_blocked THEN
    RAISE EXCEPTION 'authenticated crossed the private solver worker ingress boundary';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE service_role;
DO $$
DECLARE
  catalog_write_blocked boolean := false;
  authority_read_blocked boolean := false;
  warehouse_truncate_blocked boolean := false;
  trigger_execute_blocked boolean := false;
  validator_execute_blocked boolean := false;
  analysis_execute_blocked boolean := false;
  candidate_rpc_succeeded boolean := false;
  warehouse_insert_blocked boolean := false;
  warehouse_update_blocked boolean := false;
  warehouse_delete_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.solved_spots_gold (
      id, scenario_hash, game_type, stack_depth, street
    ) VALUES (
      '50000000-0000-4000-8000-000000000005',
      'hu_cash_BB_100bb_AhKdQc', 'hu_cash', 100, 'flop'
    );
  EXCEPTION WHEN insufficient_privilege THEN warehouse_insert_blocked := true;
  END;
  BEGIN
    UPDATE public.solved_spots_gold SET quality_status = 'quarantined'
    WHERE id = '90000000-0000-4000-8000-000000000009';
  EXCEPTION WHEN insufficient_privilege THEN warehouse_update_blocked := true;
  END;
  BEGIN
    DELETE FROM public.solved_spots_gold
    WHERE id = '90000000-0000-4000-8000-000000000009';
  EXCEPTION WHEN insufficient_privilege THEN warehouse_delete_blocked := true;
  END;
  IF (
    SELECT count(*)
    FROM public.training_solver_spot_candidates_v1(
      '[
        {"game_type":"hu_cash","stack_depth":100},
        {"game_type":"hu_cash","stack_depth":100},
        {"game_type":"not-a-contract","stack_depth":1}
      ]'::jsonb,
      'BB', NULL, NULL, NULL, 1000,
      '90000000-0000-4000-8000-000000000009',
      'hu_cash_BB_100bb_KhQd2s', 'flop', 0
    ) candidate
    WHERE candidate.id = '90000000-0000-4000-8000-000000000009'
  ) = 1 THEN
    candidate_rpc_succeeded := true;
  END IF;
  BEGIN
    INSERT INTO public.training_solver_artifact_catalog (
      artifact_id, scenario_hash, game_type, stack_depth, street, hero_position
    ) VALUES (
      '10000000-0000-4000-8000-000000000001',
      'service-catalog-forgery', 'hu_cash', 100, 'flop', 'BB'
    );
  EXCEPTION WHEN insufficient_privilege THEN catalog_write_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_solver_provenance_authority LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN authority_read_blocked := true;
  END;
  BEGIN
    TRUNCATE public.solved_spots_gold CASCADE;
  EXCEPTION WHEN insufficient_privilege THEN warehouse_truncate_blocked := true;
  END;
  BEGIN
    PERFORM public.fn_training_solver_artifact_catalog_sync_v1();
  EXCEPTION WHEN insufficient_privilege THEN trigger_execute_blocked := true;
  END;
  BEGIN
    PERFORM public.fn_training_solver_artifact_servable_v2(
      NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN validator_execute_blocked := true;
  END;
  BEGIN
    PERFORM 1 FROM public.analyze_spots_by_game_type(NULL, 1);
  EXCEPTION WHEN insufficient_privilege THEN analysis_execute_blocked := true;
  END;
  IF NOT catalog_write_blocked THEN
    RAISE EXCEPTION 'service role could write the trigger-owned catalog directly';
  END IF;
  IF NOT authority_read_blocked THEN
    RAISE EXCEPTION 'service role could read the migration-owned provenance authority';
  END IF;
  IF NOT warehouse_truncate_blocked THEN
    RAISE EXCEPTION 'service role retained warehouse TRUNCATE privilege';
  END IF;
  IF NOT trigger_execute_blocked THEN
    RAISE EXCEPTION 'service role could directly execute the catalog trigger function';
  END IF;
  IF NOT validator_execute_blocked THEN
    RAISE EXCEPTION 'service role could directly execute the catalog admission validator';
  END IF;
  IF NOT analysis_execute_blocked THEN
    RAISE EXCEPTION 'service role retained the retired warehouse analysis aggregate';
  END IF;
  IF NOT candidate_rpc_succeeded THEN
    RAISE EXCEPTION 'service-only bounded solver candidate RPC did not return the valid exact pair';
  END IF;
  IF NOT warehouse_insert_blocked OR NOT warehouse_update_blocked
     OR NOT warehouse_delete_blocked THEN
    RAISE EXCEPTION 'service role retained direct warehouse DML outside signed ingest';
  END IF;
END;
$$;
RESET ROLE;

-- Exercise the retirement/read TOCTOU boundary on a dedicated authority. The
-- canonical M1 training-v2 authority must stay active for every later verifier
-- probe; production retirement is one-way and must never need fixture reset.
BEGIN;
INSERT INTO public.training_solver_provenance_authority (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts, approved_by
)
SELECT
  'M2', solver_version, solver_binary_checksum, pipeline_commit,
  'training-v2-toctou', repeat('6', 64), source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts,
  'phase6-disposable-postgres-toctou-verifier'
FROM public.training_solver_provenance_authority
WHERE machine_id = 'M1'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2'
  AND manifest_checksum = repeat('c', 64);
UPDATE public.training_solver_ingest_scopes
SET admission_mode = 'backlog', configured_at = now(),
    configured_by = 'phase6-disposable-postgres-toctou-verifier'
WHERE machine_id = 'M2'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2-toctou'
  AND manifest_checksum = repeat('6', 64)
  AND admission_mode = 'held';
COMMIT;

INSERT INTO public.solved_spots_gold (
  id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2,
  solver_version, solver_binary_checksum, machine_id, pipeline_commit,
  manifest_version, manifest_checksum, source_artifact_checksum,
  quality_status, audited_at
)
SELECT
  '80000000-0000-4000-8000-000000000008',
  'hu_cash_BB_100bb_8h9hTh', 'hu_cash', 100, 'flop', matrix.value,
  'PioSOLVER 3.0', repeat('a', 64), 'M2', repeat('b', 40),
  'training-v2-toctou', repeat('6', 64),
  pg_temp.solver_checksum('hu_cash_BB_100bb_8h9hTh', matrix.value),
  'validated', now()
FROM (
  VALUES (pg_temp.complete_solver_matrix(
    'BB', 'flop', '["8h","9h","Th"]'::jsonb
  ))
) AS matrix(value);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '80000000-0000-4000-8000-000000000008'
  ) THEN
    RAISE EXCEPTION 'approved full artifact did not enter the solver registry';
  END IF;
END $$;
ALTER TABLE public.training_solver_provenance_authority
  DISABLE TRIGGER training_solver_provenance_authority_invalidate_v1;
UPDATE public.training_solver_provenance_authority
SET retired_at = now()
WHERE machine_id = 'M2'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2-toctou'
  AND manifest_checksum = repeat('6', 64);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '80000000-0000-4000-8000-000000000008'
  ) THEN
    RAISE EXCEPTION 'retirement TOCTOU fixture failed to retain a deliberately stale catalog row';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.training_solver_spot_candidates_v1(
      '[{"game_type":"hu_cash","stack_depth":100}]'::jsonb,
      NULL, NULL, NULL, NULL, 12
    ) candidate
    WHERE candidate.id = '80000000-0000-4000-8000-000000000008'
  ) THEN
    RAISE EXCEPTION 'candidate RPC served a catalog row after provenance retirement';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.training_solver_worker_row_states_v1(
      ARRAY['hu_cash_BB_100bb_8h9hTh']
    ) state
    WHERE state.id = '80000000-0000-4000-8000-000000000008'
      AND state.admitted
  ) THEN
    RAISE EXCEPTION 'worker resume state trusted a stale catalog row after authority retirement';
  END IF;
END $$;
ALTER TABLE public.training_solver_provenance_authority
  ENABLE TRIGGER training_solver_provenance_authority_invalidate_v1;
UPDATE public.training_solver_provenance_authority
SET retired_at = retired_at
WHERE machine_id = 'M2'
  AND solver_version = 'PioSOLVER 3.0'
  AND solver_binary_checksum = repeat('a', 64)
  AND pipeline_commit = repeat('b', 40)
  AND manifest_version = 'training-v2-toctou'
  AND manifest_checksum = repeat('6', 64);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.training_solver_artifact_catalog
    WHERE artifact_id = '80000000-0000-4000-8000-000000000008'
  ) THEN
    RAISE EXCEPTION 'retired solver provenance left a serving catalog row';
  END IF;
END $$;

DO $retired_worker_replay$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.training_ingest_solver_artifact_v1(
      'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2-toctou', repeat('6', 64),
      '91000000-0000-4000-8000-000000000001', now(), repeat('d', 64), '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'SOLVER_WORKER_INGEST_SCOPE_MISSING';
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'retired worker authority could replay an ingest receipt';
  END IF;
END;
$retired_worker_replay$;

SELECT jsonb_build_object(
  'historicalRowsInferred', false,
  'validatedWritesRegistered', true,
  'outOfContractPairsBlocked', true,
  'artifactChecksumBound', true,
  'crossRuntimeCanonicalVectors', true,
  'serviceAclLeastPrivilege', true,
  'serviceDirectWarehouseDmlBlocked', true,
  'completePayloadAdmissionRequired', true,
  'illegalNodeGrammarBlocked', true,
  'completeDecisionActionsRequired', true,
  'boardDeadStrategyMassBlocked', true,
  'boundedCandidateRpcPassed', true,
  'signedWorkerIngressPassed', true,
  'workerNonceReplayIdempotent', true,
  'workerNonceConflictBlocked', true,
  'workerStaleRequestBlocked', true,
  'workerIcmFailClosed', true,
  'workerQuarantinedReplayBlocked', true,
  'workerReceiptAclPrivate', true,
  'workerBoardPageIndexPresent', true,
  'workerReceiptRetentionBounded', true,
  'workerFailedWriteReceiptRolledBack', true,
  'workerRetiredAuthorityReplayBlocked', true,
  'workerUnscopedLegacyAclOwnerOnly', NOT (
    has_function_privilege(
      'solver_unscoped_acl_probe',
      'public.training_ingest_solver_artifact_unscoped_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'solver_unscoped_acl_delegate',
      'public.training_ingest_solver_artifact_unscoped_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
      'EXECUTE'
    )
  ),
  'workerBoundedCanaryExactPairPassed', true,
  'workerBacklogScopeRemainsUnbounded', true,
  'workerBoundedCanaryThirdBlocked', true,
  'workerBoundedCanarySameMachineConflictBlocked', true,
  'workerBoundedCanaryCrossMachineIndependent', true,
  'workerRetiredScopeReactivationBlocked', true,
  'workerBoundedCanaryNodePositionBound', true,
  'workerBoundedCanaryTargetMoveBlocked', true,
  'workerBoundedCanaryTransitionsImmutable', true,
  'workerBoundedCanaryPreSpawnAuthorityPassed', true,
  'workerFutureHeldScopeReapplySafe', true,
  'retirementSnapshotJoinBlocked', true,
  'provenanceAllowlistRequired', true,
  'provenanceRetirementInvalidates', true,
  'authenticatedWarehouseAggregateBlocked', true,
  'incompatibleCatalogRejected', true,
  'authenticatedWarehouseWritesBlocked', true,
  'legacyPublicReadPolicyRemoved', true,
  'incompatibleAuthorityRejected', true,
  'invalidationsRemoved', true,
  'parentDeletesCascaded', true,
  'authenticatedReadBlocked', true,
  'catalogRows', (SELECT count(*) FROM public.training_solver_artifact_catalog)
) AS training_solver_catalog_evidence;
`;

const postgresBin = resolvePostgresBin();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'sp-training-solver-catalog-'));
const dataDir = path.join(tempRoot, 'data');
const port = await reservePort();
let started = false;
const tool = (name) => path.join(postgresBin, name);
const connection = ['-h', tempRoot, '-p', String(port), '-d', 'phase6_solver_catalog'];

try {
  command(tool('initdb'), [
    '-D', dataDir, '-A', 'trust', '--locale=en_US.UTF-8',
  ], { quiet: true });
  command(tool('pg_ctl'), [
    '-D', dataDir,
    '-o', `-p ${port} -k ${tempRoot}`,
    '-l', path.join(tempRoot, 'postgres.log'),
    '-w',
    'start',
  ], { quiet: true });
  started = true;
  command(tool('createdb'), ['-h', tempRoot, '-p', String(port), 'phase6_solver_catalog'], { quiet: true });
  const environment = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`SELECT current_setting('server_version_num'),
      current_setting('server_encoding'),
      datcollate
    FROM pg_catalog.pg_database
    WHERE datname = current_database();`,
    quiet: true,
  }).stdout.trim().split('|');
  if (
    !/^17\d{4}$/.test(environment[0] || '')
    || environment[1] !== 'UTF8'
    || environment[2] !== 'en_US.UTF-8'
  ) {
    throw new Error(`Solver verifier requires PostgreSQL 17, UTF8, en_US.UTF-8; received ${environment.join('|')}`);
  }
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: BASELINE_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: PRODUCTION_DEFAULT_ACL_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', HARDENING_MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', HARDENING_MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', WORKER_INGEST_MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', WORKER_INGEST_MIGRATION], {
    quiet: true,
  });
  // ALTER FUNCTION RENAME preserves ACLs. Seed a custom historical executor
  // before the bounded-canary migration renames the worker ingest RPC, then
  // require the migration to make the internal implementation owner-only.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`
      CREATE ROLE solver_unscoped_acl_probe NOLOGIN;
      CREATE ROLE solver_unscoped_acl_delegate NOLOGIN;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO solver_unscoped_acl_probe;
      GRANT EXECUTE ON FUNCTION public.training_ingest_solver_artifact_v1(
        text, text, text, text, text, text, uuid, timestamptz, text, jsonb
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      SET ROLE solver_unscoped_acl_probe;
      GRANT EXECUTE ON FUNCTION public.training_ingest_solver_artifact_v1(
        text, text, text, text, text, text, uuid, timestamptz, text, jsonb
      ) TO solver_unscoped_acl_delegate;
      RESET ROLE;
    `,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', BOUNDED_CANARY_MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', BOUNDED_CANARY_MIGRATION], {
    quiet: true,
  });
  // Seed nonstandard historical grants on every superseded worker entrypoint.
  // The scope-binding migration must remove these as well as the standard
  // service/browser grants; revoking only named application roles is not safe.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`
      GRANT EXECUTE ON FUNCTION public.training_claim_solver_worker_request_v1(
        text,text,text,text,text,text,uuid,text,timestamptz,text
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_ingest_solver_artifact_v1(
        text,text,text,text,text,text,uuid,timestamptz,text,jsonb
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_solver_worker_row_states_v1(text[])
        TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_solver_worker_row_states_v2(
        text,text,text,text,text,text,text[]
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_solver_worker_board_page_v1(
        text,integer,text,text,text,integer
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT UPDATE ON TABLE public.solver_status
        TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT INSERT (machine_id) ON TABLE public.solver_status
        TO solver_unscoped_acl_probe;
      SET ROLE solver_unscoped_acl_probe;
      GRANT EXECUTE ON FUNCTION public.training_claim_solver_worker_request_v1(
        text,text,text,text,text,text,uuid,text,timestamptz,text
      ) TO solver_unscoped_acl_delegate;
      GRANT UPDATE ON TABLE public.solver_status
        TO solver_unscoped_acl_delegate;
      RESET ROLE;
    `,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', OPERATION_SCOPE_MIGRATION], {
    quiet: true,
  });
  // Prove both fresh-function default grants and ACLs preserved by
  // CREATE OR REPLACE are normalized. The downstream delegated grant proves
  // the migration's CASCADE revocation does not leave inherited execution.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        REVOKE EXECUTE ON FUNCTIONS FROM solver_unscoped_acl_probe;
      GRANT EXECUTE ON FUNCTION public.training_claim_solver_worker_request_v2(
        text,text,text,text,text,text,text,uuid,text,timestamptz,text
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_ingest_solver_artifact_v2(
        text,text,text,text,text,text,text,uuid,timestamptz,text,jsonb
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_solver_worker_row_states_v3(
        text,text,text,text,text,text,text,text[]
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_solver_worker_heartbeat_v1(
        text,text,text,text,text,text,text,text,text,integer,integer,integer,text
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.training_solver_worker_board_page_v2(
        text,text,text,text,text,text,text,text,integer,text,text,text,integer
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      GRANT EXECUTE ON FUNCTION public.fn_training_solver_operation_scope_guard_v1(
        text,text,text,text,text,text,text
      ) TO solver_unscoped_acl_probe WITH GRANT OPTION;
      SET ROLE solver_unscoped_acl_probe;
      GRANT EXECUTE ON FUNCTION public.training_claim_solver_worker_request_v2(
        text,text,text,text,text,text,text,uuid,text,timestamptz,text
      ) TO solver_unscoped_acl_delegate;
      RESET ROLE;
    `,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', OPERATION_SCOPE_MIGRATION], {
    quiet: true,
  });
  const scopedAclExact = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      WITH signatures(signature) AS (
        VALUES
          ('public.training_claim_solver_worker_request_v2(text,text,text,text,text,text,text,uuid,text,timestamp with time zone,text)'),
          ('public.training_ingest_solver_artifact_v2(text,text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'),
          ('public.training_solver_worker_row_states_v3(text,text,text,text,text,text,text,text[])'),
          ('public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)'),
          ('public.training_solver_worker_board_page_v2(text,text,text,text,text,text,text,text,integer,text,text,text,integer)'),
          ('public.fn_training_solver_operation_scope_guard_v1(text,text,text,text,text,text,text)')
      ), probe_roles(role_name) AS (
        VALUES ('solver_unscoped_acl_probe'), ('solver_unscoped_acl_delegate')
      )
      SELECT NOT EXISTS (
        SELECT 1
        FROM signatures
        CROSS JOIN probe_roles
        WHERE pg_catalog.has_function_privilege(
          probe_roles.role_name, signatures.signature, 'EXECUTE'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc function_row
        CROSS JOIN LATERAL pg_catalog.aclexplode(function_row.proacl) expanded_acl
        JOIN pg_catalog.pg_roles role_row
          ON role_row.oid = expanded_acl.grantee
        WHERE function_row.oid = ANY (ARRAY[
          'public.training_claim_solver_worker_request_v2(text,text,text,text,text,text,text,uuid,text,timestamp with time zone,text)'::regprocedure::oid,
          'public.training_ingest_solver_artifact_v2(text,text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)'::regprocedure::oid,
          'public.training_solver_worker_row_states_v3(text,text,text,text,text,text,text,text[])'::regprocedure::oid,
          'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)'::regprocedure::oid,
          'public.training_solver_worker_board_page_v2(text,text,text,text,text,text,text,text,integer,text,text,text,integer)'::regprocedure::oid
        ])
          AND role_row.rolname = 'service_role'
          AND expanded_acl.privilege_type = 'EXECUTE'
          AND expanded_acl.is_grantable
      );
    `,
    quiet: true,
  }).stdout.trim();
  if (scopedAclExact !== 't') {
    throw new Error('Operation-scope migration preserved an unexpected scoped RPC grant.');
  }
  const unscopedAclOwnerOnly = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      SELECT NOT (
        has_function_privilege(
          'solver_unscoped_acl_probe',
          'public.training_ingest_solver_artifact_unscoped_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
          'EXECUTE'
        )
        OR has_function_privilege(
          'solver_unscoped_acl_delegate',
          'public.training_ingest_solver_artifact_unscoped_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
          'EXECUTE'
        )
      );
    `,
    quiet: true,
  }).stdout.trim();
  if (unscopedAclOwnerOnly !== 't') {
    throw new Error('Bounded-canary migration preserved a custom-role unscoped ingest grant.');
  }
  // The fixture's standalone scenario-hash index is intentionally cheaper on
  // the tiny disposable table. Temporarily hide it so the plan assertion
  // proves the production board-page keyset can use its required four-key
  // index; restore it before the separate row-state plan check below.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: 'DROP INDEX public.idx_god_mode_hash;\n',
    quiet: true,
  });
  const boardPagePlan = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...connection,
  ], {
    input: String.raw`
      SET enable_seqscan = off;
      SET enable_bitmapscan = off;
      EXPLAIN (COSTS OFF)
      SELECT DISTINCT artifact.scenario_hash
      FROM public.solved_spots_gold artifact
      WHERE artifact.game_type = 'hu_cash'
        AND artifact.stack_depth = 100
        AND artifact.street = 'flop'
        AND artifact.scenario_hash >= 'hu_cash_BB_100bb_'
        AND artifact.scenario_hash < 'hu_cash_BB_100bb_Z'
        AND artifact.scenario_hash > 'hu_cash_BB_100bb_2c3d4h'
      ORDER BY artifact.scenario_hash
      LIMIT 500;
    `,
    quiet: true,
  }).stdout;
  if (/Seq Scan/i.test(boardPagePlan)
      || !/idx_ssg_next_street/i.test(boardPagePlan)
      || !/\bUnique\b/i.test(boardPagePlan)) {
    throw new Error(`Bounded board-page query did not use the exact four-key index.\n${boardPagePlan}`);
  }
  const boardPageRows = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      SELECT scenario_hash
      FROM public.training_solver_worker_board_page_v1(
        'hu_cash', 100, 'flop', 'BB', NULL, 500
      )
      ORDER BY scenario_hash;
    `,
    quiet: true,
  }).stdout.trim().split('\n').filter(Boolean);
  const expectedBoardPageRows = [
    'hu_cash_BB_100bb_2c3d4h',
    'hu_cash_BB_100bb_9s8h7d',
    'hu_cash_BB_100bb_AsKd2c',
    'hu_cash_BB_100bb_KhQd2s',
  ];
  if (JSON.stringify(boardPageRows) !== JSON.stringify(expectedBoardPageRows)) {
    throw new Error([
      'Bounded board-page RPC did not de-duplicate canonical warehouse hashes.',
      `Expected: ${expectedBoardPageRows.join(', ')}`,
      `Actual: ${boardPageRows.join(', ')}`,
    ].join('\n'));
  }
  const readBoardPage = (afterScenario) => command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      SELECT scenario_hash
      FROM public.training_solver_worker_board_page_v1(
        'hu_cash', 100, 'flop', 'BB', ${afterScenario === null
    ? 'NULL'
    : `'${afterScenario}'`}, 1
      );
    `,
    quiet: true,
  }).stdout.trim().split('\n').filter(Boolean);
  const traversedBoardPageRows = [];
  let afterBoardScenario = null;
  let terminalBoardPage = [];
  for (let page = 0; page <= expectedBoardPageRows.length; page += 1) {
    const rows = readBoardPage(afterBoardScenario);
    if (rows.length === 0) {
      terminalBoardPage = rows;
      break;
    }
    traversedBoardPageRows.push(...rows);
    afterBoardScenario = rows.at(-1);
  }
  if (JSON.stringify(traversedBoardPageRows)
        !== JSON.stringify(expectedBoardPageRows)
      || terminalBoardPage.length !== 0) {
    throw new Error([
      'Board-page keyset traversal skipped or duplicated a canonical hash.',
      `Rows: ${traversedBoardPageRows.join(', ')}`,
      `Terminal page: ${terminalBoardPage.join(', ')}`,
    ].join('\n'));
  }
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: 'CREATE INDEX idx_god_mode_hash ON public.solved_spots_gold (scenario_hash);\n',
    quiet: true,
  });
  const rowStatePlan = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...connection,
  ], {
    input: String.raw`
      SET enable_seqscan = off;
      SET enable_bitmapscan = off;
      EXPLAIN (COSTS OFF)
      SELECT id, scenario_hash, game_type, stack_depth, street
      FROM public.solved_spots_gold
      WHERE scenario_hash = 'hu_cash_BB_100bb_KhQd2s';
    `,
    quiet: true,
  }).stdout;
  if (/Seq Scan/i.test(rowStatePlan)
      || !/(?:idx_god_mode_hash|solved_spots_gold_scenario_hash_key)/i.test(rowStatePlan)) {
    throw new Error(`Worker row-state query did not use a standalone scenario-hash index.\n${rowStatePlan}`);
  }
  const evidence = command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: BEHAVIOR_SQL,
    quiet: true,
  });
  // Exercise the final, signed-scope-bound worker surface after the complete
  // predecessor behavior matrix has established one active M1 backlog and
  // pre-existing canary artifacts. Every rejection is checked for durable
  // non-mutation, not merely for an error string.
  const operationScopeEvidence = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      BEGIN;
      INSERT INTO public.training_solver_provenance_authority (
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum, source_combo_order_sha256,
        training_game_contracts_sha256, manifest_contracts, approved_by
      )
      SELECT
        'M1', solver_version, solver_binary_checksum, pipeline_commit,
        'training-v2-operation-held', repeat('7', 64),
        source_combo_order_sha256, training_game_contracts_sha256,
        manifest_contracts, 'phase6-operation-scope-verifier'
      FROM public.training_solver_provenance_authority
      WHERE machine_id = 'M1' AND manifest_version = 'training-v2'
        AND manifest_checksum = repeat('c', 64);

      INSERT INTO public.training_solver_provenance_authority (
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum, source_combo_order_sha256,
        training_game_contracts_sha256, manifest_contracts, approved_by
      )
      SELECT
        'M2', solver_version, solver_binary_checksum, pipeline_commit,
        'training-v2-operation-canary', repeat('8', 64),
        source_combo_order_sha256, training_game_contracts_sha256,
        manifest_contracts, 'phase6-operation-scope-verifier'
      FROM public.training_solver_provenance_authority
      WHERE machine_id = 'M1' AND manifest_version = 'training-v2'
        AND manifest_checksum = repeat('c', 64);

      INSERT INTO public.training_solver_bounded_canary_targets (
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum, target_role, artifact_id,
        scenario_hash, street, node, hero_position, approved_by
      ) VALUES (
        'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
        'training-v2-operation-canary', repeat('8', 64), 'parent',
        'c1000000-0000-4000-8000-000000000001',
        'hu_cash_BB_100bb_AsKd2c', 'flop', 'r:0', 'BB',
        'phase6-operation-scope-verifier'
      ), (
        'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
        'training-v2-operation-canary', repeat('8', 64), 'child',
        'c2000000-0000-4000-8000-000000000002',
        'turn_hu_cash_BB_100bb_AsKd2cAh', 'turn',
        'r:0:c:b412:c:Ah', 'BB', 'phase6-operation-scope-verifier'
      );
      UPDATE public.training_solver_ingest_scopes
      SET admission_mode = 'bounded_canary', partition_count = 2,
          partition_index = 1, configured_at = clock_timestamp(),
          configured_by = 'phase6-operation-scope-verifier'
      WHERE machine_id = 'M2'
        AND manifest_version = 'training-v2-operation-canary'
        AND manifest_checksum = repeat('8', 64)
        AND admission_mode = 'held';
      COMMIT;

      DO $operation_scope_behavior$
      DECLARE
        signed_at timestamptz := clock_timestamp();
        rejected_nonce uuid;
        before_matrix jsonb;
        before_status public.solver_status%ROWTYPE;
        replay_artifact jsonb;
        replay_receipt record;
        replay_signed_at timestamptz;
        board_canary_blocked boolean := false;
        board_mismatch_blocked boolean := false;
        row_subset_blocked boolean := false;
        row_duplicate_blocked boolean := false;
        row_oversize_blocked boolean := false;
        heartbeat_mismatch_blocked boolean := false;
        heartbeat_null_blocked boolean := false;
        ingest_mismatch_blocked boolean := false;
      BEGIN
        IF has_function_privilege(
             'service_role',
             'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
             'EXECUTE'
           )
           OR has_function_privilege(
             'service_role',
             'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
             'EXECUTE'
           )
           OR has_function_privilege(
             'service_role',
             'public.training_solver_worker_row_states_v2(text,text,text,text,text,text,text[])',
             'EXECUTE'
           )
           OR has_function_privilege(
             'service_role',
             'public.training_solver_worker_board_page_v1(text,integer,text,text,text,integer)',
             'EXECUTE'
           )
           OR has_function_privilege(
             'solver_unscoped_acl_probe',
             'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
             'EXECUTE'
           )
           OR has_function_privilege(
             'solver_unscoped_acl_delegate',
             'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
             'EXECUTE'
           ) THEN
          RAISE EXCEPTION 'superseded worker entrypoint retained execute privilege';
        END IF;
        IF NOT has_function_privilege(
             'service_role',
             'public.training_claim_solver_worker_request_v2(text,text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
             'EXECUTE'
           )
           OR NOT has_function_privilege(
             'service_role',
             'public.training_ingest_solver_artifact_v2(text,text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
             'EXECUTE'
           )
           OR NOT has_function_privilege(
             'service_role',
             'public.training_solver_worker_row_states_v3(text,text,text,text,text,text,text,text[])',
             'EXECUTE'
           )
           OR NOT has_function_privilege(
             'service_role',
             'public.training_solver_worker_board_page_v2(text,text,text,text,text,text,text,text,integer,text,text,text,integer)',
             'EXECUTE'
           )
           OR NOT has_function_privilege(
             'service_role',
             'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)',
             'EXECUTE'
           )
           OR has_function_privilege(
             'authenticated',
             'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)',
             'EXECUTE'
           )
           OR has_function_privilege(
             'solver_unscoped_acl_probe',
             'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)',
             'EXECUTE'
           )
           OR has_function_privilege(
             'service_role',
             'public.fn_training_solver_operation_scope_guard_v1(text,text,text,text,text,text,text)',
             'EXECUTE'
           )
           OR has_table_privilege(
             'solver_unscoped_acl_probe', 'public.solver_status',
             'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
           )
           OR has_any_column_privilege(
             'solver_unscoped_acl_probe', 'public.solver_status',
             'INSERT,UPDATE,REFERENCES'
           )
           OR has_table_privilege(
             'solver_unscoped_acl_delegate', 'public.solver_status',
             'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
           ) THEN
          RAISE EXCEPTION 'scoped worker entrypoint ACL contract failed';
        END IF;

        -- Exact active mode is required before a metadata nonce is consumed.
        IF NOT public.training_claim_solver_worker_request_v2(
             'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
             'training-v2', repeat('c', 64), 'backlog',
             '96000000-0000-4000-8000-000000000001', 'row_states',
             signed_at, repeat('1', 64)
           ) OR public.training_claim_solver_worker_request_v2(
             'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
             'training-v2', repeat('c', 64), 'backlog',
             '96000000-0000-4000-8000-000000000001', 'row_states',
             signed_at, repeat('1', 64)
           ) THEN
          RAISE EXCEPTION 'scope-bound nonce claim/replay contract failed';
        END IF;

        FOREACH rejected_nonce IN ARRAY ARRAY[
          '96000000-0000-4000-8000-000000000002'::uuid,
          '96000000-0000-4000-8000-000000000003'::uuid,
          '96000000-0000-4000-8000-000000000004'::uuid,
          '96000000-0000-4000-8000-000000000005'::uuid
        ] LOOP
          IF rejected_nonce = '96000000-0000-4000-8000-000000000002'::uuid THEN
            IF public.training_claim_solver_worker_request_v2(
              'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
              'training-v2', repeat('c', 64), 'bounded_canary', rejected_nonce,
              'heartbeat', signed_at, repeat('2', 64)
            ) THEN RAISE EXCEPTION 'mode mismatch consumed a nonce'; END IF;
          ELSIF rejected_nonce = '96000000-0000-4000-8000-000000000003'::uuid THEN
            IF public.training_claim_solver_worker_request_v2(
              'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
              'training-v2-operation-held', repeat('7', 64), 'backlog',
              rejected_nonce, 'heartbeat', signed_at, repeat('3', 64)
            ) THEN RAISE EXCEPTION 'held scope consumed a nonce'; END IF;
          ELSIF rejected_nonce = '96000000-0000-4000-8000-000000000004'::uuid THEN
            IF public.training_claim_solver_worker_request_v2(
              'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
              'training-v2-canary', repeat('e', 64), 'bounded_canary',
              rejected_nonce, 'heartbeat', signed_at, repeat('4', 64)
            ) THEN RAISE EXCEPTION 'retired authority consumed a nonce'; END IF;
          ELSE
            IF public.training_claim_solver_worker_request_v2(
              'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
              'training-v2-operation-canary', repeat('8', 64),
              'bounded_canary', rejected_nonce, 'board_page', signed_at,
              repeat('5', 64)
            ) THEN RAISE EXCEPTION 'canary board-page claim consumed a nonce'; END IF;
          END IF;
        END LOOP;
        IF EXISTS (
          SELECT 1 FROM public.training_solver_worker_receipts
          WHERE request_nonce BETWEEN
            '96000000-0000-4000-8000-000000000002'::uuid AND
            '96000000-0000-4000-8000-000000000005'::uuid
        ) THEN
          RAISE EXCEPTION 'rejected scope request left a durable receipt';
        END IF;

        IF (SELECT count(*) FROM public.training_solver_worker_board_page_v2(
              'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
              'training-v2', repeat('c', 64), 'backlog',
              'hu_cash', 100, 'flop', 'BB', NULL, 75
            )) < 1 THEN
          RAISE EXCEPTION 'active backlog scope returned no board work';
        END IF;
        BEGIN
          PERFORM 1 FROM public.training_solver_worker_board_page_v2(
            'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2-operation-canary', repeat('8', 64),
            'bounded_canary', 'hu_cash', 100, 'flop', 'BB', NULL, 75
          );
        EXCEPTION WHEN insufficient_privilege THEN
          board_canary_blocked := SQLERRM = 'SOLVER_WORKER_BOARD_PAGE_REQUIRES_BACKLOG';
        END;
        BEGIN
          PERFORM 1 FROM public.training_solver_worker_board_page_v2(
            'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2', repeat('c', 64), 'bounded_canary',
            'hu_cash', 100, 'flop', 'BB', NULL, 75
          );
        EXCEPTION WHEN insufficient_privilege THEN
          board_mismatch_blocked := SQLERRM = 'SOLVER_WORKER_BOARD_PAGE_REQUIRES_BACKLOG';
        END;

        IF (SELECT count(*) FROM public.training_solver_worker_row_states_v3(
              'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
              'training-v2-operation-canary', repeat('8', 64),
              'bounded_canary', ARRAY[
                'hu_cash_BB_100bb_AsKd2c',
                'turn_hu_cash_BB_100bb_AsKd2cAh'
              ]
            ) state
            WHERE state.admission_mode = 'bounded_canary'
              AND state.partition_count = 2 AND state.partition_index = 1
              AND state.canary_authorized) <> 2 THEN
          RAISE EXCEPTION 'exact canary pair did not return scoped row states';
        END IF;
        BEGIN
          PERFORM 1 FROM public.training_solver_worker_row_states_v3(
            'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2-operation-canary', repeat('8', 64),
            'bounded_canary', ARRAY['hu_cash_BB_100bb_AsKd2c']
          );
        EXCEPTION WHEN insufficient_privilege THEN
          row_subset_blocked := SQLERRM = 'SOLVER_WORKER_CANARY_ROW_STATES_NOT_AUTHORIZED';
        END;
        BEGIN
          PERFORM 1 FROM public.training_solver_worker_row_states_v3(
            'M2', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2-operation-canary', repeat('8', 64),
            'bounded_canary', ARRAY[
              'hu_cash_BB_100bb_AsKd2c',
              'turn_hu_cash_BB_100bb_AsKd2cAh',
              'hu_cash_BB_100bb_AsKd2c'
            ]
          );
        EXCEPTION WHEN insufficient_privilege THEN
          row_duplicate_blocked := SQLERRM = 'SOLVER_WORKER_CANARY_ROW_STATES_NOT_AUTHORIZED';
        END;
        BEGIN
          PERFORM 1 FROM public.training_solver_worker_row_states_v3(
            'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2', repeat('c', 64), 'backlog',
            array_fill('hu_cash_BB_100bb_AsKd2c'::text, ARRAY[76])
          );
        EXCEPTION WHEN invalid_parameter_value THEN
          row_oversize_blocked := SQLERRM = 'SOLVER_WORKER_ROW_STATES_PAYLOAD_INVALID';
        END;

        PERFORM public.training_solver_worker_heartbeat_v1(
          'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
          'training-v2', repeat('c', 64), 'backlog', 'scope-preflight', '',
          2, 3, 0, 'scope-bound heartbeat'
        );
        SELECT * INTO before_status FROM public.solver_status WHERE machine_id = 'M1';
        BEGIN
          PERFORM public.training_solver_worker_heartbeat_v1(
            'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2', repeat('c', 64), 'bounded_canary', 'wrong-scope', '',
            99, 99, 99, 'must not persist'
          );
        EXCEPTION WHEN insufficient_privilege THEN
          heartbeat_mismatch_blocked := SQLERRM = 'SOLVER_WORKER_EXECUTION_SCOPE_MISMATCH';
        END;
        BEGIN
          PERFORM public.training_solver_worker_heartbeat_v1(
            'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2', repeat('c', 64), 'backlog', 'null-counter', '',
            NULL, 3, 0, 'must not persist'
          );
        EXCEPTION WHEN invalid_parameter_value THEN
          heartbeat_null_blocked := SQLERRM = 'SOLVER_WORKER_HEARTBEAT_PAYLOAD_INVALID';
        END;
        IF (SELECT status_row FROM public.solver_status status_row
            WHERE machine_id = 'M1') IS DISTINCT FROM before_status THEN
          RAISE EXCEPTION 'rejected heartbeat mutated solver status';
        END IF;

        SELECT strategy_matrix_v2 INTO before_matrix
        FROM public.solved_spots_gold
        WHERE id = '90000000-0000-4000-8000-000000000009';
        BEGIN
          PERFORM 1 FROM public.training_ingest_solver_artifact_v2(
            'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
            'training-v2', repeat('c', 64), 'bounded_canary',
            '96000000-0000-4000-8000-000000000006', signed_at,
            repeat('6', 64), '{}'::jsonb
          );
        EXCEPTION WHEN insufficient_privilege THEN
          ingest_mismatch_blocked := SQLERRM = 'SOLVER_WORKER_EXECUTION_SCOPE_MISMATCH';
        END;
        IF EXISTS (SELECT 1 FROM public.training_solver_worker_receipts
                   WHERE request_nonce = '96000000-0000-4000-8000-000000000006')
           OR (SELECT strategy_matrix_v2 FROM public.solved_spots_gold
               WHERE id = '90000000-0000-4000-8000-000000000009')
              IS DISTINCT FROM before_matrix THEN
          RAISE EXCEPTION 'rejected scoped ingest mutated receipt or artifact state';
        END IF;

        SELECT receipt.signed_at INTO replay_signed_at
        FROM public.training_solver_worker_receipts receipt
        WHERE receipt.machine_id = 'M1'
          AND receipt.request_nonce = '91000000-0000-4000-8000-000000000001';
        SELECT jsonb_build_object(
          'audited_at', artifact.audited_at,
          'game_type', artifact.game_type,
          'id', artifact.id,
          'machine_id', artifact.machine_id,
          'manifest_checksum', artifact.manifest_checksum,
          'manifest_version', artifact.manifest_version,
          'pipeline_commit', artifact.pipeline_commit,
          'quality_status', artifact.quality_status,
          'scenario_hash', artifact.scenario_hash,
          'solved_v2_at', artifact.solved_v2_at,
          'solver_binary_checksum', artifact.solver_binary_checksum,
          'solver_version', artifact.solver_version,
          'source_artifact_checksum', artifact.source_artifact_checksum,
          'stack_depth', artifact.stack_depth,
          'strategy_matrix_v2', artifact.strategy_matrix_v2,
          'street', artifact.street
        ) INTO replay_artifact
        FROM public.solved_spots_gold artifact
        WHERE artifact.id = '90000000-0000-4000-8000-000000000009';
        SELECT * INTO replay_receipt
        FROM public.training_ingest_solver_artifact_v2(
          'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
          'training-v2', repeat('c', 64), 'backlog',
          '91000000-0000-4000-8000-000000000001', replay_signed_at,
          repeat('d', 64), replay_artifact
        );
        IF replay_receipt.replayed IS DISTINCT FROM true THEN
          RAISE EXCEPTION 'scope-bound ingest did not preserve durable replay';
        END IF;

        IF NOT board_canary_blocked OR NOT board_mismatch_blocked
           OR NOT row_subset_blocked OR NOT row_duplicate_blocked
           OR NOT row_oversize_blocked OR NOT heartbeat_mismatch_blocked
           OR NOT heartbeat_null_blocked OR NOT ingest_mismatch_blocked THEN
          RAISE EXCEPTION 'one or more scope-bound operation rejections failed';
        END IF;
      END;
      $operation_scope_behavior$;

      -- Keep later per-machine race probes independent from this fixture.
      UPDATE public.training_solver_provenance_authority
      SET retired_at = clock_timestamp()
      WHERE machine_id = 'M2'
        AND manifest_version = 'training-v2-operation-canary'
        AND manifest_checksum = repeat('8', 64)
        AND retired_at IS NULL;

      SELECT json_build_object(
        'workerOperationScopeBindingPassed', true,
        'workerOperationScopeAclPassed', true,
        'workerOperationScopeRejectRollbackPassed', true,
        'workerOperationCanaryExactPairPassed', true,
        'workerOperationHeartbeatBindingPassed', true,
        'workerOperationIngestReplayPassed', true
      );
    `,
    quiet: true,
  });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', BOUNDED_CANARY_MIGRATION,
  ], { quiet: true });
  const heldAfterReapply = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      SELECT admission_mode || '|' || count(*)::text
      FROM public.training_solver_ingest_scopes scope
      JOIN public.training_solver_bounded_canary_targets target
        USING (machine_id, solver_version, solver_binary_checksum,
               pipeline_commit, manifest_version, manifest_checksum)
      WHERE scope.machine_id = 'M2'
        AND scope.manifest_version = 'training-v2-held'
        AND scope.manifest_checksum = repeat('f', 64)
      GROUP BY admission_mode;
    `,
    quiet: true,
  }).stdout.trim();
  if (heldAfterReapply !== 'held|2') {
    throw new Error(`Bounded-canary migration rerun broadened a future held scope: ${heldAfterReapply}`);
  }

  // Prove the advisory lock closes the check-then-activate race. Prepare two
  // valid held tuples for M2 while its earlier canary authority is retired.
  // Transaction A activates and holds the per-machine lock; transaction B
  // began while A was uncommitted and must re-check after the lock is released,
  // then remain held rather than creating a second ingest-capable scope.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`
      INSERT INTO public.training_solver_provenance_authority (
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum, source_combo_order_sha256,
        training_game_contracts_sha256, manifest_contracts, approved_by
      )
      SELECT
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        'training-v2-race-2', repeat('9', 64), source_combo_order_sha256,
        training_game_contracts_sha256, manifest_contracts,
        'phase6-disposable-postgres-race-verifier'
      FROM public.training_solver_provenance_authority
      WHERE machine_id = 'M2'
        AND manifest_version = 'training-v2-held'
        AND manifest_checksum = repeat('f', 64);

      INSERT INTO public.training_solver_bounded_canary_targets (
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum, target_role, artifact_id,
        scenario_hash, street, node, hero_position, approved_by
      )
      SELECT
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        'training-v2-race-2', repeat('9', 64), target_role, artifact_id,
        scenario_hash, street, node, hero_position,
        'phase6-disposable-postgres-race-verifier'
      FROM public.training_solver_bounded_canary_targets
      WHERE machine_id = 'M2'
        AND manifest_version = 'training-v2-held'
        AND manifest_checksum = repeat('f', 64);
    `,
    quiet: true,
  });
  const firstScopeActivation = commandAsync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-At', ...connection,
  ], {
    input: String.raw`
      BEGIN;
      SET LOCAL statement_timeout = '5s';
      UPDATE public.training_solver_ingest_scopes
      SET admission_mode = 'bounded_canary', partition_count = 2,
          partition_index = 1
      WHERE machine_id = 'M2'
        AND manifest_version = 'training-v2-held'
        AND manifest_checksum = repeat('f', 64)
        AND admission_mode = 'held';
      SELECT pg_sleep(1);
      COMMIT;
    `,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const racingScopeActivation = commandAsync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-At', ...connection,
  ], {
    input: String.raw`
      SET statement_timeout = '5s';
      DO $racing_scope_activation$
      DECLARE blocked boolean := false;
      BEGIN
        BEGIN
          UPDATE public.training_solver_ingest_scopes
          SET admission_mode = 'bounded_canary', partition_count = 2,
              partition_index = 1
          WHERE machine_id = 'M2'
            AND manifest_version = 'training-v2-race-2'
            AND manifest_checksum = repeat('9', 64)
            AND admission_mode = 'held';
        EXCEPTION WHEN object_not_in_prerequisite_state THEN
          blocked :=
            SQLERRM = 'TRAINING_SOLVER_MACHINE_INGEST_SCOPE_ALREADY_ACTIVE';
        END;
        IF NOT blocked THEN
          RAISE EXCEPTION 'concurrent same-machine activation was not blocked';
        END IF;
      END;
      $racing_scope_activation$;
    `,
  });
  await Promise.all([firstScopeActivation, racingScopeActivation]);
  const serializedScopeState = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      SELECT
        count(*) FILTER (
          WHERE scope.admission_mode IN ('backlog', 'bounded_canary')
            AND authority.retired_at IS NULL
        )::text || '|' ||
        count(*) FILTER (
          WHERE scope.manifest_version = 'training-v2-race-2'
            AND scope.admission_mode = 'held'
        )::text
      FROM public.training_solver_ingest_scopes scope
      JOIN public.training_solver_provenance_authority authority
        USING (
          machine_id, solver_version, solver_binary_checksum, pipeline_commit,
          manifest_version, manifest_checksum
        )
      WHERE scope.machine_id = 'M2';
    `,
    quiet: true,
  }).stdout.trim();
  if (serializedScopeState !== '1|1') {
    throw new Error(`Concurrent same-machine scope activation escaped its hard cap: ${serializedScopeState}`);
  }
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`
      UPDATE public.training_solver_provenance_authority
      SET retired_at = clock_timestamp()
      WHERE machine_id = 'M2'
        AND manifest_version = 'training-v2-held'
        AND manifest_checksum = repeat('f', 64)
        AND retired_at IS NULL;
    `,
    quiet: true,
  });

  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`
      UPDATE public.solved_spots_gold
      SET quality_status = quality_status
      WHERE id = '90000000-0000-4000-8000-000000000009';
      INSERT INTO public.training_solver_worker_receipts (
        machine_id, request_nonce, operation, signed_at, body_sha256,
        solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum, received_at
      )
      SELECT
        'M1', md5('stale-receipt-' || value::text)::uuid, 'heartbeat',
        now() - interval '25 hours', repeat('8', 64), 'PioSOLVER 3.0',
        repeat('a', 64), repeat('b', 40), 'training-v2', repeat('c', 64),
        now() - interval '25 hours'
      FROM generate_series(1, 101) value
      ON CONFLICT DO NOTHING;
    `,
    quiet: true,
  });

  // Prove an actual row lock before and after the bounded retention pass.
  // Holder release is explicit; its deliberate lifetime is not cleanup time.
  await withStaleReceiptLock(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-At', ...connection,
  ], async () => {
    const heldRowProof = String.raw`
      DO $held_row_proof$
      DECLARE locked boolean := false;
      BEGIN
        BEGIN
          PERFORM 1 FROM public.training_solver_worker_receipts
          WHERE machine_id = 'M1' AND request_nonce = md5('stale-receipt-1')::uuid
            AND received_at < now() - interval '24 hours'
          FOR UPDATE NOWAIT;
        EXCEPTION WHEN lock_not_available THEN locked := true;
        END;
        IF NOT locked THEN
          RAISE EXCEPTION 'STALE_RECEIPT_ROW_NOT_HELD';
        END IF;
      END;
      $held_row_proof$;
    `;
    const cleanupResult = await commandAsync(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', '-At', ...connection,
    ], {
      input: String.raw`
        SET statement_timeout = '1500ms';
        ${heldRowProof}
        SELECT public.training_claim_solver_worker_request_v1(
          'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
          'training-v2', repeat('c', 64),
          '93000000-0000-4000-8000-000000000001', 'heartbeat',
          now(), repeat('7', 64)
        );
        ${heldRowProof}
        SELECT count(*) = 1 FROM public.training_solver_worker_receipts
        WHERE machine_id = 'M1' AND received_at < now() - interval '24 hours';
      `,
    });
    if (cleanupResult.stdout.trim() !== 'SET\nDO\nt\nDO\nt') {
      throw new Error(`Receipt cleanup did not preserve the held row and remove the 100 unlocked stale receipts.\n${cleanupResult.stdout}`);
    }
  });

  // Force the ON CONFLICT branch: transaction A commits one exact ingest but
  // holds its nonce/warehouse locks; transaction B started concurrently must
  // wait, then revalidate the now-current warehouse, catalog, and authority
  // tuple before returning replayed=true.
  const concurrentNonce = '93000000-0000-4000-8000-000000000002';
  const concurrentSignedAt = new Date().toISOString();
  const artifactExpression = String.raw`(
    SELECT jsonb_build_object(
      'audited_at', to_char(artifact.audited_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'game_type', artifact.game_type,
      'id', artifact.id::text,
      'machine_id', artifact.machine_id,
      'manifest_checksum', artifact.manifest_checksum,
      'manifest_version', artifact.manifest_version,
      'pipeline_commit', artifact.pipeline_commit,
      'quality_status', artifact.quality_status,
      'scenario_hash', artifact.scenario_hash,
      'solved_v2_at', to_char(artifact.solved_v2_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'solver_binary_checksum', artifact.solver_binary_checksum,
      'solver_version', artifact.solver_version,
      'source_artifact_checksum', artifact.source_artifact_checksum,
      'stack_depth', artifact.stack_depth,
      'strategy_matrix_v2', artifact.strategy_matrix_v2,
      'street', artifact.street
    )
    FROM public.solved_spots_gold artifact
    WHERE artifact.id = '90000000-0000-4000-8000-000000000009'
  )`;
  const concurrentCall = String.raw`
    SELECT replayed
    FROM public.training_ingest_solver_artifact_v1(
      'M1', 'PioSOLVER 3.0', repeat('a', 64), repeat('b', 40),
      'training-v2', repeat('c', 64), '${concurrentNonce}',
      '${concurrentSignedAt}'::timestamptz, repeat('6', 64), ${artifactExpression}
    );
  `;
  const firstIngest = commandAsync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-At', ...connection,
  ], {
    input: `BEGIN; SET statement_timeout = '5s'; ${concurrentCall} SELECT pg_sleep(2); COMMIT;`,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const secondIngest = commandAsync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-At', ...connection,
  ], {
    input: `SET statement_timeout = '5s'; ${concurrentCall}`,
  });
  const [firstIngestResult, secondIngestResult] = await Promise.all([firstIngest, secondIngest]);
  if (!/(?:^|\n)f(?:\n|$)/.test(firstIngestResult.stdout)
      || !/(?:^|\n)t(?:\n|$)/.test(secondIngestResult.stdout)) {
    throw new Error([
      'Concurrent byte-identical ingest did not return one write and one validated replay.',
      firstIngestResult.stdout,
      secondIngestResult.stdout,
    ].join('\n'));
  }

  // Both catalog migrations must reject subtle same-name drift before the
  // catalog becomes an active serving authority. These probes cover immediate
  // conflict arbiters, crash durability, defaults, collation, and a weakened
  // semantic check; every mutation is repaired before the next probe.
  const catalogShapeProbes = [
    {
      mutate: `
        ALTER TABLE public.training_solver_artifact_catalog
          DROP CONSTRAINT training_solver_artifact_catalog_pkey;
        ALTER TABLE public.training_solver_artifact_catalog
          ADD CONSTRAINT training_solver_artifact_catalog_pkey
          PRIMARY KEY (artifact_id) DEFERRABLE INITIALLY IMMEDIATE;
      `,
      repair: `
        ALTER TABLE public.training_solver_artifact_catalog
          DROP CONSTRAINT training_solver_artifact_catalog_pkey;
        ALTER TABLE public.training_solver_artifact_catalog
          ADD CONSTRAINT training_solver_artifact_catalog_pkey PRIMARY KEY (artifact_id);
      `,
    },
    {
      mutate: `
        ALTER TABLE public.training_solver_artifact_catalog
          DROP CONSTRAINT training_solver_artifact_catalog_scenario_hash_key;
        ALTER TABLE public.training_solver_artifact_catalog
          ADD CONSTRAINT training_solver_artifact_catalog_scenario_hash_key
          UNIQUE (scenario_hash) DEFERRABLE INITIALLY DEFERRED;
      `,
      repair: `
        ALTER TABLE public.training_solver_artifact_catalog
          DROP CONSTRAINT training_solver_artifact_catalog_scenario_hash_key;
        ALTER TABLE public.training_solver_artifact_catalog
          ADD CONSTRAINT training_solver_artifact_catalog_scenario_hash_key UNIQUE (scenario_hash);
      `,
    },
    {
      mutate: `ALTER TABLE public.training_solver_artifact_catalog
        ALTER COLUMN updated_at SET DEFAULT clock_timestamp();`,
      repair: `ALTER TABLE public.training_solver_artifact_catalog
        ALTER COLUMN updated_at SET DEFAULT now();`,
    },
    {
      mutate: `
        ALTER TABLE public.training_solver_artifact_catalog
          DROP CONSTRAINT training_solver_artifact_catalog_stack_check;
        ALTER TABLE public.training_solver_artifact_catalog
          ADD CONSTRAINT training_solver_artifact_catalog_stack_check
          CHECK (stack_depth >= 0);
      `,
      repair: `
        ALTER TABLE public.training_solver_artifact_catalog
          DROP CONSTRAINT training_solver_artifact_catalog_stack_check;
        ALTER TABLE public.training_solver_artifact_catalog
          ADD CONSTRAINT training_solver_artifact_catalog_stack_check
          CHECK (stack_depth > 0);
      `,
    },
    {
      mutate: `ALTER TABLE public.training_solver_artifact_catalog
        ALTER COLUMN scenario_hash TYPE text COLLATE "C";`,
      repair: `ALTER TABLE public.training_solver_artifact_catalog
        ALTER COLUMN scenario_hash TYPE text COLLATE pg_catalog."default";`,
    },
    {
      mutate: 'ALTER TABLE public.training_solver_artifact_catalog SET UNLOGGED;',
      repair: 'ALTER TABLE public.training_solver_artifact_catalog SET LOGGED;',
    },
  ];
  for (const probe of catalogShapeProbes) {
    command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
      input: probe.mutate,
      quiet: true,
    });
    for (const migration of [MIGRATION, HARDENING_MIGRATION]) {
      commandExpectFailure(
        tool('psql'),
        ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', migration],
        { expected: 'TRAINING_SOLVER_ARTIFACT_CATALOG_CONTRACT_INCOMPLETE' },
      );
    }
    command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
      input: probe.repair,
      quiet: true,
    });
  }

  // Each bounded-canary CREATE TABLE IF NOT EXISTS object must reject subtle
  // same-name drift on reapply. Exercise one semantic contract defect on every
  // private table, repair it explicitly, and prove the migration is idempotent
  // again before moving to the next probe.
  const boundedScopeShapeProbes = [
    {
      mutate: `
        ALTER TABLE public.training_solver_ingest_scopes
          DROP CONSTRAINT training_solver_ingest_scopes_mode_check;
        ALTER TABLE public.training_solver_ingest_scopes
          ADD CONSTRAINT training_solver_ingest_scopes_mode_check
          CHECK (char_length(admission_mode) > 0);
      `,
      repair: `
        ALTER TABLE public.training_solver_ingest_scopes
          DROP CONSTRAINT training_solver_ingest_scopes_mode_check;
        ALTER TABLE public.training_solver_ingest_scopes
          ADD CONSTRAINT training_solver_ingest_scopes_mode_check
          CHECK (admission_mode IN ('held', 'backlog', 'bounded_canary'));
      `,
      expected: 'TRAINING_SOLVER_INGEST_SCOPES_CONTRACT_INCOMPLETE',
    },
    {
      mutate: `
        ALTER TABLE public.training_solver_bounded_canary_targets
          DROP CONSTRAINT training_solver_canary_targets_role_street_check;
        ALTER TABLE public.training_solver_bounded_canary_targets
          ADD CONSTRAINT training_solver_canary_targets_role_street_check
          CHECK (target_role IN ('parent', 'child'));
      `,
      repair: `
        ALTER TABLE public.training_solver_bounded_canary_targets
          DROP CONSTRAINT training_solver_canary_targets_role_street_check;
        ALTER TABLE public.training_solver_bounded_canary_targets
          ADD CONSTRAINT training_solver_canary_targets_role_street_check CHECK (
            (target_role = 'parent' AND street = 'flop')
            OR (target_role = 'child' AND street = 'turn')
          );
      `,
      expected: 'TRAINING_SOLVER_CANARY_TARGETS_CONTRACT_INCOMPLETE',
    },
    {
      mutate: `ALTER TABLE public.training_solver_scope_migration_state
        ALTER COLUMN completed_at SET DEFAULT clock_timestamp();`,
      repair: `ALTER TABLE public.training_solver_scope_migration_state
        ALTER COLUMN completed_at SET DEFAULT now();`,
      expected: 'TRAINING_SOLVER_SCOPE_MIGRATION_STATE_CONTRACT_INCOMPLETE',
    },
  ];
  for (const probe of boundedScopeShapeProbes) {
    command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
      input: probe.mutate,
      quiet: true,
    });
    commandExpectFailure(
      tool('psql'),
      ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', BOUNDED_CANARY_MIGRATION],
      { expected: probe.expected },
    );
    command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
      input: probe.repair,
      quiet: true,
    });
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', BOUNDED_CANARY_MIGRATION,
    ], { quiet: true });
  }

  // Table-level REVOKE does not clear PostgreSQL column grants. Seed a leak on
  // every private table, reapply the migration, and require its column-ACL
  // normalizer plus postcondition assertion to remove all three.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: `
      GRANT SELECT (machine_id)
        ON public.training_solver_ingest_scopes TO service_role;
      GRANT UPDATE (target_role)
        ON public.training_solver_bounded_canary_targets TO authenticated;
      GRANT REFERENCES (migration_id)
        ON public.training_solver_scope_migration_state TO anon;
    `,
    quiet: true,
  });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', BOUNDED_CANARY_MIGRATION,
  ], { quiet: true });
  const boundedScopeAclClosed = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      SELECT NOT (
        has_any_column_privilege(
          'service_role', 'public.training_solver_ingest_scopes',
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
        OR has_any_column_privilege(
          'authenticated', 'public.training_solver_bounded_canary_targets',
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
        OR has_any_column_privilege(
          'anon', 'public.training_solver_scope_migration_state',
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
      );
    `,
    quiet: true,
  }).stdout.trim();
  if (boundedScopeAclClosed !== 't') {
    throw new Error('Bounded-canary migration left a private column ACL grant in place.');
  }

  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: `
      ALTER TABLE public.training_solver_worker_receipts
        DROP CONSTRAINT training_solver_worker_receipts_pkey;
      ALTER TABLE public.training_solver_worker_receipts
        ADD CONSTRAINT training_solver_worker_receipts_pkey
        PRIMARY KEY (machine_id, request_nonce) DEFERRABLE INITIALLY IMMEDIATE;
    `,
    quiet: true,
  });
  commandExpectFailure(
    tool('psql'),
    ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', WORKER_INGEST_MIGRATION],
    { expected: 'TRAINING_SOLVER_WORKER_RECEIPT_CONTRACT_INCOMPLETE' },
  );
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: `
      ALTER TABLE public.training_solver_worker_receipts
        DROP CONSTRAINT training_solver_worker_receipts_pkey;
      ALTER TABLE public.training_solver_worker_receipts
        ADD CONSTRAINT training_solver_worker_receipts_pkey
        PRIMARY KEY (machine_id, request_nonce);
    `,
    quiet: true,
  });

  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: `ALTER TABLE public.training_solver_artifact_catalog
      DROP CONSTRAINT training_solver_artifact_catalog_artifact_id_fkey;`,
    quiet: true,
  });
  const incompatibleCatalog = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...connection, '--file', MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleCatalog.status === 0
      || !`${incompatibleCatalog.stdout}\n${incompatibleCatalog.stderr}`
        .includes('TRAINING_SOLVER_ARTIFACT_CATALOG_CONTRACT_INCOMPLETE')) {
    throw new Error('Catalog migration did not reject a pre-existing table missing its cascade FK.');
  }
  const wrongShapeDatabase = 'phase6_solver_wrongshape';
  command(tool('createdb'), ['-h', tempRoot, '-p', String(port), wrongShapeDatabase], { quiet: true });
  const wrongShapeConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongShapeDatabase,
  ];
  const baselineWithoutClusterRoles = BASELINE_SQL.replace(/^CREATE ROLE .*;$/gm, '');
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...wrongShapeConnection], {
    input: baselineWithoutClusterRoles,
    quiet: true,
  });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongShapeConnection, '-f', MIGRATION,
  ], { quiet: true });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...wrongShapeConnection], {
    input: 'CREATE TABLE public.training_solver_provenance_authority (machine_id text);',
    quiet: true,
  });
  const incompatibleAuthority = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongShapeConnection, '--file', HARDENING_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleAuthority.status === 0
      || !`${incompatibleAuthority.stdout}\n${incompatibleAuthority.stderr}`
        .includes('TRAINING_SOLVER_PROVENANCE_AUTHORITY_CONTRACT_INCOMPLETE')) {
    throw new Error('Hardening migration did not reject a pre-existing wrong-shape authority table.');
  }
  const wrongAuthorityDefaultDatabase = 'phase6_solver_authority_wrongdefault';
  command(tool('createdb'), [
    '-h', tempRoot, '-p', String(port), wrongAuthorityDefaultDatabase,
  ], { quiet: true });
  const wrongAuthorityDefaultConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongAuthorityDefaultDatabase,
  ];
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityDefaultConnection,
  ], { input: baselineWithoutClusterRoles, quiet: true });
  for (const migration of [MIGRATION, HARDENING_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityDefaultConnection, '-f', migration,
    ], { quiet: true });
  }
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityDefaultConnection,
  ], {
    input: `ALTER TABLE public.training_solver_provenance_authority
      ALTER COLUMN approved_at SET DEFAULT clock_timestamp();`,
    quiet: true,
  });
  const incompatibleAuthorityDefault = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityDefaultConnection,
    '--file', HARDENING_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleAuthorityDefault.status === 0
      || !`${incompatibleAuthorityDefault.stdout}\n${incompatibleAuthorityDefault.stderr}`
        .includes('TRAINING_SOLVER_PROVENANCE_AUTHORITY_CONTRACT_INCOMPLETE')) {
    throw new Error('Hardening migration accepted a provenance authority with the wrong default.');
  }
  const wrongAuthorityConstraintDatabase = 'phase6_solver_authority_wrongconstraint';
  command(tool('createdb'), [
    '-h', tempRoot, '-p', String(port), wrongAuthorityConstraintDatabase,
  ], { quiet: true });
  const wrongAuthorityConstraintConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongAuthorityConstraintDatabase,
  ];
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityConstraintConnection,
  ], { input: baselineWithoutClusterRoles, quiet: true });
  for (const migration of [MIGRATION, HARDENING_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityConstraintConnection, '-f', migration,
    ], { quiet: true });
  }
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityConstraintConnection,
  ], {
    input: `ALTER TABLE public.training_solver_provenance_authority
      DROP CONSTRAINT training_solver_provenance_authority_labels_check;
      ALTER TABLE public.training_solver_provenance_authority
      ADD CONSTRAINT training_solver_provenance_authority_labels_check
      CHECK (char_length(btrim(solver_version)) >= 1);`,
    quiet: true,
  });
  const incompatibleAuthorityConstraint = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongAuthorityConstraintConnection,
    '--file', HARDENING_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleAuthorityConstraint.status === 0
      || !`${incompatibleAuthorityConstraint.stdout}\n${incompatibleAuthorityConstraint.stderr}`
        .includes('TRAINING_SOLVER_PROVENANCE_AUTHORITY_CONTRACT_INCOMPLETE')) {
    throw new Error('Hardening migration accepted a provenance authority with a weaker check.');
  }
  const wrongIndexDatabase = 'phase6_solver_index_wrongshape';
  command(tool('createdb'), ['-h', tempRoot, '-p', String(port), wrongIndexDatabase], { quiet: true });
  const wrongIndexConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongIndexDatabase,
  ];
  const baselineWithWrongIndex = baselineWithoutClusterRoles.replace(
    'ON public.solved_spots_gold (game_type, stack_depth, street, scenario_hash);',
    'ON public.solved_spots_gold (game_type, stack_depth, street, scenario_hash DESC);',
  );
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...wrongIndexConnection], {
    input: baselineWithWrongIndex,
    quiet: true,
  });
  for (const migration of [MIGRATION, HARDENING_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongIndexConnection, '-f', migration,
    ], { quiet: true });
  }
  const incompatibleIndex = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongIndexConnection, '--file', WORKER_INGEST_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleIndex.status === 0
      || !`${incompatibleIndex.stdout}\n${incompatibleIndex.stderr}`
        .includes('TRAINING_SOLVER_WORKER_BOARD_PAGE_INDEX_MISSING')) {
    throw new Error('Worker-ingress migration accepted a descending board-page keyset index.');
  }
  const wrongCollationIndexDatabase = 'phase6_solver_index_wrongcollation';
  command(tool('createdb'), [
    '-h', tempRoot, '-p', String(port), wrongCollationIndexDatabase,
  ], { quiet: true });
  const wrongCollationIndexConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongCollationIndexDatabase,
  ];
  const baselineWithWrongCollationIndex = baselineWithoutClusterRoles.replace(
    'ON public.solved_spots_gold (game_type, stack_depth, street, scenario_hash);',
    'ON public.solved_spots_gold (game_type, stack_depth, street, scenario_hash COLLATE "C");',
  );
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongCollationIndexConnection,
  ], {
    input: baselineWithWrongCollationIndex,
    quiet: true,
  });
  for (const migration of [MIGRATION, HARDENING_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongCollationIndexConnection, '-f', migration,
    ], { quiet: true });
  }
  const incompatibleCollationIndex = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongCollationIndexConnection,
    '--file', WORKER_INGEST_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleCollationIndex.status === 0
      || !`${incompatibleCollationIndex.stdout}\n${incompatibleCollationIndex.stderr}`
        .includes('TRAINING_SOLVER_WORKER_BOARD_PAGE_INDEX_MISSING')) {
    throw new Error('Worker-ingress migration accepted a board-page index with the wrong collation.');
  }
  const wrongHashIndexDatabase = 'phase6_solver_hash_index_wrongshape';
  command(tool('createdb'), [
    '-h', tempRoot, '-p', String(port), wrongHashIndexDatabase,
  ], { quiet: true });
  const wrongHashIndexConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongHashIndexDatabase,
  ];
  const baselineWithWrongHashIndex = baselineWithoutClusterRoles.replace(
    'ON public.solved_spots_gold (scenario_hash);',
    'ON public.solved_spots_gold (scenario_hash text_pattern_ops);',
  );
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...wrongHashIndexConnection], {
    input: baselineWithWrongHashIndex,
    quiet: true,
  });
  for (const migration of [MIGRATION, HARDENING_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongHashIndexConnection, '-f', migration,
    ], { quiet: true });
  }
  const incompatibleHashIndex = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongHashIndexConnection,
    '--file', WORKER_INGEST_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleHashIndex.status === 0
      || !`${incompatibleHashIndex.stdout}\n${incompatibleHashIndex.stderr}`
        .includes('TRAINING_SOLVER_WORKER_SCENARIO_HASH_INDEX_MISSING')) {
    throw new Error('Worker-ingress migration accepted a non-default scenario-hash opclass.');
  }
  const wrongReceiptDatabase = 'phase6_solver_receipt_wrongshape';
  command(tool('createdb'), ['-h', tempRoot, '-p', String(port), wrongReceiptDatabase], { quiet: true });
  const wrongReceiptConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongReceiptDatabase,
  ];
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConnection], {
    input: baselineWithoutClusterRoles,
    quiet: true,
  });
  for (const migration of [MIGRATION, HARDENING_MIGRATION, WORKER_INGEST_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConnection, '-f', migration,
    ], { quiet: true });
  }
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConnection], {
    input: `ALTER TABLE public.training_solver_worker_receipts
      DROP CONSTRAINT training_solver_worker_receipts_pkey;`,
    quiet: true,
  });
  const incompatibleReceipt = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConnection, '--file', WORKER_INGEST_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleReceipt.status === 0
      || !`${incompatibleReceipt.stdout}\n${incompatibleReceipt.stderr}`
        .includes('TRAINING_SOLVER_WORKER_RECEIPT_CONTRACT_INCOMPLETE')) {
    throw new Error('Worker-ingress migration did not reject a wrong-shape receipt ledger.');
  }
  const wrongReceiptDefaultDatabase = 'phase6_solver_receipt_wrongdefault';
  command(tool('createdb'), [
    '-h', tempRoot, '-p', String(port), wrongReceiptDefaultDatabase,
  ], { quiet: true });
  const wrongReceiptDefaultConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongReceiptDefaultDatabase,
  ];
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptDefaultConnection,
  ], { input: baselineWithoutClusterRoles, quiet: true });
  for (const migration of [MIGRATION, HARDENING_MIGRATION, WORKER_INGEST_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptDefaultConnection, '-f', migration,
    ], { quiet: true });
  }
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptDefaultConnection,
  ], {
    input: `ALTER TABLE public.training_solver_worker_receipts
      ALTER COLUMN received_at SET DEFAULT now();`,
    quiet: true,
  });
  const incompatibleReceiptDefault = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptDefaultConnection,
    '--file', WORKER_INGEST_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleReceiptDefault.status === 0
      || !`${incompatibleReceiptDefault.stdout}\n${incompatibleReceiptDefault.stderr}`
        .includes('TRAINING_SOLVER_WORKER_RECEIPT_CONTRACT_INCOMPLETE')) {
    throw new Error('Worker-ingress migration accepted a receipt ledger with the wrong default.');
  }
  const wrongReceiptConstraintDatabase = 'phase6_solver_receipt_wrongconstraint';
  command(tool('createdb'), [
    '-h', tempRoot, '-p', String(port), wrongReceiptConstraintDatabase,
  ], { quiet: true });
  const wrongReceiptConstraintConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongReceiptConstraintDatabase,
  ];
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConstraintConnection,
  ], { input: baselineWithoutClusterRoles, quiet: true });
  for (const migration of [MIGRATION, HARDENING_MIGRATION, WORKER_INGEST_MIGRATION]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConstraintConnection, '-f', migration,
    ], { quiet: true });
  }
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConstraintConnection,
  ], {
    input: `ALTER TABLE public.training_solver_worker_receipts
      DROP CONSTRAINT training_solver_worker_receipts_body_check;
      ALTER TABLE public.training_solver_worker_receipts
      ADD CONSTRAINT training_solver_worker_receipts_body_check
      CHECK (body_sha256 ~ '^[0-9A-Fa-f]{64}$');`,
    quiet: true,
  });
  const incompatibleReceiptConstraint = spawnSync(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongReceiptConstraintConnection,
    '--file', WORKER_INGEST_MIGRATION,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (incompatibleReceiptConstraint.status === 0
      || !`${incompatibleReceiptConstraint.stdout}\n${incompatibleReceiptConstraint.stderr}`
        .includes('TRAINING_SOLVER_WORKER_RECEIPT_CONTRACT_INCOMPLETE')) {
    throw new Error('Worker-ingress migration accepted a receipt ledger with a weaker check.');
  }

  // Prove the final migration rejects a pre-existing heartbeat table whose
  // shape drifted from production, then succeeds and remains idempotent after
  // an explicit repair. PL/pgSQL would otherwise defer this failure to runtime.
  const wrongStatusDatabase = 'phase6_solver_status_wrongshape';
  command(tool('createdb'), [
    '-h', tempRoot, '-p', String(port), wrongStatusDatabase,
  ], { quiet: true });
  const wrongStatusConnection = [
    '-h', tempRoot, '-p', String(port), '-d', wrongStatusDatabase,
  ];
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection,
  ], { input: baselineWithoutClusterRoles, quiet: true });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection,
  ], { input: PRODUCTION_DEFAULT_ACL_SQL, quiet: true });
  for (const migration of [
    MIGRATION, HARDENING_MIGRATION, WORKER_INGEST_MIGRATION,
    BOUNDED_CANARY_MIGRATION,
  ]) {
    command(tool('psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection, '-f', migration,
    ], { quiet: true });
  }
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection,
  ], {
    input: `ALTER TABLE public.solver_status
      ALTER COLUMN spots_done TYPE bigint;`,
    quiet: true,
  });
  commandExpectFailure(
    tool('psql'),
    ['-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection,
      '-f', OPERATION_SCOPE_MIGRATION],
    { expected: 'TRAINING_SOLVER_STATUS_CONTRACT_INCOMPLETE' },
  );
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection,
  ], {
    input: `ALTER TABLE public.solver_status
      ALTER COLUMN spots_done TYPE integer;`,
    quiet: true,
  });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection,
    '-f', OPERATION_SCOPE_MIGRATION,
  ], { quiet: true });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...wrongStatusConnection,
    '-f', OPERATION_SCOPE_MIGRATION,
  ], { quiet: true });

  // Some predecessor migrations are intentionally re-applied above for their
  // own idempotency probes. Re-apply the newest migration last and require the
  // final database state—not an earlier snapshot—to remain scope-only.
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...connection,
    '-f', OPERATION_SCOPE_MIGRATION,
  ], { quiet: true });
  const finalOperationScopeClosed = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], {
    input: String.raw`
      SELECT
        NOT has_function_privilege(
          'service_role',
          'public.training_claim_solver_worker_request_v1(text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
          'EXECUTE'
        )
        AND NOT has_function_privilege(
          'service_role',
          'public.training_ingest_solver_artifact_v1(text,text,text,text,text,text,uuid,timestamp with time zone,text,jsonb)',
          'EXECUTE'
        )
        AND has_function_privilege(
          'service_role',
          'public.training_claim_solver_worker_request_v2(text,text,text,text,text,text,text,uuid,text,timestamp with time zone,text)',
          'EXECUTE'
        )
        AND has_function_privilege(
          'service_role',
          'public.training_solver_worker_heartbeat_v1(text,text,text,text,text,text,text,text,text,integer,integer,integer,text)',
          'EXECUTE'
        )
        AND NOT has_table_privilege(
          'service_role', 'public.solver_status',
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        );
    `,
    quiet: true,
  }).stdout.trim();
  if (finalOperationScopeClosed !== 't') {
    throw new Error('Final operation-scope migration state reopened a legacy or direct-write path.');
  }
  const evidenceLine = evidence.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!evidenceLine) throw new Error(`Solver catalog verifier emitted no evidence.\n${evidence.stdout}`);
  const operationScopeEvidenceLine = operationScopeEvidence.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!operationScopeEvidenceLine) {
    throw new Error(`Operation-scope verifier emitted no evidence.\n${operationScopeEvidence.stdout}`);
  }
  const combinedEvidence = {
    ...JSON.parse(evidenceLine),
    ...JSON.parse(operationScopeEvidenceLine),
  };
  console.log(`Phase 6 Training solver catalog verification passed: ${JSON.stringify(combinedEvidence)}`);
} finally {
  if (started) {
    spawnSync(tool('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  }
  if (tempRoot.startsWith(`${tmpdir()}${path.sep}sp-training-solver-catalog-`)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
