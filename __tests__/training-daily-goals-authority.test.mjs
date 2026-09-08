import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('pages/hub/training/daily-goals.js', 'utf8');
const api = fs.readFileSync('pages/api/training/daily-bonus.js', 'utf8');

test('Daily Goals never authors a streak or currency receipt in local storage', () => {
  assert.doesNotMatch(page, /daily-goals-streak|setStreakDays|\+25 Diamonds Earned/);
  assert.match(page, /const streakDays = Number\(dailyBonus\?\.streakDays\) \|\| 0/);
  assert.match(page, /All Goals Complete For Today/);
  assert.match(page, /No Daily-Goal Currency Is Promised Until Settlement Is Bound To A Verified Completion/);
});

test('Daily Goals uses the Chicago product day instead of a UTC date prefix', () => {
  assert.match(page, /import \{ getTodayCST \}/);
  assert.match(page, /getTodayCST\(createdAt\) === today/);
  assert.doesNotMatch(page, /created_at\.startsWith\(today\)/);
});

test('Daily Bonus reports only persisted settlements and fails database reads closed', () => {
  assert.match(api, /Cache-Control', 'private, no-store, max-age=0'/);
  assert.match(api, /if \(streakError\) throw streakError/);
  assert.match(api, /if \(claimedError\) throw claimedError/);
  assert.match(api, /settlementStatus: 'verified_completion_required'/);
  assert.doesNotMatch(api, /BASE_DAILY_BONUS|STREAK_BONUSES|totalBonus/);
});
