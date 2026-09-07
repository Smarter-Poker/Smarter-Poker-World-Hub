import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { enforceTrainingQuestionContract } from '../src/lib/training/questionContract.mjs';
import {
  prepareTrainingAttemptDelivery,
  trainingQuestionCampaignEligibility,
  TrainingAttemptDeliveryError,
} from '../src/lib/training/trainingAttemptDelivery.mjs';
import { trainingQuestionDigest } from '../src/lib/training/gradingReceipt.mjs';

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
      action: 'The Big Blind checks to you.',
    },
    question: 'The Big Blind checks to you on the flop. What is your best action?',
    options: actionOptions,
    correctAnswer: 'b75',
    gtoFrequencies: { x: 10, b33: 20, b75: 60, b125: 10 },
    ...overrides,
  };
  return canonical(question);
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
  return canonical({
    ...auditedLocalPreflop(),
    id: 'sealed-local-preflop-1',
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: sealedProvenance,
    evidenceDisclosure: 'Provenance-sealed PioSOLVER export; frequencies are exact for this recorded node. Per-action EV is not available.',
  });
}

function auditedChart() {
  return canonical({
    id: 'chart-preflop-1',
    type: 'CHART',
    source: 'CHART',
    dataQuality: 'CHART_EXACT',
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
      heroStack: 15,
      villainStack: 15,
      action: 'Action folds to you on the Button.',
    },
    question: 'Action folds to you on the Button with AKs. Push or Fold?',
    options: [
      { id: 'push', text: 'Push All-In' },
      { id: 'fold', text: 'Fold' },
    ],
    correctAnswer: 'push',
    gtoFrequencies: { push: 100, fold: 0 },
  });
}

function psychologyQuestion() {
  return canonical({
    id: 'psych-1',
    source: 'PSYCHOLOGY_BANK',
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
  });
}

function conceptQuestion() {
  return canonical({
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
  });
}

test('only audited source families cross the progress-bearing delivery boundary', () => {
  for (const question of [
    verifiedPostflop(),
    provenanceSealedLocalPreflop(),
    auditedChart(),
    psychologyQuestion(),
    conceptQuestion(),
  ]) {
    assert.deepEqual(
      trainingQuestionCampaignEligibility(question).eligible,
      true,
      `${question.id} should be eligible`,
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
    }, 'authority_unverified'],
    [{
      ...base,
      source: 'CURATED_SCENARIO',
      dataQuality: 'CURATED',
      solverProvenance: undefined,
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
    { ...base, scenario: { ...base.scenario, street: undefined } },
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
    assert.ok(
      ['poker_context_incomplete', 'question_contract_invalid'].includes(result.reason),
      result.reason,
    );
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
