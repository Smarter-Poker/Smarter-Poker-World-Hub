import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/lib/personal-assistant/leakRecord.js', 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  confidenceScore,
  confidenceTier,
  normalizeUserLeakRow,
  toUserLeakPersistenceRow,
  leakStatusPersistenceFields,
} = await import(moduleUrl);

test('detector confidence tiers are converted to the live numeric schema', () => {
  assert.equal(confidenceScore('low'), 0.3);
  assert.equal(confidenceScore('medium'), 0.65);
  assert.equal(confidenceScore('high'), 0.9);
  assert.equal(confidenceTier(0.3), 'low');
  assert.equal(confidenceTier(0.65), 'medium');
  assert.equal(confidenceTier(0.9), 'high');
});

test('deterministic leaks include every required legacy persistence field', () => {
  const row = toUserLeakPersistenceRow({
    leak_type: 'solver_cash_rfi_preflop_btn_rfi',
    leak_category: 'preflop',
    situation_class: 'BTN Preflop RFI Decisions',
    status: 'persistent',
    confidence: 'medium',
    occurrence_count: 6,
    current_frequency: 40,
  }, {
    userId: '1f114e4c-6c27-4db3-bcad-8f88c85b463d',
    totalSamples: 15,
    mistakeCount: 6,
  });

  assert.equal(row.leak_name, 'BTN Preflop RFI Decisions');
  assert.equal(row.confidence, 0.65);
  assert.equal(row.total_samples, 15);
  assert.equal(row.mistake_count, 6);
  assert.equal(row.error_rate, 0.4);
  assert.equal(row.is_active, true);
  assert.equal('_sample_count' in row, false);
});

test('leak lifecycle transitions keep modern and legacy activity fields synchronized', () => {
  const at = '2026-08-29T12:00:00.000Z';
  assert.deepEqual(leakStatusPersistenceFields('resolved', { now: at }), {
    status: 'resolved', resolved_at: at, is_active: false,
  });
  assert.deepEqual(leakStatusPersistenceFields('persistent', { resolvedAt: at, now: at }), {
    status: 'persistent', resolved_at: null, is_active: true,
  });

  const reemerged = toUserLeakPersistenceRow({
    leak_type: 'river_overfold', status: 'emerging', resolved_at: at,
    occurrence_count: 4, confidence: 'medium',
  }, { userId: '1f114e4c-6c27-4db3-bcad-8f88c85b463d' });
  assert.equal(reemerged.resolved_at, null);
  assert.equal(reemerged.is_active, true);
});

test('legacy training rows no longer render as unknown leaks', () => {
  const row = normalizeUserLeakRow({
    id: 'legacy-id',
    leak_type: null,
    leak_name: 'Defend Your Blind',
    leak_category: 'law-12',
    confidence: 0.3,
    mistake_count: 4,
    detected_at: '2026-08-01T00:00:00.000Z',
    is_active: true,
  });

  assert.equal(row.leak_type, 'defend_your_blind');
  assert.equal(row.situation_class, 'Defend Your Blind');
  assert.equal(row.confidence, 'low');
  assert.equal(row.occurrence_count, 4);
  assert.equal(row.status, 'emerging');
  assert.equal(row.source_system, 'training_accountant');
});

test('legacy defaults cannot mislabel training-accountant rows as live play', () => {
  const row = normalizeUserLeakRow({
    leak_type: null,
    leak_name: 'Bet For Value',
    source_system: 'live',
    confidence: 0.65,
  });
  assert.equal(row.source_system, 'training_accountant');
  assert.equal(row.confidence, 'medium');
});

test('detect route fails closed if its atomic leak upsert fails', () => {
  const detect = fs.readFileSync('pages/api/assistant/leaks/detect.js', 'utf8');
  assert.match(detect, /toUserLeakPersistenceRow/);
  assert.match(detect, /reason: 'write_failed'/);
  assert.match(detect, /return res\.status\(503\)\.json/);
  assert.doesNotMatch(detect, /let persisted = true/);
});

test('secondary sync reads cannot erase real assistant totals with fallback zeros', () => {
  const detect = fs.readFileSync('pages/api/assistant/leaks/detect.js', 'utf8');
  assert.match(detect, /Refusing to overwrite assistant stats after leak-count read failed/);
  assert.match(detect, /Refusing to overwrite assistant stats after current-total read failed/);
  assert.match(detect, /statsPersisted: statsSynced/);
  assert.match(detect, /handExamples: handExamplesSync/);
});

test('status endpoints fail closed and update both leak stores', () => {
  const route = fs.readFileSync('pages/api/assistant/leaks/index.js', 'utf8');
  assert.match(route, /PATCH_STATUSES/);
  assert.match(route, /leakStatusPersistenceFields/);
  assert.match(route, /from\('user_training_leaks'\)[\s\S]*?fixed_at/);
  assert.match(route, /Refusing to overwrite assistant leak counts after recount failed/);
  assert.match(route, /statsSynced/);

  const detect = fs.readFileSync('pages/api/assistant/leaks/detect.js', 'utf8');
  assert.match(detect, /is_active: false/);
  assert.match(detect, /allSolverEvidenceAvailable/);
  assert.match(detect, /clubArenaSync\.complete === false/);
});
