/**
 * The daily-login streak, as arithmetic. Pure: no I/O, no Supabase, so it can
 * be imported by a plain `node --test` and by the API routes that answer for
 * it (/api/rewards/progress reads it; /api/rewards/daily-login pays on it).
 *
 * Why this file exists (2026-09-13): /api/rewards/progress computed whether
 * today's login was already claimed (`days.has(today)`) and threw the answer
 * away, so the Club Arena wallet's Earn pane enabled "Claim Daily Diamonds"
 * for a player who had already claimed - only the click told them. The route
 * now reports `loginClaimedToday` and `nextLoginReward`, and the logic that
 * decides both lives here where a test can reach it.
 */
import { REWARDS, REWARD_TIMEZONE } from '../../config/diamondRewards.js';

const TZ = REWARD_TIMEZONE;

/** YYYY-MM-DD in America/Chicago - the anchor timezone for every diamond day. */
export function chicagoDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Shift a YYYY-MM-DD calendar date by whole days (pure calendar math, DST-safe). */
export function shiftDay(ymd, delta) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + delta * 86400000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/** The longest run this walks back. 400 days is over a year of daily claims. */
export const MAX_STREAK_LOOKBACK_DAYS = 400;

/**
 * TRUE consecutive-day run of daily_login awards, anchored America/Chicago,
 * from the `created_at` of every positive daily_login row.
 *
 * If today is already claimed the run ends today; otherwise the run ending
 * yesterday is still alive and is what the next claim will extend. A run that
 * ended before yesterday is broken: streak 0.
 *
 * Returns `{ streak, claimedToday }` - both, because the route that used to
 * compute this knew `claimedToday` and discarded it.
 */
export function streakFromRows(rows, now = new Date()) {
  const days = new Set();
  for (const row of rows || []) {
    if (row && row.created_at) days.add(chicagoDate(new Date(row.created_at)));
  }
  const today = chicagoDate(now);
  const claimedToday = days.has(today);
  if (days.size === 0) return { streak: 0, claimedToday };

  let cursor = claimedToday ? today : shiftDay(today, -1);
  if (!days.has(cursor)) return { streak: 0, claimedToday };

  let streak = 0;
  while (days.has(cursor) && streak < MAX_STREAK_LOOKBACK_DAYS) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { streak, claimedToday };
}

/**
 * What the NEXT daily-login claim pays, from the catalog's own scaling rule
 * (`REWARDS.daily_login.scaling`: min(base + (day - 1) * increment, max)), so
 * this cannot drift from what award_diamonds_v2 resolves server-side.
 *
 * The next claim always extends the run by one day: claiming now extends the
 * run that ended yesterday, and a claim tomorrow extends the run that ends
 * today. A broken run (streak 0) starts again at day 1.
 */
export function nextLoginReward(streak) {
  const scaling = (REWARDS && REWARDS.daily_login && REWARDS.daily_login.scaling) || {};
  const base = Number(scaling.base) || 5;
  const increment = Number(scaling.increment) || 2;
  const max = Number(scaling.max) || 25;
  const nextDay = Math.max(1, (Number(streak) || 0) + 1);
  return Math.min(base + (nextDay - 1) * increment, max);
}
