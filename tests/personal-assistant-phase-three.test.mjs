import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SCHEMA_VERSION,
  gradeReview,
  initialReview,
  leakToDrill,
  leakToTrainingGame,
} from '../src/lib/sandbox/leakReview.js';

test('review schema v3 preserves an operation id and rejects duplicate grading', () => {
  assert.equal(SCHEMA_VERSION, 3);
  const now = new Date('2026-08-30T12:00:00.000Z');
  const initial = initialReview({ id: 'leak-1', leakType: 'solver_cash_rfi' }, now);
  const once = gradeReview(initial, { correct: 9, total: 10, reviewId: 'review-operation-001' }, now);
  const replay = gradeReview(once, { correct: 9, total: 10, reviewId: 'review-operation-001' }, new Date(now.getTime() + 1000));
  const next = gradeReview(replay, { correct: 9, total: 10, reviewId: 'review-operation-002' }, new Date(now.getTime() + 2000));

  assert.equal(once.history.at(-1).reviewId, 'review-operation-001');
  assert.deepEqual(replay, once);
  assert.equal(next.history.length, once.history.length + 1);
  assert.equal(next.reps, once.reps + 1);

  const delayedReplay = gradeReview(next, { correct: 9, total: 10, reviewId: 'review-operation-001' }, new Date(now.getTime() + 3000));
  assert.deepEqual(delayedReplay, next);
});

test('solver leak drill handoff preserves its exact Training Arena game', () => {
  const drill = leakToDrill({
    sourceSystem: 'solver_engine',
    recommendedDrill: 'cash-rfi',
    leakCategory: 'preflop',
    situationClass: 'BTN Preflop Open Decisions',
    occurrenceCount: 12,
  });
  assert.equal(drill.street, 'Preflop');
  assert.equal(drill.position, 'BTN');
  assert.equal(drill.game, 'cash-rfi');

  const live = leakToDrill({
    sourceSystem: 'live_play',
    recommendedDrill: 'cash-rfi',
    leakCategory: 'preflop',
  });
  assert.equal(live.game, undefined);

  const spins = leakToDrill({
    sourceSystem: 'solver_engine',
    recommendedDrill: 'spins-003',
    leakCategory: 'preflop',
    situationClass: 'BTN Preflop Decisions',
  });
  assert.equal(spins.game, 'spins-003');
});

test('legacy coach laws and statistical leaks use bounded canonical games', () => {
  assert.equal(leakToDrill({
    sourceSystem: 'live', leakCategory: 'LAW_01', leakName: 'Position Is Power',
  }).game, 'cash-006');
  assert.equal(leakToDrill({
    sourceSystem: 'live', leakCategory: 'LAW_03', leakName: 'Defend Your Blind',
  }).game, 'cash-001');
  assert.equal(leakToDrill({
    sourceSystem: 'live', leakCategory: 'LAW_06', leakName: 'Bet For Value',
  }).game, 'cash-004');
  assert.equal(leakToDrill({
    sourceSystem: 'live_play', leakType: 'three_bet_too_loose', leakCategory: 'preflop',
  }).game, 'cash-001');
});

test('training handoff launches only a real canonical library game', () => {
  const catalog = ['cash-001', 'cash-002', 'mtt-001'];
  assert.equal(leakToTrainingGame({
    sourceSystem: 'solver_engine',
    recommendedDrill: 'cash_002',
    leakCategory: 'flop',
  }, catalog), 'cash-002');
  assert.equal(leakToTrainingGame({
    sourceSystem: 'live_play',
    recommendedDrill: 'cash-002',
    leakCategory: 'flop',
  }, catalog), null);
  assert.equal(leakToTrainingGame({
    sourceSystem: 'solver_engine',
    recommendedDrill: 'retired-game',
    leakCategory: 'flop',
  }, catalog), null);
});

test('review and drill routes carry idempotency and exact-game contracts', () => {
  const reviewApi = fs.readFileSync(new URL('../pages/api/assistant/leaks/review.js', import.meta.url), 'utf8');
  const drillApi = fs.readFileSync(new URL('../pages/api/sandbox/_routes/custom-drill.js', import.meta.url), 'utf8');
  const drillUi = fs.readFileSync(new URL('../src/components/sandbox/QuickSpotDrill.jsx', import.meta.url), 'utf8');
  const leaksUi = fs.readFileSync(new URL('../pages/hub/personal-assistant/leaks.js', import.meta.url), 'utf8');
  const reviewPresentation = fs.readFileSync(new URL('../src/lib/personal-assistant/reviewQueuePresentation.mjs', import.meta.url), 'utf8');

  assert.match(reviewApi, /commit_leak_review_state/);
  assert.match(reviewApi, /reason: 'review_id_required'/);
  assert.match(reviewApi, /outcome\.reviewId is invalid/);
  assert.match(reviewApi, /idempotent: true/);
  assert.match(drillApi, /const gameIds = gameIdAliases\(gameId\)/);
  assert.match(drillApi, /query = query\.in\('game_id', gameIds\)/);
  assert.match(drillApi, /matchesExactSolverScope/);
  assert.match(drillApi, /enforceSolverClaimHonesty/);
  assert.match(drillApi, /const practiceOnly = Boolean/);
  assert.match(drillApi, /solver_provenance_pending/);
  assert.match(drillUi, /practiceDisclosure/);
  assert.match(drillUi, /outcome = \{ correct, total, reviewId \}/);
  assert.match(drillUi, /pa-leak-review-v2/);
  assert.match(leaksUi, /reviewQueuePresentation\.mjs/);
  assert.match(reviewPresentation, /pa-leak-review-v2/);
  assert.match(drillUi, /LEGACY_REVIEW_STORE_KEYS\.forEach\(key => safeStorage\.remove\(key\)\)/);
});

test('unified leak-to-training UI consumes launch links and waits for the review receipt', () => {
  const trainingUi = fs.readFileSync(new URL('../pages/hub/training.js', import.meta.url), 'utf8');
  const leaksUi = fs.readFileSync(new URL('../pages/hub/personal-assistant/leaks.js', import.meta.url), 'utf8');
  const drillUi = fs.readFileSync(new URL('../src/components/sandbox/QuickSpotDrill.jsx', import.meta.url), 'utf8');

  assert.match(trainingUi, /router\.query\.autoLaunch/);
  assert.match(trainingUi, /startDrill\(game\)/);
  assert.match(leaksUi, /leakToTrainingGame\(target, TRAINING_GAME_IDS\)/);
  assert.match(leaksUi, /q\.autoLaunch = exactGame/);
  assert.match(leaksUi, /onReviewComplete=\{handleReviewComplete\}/);
  assert.match(drillUi, /onReviewComplete\?\.\(completion\)/);
  assert.match(drillUi, /review\?\.status === 'saving'/);
  assert.match(drillUi, /setTimeout\(\(\) => reviewController\.abort\(\), 15000\)/);
  assert.match(drillUi, /hideClose=\{reviewSaving\}/);
  assert.match(leaksUi, /Fresh Club Arena Evidence Must Still Confirm The Leak Is Fixed/);
});

test('phase-three migration atomically replaces audits and commits review operations', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260830090000_personal_assistant_phase_three_atomic_state.sql', import.meta.url), 'utf8');
  assert.match(migration, /replace_hand_audit_decisions/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /leak_review_operations_unique/);
  assert.match(migration, /commit_leak_review_state/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /p_expected_updated_at/);
});

test('manual audit failure response cannot claim persistence after reconciliation failure', () => {
  const route = fs.readFileSync(new URL('../pages/api/training/audit-hand-history.js', import.meta.url), 'utf8');
  const spreadAt = route.indexOf('...result');
  const explicitAt = route.indexOf('persisted: false', spreadAt);
  assert.ok(spreadAt >= 0 && explicitAt > spreadAt);
  assert.match(route, /decisionEvidencePersisted/);
});
