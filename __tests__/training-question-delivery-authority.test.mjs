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
  prepareTrainingAttemptDelivery,
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
                snapshot_key: 'legacy-snapshot',
                source_question_id: legacy.id,
                game_id: 'cash-001',
                level: 1,
                content_digest: trainingQuestionDigest(legacy),
                question_data: legacy,
              }],
              error: null,
            });
      }
      if (table === 'training_attempt_hands') {
        attemptHandCall += 1;
        return attemptHandCall === 1
          ? query({ data: null, error: null })
          : query({
              data: [{ hand_ordinal: 1, snapshot_key: 'legacy-snapshot' }],
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
