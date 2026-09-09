import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { enforceTrainingQuestionContract } from '../src/lib/training/questionContract.mjs';
import {
  POLICY_KIND,
  QUALITY_SEAL,
  validateSolverPolicyAnswer,
} from '../src/lib/training/solverPolicyContract.js';
import {
  buildTrainingQuestionSnapshot,
  prepareTrainingAttemptDelivery,
  recoverTrainingAttemptHand,
  registerTrainingAttemptContinuation,
  recordTrainingQuestionsServedForAttempt,
  trainingQuestionCampaignEligibility,
  TrainingAttemptDeliveryError,
} from '../src/lib/training/trainingAttemptDelivery.mjs';
import { trainingQuestionDigest } from '../src/lib/training/gradingReceipt.mjs';
import { sealCanonicalTrainingQuestion } from '../tests/helpers/canonicalTrainingPolicyFixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCEPT_DISCLOSURE = 'Expert-authored poker concept; no solver-exact frequency or EV is claimed.';
const CHART_DISCLOSURE = 'Audited local push/fold chart corpus.';

const sealedProvenance = Object.freeze({
  verified: true,
  source: 'PioSOLVER',
  scenarioHash: 'hu_cash_BTN_100bb_Ah7d2c',
  solverVersion: 'PioSOLVER-edge',
  solverBinaryChecksum: 'a'.repeat(64),
  machineId: 'M1',
  pipelineCommit: 'b'.repeat(40),
  manifestVersion: 'training-v2',
  manifestChecksum: 'c'.repeat(64),
  sourceArtifactChecksum: 'd'.repeat(64),
  qualityStatus: 'validated',
  auditedAt: '2026-09-06T00:00:00.000Z',
});

const actionOptions = Object.freeze([
  { id: 'x', text: 'Check' },
  { id: 'b33', text: 'Bet 33% Pot' },
  { id: 'b75', text: 'Bet 75% Pot' },
  { id: 'b125', text: 'Bet 125% Pot' },
]);

function canonical(question) {
  return enforceTrainingQuestionContract(structuredClone(question));
}

function seal(question, policyKind) {
  return sealCanonicalTrainingQuestion(canonical(question), {
    policyKind,
    sourceArtifactSystem: 'solved_spots_gold_v2',
  });
}

function verifiedPostflop(overrides = {}) {
  const question = {
    id: 'verified-flop-1',
    type: 'PIO',
    source: 'PIO',
    dataQuality: 'SOLVER_EXACT',
    evidenceDisclosure: 'Provenance-sealed PioSOLVER export; frequencies are exact for this recorded node. Per-action EV is not available.',
    solverProvenance: sealedProvenance,
    heroCards: ['Ks', 'Qs'],
    boardCards: ['Ah', '7d', '2c'],
    scenario: {
      street: 'flop',
      board: 'Ah 7d 2c',
      boardCards: ['Ah', '7d', '2c'],
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 6,
      heroStack: 97,
      villainStack: 97,
      nodeType: 'checked_to_hero',
      scenarioHash: sealedProvenance.scenarioHash,
      solverNode: 'r:0:c',
      action: 'The Big Blind checks to you.',
    },
    question: 'The Big Blind checks to you on the flop. What is your best action?',
    options: actionOptions,
    correctAnswer: 'b75',
    gtoFrequencies: { x: 10, b33: 20, b75: 60, b125: 10 },
    ...overrides,
  };
  return seal(question, POLICY_KIND.EXACT);
}

function verifiedDerivedPostflop() {
  const exact = verifiedPostflop();
  return sealCanonicalTrainingQuestion({
    ...exact,
    solverPolicy: undefined,
    dataQuality: 'SOLVER_DERIVED_RESPONSE',
    sourceClassification: 'SOLVER_DERIVED_RESPONSE',
  }, {
    policyKind: POLICY_KIND.DERIVED,
    sourceArtifactSystem: 'solved_spots_gold_v2',
  });
}

function auditedLocalPreflop() {
  return canonical({
    id: 'local-preflop-1',
    source: 'local_solver_ranges',
    dataQuality: 'RANGE_EXACT',
    evidenceDisclosure: 'Audited local preflop range frequencies; no per-action EV is claimed.',
    heroCards: ['As', 'Kh'],
    boardCards: [],
    scenario: {
      street: 'preflop',
      board: '',
      boardCards: [],
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 1.5,
      heroStack: 100,
      villainStack: 100,
      action: 'Action folds to you on the Button.',
    },
    question: 'Action folds to you on the Button with AKo. What is your best action?',
    options: [
      { id: 'f', text: 'Fold' },
      { id: 'limp', text: 'Limp' },
      { id: 'r25', text: 'Raise To 2.5 BB' },
      { id: 'allin', text: 'Raise All-In' },
    ],
    correctAnswer: 'r25',
    gtoFrequencies: { f: 0, limp: 0, r25: 100, allin: 0 },
  });
}

function provenanceSealedLocalPreflop() {
  return seal({
    ...auditedLocalPreflop(),
    id: 'sealed-local-preflop-1',
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: sealedProvenance,
    evidenceDisclosure: 'Provenance-sealed PioSOLVER export; frequencies are exact for this recorded node. Per-action EV is not available.',
  }, POLICY_KIND.EXACT);
}

function auditedChart() {
  return sealCanonicalTrainingQuestion(canonical({
    id: 'chart-preflop-1',
    type: 'CHART',
    source: 'CHART',
    dataQuality: 'CHART_AUDITED',
    evidenceDisclosure: CHART_DISCLOSURE,
    heroCards: ['As', 'Ks'],
    boardCards: [],
    scenario: {
      street: 'preflop',
      board: '',
      boardCards: [],
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 1.5,
      stackDepth: 15,
      heroStack: 15,
      villainStack: 15,
      action: 'Action folds to you on the Button.',
    },
    question: 'Action folds to you on the Button with AKs. Push or Fold?',
    options: [
      { id: 'all_in', text: 'Push All-In' },
      { id: 'fold', text: 'Fold' },
    ],
    correctAnswer: 'all_in',
    gtoFrequencies: { all_in: 100, fold: 0 },
  }), { policyKind: POLICY_KIND.CHART });
}

function psychologyQuestion() {
  return sealCanonicalTrainingQuestion(canonical({
    id: 'psych-1',
    source: 'PSYCHOLOGY_BANK',
    dataQuality: 'CURATED',
    scenario: {
      isPsychology: true,
      description: 'You lose a large pot and notice your breathing accelerate.',
    },
    question: 'What is the best immediate response before the next hand?',
    options: [
      { id: 'a', text: 'Pause And Reset Your Breathing' },
      { id: 'b', text: 'Increase Every Bet Size' },
      { id: 'c', text: 'Chase The Loss Immediately' },
      { id: 'd', text: 'Ignore The Emotional Change' },
    ],
    correctAnswer: 'a',
  }), { policyKind: POLICY_KIND.CURATED });
}

function conceptQuestion() {
  return sealCanonicalTrainingQuestion(canonical({
    id: 'concept-1',
    source: 'CURATED_SCENARIO',
    dataQuality: 'CURATED',
    evidenceDisclosure: CONCEPT_DISCLOSURE,
    scenario: {
      isConceptQuestion: true,
      description: 'A concept calibration question about position.',
    },
    question: 'Which statement best describes positional advantage?',
    options: [
      { id: 'a', text: 'Acting Later Reveals More Information' },
      { id: 'b', text: 'Position Changes The Deck Composition' },
      { id: 'c', text: 'Position Guarantees A Winning Hand' },
      { id: 'd', text: 'Position Removes Stack Constraints' },
    ],
    correctAnswer: 'a',
  }), { policyKind: POLICY_KIND.CURATED });
}

test('only structurally valid canonical source families cross the progress-bearing delivery boundary', () => {
  const fixtures = [
    [verifiedPostflop(), POLICY_KIND.EXACT, QUALITY_SEAL.SOLVER_EXACT],
    [verifiedDerivedPostflop(), POLICY_KIND.DERIVED, QUALITY_SEAL.SOLVER_DERIVED_RESPONSE],
    [auditedChart(), POLICY_KIND.CHART, QUALITY_SEAL.CHART_AUDITED],
    [psychologyQuestion(), POLICY_KIND.CURATED, QUALITY_SEAL.CURATED],
    [conceptQuestion(), POLICY_KIND.CURATED, QUALITY_SEAL.CURATED],
  ];
  for (const [question, kind, qualitySeal] of fixtures) {
    assert.deepEqual(validateSolverPolicyAnswer(question.solverPolicy), { valid: true, errors: [] });
    assert.equal(question.solverPolicy.kind, kind);
    assert.equal(question.solverPolicy.qualitySeal, qualitySeal);
    assert.deepEqual(
      trainingQuestionCampaignEligibility(question).eligible,
      true,
      `${question.id} should be eligible`,
    );
  }

  for (const question of [verifiedPostflop(), verifiedDerivedPostflop()]) {
    assert.equal(question.solverPolicy.sourceArtifact.system, 'solved_spots_gold_v2');
    assert.equal(question.scenario.scenarioHash, question.solverProvenance.scenarioHash);
    assert.equal(question.scenario.scenarioHash, question.solverPolicy.sourceArtifact.scenarioHash);
    assert.equal(question.scenario.solverNode, question.solverPolicy.node.sourceNode);
  }
  const chart = auditedChart();
  assert.deepEqual(chart.options.map((option) => option.id), ['all_in', 'fold']);
  assert.equal(chart.options[0].text, 'Push All-In');
});

test('attempt serve auditing records one stable batch and rejects duplicate manifest identities', async () => {
  const calls = [];
  const db = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        abortSignal: async () => ({
          data: { questionCount: args.p_deliveries.length },
          error: null,
        }),
      };
    },
  };
  const delivery = {
    attemptId: '22222222-2222-4222-8222-222222222222',
    questions: [
      {
        id: 'question-1',
        policyChecksum: 'a'.repeat(64),
        _gradingContext: {
          attemptId: '22222222-2222-4222-8222-222222222222',
          handOrdinal: 1,
          decisionOrdinal: 1,
          snapshotKey: 'c'.repeat(64),
          difficultyMode: 'exact',
          rngRolls: { low: 17, high: 83 },
        },
      },
      {
        id: 'question-2',
        policyChecksum: 'b'.repeat(64),
        _gradingContext: {
          attemptId: '22222222-2222-4222-8222-222222222222',
          handOrdinal: 2,
          decisionOrdinal: 1,
          snapshotKey: 'd'.repeat(64),
          difficultyMode: 'exact',
          rngRolls: { low: 23, high: 77 },
        },
      },
    ],
  };

  const result = await recordTrainingQuestionsServedForAttempt(db, {
    userId: '11111111-1111-4111-8111-111111111111',
    delivery,
  });
  assert.deepEqual(result, { questionCount: 2 });
  assert.equal(calls.length, 1, 'one attempt must use one atomic batch receipt');
  assert.equal(calls[0].name, 'fn_training_attempt_record_served_batch_v1');
  assert.equal(calls[0].args.p_attempt_id, '22222222-2222-4222-8222-222222222222');
  assert.deepEqual(calls[0].args.p_deliveries, [
    {
      handOrdinal: 1,
      decisionOrdinal: 1,
      snapshotKey: 'c'.repeat(64),
      questionId: 'question-1',
      policyChecksum: 'a'.repeat(64),
      difficultyMode: 'exact',
      rngRolls: { low: 17, high: 83 },
    },
    {
      handOrdinal: 2,
      decisionOrdinal: 1,
      snapshotKey: 'd'.repeat(64),
      questionId: 'question-2',
      policyChecksum: 'b'.repeat(64),
      difficultyMode: 'exact',
      rngRolls: { low: 23, high: 77 },
    },
  ]);

  for (const malformed of [
    {
      ...delivery,
      questions: [
        delivery.questions[0],
        {
          ...delivery.questions[1],
          _gradingContext: { ...delivery.questions[1]._gradingContext, handOrdinal: 1 },
        },
      ],
    },
    {
      ...delivery,
      questions: [{
        ...delivery.questions[0],
        _gradingContext: { ...delivery.questions[0]._gradingContext, snapshotKey: 'invalid' },
      }],
    },
    {
      ...delivery,
      questions: [{
        ...delivery.questions[0],
        _gradingContext: {
          ...delivery.questions[0]._gradingContext,
          rngRolls: { low: 0, high: 83 },
        },
      }],
    },
    {
      ...delivery,
      questions: [{
        ...delivery.questions[0],
        _gradingContext: {
          ...delivery.questions[0]._gradingContext,
          difficultyMode: 'unrecognized-mode',
        },
      }],
    },
  ]) {
    await assert.rejects(
      recordTrainingQuestionsServedForAttempt(db, {
        userId: '11111111-1111-4111-8111-111111111111',
        delivery: malformed,
      }),
      (error) => error?.code === 'TRAINING_ATTEMPT_SERVE_AUDIT_INVALID',
    );
  }
  assert.equal(calls.length, 1, 'invalid manifests must fail before the database receipt call');
});

test('attempt serve auditing covers a supported 100-hand custom manifest in bounded stable chunks', async () => {
  const calls = [];
  const db = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        abortSignal: async () => ({
          data: { questionCount: args.p_deliveries.length },
          error: null,
        }),
      };
    },
  };
  const attemptId = '22222222-2222-4222-8222-222222222222';
  const questions = Array.from({ length: 100 }, (_, index) => ({
    id: `custom-question-${index + 1}`,
    policyChecksum: 'a'.repeat(64),
    _gradingContext: {
      attemptId,
      handOrdinal: index + 1,
      decisionOrdinal: 1,
      snapshotKey: (index + 1).toString(16).padStart(64, '0'),
      difficultyMode: 'grouped',
      rngRolls: { low: (index % 100) + 1, high: 100 - (index % 100) },
    },
  }));
  const result = await recordTrainingQuestionsServedForAttempt(db, {
    userId: '11111111-1111-4111-8111-111111111111',
    delivery: { attemptId, questions },
  });
  assert.deepEqual(result, { questionCount: 100 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.args.p_deliveries.length), [50, 50]);
  assert.deepEqual(
    calls.flatMap((call) => call.args.p_deliveries).map((delivery) => delivery.handOrdinal),
    Array.from({ length: 100 }, (_, index) => index + 1),
  );
});

test('continuation registration rejects every forged RPC winner binding before reading it', async () => {
  const requested = Object.freeze({
    userId: '11111111-1111-4111-8111-111111111111',
    attemptId: '22222222-2222-4222-8222-222222222222',
    handOrdinal: 7,
    decisionOrdinal: 2,
    snapshotKey: 'a'.repeat(64),
    parentSnapshotKey: 'b'.repeat(64),
    parentSubmissionId: 'training-attempt:parent:decision:1',
    gameId: 'cash-001',
    level: 1,
  });
  const genuine = Object.freeze({
    attemptId: requested.attemptId,
    handOrdinal: requested.handOrdinal,
    decisionOrdinal: requested.decisionOrdinal,
    snapshotKey: requested.snapshotKey,
    parentSnapshotKey: requested.parentSnapshotKey,
    parentSubmissionId: requested.parentSubmissionId,
  });
  const forgeries = [
    { ...genuine, attemptId: '33333333-3333-4333-8333-333333333333' },
    { ...genuine, handOrdinal: 8 },
    { ...genuine, decisionOrdinal: 3 },
    { ...genuine, snapshotKey: 'c'.repeat(64) },
    { ...genuine, parentSnapshotKey: 'd'.repeat(64) },
    { ...genuine, parentSubmissionId: 'different-parent-submission' },
  ];

  for (const forged of forgeries) {
    let readAttempted = false;
    const supabase = {
      rpc(name, args) {
        assert.equal(name, 'fn_training_register_continuation_slot_v1');
        assert.equal(args.p_snapshot_key, requested.snapshotKey);
        return {
          abortSignal: async () => ({ data: forged, error: null }),
        };
      },
      from() {
        readAttempted = true;
        throw new Error('a forged continuation registration must fail before any read');
      },
    };

    await assert.rejects(
      registerTrainingAttemptContinuation({ supabase, ...requested }),
      (error) => error instanceof TrainingAttemptDeliveryError
        && error.code === 'TRAINING_CONTINUATION_SLOT_BINDING_MISMATCH'
        && error.status === 503,
    );
    assert.equal(readAttempted, false);
  }
});

test('derived solver authority rejects every cross-binding and lineage tamper', () => {
  const base = verifiedDerivedPostflop();
  assert.deepEqual(trainingQuestionCampaignEligibility(base), {
    eligible: true,
    reason: 'audited_poker_decision',
  });

  const cases = [
    ['scenario hash', (question) => { question.scenario.scenarioHash = 'tampered-scenario-hash'; }],
    ['solver node', (question) => { question.scenario.solverNode = 'r:tampered'; }],
    ['holding', (question) => { question.heroCards = ['Js', 'Ts']; }],
    ['board', (question) => {
      question.boardCards = ['Ah', '7d', '3c'];
      question.scenario.boardCards = ['Ah', '7d', '3c'];
      question.scenario.board = 'Ah 7d 3c';
    }],
    ['hero position', (question) => { question.scenario.heroPosition = 'CO'; }],
    ['villain position', (question) => { question.scenario.villainPosition = 'SB'; }],
    ['pot geometry', (question) => { question.scenario.pot = 7; }],
    ['option/action ids', (question) => {
      question.options = question.options.map((option) => (
        option.id === 'b125' ? { ...option, id: 'b150', text: 'Bet 150% Pot' } : option
      ));
      question.gtoFrequencies = {
        x: 10,
        b33: 20,
        b75: 60,
        b150: 10,
      };
    }],
    ['warehouse system', (question) => {
      question.solverPolicy.sourceArtifact.system = 'solved_spots_gold_v3';
    }],
    ['derived fallback domain', (question) => {
      question.solverPolicy.fallbackReason = 'flop_only_board_match';
      question.solverPolicy.validDomain.approximatedDimensions = ['turnRiverRunout'];
    }],
    ['exact relabel', (question) => {
      question.dataQuality = 'SOLVER_EXACT';
      question.sourceClassification = 'SOLVER_EXACT';
    }],
  ];

  const lineageTamper = {
    scenarioHash: 'tampered-lineage-hash',
    solverVersion: 'PioSOLVER-tampered',
    solverBinaryChecksum: 'f'.repeat(64),
    machineId: 'M2',
    pipelineCommit: 'f'.repeat(40),
    manifestVersion: 'training-v2-tampered',
    manifestChecksum: 'f'.repeat(64),
    sourceArtifactChecksum: 'f'.repeat(64),
    qualityStatus: 'tampered',
    auditedAt: '2026-09-07T00:00:00.000Z',
  };
  for (const [field, value] of Object.entries(lineageTamper)) {
    cases.push([`source/provenance ${field}`, (question) => {
      question.solverPolicy.sourceArtifact[field] = value;
    }]);
  }

  for (const [label, mutate] of cases) {
    const question = structuredClone(base);
    mutate(question);
    const contracted = canonical(question);
    assert.equal(contracted.questionContract.valid, true, `${label} must remain structurally testable`);
    assert.equal(
      trainingQuestionCampaignEligibility(contracted).eligible,
      false,
      `${label} must fail closed`,
    );
  }
});

test('audited chart authority binds its corpus identity, scenario, holding, seat, and all-in id', () => {
  const base = auditedChart();
  const cases = [
    ['corpus system', (question) => {
      question.solverPolicy.sourceArtifact.system = 'memory_charts_gold_copy';
    }],
    ['audit status', (question) => {
      question.solverPolicy.sourceArtifact.qualityStatus = 'validated';
    }],
    ['provenance completeness', (question) => {
      question.solverPolicy.sourceArtifact.provenanceComplete = false;
    }],
    ['fallback reason', (question) => {
      question.solverPolicy.fallbackReason = 'chart_fallback';
    }],
    ['approximated domain', (question) => {
      question.solverPolicy.validDomain.approximatedDimensions = ['stackDepth'];
    }],
    ['chart artifact id', (question) => { question.scenario.chartArtifactId = 'chart-copy'; }],
    ['chart scenario hash', (question) => { question.scenario.chartScenarioHash = 'chart|tampered'; }],
    ['chart source node', (question) => { question.scenario.chartSourceNode = 'chart-node-copy'; }],
    ['holding', (question) => { question.heroCards = ['Ah', 'Kh']; }],
    ['hero position', (question) => { question.scenario.heroPosition = 'CO'; }],
    ['stack depth', (question) => { question.scenario.stackDepth = 12; }],
    ['legacy push id', (question) => {
      question.options = question.options.map((option) => (
        option.id === 'all_in' ? { ...option, id: 'push' } : option
      ));
      question.correctAnswer = 'push';
      question.gtoFrequencies = { push: 100, fold: 0 };
      question.frequencies = { push: 1, fold: 0 };
    }],
  ];

  for (const [label, mutate] of cases) {
    const question = structuredClone(base);
    mutate(question);
    const contracted = canonical(question);
    assert.equal(contracted.questionContract.valid, true, `${label} must remain structurally testable`);
    assert.deepEqual(
      trainingQuestionCampaignEligibility(contracted),
      { eligible: false, reason: 'chart_authority_missing' },
      `${label} must fail closed`,
    );
  }
});

test('static local range frequencies remain practice-only without complete solver lineage', () => {
  const unsealed = trainingQuestionCampaignEligibility(auditedLocalPreflop());
  assert.deepEqual(unsealed, {
    eligible: false,
    reason: 'local_range_provenance_missing',
  });

  const partialLineage = auditedLocalPreflop();
  partialLineage.dataQuality = 'SOLVER_EXACT';
  partialLineage.solverProvenance = {
    verified: true,
    scenarioHash: 'local-static-range',
    sourceArtifactChecksum: 'd'.repeat(64),
  };
  const partial = trainingQuestionCampaignEligibility(partialLineage);
  assert.deepEqual(partial, {
    eligible: false,
    reason: 'local_range_provenance_missing',
  });

  assert.deepEqual(trainingQuestionCampaignEligibility(provenanceSealedLocalPreflop()), {
    eligible: false,
    reason: 'local_range_provenance_missing',
  }, 'a generic v2-looking envelope must not promote a local range without an audited local-policy authority');
});

test('simulated, illustrative, practice-only, legacy, and unaudited rows fail closed', () => {
  const base = verifiedPostflop();
  const cases = [
    [{ ...base, dataQuality: 'SIMULATED' }, 'authority_unverified'],
    [{ ...base, illustrative: true }, 'practice_or_illustrative'],
    [{ ...base, practiceOnly: true }, 'practice_or_illustrative'],
    [{
      ...base,
      source: 'LEGACY_STRATEGY_ARCHIVE',
      dataQuality: 'LEGACY_UNVERIFIED',
      solverProvenance: { verified: false },
    }, 'authority_unverified'],
    [{
      ...base,
      source: 'POSTFLOP_ENGINE',
      dataQuality: 'CURATED',
      solverProvenance: undefined,
      solverPolicy: undefined,
      sourceClassification: undefined,
    }, 'authority_unverified'],
    [{
      ...base,
      source: 'CURATED_SCENARIO',
      dataQuality: 'CURATED',
      solverProvenance: undefined,
      solverPolicy: undefined,
      sourceClassification: undefined,
    }, 'audited_decision_authority_missing'],
  ];

  for (const [question, expectedReason] of cases) {
    const result = trainingQuestionCampaignEligibility(question);
    assert.equal(result.eligible, false);
    assert.equal(result.reason, expectedReason);
  }
});

test('materially incomplete or contradictory poker context is never receipt eligible', () => {
  const base = verifiedPostflop();
  const incomplete = [
    { ...base, heroCards: undefined },
    { ...base, boardCards: [] },
    { ...base, boardCards: ['Ah', '7d', 'Ks'] },
    { ...base, street: undefined, scenario: { ...base.scenario, street: undefined } },
    { ...base, scenario: { ...base.scenario, heroPosition: undefined } },
    { ...base, scenario: { ...base.scenario, villainPosition: 'BTN' } },
    { ...base, scenario: { ...base.scenario, pot: undefined } },
    { ...base, scenario: { ...base.scenario, heroStack: undefined } },
    { ...base, scenario: { ...base.scenario, villainStack: undefined } },
    { ...base, scenario: { ...base.scenario, board: 'Ah 7d 3c' } },
  ];

  for (const question of incomplete) {
    const result = trainingQuestionCampaignEligibility(question);
    assert.equal(result.eligible, false);
    assert.ok(result.reason, 'the fail-closed result must explain its rejection');
  }
});

test('attempt creation rejects ineligible authority before the first persistence call', async () => {
  let persistenceTouched = false;
  const supabase = {
    from() {
      persistenceTouched = true;
      throw new Error('persistence must not be reached');
    },
    rpc() {
      persistenceTouched = true;
      throw new Error('persistence must not be reached');
    },
  };
  for (const ineligibleQuestion of [
    { ...verifiedPostflop(), dataQuality: 'SIMULATED' },
    auditedLocalPreflop(),
  ]) {
    await assert.rejects(
      prepareTrainingAttemptDelivery({
        supabase,
        userId: 'user-1',
        clientSessionId: 'session-1',
        gameId: 'cash-001',
        level: 1,
        sessionKind: 'campaign',
        requestedHands: 20,
        questions: [ineligibleQuestion],
        handOrdinalStart: 1,
      }),
      (error) => error instanceof TrainingAttemptDeliveryError
        && error.code === 'TRAINING_ATTEMPT_QUESTION_AUTHORITY_INELIGIBLE'
        && error.status === 422,
    );
  }
  assert.equal(persistenceTouched, false);
});

test('a resumed attempt cannot swap an eligible candidate for an ineligible persisted manifest', async () => {
  const legacy = canonical({
    ...verifiedPostflop(),
    id: 'legacy-flop-1',
    source: 'LEGACY_STRATEGY_ARCHIVE',
    dataQuality: 'LEGACY_UNVERIFIED',
    solverProvenance: { verified: false, source: 'solved_spots_gold_legacy' },
  });
  const legacySnapshot = buildTrainingQuestionSnapshot({
    canonicalQuestion: legacy,
    gameId: 'cash-001',
    level: 1,
  });
  const query = (result) => {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      gte() { return builder; },
      lte() { return builder; },
      in() { return builder; },
      order() { return builder; },
      upsert() { return builder; },
      abortSignal() { return Promise.resolve(result); },
    };
    return builder;
  };
  let snapshotCall = 0;
  let attemptHandCall = 0;
  const supabase = {
    from(table) {
      if (table === 'training_question_snapshots') {
        snapshotCall += 1;
        return snapshotCall === 1
          ? query({ data: null, error: null })
          : query({
              data: [{
                ...legacySnapshot,
              }],
              error: null,
            });
      }
      if (table === 'training_attempt_hands') {
        attemptHandCall += 1;
        return attemptHandCall === 1
          ? query({ data: null, error: null })
          : query({
              data: [{ hand_ordinal: 1, snapshot_key: legacySnapshot.snapshot_key }],
              error: null,
            });
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc() {
      return query({ data: { success: true, attemptId: 'attempt-1' }, error: null });
    },
  };

  await assert.rejects(
    prepareTrainingAttemptDelivery({
      supabase,
      userId: 'user-1',
      clientSessionId: 'session-1',
      gameId: 'cash-001',
      level: 1,
      sessionKind: 'campaign',
      requestedHands: 20,
      questions: [verifiedPostflop()],
      handOrdinalStart: 1,
    }),
    (error) => error instanceof TrainingAttemptDeliveryError
      && error.code === 'TRAINING_ATTEMPT_MANIFEST_AUTHORITY_INELIGIBLE'
      && error.status === 422,
  );
});

test('single-hand recovery reconstructs the registered manifest hand without a mutable cache candidate', async () => {
  const priorReceiptSecret = process.env.TRAINING_GRADING_RECEIPT_SECRET;
  process.env.TRAINING_GRADING_RECEIPT_SECRET = 'phase6-test-secret-that-is-at-least-32-bytes';
  const winner = verifiedPostflop({ id: 'manifest-winner-7' });
  const winnerSnapshot = buildTrainingQuestionSnapshot({
    canonicalQuestion: winner,
    gameId: 'cash-001',
    level: 1,
  });
  const calls = [];
  const query = (result) => {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      maybeSingle() { return builder; },
      abortSignal() { return Promise.resolve(result); },
    };
    return builder;
  };
  const supabase = {
    rpc(name, args) {
      calls.push({ name, args });
      return query({ data: { success: true, attemptId: 'attempt-1' }, error: null });
    },
    from(table) {
      if (table === 'training_attempt_hands') {
        return query({
          data: { hand_ordinal: 7, snapshot_key: winnerSnapshot.snapshot_key, status: 'allocated' },
          error: null,
        });
      }
      if (table === 'training_question_snapshots') {
        return query({
          data: winnerSnapshot,
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  let delivery;
  try {
    delivery = await recoverTrainingAttemptHand({
      supabase,
      userId: 'user-1',
      clientSessionId: 'session-1',
      gameId: 'cash-001',
      level: 1,
      sessionKind: 'campaign',
      difficultyMode: 'exact',
      requestedHands: 20,
      handOrdinal: 7,
      config: { gameMode: 'street', handSelection: 'close', targetStreet: 'flop' },
      questionSelection: { gameMode: 'street', handSelection: 'all', targetStreet: 'flop' },
    });
    await assert.rejects(
      recoverTrainingAttemptHand({
        supabase,
        userId: 'user-1',
        clientSessionId: 'session-1',
        gameId: 'cash-001',
        level: 1,
        sessionKind: 'campaign',
        difficultyMode: 'exact',
        requestedHands: 20,
        handOrdinal: 7,
        config: { engineType: 'PIO' },
        questionSelection: { gameMode: 'street', handSelection: 'all', targetStreet: 'turn' },
      }),
      (error) => error instanceof TrainingAttemptDeliveryError
        && error.code === 'TRAINING_ATTEMPT_SELECTION_MISMATCH'
        && error.status === 409,
    );
  } finally {
    if (priorReceiptSecret === undefined) delete process.env.TRAINING_GRADING_RECEIPT_SECRET;
    else process.env.TRAINING_GRADING_RECEIPT_SECRET = priorReceiptSecret;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, 'fn_start_training_attempt_v2');
  assert.equal(calls[0].args.p_expected_hands, 20);
  assert.equal(delivery.questions.length, 1);
  assert.equal(delivery.questions[0].id, 'manifest-winner-7');
  assert.equal(delivery.questions[0]._gradingContext.handOrdinal, 7);
  assert.equal(delivery.questions[0]._gradingContext.attemptId, 'attempt-1');
  assert.equal(delivery.questions[0]._gradingContext.sessionTargetHands, 20);
  assert.equal(
    delivery.questions[0]._gradingContext.submissionId,
    'training-attempt:attempt-1:hand:7:decision:1',
  );
});

test('single-hand recovery refuses an already-scored manifest hand before signing a receipt', async () => {
  const query = (result) => {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      maybeSingle() { return builder; },
      abortSignal() { return Promise.resolve(result); },
    };
    return builder;
  };
  let snapshotRead = false;
  const supabase = {
    rpc() {
      return query({ data: { success: true, attemptId: 'attempt-1' }, error: null });
    },
    from(table) {
      if (table === 'training_attempt_hands') {
        return query({
          data: { hand_ordinal: 7, snapshot_key: 'a'.repeat(64), status: 'scored' },
          error: null,
        });
      }
      if (table === 'training_question_snapshots') snapshotRead = true;
      throw new Error(`unexpected table ${table}`);
    },
  };

  await assert.rejects(
    recoverTrainingAttemptHand({
      supabase,
      userId: 'user-1',
      clientSessionId: 'session-1',
      gameId: 'cash-001',
      level: 1,
      sessionKind: 'campaign',
      difficultyMode: 'exact',
      requestedHands: 20,
      handOrdinal: 7,
    }),
    (error) => error instanceof TrainingAttemptDeliveryError
      && error.code === 'TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED'
      && error.status === 409,
  );
  assert.equal(snapshotRead, false);
});

test('single-hand recovery rejects digest-valid snapshots with forged deterministic identity', async () => {
  const winner = verifiedPostflop({ id: 'manifest-winner-forgery' });
  const canonicalSnapshot = buildTrainingQuestionSnapshot({
    canonicalQuestion: winner,
    gameId: 'cash-001',
    level: 1,
  });
  const corruptions = [
    { ...canonicalSnapshot, snapshot_key: 'f'.repeat(64) },
    { ...canonicalSnapshot, source_question_id: 'different-question-id' },
  ];

  for (const corruptedSnapshot of corruptions) {
    const query = (result) => {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        maybeSingle() { return builder; },
        abortSignal() { return Promise.resolve(result); },
      };
      return builder;
    };
    const supabase = {
      rpc() {
        return query({ data: { success: true, attemptId: 'attempt-1' }, error: null });
      },
      from(table) {
        if (table === 'training_attempt_hands') {
          return query({
            data: {
              hand_ordinal: 7,
              snapshot_key: corruptedSnapshot.snapshot_key,
              status: 'allocated',
            },
            error: null,
          });
        }
        if (table === 'training_question_snapshots') {
          return query({ data: corruptedSnapshot, error: null });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await assert.rejects(
      recoverTrainingAttemptHand({
        supabase,
        userId: 'user-1',
        clientSessionId: 'session-1',
        gameId: 'cash-001',
        level: 1,
        sessionKind: 'campaign',
        difficultyMode: 'exact',
        requestedHands: 20,
        handOrdinal: 7,
      }),
      (error) => error instanceof TrainingAttemptDeliveryError
        && error.code === 'TRAINING_QUESTION_SNAPSHOT_MISMATCH'
        && error.status === 503,
    );
  }
});

test('both serving paths removed fabricated poker-state fallbacks before persistence', () => {
  for (const route of [
    'pages/api/training/get-question.js',
    'pages/api/training/batch-preload.js',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, route), 'utf8');
    assert.match(source, /normalizeCampaignQuestionWithoutFabrication/);
    assert.match(source, /isTrainingQuestionCampaignEligible/);
    assert.doesNotMatch(source, /_getDeterministicCards|hashSeed|handNotationToRepresentativeCards/);
    assert.doesNotMatch(source, /scenario\.heroPosition\s*=|scenario\.villainPosition\s*=/);
    assert.doesNotMatch(source, /scenario\.pot\s*=|scenario\.heroStack\s*=|scenario\.villainStack\s*=/);
    assert.doesNotMatch(source, /CACHED_LEGACY|CACHED_SCENARIO|dataQuality\s*=\s*['"]SIMULATED/);
  }
});

test('campaign reissue revalidates historical snapshots before signing receipts', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/reissue-questions.js'),
    'utf8',
  );
  const authorityCheck = source.indexOf('trainingQuestionCampaignEligibility(snapshot.question_data)');
  const signing = source.indexOf('prepareTrainingQuestionForDelivery({', authorityCheck);
  assert.ok(authorityCheck > 0);
  assert.ok(signing > authorityCheck);
  assert.match(source, /TRAINING_REISSUE_QUESTION_AUTHORITY_INELIGIBLE/);
});
