import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const API_SOURCE = read('pages/api/training/next-street.js');

async function loadAuthorityHelpers() {
  class TrainingGradingReceiptError extends Error {}
  const dependencies = {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: null }) },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/engines/DeterministicGTOEngine': { deterministicEngine: {} },
    '../../../src/engines/deterministicEnginePatches': {
      applyDeterministicEnginePatches: (engine) => engine,
      toHandClass: (cards) => Array.isArray(cards) && cards.length === 2 ? 'AKo' : String(cards || ''),
    },
    '../../../src/services/PIOQueryService': { pioQueryService: {} },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/utils/trainingApiUtils': { withTiming: () => {} },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/training/questionContract.mjs': {
      enforceTrainingQuestionContract: (question) => question,
      isTrainingQuestionValid: () => true,
    },
    '../../../src/lib/training/gradingReceipt.mjs': {
      prepareTrainingQuestionForDelivery: (value) => value,
      TrainingGradingReceiptError,
      trainingQuestionDigest: () => 'digest',
      verifyTrainingGradingReceipt: () => ({}),
      verifyTrainingGradingReceiptEnvelope: () => ({ payload: {} }),
    },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      buildTrainingQuestionSnapshot: () => ({}),
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async () => ({ data: null }),
      trainingPersistenceUnavailableBody: () => ({}),
    },
  };
  const module = new SourceTextModule(API_SOURCE, { identifier: 'next-street.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected next-street dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}

async function loadEnginePatchHelpers() {
  const source = read('src/engines/deterministicEnginePatches.js');
  const bridgeV2Matrix = (v2) => ({
    actions: ['c', 'b412'],
    frequencies: { c: { AKo: 0.4 }, b412: { AKo: 0.6 } },
    hand_evs: { AKo: 1.25 },
    node: v2.node,
    board: v2.board,
    street: v2.street,
    hero: v2.hero,
    position: v2.position,
    oop_player: v2.oop_player,
    ip_player: v2.ip_player,
    pot_bb: 13.74,
    root_pot_bb: v2.pot_bb,
    eff_stack_bb: 95.88,
  });
  const dependencies = {
    '../utils/v2Matrix': {
      v2ToAppMatrix: bridgeV2Matrix,
    },
    '../lib/training/solverDecisionEvidence': { enforceSolverClaimHonesty: (question) => question },
    '../lib/training/solverRowIdentity.mjs': { isSolverRowIdentityValid: () => true },
  };
  const v2Module = new SyntheticModule(['v2ToAppMatrix'], function setV2Exports() {
    this.setExport('v2ToAppMatrix', bridgeV2Matrix);
  });
  const solverMatrixTrustModule = new SourceTextModule(
    read('src/lib/training/solverMatrixTrust.js'),
    { identifier: 'solverMatrixTrust.js' },
  );
  await solverMatrixTrustModule.link(async (specifier) => {
    assert.equal(specifier, '../../utils/v2Matrix.js');
    return v2Module;
  });
  const module = new SourceTextModule(source, { identifier: 'deterministicEnginePatches.js' });
  await module.link(async (specifier) => {
    if (specifier === '../lib/training/solverMatrixTrust') return solverMatrixTrustModule;
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected engine-patch dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}

function exactParentQuestion(overrides = {}) {
  return {
    id: 'parent-1',
    dataQuality: 'SOLVER_EXACT',
    heroCards: ['9h', '8h'],
    options: [
      { id: 'c', text: 'Check' },
      { id: 'b275', text: 'Bet 50%' },
      { id: 'b412', text: 'Bet 75%' },
      { id: 'b550', text: 'Bet 100%' },
    ],
    scenario: {
      board: 'As Kd Qc',
      street: 'flop',
      gameType: '6max_cash',
      scenarioHash: '6max_cash_BTN_100bb_AsKdQc',
      heroHand: 'AKo',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 5.5,
      stackDepth: 100,
      solverNode: 'r:0:c',
      solverActionUnits: 'chips',
      nodeType: 'hero_bets_or_checks',
      nextStreetContinuationAction: 'b412',
      solverLineage: {
        rootPotBb: 5.5,
        effectiveStackBb: 97.5,
        rake: '0 0 0 0',
        treeGeometry: 'srp_parameterized_v2',
        oopPosition: 'BB',
        ipPosition: 'BTN',
      },
    },
    solverProvenance: {
      verified: true,
      source: 'PioSOLVER',
      scenarioHash: '6max_cash_BTN_100bb_AsKdQc',
      solverVersion: 'PioSOLVER-3.0',
      solverBinaryChecksum: 'a'.repeat(64),
      machineId: 'M1',
      pipelineCommit: 'b'.repeat(40),
      manifestVersion: '5',
      manifestChecksum: 'c'.repeat(64),
      sourceArtifactChecksum: 'd'.repeat(64),
      qualityStatus: 'validated',
      auditedAt: '2026-09-06T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('next-street accepts only an authenticated signed POST continuation', () => {
  const api = read('pages/api/training/next-street.js');

  assert.match(api, /req\.method !== 'POST'/);
  assert.match(api, /LIMITS\.write/);
  assert.match(api, /verifyTrainingGradingReceiptEnvelope\(gradingReceipt/);
  assert.match(api, /verifyTrainingGradingReceipt\(gradingReceipt/);
  assert.match(api, /training_question_snapshots/);
  assert.doesNotMatch(api, /req\.query/);
  assert.doesNotMatch(api, /rawHeroCards|rawSessionId|sanitizeParam/);
});

test('continuation is gated on the exact persisted predecessor decision', () => {
  const api = read('pages/api/training/next-street.js');

  assert.match(api, /from\('training_answers'\)/);
  for (const binding of [
    "eq('user_id', user.id)",
    "eq('submission_id', receiptPayload.jti)",
    "eq('attempt_id', receiptPayload.attemptId)",
    "eq('hand_ordinal', receiptPayload.handOrdinal)",
    "eq('decision_ordinal', receiptPayload.decisionOrdinal)",
    "eq('snapshot_key', receiptPayload.snapshotKey)",
  ]) {
    assert.ok(api.includes(`.${binding}`), binding);
  }
  assert.match(api, /select\('[^']*answer_id[^']*'\)/);
  assert.match(api, /validatePersistedContinuationDecision\([\s\S]*precedingResult\.data\.answer_id/);
  assert.match(api, /TRAINING_CONTINUATION_ACTION_MISMATCH/);
  assert.match(api, /TRAINING_CONTINUATION_ACTION_INVALID/);
  assert.match(api, /TRAINING_CONTINUATION_PRECEDING_ANSWER_REQUIRED/);
  assert.match(api, /nextDecisionOrdinal = Number\(receiptPayload\.decisionOrdinal\) \+ 1/);
  assert.match(api, /countsTowardCompletion: false/);
  assert.match(api, /code: 'TRAINING_CONTINUATION_SOLVER_MISS'/);
});

test('continuation state and delivery are reconstructed from immutable server data', () => {
  const api = read('pages/api/training/next-street.js');

  assert.match(api, /authoritativeHandState\(parentSnapshot\.question_data\)/);
  assert.match(api, /new Set\(normalizedCards\)\.size === normalizedCards\.length/);
  assert.match(api, /queryNextStreet\(\{/);
  assert.match(api, /buildTrainingQuestionSnapshot\(\{/);
  assert.match(api, /trainingQuestionDigest\(storedSnapshot\.question_data\)/);
  assert.match(api, /prepareTrainingQuestionForDelivery\(\{/);
  assert.match(api, /sessionId: receiptPayload\.sessionId/);
  assert.match(api, /attemptId: receiptPayload\.attemptId/);
  assert.match(api, /handOrdinal: receiptPayload\.handOrdinal/);
  assert.match(api, /difficultyMode: receiptPayload\.difficultyMode/);
});

test('persisted predecessor answer must exactly select the canonical non-terminal branch', async () => {
  const { validatePersistedContinuationDecision } = await loadAuthorityHelpers();
  const parent = exactParentQuestion();

  assert.deepEqual(
    { ...validatePersistedContinuationDecision(parent, 'b412') },
    { ok: true, action: 'b412' },
  );
  assert.equal(
    validatePersistedContinuationDecision(parent, 'c').code,
    'TRAINING_CONTINUATION_ACTION_MISMATCH',
  );
  assert.equal(
    validatePersistedContinuationDecision(parent, undefined).code,
    'TRAINING_CONTINUATION_ACTION_MISMATCH',
  );

  for (const invalidAction of ['', 'fold', 'f', 'allin', 'call', 'r824', 'Bet 75%']) {
    const invalid = exactParentQuestion({
      scenario: {
        ...parent.scenario,
        nextStreetContinuationAction: invalidAction,
      },
    });
    assert.equal(
      validatePersistedContinuationDecision(invalid, invalidAction).code,
      'TRAINING_CONTINUATION_ACTION_INVALID',
      invalidAction,
    );
  }

  const absentFromTree = exactParentQuestion({ options: parent.options.filter(({ id }) => id !== 'b412') });
  assert.equal(
    validatePersistedContinuationDecision(absentFromTree, 'b412').code,
    'TRAINING_CONTINUATION_ACTION_INVALID',
  );
});

test('exact parent/action lineage derives one child node and rejects mismatched release identity', async () => {
  const {
    authoritativeHandState,
    buildExactContinuationLineage,
  } = await loadAuthorityHelpers();
  const parent = exactParentQuestion();
  const state = authoritativeHandState(parent);
  assert.equal(state.valid, true);

  const lineage = buildExactContinuationLineage({
    parentQuestion: parent,
    gameConfig: { pioGameType: '6max_cash', pioStackDepth: 100 },
    state,
    nextBoard: ['As', 'Kd', 'Qc', 'Jh'],
    continuationAction: 'b412',
  });
  assert.equal(lineage.parentScenarioHash, '6max_cash_BTN_100bb_AsKdQc');
  assert.equal(lineage.childScenarioHash, 'turn_6max_cash_BTN_100bb_AsKdQcJh');
  assert.equal(lineage.childNode, 'r:0:c:b412:c:Jh:c');

  const wrongRelease = exactParentQuestion({
    solverProvenance: { ...parent.solverProvenance, pipelineCommit: 'e'.repeat(39) },
  });
  assert.equal(buildExactContinuationLineage({
    parentQuestion: wrongRelease,
    gameConfig: { pioGameType: '6max_cash', pioStackDepth: 100 },
    state,
    nextBoard: ['As', 'Kd', 'Qc', 'Jh'],
    continuationAction: 'b412',
  }), null);
});

test('child binding preserves exact child pot and stack instead of parent pre-action geometry', async () => {
  const {
    authoritativeHandState,
    bindExactContinuationQuestion,
    buildExactContinuationLineage,
  } = await loadAuthorityHelpers();
  const parent = exactParentQuestion();
  const state = authoritativeHandState(parent);
  const nextBoard = ['As', 'Kd', 'Qc', 'Jh'];
  const lineage = buildExactContinuationLineage({
    parentQuestion: parent,
    gameConfig: { pioGameType: '6max_cash', pioStackDepth: 100 },
    state,
    nextBoard,
    continuationAction: 'b412',
  });
  const generated = {
    id: 'child-1',
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: {
      verified: true,
      source: 'PioSOLVER',
      scenarioHash: lineage.childScenarioHash,
      solverVersion: lineage.release.solverVersion,
      solverBinaryChecksum: lineage.release.solverBinaryChecksum,
      machineId: 'M2',
      pipelineCommit: lineage.release.pipelineCommit,
      manifestVersion: lineage.release.manifestVersion,
      manifestChecksum: lineage.release.manifestChecksum,
      sourceArtifactChecksum: 'e'.repeat(64),
      qualityStatus: 'validated',
      auditedAt: '2026-09-06T00:00:00.000Z',
    },
    scenario: {
      scenarioHash: lineage.childScenarioHash,
      solverNode: lineage.childNode,
      street: 'turn',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      boardCards: nextBoard,
      pot: 13.74,
      stackDepth: 95.88,
      solverStackDepth: 100,
      solverLineage: { ...lineage.release },
    },
  };
  const bound = bindExactContinuationQuestion(generated, { state, nextBoard, lineage });
  assert.equal(bound.scenario.pot, 13.74);
  assert.equal(bound.scenario.stackDepth, 95.88);
  assert.notEqual(bound.scenario.pot, state.pot);
  assert.notEqual(bound.scenario.stackDepth, state.effectiveStackDepth);

  assert.doesNotMatch(API_SOURCE, /pot:\s*state\.pot/);
  assert.doesNotMatch(API_SOURCE, /stackDepth:\s*state\.stackDepth,[\s\S]{0,160}isMultiStreet/);
});

test('a deterministic first-card miss still selects a later exact solved runout', async () => {
  const {
    authoritativeHandState,
    buildExactContinuationLineage,
  } = await loadAuthorityHelpers();
  const {
    applyDeterministicEnginePatches,
    orderedExactContinuationCandidates,
  } = await loadEnginePatchHelpers();
  const parent = exactParentQuestion();
  const state = authoritativeHandState(parent);
  const gameConfig = { pioGameType: '6max_cash', pioStackDepth: 100 };
  const first = buildExactContinuationLineage({
    parentQuestion: parent,
    gameConfig,
    state,
    nextBoard: ['As', 'Kd', 'Qc', 'Jh'],
    continuationAction: 'b412',
  });
  const later = buildExactContinuationLineage({
    parentQuestion: parent,
    gameConfig,
    state,
    nextBoard: ['As', 'Kd', 'Qc', 'Ts'],
    continuationAction: 'b412',
  });
  const exactLaterRow = {
    scenario_hash: later.childScenarioHash,
    street: later.childStreet,
    game_type: later.gameType,
    stack_depth: later.solverStackDepth,
    strategy_matrix_v2: {
      node: later.childNode,
      board: later.boardCards.join(''),
      street: later.childStreet,
      position: later.heroPosition,
      hero: 'IP',
      oop_player: later.villainPosition,
      ip_player: later.heroPosition,
      pot_bb: later.release.rootPotBb,
      eff_stack_bb: later.release.effectiveStackBb,
      rake: later.release.rake,
      tree_geometry: later.release.treeGeometry,
      solver: 'PioSOLVER',
    },
    quality_status: 'validated',
    solver_version: later.release.solverVersion,
    solver_binary_checksum: later.release.solverBinaryChecksum,
    machine_id: 'M1',
    pipeline_commit: later.release.pipelineCommit,
    manifest_version: later.release.manifestVersion,
    manifest_checksum: later.release.manifestChecksum,
    source_artifact_checksum: 'e'.repeat(64),
    audited_at: '2026-09-06T00:00:00.000Z',
  };

  const candidates = orderedExactContinuationCandidates([exactLaterRow], [first, later]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].lineage.childScenarioHash, later.childScenarioHash);
  assert.equal(candidates[0].row, exactLaterRow);

  const queryCalls = [];
  const query = {};
  for (const method of ['from', 'select', 'in', 'eq', 'not']) {
    query[method] = (...args) => {
      queryCalls.push([method, ...args]);
      return query;
    };
  }
  query.limit = async (limit) => {
    queryCalls.push(['limit', limit]);
    return { data: [exactLaterRow], error: null };
  };
  const engine = {
    db: { from: (...args) => query.from(...args) },
    getStreetForLevel: () => 'flop',
    buildQuestionFromScenario: (scenario) => ({
      id: 'later-child',
      options: [{ id: 'c', text: 'Check' }, { id: 'b412', text: 'Bet' }],
      correctAnswer: 'b412',
      gtoFrequencies: { c: 40, b412: 60 },
      scenario: {
        scenarioHash: scenario.scenario_hash,
        solverNode: scenario.strategy_matrix.node,
        street: scenario.street,
        heroPosition: scenario.strategy_matrix.position,
        villainPosition: scenario.strategy_matrix.oop_player,
        boardCards: scenario.strategy_matrix.board.match(/.{2}/g),
      },
    }),
  };
  applyDeterministicEnginePatches(engine);
  const generated = await engine.queryNextStreet({
    gameConfig,
    heroHand: 'AKo',
    street: 'turn',
    stackDepth: 100,
    heroPosition: 'BTN',
    villainPosition: 'BB',
    continuationLineages: [first, later],
  });
  assert.equal(generated.scenario.scenarioHash, later.childScenarioHash);
  assert.equal(generated.scenario.solverNode, later.childNode);
  assert.equal(generated.scenario.pot, 13.74);
  assert.equal(generated.scenario.stackDepth, 95.88);
  assert.deepEqual(
    queryCalls.find(([method, field]) => method === 'in' && field === 'scenario_hash')[2],
    [first.childScenarioHash, later.childScenarioHash],
  );

  const engineSource = read('src/engines/deterministicEnginePatches.js');
  assert.match(engineSource, /\.in\('scenario_hash', lineageChunk\.map/);
  assert.match(engineSource, /MAX_CONTINUATION_RUNOUTS = 47/);
  assert.doesNotMatch(engineSource, /chooseDeterministicEducationalCard[\s\S]*queryNextStreet/);
});
