import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SOURCE = readFileSync('src/games/SpotTrainerGame.jsx', 'utf8');
const MEMORY_PAGE = readFileSync('pages/hub/memory-games.js', 'utf8');

test('the legacy Spot Trainer is only a launcher to the canonical verified route', () => {
  assert.match(
    SOURCE,
    /export const VERIFIED_SPOT_TRAINER_ROUTE = '\/hub\/training\/spot-trainer\?source=preflop-charts'/,
  );
  assert.match(SOURCE, /<Link[\s\S]*?href=\{VERIFIED_SPOT_TRAINER_ROUTE\}/);
  assert.match(SOURCE, /Open Verified Spot Trainer/);
  assert.match(SOURCE, /Server-Delivered Questions/);
  assert.match(SOURCE, /Attempt-Bound Results/);
});

test('the launcher preserves the embedded exit contract and remains reachable', () => {
  assert.match(SOURCE, /function SpotTrainerGame\(\{ onExit \}\)/);
  assert.match(SOURCE, /<button[\s\S]*?onClick=\{onExit\}[\s\S]*?>/);
  assert.match(SOURCE, /Back To Preflop Charts/);
  assert.match(MEMORY_PAGE, /mode === 'spot-trainer'[\s\S]*?<SpotTrainerGame[\s\S]*?onExit=\{\(\) => setMode\('menu'\)\}/);
});

test('the retired local strategy, grading, economy, and persistence bank is absent', () => {
  assert.doesNotMatch(SOURCE, /SPOT_SCENARIOS|heroHand|currentStreet|selectedOption/);
  assert.doesNotMatch(SOURCE, /\b(?:correct|ev|explanation|options|board)\s*:/i);
  assert.doesNotMatch(SOURCE, /SoundEngine|shareResult|savePersonalBest|recordSessionWeakness|busEmit/);
  assert.doesNotMatch(SOURCE, /purchasePowerUp|getGamePowerUps|PowerUpBar|DiamondEngine|onScoreUpdate/);
  assert.doesNotMatch(SOURCE, /accuracy|diamonds|reward|score|grade|streak/i);
  assert.doesNotMatch(SOURCE, /fetch\(|authedFetch|axios|supabase|\.rpc\(|\.insert\(|\.update\(|\.upsert\(/);
});

test('the replacement retains dimensional, responsive, and keyboard-visible presentation', () => {
  assert.match(SOURCE, /linear-gradient/);
  assert.match(SOURCE, /box-shadow:/);
  assert.match(SOURCE, /min-height: 52px/);
  assert.match(SOURCE, /:focus-visible/);
  assert.match(SOURCE, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(SOURCE, /UniversalHeader|GlobalHeader/);
});
