/**
 * GSC & Organic Growth Series 5 — Phase 7 Tests
 * Verifies:
 *   1. Wordle-Style Shareable Spot Summary (buildOddsSpotSummary + Copy Spot
 *      Summary button) in pages/hub/poker-tools.js and pages/tools/preflop-ranges/index.js
 *   2. Conversion Micro-CTAs linking anonymous calculator users to /hub/training
 *      ("Practice Spots Like This In The Free GTO Trainer") and /hub/bankroll-manager
 *      ("Track Sessions In Bankroll Manager")
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('pages/hub/poker-tools.js exports buildOddsSpotSummary and wires Copy Spot Summary + Conversion Micro-CTAs', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/hub/poker-tools.js'), 'utf8');
  assert.match(src, /export\s+function\s+buildOddsSpotSummary\s*\(/);
  assert.match(src, /Copy Spot Summary/);
  assert.match(src, /Practice Spots Like This In The Free GTO Trainer/);
  assert.match(src, /Track Sessions In Bankroll Manager/);
  assert.match(src, /href="\/hub\/training"/);
  assert.match(src, /href="\/hub\/bankroll-manager"/);
});

test('pages/tools/preflop-ranges/index.js wires Copy Spot Summary button and Conversion Micro-CTA links', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/tools/preflop-ranges/index.js'), 'utf8');
  assert.match(src, /copyRangeSpotSummary/);
  assert.match(src, /Copy Spot Summary/);
  assert.match(src, /Practice Spots Like This In The Free GTO Trainer/);
  assert.match(src, /Track Sessions In Bankroll Manager/);
  assert.match(src, /href="\/hub\/training"/);
  assert.match(src, /href="\/hub\/bankroll-manager"/);
  assert.ok(!src.includes('\u2014'), 'preflop-ranges/index.js must not contain literal em dashes');
});
