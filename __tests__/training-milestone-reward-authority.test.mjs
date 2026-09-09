import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('pages/hub/training/milestones.js', 'utf8');
const sessionsApi = fs.readFileSync('pages/api/training/get-sessions.js', 'utf8');

test('Milestones labels inferred session thresholds as reached, never rewarded', () => {
  assert.match(page, /thresholdReached:\s*percent >= 100/);
  assert.match(page, /Thresholds Reached/);
  assert.match(page, /Threshold Reached/);
  assert.match(page, /Reward Status: Unverified/);
  assert.match(page, /This Progress-Only Page Cannot Confirm Or Issue Diamonds/);
  assert.match(page, /Reward Unverified/);

  assert.doesNotMatch(page, /\bearned\b/i);
  assert.doesNotMatch(page, /\brewarded\b/i);
  assert.doesNotMatch(page, /reward:\s*['"]\+?\d+\s+Diamonds/i);
  assert.doesNotMatch(page, /TIERS\[[^\]]+\]\.reward/);
});

test('Milestones is read-only and has no client Diamond settlement path', () => {
  assert.match(page, /authedFetch\(`\/api\/training\/get-sessions\?limit=500`\)/);
  assert.doesNotMatch(page, /authedFetch\([^\n]*(?:award|claim|reward|diamond)/i);
  assert.doesNotMatch(page, /\.rpc\(|award_diamonds|safeAward|diamondsEarned/);
  assert.doesNotMatch(page, /method:\s*['"]POST['"]|method:\s*['"]PUT['"]|method:\s*['"]PATCH['"]/);
});

test('threshold calculations consume only sealed non-practice session history and fail closed', () => {
  assert.match(sessionsApi, /training_attempts!training_sessions_attempt_fk!inner\([^)]*user_id[^)]*status[^)]*practice_only[^)]*\)/);
  assert.match(sessionsApi, /\.not\('attempt_id', 'is', null\)/);
  assert.match(sessionsApi, /\.eq\('training_attempts\.user_id', user\.id\)/);
  assert.match(sessionsApi, /\.eq\('training_attempts\.status', 'completed'\)/);
  assert.match(sessionsApi, /\.eq\('training_attempts\.practice_only', false\)/);
  assert.match(sessionsApi, /\.eq\('practice_only', false\)/);

  assert.match(page, /!data\.success \|\| !Array\.isArray\(data\.sessions\)/);
  assert.match(page, /setStats\(null\)/);
  assert.match(page, /No Threshold Or Reward[\s\S]*Status Has Been Inferred From Missing Data/);
  assert.doesNotMatch(page, /catch \([^)]*\)[\s\S]{0,240}setStats\(computeStats\(\[\]\)\)/);
});
