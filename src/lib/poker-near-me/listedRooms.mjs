/**
 * What counts as a LISTED POKER ROOM. One definition, three users:
 *
 *   - the venue directory (/api/poker/venues, /hub/poker-near-me, its
 *     checked-in snapshot fallback) via src/lib/poker-near-me/venueDirectoryServer.js;
 *   - the live room counts every page states (src/lib/server/venueStats.mjs);
 *   - the CI comparison of the hand-kept snapshot in src/lib/venueCount.mjs
 *     with the database (scripts/check-venue-count-snapshot.mjs).
 *
 * A row is a listed room when it is active, not suppressed, not a canonical
 * alias of another row (the alias would be the same room twice), not one of
 * the explicitly excluded ids, and not a tournament series, tour or home game
 * (those are events and private games, not rooms a player can walk into).
 *
 * Read 2026-11-28: of the 564 active, unsuppressed poker_venues rows, 77 are
 * venue_type 'series', 13 are 'tour' and 1 is the excluded id 3109, leaving
 * 473 rooms. The directory has always served the 473; the room count had been
 * read from the 564, so the old public room label counted 90 tournament series
 * as rooms. Both now read this module, so they cannot disagree again.
 *
 * Pure: no imports, safe for the client bundle and for node scripts.
 */

/** Ids the directory never serves (a duplicate record kept for history). */
export const EXCLUDED_VENUE_IDS = Object.freeze([3109]);

/** venue_type values that are events or private games, not poker rooms. */
export const NON_ROOM_VENUE_TYPES = Object.freeze(['series', 'tour', 'home_game']);

/**
 * Apply the listed-room condition to a Supabase/PostgREST query builder
 * (`supabase.from('poker_venues').select(...)`). Returns the builder.
 */
export function applyListedRoomFilter(query) {
  let q = query
    .eq('is_active', true)
    .eq('is_suppressed', false);
  for (const id of EXCLUDED_VENUE_IDS) q = q.neq('id', id);
  return q
    .is('canonical_venue_id', null)
    .not('venue_type', 'in', `(${NON_ROOM_VENUE_TYPES.join(',')})`);
}

/** The same condition for one row already in memory (snapshot fallback). */
export function isListedRoom(venue) {
  if (!venue || venue.is_active !== true) return false;
  if (venue.is_suppressed === true) return false;
  if (EXCLUDED_VENUE_IDS.includes(venue.id)) return false;
  if (venue.canonical_venue_id != null) return false;
  return !NON_ROOM_VENUE_TYPES.includes(String(venue.venue_type || '').toLowerCase());
}

/** The SQL text of the condition, for audit notes and module comments. */
export const LISTED_ROOM_SQL = "is_active AND is_suppressed = false AND id <> 3109 AND canonical_venue_id IS NULL AND venue_type NOT IN ('series','tour','home_game')";
