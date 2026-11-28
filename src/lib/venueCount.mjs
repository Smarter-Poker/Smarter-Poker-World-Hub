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
 *   (41 states plus 4 touring-series rows with no state; see VENUE_STATE_COUNT).
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

/*
 * ── Facts about the listed set (2026-11-28 UTC read, same project) ─────────
 *
 * Every figure below was read with read-only SELECTs against the listed set
 *   l = poker_venues WHERE is_active AND NOT COALESCE(is_suppressed, false)
 * on VENUE_COUNT_VERIFIED_AT. A page that states any of these imports it from
 * here; __tests__/the-venue-claims-are-real.law.test.mjs pins them.
 */

/**
 * Listed rooms that carry a last_verified_at date. This is the ONLY number
 * the word "Verified" may describe: "560+ Verified Poker Rooms" claimed every
 * room had been checked, and only these had.
 *
 *   SELECT count(*) FROM l WHERE last_verified_at IS NOT NULL;  -- 69
 */
export const VERIFIED_VENUE_COUNT = 69;

/**
 * Listed rooms per US state (two-letter code).
 *
 *   SELECT state, count(*) FROM l GROUP BY state ORDER BY state;
 *
 * Four listed rows carry a non-state marker (state = 'MULTI' x2, 'Tour' x2:
 * touring series rows), so they are not attributed to any state. Every
 * listed row has country = 'US'; there are no listed venues outside the US.
 */
export const LISTED_VENUES_BY_STATE = Object.freeze({
  AR: 1, AZ: 9, CA: 75, CO: 5, CT: 5, DE: 3, FL: 41, GA: 1, IA: 3, ID: 1,
  IL: 15, IN: 9, KS: 1, KY: 1, LA: 10, MA: 2, MD: 4, ME: 1, MI: 32, MN: 9,
  MO: 1, MS: 8, MT: 12, NC: 6, ND: 2, NH: 11, NJ: 5, NM: 4, NV: 58, NY: 7,
  OH: 15, OK: 14, OR: 22, PA: 12, RI: 2, SD: 5, TX: 97, VA: 5, WA: 37, WI: 5,
  WV: 4,
});

/** Listed rows whose state is not a US state code (touring series rows). */
export const LISTED_VENUES_WITHOUT_STATE = 4;

/**
 * US states with at least one listed room.
 *
 *   SELECT count(DISTINCT state) FROM l WHERE state ~ '^[A-Z]{2}$';  -- 41
 *
 * The site used to say "42 States" and "38 States"; neither was ever read.
 */
export const VENUE_STATE_COUNT = Object.keys(LISTED_VENUES_BY_STATE).length;

/** Listed rooms in one state (0 when the directory lists none there). */
export function listedVenueCount(stateCode) {
  return LISTED_VENUES_BY_STATE[String(stateCode || '').toUpperCase()] || 0;
}

/** "12 Listed Rooms" / "1 Listed Room" / "0 Listed Rooms" for a state. */
export function listedVenueLabel(stateCode) {
  const n = listedVenueCount(stateCode);
  return `${n} Listed ${n === 1 ? 'Room' : 'Rooms'}`;
}

/*
 * Rooms by game. games_offered is filled on 402 of the 564 listed rows, so
 * each figure is a floor: at least this many listed rooms say they spread it.
 *
 *   SELECT count(*) FILTER (WHERE 'NLH' = ANY(games_offered))  AS nlh,   -- 341
 *          count(*) FILTER (WHERE 'PLO' = ANY(games_offered))  AS plo,   -- 135
 *          count(*) FILTER (WHERE games_offered && ARRAY['Limit HE','Limit','Mixed','7-Stud'])
 *                                                               AS limit_mixed, -- 31
 *          count(*) FILTER (WHERE 'Mixed' = ANY(games_offered)) AS mixed  -- 20
 *   FROM l;
 *
 * Big O (1 row), Stud (1 row) and bomb pots (no column) are too thin or
 * absent to state a count, and no venue column records bad beat jackpots,
 * so the old "180+ Bad Beat Jackpot Venues" has no number at all now. The
 * old "210+ PLO" and "140+ Limit & Mixed" exceeded the data and are gone.
 */
export const VENUES_SPREADING_NLH = 341;
export const VENUES_SPREADING_PLO = 135;
export const VENUES_SPREADING_LIMIT_OR_MIXED = 31;
export const VENUES_SPREADING_MIXED = 20;

/** Public floors for the counts above, rounded down. */
export const NLH_VENUE_LABEL = `${Math.floor(VENUES_SPREADING_NLH / 10) * 10}+`;
export const PLO_VENUE_LABEL = `${Math.floor(VENUES_SPREADING_PLO / 10) * 10}+`;
export const LIMIT_MIXED_VENUE_LABEL = `${Math.floor(VENUES_SPREADING_LIMIT_OR_MIXED / 10) * 10}+`;
export const MIXED_VENUE_LABEL = `${Math.floor(VENUES_SPREADING_MIXED / 10) * 10}+`;

/** Rooms-by-game directory slug -> verified listed-room floor, where one exists. */
export const VENUE_FLOOR_BY_GAME_SLUG = Object.freeze({
  'no-limit-holdem': NLH_VENUE_LABEL,
  'pot-limit-omaha': PLO_VENUE_LABEL,
  'mixed-games-and-horse': MIXED_VENUE_LABEL,
});
