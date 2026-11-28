/**
 * How many poker rooms Smarter.Poker lists: the SNAPSHOT and the rules.
 *
 * The live figures come from the database. src/lib/server/venueStats.mjs reads
 * them at request or ISR time, and every page and API that can run server code
 * shows those. This module is what remains when that is not possible:
 *
 *   - the fallback when the database cannot be read (an outage, a build
 *     without credentials);
 *   - the label in client-only components and static files that cannot query
 *     (scripts/refresh-venue-claims.mjs rewrites public/ from live data at
 *     every production build; the committed copy is this snapshot).
 *
 * The snapshot must never claim more than the database holds. That is not a
 * promise kept by hand any more: scripts/check-venue-count-snapshot.mjs
 * compares every figure below with the live directory in CI (CHECK 25,
 * scripts/ci/check-live-contracts.mjs) and FAILS when the snapshot is above
 * live, so a shrinking directory cannot leave a stale over-claim behind (the
 * Vercel build reports the same comparison as a warning). When it only
 * WARNS (the directory grew past the next floor) raise the snapshot with
 * `node scripts/check-venue-count-snapshot.mjs --print` and paste its output.
 *
 * Every page, CTA, SEO summary, JSON-LD string and AI-facts endpoint that
 * states a room or venue count imports it from here or from venueStats. Do
 * not type a room count anywhere else: __tests__/the-room-count-is-real.law.test.mjs
 * fails the build if a hard-coded one appears in src/ or pages/.
 *
 * WHAT IS COUNTED: listed poker rooms, the rows the venue directory serves
 * (src/lib/poker-near-me/listedRooms.mjs). Read-only against Supabase project
 * kuklfnapbkmacvwxktbh on 2026-11-28 (UTC):
 *
 *   l = SELECT * FROM poker_venues
 *       WHERE is_active AND is_suppressed = false AND id <> 3109
 *         AND canonical_venue_id IS NULL
 *         AND venue_type NOT IN ('series','tour','home_game');
 *
 *   SELECT count(*) FROM l;  -- 473
 *
 * The snapshot below is 471, not 473, on purpose: ids 2834 (Charity Series
 * of Poker) and 2835 (Poker For Good) are tournament series stored as
 * venue_type 'charity' with state 'MULTI', and a pending migration
 * reclassifies them as 'series'. Leaving them out keeps the snapshot at or
 * below live both before and after that migration (CI fails on any figure
 * above live; one below live is only a warning).
 *
 * The first version of this module (2026-11-28, PRs #3210/#3224) counted
 * every active, unsuppressed row (564) and called it the directory. 77 of
 * those rows are tournament series, 13 are tours and 1 is the excluded
 * duplicate 3109, none of which the directory serves, so "560+ Poker Rooms"
 * still counted 90 events as rooms. Counted the way the directory serves
 * them, there are 473 (471 without the two series above), and the label is 470+.
 */

/** Listed rooms on the snapshot date (the directory's own total). */
export const VERIFIED_LISTED_VENUES = 471;

/** Date (UTC) the snapshot was read. */
export const VENUE_COUNT_VERIFIED_AT = '2026-11-28';

/**
 * The public floor rule: a claim rounds DOWN, so it can never exceed the data.
 * 473 -> 470, 135 -> 130, 9 -> 9 (below ten the exact number is the floor).
 */
export function venueFloor(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v >= 10 ? Math.floor(v / 10) * 10 : v;
}

/** "470+" for 473; "9" for 9 (an exact small count needs no plus). */
export function venueFloorLabel(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v >= 10 ? `${venueFloor(v)}+` : String(v);
}

/** The public floor: a round number at or below the snapshot count. */
export const VENUE_COUNT = venueFloor(VERIFIED_LISTED_VENUES);

/** The label every page shows when it cannot read live data, e.g. "470+". */
export const VENUE_COUNT_LABEL = `${VENUE_COUNT}+`;

/*
 * ── Facts about the listed set (same read, same l) ─────────────────────────
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
 *   SELECT state, count(*) FROM l WHERE state ~ '^[A-Z]{2}$' GROUP BY state ORDER BY state;
 *
 * The only listed rows without a two-letter state code were 2834 and 2835
 * (state 'MULTI'), left out of the snapshot as series (see the top). The
 * state-code test in venueStats still excludes any such pseudo-state.
 * Every listed row has country = 'US'.
 */
export const LISTED_VENUES_BY_STATE = Object.freeze({
  AR: 1, AZ: 7, CA: 62, CO: 4, CT: 1, DE: 3, FL: 33, GA: 1, IA: 2, ID: 1,
  IL: 13, IN: 7, KS: 1, KY: 1, LA: 9, MA: 2, MD: 4, ME: 1, MI: 31, MN: 7,
  MS: 6, MT: 12, NC: 5, ND: 2, NH: 11, NJ: 4, NM: 4, NV: 33, NY: 7, OH: 13,
  OK: 9, OR: 21, PA: 11, RI: 2, SD: 4, TX: 88, VA: 5, WA: 35, WI: 4, WV: 4,
});

/** Listed rows whose state is not a US state code. */
export const LISTED_VENUES_WITHOUT_STATE = 0;

/**
 * US states with at least one listed room.
 *
 *   SELECT count(DISTINCT state) FROM l WHERE state ~ '^[A-Z]{2}$';  -- 40
 *
 * The MULTI / Tour pseudo-states belonged to series and tour rows, which are
 * not listed rooms, so they never reach this count.
 */
export const VENUE_STATE_COUNT = Object.keys(LISTED_VENUES_BY_STATE).length;

/** Listed rooms in one state (0 when the given table lists none there). */
export function listedVenueCount(stateCode, byState = LISTED_VENUES_BY_STATE) {
  return (byState || LISTED_VENUES_BY_STATE)[String(stateCode || '').toUpperCase()] || 0;
}

/** "12 Listed Rooms" / "1 Listed Room" / "0 Listed Rooms" for a state. */
export function listedVenueLabel(stateCode, byState = LISTED_VENUES_BY_STATE) {
  const n = listedVenueCount(stateCode, byState);
  return `${n} Listed ${n === 1 ? 'Room' : 'Rooms'}`;
}

/*
 * Rooms by game. games_offered is filled on 401 of the 473 listed rows, so
 * each figure is a floor: at least this many listed rooms say they spread it.
 * NLH is 340 live less the two series rows above (both list NLH): 338.
 *
 *   SELECT count(*) FILTER (WHERE 'NLH' = ANY(games_offered))  AS nlh,   -- 340
 *          count(*) FILTER (WHERE 'PLO' = ANY(games_offered))  AS plo,   -- 135
 *          count(*) FILTER (WHERE games_offered && ARRAY['Limit HE','Limit','Mixed','7-Stud'])
 *                                                               AS limit_mixed, -- 31
 *          count(*) FILTER (WHERE 'Mixed' = ANY(games_offered)) AS mixed  -- 20
 *   FROM l;
 *
 * Big O, Stud and bomb pots are too thin or absent to state a count, and no
 * venue column records bad beat jackpots, so none of those carries a number.
 */
export const VENUES_SPREADING_NLH = 338;
export const VENUES_SPREADING_PLO = 135;
export const VENUES_SPREADING_LIMIT_OR_MIXED = 31;
export const VENUES_SPREADING_MIXED = 20;

/** The games_offered tags each per-game count matches (shared with venueStats). */
export const GAME_COUNT_TAGS = Object.freeze({
  nlh: Object.freeze(['NLH']),
  plo: Object.freeze(['PLO']),
  limitOrMixed: Object.freeze(['Limit HE', 'Limit', 'Mixed', '7-Stud']),
  mixed: Object.freeze(['Mixed']),
});

/** Public floors for the counts above, rounded down. */
export const NLH_VENUE_LABEL = venueFloorLabel(VENUES_SPREADING_NLH);
export const PLO_VENUE_LABEL = venueFloorLabel(VENUES_SPREADING_PLO);
export const LIMIT_MIXED_VENUE_LABEL = venueFloorLabel(VENUES_SPREADING_LIMIT_OR_MIXED);
export const MIXED_VENUE_LABEL = venueFloorLabel(VENUES_SPREADING_MIXED);

/** Rooms-by-game directory slug -> listed-room floor, where one exists. */
export const VENUE_FLOOR_BY_GAME_SLUG = Object.freeze({
  'no-limit-holdem': NLH_VENUE_LABEL,
  'pot-limit-omaha': PLO_VENUE_LABEL,
  'mixed-games-and-horse': MIXED_VENUE_LABEL,
});

/**
 * The snapshot in the same shape venueStats returns for live data, so a page
 * renders one object whichever source answered.
 */
export function buildVenueStats({
  listed,
  verified,
  byState,
  withoutState,
  games,
  source,
  readAt,
}) {
  const states = Object.freeze({ ...(byState || {}) });
  const g = games || {};
  return Object.freeze({
    source,
    readAt,
    listed,
    floor: venueFloor(listed),
    label: venueFloorLabel(listed),
    verified,
    byState: states,
    withoutState,
    stateCount: Object.keys(states).length,
    games: Object.freeze({
      nlh: g.nlh, plo: g.plo, limitOrMixed: g.limitOrMixed, mixed: g.mixed,
    }),
    gameLabels: Object.freeze({
      nlh: venueFloorLabel(g.nlh),
      plo: venueFloorLabel(g.plo),
      limitOrMixed: venueFloorLabel(g.limitOrMixed),
      mixed: venueFloorLabel(g.mixed),
    }),
  });
}

export const SNAPSHOT_VENUE_STATS = buildVenueStats({
  source: 'snapshot',
  readAt: VENUE_COUNT_VERIFIED_AT,
  listed: VERIFIED_LISTED_VENUES,
  verified: VERIFIED_VENUE_COUNT,
  byState: LISTED_VENUES_BY_STATE,
  withoutState: LISTED_VENUES_WITHOUT_STATE,
  games: {
    nlh: VENUES_SPREADING_NLH,
    plo: VENUES_SPREADING_PLO,
    limitOrMixed: VENUES_SPREADING_LIMIT_OR_MIXED,
    mixed: VENUES_SPREADING_MIXED,
  },
});

/**
 * Every way the snapshot can claim MORE than live data. An empty list means
 * every snapshot figure is at or below the database.
 */
export function snapshotOverClaims(live, snapshot = SNAPSHOT_VENUE_STATS) {
  const out = [];
  if (snapshot.floor > live.listed) out.push(`label ${snapshot.label} exceeds ${live.listed} live listed rooms`);
  if (snapshot.verified > live.verified) out.push(`verified ${snapshot.verified} exceeds ${live.verified} live`);
  if (snapshot.stateCount > live.stateCount) out.push(`state count ${snapshot.stateCount} exceeds ${live.stateCount} live`);
  for (const [code, n] of Object.entries(snapshot.byState)) {
    const l = live.byState[code] || 0;
    if (n > l) out.push(`${code} ${n} exceeds ${l} live`);
  }
  for (const k of Object.keys(snapshot.games)) {
    if (venueFloor(snapshot.games[k]) > (live.games[k] || 0)) {
      out.push(`${k} floor ${snapshot.gameLabels[k]} exceeds ${live.games[k] || 0} live`);
    }
  }
  return out;
}

/** Figures where live has moved past the snapshot (the snapshot is stale low). */
export function snapshotBehind(live, snapshot = SNAPSHOT_VENUE_STATS) {
  const out = [];
  if (live.floor > snapshot.floor) out.push(`live label ${live.label} is above snapshot ${snapshot.label}`);
  if (live.verified !== snapshot.verified) out.push(`verified live ${live.verified} vs snapshot ${snapshot.verified}`);
  if (live.stateCount !== snapshot.stateCount) out.push(`state count live ${live.stateCount} vs snapshot ${snapshot.stateCount}`);
  for (const [code, n] of Object.entries(live.byState)) {
    if ((snapshot.byState[code] || 0) !== n) out.push(`${code} live ${n} vs snapshot ${snapshot.byState[code] || 0}`);
  }
  return out;
}
