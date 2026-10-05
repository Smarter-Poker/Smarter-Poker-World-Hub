import assert from 'node:assert/strict';
import test from 'node:test';
import { abuseState, closeCalendar, conservationModel, jobState, snapshotModel } from '../src/components/horses/economyAdmin.js';
import { cadenceState, evidenceAgeState, findingStability } from '../src/components/horses/economyModel.js';

test('conservation is computed from operands and preserves the measured residue', () => {
  assert.deepEqual(conservationModel({ register_net_at_meter: '1', meter_total: '1', difference: '5803.84', unexplained_since_baseline: '1580.89' }), { state: 'conservation.residue', balanced: false, residue: '4222.95' });
  assert.equal(conservationModel(null).state, 'conservation.unknown');
});
test('stale and unknown supply snapshots stay distinct', () => {
  assert.equal(snapshotModel(null).state, 'supply.unknown');
  assert.equal(snapshotModel({ taken_at: '2026-01-01T00:00:00Z' }, 30, Date.parse('2026-01-01T01:00:00Z')).state, 'supply.stale');
});

test('abuse empty without liveness is never a cleanliness claim', () => {
  assert.equal(abuseState([], null), 'abuse.detector_never_fired');
  assert.equal(abuseState([], '2026-10-05T00:00:00Z'), 'abuse.nothing_detected');
});

test('manifest coverage includes missing days rather than narrowing the window', () => {
  const calendar = closeCalendar([{ day: '2026-01-01' }, { day: '2026-01-03' }], '2026-01-01', '2026-01-03');
  assert.equal(calendar.length, 3);
  assert.equal(calendar.filter((row) => row.state === 'close.day_missing').length, 1);
  assert.equal(calendar[0].state, 'close.manifest_only');
});

test('job invocation, failure and no evidence are distinct', () => {
  assert.equal(jobState(null), 'job.no_evidence');
  assert.equal(jobState({ status: 'success', result: {} }), 'job.invocation_only');
  assert.equal(jobState({ status: 'failed', result: {} }), 'job.failed');
});

test('rake findings are stable only when both in-force terms were recorded', () => {
  assert.equal(findingStability({ seat_count_in_force: null, max_rake_cap_in_force: null }), 'rakelaw.verdict_unstable');
  assert.equal(findingStability({ seat_count_in_force: 9, max_rake_cap_in_force: null }), 'rakelaw.verdict_unstable');
  assert.equal(findingStability({ seat_count_in_force: 9, max_rake_cap_in_force: '10.0000' }), 'rakelaw.derived_from_record');
});

test('stale financial evidence and missed cadences never become recorded', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  assert.equal(evidenceAgeState('2026-10-01T12:00:00Z', { staleAfterMs: 48 * 3600000, now }), 'evidence.stale');
  assert.equal(evidenceAgeState(null, { staleAfterMs: 48 * 3600000, now }), 'evidence.never_recorded');
  assert.equal(cadenceState('2026-09-20T12:00:00Z', 7 * 86400000, 86400000, now), 'job.run_missed');
  assert.equal(cadenceState('2026-10-01T12:00:00Z', 7 * 86400000, 86400000, now), 'job.evidence_recorded');
});
