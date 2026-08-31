import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  parseTrainingContracts,
  validateBoard,
  validateScenarioHash,
  validateLegacyMatrix,
  validateV2Matrix,
} = require('../scripts/audit-solved-spots-warehouse.js');

test('warehouse audit reads exactly 25 Training Pio family/stack contracts', () => {
  const contracts = parseTrainingContracts();
  assert.equal(contracts.length, 25);
  assert.ok(contracts.some(({ family, stack }) => family === 'postflop_complete' && stack === 100));
  assert.ok(contracts.some(({ family, stack }) => family === 'spin_hu_icm' && stack === 10));
  const hu100 = contracts.find(({ family, stack }) => family === 'hu_cash' && stack === 100);
  assert.deepEqual(hu100.preflopGames, ['cash-001', 'cash-008']);
  assert.equal(hu100.games.length, 20);
});

test('board validation rejects duplicate and malformed river cards', () => {
  assert.equal(validateBoard({ board: ['As', 'Kd', 'Qc', 'Jh', 'Tc'] }, 'river').valid, true);
  assert.equal(validateBoard({ board: ['As', 'Kd', 'Qc', 'Jh', 'As'] }, 'river').valid, false);
  assert.equal(validateBoard({ board: ['As', 'Kd', 'Qc', 'Jh', '10c'] }, 'river').valid, false);
});

test('legacy board validation uses the canonical scenario-hash suffix', () => {
  assert.equal(validateBoard({}, 'flop', 'mtt_6max_icm_BB_20bb_3cJs3s').valid, true);
  assert.equal(validateBoard({}, 'flop', 'mtt_6max_icm_BB_20bb_3cJs3c').valid, false);
});

test('canonical flop hashes omit the street token without becoming invalid', () => {
  assert.equal(validateScenarioHash('hu_cash_BB_100bb_AsKdQc', 'flop'), true);
  assert.equal(validateScenarioHash('turn_hu_cash_BB_100bb_AsKdQcJh', 'turn'), true);
  assert.equal(validateScenarioHash('river_hu_cash_BB_100bb_AsKdQcJhTc', 'river'), true);
  assert.equal(validateScenarioHash('turn_hu_cash_BB_100bb_AsKdQc', 'flop'), false);
  assert.equal(validateScenarioHash('hu_cash_BB_100bb_AsKdAs', 'flop'), false);
});

test('legacy audit distinguishes credible hands from scale-corrupted hands', () => {
  const result = validateLegacyMatrix({
    actions: ['c', 'f'],
    frequencies: {
      c: { AKs: 0.6, AQs: 3.2 },
      f: { AKs: 0.4, AQs: 0.1 },
    },
    hand_evs: { AKs: 1.2, AQs: 0.5 },
  });
  assert.equal(result.structurallyValid, true);
  assert.equal(result.credibleHands, 1);
  assert.equal(result.corruptHands, 1);
  assert.equal(result.outOfRangeValues, 1);
});

test('legacy audit rejects a frequency hand without its own finite EV', () => {
  const result = validateLegacyMatrix({
    actions: ['c', 'f'],
    frequencies: { c: { AKs: 0.6, AQs: 0.5 }, f: { AKs: 0.4, AQs: 0.5 } },
    hand_evs: { AKs: 1.2 },
  });
  assert.equal(result.credibleHands, 1);
  assert.equal(result.corruptHands, 1);
});

test('runtime sanitizer cannot manufacture a pure strategy from a corrupt hand', () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../src/engines/deterministicEnginePatches.js'),
    'utf8',
  );
  assert.match(
    source,
    /const isPure = !corrupted && maxVal >= 0\.98 && \(sum - maxVal\) <= 0\.02;/,
  );
});

test('runtime sanitizer ignores an untrusted serialized sanitized marker', () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../src/engines/deterministicEnginePatches.js'),
    'utf8',
  );
  assert.match(source, /const SANITIZED_MATRICES = new WeakSet\(\);/);
  assert.match(source, /SANITIZED_MATRICES\.has\(matrix\)/);
  assert.doesNotMatch(source, /matrix\.__sanitized/);
});

test('warehouse audit resumes from an atomic fixed-cutoff checkpoint', () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../scripts/audit-solved-spots-warehouse.js'),
    'utf8',
  );
  assert.match(source, /consistencyModel: 'fixed created_at high-water mark with atomic per-chunk checkpoints'/);
  assert.match(source, /AND created_at <= \$4/);
  assert.match(source, /checkpoint\.currentCell = \{/);
  assert.match(source, /fs\.renameSync\(temporary, file\)/);
  assert.match(source, /fixed-cutoff hash set changed; refusing an unsafe resume/);
  assert.match(source, /Transient database interruption; resuming checkpoint/);
  assert.match(source, /attempt <= 8/);
  assert.match(source, /psql stream timeout after 16 minutes/);
  assert.match(source, /child\.kill\('SIGTERM'\)/);
  assert.match(source, /--include-unusable-hashes/);
  assert.match(source, /cell\.unusableScenarioHashes\.push\(String\(row\.scenario_hash\)\)/);
  assert.match(source, /row\.strategy_matrix_v2 && usable && !strict/);
  assert.match(source, /replacementRequiredRows/);
  assert.match(source, /matrix and board validated only; exact runtime node state and export provenance are audited separately/);
});

test('replacement manifest is exact, resumable, and never invents missing inputs', () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../scripts/build-training-solver-replacement-manifest.js'),
    'utf8',
  );
  assert.match(source, /replacementScenarioHashDigest: digest\(hashes\)/);
  assert.match(source, /unusableRowHashes\.length !== cell\.replacementRequiredRows/);
  assert.match(source, /duplicateDefectiveRows: cell\.replacementRequiredRows - hashes\.length/);
  assert.match(source, /missing_cell_requires_canonical_seed_inputs/);
  assert.match(source, /noInventedSolverInputs: true/);
  assert.match(source, /solverReady: false/);
  assert.match(source, /thisLedgerClassifiesMatrixDefectsOnly: true/);
  assert.match(source, /resuming replacement ledger/);
});

test('runtime-readiness audit never equates a salvageable matrix with an exact Training decision', () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../scripts/audit-training-solver-runtime-readiness.js'),
    'utf8',
  );
  assert.match(source, /matrixValidatedRows: 'Rows whose board and strategy payload passed/);
  assert.match(source, /runtimeServeableAtSnapshot: 0/);
  assert.match(source, /No warehouse row could carry the complete provenance seal/);
  assert.match(source, /deriveNodePotState\\\(v2\\\.node/);
  assert.match(source, /New river solves must target only the missing\/defective canonical decisions/);
  assert.match(source, /crossFamilyStackStreetFallbackAllowed: false/);
});

test('v2 audit requires 1326 normalized combo arrays', () => {
  const frequencies = { c: new Array(1326).fill(0.4), b50: new Array(1326).fill(0.6) };
  const hand_evs_bb = new Array(1326).fill(1.25);
  const result = validateV2Matrix({ actions: ['c', 'b50'], frequencies, hand_evs_bb });
  assert.equal(result.structurallyValid, true);
  assert.equal(result.credibleCombos, 1326);
  assert.equal(result.corruptCombos, 0);
  assert.equal(validateV2Matrix({ actions: ['c', 'b50'], frequencies }).structurallyValid, false);
  frequencies.b50[100] = 2;
  const corrupt = validateV2Matrix({ actions: ['c', 'b50'], frequencies, hand_evs_bb });
  assert.equal(corrupt.credibleCombos, 1325);
  assert.equal(corrupt.corruptCombos, 1);
});
