import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'pages/hub/training/custom-solve.js'), 'utf8');

test('Custom Solve makes the preflop request an explicit 100BB first-in RFI contract', () => {
  assert.match(PAGE, /const isPreflopRfi = selectedBoardCount < 3/);
  assert.match(
    PAGE,
    /preflop-ranges\?gameType=cash_6max&stackDepth=100&position=\$\{heroPos\}&scenario=rfi/,
  );
  assert.doesNotMatch(
    PAGE,
    /preflop-ranges[^`\n]*villain|preflop-ranges[^`\n]*vsPosition/,
  );
  assert.match(PAGE, /No Opponent Exists In A First-In Decision/);
  assert.match(PAGE, /\$\{heroPos\} First-In RFI/);
  assert.match(PAGE, /Authored First-In Reference/);
});

test('Custom Solve cannot present opponent or unsupported stack controls as active preflop inputs', () => {
  assert.match(PAGE, /data-preflop-opponent="not-applicable"/);
  assert.match(PAGE, /Not Applicable For A First-In RFI Node/);
  assert.match(PAGE, /disabled=\{isPreflopRfi && sd !== 100\}/);
  assert.match(PAGE, /PREFLOP_RFI_POSITIONS = POSITIONS\.filter\(\(position\) => position !== 'BB'\)/);
  assert.match(PAGE, /if \(!PREFLOP_RFI_POSITIONS\.includes\(heroPos\)\) setHeroPos\('BTN'\)/);
  assert.match(PAGE, /if \(stackDepth !== 100\) setStackDepth\(100\)/);
});

test('Custom Solve labels preflop output honestly and weights aggregate frequencies by combos', () => {
  assert.match(PAGE, /authorityLabel: 'Authored Reference'/);
  assert.match(PAGE, /data\.range\.provenance\?\.disclosure/);
  assert.match(PAGE, /preflopHandCombos\(hand\)/);
  assert.match(PAGE, /comboWeightedTotals\.Fold/);
  assert.doesNotMatch(PAGE, /Position, Opponent, Effective Stack, And Concrete Board Cards Are Applied To Every Request/);
});
