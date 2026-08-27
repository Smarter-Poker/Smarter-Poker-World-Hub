/**
 * Pure contracts shared by the Preflop Charts game and its analytics pages.
 * Accuracy is displayed as 0..100 and readers remain compatible with legacy
 * rows or RPCs that expose fractional values.
 */

export function normalizeRangeAction(action) {
  const normalized = String(action || '').toLowerCase().replace(/[-\s]/g, '_');
  if (normalized.startsWith('raise_small')) return 'raise_small';
  if (normalized.startsWith('raise_big')) return 'raise_big';
  if (normalized.startsWith('all_in') || normalized.startsWith('allin') || normalized.startsWith('jam')) return 'all_in';
  if (normalized.startsWith('raise') || normalized.startsWith('3bet') || normalized.startsWith('4bet')) return 'raise';
  if (normalized.startsWith('call') || normalized.startsWith('complete')) return 'call';
  if (normalized.startsWith('fold') || normalized.startsWith('check')) return 'fold';
  return normalized.replace(/\d+$/, '');
}

/**
 * Scores an exact range as intersection-over-union.
 * Missing and wrong-action hands reduce the numerator; extra hands expand the
 * denominator. This closes the old exploit where selecting every hand could
 * still receive 100% because extras were reported but never scored.
 */
export function gradeUserGrid(userGrid = {}, solution = {}) {
  let correctHands = 0;
  const missedHands = [];
  const extraHands = [];
  const wrongActionHands = [];

  for (const [hand, correctAction] of Object.entries(solution)) {
    const userAction = normalizeRangeAction(userGrid[hand]);
    const normalizedCorrectAction = normalizeRangeAction(correctAction);
    if (!userAction || userAction === 'fold') missedHands.push(hand);
    else if (userAction !== normalizedCorrectAction) wrongActionHands.push(hand);
    else correctHands += 1;
  }

  for (const [hand, action] of Object.entries(userGrid)) {
    const userAction = normalizeRangeAction(action);
    if (!solution[hand] && userAction && userAction !== 'fold') extraHands.push(hand);
  }

  const totalSolutionHands = Object.keys(solution).length;
  const unionHands = totalSolutionHands + extraHands.length;
  const mistakes = missedHands.length + extraHands.length + wrongActionHands.length;
  const score = unionHands > 0 ? Math.round((correctHands / unionHands) * 100) : 0;

  return {
    score: Math.max(0, Math.min(100, score)),
    correctHands,
    missedHands,
    extraHands,
    wrongActionHands,
    mistakes,
  };
}

export function accuracyToFraction(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

export function accuracyToPercent(value, scoreHint = null) {
  const numeric = Number(value);
  const hint = Number(scoreHint);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;

  // A score hint disambiguates legacy 1% rows from new 1.0 (100%) rows.
  if (Number.isFinite(hint) && hint >= 0 && hint <= 100) {
    if (Math.abs(numeric - hint) < 0.001) return Math.max(0, Math.min(100, numeric));
    if (numeric <= 1 && Math.abs((numeric * 100) - hint) <= 1) return Math.max(0, Math.min(100, numeric * 100));
  }

  return Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric));
}

export function normalizeMemoryDashboard(stats) {
  if (!stats || typeof stats !== 'object') return stats;

  const normalizeRpcPercent = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    // The legacy RPC multiplies already-percent rows by 100.
    return Math.max(0, Math.min(100, numeric > 100 ? numeric / 100 : numeric));
  };

  const perLevel = Array.isArray(stats.per_level_mastery)
    ? stats.per_level_mastery.map((level) => {
      const bestAccuracy = normalizeRpcPercent(level?.best_accuracy);
      return { ...level, best_accuracy: bestAccuracy, mastered: bestAccuracy >= 85 };
    })
    : [];

  const rollingAccuracy = normalizeRpcPercent(stats.rolling_accuracy_pct);
  const getGrade = (percent) => {
    if (percent >= 97) return ['A+', null];
    if (percent >= 93) return ['A', 'A+'];
    if (percent >= 90) return ['A-', 'A'];
    if (percent >= 87) return ['B+', 'A-'];
    if (percent >= 83) return ['B', 'B+'];
    if (percent >= 80) return ['B-', 'B'];
    if (percent >= 77) return ['C+', 'B-'];
    if (percent >= 73) return ['C', 'C+'];
    if (percent >= 70) return ['C-', 'C'];
    if (percent >= 67) return ['D+', 'C-'];
    if (percent >= 63) return ['D', 'D+'];
    if (percent >= 60) return ['D-', 'D'];
    return ['F', 'D-'];
  };
  const [currentGrade, nextGrade] = getGrade(rollingAccuracy);

  return {
    ...stats,
    rolling_accuracy_pct: rollingAccuracy,
    current_grade: currentGrade,
    next_grade: nextGrade,
    avg_accuracy_this_week_pct: normalizeRpcPercent(stats.avg_accuracy_this_week_pct),
    avg_accuracy_last_week_pct: normalizeRpcPercent(stats.avg_accuracy_last_week_pct),
    per_mode_best: Array.isArray(stats.per_mode_best)
      ? stats.per_mode_best.map((mode) => ({ ...mode, best_accuracy: normalizeRpcPercent(mode?.best_accuracy) }))
      : [],
    per_level_mastery: perLevel,
    mastered_levels_count: perLevel.filter((level) => level.mastered).length,
  };
}

export function getUnlockedLevel(perLevelMastery = []) {
  const mastered = new Set(
    perLevelMastery.filter((level) => level?.mastered).map((level) => Number(level.level)),
  );
  let unlocked = 1;
  for (let level = 1; level < 10; level += 1) {
    if (!mastered.has(level)) break;
    unlocked = level + 1;
  }
  return unlocked;
}
