import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accuracyToFraction,
  accuracyToPercent,
  getUnlockedLevel,
  gradeUserGrid,
  normalizeMemoryDashboard,
  normalizeRangeAction,
} from '../src/lib/preflopRangeLab.js';

test('range action normalization preserves the six-action vocabulary', () => {
  assert.equal(normalizeRangeAction('raise85'), 'raise');
  assert.equal(normalizeRangeAction('3bet'), 'raise');
  assert.equal(normalizeRangeAction('raise-small50'), 'raise_small');
  assert.equal(normalizeRangeAction('jam100'), 'all_in');
});

test('exact ranges score 100 and wrong or missing actions reduce the score', () => {
  const solution = { AA: 'raise', KK: 'raise', AKs: 'call' };
  assert.equal(gradeUserGrid({ AA: 'raise', KK: 'raise', AKs: 'call' }, solution).score, 100);
  assert.equal(gradeUserGrid({ AA: 'raise', KK: 'call' }, solution).score, 33);
});

test('extra hands are included in the score denominator', () => {
  const result = gradeUserGrid(
    { AA: 'raise', KK: 'raise', AKs: 'raise', Q2o: 'raise' },
    { AA: 'raise', KK: 'raise' },
  );
  assert.deepEqual(result.extraHands.sort(), ['AKs', 'Q2o']);
  assert.equal(result.score, 50);
  assert.equal(result.mistakes, 2);
});

test('accuracy helpers read legacy percent rows and new fractional rows', () => {
  assert.equal(accuracyToFraction(85), 0.85);
  assert.equal(accuracyToFraction(0.85), 0.85);
  assert.equal(accuracyToPercent(0.85, 85), 85);
  assert.equal(accuracyToPercent(85, 85), 85);
  assert.equal(accuracyToPercent(1, 1), 1);
});

test('dashboard normalization repairs legacy multiplied percentages and mastery', () => {
  const normalized = normalizeMemoryDashboard({
    rolling_accuracy_pct: 250,
    mastered_levels_count: 2,
    per_level_mastery: [
      { level: 1, best_accuracy: 200, mastered: true },
      { level: 2, best_accuracy: 9200, mastered: true },
    ],
  });
  assert.equal(normalized.rolling_accuracy_pct, 2.5);
  assert.equal(normalized.current_grade, 'F');
  assert.equal(normalized.next_grade, 'D-');
  assert.equal(normalized.per_level_mastery[0].mastered, false);
  assert.equal(normalized.per_level_mastery[1].best_accuracy, 92);
  assert.equal(normalized.mastered_levels_count, 1);
});

test('dashboard grade is derived from normalized accuracy rather than stale RPC output', () => {
  const normalized = normalizeMemoryDashboard({
    rolling_accuracy_pct: 9200,
    current_grade: 'A+',
    next_grade: null,
  });
  assert.equal(normalized.rolling_accuracy_pct, 92);
  assert.equal(normalized.current_grade, 'A-');
  assert.equal(normalized.next_grade, 'A');
});

test('unlock progression advances only through contiguous mastered levels', () => {
  assert.equal(getUnlockedLevel([]), 1);
  assert.equal(getUnlockedLevel([{ level: 1, mastered: true }]), 2);
  assert.equal(getUnlockedLevel([{ level: 1, mastered: true }, { level: 3, mastered: true }]), 2);
  assert.equal(getUnlockedLevel([{ level: 1, mastered: true }, { level: 2, mastered: true }]), 3);
});
