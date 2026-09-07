import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../pages/hub/training/community-leaderboard.js',
  import.meta.url,
), 'utf8');

test('community leaderboard exposes only server-owned category dimensions', () => {
  for (const category of ['cash', 'mtt', 'spins', 'psychology', 'advanced']) {
    assert.match(source, new RegExp(`id: '${category}'`));
  }

  assert.doesNotMatch(source, /id: 'preflop'/);
  assert.doesNotMatch(source, /id: 'postflop'/);
  assert.doesNotMatch(source, /id: 'streaks'/);
  assert.match(source, /categoryParam = category === 'overall'/);
  assert.match(source, /&category=\$\{category\}/);
});

test('community leaderboard preserves authoritative server rank and order', () => {
  assert.match(source, /rank: entry\.rank/);
  assert.match(source, /myRank: data\.myRank/);
  assert.match(source, /swrData\?\.myEntry/);
  assert.doesNotMatch(source, /\.sort\(\(a, b\) => b\.score - a\.score\)/);
  assert.doesNotMatch(source, /\.map\(\(e, i\) => \(\{ \.\.\.e, rank: i \+ 1/);
});

test('community leaderboard labels the available verified count honestly', () => {
  assert.match(source, /correctAnswers: entry\.questionsCorrect/);
  assert.match(source, /Correct Answers/);
  assert.doesNotMatch(source, /questionsCorrect \|\| 0, \/\/ Approx/);
});
