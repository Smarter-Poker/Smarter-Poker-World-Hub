import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/lib/training/solverDecisionEvidence.js', 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  classifyFrequencyDecision,
  gradeSolverDecision,
  isVerifiedSolverQuestion,
  aggregateSolverLeaks,
} = await import(moduleUrl);

const question = (overrides = {}) => ({
  source: 'DETERMINISTIC_SOLVER',
  dataQuality: 'SOLVER_EXACT',
  correctAnswer: 'raise',
  gtoFrequencies: { raise: 70, call: 25, fold: 5, jam: 0 },
  ...overrides,
});

test('one shared frequency classifier preserves mixed-strategy tiers', () => {
  assert.equal(classifyFrequencyDecision(question().gtoFrequencies, 'raise', 'raise').classification, 'best');
  assert.equal(classifyFrequencyDecision(question().gtoFrequencies, 'call', 'raise').classification, 'best');
  assert.equal(classifyFrequencyDecision(question().gtoFrequencies, 'fold', 'raise').classification, 'correct');
  assert.equal(classifyFrequencyDecision({ raise: 98, fold: 0 }, 'fold', 'raise').classification, 'blunder');
});

test('simulated questions can never become verified leak evidence', () => {
  const simulated = question({ dataQuality: 'SIMULATED' });
  assert.equal(isVerifiedSolverQuestion(simulated), false);
  assert.equal(gradeSolverDecision(simulated, 'jam').solverVerified, false);
});

test('a generic SOLVER_EXACT label cannot certify an untrusted generator', () => {
  const heuristic = question({ source: 'POSTFLOP_ENGINE', dataQuality: 'SOLVER_EXACT' });
  assert.equal(isVerifiedSolverQuestion(heuristic), false);
});

test('frequency-derived action EV is not laundered into measured BB loss', () => {
  const estimated = question({ evData: { actionEVs: { raise: 2.5, jam: -4 } } });
  const result = gradeSolverDecision(estimated, 'jam');
  assert.equal(result.evLoss, null);
  assert.equal(result.evLossMeasured, false);
});

test('explicitly sealed per-action solver EV produces exact loss', () => {
  const exact = question({ evData: { actionEVsMeasured: true, actionEVs: { raise: 2.5, jam: -4 } } });
  const result = gradeSolverDecision(exact, 'jam');
  assert.equal(result.evLoss, 6.5);
  assert.equal(result.evLossMeasured, true);
});

test('leaks require verified opportunities and count actual mistakes', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    solver_verified: index !== 9,
    game_id: 'cash-rfi', street: 'preflop', hero_position: 'BTN', spot_type: 'rfi',
    classification: index < 4 ? 'wrong' : 'best',
    ev_loss: 9, ev_loss_measured: false,
    answered_at: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const leaks = aggregateSolverLeaks(rows);
  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].occurrence_count, 4);
  assert.equal(leaks[0]._sample_count, 9);
  assert.equal(leaks[0].avg_ev_loss_bb, 0);
  assert.match(leaks[0].why_leaking_ev, /no BB loss is invented/i);
});

test('aggregation is deterministic and reruns do not inflate counts', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    solver_verified: true,
    game_id: 'cash-bb-defense', street: 'preflop', hero_position: 'BB', spot_type: 'facing_raise',
    classification: index < 3 ? 'blunder' : 'best',
    answered_at: '2026-08-27T12:00:00.000Z',
  }));
  assert.deepEqual(aggregateSolverLeaks(rows), aggregateSolverLeaks(rows));
  assert.equal(aggregateSolverLeaks(rows)[0].occurrence_count, 3);
});
