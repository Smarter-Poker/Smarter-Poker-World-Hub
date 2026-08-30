import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { sealDrillBatch, openDrillBatch, gradeDrillAnswer, gradeDrillRows }
  from '../src/lib/personal-assistant/drillTelemetry.js';
import { lockedDrillResult } from '../src/lib/personal-assistant/lockedDrillResult.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = path => readFileSync(resolve(here, path), 'utf8');
const migration = read('../supabase/migrations/20260830193000_verified_leak_drill_telemetry.sql');
const reviewApi = read('../pages/api/assistant/leaks/review.js');
const answerApi = read('../pages/api/assistant/leaks/drill-answer.js');
const drillApi = read('../pages/api/sandbox/_routes/custom-drill.js');
const drillUi = read('../src/components/sandbox/QuickSpotDrill.jsx');
const rewards = read('../src/lib/rewards/eggVerifiers.js');
const secret = 'phase-five-test-secret-that-is-long-enough';
const now = Date.parse('2026-08-30T19:30:00.000Z');

function solverQuestion() {
  return {
    source: 'DETERMINISTIC_SOLVER',
    gtoFrequencies: { raise: 80, call: 20, fold: 0 },
    correctAnswer: 'raise',
    options: [
      { id: 'raise', text: 'Raise' }, { id: 'call', text: 'Call' }, { id: 'fold', text: 'Fold' },
    ],
    explanation: 'Raise is the primary solver action.',
  };
}

test('verified sessions enforce five-question minimum and bind identity plus expiry', () => {
  assert.equal(sealDrillBatch({ leakId: 'leak-1', questionIds: ['q1', 'q2', 'q3', 'q4'] }, 'user-1', { secret, now }), null);
  const ids = ['q1', 'q2', 'q3', 'q4', 'q5'];
  const token = sealDrillBatch({ leakId: 'leak-1', questionIds: ids }, 'user-1', { secret, now });
  assert.deepEqual(openDrillBatch(token, 'user-1', 'leak-1', { secret, now: now + 1000 }).questionIds, ids);
  assert.throws(() => openDrillBatch(token, 'user-2', 'leak-1', { secret, now }), /invalid_drill_token/);
  assert.throws(() => openDrillBatch(token, 'user-1', 'leak-2', { secret, now }), /invalid_drill_token/);
  assert.throws(() => openDrillBatch(`${token}x`, 'user-1', 'leak-1', { secret, now }), /invalid_drill_token/);
  assert.throws(() => openDrillBatch(token, 'user-1', 'leak-1', { secret, now: now + 3600001 }), /invalid_drill_token/);
});

test('canonical grading uses the same verified solver frequencies as training', () => {
  assert.equal(gradeDrillAnswer(solverQuestion(), 'Raise').correct, true);
  assert.equal(gradeDrillAnswer(solverQuestion(), 'Call').correct, true, 'mixed action in solver range is valid');
  assert.equal(gradeDrillAnswer(solverQuestion(), 'Fold').correct, false);
  assert.equal(gradeDrillAnswer({ correctAnswer: 'Raise', options: ['Raise', 'Fold'] }, 'Raise').reason, 'question_not_solver_verified');

  const rows = ['q1', 'q2', 'q3'].map(id => ({ id, question_data: solverQuestion() }));
  const graded = gradeDrillRows(rows, ['q1', 'q2', 'q3'], [
    { questionId: 'q1', selectedAnswer: 'Raise' },
    { questionId: 'q2', selectedAnswer: 'Fold' },
    { questionId: 'q3', timedOut: true },
  ]);
  assert.equal(graded.ok, true);
  assert.equal(graded.correct, 1);
});

test('initial verified payload hides keys and exact solver provenance gates signing', () => {
  assert.match(drillApi, /isVerifiedSolverQuestion/);
  assert.match(drillApi, /matchesExactSolverScope/);
  assert.match(drillApi, /detectorManaged === true/);
  assert.match(drillApi, /sourceSystem === 'solver_engine'/);
  assert.match(drillApi, /pool\.length < MIN_VERIFIED_QUESTIONS/);
  assert.match(drillApi, /correct_answer: _answer, gto_explanation: _explanation/);
  assert.match(drillApi, /answer_locked: true/);
  assert.doesNotMatch(drillApi, /start_verified_leak_drill/);
  assert.match(answerApi, /Session creation is deliberately deferred until the first locked answer/);
  assert.match(answerApi, /start_verified_leak_drill/);
});

test('answers are immutable, private, token-bound, and revealed only after locking', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.leak_drill_sessions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.leak_drill_answers/);
  assert.match(migration, /Merely loading or abandoning a drill does not consume an attempt/);
  assert.match(migration, /UPDATE public\.leak_drill_sessions SET attempt_number = v_attempt/);
  assert.match(migration, /leak_drill_answers_first_lock UNIQUE \(user_id, batch_id, question_id\)/);
  assert.match(migration, /question_ids \? p_question_id/);
  assert.match(migration, /completed_at IS NULL/);
  assert.match(migration, /REVOKE ALL ON public\.leak_drill_sessions, public\.leak_drill_answers/);
  assert.match(answerApi, /openDrillBatch/);
  assert.match(answerApi, /batch\.questionIds\.includes\(questionId\)/);
  assert.match(answerApi, /record_verified_leak_drill_answer/);
  assert.match(drillUi, /lockVerifiedAnswer/);
  assert.match(drillUi, /await lockVerifiedAnswer/);
  assert.doesNotMatch(drillUi, /answerEvidenceRef/);
});

test('completion derives score from private records and never resolves empirical leak truth', () => {
  assert.match(migration, /record_verified_leak_drill_attempt/);
  assert.match(migration, /FROM public\.leak_drill_answers/);
  assert.match(migration, /v_total <> jsonb_array_length\(p_question_ids\)/);
  assert.match(migration, /remediation_mastered/);
  assert.doesNotMatch(migration, /UPDATE public\.user_leaks\s+SET status = 'resolved'/);
  assert.match(migration, /detector_managed = true AND source_system = 'solver_engine'/);
  assert.match(migration, /leak_type ~ '\^solver_\(training\|club_arena\)_'/);
  assert.match(migration, /FROM public\.leak_review_operations WHERE user_id = p_user_id AND leak_id = p_leak_id/);
  assert.match(migration, /leak_drill_user:/);
  assert.match(migration, /batch_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /REVOKE SELECT ON public\.training_question_cache FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /FROM public\.leak_review_operations WHERE user_id = p_user_id AND leak_id = p_leak_id/);
});

test('review rejects browser evidence and retries telemetry before schedule replay', () => {
  assert.match(reviewApi, /Final answer arrays are not accepted/);
  assert.match(reviewApi, /record_verified_leak_drill_attempt/);
  assert.match(reviewApi, /p_batch_id: batch\.batchId/);
  assert.ok(reviewApi.indexOf("record_verified_leak_drill_attempt") < reviewApi.indexOf('Sequential replay after a lost response'));
  assert.doesNotMatch(reviewApi, /the_optimizer|optimizer_eligible/);
  assert.match(drillUi, /authedFetch\('\/api\/assistant\/leaks\/review'/);
  assert.doesNotMatch(reviewApi, /p_correct: verifiedDrill\.correct/);
});

test('The Optimizer fails closed until Club Arena recovery is recorder-attested', () => {
  assert.doesNotMatch(rewards, /the_optimizer:\s*async/);
  assert.match(rewards, /the_optimizer: 'needs immutable server-recorder-attested Club Arena recovery evidence'/);
});

test('source-less verified compatibility questions receive a lockable canonical provenance label', () => {
  const question = solverQuestion();
  delete question.source;
  question.solverProvenance = { verified: true };
  const graded = gradeDrillAnswer(question, 'Raise');
  assert.equal(graded.ok, true);
  assert.equal(graded.solverSource, 'SOLVER_PROVENANCE_VERIFIED');
});

test('lost choice response remains the locked choice when retry arrives as a timeout', () => {
  assert.deepEqual(lockedDrillResult({ timedOut: false, isCorrect: true, selectedAnswer: 'Raise' }, null), {
    timedOut: false, correct: true, pick: 'Raise',
  });
});

test('lost timeout response remains a timeout when retry arrives as a choice', () => {
  assert.deepEqual(lockedDrillResult({ timedOut: true, isCorrect: false, selectedAnswer: null }, 'Raise'), {
    timedOut: true, correct: false, pick: 'Ran out of time',
  });
});
