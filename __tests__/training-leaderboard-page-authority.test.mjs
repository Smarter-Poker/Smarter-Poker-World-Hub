import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../pages/hub/training/leaderboard.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../pages/api/training/leaderboard.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260907010000_training_server_authoritative_completion.sql', import.meta.url), 'utf8');

test('Training leaderboard renders exact server ranks and verified counters', () => {
  assert.match(page, /myRank:\s*data\.myRank/);
  assert.match(page, /rank=\{entry\.rank\}/);
  assert.match(page, /questionsAnswered \|\| 0/);
  assert.match(page, /questionsCorrect \|\| 0/);
  assert.doesNotMatch(page, /questionsCorrect \|\| 0\) \*|Points|findIndex\(\(s\) => s\.userId/);
  assert.match(api, /questionsAnswered:\s*entry\.questions_answered/);
  assert.match(migration, /'questionsAnswered', mine\.questions_answered/);
});

test('unsupported friends ranking is not fabricated from a truncated global list', () => {
  assert.doesNotMatch(page, /id:\s*'friends'|friendIds|\/api\/friends\?action=list/);
  assert.doesNotMatch(page, /filter\(e => friendIds\.includes/);
});

test('profile enrichment failures cannot silently publish anonymous partial rankings', () => {
  assert.match(api, /profilesError/);
  assert.match(api, /if \(profilesError\) throw profilesError/);
});
