import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  filterTriviaScores,
  derivePreferenceSyncState,
  paginateRankedScores,
  rankComparableTriviaScores,
  summarizeTriviaScores,
} from '../src/lib/trivia/progressAccount.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

test('stats filters accept only verified rows in the selected mode and period', () => {
  const rows = [
    { user_id: 'a', mode: 'daily', play_date: '2026-10-05', server_verified: true, correct_count: 8, total_questions: 10 },
    { user_id: 'a', mode: 'daily', play_date: '2026-09-01', server_verified: true, correct_count: 10, total_questions: 10 },
    { user_id: 'a', mode: 'endless', play_date: '2026-10-05', server_verified: true, correct_count: 20, total_questions: 20 },
    { user_id: 'a', mode: 'daily', play_date: '2026-10-05', server_verified: false, correct_count: 10, total_questions: 10 },
    { user_id: 'a', mode: 'daily', play_date: '2026-10-05', correct_count: 10, total_questions: 10 },
  ];
  const filtered = filterTriviaScores(rows, { mode: 'daily', period: 'week', today: '2026-10-05' });
  assert.deepEqual(filtered, [rows[0]]);
  assert.deepEqual(summarizeTriviaScores(filtered), {
    gamesPlayed: 1,
    totalQuestions: 10,
    correctAnswers: 8,
    diamondsEarned: 0,
    accuracy: 80,
  });
});

test('ranking keeps one best verified run per entrant and gives equal scores a shared rank', () => {
  const ranked = rankComparableTriviaScores([
    { user_id: 'a', username: 'ace', score: 900, correct_count: 9, total_questions: 10, play_date: '2026-10-01', server_verified: true },
    { user_id: 'a', username: 'ace', score: 1000, correct_count: 10, total_questions: 10, play_date: '2026-10-02', server_verified: true },
    { user_id: 'b', username: 'bravo', score: 1000, correct_count: 8, total_questions: 10, play_date: '2026-10-03', server_verified: true },
    { user_id: 'c', username: 'charlie', score: 800, correct_count: 8, total_questions: 10, play_date: '2026-10-03', server_verified: true },
    { user_id: 'd', username: 'delta', score: 9999, correct_count: 10, total_questions: 10, play_date: '2026-10-03', server_verified: false },
  ]);
  assert.deepEqual(ranked.map(({ user_id, score, rank }) => ({ user_id, score, rank })), [
    { user_id: 'a', score: 1000, rank: 1 },
    { user_id: 'b', score: 1000, rank: 1 },
    { user_id: 'c', score: 800, rank: 3 },
  ]);
});

test('ranking pages preserve the total and clamp invalid page numbers', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ rank: index + 1 }));
  assert.deepEqual(paginateRankedScores(rows, 2, 20), {
    page: 2,
    pageCount: 3,
    total: 45,
    items: rows.slice(20, 40),
  });
  assert.equal(paginateRankedScores(rows, 99, 20).page, 3);
});

test('settings sync distinguishes clean, pending and conflicting device copies', () => {
  assert.equal(derivePreferenceSyncState({ pending: false, baseRevision: 1, cloudRevision: 2, localFingerprint: 'a', cloudFingerprint: 'b' }), 'cloud');
  assert.equal(derivePreferenceSyncState({ pending: true, baseRevision: 2, cloudRevision: 2, localFingerprint: 'a', cloudFingerprint: 'b' }), 'pending');
  assert.equal(derivePreferenceSyncState({ pending: true, baseRevision: 1, cloudRevision: 2, localFingerprint: 'a', cloudFingerprint: 'b' }), 'conflict');
  assert.equal(derivePreferenceSyncState({ pending: true, baseRevision: 1, cloudRevision: 2, localFingerprint: 'same', cloudFingerprint: 'same' }), 'cloud');
});

test('leaderboard exposes compatible solo boards and stable official tournament results', () => {
  const source = read('pages/hub/trivia/leaderboard.js');
  assert.doesNotMatch(source, /id:\s*['"]all['"]\s*,\s*label:\s*['"]All Modes/);
  assert.match(source, /\.eq\('server_verified', true\)/);
  assert.match(source, /\.eq\('mode', mode\)/);
  assert.match(source, /triviaPeriodStart\(period, today\)/);
  assert.match(source, /\.gte\('play_date', periodStart\)/);
  assert.match(source, /rankComparableTriviaScores/);
  assert.match(source, /Equal Scores Share A Rank/);
  assert.match(source, /Your Rank/);
  assert.match(source, /Previous/);
  assert.match(source, /Next/);
  assert.match(source, /\/api\/trivia\/nightly\/results/);
  assert.match(source, /kind=human/);
  assert.match(source, /Humans/);
  assert.match(source, /All Entrants/);
  assert.match(source, /results\.settled === true/);
  assert.match(source, /Pending Settlement/);
  assert.match(source, /entry\?\.payout === null/);
});

test('stats names guest, empty, partial, stale, error, retry and verified-source states', () => {
  const source = read('pages/hub/trivia/stats.js');
  assert.match(source, /\.eq\('server_verified', true\)/);
  assert.match(source, /Guest Visits Never Appear As Zero-Value Stats/);
  assert.match(source, /No Verified Games Match These Filters Yet/);
  assert.match(source, /Partial Data/);
  assert.match(source, /Last Verified Read Remains Visible/);
  assert.match(source, /We Could Not Load Your Verified Stats Right Now/);
  assert.match(source, /label: 'Retry'/);
  assert.match(source, /Time Range/);
  assert.match(source, /Game Mode/);
  assert.match(source, /Questions Graded/);
  assert.match(source, /setStreak\(null\)/);
  assert.match(source, /setCategoryMastery\(\[\]\)/);
});

test('settings use labeled native controls and explicit local cloud failure contracts', () => {
  const page = read('pages/hub/trivia/settings.js');
  const service = read('src/services/triviaPreferences.js');
  for (const category of ['Gameplay', 'Feedback', 'Accessibility', 'Notifications', 'Privacy', 'Sync']) {
    assert.match(page, new RegExp(`title=\\"${category}\\"`));
  }
  assert.match(page, /type="checkbox"/);
  assert.doesNotMatch(page, /role="switch"/);
  assert.match(page, /Reduced Motion/);
  assert.match(page, /High Contrast/);
  assert.match(page, /Larger Text/);
  assert.match(page, /Restore Defaults/);
  assert.match(page, /Settings Conflict/);
  assert.match(page, /Use This Device/);
  assert.match(page, /Use Cloud/);
  assert.match(page, /Sync Pending/);
  assert.match(page, /The Change Was Rolled Back/);
  assert.match(service, /update_trivia_preferences_cas/);
  assert.match(service, /p_expected_revision: revision/);
  assert.match(service, /\.select\('trivia_preferences, trivia_preferences_revision'\)/);
  assert.doesNotMatch(service, /p_column_name: 'trivia_preferences'/);
  assert.match(service, /status: 'conflict'/);
  assert.match(service, /baseRevision/);
  assert.match(page, /window\.addEventListener\('storage'/);
  assert.match(page, /pending: true/);
});

test('achievements consume only the authoritative contract and gate diamonds on complete receipts', () => {
  const source = read('pages/hub/trivia/achievements.js');
  assert.match(source, /\/api\/trivia\/achievements/);
  assert.match(source, /achievementAuthority\.mjs/);
  assert.match(source, /normalizeAchievementSnapshot/);
  assert.match(source, /hasSettledReceipt/);
  assert.match(source, /receiptId && item\.journalId && item\.transactionId/);
  assert.match(source, /Award Record Incomplete\. No Diamond Amount Is Displayed/);
  assert.match(source, /Claim Pending/);
  assert.match(source, /Retry Same Claim/);
  assert.match(source, /body: JSON\.stringify\(\{ achievementId \}\)/);
  assert.match(source, /loadedUserId\.current !== user\.id/);
  assert.match(source, /hasAuthoritativeRead\.current = false/);
  assert.doesNotMatch(source, /computeTriviaStats|isUnlocked|sumAchievementRewards|trivia_achievements_seen|localStorage|confetti/);
});

test('all four progress destinations wire their own responsive art key', () => {
  for (const key of ['stats', 'leaderboard', 'achievements', 'settings']) {
    const source = read(`pages/hub/trivia/${key}.js`);
    assert.match(source, /ResponsiveModeArt/);
    assert.match(source, new RegExp(`TRIVIA_INTRO_ART\\.${key}`));
  }
});

test('desktop layouts are distinct while mobile tables and settings stay semantic', () => {
  const css = read('src/styles/worlds/trivia-console-progress.css');
  assert.match(css, /trivia-progress-content--stats/);
  assert.match(css, /trivia-progress-leaderboard-grid/);
  assert.match(css, /trivia-progress-settings-grid/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /data-trivia-reduced-motion/);
  assert.match(css, /data-trivia-high-contrast/);
  assert.match(css, /data-trivia-larger-text/);
});

test('paged verified-score reads use an immutable total order', () => {
  for (const [file, primaryOrder] of [
    ['pages/hub/trivia/stats.js', "order('play_date', { ascending: false })"],
    ['pages/hub/trivia/leaderboard.js', "order('score', { ascending: false })"],
  ]) {
    const source = read(file);
    assert.match(source, /\.select\('id, /, `${file} must select its immutable row id`);
    assert.ok(source.indexOf(primaryOrder) >= 0, `${file} must retain its primary ranking order`);
    assert.ok(
      source.indexOf("order('id', { ascending: true })") > source.indexOf(primaryOrder),
      `${file} must break page-boundary ties by immutable id`,
    );
  }
});
