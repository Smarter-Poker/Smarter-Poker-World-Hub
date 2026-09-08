import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CustomSolverSpotContractError,
  customSolverProvenanceIsComplete,
  customSolverRowMatchesRequest,
  normalizeCustomSolverSpot,
} from '../src/lib/training/customSolverSpotContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeRow() {
  return {
    id: 'solve-1',
    scenario_hash: 'hu_cash_SB_100bb_AsKdQc',
    game_type: 'hu_cash',
    street: 'flop',
    stack_depth: 100,
    strategy_matrix_v2: {
      actions: ['c', 'b525'],
      frequencies: {},
      hand_evs_bb: [],
      street: 'flop',
      board: ['As', 'Kd', 'Qc'],
      position: 'SB',
      hero: 'OOP',
      oop_player: 'SB',
      ip_player: 'BB',
      node: 'r:0',
      pot_bb: 7,
      eff_stack_bb: 93,
      rake: '0.05 100',
      tree_geometry: 'hu_cash_75pct',
      solver: 'PioSOLVER',
      combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
      range_combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
      source_combo_order_schema: 'piosolver.show_hand_order.v1',
      source_combo_order_sha256: '1'.repeat(64),
      oop_range_checksum: '2'.repeat(64),
      ip_range_checksum: '3'.repeat(64),
      training_game_contracts_sha256: '4'.repeat(64),
      exploitability_pct: 0.05,
      convergence: {
        schema: 'piosolver.calc-results.v1',
        source_command: 'calc_results',
        accuracy_fraction: 0.001,
        starting_pot_chips: 700,
        achieved_exploitability_chips: 0.35,
        achieved_exploitability_fraction: 0.0005,
      },
    },
    solver_version: '3.0.6',
    solver_binary_checksum: 'a'.repeat(64),
    machine_id: 'M1',
    pipeline_commit: 'b'.repeat(40),
    manifest_version: 'phase6',
    manifest_checksum: 'c'.repeat(64),
    source_artifact_checksum: 'd'.repeat(64),
    quality_status: 'validated',
    audited_at: '2026-09-07T00:00:00.000Z',
  };
}

test('normalizes one exact HU cash board identity without sorting the runout', () => {
  const request = normalizeCustomSolverSpot({
    board: ['As', 'Kd', 'Qc'],
    heroPosition: 'sb',
    villainPosition: 'bb',
    stackDepth: 100,
    gameType: 'cash',
    street: 'flop',
  });
  assert.equal(request.scenarioHash, 'hu_cash_SB_100bb_AsKdQc');
  assert.equal(request.boardString, 'AsKdQc');
  assert.equal(request.pioGameType, 'hu_cash');
});

test('rejects incomplete or contradictory board, seat, stack, and game identities', () => {
  const valid = {
    board: ['As', 'Kd', 'Qc'],
    heroPosition: 'SB',
    villainPosition: 'BB',
    stackDepth: 100,
    gameType: 'cash',
  };
  const invalid = [
    [{ ...valid, board: ['As', 'Kd'] }, 'BOARD_CARD_COUNT_INVALID'],
    [{ ...valid, board: ['As', 'Kd', 'As'] }, 'BOARD_DUPLICATE_CARD'],
    [{ ...valid, board: ['as', 'Kd', 'Qc'] }, 'BOARD_CARD_INVALID'],
    [{ ...valid, street: 'turn' }, 'STREET_BOARD_MISMATCH'],
    [{ ...valid, villainPosition: 'SB' }, 'POSITIONS_NOT_DISTINCT'],
    [{ ...valid, heroPosition: 'DEALER' }, 'POSITION_INVALID'],
    [{ ...valid, stackDepth: 100.5 }, 'STACK_DEPTH_INVALID'],
    [{ ...valid, gameType: 'mtt' }, 'GAME_TYPE_UNSUPPORTED'],
  ];
  for (const [payload, code] of invalid) {
    assert.throws(
      () => normalizeCustomSolverSpot(payload),
      (error) => error instanceof CustomSolverSpotContractError && error.code === code,
    );
  }
});

test('accepts only one fully audited exact root identity for the requested seats', () => {
  const request = normalizeCustomSolverSpot({
    board: ['As', 'Kd', 'Qc'], heroPosition: 'SB', villainPosition: 'BB', stackDepth: 100,
  });
  const row = makeRow();
  assert.equal(customSolverProvenanceIsComplete(row), true);
  assert.equal(customSolverRowMatchesRequest(row, request), true);

  const missingComboOrder = makeRow();
  delete missingComboOrder.strategy_matrix_v2.combo_order;
  assert.equal(customSolverProvenanceIsComplete(missingComboOrder), false);
  assert.equal(customSolverRowMatchesRequest(missingComboOrder, request), false);

  const wrongVillain = structuredClone(row);
  wrongVillain.strategy_matrix_v2.ip_player = 'BTN';
  assert.equal(customSolverRowMatchesRequest(wrongVillain, request), false);

  const assumedCheck = structuredClone(row);
  assumedCheck.strategy_matrix_v2.node = 'r:0:c';
  assumedCheck.strategy_matrix_v2.hero = 'IP';
  assumedCheck.strategy_matrix_v2.position = 'BB';
  assert.equal(customSolverRowMatchesRequest(assumedCheck, request), false);

  const legacyOnly = structuredClone(row);
  delete legacyOnly.strategy_matrix_v2;
  legacyOnly.strategy_matrix = { actions: ['c', 'b525'] };
  assert.equal(customSolverRowMatchesRequest(legacyOnly, request), false);

  const unsealed = structuredClone(row);
  unsealed.quality_status = null;
  assert.equal(customSolverRowMatchesRequest(unsealed, request), false);
});

test('Custom Solve API queries exact v2 identity and never upgrades board-only or legacy rows', () => {
  const api = fs.readFileSync(path.join(ROOT, 'pages/api/training/solver-api.js'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'pages/hub/training/custom-solve.js'), 'utf8');
  assert.match(api, /normalizeCustomSolverSpot/);
  assert.match(api, /customSolverRowMatchesRequest/);
  assert.match(api, /v2ToAppMatrix/);
  assert.match(api, /training_solver_spot_candidates_v1/);
  assert.match(api, /p_scenario_hash: request\.scenarioHash/);
  assert.match(api, /p_street: request\.street/);
  assert.match(api, /p_artifact_id: null/);
  assert.match(api, /const SOLVER_QUERY_TIMEOUT_MS = 8_000/);
  assert.match(api, /query\.abortSignal\(controller\.signal\)/);
  assert.doesNotMatch(api, /\.from\(['"]solved_spots_gold['"]\)/);
  assert.match(api, /matchQuality: 'exact_root_node'/);
  assert.match(api, /decisionNode: exact\.row\.strategy_matrix_v2\.node/);
  assert.match(api, /exactCandidates\.length > 1/);
  assert.doesNotMatch(api, /\.ilike\('scenario_hash'/);
  assert.doesNotMatch(api, /aggregateSolverActions\(row\.strategy_matrix\)/);
  assert.doesNotMatch(api, /matchQuality: 'exact_board'/);
  assert.match(api, /source: 'training_solver_artifact_catalog'/);
  assert.match(page, /data\?\.source === 'training_solver_artifact_catalog'/);
  assert.doesNotMatch(page, /data\?\.source === 'solved_spots_gold'/);
  assert.doesNotMatch(api, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(page, /Audited Solver Result/);
  assert.match(page, /Action Frequency Reference/);
  assert.match(page, /Only An Audited Exact Root Decision Is Displayed/);
  assert.match(page, /Request Fails Closed And No Modeled Result Is Shown/);
  assert.doesNotMatch(page, /Result Is Clearly Marked As A Model/);
  assert.doesNotMatch(page, /PRECOMPUTED_RANGES|Optimal Strategy|Exact Board Query/);
});
