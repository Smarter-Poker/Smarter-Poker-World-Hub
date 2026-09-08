import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const achievementApi = fs.readFileSync('pages/api/training/achievements.js', 'utf8');
const achievementPage = fs.readFileSync('pages/hub/training/achievements.js', 'utf8');
const challengeApi = fs.readFileSync('pages/api/training/challenges.js', 'utf8');
const challengePage = fs.readFileSync('pages/hub/training/challenges.js', 'utf8');

test('legacy achievement rows are labeled historical and cannot unlock rewards', () => {
  assert.match(achievementApi, /availability: 'paused_pending_verified_settlement'/);
  assert.match(achievementApi, /rewardAvailable: false/);
  assert.match(achievementApi, /unlocked: false/);
  assert.match(achievementApi, /historicallyUnlocked: historicalMap\.has/);
  assert.doesNotMatch(achievementPage, /Diamonds Earned|ach\.diamond_reward/);
  assert.match(achievementPage, /Historical Snapshot/);
  assert.match(achievementPage, /New Achievement Awards/);
});

test('legacy challenge rows are historical only and the page makes no earning claim', () => {
  assert.match(challengeApi, /rewardAvailable: false/);
  assert.match(challengeApi, /progress: 0/);
  assert.match(challengeApi, /completed: false/);
  assert.match(challengeApi, /claimed: false/);
  assert.match(challengeApi, /historicalProgress:/);
  assert.doesNotMatch(challengePage, /Earn Diamond|diamond_reward|Verified Claim Pending/);
  assert.match(challengePage, /Tracking Paused/);
});

test('both retained APIs fail definition or history query errors closed', () => {
  for (const source of [achievementApi, challengeApi]) {
    assert.match(source, /if \(definitionResult\.error\) throw definitionResult\.error/);
    assert.match(source, /if \(historicalResult\.error\) throw historicalResult\.error/);
  }
});
