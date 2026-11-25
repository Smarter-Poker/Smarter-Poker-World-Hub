// Production incident, 2026-11-24/25: 595 "permission denied for table profiles"
// (42501) errors in 24h on PokerIQ-Production. Two shapes, both from the public
// trivia leaderboards and both run as `anon` (signed-out visitors):
//   * trivia_scores?select=correct_count,user_id,profiles!inner(username)
//     (pages/hub/trivia/time-attack.js loadLeaderboard)
//   * profiles?select=id,username&id=in.(...)
//     (pages/hub/trivia/[mode].js loadDailyLeaderboard)
// `anon` has no SELECT on public.profiles by design (Club Arena migration
// 20260826152329_anon_has_no_business_reading_profiles_columns), so the fix is
// not a grant: the leaderboards name players from trivia_scores.username, the
// server-written public column anon may read on verified rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestVerifiedUsernames } from '../src/lib/trivia/publicLeaderboardNames.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRIVIA_PAGES = path.join(ROOT, 'pages/hub/trivia');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function pageFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pageFiles(path.join(dir, e.name)) : /\.(m?js|jsx|tsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []
  );
}

test('no public trivia page reads public.profiles from the browser', () => {
  const offenders = [];
  for (const file of pageFiles(TRIVIA_PAGES)) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    if (/\.from\(\s*['"]profiles['"]\s*\)/.test(src) || /\bprofiles\s*(![\w]+)?\s*\(/.test(src)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], 'trivia pages must name players from trivia_scores.username, not profiles');
});

test('the time-attack leaderboard names players from verified trivia_scores rows', () => {
  const src = stripComments(read('pages/hub/trivia/time-attack.js'));
  const fn = src.slice(src.indexOf('async function loadLeaderboard'), src.indexOf('async function recoverTimeAttackRun'));
  assert.match(fn, /\.from\('trivia_scores'\)\s*\.select\('correct_count, user_id, username'\)/);
  assert.match(fn, /\.eq\('server_verified', true\)/);
  assert.match(fn, /username: entry\.username \|\| 'Anonymous'/);
});

test('the daily streak leaderboard names players from verified trivia_scores rows', () => {
  const src = stripComments(read('pages/hub/trivia/[mode].js'));
  const fn = src.slice(src.indexOf('async function loadDailyLeaderboard'), src.indexOf('function getFallbackQuestions'));
  assert.match(fn, /\.select\('user_id, username, correct_count, total_questions, play_date, created_at'\)/);
  assert.match(fn, /\.eq\('server_verified', true\)/);
  assert.match(fn, /latestVerifiedUsernames\(scoresResponse\.data\)/);
});

test('latestVerifiedUsernames keeps each player\'s newest verified name', () => {
  const names = latestVerifiedUsernames([
    { user_id: 'a', username: 'OldName', play_date: '2026-11-20', created_at: '2026-11-20T10:00:00Z' },
    { user_id: 'a', username: 'NewName', play_date: '2026-11-24', created_at: '2026-11-24T07:00:00Z' },
    { user_id: 'b', username: '  Bee  ', play_date: '2026-11-23', created_at: '2026-11-23T01:00:00Z' },
    { user_id: 'c', username: null, play_date: '2026-11-24' },
    { user_id: 'd', username: 'Forged', play_date: '2026-11-25', server_verified: false },
    { user_id: null, username: 'NoOwner' },
  ]);
  assert.deepEqual(names, { a: 'NewName', b: 'Bee' });
  assert.deepEqual(latestVerifiedUsernames(null), {});
});
