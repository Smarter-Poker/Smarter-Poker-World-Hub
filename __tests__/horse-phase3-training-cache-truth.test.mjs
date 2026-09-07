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

test('every live Training producer persists and receipts canonical questions before returning', () => {
  for (const file of [
    'pages/api/training/get-question.js',
    'pages/api/training/batch-preload.js',
    'pages/api/training/custom-train.js',
    'pages/api/training/next-street.js',
    'pages/api/training/spot-drill.js',
  ]) {
    const source = read(file);
    assert.match(source, /policyChecksum|persistCanonicalTrainingQuestions/);
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

test('the production backfill supports transactional Postgres transport and bounded resume ranges', () => {
  const backfill = read('scripts/backfill-training-cache-truth.mjs');
  assert.match(backfill, /--direct-db/);
  assert.match(backfill, /jsonb_to_recordset/);
  assert.match(backfill, /BEGIN/);
  assert.match(backfill, /ROLLBACK/);
  assert.match(backfill, /--from-id/);
  assert.match(backfill, /--before-id/);
});

test('static solver contract audit still passes after mutation retirement', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/training-solver-contract-audit.js'], {
    encoding: 'utf8',
  }));
  assert.equal(report.success, true, report.failures.join('\n'));
});
