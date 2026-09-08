import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/games/MixedStrategyGame.js', import.meta.url), 'utf8');

test('Preflop Charts Mixed Strategy transfers exact grading to the verified Arena', () => {
  assert.match(source, /\/hub\/training\/mixed-strategy-lab\?source=preflop-charts/);
  assert.match(source, /server-delivered questions, grading, feedback, and progress/i);
  assert.doesNotMatch(source, /MIXED_SCENARIOS|correctAnswer|frequencies\[|Solver Answer|Math\.random/);
  assert.doesNotMatch(source, /DiamondEngine|purchasePowerUp|recordSessionWeakness|savePersonalBest/);
});
