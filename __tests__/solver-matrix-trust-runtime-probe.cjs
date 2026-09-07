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

const { DeterministicGTOEngine } = require('../src/engines/DeterministicGTOEngine.js');
const {
  applyDeterministicEnginePatches,
  sanitizeStrategyMatrix,
} = require('../src/engines/deterministicEnginePatches.js');
const { selectTrustedSolverMatrix } = require('../src/lib/training/solverMatrixTrust.js');

const validatedV2 = {
  actions: ['c', 'f', 'r550'],
  frequencies: {
    c: new Array(1326).fill(0.3),
    f: new Array(1326).fill(0.6),
    r550: new Array(1326).fill(0.1),
  },
  hand_evs_bb: new Array(1326).fill(1),
  pot_bb: 5.5,
  eff_stack_bb: 97.25,
  node: 'r:0:b275',
  street: 'flop',
  board: 'AhKd2c',
  hero: 'IP',
  position: 'BTN',
  oop_player: 'BB',
  ip_player: 'BTN',
  rake: '0 0 0 0',
  tree_geometry: 'hu_cash_srp_v1',
  solver: 'PioSOLVER',
};

const trustedMatrix = selectTrustedSolverMatrix({ strategy_matrix_v2: validatedV2 });
assert.ok(trustedMatrix);
sanitizeStrategyMatrix(trustedMatrix);
assert.deepEqual(trustedMatrix.actions, ['c', 'f', 'r550']);

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
assert.equal(v2Question.correctAnswer, 'f');
assert.ok(v2Question.options.some((option) => option.id === 'f' && option.text === 'Fold'));

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
