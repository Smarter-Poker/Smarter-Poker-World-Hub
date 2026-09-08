import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

import {
  TRAINING_SOURCE_CLASSIFICATIONS,
  alignQuestionToCanonicalPolicy,
  gradeCanonicalPolicyDecision,
  sourceClassificationForQuestion,
  trainingSourcePresentation,
} from '../src/lib/training/cacheTruthContract.mjs';
import {
  buildTrainingCacheRow,
  cacheRowIsServingEligible,
  withPersistedCacheReceipt,
} from '../src/lib/training/cacheTruthPersistence.mjs';
import {
  trainingAnswerBindingMatches,
} from '../src/lib/training/answerPersistence.mjs';

const SHA256 = 'a'.repeat(64);
const read = (file) => fs.readFileSync(file, 'utf8');

function exactQuestion() {
  const solverPolicy = JSON.parse(read('contracts/solver-policy/fixtures/exact-policy.v1.json'));
  return {
    id: 'phase3-exact-question',
    type: 'PIO',
    source: 'DETERMINISTIC_SOLVER',
    dataQuality: 'SOLVER_EXACT',
    question: 'Which action follows the sealed solver policy?',
    explanation: 'The answer is graded from the immutable policy distribution.',
    scenario: { scenarioHash: solverPolicy.sourceArtifact.scenarioHash, street: 'flop' },
    heroCards: ['As', 'Ks'],
    boardCards: ['Jh', '7d', '2c'],
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet_75pct', text: 'Bet 75% Pot' },
    ],
    correctAnswer: 'bet_75pct',
    solverPolicy,
  };
}

test('Phase 3 exposes exactly one mutually exclusive eight-value provenance taxonomy', () => {
  assert.deepEqual(TRAINING_SOURCE_CLASSIFICATIONS, [
    'SOLVER_EXACT',
    'SOLVER_AGGREGATED',
    'SOLVER_DERIVED_RESPONSE',
    'CHART_AUDITED',
    'MODEL_DISTILLED',
    'CURATED',
    'HEURISTIC',
    'LEGACY_UNVERIFIED',
  ]);
  assert.equal(new Set(TRAINING_SOURCE_CLASSIFICATIONS).size, 8);
});

test('historical labels and answer percentages cannot manufacture solver or chart provenance', () => {
  for (const question of [
    { source: 'DETERMINISTIC_SOLVER', dataQuality: 'SOLVER_EXACT' },
    { source: 'CHART', type: 'CHART', gtoFrequencies: { push: 70, fold: 30 } },
    { sourceClassification: 'SOLVER_AGGREGATED' },
  ]) {
    assert.equal(sourceClassificationForQuestion(question), 'LEGACY_UNVERIFIED');
  }
  assert.equal(sourceClassificationForQuestion({ source: 'POSTFLOP_ENGINE' }), 'HEURISTIC');
  assert.equal(sourceClassificationForQuestion({ source: 'CURATED_SCENARIO' }), 'CURATED');
});

test('answer grading ignores mutable cached answer text and uses only canonical policy', () => {
  const question = alignQuestionToCanonicalPolicy(exactQuestion());
  assert.equal(question.correctAnswer, 'check');
  assert.equal(question.sourceClassification, 'SOLVER_EXACT');
  question.correctAnswer = 'bet_75pct';
  question.correctAnswerText = 'Bet 75% Pot';

  const check = gradeCanonicalPolicyDecision(question.solverPolicy, 'check');
  const bet = gradeCanonicalPolicyDecision(question.solverPolicy, 'bet_75pct');
  assert.deepEqual(
    { classification: check.classification, isCorrect: check.isCorrect, selectedFrequency: check.selectedFrequency },
    { classification: 'best', isCorrect: true, selectedFrequency: 60 },
  );
  assert.deepEqual(
    { classification: bet.classification, isCorrect: bet.isCorrect, selectedFrequency: bet.selectedFrequency },
    { classification: 'best', isCorrect: true, selectedFrequency: 40 },
  );
});

test('a served question is bound to the exact row, embedded policy, classification, and checksum', () => {
  const cacheRow = buildTrainingCacheRow({
    question: exactQuestion(),
    questionId: 'phase3-exact-question',
    gameId: 'cash-001',
    questionKind: 'PIO',
    gameType: 'cash',
    level: 4,
    generatedAt: '2026-09-07T06:00:00.000Z',
  });
  const persisted = {
    ...cacheRow,
    quality_status: 'active',
    policy_checksum: SHA256,
  };
  assert.equal(cacheRow.question_data.id, cacheRow.question_id);
  assert.equal(cacheRow.source_classification, 'SOLVER_EXACT');
  assert.equal(cacheRowIsServingEligible(persisted), true);
  const served = withPersistedCacheReceipt(cacheRow.question_data, persisted);
  assert.equal(served.policyChecksum, SHA256);
  assert.equal(trainingSourcePresentation(served).label, 'EXACT SOLVER');

  const altered = structuredClone(persisted);
  altered.question_data.solverPolicy.distribution.check = 0.5;
  assert.equal(cacheRowIsServingEligible(altered), false);
  assert.throws(() => withPersistedCacheReceipt(cacheRow.question_data, altered), /does not match/);
});

test('a fresh local range fallback is normalized to the database legacy archive contract', () => {
  const question = exactQuestion();
  question.source = 'local_solver_ranges';
  question.dataQuality = 'LEGACY_UNVERIFIED';
  question.questionContract = { version: 1, valid: true, issues: [] };
  question.solverProvenance = { verified: false, source: 'local_solver_ranges' };
  question.solverPolicy = {
    ...question.solverPolicy,
    kind: 'derived',
    qualitySeal: 'LEGACY_UNVERIFIED',
    sourceArtifact: {
      ...question.solverPolicy.sourceArtifact,
      system: 'local_solver_ranges',
      provenanceComplete: false,
    },
  };

  const row = buildTrainingCacheRow({
    question,
    questionId: question.id,
    gameId: 'cash-001',
    questionKind: 'PIO',
    gameType: 'cash',
    level: 1,
  });
  assert.equal(row.source_classification, 'LEGACY_UNVERIFIED');
  assert.equal(row.quality_status, 'active_fallback');
  assert.equal(row.question_data.source, 'LEGACY_STRATEGY_ARCHIVE');
  assert.equal(row.question_data.legacySource, 'local_solver_ranges');
  assert.equal(row.question_data.solverProvenance.verified, false);
  assert.equal(
    row.question_data.evidenceDisclosure,
    'Legacy strategy archive; writer provenance is unavailable.',
  );
});

test('submission retries are accepted only for an identical immutable answer binding', () => {
  const answer = {
    user_id: '11111111-1111-4111-8111-111111111111',
    game_id: 'cash-001',
    question_id: 'phase3-exact-question',
    answer_id: 'check',
    is_correct: true,
    level: 4,
    hero_position: 'BTN',
    villain_position: 'BB',
    street: 'flop',
    classification: 'best',
    ev_loss: 0,
    spot_type: 'single-raised-pot',
    submission_id: 'immutable-retry',
    session_id: 'session-1',
    attempt_id: '22222222-2222-4222-8222-222222222222',
    snapshot_key: SHA256,
    hand_ordinal: 3,
    decision_ordinal: 2,
    solver_verified: true,
    solver_source: 'solved_spots_gold_v2',
    selected_frequency: 60,
    optimal_frequency: 60,
    ev_loss_measured: false,
    evidence_metadata: { policyChecksum: SHA256, dataQuality: 'SOLVER_EXACT' },
  };
  assert.equal(trainingAnswerBindingMatches(answer, structuredClone(answer)), true);
  const reordered = structuredClone(answer);
  reordered.evidence_metadata = { dataQuality: 'SOLVER_EXACT', policyChecksum: SHA256 };
  assert.equal(trainingAnswerBindingMatches(answer, reordered), true);
  const wireSerialized = structuredClone(answer);
  wireSerialized.is_correct = 'true';
  wireSerialized.solver_verified = 'true';
  wireSerialized.ev_loss_measured = 'false';
  wireSerialized.level = '4';
  wireSerialized.ev_loss = '0';
  assert.equal(trainingAnswerBindingMatches(answer, wireSerialized), true);
  const changedAction = structuredClone(answer);
  changedAction.answer_id = 'bet_75pct';
  assert.equal(trainingAnswerBindingMatches(answer, changedAction), false);
  for (const field of ['session_id', 'attempt_id', 'snapshot_key', 'hand_ordinal', 'decision_ordinal']) {
    const changedBinding = structuredClone(answer);
    changedBinding[field] = typeof answer[field] === 'number' ? answer[field] + 1 : `${answer[field]}-changed`;
    assert.equal(trainingAnswerBindingMatches(answer, changedBinding), false, field);
  }
});

test('every live Training producer persists and receipts canonical questions before returning', () => {
  for (const file of [
    'pages/api/training/get-question.js',
    'pages/api/training/batch-preload.js',
    'pages/api/training/custom-train.js',
    'pages/api/training/next-street.js',
    'pages/api/training/spot-drill.js',
  ]) {
    const source = read(file);
    assert.match(source, /policyChecksum|persistCanonicalTrainingQuestions|withPersistedCacheReceipt/);
    assert.match(source, /recordTrainingQuestionsServed|persistCanonicalTrainingQuestions/);
  }
  for (const file of [
    'pages/api/training/get-question.js',
    'pages/api/training/batch-preload.js',
    'pages/api/training/record-question.js',
    'pages/api/training/hand-of-the-day.js',
    'pages/api/training/report-question.js',
  ]) {
    assert.match(read(file), /active_fallback/);
  }
});

test('secondary Training UI renders the database-backed source class and submits its receipt', () => {
  const spotTrainer = read('pages/hub/training/spot-trainer.js');
  const dailyChallenge = read('pages/hub/training/daily-challenge.js');
  const universalTable = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.match(spotTrainer, /trainingSourcePresentation/);
  assert.match(spotTrainer, /policyChecksum/);
  assert.match(spotTrainer, /sourceBadge\.label/);
  assert.match(dailyChallenge, /referenceLabel/);
  assert.match(universalTable, /trainingSourcePresentation/);
});

test('the daily cache drift audit is scheduled on the authenticated workers route', () => {
  const dispatcher = read('scripts/openclaw-cron-dispatcher.py');
  assert.match(
    dispatcher,
    /\('\/api\/cron\/training-cache-drift-audit',\s+dict\(hour=8, minute=10\)\)/,
  );
  assert.match(
    dispatcher,
    /\('\/api\/cron\/training-cache-drift-audit',\s+dict\(hour=8, minute=25\)\)/,
  );
  assert.match(
    dispatcher,
    /'\/api\/cron\/training-cache-drift-audit':\s*2/,
  );
  assert.match(
    dispatcher,
    /'\/api\/cron\/training-cache-drift-audit':\s+'\/cron\/training-cache-drift-audit'/,
  );
});

test('legacy cache writers are fail-closed and cannot mutate the cache', () => {
  const generator = spawnSync(process.execPath, ['scripts/generate-test-questions.js'], {
    encoding: 'utf8',
  });
  assert.equal(generator.status, 2);
  assert.match(generator.stderr, /permanently retired/);
  assert.doesNotMatch(read('scripts/generate-test-questions.js'), /createClient|\.insert\(/);

  const panelGenerator = spawnSync(
    process.execPath,
    ['scripts/generate-training-gto-panels.js'],
    { encoding: 'utf8' },
  );
  assert.equal(panelGenerator.status, 2);
  assert.match(panelGenerator.stderr, /permanently retired/);
  assert.doesNotMatch(
    read('scripts/generate-training-gto-panels.js'),
    /createClient\(|api\.x\.ai|writeFileSync/,
  );

  const reseeder = spawnSync(process.execPath, ['scripts/reseed-deterministic-cache.js', '--live'], {
    encoding: 'utf8',
  });
  assert.equal(reseeder.status, 2);
  assert.match(reseeder.stderr, /Mutation mode is permanently retired/);
  assert.match(read('scripts/reseed-deterministic-cache.js'), /throw new Error\('Legacy cache mutation is permanently retired\.'/);
});

test('database expansion installs quarantine, atomic events, and daily drift audit compatibly', () => {
  const expansion = read('supabase/migrations/20260907060000_training_cache_truth_contract.sql');
  const driftAttestation = read(
    'supabase/migrations/20260907065000_training_cache_drift_audit_performance.sql',
  );
  const boundedAudit = read(
    'supabase/migrations/20260907066000_training_cache_drift_audit_bounded_execution.sql',
  );
  assert.match(expansion, /training_question_cache_quarantine/);
  assert.match(expansion, /fn_training_cache_record_event/);
  assert.match(expansion, /ON CONFLICT \(event_type, event_key\) DO NOTHING/);
  assert.match(expansion, /fn_training_cache_run_drift_audit/);
  assert.doesNotMatch(expansion, /ALTER COLUMN canonical_policy SET NOT NULL/);
  assert.match(driftAttestation, /contract_stamped_at/);
  assert.match(driftAttestation, /zy_training_question_cache_contract_dirty/);
  assert.match(driftAttestation, /fn_training_cache_attested_classification/);
  assert.match(boundedAudit, /'auditShardCount', 32/);
  assert.match(boundedAudit, /'counterRowsInspected'/);
  assert.match(boundedAudit, /AND i\.is_dirty/);
  assert.doesNotMatch(boundedAudit, /SELECT c\.\*/);
});

test('database enforcement closes the rolling-deploy window without weakening validation', () => {
  const enforcement = read(
    'supabase/migrations/20260907070000_training_cache_truth_enforcement.sql',
  );
  assert.match(enforcement, /SET LOCAL statement_timeout = '20min'/);
  assert.match(enforcement, /ALTER COLUMN canonical_policy SET NOT NULL/);
  assert.match(enforcement, /ALTER COLUMN policy_checksum SET NOT NULL/);
  assert.match(enforcement, /fn_training_cache_grade/);
  assert.match(enforcement, /fn_training_cache_row_is_valid/);
  assert.match(enforcement, /training_answer_missing_policy_checksum/);
  assert.match(enforcement, /training_answer_stale_policy/);
  assert.match(enforcement, /training_answer_grade_mismatch/);
  assert.match(enforcement, /training_answer_solver_evidence_mismatch/);
  assert.match(enforcement, /training_answer_fallback_claims_solver_evidence/);
  assert.match(enforcement, /training_answer_ev_evidence_mismatch/);
  assert.match(enforcement, /training_answer_lineage_mismatch/);
  assert.match(enforcement, /training_session_question_missing_policy_checksum/);
  assert.match(enforcement, /training_session_contains_conflicting_policy_checksums/);
  assert.match(enforcement, /REVOKE ALL ON FUNCTION public\.fn_training_answer_cache_event\(\)/);
  assert.match(enforcement, /REVOKE ALL ON FUNCTION public\.fn_training_session_cache_completion\(\)/);
});

test('certification hardens historical provenance, selected-action binding, and ledger grants', () => {
  const integrity = read(
    'supabase/migrations/20260908140000_training_cache_event_integrity.sql',
  );
  assert.match(integrity, /binding_status/);
  assert.match(integrity, /HISTORICAL_UNBOUND/);
  assert.match(integrity, /historicalPolicyBinding/);
  assert.match(integrity, /selectedAnswer/);
  assert.match(integrity, /answered_event_requires_selected_answer/);
  assert.match(integrity, /v_existing\.metadata IS DISTINCT FROM v_metadata/);
  assert.match(integrity, /training_answer_is_immutable/);
  assert.match(integrity, /AFTER INSERT ON public\.training_answers/);
  assert.match(integrity, /REVOKE ALL PRIVILEGES ON TABLE public\.training_question_events FROM service_role/);
  assert.match(integrity, /GRANT SELECT ON TABLE public\.training_question_events TO service_role/);

  const recorder = read('pages/api/training/record-question.js');
  assert.match(recorder, /from\('training_answers'\)\.insert\(evidenceRow\)/);
  assert.doesNotMatch(recorder, /from\('training_answers'\)\.upsert/);
  assert.match(recorder, /trainingAnswerBindingMatches/);
  assert.match(recorder, /TRAINING_ANSWER_BINDING_MISMATCH/);
  assert.match(read('pages/api/assistant/leaks/drill-answer.js'), /selectedAnswer:/);
  const handOfTheDay = read('pages/api/training/hand-of-the-day.js');
  assert.match(handOfTheDay, /req\.method !== 'GET'/);
  assert.doesNotMatch(
    handOfTheDay,
    /req\.body(?:\?\.)?\.selectedAction|const\s*\{[^}]*selectedAction/,
    'the Daily Challenge read route cannot accept or grade a browser-authored selection',
  );
  assert.match(
    read('supabase/migrations/20260907203000_training_attempt_decision_delivery_authority.sql'),
    /'selectedAnswer', p_answer\.answer_id/,
    'Daily Challenge answers share the signed answer path; only its immutable answer-event trigger records the selected action',
  );
});

test('the production backfill supports transactional Postgres transport and bounded resume ranges', () => {
  const backfill = read('scripts/backfill-training-cache-truth.mjs');
  assert.match(backfill, /--direct-db/);
  assert.match(backfill, /jsonb_to_recordset/);
  assert.match(backfill, /BEGIN/);
  assert.match(backfill, /ROLLBACK/);
  assert.match(backfill, /--from-id/);
  assert.match(backfill, /--before-id/);
});

test('the read-only 107-game audit exposes the complete audited chart projection', () => {
  const audit = read('scripts/training-live-catalog-audit.js');
  for (const column of [
    'chart_id', 'game_type', 'stack_depth', 'hero_position',
    'villain_action', 'hand_matrix', 'created_at',
  ]) {
    assert.match(audit, new RegExp(`memory_charts_gold[\\s\\S]{0,220}'${column}'`));
  }
  assert.match(audit, /value instanceof Date/);
  assert.match(audit, /value\.toISOString\(\)/);
});

test('static solver contract audit still passes after mutation retirement', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/training-solver-contract-audit.js'], {
    encoding: 'utf8',
  }));
  assert.equal(report.success, true, report.failures.join('\n'));
});
