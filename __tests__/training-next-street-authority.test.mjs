import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

import {
  NODE_SEMANTICS,
  POLICY_KIND,
  QUALITY_SEAL,
  createSolverPolicyAnswer,
  createSolverPolicyKey,
  normalizeBoard,
  normalizeHolding,
} from '../src/lib/training/solverPolicyContract.js';
import {
  alignQuestionToCanonicalPolicy,
  sourceClassificationForQuestion,
} from '../src/lib/training/cacheTruthContract.mjs';
import {
  isExactPioRake,
  v2ArtifactEnvelopeIsExact,
} from '../src/utils/v2Matrix.js';
import {
  buildTrainingAttestationContinuationPrecommit,
  isTrainingAttestationContinuationPrecommit,
  selectPublicAttestationContinuationAnswer,
  TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
} from '../src/lib/training/trainingAttestationContinuationContract.mjs';
import { applyDifficultyToQuestion } from '../src/lib/training/difficultyQuestionContract.mjs';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const API_SOURCE = read('pages/api/training/next-street.js');

async function loadAuthorityHelpers({
  user = null,
  supabase = {},
  receiptPayload = {},
  parentSnapshot = null,
  existingContinuation = null,
  onPreparedQuestion = null,
  onServedQuestion = null,
  executePersistenceQuery = null,
} = {}) {
  class TrainingGradingReceiptError extends Error {}
  const continuationDependencies = {
    '../../engines/deterministicEnginePatches.js': {
      toHandClass: (cards) => Array.isArray(cards) && cards.length === 2 ? 'AKo' : String(cards || ''),
    },
    './questionContract.mjs': {
      enforceTrainingQuestionContract: (question) => question,
      isTrainingQuestionValid: () => true,
    },
    './cacheTruthContract.mjs': { sourceClassificationForQuestion },
    './solverPolicyContract.js': { normalizeBoard, normalizeHolding },
    './difficultyQuestionContract.mjs': { applyDifficultyToQuestion },
    '../../utils/v2Matrix.js': { isExactPioRake },
    './trainingAttestationContinuationContract.mjs': {
      isTrainingAttestationContinuationPrecommit,
      selectPublicAttestationContinuationAnswer,
    },
  };
  const continuationModule = new SourceTextModule(
    read('src/lib/training/trainingContinuationEligibility.mjs'),
    { identifier: 'trainingContinuationEligibility.mjs' },
  );
  await continuationModule.link(async (specifier) => {
    const exports = continuationDependencies[specifier];
    assert.ok(exports, `unexpected continuation dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await continuationModule.evaluate();
  const dependencies = {
    'node:crypto': { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user, error: null }) },
    '../../../src/lib/supabaseServerClient': { createClient: () => supabase },
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
    '../../../src/lib/training/cacheTruthContract.mjs': { sourceClassificationForQuestion },
    '../../../src/lib/training/solverPolicyContract.js': { normalizeBoard, normalizeHolding },
    '../../../src/utils/v2Matrix.js': { isExactPioRake },
    '../../../src/lib/training/gradingReceipt.mjs': {
      prepareTrainingQuestionForDelivery: (value) => {
        onPreparedQuestion?.(value);
        return value;
      },
      TrainingGradingReceiptError,
      trainingQuestionDigest: () => 'digest',
      verifyTrainingGradingReceipt: () => ({}),
      verifyTrainingGradingReceiptEnvelope: () => ({ payload: receiptPayload }),
    },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      buildTrainingQuestionSnapshot: () => ({}),
      readTrainingAttemptContinuation: async () => existingContinuation,
      recordTrainingQuestionsServedForAttempt: async (_client, value) => {
        onServedQuestion?.(value);
        return { questionCount: 1 };
      },
      registerTrainingAttemptContinuation: async () => ({ snapshot: {} }),
      trainingAttemptDecisionServeKey: (attemptId, handOrdinal, decisionOrdinal) => (
        `training-attempt:${attemptId}:hand:${handOrdinal}:decision:${decisionOrdinal}`
      ),
      trainingQuestionSnapshotMatchesIdentity: () => true,
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: executePersistenceQuery
        || (async () => ({ data: parentSnapshot })),
      trainingPersistenceUnavailableBody: () => ({}),
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      buildTrainingCacheRow: () => ({}),
      withPersistedCacheReceipt: (question) => question,
    },
  };
  const module = new SourceTextModule(API_SOURCE, { identifier: 'next-street.js' });
  await module.link(async (specifier) => {
    if (specifier === '../../../src/lib/training/trainingContinuationEligibility.mjs') {
      return continuationModule;
    }
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected next-street dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return { ...module.namespace, ...continuationModule.namespace };
}

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadEnginePatchHelpers() {
  const source = read('src/engines/deterministicEnginePatches.js');
  // Exercise the real trust-boundary replay. The continuation fixture below
  // must be a legal cumulative-target Pio node, not a permissive test shim.
  const { v2ToAppMatrix: bridgeV2Matrix } = await import('../src/utils/v2Matrix.js');
  const dependencies = {
    '../utils/v2Matrix.js': {
      isExactPioRake,
      v2ArtifactEnvelopeIsExact,
      v2ToAppMatrix: bridgeV2Matrix,
    },
    '../lib/training/solverDecisionEvidence.js': { enforceSolverClaimHonesty: (question) => question },
    '../lib/training/solverRowIdentity.mjs': { isSolverRowIdentityValid: () => true },
    '../services/SolverPolicyService.js': {
      normalizeSolvedPolicyRecord: (row) => ({
        valid: Boolean(row?.strategy_matrix_v2),
        metadata: row,
        matrix: row?.strategy_matrix_v2 ? bridgeV2Matrix(row.strategy_matrix_v2) : null,
        sourceV2: row?.strategy_matrix_v2 || null,
        provenanceComplete: true,
        defaultKey: null,
      }),
    },
    '../lib/training/cacheTruthContract.mjs': {
      alignQuestionToCanonicalPolicy,
      sourceClassificationForQuestion,
    },
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
    if (specifier === '../lib/training/solverMatrixTrust.js') return solverMatrixTrustModule;
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected engine-patch dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}

const SOLVER_BINARY_CHECKSUM = 'a'.repeat(64);
const PIPELINE_COMMIT = 'b'.repeat(40);
const MANIFEST_CHECKSUM = 'c'.repeat(64);
const SOURCE_ARTIFACT_CHECKSUM = 'd'.repeat(64);

function solverProvenance({
  scenarioHash,
  machineId = 'M1',
  sourceArtifactChecksum = SOURCE_ARTIFACT_CHECKSUM,
} = {}) {
  return {
    verified: true,
    source: 'PioSOLVER',
    scenarioHash,
    solverVersion: 'PioSOLVER-3.0',
    solverBinaryChecksum: SOLVER_BINARY_CHECKSUM,
    machineId,
    pipelineCommit: PIPELINE_COMMIT,
    manifestVersion: '5',
    manifestChecksum: MANIFEST_CHECKSUM,
    sourceArtifactChecksum,
    qualityStatus: 'validated',
    auditedAt: '2026-09-06T00:00:00.000Z',
  };
}

function derivedCanonicalPolicy({
  scenarioHash,
  sourceNode,
  street,
  boardCards,
  heroCards = ['9h', '8h'],
  heroPosition = 'BTN',
  villainPosition = 'BB',
  potBb,
  provenance,
  betSourceCode = 'b412',
  betChips = 412,
  betBigBlinds = 4.12,
  actions = null,
} = {}) {
  const key = createSolverPolicyKey({
    variant: 'nlh',
    bettingStructure: 'no_limit',
    tableSize: 2,
    positions: {
      hero: heroPosition,
      villains: [villainPosition],
      button: 'BTN',
      smallBlind: 'BTN',
      bigBlind: 'BB',
    },
    stackVector: [
      { seat: 0, position: heroPosition, stackBb: 100, active: true },
      { seat: 1, position: villainPosition, stackBb: 100, active: true },
    ],
    // These recorded v2 rows do not prove a complete canonical decision key.
    blinds: { complete: false },
    rake: { complete: false },
    tournamentUtility: { mode: 'cash', complete: true },
    payouts: [],
    bounties: [],
    street,
    board: boardCards,
    holding: heroCards,
    publicActionHistory: { complete: false, actions: [] },
    legalActions: [
      { action: 'check', exactChips: 0 },
      { action: 'bet', exactChips: betChips },
    ],
    sidePotEligibility: { complete: false, pots: [] },
  });
  return createSolverPolicyAnswer({
    key,
    kind: POLICY_KIND.DERIVED,
    node: {
      semantics: NODE_SEMANTICS.CHECK_OR_BET,
      sourceNode,
      actor: heroPosition,
      potBb,
      facingBetBb: 0,
    },
    actions: actions || [
      {
        id: 'check',
        sourceCode: 'c',
        family: 'check',
        label: 'Check',
        frequency: 0.4,
        legal: true,
        size: { unit: 'none', exact: false },
      },
      {
        id: 'bet_75pct',
        sourceCode: betSourceCode,
        family: 'bet',
        label: 'Bet 75% Pot',
        frequency: 0.6,
        legal: true,
        size: {
          unit: 'chips',
          chips: betChips,
          bigBlinds: betBigBlinds,
          potFraction: 0.75,
          exact: true,
        },
      },
    ],
    sourceArtifact: {
      system: 'solved_spots_gold_v2',
      artifactId: `solved-row:${scenarioHash}:${sourceNode}`,
      scenarioHash,
      solverVersion: provenance.solverVersion,
      solverBinaryChecksum: provenance.solverBinaryChecksum,
      machineId: provenance.machineId,
      pipelineCommit: provenance.pipelineCommit,
      manifestVersion: provenance.manifestVersion,
      manifestChecksum: provenance.manifestChecksum,
      sourceArtifactChecksum: provenance.sourceArtifactChecksum,
      qualityStatus: provenance.qualityStatus,
      auditedAt: provenance.auditedAt,
      provenanceComplete: true,
    },
    qualitySeal: QUALITY_SEAL.SOLVER_DERIVED_RESPONSE,
    validDomain: {
      exactMatchDimensions: ['gameType', 'stackDepth', 'street', 'board', 'holdingClass'],
      approximatedDimensions: [],
      exclusions: [],
    },
    confidence: 0.55,
    fallbackReason: 'decision_key_incomplete',
  });
}

function derivedParentQuestion(overrides = {}) {
  const scenarioHash = 'hu_cash_BTN_100bb_AsKdQc';
  const provenance = solverProvenance({ scenarioHash });
  const scenario = {
    board: 'As Kd Qc',
    boardCards: ['As', 'Kd', 'Qc'],
    street: 'flop',
    gameType: 'hu_cash',
    scenarioHash,
    heroHand: '98s',
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
      rake: '0 0',
      treeGeometry: 'srp_parameterized_v2',
      oopPosition: 'BB',
      ipPosition: 'BTN',
    },
  };
  const question = {
    id: 'parent-1',
    dataQuality: 'SOLVER_DERIVED_RESPONSE',
    sourceClassification: 'SOLVER_DERIVED_RESPONSE',
    heroCards: ['9h', '8h'],
    boardCards: ['As', 'Kd', 'Qc'],
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_75pct', text: 'Bet 75% Pot' },
    ],
    correctAnswer: 'bet_75pct',
    policyChecksum: 'e'.repeat(64),
    scenario,
    solverProvenance: provenance,
    solverPolicy: derivedCanonicalPolicy({
      scenarioHash,
      sourceNode: scenario.solverNode,
      street: scenario.street,
      boardCards: ['As', 'Kd', 'Qc'],
      potBb: scenario.pot,
      provenance,
    }),
  };
  return {
    ...question,
    ...overrides,
  };
}

function derivedChildQuestion(lineage, nextBoard, overrides = {}) {
  const provenance = solverProvenance({
    scenarioHash: lineage.childScenarioHash,
    machineId: 'M2',
    sourceArtifactChecksum: 'f'.repeat(64),
  });
  const scenario = {
    scenarioHash: lineage.childScenarioHash,
    solverNode: lineage.childNode,
    street: 'turn',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    boardCards: [...nextBoard],
    pot: 13.74,
    stackDepth: 95.88,
    solverStackDepth: 100,
    solverLineage: { ...lineage.release },
  };
  const question = {
    id: 'child-1',
    dataQuality: 'SOLVER_DERIVED_RESPONSE',
    sourceClassification: 'SOLVER_DERIVED_RESPONSE',
    heroCards: ['9h', '8h'],
    boardCards: [...nextBoard],
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_75pct', text: 'Bet 75% Pot' },
    ],
    correctAnswer: 'bet_75pct',
    policyChecksum: '9'.repeat(64),
    solverProvenance: provenance,
    scenario,
    solverPolicy: derivedCanonicalPolicy({
      scenarioHash: lineage.childScenarioHash,
      sourceNode: lineage.childNode,
      street: 'turn',
      boardCards: nextBoard,
      potBb: scenario.pot,
      provenance,
    }),
  };
  return { ...question, ...overrides };
}

test('next-street accepts only an authenticated signed POST continuation', () => {
  const api = read('pages/api/training/next-street.js');

  assert.match(api, /req\.method !== 'POST'/);
  assert.match(api, /LIMITS\.write/);
  assert.match(api, /verifyTrainingGradingReceiptEnvelope\(gradingReceipt/);
  assert.match(api, /verifyTrainingGradingReceipt\(gradingReceipt/);
  assert.match(api, /training_question_snapshots/);
  assert.match(api, /\.maybeSingle\(\)/);
  assert.doesNotMatch(api, /\.single\(\)/);
  assert.match(api, /if \(!persisted\?\.data\)/);
  assert.match(api, /Canonical continuation persistence returned no accepted cache row/);
  assert.doesNotMatch(api, /req\.query/);
  assert.doesNotMatch(api, /rawHeroCards|rawSessionId|sanitizeParam/);
});

test('continuation is gated on the exact persisted predecessor decision', () => {
  const api = read('pages/api/training/next-street.js');
  const eligibility = read('src/lib/training/trainingContinuationEligibility.mjs');

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
  assert.match(api, /resolveStrictTrainingContinuation\([\s\S]*precedingResult\.data\.answer_id/);
  assert.match(eligibility, /validatePersistedContinuationDecisionForDifficulty\(/);
  assert.match(eligibility, /TRAINING_CONTINUATION_ACTION_MISMATCH/);
  assert.match(eligibility, /TRAINING_CONTINUATION_ACTION_INVALID/);
  assert.match(api, /TRAINING_CONTINUATION_PRECEDING_ANSWER_REQUIRED/);
  assert.match(api, /nextDecisionOrdinal = Number\(receiptPayload\.decisionOrdinal\) \+ 1/);
  assert.match(api, /countsTowardCompletion: false/);
  assert.match(eligibility, /'TRAINING_CONTINUATION_SOLVER_MISS'/);
});

test('continuation state and delivery are reconstructed from immutable server data', () => {
  const api = read('pages/api/training/next-street.js');
  const eligibility = read('src/lib/training/trainingContinuationEligibility.mjs');

  assert.match(api, /parentQuestion: parentSnapshot\.question_data/);
  assert.match(eligibility, /authoritativeHandState\(parentQuestion\)/);
  assert.match(eligibility, /new Set\(normalizedCards\)\.size === normalizedCards\.length/);
  assert.match(eligibility, /queryNextStreet\(\{/);
  assert.match(api, /buildTrainingQuestionSnapshot\(\{/);
  assert.match(api, /trainingQuestionSnapshotMatchesIdentity\(parentSnapshot/);
  assert.match(api, /trainingQuestionSnapshotMatchesIdentity\(candidateStoredSnapshot/);
  assert.match(api, /prepareTrainingQuestionForDelivery\(\{/);
  assert.match(api, /sessionId: receiptPayload\.sessionId/);
  assert.match(api, /attemptId: receiptPayload\.attemptId/);
  assert.match(api, /handOrdinal: receiptPayload\.handOrdinal/);
  assert.match(api, /difficultyMode: receiptPayload\.difficultyMode/);
});

test('next-street retries recover one durable decision-slot winner before solving or counting another serve', () => {
  const api = read('pages/api/training/next-street.js');
  const recoveryAt = api.indexOf('readTrainingAttemptContinuation({');
  const solverAt = api.indexOf('const continuationResolution = await resolveStrictTrainingContinuation({');
  assert.ok(recoveryAt > 0 && recoveryAt < solverAt);
  assert.match(api, /registerTrainingAttemptContinuation\(\{/);
  assert.match(api, /const storedSnapshot = registeredContinuation\.snapshot/);
  assert.match(api, /recordTrainingQuestionsServedForAttempt\(getSupabase\(\)/);
  assert.match(api, /recoveredExistingContinuation: true/);
  assert.match(api, /NextStreet:existing-continuation-answer-read/);
  assert.match(api, /code: 'TRAINING_CONTINUATION_ALREADY_ANSWERED'/);
  assert.match(api, /receiptId: trainingAttemptDecisionServeKey\(/);
  assert.match(api, /newCard: winningBoard\.at\(-1\)/);
  assert.doesNotMatch(api, /requestId: randomUUID\(\)/);
  assert.doesNotMatch(api, /persistCanonicalTrainingQuestions/);
});

test('an already-answered continuation is refused before a replacement receipt is signed', async () => {
  const payload = {
    jti: 'parent-submission',
    userId: 'user-1',
    gameId: 'cash-001',
    level: 1,
    sessionId: 'session-1',
    attemptId: 'attempt-1',
    snapshotKey: 'parent-snapshot',
    sessionKind: 'campaign',
    sessionTargetHands: 20,
    handOrdinal: 4,
    decisionOrdinal: 1,
    practiceOnly: false,
    difficultyMode: 'exact',
  };
  let answerRead = 0;
  let prepared = 0;
  let served = 0;
  const query = (data) => {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      maybeSingle() { return Promise.resolve({ data, error: null }); },
    };
    return builder;
  };
  const supabase = {
    from(table) {
      if (table === 'training_question_snapshots') {
        return query({ snapshot_key: payload.snapshotKey, question_data: { id: 'parent-question' } });
      }
      if (table === 'training_answers') {
        answerRead += 1;
        return query(answerRead === 1
          ? { submission_id: payload.jti, answer_id: 'bet_75pct' }
          : { submission_id: 'already-scored-child' });
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const module = await loadAuthorityHelpers({
    user: { id: 'user-1' },
    supabase,
    receiptPayload: payload,
    existingContinuation: {
      slot: {
        parent_snapshot_key: payload.snapshotKey,
        parent_submission_id: payload.jti,
      },
      snapshot: {
        snapshot_key: 'child-snapshot',
        question_data: { id: 'child-question', scenario: { boardCards: ['As', 'Kd', 'Qc', 'Jh'] } },
      },
    },
    onPreparedQuestion: () => { prepared += 1; },
    onServedQuestion: () => { served += 1; },
    executePersistenceQuery: async (factory) => factory(),
  });
  const response = responseHarness();

  await module.default({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { gradingReceipt: 'signed-parent-receipt' },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'TRAINING_CONTINUATION_ALREADY_ANSWERED');
  assert.equal(answerRead, 2, 'the predecessor and target decision are checked separately');
  assert.equal(prepared, 0, 'an answered slot must not be re-signed');
  assert.equal(served, 0, 'an answered slot must not record another serve');
});

test('persisted predecessor answer must exactly select the canonical non-terminal branch', async () => {
  const { validatePersistedContinuationDecision } = await loadAuthorityHelpers();
  const parent = derivedParentQuestion();

  assert.deepEqual(
    { ...validatePersistedContinuationDecision(parent, 'bet_75pct') },
    { ok: true, action: 'b412', answerId: 'bet_75pct' },
  );
  assert.equal(
    validatePersistedContinuationDecision(parent, 'b412').code,
    'TRAINING_CONTINUATION_ACTION_MISMATCH',
    'the durable answer is the semantic policy id, never the warehouse path token',
  );
  assert.equal(
    validatePersistedContinuationDecision(parent, 'check').code,
    'TRAINING_CONTINUATION_ACTION_MISMATCH',
  );
  assert.equal(
    validatePersistedContinuationDecision(parent, undefined).code,
    'TRAINING_CONTINUATION_ACTION_MISMATCH',
  );

  for (const invalidAction of ['', 'fold', 'f', 'allin', 'call', 'r824', 'Bet 75%']) {
    const invalid = derivedParentQuestion({
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

  const absentFromTree = derivedParentQuestion({
    options: parent.options.filter(({ id }) => id !== 'bet_75pct'),
  });
  assert.equal(
    validatePersistedContinuationDecision(absentFromTree, 'bet_75pct').code,
    'TRAINING_CONTINUATION_ACTION_INVALID',
  );

  const duplicateSourceMapping = structuredClone(parent);
  duplicateSourceMapping.solverPolicy.actions[0].sourceCode = 'b412';
  assert.equal(
    validatePersistedContinuationDecision(duplicateSourceMapping, 'bet_75pct').code,
    'TRAINING_CONTINUATION_ACTION_INVALID',
    'one raw tree token cannot map to multiple semantic actions',
  );

  const tamperCases = [
    ['policy/source node cross-binding', (question) => { question.solverPolicy.node.sourceNode = 'r:0:b412'; }],
    ['scenario/policy hash cross-binding', (question) => { question.scenario.scenarioHash += '_tampered'; }],
    ['provenance/policy hash cross-binding', (question) => { question.solverProvenance.scenarioHash += '_tampered'; }],
    ['source-system downgrade', (question) => { question.solverPolicy.sourceArtifact.system = 'approximate_solver'; }],
    ['declared classification escalation', (question) => { question.dataQuality = 'SOLVER_EXACT'; }],
    ['hidden approximation', (question) => {
      question.solverPolicy.validDomain.approximatedDimensions.push('board');
    }],
    ['holding cross-binding', (question) => { question.heroCards = ['7h', '6h']; }],
    ['option/policy mismatch', (question) => { question.options[1].id = 'bet_100pct'; }],
  ];
  for (const [label, mutate] of tamperCases) {
    const tampered = structuredClone(parent);
    mutate(tampered);
    assert.equal(
      validatePersistedContinuationDecision(tampered, 'bet_75pct').code,
      'TRAINING_CONTINUATION_ACTION_INVALID',
      label,
    );
  }
});

test('grouped continuation accepts only the public band containing the one exact branch', async () => {
  const { validatePersistedContinuationDecisionForDifficulty } = await loadAuthorityHelpers();
  const parent = derivedParentQuestion();
  parent.question = 'The Big Blind checks to you on the flop. What is your best action?';
  const actions = [
    {
      id: 'check', sourceCode: 'c', family: 'check', label: 'Check', frequency: 0.1,
      legal: true, size: { unit: 'none', exact: false },
    },
    {
      id: 'bet_33pct', sourceCode: 'b200', family: 'bet', label: 'Bet 33% Pot', frequency: 0.2,
      legal: true,
      size: { unit: 'chips', chips: 200, bigBlinds: 2, potFraction: 0.33, exact: true },
    },
    {
      id: 'bet_75pct', sourceCode: 'b412', family: 'bet', label: 'Bet 75% Pot', frequency: 0.6,
      legal: true,
      size: { unit: 'chips', chips: 412, bigBlinds: 4.12, potFraction: 0.75, exact: true },
    },
    {
      id: 'bet_125pct', sourceCode: 'b700', family: 'bet', label: 'Bet 125% Pot', frequency: 0.1,
      legal: true,
      size: { unit: 'chips', chips: 700, bigBlinds: 7, potFraction: 1.25, exact: true },
    },
  ];
  parent.options = actions.map(({ id, label }) => ({ id, text: label }));
  parent.gtoFrequencies = Object.fromEntries(actions.map(({ id, frequency }) => [id, frequency * 100]));
  parent.solverPolicy = derivedCanonicalPolicy({
    scenarioHash: parent.scenario.scenarioHash,
    sourceNode: parent.scenario.solverNode,
    street: parent.scenario.street,
    boardCards: parent.boardCards,
    potBb: parent.scenario.pot,
    provenance: parent.solverProvenance,
    actions,
  });

  const accepted = validatePersistedContinuationDecisionForDifficulty(
    parent,
    'grouped_medium',
    'grouped',
  );
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.equal(accepted.action, 'b412');
  assert.equal(accepted.answerId, 'bet_75pct');
  assert.equal(accepted.publicAnswerId, 'grouped_medium');
  for (const wrongGroup of ['grouped_small', 'grouped_overbet', 'check']) {
    assert.equal(
      validatePersistedContinuationDecisionForDifficulty(parent, wrongGroup, 'grouped').code,
      'TRAINING_CONTINUATION_ACTION_MISMATCH',
      wrongGroup,
    );
  }
  assert.equal(
    validatePersistedContinuationDecisionForDifficulty(parent, 'bet_75pct', 'exact').ok,
    true,
    'ordinary exact-mode continuation changed',
  );
});

test('a provenance-complete derived parent qualifies only through its exact lineage resolver', async () => {
  const {
    resolveStrictTrainingContinuation,
    selectPublicAttestationContinuationAnswerForStrictParent,
  } = await loadAuthorityHelpers();
  const parent = derivedParentQuestion({
    question: 'The Big Blind checks to you on the flop. What is your best action?',
  });
  assert.equal(sourceClassificationForQuestion(parent), 'SOLVER_DERIVED_RESPONSE');
  const precommit = buildTrainingAttestationContinuationPrecommit({
    selectionRule: TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
    sessionId: 'derived-continuation-fixture',
    gameId: 'cash-002',
    level: 8,
    targetHands: 20,
  });
  const publicAnswer = selectPublicAttestationContinuationAnswerForStrictParent(
    parent,
    precommit,
    'grouped',
  );
  assert.equal(publicAnswer, 'bet_75pct');
  const resolved = await resolveStrictTrainingContinuation({
    parentQuestion: parent,
    persistedAnswerId: publicAnswer,
    difficultyMode: 'grouped',
    gameConfig: { pioGameType: 'hu_cash', pioStackDepth: 100 },
    requireProvenanceCompleteParent: true,
    queryNextStreet: async ({ continuationLineages }) => {
      const lineage = continuationLineages[0];
      return derivedChildQuestion(lineage, lineage.boardCards);
    },
  });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.equal(
    sourceClassificationForQuestion(resolved.canonicalQuestion),
    'SOLVER_DERIVED_RESPONSE',
    'the exact row lineage must not be relabeled as a solver-exact decision key',
  );
});

test('derived canonical parent permits only its exact row lineage and raw source branch', async () => {
  const {
    authoritativeHandState,
    buildExactContinuationLineage,
  } = await loadAuthorityHelpers();
  const parent = derivedParentQuestion();
  const state = authoritativeHandState(parent);
  assert.equal(state.valid, true);

  const lineage = buildExactContinuationLineage({
    parentQuestion: parent,
    gameConfig: { pioGameType: 'hu_cash', pioStackDepth: 100 },
    state,
    nextBoard: ['As', 'Kd', 'Qc', 'Jh'],
    continuationAction: 'b412',
  });
  assert.equal(lineage.parentScenarioHash, 'hu_cash_BTN_100bb_AsKdQc');
  assert.equal(lineage.childScenarioHash, 'turn_hu_cash_BTN_100bb_AsKdQcJh');
  assert.equal(lineage.childNode, 'r:0:c:b412:c:Jh:c');

  const wrongRelease = derivedParentQuestion({
    solverProvenance: { ...parent.solverProvenance, pipelineCommit: 'e'.repeat(39) },
  });
  assert.equal(buildExactContinuationLineage({
    parentQuestion: wrongRelease,
    gameConfig: { pioGameType: 'hu_cash', pioStackDepth: 100 },
    state,
    nextBoard: ['As', 'Kd', 'Qc', 'Jh'],
    continuationAction: 'b412',
  }), null);

  const badChecksum = derivedParentQuestion({ policyChecksum: 'not-a-checksum' });
  assert.equal(buildExactContinuationLineage({
    parentQuestion: badChecksum,
    gameConfig: { pioGameType: 'hu_cash', pioStackDepth: 100 },
    state,
    nextBoard: ['As', 'Kd', 'Qc', 'Jh'],
    continuationAction: 'b412',
  }), null);

  const wrongNodePolicy = structuredClone(parent);
  wrongNodePolicy.solverPolicy.node.sourceNode = 'r:0:b412';
  assert.equal(buildExactContinuationLineage({
    parentQuestion: wrongNodePolicy,
    gameConfig: { pioGameType: 'hu_cash', pioStackDepth: 100 },
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
  const parent = derivedParentQuestion();
  const state = authoritativeHandState(parent);
  const nextBoard = ['As', 'Kd', 'Qc', 'Jh'];
  const lineage = buildExactContinuationLineage({
    parentQuestion: parent,
    gameConfig: { pioGameType: 'hu_cash', pioStackDepth: 100 },
    state,
    nextBoard,
    continuationAction: 'b412',
  });
  const generated = derivedChildQuestion(lineage, nextBoard);
  const bound = bindExactContinuationQuestion(generated, { state, nextBoard, lineage });
  assert.ok(bound, 'a canonical derived child bound to the exact row lineage is eligible');
  assert.equal(bound.dataQuality, 'SOLVER_DERIVED_RESPONSE');
  assert.equal(bound.correctAnswer, 'bet_75pct');
  assert.equal(
    bound.solverPolicy.actions.find(({ id }) => id === 'bet_75pct').sourceCode,
    'b412',
  );
  assert.equal(bound.scenario.pot, 13.74);
  assert.equal(bound.scenario.stackDepth, 95.88);
  assert.notEqual(bound.scenario.pot, state.pot);
  assert.notEqual(bound.scenario.stackDepth, state.effectiveStackDepth);

  const childTamperCases = [
    ['child policy node', (question) => { question.solverPolicy.node.sourceNode += ':c'; }],
    ['child scenario hash', (question) => { question.scenario.scenarioHash += '_tampered'; }],
    ['child source hash', (question) => { question.solverPolicy.sourceArtifact.scenarioHash += '_tampered'; }],
    ['child provenance checksum', (question) => {
      question.solverProvenance.sourceArtifactChecksum = '0'.repeat(64);
    }],
    ['child geometry', (question) => { question.scenario.pot = 13.75; }],
  ];
  for (const [label, mutate] of childTamperCases) {
    const tampered = structuredClone(generated);
    mutate(tampered);
    assert.equal(
      bindExactContinuationQuestion(tampered, { state, nextBoard, lineage }),
      null,
      label,
    );
  }

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
  const parent = derivedParentQuestion();
  const state = authoritativeHandState(parent);
  const gameConfig = { pioGameType: 'hu_cash', pioStackDepth: 100 };
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
    id: '11111111-1111-4111-8111-111111111111',
    scenario_hash: later.childScenarioHash,
    street: later.childStreet,
    game_type: later.gameType,
    stack_depth: later.solverStackDepth,
    strategy_matrix_v2: {
      actions: [
        { code: 'c', key: 'check', size_pct: 0 },
        {
          code: 'b1442',
          key: 'bet_chips_1442',
          size_chips: 1442,
          size_semantics: 'cumulative_postflop_contribution_target',
          size_pct: null,
        },
      ],
      frequencies: {
        c: new Array(1326).fill(0.4),
        b1442: new Array(1326).fill(0.6),
      },
      hand_evs_bb: new Array(1326).fill(1.25),
      node: later.childNode,
      board: later.boardCards,
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
        starting_pot_chips: later.release.rootPotBb * 100,
        achieved_exploitability_chips: later.release.rootPotBb * 0.05,
        achieved_exploitability_fraction: 0.0005,
      },
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

  const rpcCalls = [];
  const admittedByScenario = new Map([
    [first.childScenarioHash, []],
    [later.childScenarioHash, [exactLaterRow]],
  ]);
  const engine = {
    db: {
      rpc: async (...args) => {
        rpcCalls.push(args);
        return {
          data: args[1]?.p_scenario_hash
            ? admittedByScenario.get(args[1].p_scenario_hash) || []
            : args[1]?.p_street === exactLaterRow.street ? [exactLaterRow] : [],
          error: null,
        };
      },
    },
    getStreetForLevel: () => 'flop',
    generateBatch: async () => [],
    buildQuestionFromScenario: (scenario) => {
      const sourceAction = scenario.strategy_matrix.actions.find((action) => /^b\d+$/.test(action));
      const boardCards = Array.isArray(scenario.strategy_matrix.board)
        ? [...scenario.strategy_matrix.board]
        : scenario.strategy_matrix.board.match(/.{2}/g);
      return {
        id: 'later-child',
        source: 'DETERMINISTIC_SOLVER',
        heroCards: ['9h', '8h'],
        boardCards,
        options: [{ id: 'c', text: 'Check' }, { id: sourceAction, text: 'Bet' }],
        correctAnswer: sourceAction,
        gtoFrequencies: { c: 40, [sourceAction]: 60 },
        scenario: {
          scenarioHash: scenario.scenario_hash,
          solverNode: scenario.strategy_matrix.node,
          street: scenario.street,
          heroPosition: scenario.strategy_matrix.position,
          villainPosition: scenario.strategy_matrix.oop_player,
          boardCards,
          pot: scenario.strategy_matrix.pot_bb,
          stackDepth: scenario.strategy_matrix.eff_stack_bb,
          solverStackDepth: scenario.stack_depth,
          solverActionUnits: 'chips',
          nodeType: 'hero_bets_or_checks',
        },
      };
    },
  };
  engine.solverPolicyService = {
    asEngineScenario: ({ metadata, matrix }) => ({ ...metadata, strategy_matrix: matrix }),
    answerForEngineQuestion: (_scenario, question) => derivedCanonicalPolicy({
      scenarioHash: question.scenario.scenarioHash,
      sourceNode: question.scenario.solverNode,
      street: question.scenario.street,
      boardCards: question.boardCards || question.scenario.boardCards,
      heroCards: question.heroCards,
      heroPosition: question.scenario.heroPosition,
      villainPosition: question.scenario.villainPosition,
      potBb: question.scenario.pot,
      provenance: question.solverProvenance,
      betSourceCode: 'b1442',
      betChips: 1030,
      betBigBlinds: 10.3,
    }),
    attachToQuestion: (question) => ({
      ...question,
      dataQuality: 'SOLVER_DERIVED_RESPONSE',
      sourceClassification: 'SOLVER_DERIVED_RESPONSE',
    }),
    consumerEnvelope: (policy) => structuredClone(policy),
    answerFromRecord: () => null,
    keyForRecord: () => null,
  };
  applyDeterministicEnginePatches(engine);
  const streetPool = await engine.fetchSolverPool(gameConfig, 1, 1, 'turn');
  assert.equal(streetPool.length, 1);
  assert.equal(streetPool[0].scenario_hash, exactLaterRow.scenario_hash);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0][1].p_street, 'turn');
  assert.equal(rpcCalls[0][1].p_scenario_hash, null);
  assert.equal(rpcCalls[0][1].p_artifact_id, null);
  rpcCalls.length = 0;

  const generated = await engine.queryNextStreet({
    gameConfig,
    heroHand: ['9h', '8h'],
    street: 'turn',
    stackDepth: 100,
    heroPosition: 'BTN',
    villainPosition: 'BB',
    continuationLineages: [first, later],
  });
  assert.equal(generated.scenario.scenarioHash, later.childScenarioHash);
  assert.equal(generated.scenario.solverNode, later.childNode);
  assert.equal(generated.scenario.pot, 13.74);
  assert.equal(generated.scenario.stackDepth, 97.5);
  assert.equal(generated.dataQuality, 'SOLVER_DERIVED_RESPONSE');
  assert.deepEqual(generated.options.map(({ id }) => id), ['check', 'bet_75pct']);
  assert.equal(generated.correctAnswer, 'bet_75pct');
  assert.equal(
    generated.solverPolicy.actions.find(({ id }) => id === 'bet_75pct').sourceCode,
    'b1442',
  );
  assert.equal(rpcCalls.length, 2);
  for (const [rpc, args] of rpcCalls) {
    assert.equal(rpc, 'training_solver_spot_candidates_v1');
    assert.equal(args.p_street, 'turn');
    assert.equal(args.p_position, 'BTN');
    assert.equal(args.p_artifact_id, null);
    assert.equal(args.p_limit, 2);
    assert.equal(args.p_offset, 0);
  }
  assert.deepEqual(
    rpcCalls.map(([, args]) => args.p_scenario_hash),
    [first.childScenarioHash, later.childScenarioHash],
  );

  const duplicateRow = {
    ...exactLaterRow,
    id: '22222222-2222-4222-8222-222222222222',
    source_artifact_checksum: 'f'.repeat(64),
  };
  admittedByScenario.set(later.childScenarioHash, [exactLaterRow, duplicateRow]);
  assert.equal(await engine.queryNextStreet({
    gameConfig,
    heroHand: ['9h', '8h'],
    street: 'turn',
    stackDepth: 100,
    heroPosition: 'BTN',
    villainPosition: 'BB',
    continuationLineages: [first, later],
  }), null, 'two admitted artifacts for one exact lineage fail closed');

  const engineSource = read('src/engines/deterministicEnginePatches.js');
  assert.doesNotMatch(engineSource, /\.from\('training_solver_artifact_catalog'\)/);
  assert.match(engineSource, /p_scenario_hash: normalizedScenarioHash/);
  assert.match(engineSource, /p_street: normalizedStreet/);
  assert.match(engineSource, /p_artifact_id: normalizedArtifactId/);
  assert.match(engineSource, /MAX_CONTINUATION_RUNOUTS = 47/);
  assert.doesNotMatch(engineSource, /chooseDeterministicEducationalCard[\s\S]*queryNextStreet/);
});
