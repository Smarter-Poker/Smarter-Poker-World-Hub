export const TRAINING_LEADERBOARD_CATEGORIES = Object.freeze([
  'mtt',
  'cash',
  'spins',
  'psychology',
  'advanced',
]);

const EXPLICIT_CATEGORIES = new Map([
  ['tournament-prep', 'mtt'],
  ['final-table-sim', 'mtt'],
  ['quiz-gauntlet', 'advanced'],
  ['hand-lab', 'advanced'],
  ['bluff-catcher', 'advanced'],
  ['mixed-strategy-lab', 'advanced'],
  ['study-group', 'advanced'],
]);

export function getTrainingLeaderboardCategory(value) {
  const gameId = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (/^mtt-\d{3}$/.test(gameId)) return 'mtt';
  if (/^cash-\d{3}$/.test(gameId)) return 'cash';
  if (/^spins-\d{3}$/.test(gameId)) return 'spins';
  if (/^psy-\d{3}$/.test(gameId)) return 'psychology';
  if (/^adv-\d{3}$/.test(gameId)) return 'advanced';
  return EXPLICIT_CATEGORIES.get(gameId) || null;
}

export function normalizeTrainingLeaderboardCategory(value) {
  const category = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return TRAINING_LEADERBOARD_CATEGORIES.includes(category) ? category : null;
}
