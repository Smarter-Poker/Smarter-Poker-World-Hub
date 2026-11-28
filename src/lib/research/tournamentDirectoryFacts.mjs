/**
 * What the Smarter.Poker daily tournament directory actually held, read once.
 *
 * The research report "Daily Live Poker Tournament Buy-In Index" used to
 * claim an "Audit Of 4,500+ Weekly Recurring Live Poker Tournaments", a 140
 * median buy-in and fee ratios to one decimal place. None of it was ever
 * read: the directory has no fee column at all, and the week below holds 824
 * events. Every figure the report states now comes from this module, and
 * __tests__/the-research-figures-are-real.law.test.mjs pins it.
 *
 * Read-only, Supabase project kuklfnapbkmacvwxktbh, 2026-11-28 04:28 UTC
 * (2026-11-27 Central). The served set is exactly what
 * /api/poker/daily-tournaments returns to players:
 *
 *   s = venue_daily_tournaments
 *       WHERE is_active AND NOT COALESCE(is_suppressed, false)
 *         AND data_quality IN ('scraped_verified','scraped_inferred','manual_research')
 *         AND event_date BETWEEN '2026-11-28' AND '2026-12-04'
 *
 *   SELECT count(*), count(DISTINCT venue_id), count(DISTINCT v.state),
 *          min(buy_in), max(buy_in),
 *          percentile_cont(0.5) WITHIN GROUP (ORDER BY buy_in)
 *   FROM s LEFT JOIN poker_venues v ON v.id = s.venue_id;
 *     -> 824 events, 147 venues, 29 states, 20 .. 1100, median 80
 *
 *   SELECT <tier>, count(*) FROM s GROUP BY <tier>;
 *     -> under 100: 459, 100-199: 306, 200-299: 45, 300-599: 11, 600+: 3
 *
 * level_duration_minutes and starting_stack were empty on every row in the
 * week, and there is no fee or rake column, so the report states no blind
 * level, starting stack or fee figure. When the snapshot is re-read, update
 * every constant together and move the dates.
 */

export const TOURNAMENT_SNAPSHOT_READ_AT = '2026-11-28';
export const TOURNAMENT_SNAPSHOT_WEEK_START = '2026-11-28';
export const TOURNAMENT_SNAPSHOT_WEEK_END = '2026-12-04';

export const TOURNAMENT_WEEK_EVENTS = 824;
export const TOURNAMENT_WEEK_VENUES = 147;
export const TOURNAMENT_WEEK_STATES = 29;
export const TOURNAMENT_WEEK_MEDIAN_BUY_IN = 80;
export const TOURNAMENT_WEEK_MIN_BUY_IN = 20;
export const TOURNAMENT_WEEK_MAX_BUY_IN = 1100;

/** Events per buy-in tier in the snapshot week. Sums to TOURNAMENT_WEEK_EVENTS. */
export const TOURNAMENT_WEEK_BY_TIER = Object.freeze([
  { tier: 'Under 100', low: 0, high: 99, events: 459 },
  { tier: '100 To 199', low: 100, high: 199, events: 306 },
  { tier: '200 To 299', low: 200, high: 299, events: 45 },
  { tier: '300 To 599', low: 300, high: 599, events: 11 },
  { tier: '600 And Up', low: 600, high: null, events: 3 },
]);

/** Share of the week's events in a tier, one decimal, e.g. "55.7%". */
export function tierShareLabel(events) {
  return `${((100 * events) / TOURNAMENT_WEEK_EVENTS).toFixed(1)}%`;
}

/**
 * The public floor for "how many live tournaments the directory lists in a
 * week": a round number at or below TOURNAMENT_WEEK_EVENTS. The site claimed
 * "4,500+" everywhere; the directory has never served that many in a week.
 * Every "N+ Weekly Tournaments" style claim must use this exact label (the
 * law test enforces it).
 */
export const WEEKLY_TOURNAMENT_LABEL = `${Math.floor(TOURNAMENT_WEEK_EVENTS / 100) * 100}+`;
