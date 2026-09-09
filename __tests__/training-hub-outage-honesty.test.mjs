import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const read = relativePath => readFileSync(join(ROOT, relativePath), 'utf8');

const HUB_PATH = 'pages/hub/training.js';
const STREAK_PATH = 'src/components/training/StudyStreakMap.jsx';
const HISTORY_PATH = 'src/components/training/SessionHistoryList.jsx';

function parseJsx(source, filename) {
  assert.doesNotThrow(() => parse(source, {
    sourceType: 'module',
    sourceFilename: filename,
    plugins: ['jsx', 'dynamicImport'],
  }));
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('Training Hub parses and preserves the single approved global header', () => {
  const source = read(HUB_PATH);
  parseJsx(source, HUB_PATH);
  assert.equal((source.match(/import UniversalHeader from/g) || []).length, 1);
  assert.equal((source.match(/<UniversalHeader\s*\/>/g) || []).length, 1);
});

test('weekly stats accept authoritative zeros but reject missing, null, and malformed metrics', () => {
  const source = read(HUB_PATH);
  const helperSource = between(
    source,
    'const WEEKLY_STATS_NUMERIC_FIELDS',
    'function isRecord',
  );
  const { normalizeAuthoritativeWeeklyStats } = Function(
    `${helperSource}\nreturn { normalizeAuthoritativeWeeklyStats };`,
  )();
  const zeroStats = {
    hands_this_week: 0,
    accuracy_this_week_pct: 0,
    ev_saved_this_week_bb: 0,
    hands_last_week: 0,
    accuracy_last_week_pct: 0,
    ev_saved_last_week_bb: 0,
    current_streak_days: 0,
    personal_best_streak_days: 0,
    rolling_accuracy_pct: 0,
    rolling_correct: 0,
    rolling_total: 0,
    current_grade: 'F',
  };

  assert.deepEqual(normalizeAuthoritativeWeeklyStats(zeroStats), zeroStats);
  assert.equal(normalizeAuthoritativeWeeklyStats({ ...zeroStats, rolling_total: null }), null);
  assert.equal(normalizeAuthoritativeWeeklyStats({ ...zeroStats, rolling_total: '0' }), null);
  assert.equal(normalizeAuthoritativeWeeklyStats({ ...zeroStats, rolling_total: Number.NaN }), null);
  const missing = { ...zeroStats };
  delete missing.current_streak_days;
  assert.equal(normalizeAuthoritativeWeeklyStats(missing), null);
});

test('Hub weekly and grade reads fail closed with explicit retry and no zero fallback', () => {
  const source = read(HUB_PATH);
  const dashboardHook = between(source, 'function useTrainingDashboard', '/** Format a week-over-week trend');
  const gradeCard = between(source, 'function GradeCard', 'function Stat');

  assert.match(dashboardHook, /const \[statsError, setStatsError\] = useState\(null\)/);
  assert.match(dashboardHook, /json\?\.success === true[\s\S]*?normalizeAuthoritativeWeeklyStats/);
  assert.match(dashboardHook, /setStats\(null\);[\s\S]*?setStatsError\('Weekly training statistics are temporarily unavailable\.'\)/);
  assert.match(dashboardHook, /\[authUser\?\.id, statsRetryToken\]/);
  assert.match(source, /Weekly Stats Are Temporarily Unavailable[\s\S]*?onRetry=\{retryStats\}/);
  assert.match(source, /formatSignedValue\(stats\?\.ev_saved_this_week_bb\)/);
  assert.doesNotMatch(source, /stats\?\.(?:hands_this_week|accuracy_this_week_pct|ev_saved_this_week_bb|current_streak_days|rolling_accuracy_pct|rolling_total)\s*\?\?\s*0/);

  const unavailableIndex = gradeCard.indexOf('if (error || !stats)');
  const emptyIndex = gradeCard.indexOf('const hasData');
  assert.ok(unavailableIndex >= 0 && unavailableIndex < emptyIndex, 'grade must reject failed/missing reads before empty-data rendering');
  assert.match(gradeCard, /Training Grade Is Temporarily Unavailable/);
  assert.match(gradeCard, /onRetry=\{onRetry\}/);
});

test('Hub progress commits only a complete authoritative session and analytics pair', () => {
  const source = read(HUB_PATH);
  const progressHook = between(source, 'function useLifetimeProgress', '/**\n * useTrainingDashboard');
  const progressBlock = between(source, 'function ProgressBlock', 'function leakPriority');

  assert.match(progressHook, /Promise\.all\(\[[\s\S]*?get-sessions[\s\S]*?training\/analytics/);
  assert.match(progressHook, /!sessionsResponse\.ok/);
  assert.match(progressHook, /!analyticsResponse\.ok/);
  assert.match(progressHook, /sessionsJson\?\.success !== true \|\| !Array\.isArray\(sessionsJson\.sessions\)/);
  assert.match(progressHook, /analyticsJson\?\.success !== true \|\| !isRecord\(analyticsJson\.positionAccuracy\)/);
  assert.match(progressHook, /setLifetimeSessions\(null\);[\s\S]*?setPositionAccuracy\(null\);[\s\S]*?setProgressError\('Training progress is temporarily unavailable\.'\)/);
  assert.match(progressHook, /\[authUser\?\.id, progressRetryToken\]/);

  const unavailableIndex = progressBlock.indexOf('if (error || !Array.isArray(sessions)');
  const emptyIndex = progressBlock.indexOf('if (rows.length === 0)');
  assert.ok(unavailableIndex >= 0 && unavailableIndex < emptyIndex, 'progress must reject failed/missing reads before no-session rendering');
  assert.match(progressBlock, /Progress History Is Temporarily Unavailable/);
  assert.match(progressBlock, /No Empty-History Result Is Assumed/);
  assert.doesNotMatch(progressBlock, /const rows = sessions \|\| \[\]/);
});

test('self-fetching streak and session history widgets distinguish outage from empty success', () => {
  const streak = read(STREAK_PATH);
  const history = read(HISTORY_PATH);
  parseJsx(streak, STREAK_PATH);
  parseJsx(history, HISTORY_PATH);

  for (const [name, source] of [['streak', streak], ['history', history]]) {
    assert.match(source, /const \[sessions, setSessions\] = useState\(null\)/, `${name} must start unknown`);
    assert.match(source, /const \[error, setError\] = useState\(null\)/, `${name} must track failure`);
    assert.match(source, /!res\.ok \|\| data\?\.success !== true \|\| !Array\.isArray\(data\.sessions\)/, `${name} must validate status and body`);
    assert.match(source, /setSessions\(null\);[\s\S]*?setError\(/, `${name} must clear stale data on failure`);
    assert.match(source, /role="alert"[\s\S]*?Temporarily Unavailable[\s\S]*?<button[^>]*onClick=\{fetch/, `${name} must expose an alert and retry`);
  }

  const streakError = streak.indexOf('if (error || !Array.isArray(sessions))');
  const streakRender = streak.indexOf('return <StudyStreakMap sessionHistory={sessions} />');
  assert.ok(streakError >= 0 && streakError < streakRender);

  const historyError = history.indexOf('if (error || !Array.isArray(sessions))');
  const historyEmpty = history.indexOf('if (sessions.length === 0)');
  assert.ok(historyError >= 0 && historyError < historyEmpty, 'history empty state must be reachable only after successful array validation');
  assert.match(history, /No Empty History Was Assumed/);
  assert.doesNotMatch(history, /session\.hands_played \|\| session\.questions_answered \|\| 0/);
});
