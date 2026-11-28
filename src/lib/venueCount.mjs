/**
 * The ONE source of truth for how many poker rooms Smarter.Poker lists.
 *
 * Every page, CTA, SEO summary, JSON-LD string and AI-facts endpoint that
 * states a room or venue count imports it from here. Do not type a room
 * count anywhere else: __tests__/the-room-count-is-real.law.test.mjs fails
 * the build if a hard-coded one appears in src/ or pages/.
 *
 * Verified read-only against Supabase project kuklfnapbkmacvwxktbh on
 * 2026-11-28 02:38 UTC (2026-11-27 Central):
 *
 *   SELECT count(*) FILTER (WHERE is_active AND NOT COALESCE(is_suppressed, false)) AS listed,
 *          count(*) FILTER (WHERE is_active) AS active,
 *          count(*) AS total
 *   FROM poker_venues;
 *
 *   listed = 564, active = 593, total = 603. Every active row is in the US
 *   (43 states).
 *
 * "listed" is the condition /api/poker/venues serves to players (is_active
 * and not is_suppressed), so it is the number a player can actually find.
 * The public claim is a round floor BELOW that count, never above it. The
 * site used to claim "715+", which the table has never held.
 *
 * When the directory grows, re-run the query and raise the floor. Never set
 * it above the verified count; the law test pins VERIFIED_LISTED_VENUES.
 */

/** Rows the venue directory served on the verification date. */
export const VERIFIED_LISTED_VENUES = 564;

/** Date (UTC) the count above was read. */
export const VENUE_COUNT_VERIFIED_AT = '2026-11-28';

/** The public floor: a round number at or below the verified count. */
export const VENUE_COUNT = 560;

/** The label every page shows, e.g. "560+". */
export const VENUE_COUNT_LABEL = `${VENUE_COUNT}+`;
