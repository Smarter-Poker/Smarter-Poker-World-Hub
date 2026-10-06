export const TRIVIA_SCORE_MODES = Object.freeze([
  { id: 'daily', label: 'Daily' },
  { id: 'history', label: 'Poker History' },
  { id: 'rules', label: 'Rules' },
  { id: 'pro', label: 'Pro Knowledge' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'mtt', label: 'MTT' },
  { id: 'cash', label: 'Cash' },
  { id: 'icm', label: 'ICM' },
  { id: 'gto', label: 'GTO' },
  { id: 'endless', label: 'Endless' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'survival', label: 'Survival' },
  { id: 'time-attack', label: 'Time Attack' },
  { id: 'pvp', label: 'PvP' },
]);

export const TRIVIA_STATS_MODE_FILTERS = Object.freeze([
  { id: 'all', label: 'All Modes' },
  ...TRIVIA_SCORE_MODES,
]);

export const TRIVIA_PERIOD_FILTERS = Object.freeze([
  { id: 'today', label: 'Today', days: 1 },
  { id: 'week', label: '7 Days', days: 7 },
  { id: 'month', label: '30 Days', days: 30 },
  { id: 'all', label: 'All Time', days: null },
]);

export function triviaModeLabel(mode) {
  const found = TRIVIA_SCORE_MODES.find((option) => option.id === mode);
  if (found) return found.label;
  return String(mode || 'Unknown')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/(^|\s)(\p{Ll})/gu, (match, lead, letter) => `${lead}${letter.toUpperCase()}`);
}

function dateDaysAgo(today, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return null;
  const date = new Date(`${today}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - Math.max(0, days - 1));
  return date.toISOString().slice(0, 10);
}

export function triviaPeriodStart(period, today) {
  const option = TRIVIA_PERIOD_FILTERS.find((candidate) => candidate.id === period)
    || TRIVIA_PERIOD_FILTERS.at(-1);
  return option.days ? dateDaysAgo(today, option.days) : null;
}

export function filterTriviaScores(rows, { mode = 'all', period = 'all', today } = {}) {
  const periodOption = TRIVIA_PERIOD_FILTERS.find((option) => option.id === period)
    || TRIVIA_PERIOD_FILTERS.at(-1);
  const cutoff = periodOption.days ? triviaPeriodStart(periodOption.id, today) : null;
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || row.server_verified !== true) return false;
    if (mode !== 'all' && row.mode !== mode) return false;
    if (cutoff && (!row.play_date || row.play_date < cutoff)) return false;
    return true;
  });
}

export function summarizeTriviaScores(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const totalQuestions = list.reduce((sum, row) => sum + Math.max(0, Number(row?.total_questions) || 0), 0);
  const correctAnswers = list.reduce((sum, row) => sum + Math.max(0, Number(row?.correct_count) || 0), 0);
  const diamondsEarned = list.reduce((sum, row) => sum + Math.max(0, Number(row?.diamonds_earned) || 0), 0);
  return {
    gamesPlayed: list.length,
    totalQuestions,
    correctAnswers,
    diamondsEarned,
    accuracy: totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : null,
  };
}

export function summarizeModes(rows) {
  const byMode = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const mode = row?.mode || 'unknown';
    const aggregate = byMode.get(mode) || {
      mode,
      games: 0,
      correct: 0,
      questions: 0,
      best: 0,
      diamonds: 0,
    };
    aggregate.games += 1;
    aggregate.correct += Math.max(0, Number(row?.correct_count) || 0);
    aggregate.questions += Math.max(0, Number(row?.total_questions) || 0);
    aggregate.diamonds += Math.max(0, Number(row?.diamonds_earned) || 0);
    aggregate.best = Math.max(aggregate.best, Number(row?.score) || 0);
    byMode.set(mode, aggregate);
  }
  return Array.from(byMode.values())
    .map((entry) => ({
      ...entry,
      accuracy: entry.questions > 0 ? Math.round((entry.correct / entry.questions) * 100) : null,
    }))
    .sort((left, right) => right.games - left.games || triviaModeLabel(left.mode).localeCompare(triviaModeLabel(right.mode)));
}

function rowIdentity(row) {
  return row?.user_id || (row?.username ? `name:${row.username}` : null);
}

function rowAccuracy(row) {
  const questions = Math.max(0, Number(row?.total_questions) || 0);
  const correct = Math.max(0, Number(row?.correct_count) || 0);
  return questions > 0 ? Math.round((correct / questions) * 100) : null;
}

function isBetterScore(candidate, current) {
  if (!current) return true;
  const candidateScore = Number(candidate?.score) || 0;
  const currentScore = Number(current?.score) || 0;
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  const candidateAccuracy = rowAccuracy(candidate) ?? -1;
  const currentAccuracy = rowAccuracy(current) ?? -1;
  if (candidateAccuracy !== currentAccuracy) return candidateAccuracy > currentAccuracy;
  return String(candidate?.play_date || '') > String(current?.play_date || '');
}

/**
 * One authoritative best verified run per entrant. Ranks use standard
 * competition ranking: equal scores share a rank and the following rank skips.
 * Accuracy orders equal-score rows for readability but never breaks the tie.
 */
export function rankComparableTriviaScores(rows) {
  const bestByEntrant = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const identity = rowIdentity(row);
    if (!identity || row?.server_verified !== true) continue;
    const current = bestByEntrant.get(identity);
    if (isBetterScore(row, current)) bestByEntrant.set(identity, row);
  }

  const sorted = Array.from(bestByEntrant.entries())
    .map(([identity, row]) => ({
      ...row,
      identity,
      score: Number(row?.score) || 0,
      accuracy: rowAccuracy(row),
      displayName: row?.username || (row?.user_id ? `Player ${String(row.user_id).slice(0, 6)}` : 'Anonymous Player'),
    }))
    .sort((left, right) => (
      right.score - left.score
      || (right.accuracy ?? -1) - (left.accuracy ?? -1)
      || left.displayName.localeCompare(right.displayName)
      || left.identity.localeCompare(right.identity)
    ));

  let previousScore = null;
  let sharedRank = 0;
  return sorted.map((entry, index) => {
    if (previousScore === null || entry.score !== previousScore) sharedRank = index + 1;
    previousScore = entry.score;
    return { ...entry, rank: sharedRank };
  });
}

export function paginateRankedScores(rows, page, pageSize) {
  const size = Math.max(1, Number(pageSize) || 20);
  const total = Array.isArray(rows) ? rows.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const offset = (safePage - 1) * size;
  return {
    page: safePage,
    pageCount,
    total,
    items: (Array.isArray(rows) ? rows : []).slice(offset, offset + size),
  };
}

export function derivePreferenceSyncState({
  pending = false,
  baseRevision = 0,
  cloudRevision = 0,
  localFingerprint = '',
  cloudFingerprint = '',
} = {}) {
  if (pending && Number(baseRevision) !== Number(cloudRevision) && localFingerprint !== cloudFingerprint) {
    return 'conflict';
  }
  if (pending && localFingerprint !== cloudFingerprint) return 'pending';
  return 'cloud';
}
