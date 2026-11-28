// Bankroll badges: milestones earned from the player's own ledger.
//
// The Bankroll Manager footer artwork has carried a BADGES button since the
// v2 footer shipped, but it was wired to Bankroll Rules, so a player tapping
// BADGES landed on a rules form. Every badge here is computed from rows the
// player recorded; nothing is stored or awarded server-side.

import { SESSION_CATEGORIES } from './ledgerReport.mjs';

const HOUR = 3600000;

export const BADGE_DEFINITIONS = Object.freeze([
  { key: 'first_session', title: 'First Session', description: 'Log your first gaming session.', metric: 'sessions', target: 1 },
  { key: 'bankroll_builder', title: 'Bankroll Builder', description: 'Log thirty gaming sessions.', metric: 'sessions', target: 30 },
  { key: 'century', title: 'Century', description: 'Log one hundred gaming sessions.', metric: 'sessions', target: 100 },
  { key: 'first_win', title: 'In The Black', description: 'Finish a session with a profit.', metric: 'wins', target: 1 },
  { key: 'hot_streak', title: 'Hot Streak', description: 'Win three sessions in a row.', metric: 'bestStreak', target: 3 },
  { key: 'winning_month', title: 'Winning Month', description: 'Finish a calendar month ahead, over at least three sessions.', metric: 'winningMonths', target: 1 },
  { key: 'grinder', title: 'Grinder', description: 'Log fifty hours of timed sessions.', metric: 'hours', target: 50 },
  { key: 'iron_seat', title: 'Iron Seat', description: 'Log two hundred and fifty hours of timed sessions.', metric: 'hours', target: 250 },
  { key: 'road_warrior', title: 'Road Warrior', description: 'Complete a trip in the Trip Tracker.', metric: 'completedTrips', target: 1 },
  { key: 'paper_trail', title: 'Paper Trail', description: 'Keep a W-2G in the Tax Reports vault.', metric: 'w2gForms', target: 1 },
]);

const netOf = (row) => {
  const stored = row.net_result;
  if (stored !== null && stored !== undefined && stored !== '' && Number.isFinite(Number(stored))) return Math.round(Number(stored) * 100);
  return Math.round((Number(row.gross_out) || 0) * 100) - Math.round((Number(row.gross_in) || 0) * 100);
};

/** Raw counts the badges are measured against. */
export function badgeMetrics(entries = [], { completedTrips = 0, w2gForms = 0 } = {}) {
  const sessions = entries
    .filter((e) => e && !e.is_revision && SESSION_CATEGORIES.includes(e.category) && e.entry_date)
    .sort((a, b) =>
      String(a.entry_date).localeCompare(String(b.entry_date)) ||
      String(a.start_time || a.created_at || '').localeCompare(String(b.start_time || b.created_at || '')) ||
      String(a.id || '').localeCompare(String(b.id || '')));
  let wins = 0, streak = 0, bestStreak = 0, timeMs = 0;
  const months = new Map();
  for (const row of sessions) {
    const net = netOf(row);
    if (net > 0) { wins++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
    const month = String(row.entry_date).slice(0, 7);
    const m = months.get(month) || { net: 0, count: 0 };
    m.net += net;
    m.count++;
    months.set(month, m);
    const elapsed = Date.parse(row.end_time) - Date.parse(row.start_time);
    // Ignore impossible spans (over 48 hours) so one mistyped date cannot award hour badges.
    if (Number.isFinite(elapsed) && elapsed > 0 && elapsed <= 48 * HOUR) timeMs += elapsed;
  }
  const winningMonths = [...months.values()].filter((m) => m.count >= 3 && m.net > 0).length;
  return {
    sessions: sessions.length,
    wins,
    bestStreak,
    winningMonths,
    hours: Math.floor((timeMs / HOUR) * 10) / 10,
    completedTrips: Math.max(0, Number(completedTrips) || 0),
    w2gForms: Math.max(0, Number(w2gForms) || 0),
  };
}

export function computeBadges(entries, extras) {
  const metrics = badgeMetrics(entries, extras);
  const badges = BADGE_DEFINITIONS.map((def) => {
    const value = metrics[def.metric];
    return { ...def, value, progress: Math.min(1, value / def.target), earned: value >= def.target };
  });
  return { metrics, badges, earned: badges.filter((b) => b.earned).length };
}
