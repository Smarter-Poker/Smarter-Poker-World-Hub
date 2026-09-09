import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { shuffleBalancedQuestionOrder } from '../src/lib/training/questionOrderContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function seededDraw(seed) {
  let state = seed >>> 0;
  return (upperExclusive) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % upperExclusive;
  };
}

test('balanced answer classes have no fixed ordinal after the private final shuffle', () => {
  const balanced = Array.from({ length: 20 }, (_, index) => ({
    id: `q-${index}`,
    answerClass: index % 2 === 0 ? 'passive' : 'aggressive',
  }));
  const classesByOrdinal = balanced.map(() => new Set());

  for (let seed = 1; seed <= 64; seed += 1) {
    const ordered = shuffleBalancedQuestionOrder(balanced, seededDraw(seed));
    ordered.forEach((question, ordinal) => classesByOrdinal[ordinal].add(question.answerClass));
  }

  assert.ok(classesByOrdinal.every((classes) => classes.size === 2));
  assert.deepEqual(balanced.map(({ id }) => id), Array.from({ length: 20 }, (_, index) => `q-${index}`));
});

test('production ordering uses node crypto and runs after answer-class balancing', () => {
  const helper = fs.readFileSync(
    path.join(ROOT, 'src/lib/training/questionOrderContract.mjs'),
    'utf8',
  );
  const batchApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/batch-preload.js'),
    'utf8',
  );

  assert.match(helper, /import \{ randomInt \} from 'node:crypto'/);
  assert.match(helper, /drawIndex = randomInt/);
  const balanceIndex = batchApi.indexOf('const aggressive = shuffled.filter');
  const finalShuffleIndex = batchApi.indexOf('batch = shuffleBalancedQuestionOrder(batch)');
  const deliveryIndex = batchApi.indexOf('prepareTrainingAttemptDelivery({');
  assert.ok(balanceIndex >= 0 && finalShuffleIndex > balanceIndex && deliveryIndex > finalShuffleIndex);
});

test('invalid draw indices fail closed instead of biasing or corrupting the manifest', () => {
  assert.throws(
    () => shuffleBalancedQuestionOrder([1, 2, 3], () => 99),
    /inside the remaining range/,
  );
});
