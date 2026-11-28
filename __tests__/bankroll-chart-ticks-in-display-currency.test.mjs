// The bar and stacked charts' money axis is round in the currency the player
// reads (2026-11-28). It used to be a US-dollar ruler relabelled in euros, so
// Display EUR showed EUR 4.6K, 9.1K, 14K, 18K, and it was labelled by
// analyticsDisplay money() instead of currencyUtils.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartTicks, moneyChartTicks } from '../src/lib/bankroll/analyticsView.mjs';
import { formatCurrencyCompact } from '../src/lib/bankroll/currencyUtils.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const labels = (ticks, eur) => ticks.map((cents) => formatCurrencyCompact(cents / 100, eur));

test('in dollars the money ruler is the plain chartTicks ruler', () => {
  assert.deepEqual(moneyChartTicks(-1150, 2_000_000), chartTicks(-1150, 2_000_000));
  assert.deepEqual(moneyChartTicks(0, 0), [0, 1]);
});

test('in euros every tick lands on a round euro amount', () => {
  // $20,000 of results: the old ruler was $0/5K/10K/15K/20K relabelled.
  const old = labels(chartTicks(0, 2_000_000), true);
  assert.deepEqual(old, ['€0', '€4.6K', '€9.1K', '€14K', '€18K']);
  assert.deepEqual(labels(moneyChartTicks(0, 2_000_000, true), true), ['€0', '€5K', '€10K', '€15K', '€20K']);
  // Losses too, and the ruler still covers both extremes.
  const ticks = moneyChartTicks(-480_000, 1_500_000, true);
  assert.deepEqual(labels(ticks, true), ['-€5K', '€0', '€5K', '€10K', '€15K']);
  assert.ok(ticks[0] <= -480_000 && ticks[ticks.length - 1] >= 1_500_000, 'no bar is clipped');
});

test('small euro ranges stay round too', () => {
  assert.deepEqual(labels(moneyChartTicks(0, 30_000, true), true), ['€0', '€100', '€200', '€300']);
});

test('both money plots share the ruler and label through currencyUtils', () => {
  const bars = read('src/components/bankroll/BankrollPlot.jsx');
  assert.match(bars, /isDistribution \? chartTicks\(minimum, maximum\) : moneyChartTicks\(minimum, maximum, displayEUR\)/);
  assert.match(bars, /formatCurrencyCompact\(Number\(value\) \/ 100, displayEUR\)/);
  assert.doesNotMatch(bars, /yFormat = [^\n]*money\(/, 'the money axis is not labelled by analyticsDisplay money()');
  const line = read('src/components/bankroll/BankrollLinePlot.jsx');
  assert.match(line, /moneyChartTicks\(minimum, maximum, displayEUR\)/);
  assert.doesNotMatch(line, /function yTicks/, 'one ruler, not a copy per chart');
});
