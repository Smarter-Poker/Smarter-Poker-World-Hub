import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertPnmMobileBudget } from '../scripts/ci/lib/pnmMobileBudget.mjs';

const budget = JSON.parse(readFileSync('scripts/ci/mobile-budget.json', 'utf8')).routes['/hub/poker-near-me'];
const measured = { scriptCount: 8, unmeasuredScripts: 0, jsBytes: 400 * 1024, lcpMs: 1800, overflow: 0 };
test('PNM keeps the maintained finite mobile thresholds', () => {
  assert.deepEqual(budget, { jsKb: 850, lcpMs: 2500, converted: true });
  assertPnmMobileBudget(measured, budget);
});
test('missing and partial observations cannot masquerade as a mobile budget pass', () => {
  for (const partial of [{ scriptCount: 0 }, { unmeasuredScripts: 1 }, { jsBytes: 0 }, { jsBytes: NaN }, { lcpMs: 0 }, { lcpMs: NaN }, { overflow: undefined }]) {
    assert.throws(() => assertPnmMobileBudget({ ...measured, ...partial }, budget));
  }
});
test('real threshold violations fail without widening the baseline', () => {
  for (const violation of [{ jsBytes: 851 * 1024 }, { lcpMs: 2501 }, { overflow: 1 }]) {
    assert.throws(() => assertPnmMobileBudget({ ...measured, ...violation }, budget));
  }
});
test('the actual maintained browser invokes strict PNM evidence checks', () => {
  const source = readFileSync('e2e/mobile-budget.spec.ts', 'utf8');
  assert.match(source, /route === '\/hub\/poker-near-me'/);
  assert.match(source, /assertPnmMobileBudget\(/);
  assert.match(source, /await Promise\.all\(scriptMeasurements\)/);
  assert.match(source, /unmeasuredScripts\s*\+=\s*1/);
  assert.match(source, /route === '\/hub\/poker-near-me' \? pnmMeasuredTest : test/, 'only PNM must use the measured browser fixture');
  assert.match(source, /await playwright\.chromium\.launch\(\)/, 'the PNM fixture uses a browser with actual LCP');
  assert.match(source, /viewport: \{ width: 375, height: 812 \}, serviceWorkers: 'block'/);
  assert.match(source, /await res\.finished\(\)/, 'measure complete responses, not arrival headers');
  assert.match(source, /Network\.setCacheDisabled/, 'cold transfer evidence excludes browser cache');
  const qualification = readFileSync('scripts/ci/qualify-pnm-launch-phase6.mjs', 'utf8');
  assert.match(qualification, /await response\.finished\(\)/);
  assert.match(qualification, /Network\.setCacheDisabled/);
});
