// LAW: a leaderboard shows its leaders to a crawler.
//
// A Googlebot crawl measured the sitemap's leaderboards at 118 to 138 words of
// server-rendered text, because the rankings loaded only in the browser.
// /hub/training/leaderboard now renders its default board on the server from
// the same anonymous API a signed-out visitor's browser reads, with only the
// fields the page already shows.
//
// Deliberately left alone:
// - /hub/trivia/leaderboard reads trivia_scores in the browser with the anon
//   key, and the anon role sees zero rows (content-range */0 on 2026-09-22),
//   so a signed-out visitor sees "No Scores Yet" today. Nothing public to seed.
// - /hub/preflop-charts/leaderboard re-exports the memory-games page, which
//   deliberately shows no rankings while verified matchmaking is prepared.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TRAINING_LEADERBOARD_DEFAULT_KEY,
  publicTrainingLeaderboardSeed,
  requestOrigin,
} from '../src/lib/training/publicLeaderboardSeed.mjs';

const page = readFileSync(new URL('../pages/hub/training/leaderboard.js', import.meta.url), 'utf8');

test('the training leaderboard fetches its default board on the server', () => {
  assert.match(page, /export async function getServerSideProps/);
  assert.match(page, /swrFallback\(requestOrigin\(req\), TRAINING_LEADERBOARD_DEFAULT_KEY\)/);
  assert.match(page, /publicTrainingLeaderboardSeed\(/);
});

test('the seed key is the exact key the page builds for its default filters', () => {
  assert.match(page, /timeframe: 'all-time'/);
  assert.match(page, /view: 'global'/);
  assert.match(page, /const swrKey = `\/api\/training\/leaderboard\?period=\$\{period\}&limit=100\$\{categoryParam\}`/);
  assert.equal(TRAINING_LEADERBOARD_DEFAULT_KEY, '/api/training/leaderboard?period=alltime&limit=100');
});

test('the seed goes straight to the hook and is not hidden behind the loading gate', () => {
  assert.match(page, /swrKey === TRAINING_LEADERBOARD_DEFAULT_KEY && seed \? \{ fallbackData: seed \}/);
  assert.match(page, /\{loading && !swrData \?/);
  assert.match(page, /<PageTransition disableInitialAnimation>/);
});

test('a seeded row without an id is never marked as the viewer', () => {
  assert.match(page, /isCurrentUser=\{Boolean\(user\?\.id\) && user\.id === entry\.userId\}/);
});

test('only public fields reach the page props', () => {
  const seed = publicTrainingLeaderboardSeed({
    success: true,
    leaderboard: [{
      rank: 1, userId: 'secret-id', username: 'Ace', avatarUrl: null, accuracy: 100,
      sessionsCompleted: 7, questionsAnswered: 140, questionsCorrect: 140, gtowScoreAvg: null, bestStreak: 20,
    }],
    myRank: 4,
    myEntry: { userId: 'secret-id' },
  });
  assert.deepEqual(seed, {
    leaderboard: [{ rank: 1, username: 'Ace', avatarUrl: null, accuracy: 100, questionsAnswered: 140, questionsCorrect: 140 }],
    myRank: null,
    myEntry: null,
  });
  assert.doesNotMatch(JSON.stringify(seed), /secret-id/);
});

test('an unusable answer seeds nothing', () => {
  assert.equal(publicTrainingLeaderboardSeed(undefined), null);
  assert.equal(publicTrainingLeaderboardSeed({ success: false }), null);
  assert.equal(publicTrainingLeaderboardSeed({ success: true, leaderboard: 'x' }), null);
});

test('the server reads the API on the origin it was served from', () => {
  const saved = process.env.SITE_ORIGIN;
  delete process.env.SITE_ORIGIN;
  try {
    assert.equal(requestOrigin({ headers: { host: 'smarter.poker', 'x-forwarded-proto': 'https' } }), 'https://smarter.poker');
    assert.equal(requestOrigin({ headers: { host: 'localhost:3000' } }), 'http://localhost:3000');
    assert.equal(requestOrigin(undefined), 'https://smarter.poker');
  } finally {
    if (saved !== undefined) process.env.SITE_ORIGIN = saved;
  }
});

test('the Training page does not pull an unrelated SEO module into its surface', () => {
  assert.doesNotMatch(page, /poker-near-me\/seriesSeo/);
});
