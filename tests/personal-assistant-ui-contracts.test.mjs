import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  materializeCanonicalHeroHand,
  resolveDailyHeroHand,
} from '../src/lib/personal-assistant/dailyHandContract.mjs';
import {
  isRangeGridNavigationKey,
  nextRangeGridIndex,
} from '../src/lib/personal-assistant/rangeGridNavigation.mjs';

test('Daily Hand resolves canonical scenario data before stale cached exact cards', () => {
  assert.equal(resolveDailyHeroHand({
    hero_hand: 'T9s',
    heroCards: ['Ah', 'Kd'],
    scenario: { heroHand: 'T9s' },
  }), 'Ts9s');
  assert.equal(resolveDailyHeroHand({
    hero_hand: 'J3o',
    heroCards: ['Ac', 'Ad'],
    scenario: { heroCards: ['Jh', '3d'], heroHand: 'J3o' },
  }), 'Jh3d');
  assert.equal(resolveDailyHeroHand({ heroCards: ['As', 'Kh'] }), 'AsKh');
});

test('canonical range notation materializes to a legal deterministic combo', () => {
  assert.equal(materializeCanonicalHeroHand('AA'), 'AsAh');
  assert.equal(materializeCanonicalHeroHand('AKs'), 'AsKs');
  assert.equal(materializeCanonicalHeroHand('AKo'), 'AsKh');
  assert.equal(materializeCanonicalHeroHand('Ts 2h'), 'Ts2h');
  assert.equal(materializeCanonicalHeroHand('AsAs'), null);
  assert.equal(materializeCanonicalHeroHand('not-a-hand'), null);
});

test('range grid navigation follows a bounded 13-column WAI-ARIA pattern', () => {
  assert.equal(nextRangeGridIndex(0, 'ArrowLeft'), 0);
  assert.equal(nextRangeGridIndex(0, 'ArrowUp'), 0);
  assert.equal(nextRangeGridIndex(0, 'ArrowRight'), 1);
  assert.equal(nextRangeGridIndex(0, 'ArrowDown'), 13);
  assert.equal(nextRangeGridIndex(15, 'Home'), 13);
  assert.equal(nextRangeGridIndex(15, 'End'), 25);
  assert.equal(nextRangeGridIndex(13, 'ArrowLeft'), 13);
  assert.equal(nextRangeGridIndex(12, 'ArrowRight'), 12);
  assert.equal(nextRangeGridIndex(25, 'ArrowRight'), 25);
  assert.equal(nextRangeGridIndex(168, 'ArrowRight'), 168);
  assert.equal(nextRangeGridIndex(168, 'ArrowDown'), 168);
  assert.equal(isRangeGridNavigationKey('ArrowDown'), true);
  assert.equal(isRangeGridNavigationKey('Enter'), false);
});

test('all Personal Assistant 13x13 grids use roving focus and mobile touch sizing', async () => {
  const [sandbox, rangeHeat, kit] = await Promise.all([
    readFile('src/components/sandbox/SandboxComponents.jsx', 'utf8'),
    readFile('src/components/sandbox/RangeHeatGrid.jsx', 'utf8'),
    readFile('src/components/sandbox/paKit.jsx', 'utf8'),
  ]);
  assert.match(sandbox, /role="grid" aria-label="Solver hand range"/);
  assert.match(sandbox, /role="grid" aria-label=\{`\$\{position\} preflop range`\}/);
  assert.match(rangeHeat, /role="grid" aria-label=\{`\$\{villainLabel\} range versus board`\}/);
  assert.match(sandbox, /tabIndex=\{isActive \? 0 : -1\}/);
  assert.match(sandbox, /tabIndex=\{activeIndex === i \? 0 : -1\}/);
  assert.match(rangeHeat, /tabIndex=\{activeIndex === index \? 0 : -1\}/);
  assert.match(kit, /width: 586px !important; min-width: 586px !important/);
  assert.match(kit, /min-width: 44px !important; min-height: 44px !important/);
});
