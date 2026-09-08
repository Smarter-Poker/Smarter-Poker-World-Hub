import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../pages/hub/training/streaks.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../pages/api/training/streak.js', import.meta.url), 'utf8');

test('streak calendar is delivered by the sealed server authority', () => {
  assert.match(api, /from\('training_level_history'\)/);
  assert.match(api, /\.not\('attempt_id', 'is', null\)/);
  assert.match(api, /\.eq\('practice_only', false\)/);
  assert.match(api, /trainingDays/);
  assert.doesNotMatch(page, /from\('training_sessions'\)/);
  assert.doesNotMatch(page, /src\/lib\/supabase/);
});

test('partial milestone settlement and claim failures are unmistakable', () => {
  for (const field of [
    'settlementStatus', 'diamondsAwardedTotal', 'entitlementDiamonds',
    'diamondsRemaining',
  ]) {
    assert.match(page, new RegExp(field));
  }
  assert.match(page, /Retry Next Month/);
  assert.match(page, /Historical Credit Is Pending Verification/);
  assert.match(page, /setClaimError/);
  assert.match(page, /<ErrorBanner[\s\S]*?message=\{claimError\}/);
  assert.match(page, /partialSettlement \|\| pendingVerification/);
  assert.match(page, /disabled/);
});

test('Training streaks never fabricate the separate server-owned Diamond multiplier', () => {
  assert.doesNotMatch(page, /Diamond Multiplier/);
  assert.doesNotMatch(page, /currentStreak\s*>=\s*30\s*\?\s*['"]5x/);
});
