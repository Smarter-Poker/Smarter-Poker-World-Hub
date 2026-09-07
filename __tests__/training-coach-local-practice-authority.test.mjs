import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../pages/hub/training/coach-mode.js', import.meta.url), 'utf8');

test('Coach Mode discloses its local reference authority and cannot persist invented mastery', () => {
  assert.match(source, /Private Strategy Chamber \/ Local Practice/);
  assert.match(source, /Local Reference Result Is Not Saved And Does Not Unlock Progress Or Issue Rewards/);
  assert.match(source, /Recorded Progress, Unlocks, And Rewards Exist Only In The Verified Training Arena/);
  assert.doesNotMatch(source, /localStorage|coach-completed/);
  assert.doesNotMatch(source, /Lesson Complete|Chambers Calibrated|% Calibrated/);
});

test('local Coach review stays manual and cannot call Training persistence or economy endpoints', () => {
  assert.match(source, /This Result Will Stay Open Until You Click Next/);
  assert.match(source, /Next Question/);
  assert.doesNotMatch(source, /save-session|record-question|award_diamonds|complete_training_attempt|\.rpc\(/);
});
