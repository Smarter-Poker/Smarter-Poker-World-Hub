const DAY_MS = 24 * 60 * 60 * 1000;

function requireDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('A valid leaderboard period date is required.');
  }
  return date;
}

export function getIsoWeekKey(value = new Date()) {
  const source = requireDate(value);
  const thursday = new Date(Date.UTC(
    source.getUTCFullYear(),
    source.getUTCMonth(),
    source.getUTCDate(),
  ));
  const isoWeekday = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoWeekday);

  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((thursday - yearStart) / DAY_MS) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function getLeaderboardPeriodKey(period, value = new Date()) {
  const date = requireDate(value);
  if (period === 'alltime') return 'alltime';
  if (period === 'weekly') return getIsoWeekKey(date);
  if (period === 'monthly') return date.toISOString().slice(0, 7);
  if (period === 'daily') return date.toISOString().slice(0, 10);
  throw new RangeError(`Unsupported leaderboard period: ${period}`);
}
