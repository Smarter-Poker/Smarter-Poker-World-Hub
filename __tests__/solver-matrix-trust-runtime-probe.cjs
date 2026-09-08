'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const babel = require('@babel/core');

const originalJavaScriptLoader = Module._extensions['.js'];
Module._extensions['.js'] = function transpileRepositoryModule(module, filename) {
  if (filename.includes('node_modules')) return originalJavaScriptLoader(module, filename);
  const source = fs.readFileSync(filename, 'utf8');
  if (!/\b(import|export)\b/.test(source)) return originalJavaScriptLoader(module, filename);
  const transformed = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    parserOpts: {
      plugins: [
        'jsx',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
        'objectRestSpread',
      ],
    },
  });
  module._compile(transformed.code, filename);
};

const {
  DeterministicGTOEngine,
  selectExactContinuationBetSourceAction,
} = require('../src/engines/DeterministicGTOEngine.js');
const {
  applyDeterministicEnginePatches,
  rebindRawFrequenciesToCanonicalPolicy,
  sanitizeStrategyMatrix,
} = require('../src/engines/deterministicEnginePatches.js');
const { selectTrustedSolverMatrix } = require('../src/lib/training/solverMatrixTrust.js');
const { committedFor, computeDisplayPot } = require('../src/components/training/games/potMath.js');

const validatedV2 = {
  actions: ['c', 'f', 'b550'],
  frequencies: {
    c: new Array(1326).fill(0.3),
    f: new Array(1326).fill(0.6),
    b550: new Array(1326).fill(0.1),
  },
  hand_evs_bb: new Array(1326).fill(1),
  pot_bb: 5.5,
  eff_stack_bb: 97.25,
  node: 'r:0:b275',
  street: 'flop',
  board: ['Ah', 'Kd', '2c'],
  hero: 'IP',
  position: 'BTN',
  oop_player: 'BB',
  ip_player: 'BTN',
  rake: '0 0',
  tree_geometry: 'hu_cash_srp_v1',
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
    starting_pot_chips: 550,
    achieved_exploitability_chips: 0.275,
    achieved_exploitability_fraction: 0.0005,
  },
};

const trustedMatrix = selectTrustedSolverMatrix({ strategy_matrix_v2: validatedV2 });
assert.ok(trustedMatrix);
sanitizeStrategyMatrix(trustedMatrix);
assert.deepEqual(trustedMatrix.actions, ['c', 'f', 'b550']);

const nonPioRaiseToken = {
  ...validatedV2,
  actions: ['c', 'f', 'r550'],
  frequencies: {
    c: new Array(1326).fill(0.3),
    f: new Array(1326).fill(0.6),
    r550: new Array(1326).fill(0.1),
  },
};
assert.equal(
  selectTrustedSolverMatrix({ strategy_matrix_v2: nonPioRaiseToken }),
  null,
  'raw V2 must reject rNNN because official Pio NodeIDs use bNNN for bets and raises',
);

const unsafeLegacyMatrix = {
  actions: ['c', 'f'],
  frequencies: { c: { AKs: 0.4 }, f: { AKs: 0.6 } },
  hand_evs: { AKs: 1 },
  pot: 825,
  pot_bb: 8.25,
  node_state_exact: true,
  node_actor: 1,
  hero: 'IP',
  position: 'BTN',
  oop_player: 'BB',
  ip_player: 'BTN',
};
const directUnsafeCopy = structuredClone(unsafeLegacyMatrix);
sanitizeStrategyMatrix(directUnsafeCopy);
assert.deepEqual(directUnsafeCopy.actions, []);
assert.deepEqual(directUnsafeCopy.frequencies, {});

const mutatedAfterSanitize = {
  actions: ['c', 'b33'],
  frequencies: {
    c: { AKs: 0.5 },
    b33: { AKs: 0.5 },
  },
};
sanitizeStrategyMatrix(mutatedAfterSanitize);
mutatedAfterSanitize.actions.push('f');
mutatedAfterSanitize.frequencies.f = { AKs: 0.2 };
sanitizeStrategyMatrix(mutatedAfterSanitize);
assert.deepEqual(mutatedAfterSanitize.actions, []);
assert.deepEqual(mutatedAfterSanitize.frequencies, {});

const baseScenario = {
  scenario_hash: 'hu_cash_BTN_100bb_AhKd2c',
  street: 'flop',
  stack_depth: 100,
  game_type: 'hu_cash',
  solver_version: 'PioSOLVER-3.0',
  solver_binary_checksum: 'a'.repeat(64),
  machine_id: 'M1',
  pipeline_commit: 'b'.repeat(40),
  manifest_version: '5',
  manifest_checksum: 'c'.repeat(64),
  source_artifact_checksum: 'd'.repeat(64),
  audited_at: '2026-09-06T00:00:00.000Z',
};
const gameConfig = { pioGameType: 'hu_cash', pioStackDepth: 100 };

const coreEngine = new DeterministicGTOEngine();
const coreV2Question = coreEngine.buildQuestionFromScenario({
  ...baseScenario,
  id: 'core-trusted-v2',
  strategy_matrix: structuredClone(unsafeLegacyMatrix),
  strategy_matrix_v2: validatedV2,
}, gameConfig, 5, 0);
assert.ok(coreV2Question);
assert.equal(coreV2Question.correctAnswer, 'f');
assert.equal(coreEngine.buildQuestionFromScenario({
  ...baseScenario,
  id: 'core-unsafe-v1',
  strategy_matrix: structuredClone(unsafeLegacyMatrix),
  strategy_matrix_v2: null,
}, gameConfig, 5, 0), null);

const engine = applyDeterministicEnginePatches(new DeterministicGTOEngine());
const v2Question = engine.buildQuestionFromScenario({
  ...baseScenario,
  id: 'trusted-v2',
  strategy_matrix: structuredClone(unsafeLegacyMatrix),
  strategy_matrix_v2: validatedV2,
  quality_status: 'validated',
}, gameConfig, 5, 0);
assert.ok(v2Question);
assert.equal(v2Question.correctAnswer, 'fold');
assert.ok(v2Question.options.some((option) => option.id === 'fold' && option.text === 'Fold'));
assert.ok(v2Question.solverPolicy.actions.some(
  (action) => action.id === 'fold' && action.sourceCode === 'f',
));
assert.deepEqual(
  new Set(Object.keys(v2Question.rawFrequencies)),
  new Set(v2Question.solverPolicy.actions.map((action) => action.id)),
);
assert.ok(!Object.hasOwn(v2Question.rawFrequencies, 'c'));
assert.ok(!Object.hasOwn(v2Question.rawFrequencies, 'f'));
assert.ok(!Object.hasOwn(v2Question.rawFrequencies, 'b550'));

const turnV2 = {
  ...validatedV2,
  actions: ['c', 'b1442'],
  frequencies: {
    c: new Array(1326).fill(0.4),
    b1442: new Array(1326).fill(0.6),
  },
  node: 'r:0:c:b412:c:2d:c',
  street: 'turn',
  board: ['Ah', 'Kd', '2c', '2d'],
};
const turnQuestion = engine.buildQuestionFromScenario({
  ...baseScenario,
  id: 'turn-cumulative-target',
  scenario_hash: 'turn_hu_cash_BTN_100bb_AhKd2c2d',
  street: 'turn',
  strategy_matrix_v2: turnV2,
  quality_status: 'validated',
}, gameConfig, 7, 0, 'AKs');
assert.ok(turnQuestion);
assert.equal(turnQuestion.scenario.nextStreetContinuationAction, 'b1442');
const turnBet = turnQuestion.solverPolicy.actions.find((action) => action.sourceCode === 'b1442');
assert.equal(turnBet.id, 'bet_74_96pct');
assert.equal(turnBet.label, 'Bet 75% Pot');
assert.equal(turnBet.size.chips, 1030);
assert.equal(turnBet.size.bigBlinds, 10.3);
assert.deepEqual(Object.keys(turnQuestion.rawFrequencies), ['check', 'bet_74_96pct']);
assert.ok(!Object.hasOwn(turnQuestion.rawFrequencies, 'b1442'));

const facingReraiseV2 = {
  ...validatedV2,
  actions: ['f', 'c', 'b6000', 'b9750'],
  frequencies: {
    f: new Array(1326).fill(0.2),
    c: new Array(1326).fill(0.2),
    b6000: new Array(1326).fill(0.4),
    b9750: new Array(1326).fill(0.2),
  },
  node: 'r:0:c:b412:c:2d:b1442:b3502',
  street: 'turn',
  board: ['Ah', 'Kd', '2c', '2d'],
  hero: 'OOP',
  position: 'BB',
  oop_player: 'BB',
  ip_player: 'BTN',
  eff_stack_bb: 97.5,
};
const facingReraiseQuestion = engine.buildQuestionFromScenario({
  ...baseScenario,
  id: 'turn-facing-reraise-total-to',
  scenario_hash: 'turn_hu_cash_BB_100bb_AhKd2c2d',
  street: 'turn',
  strategy_matrix_v2: facingReraiseV2,
  quality_status: 'validated',
}, gameConfig, 7, 0, 'AKs');
assert.ok(facingReraiseQuestion);
assert.equal(facingReraiseQuestion.scenario.nodeType, 'hero_faces_bet');
assert.equal(facingReraiseQuestion.scenario.villainBet, 20.6,
  'the decision state preserves the 20.6 BB increment hero must call');
assert.equal(facingReraiseQuestion.scenario.villainCommittedTotal, 30.9,
  'the felt receives villain current-street total-to, not the call increment');
assert.equal(facingReraiseQuestion.scenario.pot, 54.94);
assert.match(facingReraiseQuestion.scenario.action, /bets into/);
assert.doesNotMatch(facingReraiseQuestion.scenario.action, /jams into/);
const villainHistory = [{
  position: 'BTN',
  action: facingReraiseQuestion.scenario.action,
  amount: facingReraiseQuestion.scenario.villainCommittedTotal,
}];
assert.equal(committedFor({ name: 'BTN' }, villainHistory, false), 30.9);
assert.equal(computeDisplayPot({
  scenarioPot: facingReraiseQuestion.scenario.pot,
  streetLabel: 'TURN',
  seats: [{ name: 'BTN' }, { name: 'BB' }],
  actionHistory: villainHistory,
}), 54.94, 'the exact reconstructed node pot remains the postflop felt authority');

const exactIpNode = (overrides = {}) => ({
  pot: 1374,
  hero: 'IP',
  node_actor: 1,
  node_state_exact: true,
  eff_stack_bb: 97.5,
  actor_contribution_chips: 412,
  facing_bet_bb: 0,
  ...overrides,
});
assert.equal(
  selectExactContinuationBetSourceAction(exactIpNode(), ['c', 'b1442', 'b3502', 'b9750']),
  'b1442',
  'b1442 is a 1,030-chip increment into the 1,374-chip Turn pot',
);
assert.equal(
  selectExactContinuationBetSourceAction(exactIpNode({
    pot: 550,
    actor_contribution_chips: 0,
  }), ['c', 'b412']),
  'b412',
  'the same cumulative-target calculation is exact at a Flop IP check node',
);
assert.equal(
  selectExactContinuationBetSourceAction(exactIpNode({
    pot: 3434,
    actor_contribution_chips: 1442,
  }), ['c', 'b4018']),
  'b4018',
  'later cumulative contributions remain exact at a River IP check node',
);
assert.equal(selectExactContinuationBetSourceAction(exactIpNode({
  hero: 'OOP', node_actor: 0, actor_contribution_chips: 0, pot: 550,
}), ['c', 'b412']), null, 'the OOP Flop root cannot advertise the IP-only continuation');
assert.equal(selectExactContinuationBetSourceAction(exactIpNode({ facing_bet_bb: 10.3 }), ['c', 'b3502']), null,
  'a facing node cannot advertise a check/bet continuation');
assert.equal(selectExactContinuationBetSourceAction(exactIpNode(), ['c', 'b9750']), null,
  'an all-in cumulative target is not mistaken for a 75%-pot continuation');
assert.equal(selectExactContinuationBetSourceAction(exactIpNode(), ['c', 'b1300']), null,
  'an off-tree size is not selected');
assert.equal(selectExactContinuationBetSourceAction(exactIpNode({
  pot: 12784,
}), ['c', 'b10000']), null, 'a target beyond the exact effective stack is never a continuation');
assert.equal(selectExactContinuationBetSourceAction(exactIpNode({ node_state_exact: false }), ['c', 'b1442']), null,
  'an inexact node state cannot mint continuation lineage');
assert.equal(selectExactContinuationBetSourceAction(exactIpNode({ actor_contribution_chips: null }), ['c', 'b1442']), null,
  'a missing actor contribution cannot be treated as zero');
for (const actions of [
  ['c', 'b1435', 'b1449'],
  ['b1449', 'b1435', 'c'],
]) {
  assert.equal(
    selectExactContinuationBetSourceAction(exactIpNode(), actions),
    null,
    'two in-tolerance continuation sizes are ambiguous regardless of export order',
  );
}

const canonicalRangePolicy = [
  {
    id: 'check', sourceCode: 'c', family: 'check', label: 'Check', legal: true,
    size: { unit: 'none', chips: 0, bigBlinds: 0, potFraction: 0, exact: true },
  },
  {
    id: 'bet_75pct', sourceCode: 'b1442', family: 'bet', label: 'Bet 75% Pot', legal: true,
    size: { unit: 'pot_fraction', chips: 1030, bigBlinds: 10.3, potFraction: 10.3 / 13.74, exact: true },
  },
];
assert.deepEqual(rebindRawFrequenciesToCanonicalPolicy({
  c: { AKs: 0.4 },
  b1442: { AKs: 0.6 },
}, canonicalRangePolicy), {
  check: { AKs: 0.4 },
  bet_75pct: { AKs: 0.6 },
});
assert.equal(rebindRawFrequenciesToCanonicalPolicy({ b9999: { AKs: 1 } }, canonicalRangePolicy), null,
  'unowned source tokens fail the optional range artifact closed');

const policyEquivalentAliases = [
  canonicalRangePolicy[1],
  { ...structuredClone(canonicalRangePolicy[1]), sourceCode: 'b1443' },
];
assert.deepEqual(rebindRawFrequenciesToCanonicalPolicy({
  b1442: { AKs: 0.2 },
  b1443: { AKs: 0.3 },
}, policyEquivalentAliases), {
  bet_75pct: { AKs: 0.5 },
}, 'policy-equivalent source aliases may merge into the one canonical action id');
assert.equal(rebindRawFrequenciesToCanonicalPolicy({ b1442: { AKs: 0.2 } }, [
  canonicalRangePolicy[1],
  { ...structuredClone(canonicalRangePolicy[1]), sourceCode: 'b1443', label: 'Bet 80% Pot' },
]), null, 'incompatible source aliases can never merge');

const v1Question = engine.buildQuestionFromScenario({
  ...baseScenario,
  id: 'unsafe-v1',
  strategy_matrix: structuredClone(unsafeLegacyMatrix),
  strategy_matrix_v2: null,
}, gameConfig, 5, 0);
assert.equal(v1Question, null);

process.stdout.write(JSON.stringify({
  directCoreV2FoldPreserved: true,
  validV2FoldPreserved: true,
  legacyV1FoldQuarantined: true,
  mutatedLegacyV1FoldQuarantined: true,
  legacyV1Question: null,
}));
